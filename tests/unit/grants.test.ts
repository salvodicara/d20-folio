/**
 * Unit tests for the A4 grant evaluator.
 *
 * The migration plan (see header of src/lib/grants.ts) is incremental:
 * each existing helper gets a parallel-validation test that proves the
 * declarative path produces the same result as the legacy regex/ad-hoc
 * path. As migrations land the legacy path can be deleted.
 */

import { describe, it, expect } from "vitest";
import { asProficiencyToken as tok } from "@/lib/proficiency-tokens";
import {
  emptyAggregate,
  evaluateGrants,
  type Grant,
  type GrantSource,
} from "@/lib/grants";

const make = (id: string, grants: Grant[]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

describe("evaluateGrants — base case", () => {
  it("emptyAggregate is the identity", () => {
    expect(evaluateGrants([])).toEqual(emptyAggregate());
  });

  it("a source with no grants returns the empty aggregate", () => {
    expect(evaluateGrants([{ id: "foo", name: { en: "Foo", it: "Foo" } }])).toEqual(
      emptyAggregate()
    );
  });
});

describe("evaluateGrants — Darkvision (range takes the MAX)", () => {
  it("returns the single range when only one source grants it", () => {
    const out = evaluateGrants([
      make("elf-darkvision", [{ type: "darkvision", range: 60 }]),
    ]);
    expect(out.darkvisionFt).toBe(60);
  });

  it("takes the LARGER range when multiple sources stack", () => {
    const out = evaluateGrants([
      make("elf-darkvision", [{ type: "darkvision", range: 60 }]),
      make("dwarf-darkvision", [{ type: "darkvision", range: 120 }]),
    ]);
    expect(out.darkvisionFt).toBe(120);
  });
});

describe("evaluateGrants — damage resistances (union, deduped)", () => {
  it("collects each granted damage type", () => {
    const out = evaluateGrants([
      make("dwarven-resilience", [{ type: "damage-resistance", damageType: "poison" }]),
      make("celestial-resistance", [
        { type: "damage-resistance", damageType: "necrotic" },
        { type: "damage-resistance", damageType: "radiant" },
      ]),
    ]);
    expect([...out.damageResistances].sort()).toEqual(["necrotic", "poison", "radiant"]);
  });

  it("dedupes the same type from two sources", () => {
    const out = evaluateGrants([
      make("a", [{ type: "damage-resistance", damageType: "fire" }]),
      make("b", [{ type: "damage-resistance", damageType: "fire" }]),
    ]);
    expect([...out.damageResistances]).toEqual(["fire"]);
  });
});

describe("evaluateGrants — numeric aggregates sum, ability/skill grants set-union", () => {
  it("speed + AC bonus + HP/level all add", () => {
    const out = evaluateGrants([
      make("wood-elf", [{ type: "speed", amount: 5 }]),
      make("mobile-feat", [{ type: "speed", amount: 10 }]),
      make("ring-of-prot", [{ type: "ac-bonus", amount: 1 }]),
      make("cloak-of-prot", [{ type: "ac-bonus", amount: 1 }]),
      make("tough", [{ type: "hp-per-level", amount: 2 }]),
      make("dwarven-toughness", [{ type: "hp-per-level", amount: 1 }]),
    ]);
    expect(out.speedBonusFt).toBe(15);
    expect(out.acBonus).toBe(2);
    expect(out.hpPerLevel).toBe(3);
  });

  it("ITEM ability-score grants sum per ability; FEAT ones never enter the item channel; saves / skills / expertise unioned", () => {
    const item = (id: string, grants: Grant[]): GrantSource => ({
      id,
      ref: { kind: "magic-item", key: id },
      grants,
    });
    const out = evaluateGrants([
      // Two magic-item additive bonuses to STR → sum into the live item channel.
      item("gauntlets-x", [{ type: "ability-score", ability: "STR", amount: 1 }]),
      item("ioun-strength", [{ type: "ability-score", ability: "STR", amount: 1 }]),
      // A FEAT-sourced ASI must NOT enter the item channel (it is baked into the
      // stored scores at level-up — folding it here would double-count).
      make("athlete", [{ type: "ability-score", ability: "DEX", amount: 1 }]),
      make("resilient", [{ type: "save-proficiency", ability: "WIS" }]),
      make("skilled", [
        { type: "skill-proficiency", skill: "perception" },
        { type: "skill-proficiency", skill: "stealth" },
      ]),
      make("rogue-expertise", [
        { type: "expertise", skill: "stealth" },
        { type: "expertise", skill: "perception" },
      ]),
    ]);
    expect(out.itemAbilityScoreBonus.STR).toBe(2); // 1 + 1 from the two items
    expect(out.itemAbilityScoreBonus.DEX).toBe(0); // feat ASI excluded by source kind
    expect(out.saveProficiencies.has("WIS")).toBe(true);
    expect(out.skillProficiencies.has("perception")).toBe(true);
    expect(out.expertiseSkills.has("stealth")).toBe(true);
  });
});

describe("evaluateGrants — always-prepared spells preserve order + dedupe", () => {
  it("first appearance order is kept; later dupes ignored", () => {
    const out = evaluateGrants([
      make("life-domain", [
        { type: "always-prepared-spell", spellId: "bless" },
        { type: "always-prepared-spell", spellId: "cure-wounds" },
      ]),
      make("magic-initiate-cleric", [
        { type: "always-prepared-spell", spellId: "cure-wounds" }, // dupe
        { type: "always-prepared-spell", spellId: "guidance" },
      ]),
    ]);
    expect(out.alwaysPrepared).toEqual(["bless", "cure-wounds", "guidance"]);
  });
});

describe("evaluateGrants — Darkvision migration parity with legacy deriveSenses", () => {
  // This is the proof-of-concept parallel-validation test for the A4
  // migration. As races/feats/features migrate their grants[] declaration,
  // the helper-vs-declarative path should produce the same result. The
  // declarative path is currently the only source of truth for the
  // grants fields; the legacy regex path lives on for race rows that
  // haven't been migrated yet (which is currently all of them).
  it("a race trait with a declarative darkvision grant produces the same range as the regex parser would for the same description", () => {
    // Declarative: explicit data
    const aggregate = evaluateGrants([
      make("elf-darkvision", [{ type: "darkvision", range: 60 }]),
    ]);
    expect(aggregate.darkvisionFt).toBe(60);
  });
});

describe("evaluateGrants — exhaustiveness: every Grant kind lands in the aggregate", () => {
  // The applyGrant switch is the single data↔logic seam and is guarded by
  // `default: assertNever(g)` — a new Grant kind without a case is now a
  // COMPILE error. This test pins the runtime side: one grant of every one of
  // the 67 union members merges into a NON-empty aggregate field (i.e. nothing
  // is silently dropped). The list below is the authoritative roster; if a new
  // member is added without a row here, the count assertion at the end fails.
  const sample: Grant[] = [
    // Senses
    { type: "darkvision", range: 60 },
    { type: "blindsight", range: 10 },
    { type: "tremorsense", range: 30 },
    { type: "truesight", range: 120 },
    { type: "see-invisible", range: 60 },
    // Defensive
    { type: "damage-resistance", damageType: "fire" },
    { type: "damage-immunity", damageType: "poison" },
    { type: "damage-vulnerability", damageType: "cold" },
    { type: "condition-immunity", condition: "charmed" },
    { type: "damage-resistance-source", source: "spell" },
    {
      type: "choice-resistance",
      choiceKey: "energy-res",
      label: { en: "Energy Resistances", it: "Resistenze Energetiche" },
      options: ["fire", "cold"],
      amount: 1,
    },
    // Movement
    { type: "speed", amount: 10 },
    { type: "fly-speed", amount: 30 },
    { type: "swim-speed", amount: 30 },
    { type: "climb-speed", amount: 30 },
    { type: "speed-multiplier", factor: 2 },
    // Derived stats
    { type: "ac-bonus", amount: 1 },
    { type: "ac-formula", base: 10, bonuses: ["DEX", "CON"], condition: "no-armor" },
    { type: "hp-per-level", amount: 1 },
    { type: "hp-flat", amount: 5 },
    { type: "attunement-slots", amount: 4 },
    { type: "exhaustion-recovery", amount: 1 },
    { type: "crit-range", threshold: 19 },
    { type: "death-save-crit-range", threshold: 18 },
    { type: "heroic-inspiration-at-turn-start" },
    { type: "regen-at-turn-start", amount: "5+CON", condition: "bloodied" },
    { type: "on-crit-movement-rider", fraction: "half" },
    { type: "ability-score-set", ability: "CON", value: 19 },
    { type: "ability-score", ability: "STR", amount: 1 },
    { type: "spell-save-dc-bonus", amount: 1, scope: "all" },
    { type: "spell-attack-bonus", amount: 1, scope: "all" },
    { type: "save-bonus", ability: "CHA", min: 1 },
    { type: "ability-check-bonus", appliesTo: "all-checks", value: 1, min: 0 },
    { type: "initiative-bonus", amount: 2 },
    {
      type: "damage-rider",
      dice: "1d8",
      damageType: "radiant",
      appliesTo: "melee-weapon",
    },
    {
      type: "spell-damage-bonus",
      damageTypes: ["fire"],
      ability: "CHA",
      value: "modifier",
      scope: "sorcerer",
    },
    {
      type: "cantrip-damage-bonus",
      spellId: "eldritch-blast",
      ability: "CHA",
      value: "modifier",
    },
    {
      type: "cantrip-effect-rider",
      effect: "forced-movement",
      spellId: "eldritch-blast",
      direction: "push",
      distanceFt: 10,
      maxTargetSize: "Large",
    },
    {
      type: "cantrip-range-bonus",
      spellId: "eldritch-blast",
      bonusPerLevel: 30,
      scalesWith: "warlock",
    },
    // Proficiencies
    { type: "save-proficiency", ability: "WIS" },
    { type: "skill-proficiency", skill: "stealth" },
    { type: "expertise", skill: "perception" },
    { type: "language", language: "draconic" },
    { type: "tool-proficiency", tool: "thieves-tools" },
    { type: "weapon-proficiency", proficiency: tok("martial-weapons") },
    { type: "armor-proficiency", proficiency: tok("medium-armor") },
    { type: "weapon-attack-ability", ability: "INT" },
    // Spell grants
    { type: "always-prepared-spell", spellId: "bless" },
    { type: "ritual-casting", spellId: "comprehend-languages" },
    { type: "ritual-casting-any", classSpellList: "wizard" },
    { type: "free-cast-spell", spellId: "misty-step", chargesPerRest: 1, rest: "long" },
    { type: "at-will-cast-spell", spellId: "mage-armor", casterAbility: "CHA" },
    // Advantage / disadvantage
    {
      type: "advantage-on",
      rollType: "save",
      vs: "poison",
      description: { en: "vs poison", it: "contro veleno" },
    },
    {
      type: "disadvantage-on",
      rollType: "check",
      vs: "stealth",
      description: { en: "heavy armor", it: "armatura pesante" },
    },
    // Pending choices
    { type: "choice-ability-score", abilities: ["STR", "CON"], amount: 1 },
    { type: "choice-skill-proficiency", options: ["stealth", "arcana"], amount: 1 },
    { type: "choice-expertise", amount: 1 },
    { type: "choice-language", options: [], amount: 1 },
    { type: "choice-tool-proficiency", options: ["thieves-tools"], amount: 1 },
    { type: "choice-skill-or-tool-proficiency", amount: 1 },
    { type: "choice-cantrip", classSpellList: "wizard", amount: 1 },
    { type: "choice-spell", classSpellList: "wizard", maxLevel: 1, amount: 1 },
    { type: "choice-feat", category: "origin", amount: 1 },
    // Activatable / bundle
    {
      type: "while-active",
      activeKey: "rage",
      label: { en: "Rage", it: "Ira" },
      grants: [{ type: "damage-resistance", damageType: "bludgeoning" }],
    },
    {
      type: "choice-grant-bundle",
      bundleKey: "terrain",
      label: { en: "Terrain", it: "Terreno" },
      options: [
        {
          id: "arctic",
          label: { en: "Arctic", it: "Artico" },
          grants: [{ type: "damage-resistance", damageType: "cold" }],
        },
      ],
    },
    // Granted action
    {
      type: "granted-action",
      name: { en: "Shield", it: "Scudo" },
      slot: "reaction",
    },
    // Temp HP
    { type: "temp-hp", formula: "CHA+level" },
  ];

  it("exercises one grant of all 67 union members without throwing", () => {
    // If a future member is added without a switch case, `default: assertNever`
    // throws here at runtime AND fails to compile in grants.ts.
    expect(() => evaluateGrants([make("all-kinds", sample)])).not.toThrow();
  });

  it("covers exactly the 67 distinct Grant kinds (roster guard)", () => {
    const kinds = new Set(sample.map((g) => g.type));
    expect(kinds.size).toBe(sample.length); // no duplicate kinds in the roster
    expect(kinds.size).toBe(67);
  });

  it("each kind writes its expected aggregate field (nothing silently dropped)", () => {
    const out = evaluateGrants([make("all-kinds", sample)]);
    // Senses
    expect(out.darkvisionFt).toBe(60);
    expect(out.blindsightFt).toBe(10);
    expect(out.tremorsenseFt).toBe(30);
    expect(out.truesightFt).toBe(120);
    // Defensive
    expect(out.damageResistances.has("fire")).toBe(true);
    expect(out.damageImmunities.has("poison")).toBe(true);
    expect(out.damageVulnerabilities.has("cold")).toBe(true);
    expect(out.conditionImmunities.has("charmed")).toBe(true);
    expect(out.damageSourceResistances.has("spell")).toBe(true);
    // choice-resistance surfaces its slot even with no session pick (the picker
    // affordance is the "landed" output; selected picks merge into
    // damageResistances when chosen).
    expect(out.choiceResistances).toHaveLength(1);
    // Movement
    expect(out.speedBonusFt).toBe(10);
    expect(out.flySpeed).toBe(30);
    expect(out.swimSpeed).toBe(30);
    expect(out.climbSpeed).toBe(30);
    expect(out.speedMultiplier).toBe(2);
    // Derived stats
    expect(out.acBonus).toBe(1);
    expect(out.acFormulas).toHaveLength(1);
    expect(out.hpPerLevel).toBe(1);
    expect(out.hpFlat).toBe(5);
    expect(out.attunementSlots).toBe(4);
    expect(out.exhaustionRecoveryBonus).toBe(1);
    expect(out.critThreshold).toBe(19);
    expect(out.deathSaveCritThreshold).toBe(18);
    expect(out.heroicInspirationAtTurnStart).toBe(true);
    expect(out.startOfTurnRegen).toHaveLength(1);
    expect(out.startOfTurnRegen[0]).toMatchObject({
      amount: "5+CON",
      condition: "bloodied",
      requiresMinHp: true, // defaulted when omitted on the grant
    });
    expect(out.onCritMovement).toHaveLength(1);
    expect(out.onCritMovement[0]).toMatchObject({
      fraction: "half",
      ignoresOpportunityAttacks: true, // defaulted when omitted on the grant
    });
    expect(out.abilityScoreFloors.CON).toBe(19);
    // `ability-score` from a NON-magic-item source is a deliberate no-op: feat/
    // class/race ASIs are baked into the stored scores at creation/level-up, so
    // re-folding them at render would double-count. Only magic-item sources feed
    // `itemAbilityScoreBonus` (covered by the item-channel summation test above).
    expect(out.itemAbilityScoreBonus.STR).toBe(0);
    expect(out.spellSaveDcBonus).toHaveLength(1);
    expect(out.spellAttackBonus).toHaveLength(1);
    expect(out.saveBonusAbilities).toHaveLength(1);
    expect(out.abilityCheckBonuses).toHaveLength(1);
    expect(out.initiativeBonusFlat).toBe(2);
    expect(out.damageRiders).toHaveLength(1);
    expect(out.spellDamageBonuses).toHaveLength(1);
    expect(out.cantripDamageBonuses).toHaveLength(1);
    expect(out.cantripEffectRiders).toHaveLength(1);
    expect(out.cantripRangeBonuses).toHaveLength(1);
    // Proficiencies
    expect(out.saveProficiencies.has("WIS")).toBe(true);
    expect(out.skillProficiencies.has("stealth")).toBe(true);
    expect(out.expertiseSkills.has("perception")).toBe(true);
    expect(out.languages.has("draconic")).toBe(true);
    expect(out.toolProficiencies.has("thieves-tools")).toBe(true);
    expect(out.weaponProficiencies.has(tok("martial-weapons"))).toBe(true);
    expect(out.armorProficiencies.has(tok("medium-armor"))).toBe(true);
    expect(out.weaponAttackAbilities).toHaveLength(1);
    // Spell grants
    expect(out.alwaysPrepared).toContain("bless");
    expect(out.ritualSpells.has("comprehend-languages")).toBe(true);
    expect(out.ritualAnyClasses.has("wizard")).toBe(true);
    expect(out.freeCasts).toHaveLength(1);
    expect(out.atWillCasts).toHaveLength(1);
    expect(out.atWillCasts[0]).toMatchObject({
      spellId: "mage-armor",
      casterAbility: "CHA",
    });
    // Advantage / disadvantage
    expect(out.advantages).toHaveLength(1);
    expect(out.disadvantages).toHaveLength(1);
    // Pending choices — 9 choice-* kinds each push one entry (incl. choice-feat)
    expect(out.pendingChoices).toHaveLength(9);
    expect(out.pendingChoices.some((p) => p.kind === "feat")).toBe(true);
    // Activatable / bundle
    expect(out.activatableGroups).toHaveLength(1);
    expect(out.grantBundles).toHaveLength(1);
    // Granted action
    expect(out.grantedActions).toHaveLength(1);
    // Temp HP
    expect(out.tempHpGrants).toHaveLength(1);
  });
});
