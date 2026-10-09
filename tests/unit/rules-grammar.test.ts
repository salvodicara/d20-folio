import { describe, expect, it } from "vitest";

import { evaluateGrants, type GrantSource } from "@/lib/grants";
import {
  compileGrant,
  foldRules,
  ruleFlag,
  ruleFlagIds,
  ruleNumber,
  ruleTerms,
} from "@/lib/rules";

const source = (id: string, grants: GrantSource["grants"]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

describe("generic rules grammar — senses", () => {
  it("folds each stack by its op and adds the stacks up", () => {
    const values = foldRules([
      { op: "max", target: "sense:darkvision", value: 60, stack: "base" },
      { op: "max", target: "sense:darkvision", value: 120, stack: "base" },
      { op: "add", target: "sense:darkvision", value: 60, stack: "bonus" },
      { op: "add", target: "sense:darkvision", value: 30, stack: "bonus" },
      { op: "flag", target: "trait:air-and-water-breathing" },
    ]);
    expect(ruleNumber(values, "sense:darkvision")).toBe(210);
    expect(ruleNumber(values, "sense:truesight")).toBe(0);
    expect(ruleFlag(values, "trait:air-and-water-breathing")).toBe(true);
  });

  it("gives a species' darkvision plus a bonus through the real evaluator", () => {
    const out = evaluateGrants([
      source("dwarf", [{ type: "darkvision", range: 60 }]),
      source("umbral-sight", [{ type: "darkvision-bonus", amount: 60 }]),
      source("devils-sight", [{ type: "darkvision", range: 120 }]),
    ]);
    expect(out.darkvisionFt).toBe(180);
    expect(ruleNumber(out.values, "sense:darkvision")).toBe(180);
  });

  it("applies a sense only while its state is active", () => {
    const sources = [
      source("form", [
        {
          type: "while-active",
          activeKey: "wild-shape",
          grants: [{ type: "blindsight", range: 30 }],
        },
      ]),
    ];
    expect(evaluateGrants(sources).blindsightFt).toBe(0);
    expect(evaluateGrants(sources, new Set(["wild-shape"])).blindsightFt).toBe(30);
  });

  it("leaves kinds that have not migrated yet to the bespoke evaluator", () => {
    expect(compileGrant({ type: "hp-flat", amount: 5 })).toBeNull();
  });
});

describe("generic rules grammar — movement", () => {
  it("lets a speed tied to walking outrank any fixed number", () => {
    const out = evaluateGrants([
      source("wings", [{ type: "fly-speed", amount: 60 }]),
      source("boots", [{ type: "fly-speed", amount: "equal-to-walking" }]),
      source("swim-a", [{ type: "swim-speed", amount: 30 }]),
      source("swim-b", [{ type: "swim-speed", amount: 40 }]),
    ]);
    expect(out.flySpeed).toBe("equal-to-walking");
    expect(out.swimSpeed).toBe(40);
    expect(out.climbSpeed).toBeNull();
  });

  it("caps at the lowest cap and floors at the highest floor, never below 1×", () => {
    const out = evaluateGrants([
      source("cap-a", [{ type: "speed-cap", maxFt: 20 }]),
      source("cap-b", [{ type: "speed-cap", maxFt: 10 }]),
      source("floor", [{ type: "speed-floor", minFt: 30 }]),
      source("slow", [{ type: "speed-multiplier", factor: 0.5 }]),
    ]);
    expect(out.speedCapFt).toBe(10);
    expect(out.speedFloorFt).toBe(30);
    expect(out.speedMultiplier).toBe(1);
  });

  it("adds a conditional bonus only when its fact holds", () => {
    const { values } = evaluateGrants([
      source("fast-movement", [
        { type: "speed", amount: 10, condition: "no-heavy-armor" },
      ]),
      source("mobile", [{ type: "speed", amount: 10 }]),
      source("ambusher", [{ type: "speed", amount: 10, round1: true }]),
    ]);
    expect(ruleNumber(values, "speed:walk")).toBe(10);
    expect(ruleNumber(values, "speed:walk", ["no-heavy-armor"])).toBe(20);
    expect(ruleNumber(values, "speed:walk", ["no-heavy-armor", "round-1"])).toBe(30);
  });
});

describe("generic rules grammar — proficiencies", () => {
  it("unions proficiencies as flags, in grant order, deduplicated", () => {
    const out = evaluateGrants([
      source("background", [
        { type: "skill-proficiency", skill: "stealth" },
        { type: "language", language: "elvish" },
      ]),
      source("class", [
        { type: "save-proficiency", ability: "DEX" },
        { type: "skill-proficiency", skill: "athletics" },
        { type: "skill-proficiency", skill: "stealth" },
        { type: "expertise", skill: "stealth" },
      ]),
    ]);
    expect([...out.skillProficiencies]).toEqual(["stealth", "athletics"]);
    expect([...out.saveProficiencies]).toEqual(["DEX"]);
    expect([...out.expertiseSkills]).toEqual(["stealth"]);
    expect([...out.languages]).toEqual(["elvish"]);
    expect(ruleFlagIds(out.values, "prof:skill:")).toEqual(["stealth", "athletics"]);
  });
});

describe("generic rules grammar — defenses", () => {
  it("unions damage defenses and keeps source-bound condition immunities apart", () => {
    const out = evaluateGrants([
      source("tiefling", [{ type: "damage-resistance", damageType: "fire" }]),
      source("ring", [
        { type: "damage-resistance", damageType: "fire" },
        { type: "damage-immunity", damageType: "poison" },
        { type: "damage-vulnerability", damageType: "cold" },
      ]),
      source("fey-ancestry", [
        { type: "condition-immunity", condition: "unconscious", sourceId: "sleep" },
      ]),
      source("undead-nature", [{ type: "condition-immunity", condition: "poisoned" }]),
    ]);
    expect([...out.damageResistances]).toEqual(["fire"]);
    expect([...out.damageImmunities]).toEqual(["poison"]);
    expect([...out.damageVulnerabilities]).toEqual(["cold"]);
    expect([...out.conditionImmunities]).toEqual(["poisoned"]);
    expect(out.sourceConditionImmunities).toEqual([
      { condition: "unconscious", sourceId: "sleep" },
    ]);
  });
});

describe("generic rules grammar — derived numbers", () => {
  it("keeps ability terms apart from the numeric sum, in grant order", () => {
    const values = foldRules([
      { op: "add", target: "ac:bonus", value: 1 },
      { op: "add", target: "ac:bonus", value: { ability: "INT", min: 1 } },
      { op: "add", target: "ac:bonus", value: 2 },
      { op: "add", target: "ac:bonus", value: { ability: "WIS" } },
    ]);
    expect(ruleNumber(values, "ac:bonus")).toBe(3);
    expect(ruleTerms(values, "ac:bonus")).toEqual([
      { ability: "INT", min: 1 },
      { ability: "WIS" },
    ]);
    expect(ruleTerms(values, "hp:per-level")).toEqual([]);
  });

  it("sums flat AC bonuses and lists ability-based ones through the real evaluator", () => {
    const out = evaluateGrants([
      source("ring", [{ type: "ac-bonus", amount: 1 }]),
      source("bladesong", [{ type: "ac-bonus", ability: "INT", min: 1 }]),
      source("cloak", [{ type: "ac-bonus", amount: 1 }]),
      source("dwarven-toughness", [{ type: "hp-per-level", amount: 1 }]),
      source("tough", [{ type: "hp-per-level", amount: 2 }]),
    ]);
    expect(out.acBonus).toBe(2);
    expect(out.acBonusAbilities).toEqual([{ ability: "INT", min: 1 }]);
    expect(out.hpPerLevel).toBe(3);
  });

  it("applies the rules baselines: crits on a 20, 3 attunement slots, no extra attack", () => {
    const none = evaluateGrants([]);
    expect(none.critThreshold).toBe(20);
    expect(none.deathSaveCritThreshold).toBe(20);
    expect(none.attunementSlots).toBe(3);
    expect(none.extraAttacks).toBe(0);

    const out = evaluateGrants([
      source("improved-critical", [{ type: "crit-range", threshold: 19 }]),
      source("superior-critical", [{ type: "crit-range", threshold: 18 }]),
      source("odd-item", [
        { type: "crit-range", threshold: 21 },
        { type: "attunement-slots", amount: 2 },
      ]),
      source("artificer", [{ type: "attunement-slots", amount: 5 }]),
      source("extra-attack", [{ type: "extra-attack", count: 1 }]),
      source("devouring-blade", [{ type: "extra-attack", count: 2 }]),
      source("death-ward", [{ type: "death-save-crit-range", threshold: 18 }]),
    ]);
    expect(out.critThreshold).toBe(18);
    expect(out.attunementSlots).toBe(5);
    expect(out.extraAttacks).toBe(2);
    expect(out.deathSaveCritThreshold).toBe(18);
  });

  it("keeps the long-rest and short-rest exhaustion channels apart", () => {
    const out = evaluateGrants([
      source("self-restoration", [{ type: "exhaustion-recovery", amount: 1 }]),
      source("tireless", [
        { type: "exhaustion-recovery", amount: 1, recovery: "short-rest" },
      ]),
      source("other", [
        { type: "exhaustion-recovery", amount: 1, recovery: "long-rest" },
      ]),
    ]);
    expect(out.exhaustionRecoveryBonus).toBe(2);
    expect(out.exhaustionRecoveryShortRest).toBe(1);
  });

  it("raises ability floors to the highest set score", () => {
    const out = evaluateGrants([
      source("gauntlets", [{ type: "ability-score-set", ability: "STR", value: 19 }]),
      source("belt", [{ type: "ability-score-set", ability: "STR", value: 21 }]),
      source("headband", [{ type: "ability-score-set", ability: "INT", value: 19 }]),
    ]);
    expect(out.abilityScoreFloors).toEqual({ STR: 21, INT: 19 });
  });

  it("adds ability-score bonuses only from magic items, with the tightest cap", () => {
    const item = (id: string, grants: GrantSource["grants"]): GrantSource => ({
      ...source(id, grants),
      ref: { kind: "magic-item", key: id },
    });
    const out = evaluateGrants([
      item("ioun-stone", [{ type: "ability-score", ability: "CON", amount: 2, cap: 22 }]),
      item("tome", [{ type: "ability-score", ability: "CON", amount: 2, cap: 20 }]),
      item("manual", [{ type: "ability-score", ability: "STR", amount: 1 }]),
      source("feat-asi", [{ type: "ability-score", ability: "CON", amount: 1 }]),
    ]);
    expect(out.itemAbilityScoreBonus).toEqual({
      STR: 1,
      DEX: 0,
      CON: 4,
      INT: 0,
      WIS: 0,
      CHA: 0,
    });
    expect(out.itemAbilityScoreCap).toEqual({ CON: 20 });
  });
});
