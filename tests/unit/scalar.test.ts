import { describe, expect, it } from "vitest";

import { conformDiceScalar, levelDice, resolveDice, resolveScalar } from "@/lib/scalar";

// The legacy `diceByLevel` table Sneak Attack carried before it moved to a Scalar
// (rogue.ts, 2026-11-02); the 2024 rule is ceil(Rogue level / 2) d6.
const SNEAK_ATTACK_LEGACY = {
  dice: "1d6",
  diceByLevel: {
    3: "2d6",
    5: "3d6",
    7: "4d6",
    9: "5d6",
    11: "6d6",
    13: "7d6",
    15: "8d6",
    17: "9d6",
    19: "10d6",
  },
};

describe("scalar: one language for scaled catalogue numbers", () => {
  it("a level table turns the legacy Sneak Attack table into ceil(level / 2) d6, levels 1-20", () => {
    const dice = levelDice(
      "rogue",
      SNEAK_ATTACK_LEGACY.dice,
      SNEAK_ATTACK_LEGACY.diceByLevel
    );
    for (let level = 1; level <= 20; level += 1) {
      expect(resolveDice(dice, { "level.class.rogue": level })?.formula).toBe(
        `${Math.ceil(level / 2)}d6`
      );
    }
  });

  it("a plain number or dice string resolves to itself, with no terms", () => {
    expect(resolveScalar(3, {})).toEqual({ value: 3, terms: [] });
    expect(resolveDice("2d6", {})).toEqual({ formula: "2d6", terms: [] });
  });

  it("reports the bindings it read, for the breakdown", () => {
    const castLevelScaling = {
      kind: "add",
      terms: [
        { kind: "fixed", value: 2 },
        {
          kind: "multiply",
          factors: [
            { kind: "fixed", value: 5 },
            {
              kind: "add",
              terms: [
                { kind: "binding", bindingId: "cast.level" },
                { kind: "fixed", value: -2 },
              ],
            },
          ],
        },
      ],
    } as const;
    expect(resolveScalar(castLevelScaling, { "cast.level": 4 })).toEqual({
      value: 12,
      terms: [{ bindingId: "cast.level", value: 4 }],
    });
  });

  it("a missing binding gives no value instead of a wrong one", () => {
    expect(resolveScalar({ kind: "binding", bindingId: "pb" }, {})).toBeNull();
  });
});

describe("dice tables: dice that step with a level, die size included", () => {
  // The Martial Arts die grows by size (d6 to d12), not by count.
  const martialArts = levelDice("monk", "1d6", { 5: "1d8", 11: "1d10", 17: "1d12" });

  it.each([
    [1, "1d6"],
    [4, "1d6"],
    [5, "1d8"],
    [11, "1d10"],
    [17, "1d12"],
    [20, "1d12"],
  ])("Monk %i rolls %s", (level, dice) => {
    expect(resolveDice(martialArts, { "level.class.monk": level })?.formula).toBe(dice);
  });

  it("keeps a dice string's ability term (1d8+WIS)", () => {
    const stars = levelDice("druid", "1d8+WIS", { 10: "2d8+WIS" });
    expect(resolveDice(stars, { "level.class.druid": 10 })?.formula).toBe("2d8+WIS");
  });

  it("reports the level it read, for the breakdown", () => {
    expect(resolveDice(martialArts, { "level.class.monk": 5 })?.terms).toEqual([
      { bindingId: "level.class.monk", value: 5 },
    ]);
  });

  it("is a valid catalogue value; an unknown binding is not", () => {
    expect(conformDiceScalar(martialArts)).toEqual(martialArts);
    expect(
      conformDiceScalar({
        kind: "dice-table",
        input: { kind: "binding", bindingId: "level.klass.monk" },
        rows: [{ atLeast: 5, dice: "1d8" }],
        below: "1d6",
      })
    ).toBeNull();
  });
});
