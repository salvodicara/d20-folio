vi.mock("firebase/firestore", () => ({}));
import { describe, expect, it, vi } from "vitest";
import { QUICKBUILD_PRESETS, type QuickbuildPreset } from "@/data/quickbuild";
import { verifyCatalogueSnapshot } from "@/lib/character-creation/catalogue";
import { newCreationDraft, parseCreationDraft } from "@/lib/character-creation/model";
import { applyRecommendedBuild } from "@/lib/character-creation/recommended";

function named() {
  const draft = newCreationDraft("owner", "new-character");
  draft.name = "Example";
  return draft;
}
function answers(result: ReturnType<typeof applyRecommendedBuild>, role: "class") {
  const key = result.draft.sources[role];
  if (!key) throw new Error("missing-test-source");
  return result.draft.selections[key]?.answers ?? {};
}

/**
 * Pack presets the P10 seam cannot satisfy id for id. The build still lands valid;
 * only `unmatched` reports the drift, pinned below so a preset fix retires the skip.
 */
const SEAM_LIMITED: Readonly<Record<string, { unmatched: string[]; reason: string }>> = {
  artificer: {
    unmatched: ["tinkers-tools"],
    reason:
      "the preset names tinkers-tools for the Artisan tool and for the spellcasting focus, " +
      "but the class grants tinkers-tools proficiency at level 1 and both slots are " +
      "proficiency pools that offer only new proficiencies (resolveCreationPool)",
  },
};
const classIds = Object.keys(QUICKBUILD_PRESETS);

describe("recommended build through the guided-creation seam", () => {
  it.each(classIds)("lands a valid %s build", (classId) => {
    const result = applyRecommendedBuild(named(), classId);
    expect(result.preview.issues, classId).toEqual([]);
    expect(result.preview.valid, classId).toBe(true);
  });
  for (const classId of classIds) {
    const limit = SEAM_LIMITED[classId];
    if (limit) {
      it.skip(`lands every ${classId} preset id (seam limit: ${limit.reason})`, () => {
        expect(applyRecommendedBuild(named(), classId).unmatched).toEqual([]);
      });
      it(`reports the documented ${classId} preset drift`, () => {
        expect(applyRecommendedBuild(named(), classId).unmatched).toEqual(
          limit.unmatched
        );
      });
    } else
      it(`lands every ${classId} preset id`, () => {
        expect(applyRecommendedBuild(named(), classId).unmatched).toEqual([]);
      });
  }
  it("lands the Fighter preset skills in the class skill answer", () => {
    const preset = QUICKBUILD_PRESETS.fighter;
    if (!preset) throw new Error("missing-test-preset");
    const result = applyRecommendedBuild(named(), "fighter");
    expect(answers(result, "class")["root/starting/skills"]).toEqual([
      ...preset.classSkills,
    ]);
    expect(result.draft.method).toBe("standard");
    expect(result.draft.scores).toEqual({
      strength: 15,
      constitution: 14,
      dexterity: 13,
      wisdom: 12,
      charisma: 10,
      intelligence: 8,
    });
    expect(result.draft.languages).toEqual([...preset.languages]);
  });
  it("lands the Wizard cantrips and spells", () => {
    const preset = QUICKBUILD_PRESETS.wizard;
    if (!preset?.cantrips || !preset.spells) throw new Error("missing-test-preset");
    const result = applyRecommendedBuild(named(), "wizard");
    const classAnswers = answers(result, "class");
    expect(classAnswers["root/progression/level-1/cantrips"]).toEqual([
      ...preset.cantrips,
    ]);
    expect(classAnswers["root/progression/level-1/prepared"]).toEqual([...preset.spells]);
    for (const id of preset.spells)
      expect(classAnswers["root/progression/level-1/spellbook"]).toContain(id);
  });
  it("reports a preset id the pool does not contain while still completing", () => {
    const base = QUICKBUILD_PRESETS.fighter;
    if (!base) throw new Error("missing-test-preset");
    const preset: QuickbuildPreset = {
      ...base,
      classSkills: ["perception", "bogus-skill"],
    };
    const result = applyRecommendedBuild(named(), "fighter", preset);
    expect(result.unmatched).toEqual(["bogus-skill"]);
    expect(result.preview.valid).toBe(true);
    expect(answers(result, "class")["root/starting/skills"]).toContain("perception");
  });
  it("throws for a class without a preset", () => {
    expect(() => applyRecommendedBuild(named(), "not-a-class")).toThrow(
      "recommended-build-unknown-class"
    );
  });
  it("round-trips the result draft through the draft parser", () => {
    const { draft } = applyRecommendedBuild(named(), "cleric");
    expect(() =>
      parseCreationDraft(
        JSON.parse(JSON.stringify(draft)),
        "owner",
        verifyCatalogueSnapshot
      )
    ).not.toThrow();
  });
  it("never mutates the input draft", () => {
    const input = named();
    const witness = structuredClone(input);
    applyRecommendedBuild(input, "rogue");
    expect(input).toEqual(witness);
  });
});
