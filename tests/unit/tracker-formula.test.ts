/**
 * Tracker formulas compile to the shared Scalar language with the results the
 * retired string evaluator gave. The golden values were recorded from it before
 * it was removed (an equivalence run over 996 formulas × 90 characters matched).
 */
import { describe, expect, it } from "vitest";
import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { spells } from "@/data/spells";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import { compileTrackerFormula } from "@/lib/tracker-formula";

type Mods = Record<"STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA", number>;
const LEVEL_3 = {
  level: 3,
  pb: 2,
  mods: { STR: 0, DEX: 2, CON: 1, INT: 3, WIS: -1, CHA: 2 },
};
const LEVEL_11 = {
  level: 11,
  pb: 4,
  mods: { STR: 1, DEX: 3, CON: 2, INT: -1, WIS: 4, CHA: -2 },
};

function valueOf(formula: string, ctx: { level: number; pb: number; mods: Mods }) {
  const bindings: Record<string, number> = { "level.feature": ctx.level, pb: ctx.pb };
  for (const [ability, mod] of Object.entries(ctx.mods))
    bindings[`ability.mod.${ability}`] = mod;
  return evaluateIntegerExpression(compileTrackerFormula(formula).expression, bindings);
}

// formula → value at LEVEL_3, value at LEVEL_11.
const GOLDEN: ReadonlyArray<[string, number, number]> = [
  ["5", 5, 5],
  ["-3", -3, -3],
  ["PB", 2, 4],
  ["level", 3, 11],
  ["WIS", 1, 4], // a bare modifier counts as at least 1
  ["CHA", 2, 1],
  ["PB*2", 4, 8],
  ["INT*2", 6, 1], // an ability product counts as at least 1
  ["level*5", 15, 55],
  ["1+level", 4, 12],
  ["level*2+INT", 9, 21], // the added modifier is raw (−1 subtracts)
  ["CHA-WIS", 3, 1],
  ["level-1", 2, 10],
  ["PB-1", 1, 3],
  ["ceil(level/2)", 2, 6],
  ["floor(level/2)", 1, 5],
  ["level/2", 1, 5],
  ["max(WIS,CHA)", 2, 4],
  // The grammar has no "+ max(…)": the whole formula is unknown and counts as 1.
  ["level+max(WIS,CHA)", 1, 1],
  ["nonsense", 1, 1],
];

describe("tracker formulas in the Scalar language", () => {
  it.each(GOLDEN)("%s → %i at level 3, %i at level 11", (formula, at3, at11) => {
    expect(valueOf(formula, LEVEL_3)).toBe(at3);
    expect(valueOf(formula, LEVEL_11)).toBe(at11);
  });

  it("reports the parts that match no grammar shape", () => {
    expect(compileTrackerFormula("level*2+INT").unknown).toEqual([]);
    expect(compileTrackerFormula("level+max(WIS,CHA)").unknown).toEqual([
      "level+max(WIS,CHA)",
    ]);
  });

  it("every catalogue formula compiles with no unknown part", () => {
    const formulas = new Set<string>();
    const seen = new WeakSet<object>();
    const walk = (value: unknown): void => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) return value.forEach(walk);
      const record = value as Record<string, unknown>;
      if ("recovery" in record && typeof record.total === "string")
        formulas.add(record.total);
      if (typeof record.chargesFormula === "string") formulas.add(record.chargesFormula);
      if (
        typeof record.shortRestRecovery === "string" &&
        record.shortRestRecovery !== "all"
      )
        formulas.add(record.shortRestRecovery);
      Object.values(record).forEach(walk);
    };
    walk([classFeatures, SRD_FEATS, SRD_MAGIC_ITEMS, SRD_RACES, SRD_BACKGROUNDS, spells]);
    // The public SRD build alone has a handful; the pack adds the rest.
    expect(formulas.size).toBeGreaterThan(3);
    const unknown = [...formulas].filter(
      (f) => compileTrackerFormula(f).unknown.length > 0
    );
    expect(unknown).toEqual([]);
  });
});
