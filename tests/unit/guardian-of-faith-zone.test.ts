/**
 * Guardian of Faith (SRD 5.2.1): "Any enemy that moves to a space within 10 feet of
 * the guardian for the first time on a turn or starts its turn there makes a Dexterity
 * saving throw, taking 20 Radiant damage on a failed save or half as much damage on a
 * successful one. The guardian vanishes when it has dealt a total of 60 damage."
 */
import { expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import en from "@/i18n/en/srd/spells.json";

it("its zone hurts on entering and at the start of a turn, 20 Radiant, DEX for half", () => {
  const text = (en as Record<string, { description?: string }>)["guardian-of-faith"]
    ?.description;
  expect(text).toMatch(/for the first time on a turn or starts its turn there/);
  const spell = getSpellById("guardian-of-faith");
  expect(spell?.damageDice).toBeUndefined();
  expect(spell).toMatchObject({
    saveAbility: "DEX",
    effects: [
      { kind: "damage", dice: { dice: "20" }, types: ["radiant"], onSave: "half" },
    ],
    recurrence: "on-enter-or-start-turn",
    zone: { anchor: "point", spellLevel: 4, triggers: ["enter", "start-turn"] },
    budget: { max: 60, counts: "damage-dealt" },
  });
});
