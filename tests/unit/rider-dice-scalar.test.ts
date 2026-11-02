/**
 * Weapon damage riders that scale with a class level (edge-case family M11).
 * Expected dice come from the 2024 rules, not from the data: Sneak Attack is
 * ceil(Rogue level / 2) d6, counted on the Rogue's own level in a multiclass.
 */
import { describe, expect, it } from "vitest";
import { resolveActions } from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function rogue(classes: CharacterDoc["character"]["classes"]): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      classes,
      features: [{ srdId: "rogue-sneak-attack" }],
      weapons: [{ srdId: "rapier", quantity: 1 }],
    },
    session: { ...MOCK_CHARACTER.session, activeFeatures: [] },
  };
}

function sneakDice(doc: CharacterDoc): string | undefined {
  const rapier = resolveActions(doc).find((a) => a.source === "weapon");
  // Sneak Attack is the test character's only rider.
  const riders = rapier?.summary.extraDamage ?? [];
  expect(riders).toHaveLength(1);
  return riders[0]?.dice;
}

describe("Sneak Attack dice follow the Rogue level (RAW: ceil(level / 2) d6)", () => {
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))("Rogue %i", (level) => {
    expect(sneakDice(rogue([{ classId: "rogue", level }]))).toBe(
      `${Math.ceil(level / 2)}d6`
    );
  });

  it("a Fighter 10 / Rogue 5 counts only the Rogue levels: 3d6", () => {
    expect(
      sneakDice(
        rogue([
          { classId: "fighter", level: 10 },
          { classId: "rogue", level: 5 },
        ])
      )
    ).toBe("3d6");
  });
});
