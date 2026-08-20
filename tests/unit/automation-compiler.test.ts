import { describe, expect, it } from "vitest";

import {
  compileAutomationCoverage,
  serializeAutomationCoverageReceipt,
} from "@/lib/automation-compiler";
import { classFeatureIndex } from "@/data/classes";

describe("truthful automation coverage compiler", () => {
  it.each(["equipment", "stat-block", "rule-reference"] as const)(
    "registers the %s corpus handler",
    (handler) => {
      expect(
        compileAutomationCoverage({
          entityKey: `${handler}:example`,
          mechanicalPaths: ["fact"],
          clauses: [
            {
              disposition: "compiled",
              key: "fact",
              handler,
              consumedPaths: ["fact"],
              branches: ["fact"],
            },
          ],
        })
      ).toMatchObject({ ok: true });
    }
  );

  it("emits exact per-clause receipts with stable program fingerprints", () => {
    const feature = classFeatureIndex.get("rogue-uncanny-dodge");
    const program = feature?.mechanics?.actions?.find(
      (action) => action.mechanicsProgram !== undefined
    )?.mechanicsProgram;
    if (!program) throw new Error("missing authored Uncanny Dodge program");
    const input = {
      entityKey: "feature:example",
      mechanicalPaths: ["mechanicsProgram", "concentration", "range"],
      clauses: [
        {
          disposition: "compiled" as const,
          key: "ordered-effect",
          handler: "mechanics-program" as const,
          consumedPaths: ["mechanicsProgram"],
          branches: ["negated", "kept"],
          program,
        },
        {
          disposition: "compiled" as const,
          key: "cast-contract",
          handler: "cast-profile" as const,
          consumedPaths: ["concentration", "range"],
          branches: ["cast"],
        },
      ],
    };
    const first = compileAutomationCoverage(input);
    const reordered = compileAutomationCoverage({
      ...input,
      clauses: [...input.clauses].reverse(),
    });
    expect(first.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    if (!first.ok || !reordered.ok) return;
    const fingerprint = first.receipt.clauses.find(
      ({ clauseKey }) => clauseKey === "ordered-effect"
    )?.programFingerprint;
    expect(typeof fingerprint).toBe("string");
    expect(fingerprint?.length).toBeGreaterThan(0);
    expect(serializeAutomationCoverageReceipt(first.receipt)).toBe(
      serializeAutomationCoverageReceipt(reordered.receipt)
    );
    expect(Object.isFrozen(first.receipt)).toBe(true);
    expect(Object.isFrozen(first.receipt.clauses)).toBe(true);
  });

  it("accepts only an explicitly source-audited nonmechanical entity", () => {
    expect(
      compileAutomationCoverage({
        entityKey: "item:decorative-token",
        mechanicalPaths: [],
        clauses: [],
        nonMechanical: true,
      })
    ).toMatchObject({ ok: true, receipt: { classification: "nonmechanical" } });
    expect(
      compileAutomationCoverage({
        entityKey: "item:unknown",
        mechanicalPaths: [],
        clauses: [],
      })
    ).toMatchObject({ ok: false });
  });

  it("rejects unknown, duplicate, overlapping, and unconsumed paths", () => {
    const result = compileAutomationCoverage({
      entityKey: "feature:broken",
      mechanicalPaths: ["grants[0]", "grants[0]", "mechanics.actions[0]"],
      clauses: [
        {
          disposition: "compiled",
          key: "same",
          handler: "grant",
          consumedPaths: ["grants[0]"],
          branches: ["active"],
        },
        {
          disposition: "compiled",
          key: "same",
          handler: "action",
          consumedPaths: ["grants[0]", "not-real"],
          branches: ["active", "active"],
        },
      ],
    });
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "duplicate mechanical path: grants[0]",
        "duplicate clause key: same",
        "path grants[0] claimed by both same and same",
        "clause same consumes unknown path: not-real",
        "clause same repeats branch: active",
        "unconsumed mechanical path: mechanics.actions[0]",
      ])
    );
  });

  it("rejects manual boundaries without both presenter locales", () => {
    const result = compileAutomationCoverage({
      entityKey: "spell:spatial-example",
      mechanicalPaths: ["spatial-placement"],
      clauses: [
        {
          disposition: "manual",
          key: "placement",
          boundary: "spatial",
          consumedPaths: ["spatial-placement"],
          presenter: { key: "combat.manualPlacement", resolvedLocales: ["en"] },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.errors).toContain(
        "manual clause placement has no bilingual presenter"
      );
    }
  });

  it("forbids program overlap, malformed programs, and program payloads on other handlers", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const result = compileAutomationCoverage({
      entityKey: "spell:overlap",
      mechanicalPaths: ["mechanicsProgram"],
      clauses: [
        {
          disposition: "compiled",
          key: "program",
          handler: "mechanics-program",
          consumedPaths: ["mechanicsProgram"],
          branches: ["impact"],
          program: cyclic,
        },
        {
          disposition: "compiled",
          key: "legacy",
          handler: "action",
          consumedPaths: ["mechanicsProgram"],
          branches: ["impact"],
          program: { invalid: true },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "mechanics-program clause program does not conform to the canonical format",
          "non-program clause legacy carries a program",
          "path mechanicsProgram claimed by both program and legacy",
        ])
      );
    }
  });

  it("rejects a sparse-array program payload", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    const sparseArray = compileAutomationCoverage({
      entityKey: "spell:sparse-program",
      mechanicalPaths: ["mechanicsProgram"],
      clauses: [
        {
          disposition: "compiled",
          key: "program",
          handler: "mechanics-program",
          consumedPaths: ["mechanicsProgram"],
          branches: ["impact"],
          program: sparse,
        },
      ],
    });
    expect(sparseArray).toMatchObject({ ok: false });
  });
});
