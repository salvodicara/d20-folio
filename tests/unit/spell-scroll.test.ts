/**
 * Spell Scrolls (edge-case M13, 2024 rules): a scroll of a spell on one of your class
 * lists casts it without a slot or Material components and is used up. A spell above
 * the levels you can cast asks for a spellcasting check, DC 10 + its level.
 */
import { afterEach, describe, expect, it } from "vitest";

import { buildScenario } from "@/lib/dev-scenarios";
import { resolveActions } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

function cleric(level = 3): CharacterDoc {
  return buildScenario({
    name: "Scroll reader",
    classId: "cleric",
    level,
    raceId: "human",
    background: "acolyte",
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    equipment: [
      { srdId: "spell-scroll", quantity: 1, scrollSpell: "cure-wounds" },
      { srdId: "spell-scroll", quantity: 1, scrollSpell: "bless" },
      { srdId: "spell-scroll", quantity: 1, scrollSpell: "flame-strike" },
    ],
  });
}

const scrollOf = (doc: CharacterDoc, spellId: string) =>
  resolveActions(doc).find((a) => a.id === `item-scroll-${spellId}`);

afterEach(() => useCharacterStore.setState({ character: null }));

describe("casting from a Spell Scroll", () => {
  it("costs the scroll, not a slot, and says so", () => {
    const cure = scrollOf(cleric(), "cure-wounds");
    expect(cure).toMatchObject({
      spellId: "cure-wounds",
      costsSlot: false,
      description: { ui: "combat.scrollCast" },
    });
    expect(cure?.refund).toBeUndefined();
  });

  it("a spell above your levels needs the check, DC 10 + its level", () => {
    // A Cleric 3 casts up to 2nd level; Flame Strike is 5th.
    expect(scrollOf(cleric(), "flame-strike")?.description).toEqual({
      ui: "combat.scrollCheck",
      params: { dc: 15 },
    });
  });

  it("uses up that scroll, not another one; undo brings it back", () => {
    useCharacterStore.setState({ character: cleric(), loading: false, error: null });
    const live = () => useCharacterStore.getState().character;
    const doc = live();
    if (!doc) throw new Error("no character");
    const cure = scrollOf(doc, "cure-wounds");
    if (!cure?.costEquipment) throw new Error("no scroll action");
    const undo = useCharacterStore.getState().useEquipmentItem(cure.costEquipment);
    const left = () =>
      (live()?.character.equipment ?? []).flatMap((e) =>
        "custom" in e ? [] : [e.scrollSpell]
      );
    expect(left()).toEqual(["bless", "flame-strike"]);
    expect(undo?.()).toBe(true);
    expect(left()).toContain("cure-wounds");
  });
});
