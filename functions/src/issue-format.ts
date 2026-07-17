/**
 * issue-format — PURE formatting for the GitHub issue a bug report becomes
 * (OWN-37).
 *
 * Kept free of `firebase-admin` / `@octokit/rest` so it's unit-testable on its
 * own (see `issue-format.test.ts`). The trigger in `index.ts` reads the Firestore
 * doc, calls these helpers, and hands the result to Octokit.
 *
 * PRIVACY CONTRACT — the issue lands on a PUBLIC tracker, so the body carries
 * ONLY non-identifying content: the user-written title/description, the coarse
 * report metadata (type/severity/screen/locale), an ALLOWLISTED slice of the
 * debug context (app version / build / browser / viewport — never routes, ids,
 * or error logs), and the Firestore doc id as a non-identifying report ref.
 * Everything that could map a report to a person — reporter uid, character /
 * campaign ids, the screenshot (its URL embeds the uid and its pixels can show a
 * character sheet), the error ring — stays ONLY in the Firestore doc, which the
 * admin inbox reads.
 */

export type ReportType = "bug" | "feature" | "visual" | "data" | "performance" | "other";
export type ReportSeverity = "low" | "medium" | "high";

/** The subset of the `/bug_reports/{id}` doc the formatter needs. */
export interface ReportLike {
  type?: string;
  screen?: string;
  severity?: string;
  title?: string;
  description?: string;
  locale?: string;
  debugContext?: Record<string, unknown>;
}

/** Clamp a value to the known report types (defends against a malformed doc). */
export function normalizeType(value: unknown): ReportType {
  const v = String(value);
  return (["bug", "feature", "visual", "data", "performance", "other"] as const).includes(
    v as ReportType
  )
    ? (v as ReportType)
    : "other";
}

/** Clamp a value to the known severities. */
export function normalizeSeverity(value: unknown): ReportSeverity {
  const v = String(value);
  return (["low", "medium", "high"] as const).includes(v as ReportSeverity)
    ? (v as ReportSeverity)
    : "medium";
}

/** The issue title: `[TYPE] the user's summary`. */
export function formatIssueTitle(report: ReportLike): string {
  const type = normalizeType(report.type).toUpperCase();
  const title = (report.title ?? "").trim() || "(no title)";
  // Keep titles to a sane length — GitHub allows 256; we cap well under.
  const capped = title.length > 200 ? `${title.slice(0, 199)}…` : title;
  return `[${type}] ${capped}`;
}

/**
 * Labels derived from the report: a kind label, a severity label, and the screen
 * the report targets. Stable, lower-kebab strings so they're easy to filter.
 */
export function formatLabels(report: ReportLike): string[] {
  const labels = [
    `type:${normalizeType(report.type)}`,
    `severity:${normalizeSeverity(report.severity)}`,
  ];
  const screen = (report.screen ?? "").trim();
  // Cap to GitHub's 50-char label limit so a hand-crafted doc can't 400 the
  // whole issues.create call and strand the report as "error".
  if (screen) labels.push(`screen:${screen}`.slice(0, 50));
  return labels;
}

/**
 * The debug-context keys allowed into the PUBLIC issue — app/build/environment
 * facts only. An ALLOWLIST by design: any field the client adds in the future
 * defaults to PRIVATE until it's deliberately listed here. Deliberately absent:
 * `url` / `pathname` / `characterId` / `campaignId` (routes carry character +
 * campaign ids) and `recentErrors` (messages can quote Firestore paths and
 * user data).
 */
const PUBLIC_DEBUG_KEYS = [
  "appVersion",
  "gitSha",
  "mode",
  "userAgent",
  "viewport",
  "dpr",
  "theme",
  "locale",
  "online",
  "serviceWorker",
  "capturedAt",
] as const;

/** The non-identifying slice of the debug context (undefined when empty). */
export function publicDebugContext(
  debug: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!debug) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of PUBLIC_DEBUG_KEYS) {
    if (key in debug) out[key] = debug[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A fenced JSON block for the public debug slice (omitted when there's none). */
function debugBlock(debug: Record<string, unknown> | undefined): string {
  const publicDebug = publicDebugContext(debug);
  if (!publicDebug) return "";
  // Pretty-print but guard against a cyclic/over-large object.
  let json: string;
  try {
    json = JSON.stringify(publicDebug, null, 2);
  } catch {
    json = "{ /* unserializable debug context */ }";
  }
  return `\n\n### Debug context\n\n\`\`\`json\n${json}\n\`\`\``;
}

/**
 * The full issue body: the user-written description, the coarse metadata, the
 * non-identifying report ref, and the allowlisted debug block — nothing that
 * maps the report to a person (see the privacy contract above).
 *
 * @param report   the report doc
 * @param reportId the Firestore doc id — the non-identifying report reference
 */
export function formatIssueBody(report: ReportLike, reportId: string): string {
  const lines: string[] = [];
  const description = (report.description ?? "").trim();
  lines.push(description || "_No description provided._");

  lines.push("");
  lines.push("---");
  lines.push(`**Type:** ${normalizeType(report.type)}`);
  lines.push(`**Severity:** ${normalizeSeverity(report.severity)}`);
  if (report.screen) lines.push(`**Screen:** ${report.screen}`);
  if (report.locale) lines.push(`**Locale:** ${report.locale}`);
  lines.push(`**Report ref:** \`${reportId}\``);
  lines.push("");
  lines.push("_Reporter details are retained privately._");

  return `${lines.join("\n")}${debugBlock(report.debugContext)}`;
}

/**
 * The issue tracker the reports file into when the `GITHUB_REPO` secret is
 * unset or malformed. The ONE fallback repo string in this package — `index.ts`
 * imports it rather than carrying a copy.
 */
const DEFAULT_OWNER = "salvodicara";
const DEFAULT_NAME = "d20-folio";
export const DEFAULT_REPO = `${DEFAULT_OWNER}/${DEFAULT_NAME}`;

/** Owner/repo parsed from a `owner/repo` string (`DEFAULT_REPO` if malformed). */
export function parseRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return { owner: DEFAULT_OWNER, repo: DEFAULT_NAME };
  return { owner, repo: name };
}
