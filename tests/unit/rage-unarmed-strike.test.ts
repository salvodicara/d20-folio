/**
 * Rage Damage on an Unarmed Strike (SRD 5.2.1 Rage: "When you make an attack using
 * Strength — with either a weapon or an Unarmed Strike — and deal damage to the
 * target, you gain a bonus to the damage"). A Barbarian 5 with STR 18 punches for
 * 1 + 4 = 5 calm, 5 + 2 = 7 raging.
 */
import { describe, expect, it } from "vitest";

import { resolveActions } from "@/lib/smart-tracker";

import { makeCharacterDoc } from "./_helpers";

const barbarian = (raging: boolean) =>
  makeCharacterDoc(
    {
      classes: [{ classId: "barbarian", level: 5 }],
      features: [{ srdId: "barbarian-rage" }],
      abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 8, WIS: 10, CHA: 10 },
    },
    raging ? { activeFeatures: ["barbarian-rage"] } : {}
  );

const unarmed = (doc: ReturnType<typeof barbarian>) =>
  resolveActions(doc, "combat").find((a) => a.id === "unarmed-strike")?.summary.damage;

describe("Rage Damage on an Unarmed Strike", () => {
  it("adds the Rage Damage while raging", () => {
    expect(unarmed(barbarian(false))).toBe("5");
    expect(unarmed(barbarian(true))).toBe("7");
  });
});
