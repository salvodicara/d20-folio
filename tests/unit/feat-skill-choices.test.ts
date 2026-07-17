/**
 * Skill-only feat picker — Skill Expert (any skill) and Purple Dragon
 * Rook (Insight / Performance / Persuasion).
 */
import { describe, expect, it } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import {
  pendingSkillSlotsForFeat,
  isSkillPicksComplete,
  applySkillPicks,
  listAvailableForSkillSlot,
} from "@/lib/feat-skill-choices";
import { applyExpertisePicks, listExpertiseEligibleSkills } from "@/lib/expertise-pick";
import { FEATS_BY_ID } from "@/data/feats";
import type { Grant } from "@/lib/grants";
import type { CharacterData } from "@/types/character";

/**
 * Inline choice-skill-proficiency sources — the GENERIC picker mechanics,
 * independent of any particular feat datum (the Purple Dragon Rook /
 * Skill Expert slot facts are pinned pack-side in
 * feat-skill-choices.pack.test.ts).
 */
const RESTRICTED_SKILL_FEAT: { grants: ReadonlyArray<Grant> } = {
  grants: [
    {
      type: "choice-skill-proficiency",
      amount: 1,
      options: ["insight", "performance", "persuasion"],
    },
  ],
};
const ANY_SKILL_FEAT: { grants: ReadonlyArray<Grant> } = {
  grants: [{ type: "choice-skill-proficiency", amount: 1, options: [] }],
};

function baseChar(
  overrides: Partial<CharacterData> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {}
): CharacterData {
  return {
    name: assertNonEmptyString("T"),
    quote: "",
    race: asRaceId(""),
    classes: [{ classId: "fighter", level: 4 }],
    background: "",
    alignment: asAlignmentId(""),
    playerName: "",
    speed: "30",
    ac: 10,
    armorNote: "",
    hp: { max: 40 },
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
    abilityScores: { STR: 12, DEX: 12, CON: 12, INT: 12, WIS: 12, CHA: 12 },
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

describe("pendingSkillSlotsForFeat", () => {
  it("a restricted grant → 1 slot of amount 1 with its constrained options", () => {
    const slots = pendingSkillSlotsForFeat(RESTRICTED_SKILL_FEAT);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.amount).toBe(1);
    expect([...(slots[0]?.options ?? [])].sort()).toEqual(
      ["insight", "performance", "persuasion"].sort()
    );
  });

  it("an unrestricted grant → 1 slot of amount 1, options empty (any skill)", () => {
    const slots = pendingSkillSlotsForFeat(ANY_SKILL_FEAT);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.amount).toBe(1);
    expect(slots[0]?.options).toEqual([]);
  });

  it("a feat without skill-prof grants returns []", () => {
    const alert = FEATS_BY_ID.get("alert");
    expect(alert).toBeDefined();
    expect(pendingSkillSlotsForFeat(alert ?? {})).toEqual([]);
  });
});

describe("listAvailableForSkillSlot", () => {
  it("restricted options list — returns only those", () => {
    const slot = pendingSkillSlotsForFeat(RESTRICTED_SKILL_FEAT)[0];
    if (!slot) throw new Error("expected slot");
    const ids = listAvailableForSkillSlot(slot)
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(["insight", "performance", "persuasion"]);
  });

  it("empty options list — returns all 18 standard skills", () => {
    const slot = pendingSkillSlotsForFeat(ANY_SKILL_FEAT)[0];
    if (!slot) throw new Error("expected slot");
    const ids = listAvailableForSkillSlot(slot).map((s) => s.id);
    expect(ids).toContain("acrobatics");
    expect(ids).toContain("perception");
    expect(ids).toContain("persuasion");
    expect(ids.length).toBeGreaterThanOrEqual(18);
  });
});

describe("isSkillPicksComplete", () => {
  it("rejects empty picks", () => {
    const slots = pendingSkillSlotsForFeat(RESTRICTED_SKILL_FEAT);
    expect(slots).toHaveLength(1); // the fixture is not vacuously empty
    expect(isSkillPicksComplete(slots, {})).toBe(false);
  });

  it("accepts exact count", () => {
    const slots = pendingSkillSlotsForFeat(RESTRICTED_SKILL_FEAT);
    expect(isSkillPicksComplete(slots, { "slot-0": ["persuasion"] })).toBe(true);
  });
});

describe("applySkillPicks", () => {
  it("lands picks as 'proficient'", () => {
    const c = baseChar();
    const after = applySkillPicks(c, { "slot-0": ["persuasion"] });
    expect(after.skills.persuasion).toBe("proficient");
  });

  it("does not downgrade existing 'expertise'", () => {
    const c = baseChar({ skills: { persuasion: "expertise" } });
    const after = applySkillPicks(c, { "slot-0": ["persuasion"] });
    expect(after.skills.persuasion).toBe("expertise");
  });

  it("is idempotent — already-proficient skill stays proficient", () => {
    const c = baseChar({ skills: { persuasion: "proficient" } });
    const after = applySkillPicks(c, { "slot-0": ["persuasion"] });
    expect(after.skills.persuasion).toBe("proficient");
    expect(after).toBe(c); // no churn
  });

  it("returns the original character when picks empty", () => {
    const c = baseChar();
    const after = applySkillPicks(c, {});
    expect(after).toBe(c);
  });

  it("upgrades a Jack-of-All-Trades halfProficiency to proficient", () => {
    const c = baseChar({ skills: { persuasion: "halfProficiency" } });
    const after = applySkillPicks(c, { "slot-0": ["persuasion"] });
    expect(after.skills.persuasion).toBe("proficient");
    expect(after).not.toBe(c); // an upgrade actually happened
  });

  it("regression: JoaT Bard → Skill Expert → Expertise reaches the chosen skill", () => {
    // JoaT half-proficiency is DERIVED at render (#57) — stored `skills` holds
    // ONLY real proficiency choices, so a JoaT Bard's Investigation is UNSET in
    // storage (the half shows at render). The Skill Expert pick lands it as a
    // real `proficient` choice — no half-proficiency blocks the grant (#66).
    const bard = baseChar({
      classes: [{ classId: "bard", level: 5 }],
      skills: {},
      features: [{ srdId: "bard-jack-of-all-trades" }],
    });
    const afterFeat = applySkillPicks(bard, { "slot-0": ["investigation"] });
    expect(afterFeat.skills.investigation).toBe("proficient");

    // A later expertise pick (e.g. Bard L9) can now promote it to Expertise.
    expect(listExpertiseEligibleSkills(afterFeat.skills)).toContain("investigation");
    const afterExpertise = {
      ...afterFeat,
      skills: applyExpertisePicks(afterFeat.skills, ["investigation"]),
    };
    expect(afterExpertise.skills.investigation).toBe("expertise");
  });

  it("regression #66: a fixed skill pick upgrades a baked half-proficiency", () => {
    // Defensive: even if a not-yet-migrated doc still carries a baked
    // `halfProficiency`, the ONE grant rule (`grantSkillProficiency`) upgrades it
    // to full `proficient` — half never blocks or wins over a real proficiency.
    const c = baseChar({ skills: { investigation: "halfProficiency" } });
    const after = applySkillPicks(c, { "slot-0": ["investigation"] });
    expect(after.skills.investigation).toBe("proficient");
  });
});
