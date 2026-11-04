/**
 * A saved character's species choices: what is still owed (the «Scelte da
 * completare» the sheet lists) and how a choice lands. Nothing is pending for a
 * character whose species asks nothing; a trait pick reads as pending until it is
 * RECORDED, because a skill on its own cannot say which slot it answered.
 */
import { describe, expect, it } from "vitest";

import {
  applySpeciesChoices,
  pendingSpeciesChoices,
  speciesBundleKeys,
} from "@/lib/species-choices";
import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterData } from "@/types/character";

const as = (race: string, extra: Partial<CharacterData> = {}): CharacterData => ({
  ...MOCK_CHARACTER.character,
  race: race as CharacterData["race"],
  speciesSpellAbility: undefined,
  speciesChoices: undefined,
  toolChoices: undefined,
  spells: [],
  ...extra,
});

describe("pendingSpeciesChoices", () => {
  it("an Elf saved by the old wizard owes its lineage, the ability and Keen Senses", () => {
    const pending = pendingSpeciesChoices(as("elf"), {});
    expect(pending.bundleKeys).toEqual(["elf-lineage"]);
    expect(pending.spellAbility).toBe(true);
    expect(pending.slots.skill.map((s) => s.slotId)).toEqual([
      "race:elf:keen-senses::skill-slot-0",
    ]);
    expect(pending.any).toBe(true);
  });

  it("each made choice leaves the list; all made, nothing is owed", () => {
    const elf = as("elf", {
      speciesSpellAbility: "WIS",
      speciesChoices: { "race:elf:keen-senses::skill-slot-0": ["perception"] },
    });
    const pending = pendingSpeciesChoices(elf, {
      grantBundleChoices: { "elf-lineage": "wood-elf" },
    });
    expect(pending).toMatchObject({ bundleKeys: [], spellAbility: false, any: false });
  });

  it("Dragonborn and Goliath owe their ancestry, the Tiefling its legacy", () => {
    for (const race of ["dragonborn", "goliath", "tiefling"]) {
      const keys = speciesBundleKeys(race);
      expect(keys).toHaveLength(1);
      expect(pendingSpeciesChoices(as(race), {}).bundleKeys).toEqual(keys);
    }
  });

  it("a species that asks nothing owes nothing (Dwarf, Orc, Halfling)", () => {
    for (const race of ["dwarf", "orc", "halfling"]) {
      expect(pendingSpeciesChoices(as(race), {}).any).toBe(false);
    }
  });

  it("a Human owes Skillful, never Versatile as a slot", () => {
    const pending = pendingSpeciesChoices(as("human"), {});
    expect(pending.slots.skill).toHaveLength(1);
    expect(pending.slots.feat).toHaveLength(0);
  });
});

describe("applySpeciesChoices", () => {
  it("grants the skill and records the slot, so it is no longer owed", () => {
    const elf = as("elf", { skills: {} });
    const { slots } = pendingSpeciesChoices(elf, {});
    const next = applySpeciesChoices(elf, slots, {
      ...EMPTY_CHOICE_PICKS,
      skill: { "race:elf:keen-senses::skill-slot-0": ["survival"] },
    });
    expect(next.skills.survival).toBe("proficient");
    expect(next.speciesChoices).toEqual({
      "race:elf:keen-senses::skill-slot-0": ["survival"],
    });
    expect(pendingSpeciesChoices(next, {}).slots.skill).toHaveLength(0);
  });

  it("ignores picks for slots that are not the species' own, and an empty pick", () => {
    const elf = as("elf");
    const { slots } = pendingSpeciesChoices(elf, {});
    const next = applySpeciesChoices(elf, slots, {
      ...EMPTY_CHOICE_PICKS,
      skill: { "class:fighter::skill-slot-0": ["athletics"] },
    });
    expect(next).toBe(elf);
  });
});
