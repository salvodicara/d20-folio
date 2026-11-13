/**
 * A saved character's species choices: what is still owed (the «Scelte da
 * completare» the sheet lists, read from `unresolvedBuildChoices`) and how a choice
 * lands. Nothing is pending for a species that asks nothing; a skill from named
 * options counts as made once one is proficient; Skillful («any skill») cannot be
 * verified, so it is never asked again.
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
import { pendingSpeciesItems } from "@/lib/views/species-choices-view";

const as = (race: string, extra: Partial<CharacterData> = {}): CharacterData => ({
  ...MOCK_CHARACTER.character,
  race: race as CharacterData["race"],
  speciesSpellAbility: undefined,
  // A realistic count (background 2 + a Monk's 2 + Skillful 1), none of them a Keen
  // Senses option, so an any-skill pick isn't owed for being short.
  skills: {
    athletics: "proficient",
    acrobatics: "proficient",
    history: "proficient",
    religion: "proficient",
    stealth: "proficient",
  },
  spells: [],
  // A class whose table gives no picks, so only the species' choices are owed.
  classes: [{ classId: "monk", level: 9 }],
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
      skills: { perception: "proficient" },
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

  it("a Human with its feat owes nothing: Skillful cannot be verified, so it is not asked", () => {
    const pending = pendingSpeciesChoices(as("human", { humanOriginFeat: "alert" }), {});
    expect(pending.slots.skill).toHaveLength(0);
    expect(pending.any).toBe(false);
  });
});

describe("applySpeciesChoices", () => {
  it("grants the skill, so Keen Senses is no longer owed", () => {
    const elf = as("elf");
    const { slots } = pendingSpeciesChoices(elf, {});
    const next = applySpeciesChoices(elf, slots, {
      ...EMPTY_CHOICE_PICKS,
      skill: { "race:elf:keen-senses::skill-slot-0": ["survival"] },
    });
    expect(next.skills.survival).toBe("proficient");
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

describe("pendingSpeciesItems", () => {
  it("names each owed choice for the sheet, in order: bundles, ability, traits", () => {
    expect(pendingSpeciesItems(as("elf"), {}, "en")).toEqual([
      { kind: "bundle", bundleKey: "elf-lineage", label: "Elven Lineage" },
      { kind: "ability" },
      {
        kind: "slot",
        slotId: "race:elf:keen-senses::skill-slot-0",
        label: "Keen Senses",
      },
    ]);
    expect(pendingSpeciesItems(as("dwarf"), {}, "en")).toEqual([]);
  });
});

describe("the Versatile feat a Human never chose", () => {
  it("is owed when humanOriginFeat is empty, and named after its trait", () => {
    const human = as("human", { humanOriginFeat: "" });
    expect(pendingSpeciesChoices(human, {})).toMatchObject({ feat: true, any: true });
    expect(pendingSpeciesItems(human, {}, "en")).toEqual([
      { kind: "feat", label: "Versatile" },
    ]);
    expect(
      pendingSpeciesChoices(as("human", { humanOriginFeat: "alert" }), {}).feat
    ).toBe(false);
  });
});
