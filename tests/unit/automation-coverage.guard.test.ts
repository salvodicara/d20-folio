/**
 * Exact corpus guard. The subjects are derived from every composed data root and
 * its EN/IT catalogue; no pack ids are subtracted and there is no ratio floor.
 *
 * Blind spot: this proves the repository corpus is exhaustively receipted. It
 * cannot prove that an external rulebook fact absent from BOTH data and prose was
 * ingested; source audits remain responsible for that upstream boundary.
 */
import { describe, expect, it } from "vitest";

import { formatAutomationCorpusAudit } from "@/lib/automation-corpus";
import { auditCurrentAutomationCorpus } from "./__helpers__/automation-coverage";

describe("exact automation coverage corpus", () => {
  it("compiles every recursive mechanic path exactly once or marks it bilingual manual", async () => {
    const audit = await auditCurrentAutomationCorpus();
    expect(audit.ok, formatAutomationCorpusAudit(audit)).toBe(true);
    expect(audit.errors).toEqual([]);
    expect(audit.receipts).toHaveLength(audit.summary.entities);
  });

  it("publishes an exact manual census instead of a percentage certificate", async () => {
    const { summary } = await auditCurrentAutomationCorpus();
    expect(summary.manualPaths).toBe(
      Object.values(summary.manualPathsBySchema).reduce(
        (total, count) => total + count,
        0
      )
    );
    expect(summary.compiledPaths).toBe(
      Object.values(summary.compiledPathsBySchema).reduce(
        (total, count) => total + count,
        0
      )
    );
    expect(summary.manualPaths).toBe(
      Object.values(summary.manualPathsByBoundary).reduce(
        (total, count) => total + count,
        0
      )
    );
    expect(summary.manualPaths).toBeGreaterThan(0);
    expect(summary.entitiesBySchema.spell).toBeGreaterThan(0);
    expect(summary.entitiesBySchema["class-feature"]).toBeGreaterThan(0);
    expect(summary.entitiesBySchema["race-trait"]).toBeGreaterThan(0);
    expect(summary.entitiesBySchema.equipment).toBeGreaterThan(0);
    expect(summary.entitiesBySchema.monster).toBeGreaterThan(0);
    expect(summary.entitiesBySchema["monster-entry"]).toBeGreaterThan(0);
  });
});
