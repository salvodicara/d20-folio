/**
 * L3 — the generic choice engine. `collectChoiceSlots` turns any set of
 * grant sources into source-namespaced picker slots; `applyChoicePicks`
 * resolves the picks onto a character through the existing per-kind
 * appliers; `pruneChoicePicks` drops stale entries when the slot set
 * changes (feat/subclass switch).
 */
import { describe, expect, it } from "vitest";
import {
  collectChoiceSlots,
  partitionChoiceSlotsBySource,
  applyChoicePicks,
  pruneChoicePicks,
  isAllChoicesComplete,
  hasAnyChoiceSlots,
  EMPTY_CHOICE_PICKS,
  type ChoicePicks,
} from "@/lib/feature-choices";
import type { GrantSource } from "@/lib/grants";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { MOCK_CHARACTER } from "@/lib/mock";

const SKILL_SRC: GrantSource = {
  id: "src-skill",
  name: { en: "Skill Source", it: "Fonte Abilità" },
  grants: [{ type: "choice-skill-proficiency", options: [], amount: 2 }],
};
const TOOL_SRC: GrantSource = {
  id: "src-tool",
  name: { en: "Tool Source", it: "Fonte Strumenti" },
  grants: [
    { type: "choice-tool-proficiency", options: ["thieves-tools"], amount: 1 },
    { type: "choice-language", options: [], amount: 1 },
  ],
};
const NO_CHOICE_SRC: GrantSource = {
  id: "src-plain",
  name: { en: "Plain", it: "Semplice" },
  grants: [{ type: "darkvision", range: 60 }],
};

describe("collectChoiceSlots", () => {
  it("returns empty groups for no sources / sources with no choice grants", () => {
    expect(hasAnyChoiceSlots(collectChoiceSlots([]))).toBe(false);
    expect(hasAnyChoiceSlots(collectChoiceSlots([NO_CHOICE_SRC]))).toBe(false);
  });

  it("groups slots by kind and emits one slot per choice grant", () => {
    const slots = collectChoiceSlots([SKILL_SRC, TOOL_SRC]);
    expect(slots.skill).toHaveLength(1);
    expect(slots.skill[0]?.amount).toBe(2);
    expect(slots.tool).toHaveLength(1);
    expect(slots.tool[0]?.options).toEqual(["thieves-tools"]);
    expect(slots.language).toHaveLength(1);
    expect(hasAnyChoiceSlots(slots)).toBe(true);
  });

  it("namespaces slot ids by source so two sources never collide", () => {
    const a: GrantSource = { ...SKILL_SRC, id: "alpha" };
    const b: GrantSource = { ...SKILL_SRC, id: "beta" };
    const slots = collectChoiceSlots([a, b]);
    const ids = slots.skill.map((s) => s.slotId);
    expect(ids).toEqual(["alpha::skill-slot-0", "beta::skill-slot-0"]);
    expect(new Set(ids).size).toBe(2);
  });

  it("resolves a REAL non-feat subclass feature (College of Lore → 3 skills)", () => {
    const src = getSrdFeatureSource("bard-lore-bonus-proficiencies");
    if (!src) throw new Error("fixture bard-lore-bonus-proficiencies missing");
    const slots = collectChoiceSlots([
      { id: "bard-lore-bonus-proficiencies", grants: src.grants },
    ]);
    expect(slots.skill).toHaveLength(1);
    expect(slots.skill[0]?.amount).toBe(3);
    expect(slots.skill[0]?.slotId).toBe("bard-lore-bonus-proficiencies::skill-slot-0");
  });

  // The bounded-option-set skill pick (Ranger Fey Wanderer Otherworldly
  // Glamour — a PACK subclass feature) is pinned in
  // content-pack/tests/unit/feature-choices.pack.test.ts.
});

describe("partitionChoiceSlotsBySource", () => {
  // The wizards render a just-picked feat's slots INLINE under its picker
  // (attributed to the cause) and everything else in the shared section.
  it("splits a source's slots from the rest, across every kind", () => {
    const slots = collectChoiceSlots([SKILL_SRC, TOOL_SRC]);
    const { caused, rest } = partitionChoiceSlotsBySource(slots, "src-tool");
    expect(caused.tool).toHaveLength(1);
    expect(caused.language).toHaveLength(1);
    expect(caused.skill).toHaveLength(0);
    expect(rest.skill).toHaveLength(1);
    expect(rest.tool).toHaveLength(0);
    expect(rest.language).toHaveLength(0);
  });

  it("a null source causes nothing — everything stays in rest", () => {
    const slots = collectChoiceSlots([SKILL_SRC, TOOL_SRC]);
    const { caused, rest } = partitionChoiceSlotsBySource(slots, null);
    expect(hasAnyChoiceSlots(caused)).toBe(false);
    expect(rest.skill).toHaveLength(1);
    expect(rest.tool).toHaveLength(1);
  });

  it("never matches a source whose id merely PREFIXES another (:: boundary)", () => {
    const a: GrantSource = { ...SKILL_SRC, id: "alert" };
    const b: GrantSource = { ...SKILL_SRC, id: "alert-plus" };
    const { caused, rest } = partitionChoiceSlotsBySource(
      collectChoiceSlots([a, b]),
      "alert"
    );
    expect(caused.skill.map((s) => s.slotId)).toEqual(["alert::skill-slot-0"]);
    expect(rest.skill.map((s) => s.slotId)).toEqual(["alert-plus::skill-slot-0"]);
  });
});

