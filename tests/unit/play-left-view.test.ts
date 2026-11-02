/**
 * The Play screen's left column (approved prototype x-play): «Risorse», every pool the
 * character spends from in the engine's order with what is left of it, and «Abilità»,
 * the six skills worth seeing at a glance (the proficient ones first, the best bonus
 * first) with all 18 behind «Tutte le 18 abilità».
 */
import { describe, expect, it } from "vitest";

import { playLeftView } from "@/domains/play/play-left-view";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { resourcesView } from "@/lib/views/resources-view";
import { makeCharacterDoc } from "./_helpers";

const cleric = makeCharacterDoc({
  classId: "cleric",
  level: 5,
  abilityScores: { STR: 18, DEX: 8, CON: 14, INT: 10, WIS: 16, CHA: 12 },
  skills: {
    insight: "proficient",
    medicine: "expertise",
    religion: "proficient",
    persuasion: "proficient",
  },
});

describe("playLeftView", () => {
  const view = playLeftView(cleric, "it");

  it("lists every pool in the engine's order, with what is left and the most it holds", () => {
    const pools = resourcesView(cleric, "it");
    expect(view.resources.map((r) => r.id)).toEqual(pools.map((p) => p.id));
    for (const r of view.resources) expect(r.left).toBeLessThanOrEqual(r.max);
  });

  it("the six skills at a glance: proficient first, best bonus first", () => {
    const rows = deriveSavesAndChecks(cleric.character, cleric.session).skills;
    const proficient = rows.filter(
      (s) => s.proficiency === "proficient" || s.proficiency === "expertise"
    );
    expect(view.topSkills).toHaveLength(6);
    expect(
      view.topSkills
        .slice(0, proficient.length)
        .map((s) => s.id)
        .sort()
    ).toEqual(proficient.map((s) => s.id).sort());
    expect(proficient).toHaveLength(4);
    const bonuses = view.topSkills.slice(0, proficient.length).map((s) => s.bonus);
    expect(bonuses).toEqual([...bonuses].sort((a, b) => b - a));
  });

  it("all 18 skills stay one tap away", () => {
    expect(view.allSkills).toHaveLength(18);
  });
});
