import { describe, expect, it } from "vitest";
import { facesFromSeed, parseFormula } from "@/lib/combat/dice";
import { cryptoSeed, roll } from "@/lib/dice";

describe("roll — the only door to randomness for dice", () => {
  it("an app roll draws one seed and derives its faces from it", () => {
    const pending = roll(
      "2d20kh1+5",
      { by: "p1", roller: "hero", reason: "attack", mode: "app" },
      () => 77
    );
    if ("code" in pending) throw new Error(pending.code);
    const formula = parseFormula("2d20kh1+5");
    if ("code" in formula) throw new Error(formula.code);
    const faces = facesFromSeed(77, formula);
    expect(pending).toEqual({
      kind: "roll",
      by: "p1",
      roll: {
        formula: "2d20kh1+5",
        faces,
        total: Math.max(...faces) + 5,
        seed: 77,
        source: "app",
        hidden: false,
        roller: "hero",
        purpose: "attack",
        label: null,
      },
    });
  });
  it("a manual roll stores the entered faces and no seed", () => {
    const pending = roll(
      "1d20+2",
      {
        by: "p1",
        reason: "save",
        mode: "manual",
        faces: [13],
        hidden: true,
        label: "spell:fireball",
      },
      () => {
        throw new Error("must not draw a seed");
      }
    );
    if ("code" in pending) throw new Error(pending.code);
    expect(pending.roll).toEqual({
      formula: "1d20+2",
      faces: [13],
      total: 15,
      seed: null,
      source: "manual",
      hidden: true,
      roller: null,
      purpose: "save",
      label: "spell:fireball",
    });
  });
  it("refuses bad input with the same codes the fold uses", () => {
    expect(roll("1d7", { by: "p1", reason: "free", mode: "app" }, () => 1)).toEqual({
      code: "die-sides",
      at: 0,
    });
    expect(
      roll("1d20", { by: "p1", reason: "free", mode: "manual", faces: [] }, () => 1)
    ).toEqual({
      code: "faces-count",
    });
    expect(
      roll("1d20", { by: "p1", reason: "free", mode: "manual", faces: [21] }, () => 1)
    ).toEqual({ code: "face-range", at: 0 });
  });
  it("the default seed source is a 32-bit unsigned integer", () => {
    const seed = cryptoSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
  });
});
