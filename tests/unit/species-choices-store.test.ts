/**
 * The sheet's «Scelte da completare» writes through the character store: a
 * species pick lands (skill + record), the ability is set, and a read-only sheet
 * or a pick for another slot writes nothing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { asRaceId } from "@/data/srd-names";
import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const KEEN = "race:elf:keen-senses::skill-slot-0";

function loadElf() {
  const doc = makeCharacterDoc();
  useCharacterStore.getState().setCharacter({
    ...doc,
    character: {
      ...doc.character,
      race: asRaceId("elf"),
      skills: {},
      speciesSpellAbility: undefined,
    },
  });
}

afterEach(() => {
  useCharacterStore.getState().setCharacter(null);
  useCharacterStore.setState({ readonly: false });
});

describe("species choices through the store", () => {
  it("a Keen Senses pick grants the skill", () => {
    loadElf();
    useCharacterStore.getState().resolveSpeciesChoices({
      ...EMPTY_CHOICE_PICKS,
      skill: { [KEEN]: ["perception"] },
    });
    const c = useCharacterStore.getState().character?.character;
    expect(c?.skills.perception).toBe("proficient");
  });

  it("sets the species spellcasting ability", () => {
    loadElf();
    useCharacterStore.getState().setSpeciesSpellAbility("INT");
    expect(useCharacterStore.getState().character?.character.speciesSpellAbility).toBe(
      "INT"
    );
  });

  it("writes nothing on a read-only sheet, or for a slot that is not the species'", () => {
    loadElf();
    const before = useCharacterStore.getState().character;
    useCharacterStore.getState().resolveSpeciesChoices({
      ...EMPTY_CHOICE_PICKS,
      skill: { "class:fighter::skill-slot-0": ["athletics"] },
    });
    expect(useCharacterStore.getState().character).toBe(before);
    useCharacterStore.setState({ readonly: true });
    useCharacterStore.getState().resolveSpeciesChoices({
      ...EMPTY_CHOICE_PICKS,
      skill: { [KEEN]: ["perception"] },
    });
    useCharacterStore.getState().setSpeciesSpellAbility("WIS");
    expect(useCharacterStore.getState().character).toBe(before);
  });

  it("a Versatile feat chosen on the sheet lands as the origin feat", () => {
    const doc = makeCharacterDoc();
    useCharacterStore.getState().setCharacter({
      ...doc,
      character: { ...doc.character, race: asRaceId("human"), humanOriginFeat: "" },
    });
    useCharacterStore.getState().setHumanOriginFeat("alert");
    expect(useCharacterStore.getState().character?.character.humanOriginFeat).toBe(
      "alert"
    );
  });

  it("records which ability a feat's increase raised, on the feat ref alone", () => {
    const doc = makeCharacterDoc();
    useCharacterStore.getState().setCharacter({
      ...doc,
      character: { ...doc.character, features: [{ srdId: "grappler" }] },
    });
    const scores = doc.character.abilityScores;
    useCharacterStore.getState().setFeatAbility("grappler", "DEX");
    const c = useCharacterStore.getState().character?.character;
    expect(c?.features).toEqual([{ srdId: "grappler", featAbility: "DEX" }]);
    // The +1 was applied when the feat was taken: the answer adds nothing.
    expect(c?.abilityScores).toEqual(scores);
    useCharacterStore.setState({ readonly: true });
    const before = useCharacterStore.getState().character;
    useCharacterStore.getState().setFeatAbility("grappler", "STR");
    expect(useCharacterStore.getState().character).toBe(before);
  });
});
