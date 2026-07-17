/**
 * Tests for character creation wizard helpers.
 * skillNameToId: converts Title Case / kebab skill names → canonical ID, null for non-skills.
 * bgSkillIds / classSkillPool computation: filters non-skill entries from background/class data.
 */

import { describe, it, expect } from "vitest";
import { skillNameToId, ALL_SKILLS } from "@/lib/compute";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { classTables } from "@/data/classes";
import type { SrdBackgroundData, SrdClassTable } from "@/data/types";

// ─── helpers ──────────────────────────────────────────────────────────────────

function findBg(id: string): SrdBackgroundData {
  const found = SRD_BACKGROUNDS.find((b) => b.id === id);
  if (!found) throw new Error(`Background '${id}' not found`);
  return found;
}

function findClass(id: string): SrdClassTable {
  const found = classTables.find((c) => c.id === id);
  if (!found) throw new Error(`Class '${id}' not found`);
  return found;
}

function skillIds(names: string[]): string[] {
  return names.map(skillNameToId).filter((id): id is string => id !== null);
}

// ─── skillNameToId ─────────────────────────────────────────────────────────────

describe("skillNameToId", () => {
  it("converts Title Case skill names to kebab IDs", () => {
    expect(skillNameToId("Athletics")).toBe("athletics");
    expect(skillNameToId("Animal Handling")).toBe("animal-handling");
    expect(skillNameToId("Sleight of Hand")).toBe("sleight-of-hand");
    expect(skillNameToId("Arcana")).toBe("arcana");
    expect(skillNameToId("Insight")).toBe("insight");
  });

  it("accepts already-kebab IDs unchanged", () => {
    expect(skillNameToId("athletics")).toBe("athletics");
    expect(skillNameToId("animal-handling")).toBe("animal-handling");
    expect(skillNameToId("sleight-of-hand")).toBe("sleight-of-hand");
  });

  it("returns null for tool proficiencies (not skills)", () => {
    expect(skillNameToId("Thieves' Tools")).toBeNull();
    expect(skillNameToId("Smith's Tools")).toBeNull();
    expect(skillNameToId("Navigator's Tools")).toBeNull();
    expect(skillNameToId("Herbalism Kit")).toBeNull();
    expect(skillNameToId("Disguise Kit")).toBeNull();
    expect(skillNameToId("Gaming Set")).toBeNull();
  });

  it("returns null for empty/unknown strings", () => {
    expect(skillNameToId("")).toBeNull();
    expect(skillNameToId("Flying")).toBeNull();
    expect(skillNameToId("Climbing")).toBeNull();
  });

  it("covers all 18 SRD skills", () => {
    const skillNames = [
      "Acrobatics",
      "Animal Handling",
      "Arcana",
      "Athletics",
      "Deception",
      "History",
      "Insight",
      "Intimidation",
      "Investigation",
      "Medicine",
      "Nature",
      "Perception",
      "Performance",
      "Persuasion",
      "Religion",
      "Sleight of Hand",
      "Stealth",
      "Survival",
    ];
    for (const name of skillNames) {
      expect(
        skillNameToId(name),
        `Expected ${name} to map to a valid skill`
      ).not.toBeNull();
    }
  });

  it("strips apostrophes when normalizing", () => {
    // Apostrophe stripped → "thieves-tools" — not a real skill → null
    expect(skillNameToId("Thieves' Tools")).toBeNull();
    // No apostrophe, just space
    expect(skillNameToId("Sleight of Hand")).toBe("sleight-of-hand");
  });
});

// ─── bgSkillIds computation (mirrors create.tsx useMemo) ─────────────────────

describe("background skill filtering", () => {
  it("produces only valid skill IDs (no tools) for every SRD background", () => {
    for (const bg of SRD_BACKGROUNDS) {
      const ids = skillIds(bg.skillProficiencies);
      for (const id of ids) {
        expect(
          ALL_SKILLS.some((s) => s.id === id),
          `'${id}' not in ALL_SKILLS (from bg '${bg.id}')`
        ).toBe(true);
      }
    }
  });

  it("Criminal/Spy background grants Sleight of Hand and Stealth (and Thieves' Tools is filtered out)", () => {
    const bg = findBg("criminal");
    const ids = skillIds(bg.skillProficiencies);
    expect(ids).toContain("sleight-of-hand");
    expect(ids).toContain("stealth");
    // Thieves' Tools is a tool, not a skill — must NOT appear
    expect(ids).not.toContain("thieves-tools");
  });

  it("Acolyte background grants Insight and Religion", () => {
    const bg = findBg("acolyte");
    const ids = skillIds(bg.skillProficiencies);
    expect(ids).toContain("insight");
    expect(ids).toContain("religion");
  });
});

// ─── classSkillPool computation (mirrors create.tsx useMemo) ─────────────────

describe("class skill pool filtering", () => {
  it("produces only valid skill IDs for every class table", () => {
    for (const ct of classTables) {
      const pool = skillIds(ct.skillChoices.from);
      for (const id of pool) {
        expect(
          ALL_SKILLS.some((s) => s.id === id),
          `'${id}' not in ALL_SKILLS (from class '${ct.id}')`
        ).toBe(true);
      }
    }
  });

  it("Rogue gets 4 skill choices from a pool of at least 6", () => {
    const rogue = findClass("rogue");
    expect(rogue.skillChoices.count).toBe(4);
    const pool = skillIds(rogue.skillChoices.from);
    expect(pool.length).toBeGreaterThanOrEqual(6);
  });

  it("Fighter gets 2 skill choices", () => {
    const fighter = findClass("fighter");
    expect(fighter.skillChoices.count).toBe(2);
  });

  it("Bard gets 3 skill choices from all 18 skills", () => {
    const bard = findClass("bard");
    expect(bard.skillChoices.count).toBe(3);
    const pool = skillIds(bard.skillChoices.from);
    expect(pool.length).toBe(18);
  });
});

// ─── toggleClassSkill logic ───────────────────────────────────────────────────

describe("toggleClassSkill logic", () => {
  /**
   * Pure re-implementation of the toggle logic from create.tsx for unit testing.
   */
  function applyToggle(
    prev: string[],
    id: string,
    bgSkillIds: string[],
    classSkillCount: number
  ): string[] {
    if (bgSkillIds.includes(id)) return prev;
    if (prev.includes(id)) return prev.filter((s) => s !== id);
    if (prev.length >= classSkillCount) return prev;
    return [...prev, id];
  }

  it("does nothing when toggling a background skill", () => {
    expect(applyToggle(["athletics"], "insight", ["insight"], 2)).toEqual(["athletics"]);
  });

  it("adds a skill when under the cap", () => {
    expect(applyToggle([], "athletics", [], 2)).toEqual(["athletics"]);
    expect(applyToggle(["athletics"], "stealth", [], 2)).toEqual([
      "athletics",
      "stealth",
    ]);
  });

  it("removes a skill when already selected", () => {
    expect(applyToggle(["athletics", "stealth"], "athletics", [], 2)).toEqual([
      "stealth",
    ]);
  });

  it("does not add beyond the cap", () => {
    const result = applyToggle(["athletics", "stealth"], "arcana", [], 2);
    expect(result).toEqual(["athletics", "stealth"]);
    expect(result.length).toBe(2);
  });
});
