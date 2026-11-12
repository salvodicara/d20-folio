/**
 * A dev scenario is a properly built character: it owes no class pick against
 * its level table (invocations, Metamagic, maneuvers, Weapon Mastery, class
 * cantrips), unless its spec says it is meant to owe them (`owesClassPicks`).
 */
import { describe, expect, it } from "vitest";
import { DEV_SCENARIOS, buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { classPickPool, owedClassPicks } from "@/lib/owed-class-picks";
import { owedClassPickRows } from "@/lib/views/owed-class-picks-view";

const WARLOCK_6: ScenarioSpec = {
  name: "Owing Warlock",
  raceId: "human",
  classId: "warlock",
  level: 6,
  background: "acolyte",
  abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
  invocationChoices: ["agonizing-blast"],
  spells: [{ srdId: "eldritch-blast" }],
};

describe("dev scenarios — the class picks the level table gives are filled", () => {
  for (const [key, spec] of Object.entries(DEV_SCENARIOS)) {
    if (spec.owesClassPicks) continue;
    it(`"${key}" owes no class pick`, () => {
      expect(owedClassPicks(buildScenario(spec).character)).toEqual([]);
    });
  }

  it("fills a Warlock 6 with legal picks, keeping the ones the spec names", () => {
    const { character } = buildScenario(WARLOCK_6);
    const warlock = character.classes[0];
    expect(warlock?.invocationChoices).toHaveLength(5);
    expect(warlock?.invocationChoices?.[0]).toBe("agonizing-blast");
    const cantrips = character.spells.filter(
      (s) => !("custom" in s) && s.srdId === "eldritch-blast"
    );
    expect(cantrips).toHaveLength(1);
    expect(owedClassPicks(character)).toEqual([]);
  });

  it("fills a multiclass entry's picks too", () => {
    const { character } = buildScenario({
      ...WARLOCK_6,
      classId: "fighter",
      level: 1,
      invocationChoices: undefined,
      secondaryClasses: [{ classId: "sorcerer", level: 2 }],
    });
    expect(owedClassPicks(character)).toEqual([]);
    expect(character.classes[1]?.metamagicChoices).toHaveLength(2);
  });

  it("a filled Rogue masters weapons it is proficient with, carried ones first", () => {
    const { character } = buildScenario({
      ...WARLOCK_6,
      classId: "rogue",
      level: 1,
      invocationChoices: undefined,
      weapons: [{ srdId: "shortsword", quantity: 1 }],
    });
    const masteries = character.classes[0]?.weaponMasteries ?? [];
    expect(masteries).toHaveLength(2);
    expect(masteries[0]).toBe("shortsword");
    // Rogue: Simple weapons + Martial with Finesse or Light — never a Battleaxe.
    expect(masteries).not.toContain("battleaxe");
  });

  it("a scenario meant to owe its picks keeps owing them", () => {
    const { character } = buildScenario({ ...WARLOCK_6, owesClassPicks: true });
    expect(owedClassPicks(character)).toEqual([
      { classId: "warlock", pick: "invocations", owed: 4 },
      { classId: "warlock", pick: "cantrips", owed: 2 },
    ]);
  });
});

describe("classPickPool — the options «Scelte da completare» offers", () => {
  for (const [key, spec] of Object.entries(DEV_SCENARIOS)) {
    it(`"${key}": the pool is the banner picker's list`, () => {
      const { character } = buildScenario({ ...spec, owesClassPicks: true });
      for (const row of owedClassPickRows(character, "en")) {
        const pool = classPickPool(character, row.classId, row.pick);
        const shown = row.options.map((o) => o.id);
        // A spell picker lists by level and the reader's names (each locale its own
        // order); the pool is the same spells. Other picks keep the pool's order.
        if (row.pick === "cantrips" || row.pick === "spellbook")
          expect([...pool].sort()).toEqual([...shown].sort());
        else expect(pool).toEqual(shown);
      }
    });
  }
});
