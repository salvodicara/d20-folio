/**
 * The Play screen's left column (approved prototype x-play): «Risorse», every pool the
 * character spends from in the engine's order with what is left of it, and «Abilità»,
 * the six skills worth seeing at a glance (the proficient ones first, the best bonus
 * first) with all 18 behind «Tutte le 18 abilità».
 */
import { describe, expect, it } from "vitest";

import { playLeftView, resourceSpend } from "@/domains/play/play-left-view";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { resourcesView } from "@/lib/views/resources-view";
import { buildDevScenario } from "@/lib/dev-scenarios";
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

// Tapping a pool spends one (prototype x-play «Tocca per spendere»): a spell slot or a
// class resource with something left. Hit Point Dice go through a Short Rest and an
// item's charges through its own roll, so they are not tapped here.
describe("resourceSpend", () => {
  const druid = buildDevScenario("potent-druid");
  if (!druid) throw new Error("the potent-druid scenario is missing");
  const pools = playLeftView(druid, "it").resources;
  const of = (kind: string) => pools.find((r) => r.row.kind === kind);

  it("a spell slot spends one of its level", () => {
    const slot = of("spell-slot");
    if (!slot || slot.row.kind !== "spell-slot") throw new Error("no slot");
    expect(resourceSpend(slot)).toEqual({
      kind: "spend-slot",
      level: slot.row.level,
      pactMagic: false,
    });
  });

  it("a class resource spends one use", () => {
    const pool = of("class-resource");
    if (!pool) throw new Error("no class resource");
    expect(resourceSpend(pool)).toEqual({
      kind: "spend-tracker",
      trackerId: pool.row.id,
      amount: 1,
    });
  });

  it("Hit Point Dice are not tapped", () => {
    const dice = of("hit-dice");
    if (!dice) throw new Error("no hit dice");
    expect(resourceSpend(dice)).toBeNull();
  });

  it("an empty pool is not tapped", () => {
    const slot = of("spell-slot");
    if (!slot) throw new Error("no slot");
    expect(resourceSpend({ ...slot, left: 0 })).toBeNull();
  });
});

describe("a pool a spell slot can refill (Font of Inspiration)", () => {
  // Bard 5: «you can expend a spell slot to regain one expended use of Bardic
  // Inspiration» — the classic rail's «Spend a slot →» button, on the new Play too.
  const bard = (used: number) =>
    makeCharacterDoc(
      {
        classId: "bard",
        level: 5,
        abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
        spellSlots: [
          { level: 1, total: 4 },
          { level: 2, total: 3 },
          { level: 3, total: 2 },
        ],
        features: [
          { srdId: "bard-bardic-inspiration" },
          { srdId: "bard-font-of-inspiration" },
        ],
      },
      { trackers: { "bard-bardic-inspiration": { used } } }
    );
  const inspiration = (used: number) =>
    playLeftView(bard(used), "en").resources.find(
      (r) => r.id === "bard-bardic-inspiration"
    );

  it("offers the refill while a use is spent and a slot is left", () => {
    expect(inspiration(1)?.slotRecover).toBe(true);
  });
  it("not while every use is still there", () => {
    expect(inspiration(0)?.slotRecover).toBeFalsy();
  });
  it("never on a pool no feature lets a slot refill", () => {
    expect(playLeftView(cleric, "en").resources.some((r) => r.slotRecover)).toBe(false);
  });
});
