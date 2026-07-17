/**
 * Batch J — level-table / feature corrections, verified against the
 * consolidated wikidot :main pages.
 */
import { describe, expect, it } from "vitest";
import { getClassTable, classFeatureIndex } from "@/data/classes";
import type { Grant } from "@/lib/grants";

function featuresAt(classId: string, level: number): string[] {
  return getClassTable(classId)?.levels.find((l) => l.level === level)?.featureIds ?? [];
}

describe("Rogue Expertise — granted at L1 AND L6 (2024)", () => {
  it("rogue-expertise is in the L1 feature list", () => {
    expect(featuresAt("rogue", 1)).toContain("rogue-expertise");
  });
  it("rogue-expertise is ALSO granted at L6 (was missing)", () => {
    expect(featuresAt("rogue", 6)).toContain("rogue-expertise");
  });
});

describe("Rogue Slippery Mind — WIS + CHA save proficiency (2024)", () => {
  const feat = classFeatureIndex.get("rogue-slippery-mind");
  it("grants both Wisdom and Charisma save proficiency", () => {
    const saves = (feat?.grants ?? [])
      .filter(
        (g): g is Extract<Grant, { type: "save-proficiency" }> =>
          g.type === "save-proficiency"
      )
      .map((g) => g.ability)
      .sort();
    expect(saves).toEqual(["CHA", "WIS"]);
  });
});

describe("Cleric — Improved Blessed Strikes is L14, Improved Sear Undead is removed", () => {
  it("Improved Blessed Strikes feature is level 14 (was 11)", () => {
    expect(classFeatureIndex.get("cleric-improved-blessed-strikes")?.level).toBe(14);
  });
  it("L11 has no base-class feature; L14 grants Improved Blessed Strikes", () => {
    expect(featuresAt("cleric", 11)).not.toContain("cleric-improved-blessed-strikes");
    expect(featuresAt("cleric", 14)).toContain("cleric-improved-blessed-strikes");
  });
  it("the fabricated Improved Sear Undead no longer exists", () => {
    expect(classFeatureIndex.get("cleric-improved-sear-undead")).toBeUndefined();
    expect(featuresAt("cleric", 14)).not.toContain("cleric-improved-sear-undead");
  });
});
