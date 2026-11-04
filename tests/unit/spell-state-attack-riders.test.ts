/**
 * Conjure Minor Elementals (2024): while it lasts, "any attack you make deals an
 * extra 2d8 damage" (+1d8 per slot level above 4th), Acid, Cold, Fire or Lightning
 * at your choice. A running spell's `attack-or-spell` rider rides every attack row,
 * weapon, Unarmed Strike and spell attack alike, scaled by the level it was cast at.
 * A species form's own rider (Celestial Revelation) keeps its own card.
 */
import { describe, expect, it } from "vitest";

import { resolveActions } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function druid(castLevel?: number, lit = true): CharacterDoc {
  return makeCharacterDoc(
    {
      classes: [{ classId: "druid", level: 9 }],
      spells: [
        { srdId: "conjure-minor-elementals", prepared: true },
        { srdId: "starry-wisp", prepared: true },
      ],
      weapons: [{ srdId: "quarterstaff" }] as never,
      spellSlots: [{ level: 5, total: 1 }],
    },
    {
      concentration: lit ? ("conjure-minor-elementals" as never) : "",
      activeFeatures: lit ? ["spell-conjure-minor-elementals"] : [],
      ...(castLevel === undefined
        ? {}
        : { activeSpellCastLevels: { "spell-conjure-minor-elementals": castLevel } }),
    }
  );
}

const elemental = (doc: CharacterDoc, test: (id: string) => boolean) =>
  resolveActions(doc)
    .filter((a) => test(a.id))
    .map((a) =>
      (a.summary.extraDamage ?? []).find((r) => r.damageTypeChoices?.includes("acid"))
    );

describe("a running spell's rider on every attack", () => {
  it("rides the weapon, Unarmed Strike and a spell attack", () => {
    const doc = druid(4);
    const [staff] = elemental(doc, (id) => id.includes("quarterstaff"));
    const [wisp] = elemental(doc, (id) => id === "spell-starry-wisp");
    const [fist] = elemental(doc, (id) => id.includes("unarmed"));
    for (const rider of [staff, wisp, fist]) {
      expect(rider).toMatchObject({
        dice: "2d8",
        damageTypeChoices: ["acid", "cold", "fire", "lightning"],
      });
    }
  });

  it("scales with the slot it was cast with: 5th level, 3d8", () => {
    const [staff] = elemental(druid(5), (id) => id.includes("quarterstaff"));
    expect(staff?.dice).toBe("3d8");
  });

  it("not while the spell isn't running", () => {
    expect(elemental(druid(4, false), (id) => id.includes("quarterstaff"))).toEqual([
      undefined,
    ]);
  });
});
