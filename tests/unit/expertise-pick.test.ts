/**
 * Unit tests for the Skill Expertise picker helpers (M1).
 */

import { describe, it, expect } from "vitest";
import {
  isExpertisePlaceholder,
  listExpertiseEligibleSkills,
  applyExpertisePicks,
  EXPERTISE_PICKS_PER_GRANT,
} from "@/lib/expertise-pick";
import type { CharacterData } from "@/types/character";

describe("isExpertisePlaceholder", () => {
  it("recognises Rogue + Bard expertise feature ids", () => {
    expect(isExpertisePlaceholder("rogue-expertise")).toBe(true);
    expect(isExpertisePlaceholder("bard-expertise")).toBe(true);
  });

  it("rejects unrelated feature ids", () => {
    expect(isExpertisePlaceholder("rogue-sneak-attack")).toBe(false);
    expect(isExpertisePlaceholder("")).toBe(false);
  });
});

describe("EXPERTISE_PICKS_PER_GRANT", () => {
  it("is the 2024 RAW value of 2", () => {
    expect(EXPERTISE_PICKS_PER_GRANT).toBe(2);
  });
});

describe("listExpertiseEligibleSkills", () => {
  const skills: CharacterData["skills"] = {
    acrobatics: "proficient",
    stealth: "proficient",
    perception: "expertise", // already expertise
    insight: "halfProficiency",
    arcana: "proficient",
  };

  it("returns only currently-proficient skills, sorted", () => {
    expect(listExpertiseEligibleSkills(skills)).toEqual([
      "acrobatics",
      "arcana",
      "stealth",
    ]);
  });

  it("ignores expertise and halfProficiency skills", () => {
    expect(listExpertiseEligibleSkills(skills)).not.toContain("perception");
    expect(listExpertiseEligibleSkills(skills)).not.toContain("insight");
  });

  it("returns [] when no skills are proficient", () => {
    expect(listExpertiseEligibleSkills({})).toEqual([]);
    expect(listExpertiseEligibleSkills({ perception: "expertise" })).toEqual([]);
  });
});

describe("applyExpertisePicks", () => {
  const skills: CharacterData["skills"] = {
    acrobatics: "proficient",
    stealth: "proficient",
    perception: "expertise",
  };

  it("upgrades the chosen proficient skills to expertise", () => {
    expect(applyExpertisePicks(skills, ["acrobatics", "stealth"])).toEqual({
      acrobatics: "expertise",
      stealth: "expertise",
      perception: "expertise",
    });
  });

  it("does not mutate the input", () => {
    const snapshot = { ...skills };
    applyExpertisePicks(skills, ["acrobatics"]);
    expect(skills).toEqual(snapshot);
  });

  it("silently skips picks that aren't currently proficient", () => {
    // perception is already expertise; insight isn't in the map at all
    expect(applyExpertisePicks(skills, ["perception", "insight"])).toEqual(skills);
  });

  it("returns the input unchanged when picks is empty", () => {
    expect(applyExpertisePicks(skills, [])).toEqual(skills);
  });
});
