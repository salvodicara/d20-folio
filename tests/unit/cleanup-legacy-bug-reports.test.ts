/**
 * cleanup-legacy-bug-reports — the one-off live-data purge's PURE helpers. Locks
 * the legacy classification (pre-retarget-boundary or timestamp-less ⇒ legacy;
 * post-boundary keepers untouched) and the orphaned-file sweep.
 *
 * RULE 10: this test is deleted together with
 * `scripts/cleanup-legacy-bug-reports.ts` once the cleanup has run on live data +
 * been verified.
 */
import { describe, it, expect } from "vitest";
import {
  classifyReports,
  orphanedFiles,
  RETARGET_BOUNDARY,
  type ReportRow,
} from "../../scripts/cleanup-legacy-bug-reports";

const row = (
  id: string,
  createdAt: Date | null,
  issueNumber: number | null
): ReportRow => ({
  id,
  createdAt,
  issueNumber,
  screenshotPath: null,
});

describe("cleanup-legacy-bug-reports — classifyReports", () => {
  it("splits at the retarget boundary; missing createdAt counts as legacy", () => {
    const before = row("old", new Date("2026-07-10T09:00:00Z"), 30);
    const noStamp = row("stampless", null, null);
    const keeper = row("keeper", new Date("2026-07-17T19:05:00Z"), 2);
    const { legacy, keep } = classifyReports([before, noStamp, keeper]);
    expect(legacy.map((r) => r.id)).toEqual(["old", "stampless"]);
    expect(keep.map((r) => r.id)).toEqual(["keeper"]);
  });

  it("a re-run on a clean collection is a no-op (idempotent)", () => {
    const keeper = row("keeper", new Date(RETARGET_BOUNDARY.getTime() + 1), 2);
    expect(classifyReports([keeper]).legacy).toEqual([]);
    expect(classifyReports([]).legacy).toEqual([]);
  });
});

describe("cleanup-legacy-bug-reports — orphanedFiles", () => {
  it("flags only the files no doc references", () => {
    const files = ["bug-reports/u1/a.png", "bug-reports/u2/b.png"];
    expect(orphanedFiles(files, new Set(["bug-reports/u1/a.png"]))).toEqual([
      "bug-reports/u2/b.png",
    ]);
    expect(orphanedFiles(files, new Set(files))).toEqual([]);
  });
});
