/**
 * «Scelte da completare» asking an owed subclass: once one is picked, what it brings
 * up to the class's level (the level-up's reveal) and the choices its features ask,
 * as the creation and level-up chips (SRD 5.2.1 College of Lore: three skills at
 * Bard 3, two spells at Bard 6). The pick can be saved only when they are answered.
 */
import { describe, expect, it } from "vitest";

import { owedSubclassAsks } from "@/domains/play/owed-subclass-view";
import { toggleChoicePick } from "@/domains/creation/creation-view";
import { buildScenario } from "@/lib/dev-scenarios";
import { EMPTY_CHOICE_PICKS, type ChoicePicks } from "@/lib/feature-choices";

const build = (classId: string, level: number) =>
  buildScenario({
    name: "No subclass",
    raceId: "halfling",
    background: "",
    classId,
    level,
    abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 12, WIS: 12, CHA: 16 },
    skills: { stealth: "proficient", perception: "proficient" },
  });

describe("owedSubclassAsks", () => {
  it("nothing picked: no reveal, nothing to save", () => {
    const asks = owedSubclassAsks(build("rogue", 6), "rogue", null, {}, "en");
    expect(asks.reveal).toBeNull();
    expect(asks.rows).toEqual([]);
    expect(asks.complete).toBe(false);
  });

  it("the Thief at Rogue 6 asks nothing more, and shows its level-3 features", () => {
    const asks = owedSubclassAsks(build("rogue", 6), "rogue", "thief", {}, "en");
    expect(asks.reveal?.features.map((f) => f.name)).toContain("Fast Hands");
    expect(asks.rows).toEqual([]);
    expect(asks.bundles).toEqual([]);
    expect(asks.complete).toBe(true);
  });

  it("the College of Lore at Bard 6 asks its skills and spells, named by the feature", () => {
    const doc = build("bard", 6);
    const first = owedSubclassAsks(doc, "bard", "college-of-lore", {}, "it");
    const skills = first.rows.find((r) => r.kind === "skill");
    expect(skills?.amount).toBe(3);
    expect(skills?.source).toBe("Competenze Bonus");
    // The skills already held are not offered.
    expect(skills?.options.map((o) => o.id)).not.toContain("stealth");
    expect(first.complete).toBe(false);

    let picks: ChoicePicks = EMPTY_CHOICE_PICKS;
    for (const row of first.rows) {
      for (const option of row.options.slice(0, row.amount)) {
        const now = owedSubclassAsks(
          doc,
          "bard",
          "college-of-lore",
          { choicePicks: picks },
          "it"
        ).rows.find((r) => r.slotId === row.slotId);
        if (now) picks = toggleChoicePick(picks, now, option.id);
      }
    }
    expect(
      owedSubclassAsks(doc, "bard", "college-of-lore", { choicePicks: picks }, "it")
        .complete
    ).toBe(true);
  });

  it("Draconic Sorcery at Sorcerer 6 asks Elemental Affinity's damage type", () => {
    const doc = build("sorcerer", 6);
    const asks = owedSubclassAsks(doc, "sorcerer", "draconic-sorcery", {}, "en");
    expect(asks.bundles).toHaveLength(1);
    expect(asks.complete).toBe(false);
    const bundle = asks.bundles[0];
    const answered = owedSubclassAsks(
      doc,
      "sorcerer",
      "draconic-sorcery",
      { bundlePicks: { [bundle?.bundleKey ?? ""]: bundle?.options[0]?.id ?? "" } },
      "en"
    );
    expect(answered.complete).toBe(true);
  });
});
