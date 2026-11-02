import { describe, expect, it } from "vitest";

import { getClassFeatures } from "@/data/classes";
import { resolveDice, resolveScalar, scalarFromLevelTable } from "@/lib/scalar";

// The cases come from the catalogue the Scalar replaces: Sneak Attack's
// `diceByLevel` (rogue.ts) must resolve to the same dice at every level.
const sneakAttack = getClassFeatures("rogue")
  .find((f) => f.id === "rogue-sneak-attack")
  ?.grants?.find((g) => g.type === "damage-rider") as
  | { dice: string; diceByLevel: Record<number, string> }
  | undefined;

function legacyDiceAt(level: number): string {
  if (!sneakAttack) throw new Error("Sneak Attack damage rider not found");
  let dice = sneakAttack.dice;
  for (const [at, d] of Object.entries(sneakAttack.diceByLevel)) {
    if (level >= Number(at)) dice = d;
  }
  return dice;
}

describe("scalar: one language for scaled catalogue numbers", () => {
  it("a level table reproduces Sneak Attack's diceByLevel at every level 1-20", () => {
    if (!sneakAttack) throw new Error("Sneak Attack damage rider not found");
    const dice = scalarFromLevelTable(
      "level.class.rogue",
      sneakAttack.dice,
      sneakAttack.diceByLevel
    );
    for (let level = 1; level <= 20; level += 1) {
      expect(resolveDice(dice, { "level.class.rogue": level })?.formula).toBe(
        legacyDiceAt(level)
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
