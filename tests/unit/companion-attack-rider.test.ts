/**
 * A companion upgrade that adds damage to one of its attacks while the owner holds a
 * Concentration spell (edge-case family M6, Bestial Fury: the Beast's Strike adds
 * Hunter's Mark's 1d6 Force), only once the owner's level reaches the upgrade.
 */
import { describe, expect, it } from "vitest";

import type { CompanionStatBlock } from "@/data/types";
import { resolveCompanion } from "@/lib/compute";

const block: CompanionStatBlock = {
  variantId: "beast",
  ac: { base: 13 },
  hp: { base: 5, perLevel: 5 },
  hitDie: "d8",
  speeds: { walk: 40 },
  abilityScores: { STR: 14, DEX: 14, CON: 15, INT: 8, WIS: 14, CHA: 11 },
  attacks: [{ id: "strike", dice: "1d8 + 2", damageType: "piercing" }],
  upgrades: [
    {
      id: "fury",
      minLevel: 11,
      attackRider: {
        attackId: "strike",
        dice: "1d6",
        damageType: "force",
        whileConcentrating: "hunters-mark",
      },
    },
  ],
} as unknown as CompanionStatBlock;

const scores = { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 10 };
const strike = (level: number, concentration?: string) =>
  resolveCompanion(block, level, scores, null, 7, undefined, { concentration })
    .attacks[0];

describe("a companion upgrade's attack rider", () => {
  it("adds its damage at the upgrade's level while the owner concentrates", () => {
    expect(strike(11, "hunters-mark")?.extraDamage).toEqual([
      { dice: "1d6", damageType: "force" },
    ]);
  });

  it("adds nothing below the level or without the Concentration", () => {
    expect(strike(10, "hunters-mark")?.extraDamage).toBeUndefined();
    expect(strike(11, "bless")?.extraDamage).toBeUndefined();
    expect(strike(11)?.extraDamage).toBeUndefined();
  });
});
