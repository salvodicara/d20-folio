/**
 * bug-report-reconcile — the pure decision behind the admin inbox's
 * GitHub-mirror invariant: which fetched reports render (keep) and which are
 * spent because their GitHub issue closed (purge). Pins the safety properties:
 * never purge without a confirmed GitHub answer, never purge a report that is
 * not on GitHub (no issue number — creation failed / pending).
 */

import { describe, it, expect } from "vitest";
import { reconcileBugReports } from "@/lib/bug-report-reconcile";

const report = (id: string, issueNumber: number | null) => ({ id, issueNumber });

describe("reconcileBugReports", () => {
  it("purges exactly the reports whose issue is in the closed set", () => {
    const reports = [report("a", 1), report("b", 2), report("c", 3)];
    const { keep, purge } = reconcileBugReports(reports, new Set([2]));
    expect(keep.map((r) => r.id)).toEqual(["a", "c"]);
    expect(purge.map((r) => r.id)).toEqual(["b"]);
  });

  it("keeps a report with NO issue number (stranded / pending) even when issues are known", () => {
    const reports = [report("stranded", null), report("closed", 7)];
    const { keep, purge } = reconcileBugReports(reports, new Set([7]));
    expect(keep.map((r) => r.id)).toEqual(["stranded"]);
    expect(purge.map((r) => r.id)).toEqual(["closed"]);
  });

  it("purges NOTHING when the closed set is unknown (null) — keeps everything", () => {
    const reports = [report("a", 1), report("b", null)];
    const { keep, purge } = reconcileBugReports(reports, null);
    expect(keep).toEqual(reports);
    expect(purge).toEqual([]);
  });

  it("keeps everything when no fetched issue is closed", () => {
    const reports = [report("a", 1), report("b", 2)];
    const { keep, purge } = reconcileBugReports(reports, new Set([99]));
    expect(keep).toHaveLength(2);
    expect(purge).toEqual([]);
  });

  it("handles the empty inbox", () => {
    expect(reconcileBugReports([], new Set([1]))).toEqual({ keep: [], purge: [] });
    expect(reconcileBugReports([], null)).toEqual({ keep: [], purge: [] });
  });
});
