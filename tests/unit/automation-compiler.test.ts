import { describe, expect, it } from "vitest";

import {
  compileAutomationCoverage,
  serializeAutomationCoverageReceipt,
} from "@/lib/automation-compiler";

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
    const program = {
      version: 1 as const,
      id: "spell.example",
      phases: [
        {
          id: "impact",
          trigger: { kind: "resolve" as const },
          steps: [
            {
              id: "condition",
              kind: "condition" as const,
              scope: "target" as const,
              subject: "target" as const,
              operation: "apply" as const,
              condition: "prone" as const,
            },
          ],
        },
      ],
    };
    const input = {
      entityKey: "spell:example",
      mechanicalPaths: ["effectProgram", "concentration", "range"],
      clauses: [
        {
          disposition: "compiled" as const,
          key: "ordered-effect",
          handler: "effect-program" as const,
          consumedPaths: ["effectProgram"],
          branches: ["failed-save", "successful-save"],
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
      clauses: [
        {
          disposition: "compiled" as const,
          key: "cast-contract",
          handler: "cast-profile" as const,
          consumedPaths: ["concentration", "range"],
          branches: ["cast"],
        },
        {
          disposition: "compiled" as const,
          key: "ordered-effect",
          handler: "effect-program" as const,
          consumedPaths: ["effectProgram"],
          branches: ["failed-save", "successful-save"],
          program: {
            phases: program.phases,
            id: program.id,
            version: program.version,
          },
        },
      ],
    });
    expect(first.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    if (!first.ok || !reordered.ok) return;
    expect(first.receipt.clauses[1]?.programFingerprint).toMatch(/^ace1:/);
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
      mechanicalPaths: ["effectProgram"],
      clauses: [
        {
          disposition: "compiled",
          key: "program",
          handler: "effect-program",
          consumedPaths: ["effectProgram"],
          branches: ["impact"],
          program: cyclic,
        },
        {
          disposition: "compiled",
          key: "legacy",
          handler: "action",
          consumedPaths: ["effectProgram"],
          branches: ["impact"],
          program: { invalid: true },
        },
      ],
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          "effect-program clause program has no valid plain program",
          "non-program clause legacy carries a program",
          "path effectProgram claimed by both program and legacy",
        ])
      );
    }
  });

  it("accepts repeated references but rejects cycles and sparse arrays", () => {
    const sharedLifetime = { kind: "manual" as const };
    const repeatedReference = compileAutomationCoverage({
      entityKey: "spell:shared-reference",
      mechanicalPaths: ["effectProgram"],
      clauses: [
        {
          disposition: "compiled",
          key: "program",
          handler: "effect-program",
          consumedPaths: ["effectProgram"],
          branches: ["impact"],
          program: {
            version: 1,
            id: "spell.shared-reference",
            phases: [
              {
                id: "impact",
                trigger: { kind: "resolve" },
                steps: [
                  {
                    id: "first",
                    kind: "standing",
                    scope: "program",
                    subject: "source",
                    operation: "start",
                    effectId: "first",
                    lifetime: sharedLifetime,
                  },
                  {
                    id: "second",
                    kind: "standing",
                    scope: "program",
                    subject: "source",
                    operation: "start",
                    effectId: "second",
                    lifetime: sharedLifetime,
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(repeatedReference.ok).toBe(true);

    const sparse: unknown[] = [];
    sparse.length = 1;
    const sparseArray = compileAutomationCoverage({
      entityKey: "spell:sparse-program",
      mechanicalPaths: ["effectProgram"],
      clauses: [
        {
          disposition: "compiled",
          key: "program",
          handler: "effect-program",
          consumedPaths: ["effectProgram"],
          branches: ["impact"],
          program: sparse,
        },
      ],
    });
    expect(sparseArray).toMatchObject({ ok: false });
  });

  it("never executes accessors and rejects symbol-decorated arrays", () => {
    let getterCalls = 0;
    const accessorProgram = Object.defineProperty({}, "version", {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 1;
      },
    });
    const accessor = compileAutomationCoverage({
      entityKey: "spell:accessor",
      mechanicalPaths: ["effectProgram"],
      clauses: [
        {
          disposition: "compiled",
          key: "program",
          handler: "effect-program",
          consumedPaths: ["effectProgram"],
          branches: ["impact"],
          program: accessorProgram,
        },
      ],
    });
    expect(accessor).toMatchObject({ ok: false });
    expect(getterCalls).toBe(0);

    const symbolProgram: unknown[] = [];
    Object.defineProperty(symbolProgram, Symbol("hidden"), { value: true });
    const symbolDecorated = compileAutomationCoverage({
      entityKey: "spell:symbol-array",
      mechanicalPaths: ["effectProgram"],
      clauses: [
        {
          disposition: "compiled",
          key: "program",
          handler: "effect-program",
          consumedPaths: ["effectProgram"],
          branches: ["impact"],
          program: symbolProgram,
        },
      ],
    });
    expect(symbolDecorated).toMatchObject({ ok: false });
  });
});
