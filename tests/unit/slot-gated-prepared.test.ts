/**
 * Always-prepared spells gated by spell-slot level (edge-case M13): the school
 * "Adept" feats add a spell once you can cast spells of its level, whatever your
 * class mix, so a half-caster gets it later than a full caster.
 */
import { describe, expect, it } from "vitest";
import { getAlwaysPreparedFromGrants } from "@/lib/expanded-spells";
import { highestSpellSlotLevel } from "@/lib/multiclass-slots";

const adept = [
  {
    grants: [
      {
        type: "always-prepared-spell" as const,
        spellId: "magic-missile",
        minSlotLevel: 1,
      },
      { type: "always-prepared-spell" as const, spellId: "fireball", minSlotLevel: 3 },
    ],
  },
];
const prepared = (classes: Parameters<typeof highestSpellSlotLevel>[0]) =>
  getAlwaysPreparedFromGrants(adept, { maxSlotLevel: highestSpellSlotLevel(classes) });

describe("slot-gated always-prepared spells", () => {
  it("reads the highest spell slot, Pact Magic included", () => {
    expect(highestSpellSlotLevel([{ classId: "wizard", level: 5 }])).toBe(3);
    expect(highestSpellSlotLevel([{ classId: "paladin", level: 5 }])).toBe(2);
    expect(highestSpellSlotLevel([{ classId: "warlock", level: 5 }])).toBe(3);
    expect(highestSpellSlotLevel([{ classId: "fighter", level: 5 }])).toBe(0);
  });

  it("a full caster gets the 3rd-level spell at level 5, a half-caster not yet", () => {
    expect(prepared([{ classId: "wizard", level: 5 }])).toEqual([
      "magic-missile",
      "fireball",
    ]);
    expect(prepared([{ classId: "paladin", level: 5 }])).toEqual(["magic-missile"]);
    expect(prepared([{ classId: "paladin", level: 9 }])).toEqual([
      "magic-missile",
      "fireball",
    ]);
  });

  it("without a slot level the gate is ignored, like minLevel without a level", () => {
    expect(getAlwaysPreparedFromGrants(adept)).toEqual(["magic-missile", "fireball"]);
  });
});
