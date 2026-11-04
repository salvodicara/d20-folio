/**
 * The 2026 books' spells whose effects the flat fields can't state:
 *  - Negative Energy Flood: a non-Undead target takes the necrotic damage (CON save,
 *    half on a success); an Undead target gains 3d10 Temporary Hit Points instead.
 *  - Distorted Distance: per creature, Dizzying Elongation (INT save, 2d10 Psychic)
 *    or Shortened Space (+20 ft. Speed until the end of its next turn).
 * Shapes as the catalogue writes them, checked through the spell's Activity.
 */
import { describe, expect, it } from "vitest";

import type { SrdSpellData } from "@/data/types";
import { activityFromSpell } from "@/lib/activities";
import { homebrewSpellMechanics } from "@/lib/homebrew-spells";

const base = {
  school: "necromancy",
  classes: ["wizard"],
  castingTime: "action",
  ritual: false,
  components: { v: true, s: false, m: true },
  concentration: false,
  duration: { kind: "instantaneous" },
  instantaneous: true,
  source: "SRD",
} as const;

describe("Negative Energy Flood's undead branch", () => {
  const flood = {
    ...base,
    id: "flood",
    level: 5,
    damageType: "necrotic",
    damageDice: "3d10+25",
    damageDicePerUpcast: "1d10",
    saveAbility: "CON",
    damageOnSave: "half",
    damageNotVsCreatureTypes: ["undead"],
    effects: [{ kind: "temp-hp", dice: { dice: "3d10" }, vsCreatureTypes: ["undead"] }],
  } as unknown as SrdSpellData;

  it("the derived damage spares Undead", () => {
    const damage = activityFromSpell(flood).effects.find((e) => e.kind === "damage");
    expect(damage).toMatchObject({
      dice: { dice: "3d10+25", perUpcast: "1d10" },
      onSave: "half",
      notVsCreatureTypes: ["undead"],
    });
  });

  it("the temporary Hit Points for Undead are a catalogue effect", () => {
    const mechanics = homebrewSpellMechanics({
      mechanics: {
        damageNotVsCreatureTypes: ["undead"],
        effects: [
          { kind: "temp-hp", dice: { dice: "3d10" }, vsCreatureTypes: ["undead"] },
        ],
      },
    });
    expect(mechanics).toEqual({
      damageNotVsCreatureTypes: ["undead"],
      effects: [{ kind: "temp-hp", dice: { dice: "3d10" }, vsCreatureTypes: ["undead"] }],
    });
  });
});

describe("Distorted Distance's per-creature choice", () => {
  const choices = [
    {
      id: "elongation",
      effects: [
        { kind: "damage", dice: { dice: "2d10" }, types: ["psychic"], onSave: "none" },
      ],
    },
  ];
  it("a damage choice and a speed bonus are catalogue effects", () => {
    const perTargetChoice = [
      {
        id: "elongation",
        effects: [{ kind: "damage", dice: { dice: "2d10" }, types: ["psychic"] }],
      },
      {
        id: "shortened",
        effects: [
          {
            kind: "speed-bonus",
            feet: 20,
            until: { phase: "turn-end", anchor: "target" },
          },
        ],
      },
    ];
    expect(homebrewSpellMechanics({ mechanics: { perTargetChoice } as never })).toEqual({
      perTargetChoice,
    });
  });

  it("a choice with a field outside the subset is left out", () => {
    expect(
      homebrewSpellMechanics({ mechanics: { perTargetChoice: choices } as never })
    ).toEqual({});
  });
});
