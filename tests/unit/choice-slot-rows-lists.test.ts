/**
 * A choice row offers only what its rule allows (SRD 5.2.1):
 * - Wizard Scholar: «Choose one of the following skills in which you have
 *   proficiency: Arcana, History, Investigation, Medicine, Nature, or Religion»;
 * - Expertise (Ranger 9, Rogue, Bard): «skill proficiencies with which you lack
 *   Expertise»;
 * - a language pick (Ranger Deft Explorer): a language you don't already know.
 * The row's own current pick stays offered, so it can be read and undone.
 */
import { describe, expect, it } from "vitest";

import { choiceSlotRows } from "@/domains/creation/creation-view";
import { EMPTY_CHOICE_PICKS, type FeatureChoiceSlots } from "@/lib/feature-choices";

const NO_SLOTS: FeatureChoiceSlots = {
  skill: [],
  tool: [],
  skillOrTool: [],
  language: [],
  spell: [],
  expertise: [],
  feat: [],
};
const SCHOLAR = ["arcana", "history", "investigation", "medicine", "nature", "religion"];

const optionIds = (
  slots: Partial<FeatureChoiceSlots>,
  owned: Parameters<typeof choiceSlotRows>[2],
  picks = EMPTY_CHOICE_PICKS
) =>
  choiceSlotRows({ ...NO_SLOTS, ...slots }, picks, owned, "en")[0]?.options.map(
    (o) => o.id
  );

describe("choiceSlotRows offers only what the rule allows", () => {
  it("Scholar: only the six skills, and only those you are proficient in", () => {
    const ids = optionIds(
      { expertise: [{ slotId: "scholar", amount: 1, options: SCHOLAR }] },
      {
        skills: new Set(["arcana", "history", "athletics", "intimidation"]),
        spells: new Set(),
      }
    );
    expect(ids?.sort()).toEqual(["arcana", "history"]);
  });

  it("Expertise: never a skill that already has Expertise, unless it is this row's pick", () => {
    const owned = {
      skills: new Set(["stealth", "survival", "perception"]),
      spells: new Set<string>(),
      expert: new Set(["stealth", "survival"]),
    };
    const slots = { expertise: [{ slotId: "ranger-9", amount: 2 }] };
    expect(optionIds(slots, owned)).toEqual(["perception"]);
    const picked = {
      ...EMPTY_CHOICE_PICKS,
      expertise: { "ranger-9": ["survival"] },
    };
    expect(optionIds(slots, owned, picked)?.sort()).toEqual(["perception", "survival"]);
  });

  it("Languages: never one you already know", () => {
    const ids = optionIds(
      { language: [{ slotId: "deft-explorer", amount: 2, options: [] }] },
      {
        skills: new Set(),
        spells: new Set(),
        languages: new Set(["common", "elvish"]),
      }
    );
    expect(ids).not.toContain("common");
    expect(ids).not.toContain("elvish");
    expect(ids).toContain("dwarvish");
  });
});
