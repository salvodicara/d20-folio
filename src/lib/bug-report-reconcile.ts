/**
 * Bug-inbox reconciliation — the PURE decision behind the admin inbox's
 * GitHub-mirror invariant (OWN-37).
 *
 * GitHub is the durable archive of every filed report; the Firestore
 * `/bug_reports` collection only exists to (a) trigger the issue-creating Cloud
 * Function and (b) carry the PRIVATE remainder (reporter identity, debug context,
 * screenshot) while the issue is OPEN. Once the issue is CLOSED the report is
 * spent, so it is PURGED (screenshot + doc) on the next admin-inbox load — the
 * inbox then always mirrors the open public issues.
 *
 * Kept — never purged:
 *   • reports with NO issue number (creation failed / still pending) — they are
 *     not on GitHub, so the inbox is the ONLY place the admin can see them;
 *   • everything, when the closed-issue set is unknown (offline / rate-limit) —
 *     never delete on a guess; the next load retries.
 *
 * Pure and Firebase-free (structural input type) so the decision is unit-testable
 * without any mock; the IO cascade lives in `firestore.ts` (`purgeBugReports`).
 */

export interface BugReportReconciliation<T> {
  /** Reports the inbox renders — open issues + everything not on GitHub. */
  keep: T[];
  /** Reports whose GitHub issue is CLOSED — spent; cascade-delete them. */
  purge: T[];
}

/**
 * Split the fetched reports into the rendered set and the spent set. With an
 * unknown closed-issue set (`null`) everything is kept — deletion only ever
 * happens against a confirmed GitHub answer.
 */
export function reconcileBugReports<T extends { issueNumber: number | null }>(
  reports: readonly T[],
  closedIssues: ReadonlySet<number> | null
): BugReportReconciliation<T> {
  if (!closedIssues) return { keep: [...reports], purge: [] };
  const keep: T[] = [];
  const purge: T[] = [];
  for (const report of reports) {
    const closed = report.issueNumber !== null && closedIssues.has(report.issueNumber);
    (closed ? purge : keep).push(report);
  }
  return { keep, purge };
}
