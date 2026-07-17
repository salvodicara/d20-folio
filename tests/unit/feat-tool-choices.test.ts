/**
 * Pure-tool feat picker — Crafter (3 Artisan's Tools), Musician (3 Musical
 * Instruments), and any future feat declaring choice-tool-proficiency with
 * a constrained options[] pool.
 */
import { describe, expect, it } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import {
  pendingToolSlotsForFeat,
  isToolPicksComplete,
  applyToolPicks,
} from "@/lib/feat-tool-choices";
import { FEATS_BY_ID } from "@/data/feats";
import type { Grant } from "@/lib/grants";

/**
 * An inline choice-tool-proficiency source — the GENERIC constrained-pool
 * mechanic, independent of any particular feat datum (the Crafter/Musician
 * pool facts are pinned pack-side in feat-tool-choices.pack.test.ts).
 */
const TOOL_CHOICE_FEAT: { grants: ReadonlyArray<Grant> } = {
  grants: [
    {
      type: "choice-tool-proficiency",
      amount: 3,
      options: ["smiths-tools", "cobblers-tools", "cooks-utensils", "lute"],
    },
  ],
};
import type { CharacterData } from "@/types/character";

function baseCharacter(
  overrides: Partial<CharacterData> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {}
): CharacterData {
  return {
    name: assertNonEmptyString("Test"),
    quote: "",
    race: asRaceId(""),
    classes: [{ classId: "fighter", level: 1 }],
    background: "",
    alignment: asAlignmentId(""),
    playerName: "",
    speed: "30",
    ac: 10,
    armorNote: "",
    hp: { max: 10 },
    hitDieType: 10,
    languageIds: [],
    customLanguages: [],
    toolProficiencyIds: [],
    customToolProficiencies: [],
    abilityBudget: 27,
    proficiencyBonusOverride: null,
    levelUpChecklist: null,
    backgroundAsi: {},
    humanOriginFeat: "",
    bgFeat: "",
    lore: {
      traits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      backstory: "",
      age: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      skin: "",
    },
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    savingThrows: [],
    skills: {},
    spellcasting: null,
    spellSlots: [],
    spells: [],
    weapons: [],
    equipment: [],
    features: [],
    combatAlgorithm: [],
    customConditions: [],
    sidebar: [],
    ...foldLegacyClass(overrides, "fighter"),
  };
}

describe("pendingToolSlotsForFeat", () => {
  it("a choice-tool-proficiency grant → 1 slot with its amount and CONSTRAINED pool", () => {
    const slots = pendingToolSlotsForFeat(TOOL_CHOICE_FEAT);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.amount).toBe(3);
    // The slot exposes exactly the grant's constrained pool — never widened.
    expect(slots[0]?.options).toEqual([
      "smiths-tools",
      "cobblers-tools",
      "cooks-utensils",
      "lute",
    ]);
  });

  it("a feat with no tool grants returns []", () => {
    const alert = FEATS_BY_ID.get("alert");
    expect(alert).toBeDefined();
    expect(pendingToolSlotsForFeat(alert ?? {})).toEqual([]);
  });
});

describe("isToolPicksComplete", () => {
  it("rejects under-count", () => {
    const slots = pendingToolSlotsForFeat(TOOL_CHOICE_FEAT);
    expect(slots).toHaveLength(1); // the fixture is not vacuously empty
    expect(isToolPicksComplete(slots, {})).toBe(false);
    expect(
      isToolPicksComplete(slots, { "slot-0": ["smiths-tools", "cobblers-tools"] })
    ).toBe(false);
  });

  it("accepts exact count of 3", () => {
    const slots = pendingToolSlotsForFeat(TOOL_CHOICE_FEAT);
    expect(slots).toHaveLength(1);
    expect(
      isToolPicksComplete(slots, {
        "slot-0": ["smiths-tools", "cobblers-tools", "cooks-utensils"],
      })
    ).toBe(true);
  });
});

describe("applyToolPicks — records STABLE IDS in toolChoices (never free-text)", () => {
  it("records the chosen tool IDS under the slot id in toolChoices", () => {
    const c = baseCharacter();
    const after = applyToolPicks(c, {
      "slot-0": ["smiths-tools", "cobblers-tools", "cooks-utensils"],
    });
    expect(after.toolChoices).toEqual({
      "slot-0": ["smiths-tools", "cobblers-tools", "cooks-utensils"],
    });
    // The MANUAL free-text field is NOT touched — a choice pick is never a baked
    // locale string (golden rules 6 + 7).
    expect(after.toolProficiencyIds).toEqual([]);
  });

  it("the picks ARE already slot→ids — multiple namespaced slots are kept distinct", () => {
    const c = baseCharacter();
    const after = applyToolPicks(c, {
      "class:monk::tool-slot-0": ["smiths-tools"],
      "criminal::tool-slot-0": ["bagpipes"],
    });
    expect(after.toolChoices).toEqual({
      "class:monk::tool-slot-0": ["smiths-tools"],
      "criminal::tool-slot-0": ["bagpipes"],
    });
  });

  it("merges into a prior toolChoices, never the free-text string", () => {
    const c = baseCharacter({ toolChoices: { "slot-0": ["thieves-tools"] } });
    const after = applyToolPicks(c, { "slot-1": ["lute"] });
    expect(after.toolChoices).toEqual({
      "slot-0": ["thieves-tools"],
      "slot-1": ["lute"],
    });
    expect(after.toolProficiencyIds).toEqual([]);
  });

  it("is idempotent — a tool id already recorded in its slot is not duplicated", () => {
    const c = baseCharacter({ toolChoices: { "slot-0": ["lute"] } });
    const after = applyToolPicks(c, { "slot-0": ["lute"] });
    expect(after).toBe(c); // unchanged → SAME reference
  });

  it("returns the original character when picks empty", () => {
    const c = baseCharacter();
    const after = applyToolPicks(c, {});
    expect(after).toBe(c);
  });
});

describe("Skilled uses the unified skill+tool picker (one feat, one entry)", () => {
  it("skilled declares choice-skill-or-tool-proficiency, not choice-tool-proficiency", () => {
    // Skilled uses the unified picker, not the tool-only one.
    const slots = pendingToolSlotsForFeat(FEATS_BY_ID.get("skilled") ?? {});
    expect(slots).toEqual([]);
  });

  it("the skilled-general picker workaround stays deleted (origin feats are ASI-legal)", () => {
    // `skilled-general` existed ONLY because the ASI feat picker excluded Origin
    // feats; the picker now offers them per 2024 RAW, so the duplicate must not
    // come back (golden rule 10 — superseded means deleted completely).
    expect(FEATS_BY_ID.has("skilled-general")).toBe(false);
  });
});