describe("isAllChoicesComplete", () => {
  it("is false until every slot of every kind is filled to amount", () => {
    const slots = collectChoiceSlots([SKILL_SRC, TOOL_SRC]);
    expect(isAllChoicesComplete(slots, EMPTY_CHOICE_PICKS)).toBe(false);
    const partial: ChoicePicks = {
      ...EMPTY_CHOICE_PICKS,
      skill: { "src-skill::skill-slot-0": ["arcana", "history"] },
    };
    expect(isAllChoicesComplete(slots, partial)).toBe(false); // tool + language still empty
    const full: ChoicePicks = {
      ...EMPTY_CHOICE_PICKS,
      skill: { "src-skill::skill-slot-0": ["arcana", "history"] },
      tool: { "src-tool::tool-slot-0": ["thieves-tools"] },
      language: { "src-tool::lang-slot-0": ["draconic"] },
    };
    expect(isAllChoicesComplete(slots, full)).toBe(true);
  });
});

describe("applyChoicePicks", () => {
  const base = MOCK_CHARACTER.character;

  it("lands skill / tool / language picks on the character", () => {
    const slots = collectChoiceSlots([SKILL_SRC, TOOL_SRC]);
    const picks: ChoicePicks = {
      ...EMPTY_CHOICE_PICKS,
      skill: { "src-skill::skill-slot-0": ["arcana", "nature"] },
      tool: { "src-tool::tool-slot-0": ["thieves-tools"] },
      language: { "src-tool::lang-slot-0": ["draconic"] },
    };
    const next = applyChoicePicks(base, slots, picks);
    expect(next.skills.arcana).toBe("proficient");
    expect(next.skills.nature).toBe("proficient");
    // A tool CHOICE pick lands as STABLE IDS in `toolChoices` (keyed by the
    // namespaced slot id) — never baked into the free-text string (rules 6 + 7).
    // The proficiency is DERIVED from these ids by the synthetic grant source.
    expect(next.toolChoices?.["src-tool::tool-slot-0"]).toEqual(["thieves-tools"]);
    // MOCK already knows Draconic (id) — idempotent, not duplicated.
    expect(next.languageIds.filter((id) => id === "draconic")).toHaveLength(1);
  });

  it("does not downgrade an existing expertise skill", () => {
    // MOCK has expertise skills (deception/performance/persuasion); pick one again.
    const expertiseSkill = Object.entries(base.skills).find(
      ([, v]) => v === "expertise"
    )?.[0];
    if (!expertiseSkill) throw new Error("mock has no expertise skill");
    const slots = collectChoiceSlots([SKILL_SRC]);
    const picks: ChoicePicks = {
      ...EMPTY_CHOICE_PICKS,
      skill: { "src-skill::skill-slot-0": [expertiseSkill, "nature"] },
    };
    const next = applyChoicePicks(base, slots, picks);
    expect(next.skills[expertiseSkill]).toBe("expertise");
  });

  it("a spell pick lands as prepared + alwaysPrepared, with slot ability override", () => {
    const spellSrc: GrantSource = {
      id: "magic-initiate-cleric",
      name: { en: "Magic Initiate", it: "Iniziato alla Magia" },
      grants: [
        {
          type: "choice-spell",
          classSpellList: "cleric",
          maxLevel: 1,
          amount: 1,
          spellAbility: "WIS",
        },
      ],
    };
    const slots = collectChoiceSlots([spellSrc]);
    const slotId = slots.spell[0]?.slotId ?? "";
    expect(slotId).toBe("magic-initiate-cleric::spell-slot-0");
    const picks: ChoicePicks = { ...EMPTY_CHOICE_PICKS, spell: { [slotId]: ["bless"] } };
    const next = applyChoicePicks(base, slots, picks);
    const added = next.spells.find((s) => !("custom" in s) && s.srdId === "bless");
    expect(added).toBeTruthy();
    if (added && !("custom" in added)) {
      expect(added.prepared).toBe(true);
      expect(added.alwaysPrepared).toBe(true);
      expect(added.spellAbilityOverride).toBe("WIS");
    }
  });
});

describe("pruneChoicePicks", () => {
  it("drops picks whose slot id is no longer present", () => {
    const slots = collectChoiceSlots([SKILL_SRC]);
    const picks: ChoicePicks = {
      ...EMPTY_CHOICE_PICKS,
      skill: {
        "src-skill::skill-slot-0": ["arcana"], // still valid
        "stale::skill-slot-0": ["history"], // gone (e.g. feat switched)
      },
    };
    const pruned = pruneChoicePicks(slots, picks);
    expect(Object.keys(pruned.skill)).toEqual(["src-skill::skill-slot-0"]);
  });
});
