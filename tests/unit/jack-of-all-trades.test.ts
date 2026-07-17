/**
 * Jack of All Trades (Bard L2+) — DERIVED, never baked (#57).
 *
 * The `bard-jack-of-all-trades` feature emits a `half-proficiency-all-skills`
 * grant. `evaluateGrants` ORs it into the `halfProficiencyAllSkills` aggregate
 * flag; the skill consumer (`mergeSkillProficiencies`) fills `halfProficiency`
 * for every otherwise-unproficient skill AT RENDER. Nothing is stored on the
 * character — so the half-proficiency appears the instant the feature is present
 * and disappears the instant it is removed (level-down past L2 / feat swap),
 * with no stale baked state to clean up.
 *
 * This pins the WHOLE derived seam: feature grant → aggregate flag → merge.
 */
import { describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { mergeSkillProficiencies } from "@/lib/views/sheet-view";
import { ALL_SKILLS } from "@/lib/skills";
import { makeCharacterDoc } from "./_helpers";

const JOAT = { srdId: "bard-jack-of-all-trades" } as const;

/** End-to-end effective skill map for a character (aggregate → merge). */
function effectiveSkills(doc: ReturnType<typeof makeCharacterDoc>) {
  const agg = aggregateCharacterGrants(doc.character, {
    activeFeatures: [],
    grantBundleChoices: {},
  });
  return mergeSkillProficiencies(
    doc.character.skills,
    agg.skillProficiencies,
    agg.expertiseSkills,
    agg.halfProficiencyAllSkills
  );
}

describe("Jack of All Trades — derived half-proficiency", () => {
  it("the feature sets the halfProficiencyAllSkills aggregate flag", () => {
    const doc = makeCharacterDoc({ classId: "bard", level: 2 });
    doc.character.features = [JOAT];
    const agg = aggregateCharacterGrants(doc.character, {
      activeFeatures: [],
      grantBundleChoices: {},
    });
    expect(agg.halfProficiencyAllSkills).toBe(true);
  });

  it("a Bard with JoaT derives halfProficiency on every unproficient skill", () => {
    const doc = makeCharacterDoc({ classId: "bard", level: 2 });
    doc.character.features = [JOAT];
    doc.character.skills = { persuasion: "proficient" };
    const skills = effectiveSkills(doc);
    expect(skills.persuasion).toBe("proficient"); // real proficiency unchanged
    // Every one of the 18 skills resolves to AT LEAST half (none is empty), and
    // every skill that isn't a real proficiency/expertise reads halfProficiency.
    for (const s of ALL_SKILLS) {
      const v = skills[s.id];
      expect(v).toBeDefined();
      if (v !== "proficient" && v !== "expertise") {
        expect(v).toBe("halfProficiency");
      }
    }
  });

  it("never downgrades an own expertise / proficient to half", () => {
    const doc = makeCharacterDoc({ classId: "bard", level: 5 });
    doc.character.features = [JOAT];
    doc.character.skills = { acrobatics: "expertise", persuasion: "proficient" };
    const skills = effectiveSkills(doc);
    expect(skills.acrobatics).toBe("expertise");
    expect(skills.persuasion).toBe("proficient");
  });

  it("nothing is baked into stored skills — the doc stays choices-only", () => {
    const doc = makeCharacterDoc({ classId: "bard", level: 2 });
    doc.character.features = [JOAT];
    doc.character.skills = { persuasion: "proficient" };
    // The stored map is untouched by derivation (no halfProficiency baked in).
    expect(Object.values(doc.character.skills)).not.toContain("halfProficiency");
    expect(doc.character.skills).toEqual({ persuasion: "proficient" });
  });

  it("REMOVAL: drop the JoaT feature → the half-proficiency disappears", () => {
    const doc = makeCharacterDoc({ classId: "bard", level: 2 });
    doc.character.skills = { persuasion: "proficient" };

    // Without JoaT — find a skill that is genuinely unproficient (no grant).
    doc.character.features = [];
    const withoutJoaT = effectiveSkills(doc);
    const unprofSkill = ALL_SKILLS.find((s) => withoutJoaT[s.id] === undefined)?.id;
    expect(unprofSkill).toBeDefined();
    const skillId = unprofSkill as string;

    // With JoaT present, that skill reads half (DERIVED from the feature).
    doc.character.features = [JOAT];
    expect(effectiveSkills(doc)[skillId]).toBe("halfProficiency");

    // Remove the feature (level-down past L2 / feat swap) — the source is gone, so
    // the derived half is gone too. No stale baked state lingers.
    doc.character.features = [];
    const after = effectiveSkills(doc);
    expect(after[skillId]).toBeUndefined();
    expect(after.persuasion).toBe("proficient"); // real choice survives
  });

  it("non-Bards (no JoaT feature) get no half-proficiency", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
    doc.character.features = [];
    doc.character.skills = { athletics: "proficient" };
    const skills = effectiveSkills(doc);
    expect(skills.athletics).toBe("proficient");
    // No skill is half — JoaT is the only source of half-proficiency.
    expect(Object.values(skills)).not.toContain("halfProficiency");
  });
});
