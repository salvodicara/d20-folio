/**
 * GitHub issue-state lookup for the admin BUG INBOX.
 *
 * The Cloud Function stamps each opened report with its GitHub `issueNumber`, but
 * nothing mirrors an issue's later CLOSURE back into Firestore. So the admin console
 * asks GitHub directly which issues are closed and hides those reports (owner ruling:
 * a closed report does not render at all).
 *
 * This is an ADMIN-ONLY surface, so an UNAUTHENTICATED read of the public issues API
 * is enough — no token in the client bundle (a PWA can't hold one safely; that is the
 * whole reason the report→issue flow lives in a Cloud Function). One request for the
 * repo's closed issues (`state=closed`, first 100 — a hobby tracker never has more),
 * cached in-memory for the session, DEGRADING GRACEFULLY: any failure (offline,
 * rate-limit, or a private repo that returns 404 to an anonymous caller) resolves to
 * `null`, and the caller then shows every report with a quiet "status unavailable"
 * note rather than hiding anything it can't verify.
 *
 * NB: the repo must be PUBLIC for the anonymous read to succeed — while it is private
 * this resolves to `null` and the inbox shows all reports (the graceful-degrade path).
 * No Firebase import — safe for any surface.
 */

/**
 * The app's issue tracker (the same repo the report Cloud Function files into —
 * its `GITHUB_REPO` secret must point at the same place). The client's ONE repo
 * reference: overridable per-build via `VITE_GITHUB_REPO` ("owner/repo"), with
 * the production tracker as the default.
 */
export const GITHUB_REPO: string =
  import.meta.env.VITE_GITHUB_REPO || "salvodicara/d20-folio";

let cache: Promise<ReadonlySet<number> | null> | null = null;

async function fetchClosedIssueNumbers(): Promise<ReadonlySet<number> | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues?state=closed&per_page=100`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!res.ok) return null;
    const items = (await res.json()) as Array<{ number: number }>;
    // A malformed body throws in `.map` → caught below → null (caller shows all).
    return new Set(items.map((it) => it.number));
  } catch {
    return null; // offline / network / private-repo 404 → unknown, caller shows all
  }
}

/**
 * The set of CLOSED GitHub issue numbers for the app repo, fetched once and cached
 * for the session. Resolves to `null` when the state can't be determined (offline,
 * error, or a private repo) — the caller must then show all reports with a note.
 */
export function getClosedIssueNumbers(): Promise<ReadonlySet<number> | null> {
  return (cache ??= fetchClosedIssueNumbers());
}

/** Test-only: drop the session cache so each case fetches fresh. */
export function __resetClosedIssueCache(): void {
  cache = null;
}
