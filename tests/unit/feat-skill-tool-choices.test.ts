/**
 * Skilled-style feat picker — covers the new
 * `choice-skill-or-tool-proficiency` grant: pendingSkillOrToolSlotsForFeat
 * surfaces slots, isSkillOrToolPicksComplete gates the wizard, and
 * applySkillOrToolPicks lands the picks on the right character fields — skills in
 * `skills{}`, a chosen TOOL as a STABLE ID in `toolChoices` (the id-based home;
 * the proficiency DERIVES from it, never a baked free-text string).
 *
 * 2024 RAW Skilled: "You gain proficiency in any combination of three
 * skills or tools of your choice." (PHB 2024)
 */
import { describe, expect, it } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import {
  pendingSkillOrToolSlotsForFeat,
  isSkillOrToolPicksComplete,
  applySkillOrToolPicks,
  isSkillId,
  SRD_TOOLS_2024,
  ARTISAN_TOOL_IDS,
} from "@/lib/feat-skill-tool-choices";
import { resolveGrantSourcesForToolChoices } from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import { displayToolProficiencies } from "@/lib/views/sheet-view";
import { FEATS_BY_ID } from "@/data/feats";
import { srd } from "../_harness/loc";
import type { CharacterData } from "@/types/character";

function baseCharacter(): CharacterData {
  return {
    name: assertNonEmptyString("Test"),
    quote: "",
    race: asRaceId("human"),
    classes: [{ classId: "bard", level: 1 }],
    background: "",
    alignment: asAlignmentId(""),
    playerName: "",
    speed: "30",
    ac: 10,
    armorNote: "",
    hp: { max: 8 },
    hitDieType: 8,
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
  };
}

describe("pendingSkillOrToolSlotsForFeat", () => {
  it("Skilled → one slot of amount 3", () => {
    const skilled = FEATS_BY_ID.get("skilled");
    expect(skilled).toBeDefined();
    const slots = pendingSkillOrToolSlotsForFeat(skilled ?? { grants: [] });
    expect(slots).toHaveLength(1);
    expect(slots[0]?.amount).toBe(3);
    expect(slots[0]?.slotId).toBe("slot-0");
  });

  it("a feat without skill-or-tool grants returns []", () => {
    const tough = FEATS_BY_ID.get("tough");
    expect(pendingSkillOrToolSlotsForFeat(tough ?? {})).toEqual([]);
  });
});

describe("isSkillOrToolPicksComplete", () => {
  it("rejects under-count", () => {
    const slots = pendingSkillOrToolSlotsForFeat(FEATS_BY_ID.get("skilled") ?? {});
    expect(isSkillOrToolPicksComplete(slots, {})).toBe(false);
    expect(
      isSkillOrToolPicksComplete(slots, {
        "slot-0": ["acrobatics", "athletics"],
      })
    ).toBe(false);
  });

  it("rejects over-count", () => {
    const slots = pendingSkillOrToolSlotsForFeat(FEATS_BY_ID.get("skilled") ?? {});
    expect(
      isSkillOrToolPicksComplete(slots, {
        "slot-0": ["acrobatics", "athletics", "stealth", "perception"],
      })
    ).toBe(false);
  });

  it("accepts exact count of 3 (mix of skills and tools)", () => {
    const slots = pendingSkillOrToolSlotsForFeat(FEATS_BY_ID.get("skilled") ?? {});
    expect(
      isSkillOrToolPicksComplete(slots, {
        "slot-0": ["acrobatics", "thieves-tools", "lute"],
      })
    ).toBe(true);
  });
});

describe("isSkillId", () => {
  it("recognises standard skills", () => {
    expect(isSkillId("acrobatics")).toBe(true);
    expect(isSkillId("arcana")).toBe(true);
    expect(isSkillId("perception")).toBe(true);
  });

  it("rejects tool ids", () => {
    expect(isSkillId("thieves-tools")).toBe(false);
    expect(isSkillId("lute")).toBe(false);
    expect(isSkillId("alchemists-supplies")).toBe(false);
  });
});

