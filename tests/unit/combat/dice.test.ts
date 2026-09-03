import { describe, expect, it } from "vitest";
import {
  diceCount,
  evaluate,
  facesFromSeed,
  isRollError,
  parseFormula,
  verifyRoll,
  type Formula,
  type RollRecord,
} from "@/lib/combat/dice";

function formula(text: string): Formula {
  const parsed = parseFormula(text);
  if (isRollError(parsed)) throw new Error(parsed.code);
  return parsed;
}

describe("parseFormula — the Foundry grammar subset", () => {
  it("parses dice, keep-highest and flat terms with signs", () => {
    expect(formula("2d20kh1 + 5 - 1d4").terms).toEqual([
      { kind: "dice", sign: 1, count: 2, sides: 20, keep: { mode: "highest", count: 1 } },
      { kind: "flat", sign: 1, value: 5 },
      { kind: "dice", sign: -1, count: 1, sides: 4, keep: null },
    ]);
  });
  it("normalizes the text: lowercase, no whitespace, implicit count", () => {
    expect(formula(" D20 ").text).toBe("1d20");
    expect(formula("8d6").text).toBe("8d6");
    expect(formula("2d20KL1+3").text).toBe("2d20kl1+3");
  });
  it("accepts a leading sign and renders it back", () => {
    expect(formula("-1d4+2d6").text).toBe("-1d4+2d6");
    expect(formula("+1d20").text).toBe("1d20");
  });
  it("re-parses its own rendering to the same terms", () => {
    for (const text of ["2d20kh1 + 5 - 1d4", "-1d4", "1D8+1D6-2"]) {
      const once = formula(text);
      expect(formula(once.text)).toEqual(once);
    }
  });
  it.each([
    ["", "empty"],
    ["1d7", "die-sides"],
    ["0d6", "dice-count"],
    ["101d6", "too-many-dice"],
    ["3d6kh4", "keep-count"],
    ["1d20+1001", "flat-range"],
    ["5", "no-dice"],
    ["1d20+", "syntax"],
    ["d20d20", "syntax"],
    ["1d20 * 2", "syntax"],
  ])("rejects %j with %s", (text, code) => {
    const parsed = parseFormula(text);
    expect(isRollError(parsed) && parsed.code).toBe(code);
  });
  it("counts the dice of the whole formula", () => {
    expect(diceCount(formula("2d20kh1+1d8+3"))).toBe(3);
    expect(diceCount(formula("1d4-1d4"))).toBe(2);
  });
});

describe("facesFromSeed — reproducible faces", () => {
  it("is deterministic per seed and in range", () => {
    const f = formula("8d6+1d20");
    const a = facesFromSeed(42, f);
    expect(a).toEqual(facesFromSeed(42, f));
    expect(a).toHaveLength(9);
    for (const face of a.slice(0, 8)) {
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(6);
    }
    expect(a[8]).toBeGreaterThanOrEqual(1);
    expect(a[8]).toBeLessThanOrEqual(20);
    expect(facesFromSeed(43, f)).not.toEqual(a);
  });
  it("pins the generator so a stored seed keeps reproducing the same faces", () => {
    expect(facesFromSeed(123456789, formula("3d8+2d10"))).toMatchInlineSnapshot(`
      [
        3,
        8,
        7,
        3,
        4,
      ]
    `);
    expect(facesFromSeed(0, formula("1d20"))).toMatchInlineSnapshot(`
      [
        6,
      ]
    `);
  });
});

describe("evaluate — totals with kept and dropped dice", () => {
  it("keeps the highest die for advantage and adds flats", () => {
    const result = evaluate(formula("2d20kh1+5"), [7, 18]);
    if (isRollError(result)) throw new Error(result.code);
    expect(result.total).toBe(23);
    expect(result.terms[0]?.faces).toEqual([
      { value: 7, kept: false },
      { value: 18, kept: true },
    ]);
  });
  it("keeps the first of tied dice, deterministically", () => {
    const result = evaluate(formula("2d20kh1"), [18, 18]);
    if (isRollError(result)) throw new Error(result.code);
    expect(result.terms[0]?.faces).toEqual([
      { value: 18, kept: true },
      { value: 18, kept: false },
    ]);
  });
  it("keeps the lowest for disadvantage and subtracts negative dice", () => {
    const result = evaluate(formula("2d20kl1-1d4"), [7, 18, 3]);
    if (isRollError(result)) throw new Error(result.code);
    expect(result.total).toBe(4);
  });
  it("rejects a wrong count of faces and an out-of-range face", () => {
    expect(evaluate(formula("2d6"), [1])).toEqual({ code: "faces-count" });
    expect(evaluate(formula("2d6"), [1, 7])).toEqual({ code: "face-range", at: 1 });
    expect(evaluate(formula("1d6"), [0])).toEqual({ code: "face-range", at: 0 });
    expect(evaluate(formula("1d6"), [2.5])).toEqual({ code: "face-range", at: 0 });
  });
});

describe("verifyRoll — provenance", () => {
  const app = (over: Partial<RollRecord> = {}): RollRecord => {
    const f = formula("1d20+3");
    const faces = facesFromSeed(99, f);
    const total = (faces[0] ?? 0) + 3;
    return {
      formula: "1d20+3",
      faces,
      total,
      seed: 99,
      source: "app",
      hidden: false,
      roller: "hero",
      purpose: "attack",
      label: null,
      ...over,
    };
  };
  it("accepts an app roll whose faces reproduce from its seed", () => {
    expect(verifyRoll(app())).toBeNull();
  });
  it("rejects a tampered app roll", () => {
    const honest = app();
    const face = honest.faces[0] === 20 ? 19 : 20;
    expect(verifyRoll({ ...honest, faces: [face], total: face + 3 })).toEqual({
      code: "faces-mismatch",
    });
  });
  it("rejects a wrong total, a missing seed and a seed on a manual roll", () => {
    expect(verifyRoll({ ...app(), total: 0 })).toEqual({ code: "total-mismatch" });
    expect(verifyRoll({ ...app(), seed: null })).toEqual({ code: "seed-missing" });
    expect(verifyRoll({ ...app(), seed: 1.5 })).toEqual({ code: "seed-missing" });
    expect(verifyRoll({ ...app(), source: "manual" })).toEqual({
      code: "seed-on-manual",
    });
  });
  it("accepts a manual roll with entered faces and no seed", () => {
    expect(
      verifyRoll({ ...app(), source: "manual", seed: null, faces: [11], total: 14 })
    ).toBeNull();
  });
  it("reports formula errors first", () => {
    expect(verifyRoll({ ...app(), formula: "1d7" })).toEqual({
      code: "die-sides",
      at: 0,
    });
  });
});
