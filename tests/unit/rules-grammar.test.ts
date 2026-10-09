import { describe, expect, it } from "vitest";

import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { compileGrant, foldRules, ruleFlag, ruleFlagIds, ruleNumber } from "@/lib/rules";

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
    expect(compileGrant({ type: "ac-bonus", amount: 1 })).toBeNull();
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
