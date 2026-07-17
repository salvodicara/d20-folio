/**
 * crash-report — the error-screen entry into the bug reporter.
 *
 * The moment of failure is the moment of intent: when the error fallback is on
 * screen, "Report this problem" must produce an ACTIONABLE issue with zero
 * typing. This builds a `ReportPrefill` from the caught error — the headline as
 * the title, and a raw diagnostic block (error + stack head) as the
 * description. Deliberately data-only (no localized prose): it reads identically
 * in EN and IT and pastes verbatim into the GitHub issue. Every field stays
 * editable.
 *
 * PRIVACY — the title/description publish VERBATIM to the PUBLIC issue, and the
 * "users own what they type" carve-out does not cover machine-authored text. So
 * the prefill carries NO route (the crash pathname embeds character/campaign
 * ids; admins still get it privately via the report's `debugContext`), and the
 * error text is passed through `redactIdentifiers` — a Firestore error can
 * quote `users/{uid}/…` doc paths, and `error-log.ts`'s token redaction only
 * catches 40+ char runs, so a 28-char Firebase uid would sail through it.
 *
 * Pure except `reportCrash` (opens the dialog) — the builder is unit-testable
 * without a DOM.
 */

import { openReport } from "./open-report";
import { MAX_DESCRIPTION, MAX_TITLE, type ReportPrefill } from "./types";

/** Keep only real stack frames (V8 `at fn (url)` / Gecko `fn@url:1:2`), max 4. */
function stackHead(stack: string | undefined): string[] {
  return (stack ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at ") || /@.+:\d+/.test(line))
    .slice(0, 4);
}

/**
 * Strip identifying path shapes from machine-authored error text before it can
 * enter the (publicly published) title/description: Firestore doc paths
 * (`users/{uid}/…`) and secret-carrying app routes — `/characters/{id}`,
 * `/campaigns/{id}` (the static `/characters/new` route is not an id) and
 * `/join/{code}` (the invite code is a capability token: it auto-joins a
 * campaign). Idempotent; best-effort hygiene mirroring
 * `collect-debug-context.ts`'s notion of which path segments carry ids.
 */
function redactIdentifiers(text: string): string {
  return text
    .replace(/\busers\/[^\s"'`)]+/g, "users/[redacted]")
    .replace(/\/(characters|campaigns|join)\/(?!new\b)[^\s/?#"'`)]+/g, "/$1/[redacted]");
}

/** Build the crash prefill: bug · high · redacted headline · error + stack block. */
export function buildCrashPrefill(error: Error): ReportPrefill {
  const name = error.name && error.name !== "Error" ? `${error.name}: ` : "";
  const headline =
    redactIdentifiers(`${name}${error.message}`.trim()) || error.name || "Error";
  return {
    type: "bug",
    severity: "high",
    title: headline.slice(0, MAX_TITLE),
    description: [headline, ...stackHead(error.stack).map(redactIdentifiers)]
      .join("\n")
      .slice(0, MAX_DESCRIPTION),
  };
}

/** The error-fallback button handler: open the reporter pre-filled for this crash. */
export function reportCrash(error: Error): void {
  void openReport(buildCrashPrefill(error));
}