describe("applySkillOrToolPicks", () => {
  it("lands skill picks in character.skills as 'proficient'", () => {
    const c = baseCharacter();
    const after = applySkillOrToolPicks(c, {
      "slot-0": ["acrobatics", "stealth", "perception"],
    });
    expect(after.skills.acrobatics).toBe("proficient");
    expect(after.skills.stealth).toBe("proficient");
    expect(after.skills.perception).toBe("proficient");
  });

  it("does not downgrade an existing 'expertise' skill to 'proficient'", () => {
    const c = {
      ...baseCharacter(),
      skills: { acrobatics: "expertise" as const },
    };
    const after = applySkillOrToolPicks(c, {
      "slot-0": ["acrobatics", "stealth", "perception"],
    });
    expect(after.skills.acrobatics).toBe("expertise");
  });

  it("upgrades a Jack-of-All-Trades 'halfProficiency' skill to 'proficient'", () => {
    const c = {
      ...baseCharacter(),
      skills: { acrobatics: "halfProficiency" as const },
    };
    const after = applySkillOrToolPicks(c, {
      "slot-0": ["acrobatics", "stealth"],
    });
    expect(after.skills.acrobatics).toBe("proficient");
    expect(after.skills.stealth).toBe("proficient");
  });

  it("records tool picks as STABLE IDS in toolChoices, keyed by slot — never free-text", () => {
    const c = baseCharacter();
    const after = applySkillOrToolPicks(c, {
      "slot-0": ["thieves-tools", "lute", "alchemists-supplies"],
    });
    // The id-based home — the SAME `toolChoices` map a pure tool-choice pick uses.
    expect(after.toolChoices?.["slot-0"]).toEqual([
      "thieves-tools",
      "lute",
      "alchemists-supplies",
    ]);
    // The MANUAL free-text field is NOT touched (golden rules 6 + 7).
    expect(after.toolProficiencyIds).toEqual([]);
  });

  it("the recorded tool ids DERIVE + localize the proficiency (EN + IT)", () => {
    const c = baseCharacter();
    const after = applySkillOrToolPicks(c, { "slot-0": ["thieves-tools", "lute"] });
    const agg = evaluateGrants(resolveGrantSourcesForToolChoices(after.toolChoices));
    expect(displayToolProficiencies([], [], agg, "en")).toContain("Thieves' Tools");
    // Official IT SRD 5.2.1 term — "Arnesi da Scasso" (#107).
    expect(displayToolProficiencies([], [], agg, "it")).toContain("Arnesi da Scasso");
  });

  it("merges into a prior toolChoices map, leaving the free-text field empty", () => {
    const c = { ...baseCharacter(), toolChoices: { "slot-9": ["carpenters-tools"] } };
    const after = applySkillOrToolPicks(c, { "slot-0": ["lute"] });
    expect(after.toolChoices).toEqual({
      "slot-9": ["carpenters-tools"],
      "slot-0": ["lute"],
    });
    expect(after.toolProficiencyIds).toEqual([]);
  });

  it("is idempotent — a tool id already recorded in its slot is not duplicated", () => {
    const c = { ...baseCharacter(), toolChoices: { "slot-0": ["lute"] } };
    const after = applySkillOrToolPicks(c, { "slot-0": ["lute"] });
    expect(after).toBe(c); // unchanged → SAME reference
  });

  it("handles mixed skill + tool picks in a single slot (skills→skills, tools→toolChoices)", () => {
    const c = baseCharacter();
    const after = applySkillOrToolPicks(c, {
      "slot-0": ["acrobatics", "thieves-tools", "perception"],
    });
    expect(after.skills.acrobatics).toBe("proficient");
    expect(after.skills.perception).toBe("proficient");
    expect(after.toolChoices?.["slot-0"]).toEqual(["thieves-tools"]);
    expect(after.toolProficiencyIds).toEqual([]);
  });

  it("returns the original character unchanged when no picks", () => {
    const c = baseCharacter();
    const after = applySkillOrToolPicks(c, {});
    expect(after).toBe(c);
  });
});

describe("SRD_TOOLS_2024 catalog", () => {
  it("contains the 2024 SRD tool list; every id resolves a bilingual name from the SINGLE source (equipment catalogue, #107)", () => {
    expect(SRD_TOOLS_2024.length).toBeGreaterThan(20);
    for (const tool of SRD_TOOLS_2024) {
      expect(tool.id).toMatch(/^[a-z][a-z0-9-]*$/);
      // No BiText on the catalogue entry — the name lives ONCE in equipment.json,
      // keyed by this id, and resolves in both locales.
      expect(tool).not.toHaveProperty("name");
      expect(srd("equipment", tool.id, "name", "en")).toBeTruthy();
      expect(srd("equipment", tool.id, "name", "it")).toBeTruthy();
    }
  });

  it("includes Thieves' Tools and at least one musical instrument", () => {
    const ids = SRD_TOOLS_2024.map((t) => t.id);
    expect(ids).toContain("thieves-tools");
    expect(ids).toContain("lute");
  });

  it("has unique ids", () => {
    const ids = SRD_TOOLS_2024.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ── Category is REQUIRED + explicit — no "artisan = the absence of a category"
  //    binary. Every tool carries one of the six known categories; "artisan" is a
  //    first-class tag, never an omission. (Regression for the unmarked-default fix.)
  const VALID_CATEGORIES = new Set([
    "artisan",
    "instrument",
    "gaming",
    "kit",
    "navigator",
    "thieves",
  ]);

  it("tags EVERY tool with an explicit, known category (no uncategorized tool)", () => {
    for (const tool of SRD_TOOLS_2024) {
      // `category` is a required field — a tool can never be silently uncategorized.
      expect(VALID_CATEGORIES.has(tool.category)).toBe(true);
    }
  });

  it("models artisan tools as category 'artisan' — the umbrella included", () => {
    // The 17 concrete crafts + the `artisans-tools` umbrella all carry "artisan"
    // (the umbrella is NOT mis-filed under "kit"); the umbrella is not pickable.
    const artisan = SRD_TOOLS_2024.filter((t) => t.category === "artisan");
    expect(artisan.length).toBe(18); // 17 crafts + 1 umbrella
    const umbrella = SRD_TOOLS_2024.find((t) => t.id === "artisans-tools");
    expect(umbrella?.category).toBe("artisan");
    expect(umbrella?.pickable).toBe(false);
  });

  it("derives ARTISAN_TOOL_IDS from category 'artisan' (the 17 pickable crafts)", () => {
    // The derived list is exactly the pickable artisan tools — the umbrella excluded.
    expect(ARTISAN_TOOL_IDS).toHaveLength(17);
    expect(ARTISAN_TOOL_IDS).not.toContain("artisans-tools");
    for (const id of ARTISAN_TOOL_IDS) {
      const tool = SRD_TOOLS_2024.find((t) => t.id === id);
      expect(tool?.category).toBe("artisan");
      expect(tool?.pickable).not.toBe(false);
    }
  });
});
