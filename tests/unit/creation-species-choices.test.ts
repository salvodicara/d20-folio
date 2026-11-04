/**
 * Every species asks ALL of its 2024 creation choices, read from the engine's own
 * grants (never a hand-kept list): its lineage bundles, the spellcasting ability
 * its lineage spells use, every `choice-*` its traits confer (Elf Keen Senses,
 * Human Skillful), and for a Human the Versatile origin feat plus that feat's own
 * picks. The species step is complete only once every one of them is made.
 */
import { describe, expect, it } from "vitest";

import { SRD_RACES } from "@/data/races";
import { ALL_SKILLS } from "@/lib/skills";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  speciesStepComplete,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import {
  EMPTY_CHOICE_PICKS,
  hasAnyChoiceSlots,
  type FeatureChoiceSlots,
} from "@/lib/feature-choices";
import { listAvailableForSlot } from "@/lib/feat-spell-choices";

const apply = (draft: CreationDraft, ...actions: CreationDraftAction[]) =>
  actions.reduce(creationDraftReducer, draft);

/** A fresh draft on `raceId` (a Fighter with the Soldier background). */
function draftFor(raceId: string): CreationDraft {
  return apply(
    initialCreationDraft(),
    { type: "selectClass", classId: "fighter" },
    { type: "selectBackground", backgroundId: "soldier" },
    { type: "selectRace", raceId }
  );
}

const firstN = (pool: readonly string[], n: number) => pool.slice(0, n);

/** One valid answer for every slot of `slots` (the first options in order). */
function fillAll(slots: FeatureChoiceSlots) {
  const skills = ALL_SKILLS.map((s) => s.id);
  const by = <T extends { slotId: string }>(
    list: readonly T[],
    pick: (slot: T) => readonly string[]
  ) => Object.fromEntries(list.map((s) => [s.slotId, pick(s)]));
  return {
    ...EMPTY_CHOICE_PICKS,
    skill: by(slots.skill, (s) =>
      firstN(s.options.length ? s.options : skills, s.amount)
    ),
    tool: by(slots.tool, (s) => firstN(s.options, s.amount)),
    language: by(slots.language, (s) => firstN(s.options, s.amount)),
    skillOrTool: by(slots.skillOrTool, (s) => firstN(skills, s.amount)),
    expertise: by(slots.expertise, (s) => firstN(skills, s.amount)),
    spell: by(slots.spell, (s) =>
      firstN(
        listAvailableForSlot(s, new Set()).map((sp) => sp.id),
        s.count
      )
    ),
    feat: by(slots.feat, () => []),
  };
}

/** Each decision the species owes, as the actions that make it. */
function decisions(draft: CreationDraft): CreationDraftAction[][] {
  const facts = creationFacts(draft);
  const steps: CreationDraftAction[][] = [];
  for (const key of facts.lineageBundleKeys) {
    const bundle = facts.raceData?.traits
      .flatMap((t) => t.grants ?? [])
      .find((g) => g.type === "choice-grant-bundle" && g.bundleKey === key);
    const optionId = bundle?.type === "choice-grant-bundle" ? bundle.options[0]?.id : "";
    steps.push([{ type: "setLineageChoice", bundleKey: key, optionId: optionId ?? "" }]);
  }
  if (facts.needsSpeciesSpellAbility) {
    steps.push([{ type: "setSpeciesSpellAbility", ability: "WIS" }]);
  }
  return steps;
}

describe("the species step asks every species choice", () => {
  for (const race of SRD_RACES) {
    it(`${race.id}: complete only once every choice is made`, () => {
      let draft = draftFor(race.id);
      // A Human's Versatile feat: Magic Initiate (Wizard), whose cantrips and spell
      // are then owed too.
      const human = creationFacts(draft).isHuman;
      const steps = decisions(draft);
      if (human) steps.push([{ type: "setHumanFeat", featId: "magic-initiate-wizard" }]);
      // The trait choices (and the feat's own) are one last decision, read from
      // the slots once everything above them is in place.
      const pending = () => {
        const f = creationFacts(draft);
        return { slots: f.speciesChoiceSlots, feat: f.humanFeatSlots };
      };

      for (const actions of steps) {
        expect(speciesStepComplete(draft, creationFacts(draft))).toBe(false);
        draft = apply(draft, ...actions);
      }
      const { slots, feat } = pending();
      const owed = hasAnyChoiceSlots(slots) || hasAnyChoiceSlots(feat);
      if (owed) {
        expect(speciesStepComplete(draft, creationFacts(draft))).toBe(false);
        const own = fillAll(slots);
        const featPicks = fillAll(feat);
        draft = apply(draft, {
          type: "setChoicePicks",
          picks: {
            ...draft.choicePicks,
            skill: { ...draft.choicePicks.skill, ...own.skill, ...featPicks.skill },
            tool: { ...draft.choicePicks.tool, ...own.tool, ...featPicks.tool },
            language: { ...draft.choicePicks.language, ...own.language },
            skillOrTool: { ...draft.choicePicks.skillOrTool, ...own.skillOrTool },
            expertise: { ...draft.choicePicks.expertise, ...own.expertise },
            spell: { ...draft.choicePicks.spell, ...own.spell, ...featPicks.spell },
            feat: draft.choicePicks.feat,
          },
        });
      }
      expect(speciesStepComplete(draft, creationFacts(draft))).toBe(true);
    });
  }

  it("Elf: a lineage, its spellcasting ability and the Keen Senses skill", () => {
    const facts = creationFacts(draftFor("elf"));
    expect(facts.lineageBundleKeys).toEqual(["elf-lineage"]);
    expect(facts.needsSpeciesSpellAbility).toBe(true);
    expect(facts.speciesChoiceSlots.skill.map((s) => [...s.options])).toEqual([
      ["insight", "perception", "survival"],
    ]);
  });

  it("Gnome and Tiefling: a lineage or legacy and its spellcasting ability", () => {
    for (const id of ["gnome", "tiefling"]) {
      const facts = creationFacts(draftFor(id));
      expect(facts.lineageBundleKeys.length).toBe(1);
      expect(facts.needsSpeciesSpellAbility).toBe(true);
    }
  });

  it("Dragonborn and Goliath: an ancestry, no spellcasting ability", () => {
    for (const id of ["dragonborn", "goliath"]) {
      const facts = creationFacts(draftFor(id));
      expect(facts.lineageBundleKeys.length).toBe(1);
      expect(facts.needsSpeciesSpellAbility).toBe(false);
    }
  });

  it("Human: Skillful (any skill) and Versatile, never Versatile twice as a slot", () => {
    const facts = creationFacts(draftFor("human"));
    expect(facts.speciesChoiceSlots.skill).toHaveLength(1);
    expect(facts.speciesChoiceSlots.feat).toHaveLength(0);
    const withFeat = creationFacts(
      apply(draftFor("human"), { type: "setHumanFeat", featId: "magic-initiate-wizard" })
    );
    expect(withFeat.humanFeatSlots.spell.map((s) => [s.kind, s.count])).toEqual([
      ["cantrip", 2],
      ["spell", 1],
    ]);
  });
});
