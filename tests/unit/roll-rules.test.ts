/**
 * The roll-time Grant kinds compile to Rules (ADR-0010, M1, #1432). A roll clause
 * is a Rule on a roll target (`roll:save:advantage`): it is not folded into a
 * number, it is kept per source in grant order, because every reader names the
 * source that gives the Advantage. The aggregate's clause rows are built from the
 * compiled rules only.
 */
import { describe, expect, it } from "vitest";

import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { compileGrant, foldRules } from "@/lib/rules";

const source = (id: string, grants: GrantSource["grants"]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

const NOTE = { en: "Only in sunlight", it: "Solo alla luce del sole" };

describe("roll rules: advantage and disadvantage compile to roll clauses", () => {
  it("a save or check advantage is a clause on its roll target", () => {
    expect(
      compileGrant({ type: "advantage-on", rollType: "save", vs: "poisoned" })
    ).toEqual([{ op: "clause", target: "roll:save:advantage", vs: "poisoned" }]);
    expect(
      compileGrant({
        type: "advantage-on",
        rollType: "check",
        vs: "str",
        consume: "next",
        description: NOTE,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:check:advantage",
        vs: "str",
        consume: "next",
        description: NOTE,
      },
    ]);
  });

  it("an attack clause keeps a narrowed scope and drops `all`", () => {
    expect(
      compileGrant({
        type: "advantage-on",
        rollType: "attack",
        scope: "marked",
        vs: "hunters-mark-target",
        round1: true,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:attack:advantage",
        vs: "hunters-mark-target",
        scope: "marked",
        round1: true,
      },
    ]);
    expect(
      compileGrant({ type: "disadvantage-on", rollType: "attack", scope: "all", vs: "x" })
    ).toEqual([{ op: "clause", target: "roll:attack:disadvantage", vs: "x" }]);
  });

  it("a disadvantage keeps its consume policy", () => {
    expect(
      compileGrant({
        type: "disadvantage-on",
        rollType: "check",
        vs: "perception",
        consume: "each",
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:check:disadvantage",
        vs: "perception",
        consume: "each",
      },
    ]);
  });

  it("attacks against the character are clauses on the incoming-attack target", () => {
    expect(compileGrant({ type: "incoming-attack-advantage" })).toEqual([
      { op: "clause", target: "roll:incoming-attack:advantage" },
    ]);
    expect(
      compileGrant({ type: "incoming-attack-disadvantage", description: NOTE })
    ).toEqual([
      { op: "clause", target: "roll:incoming-attack:disadvantage", description: NOTE },
    ]);
  });

  it("the fold leaves clauses out of the numbers and the flags", () => {
    const values = foldRules([
      { op: "clause", target: "roll:save:advantage", vs: "str" },
      { op: "flag", target: "block:healing" },
    ]);
    expect(values).toEqual({ numbers: {}, terms: {}, flags: ["block:healing"] });
  });
});

describe("roll rules: the evaluator's clause rows come from the compiled rules", () => {
  const sources = [
    source("dwarf", [
      { type: "advantage-on", rollType: "save", vs: "poisoned" },
      {
        type: "advantage-on",
        rollType: "save",
        vs: "charmed",
        suppressedByConditions: ["incapacitated"],
      },
    ]),
    source("rage", [
      {
        type: "while-active",
        activeKey: "barbarian-rage",
        grants: [
          { type: "advantage-on", rollType: "check", vs: "str" },
          { type: "incoming-attack-advantage" },
        ],
      },
    ]),
    source("blur", [
      { type: "incoming-attack-disadvantage" },
      {
        type: "disadvantage-on",
        rollType: "attack",
        scope: "strength",
        vs: "strength-attacks",
        consume: "each",
      },
    ]),
  ];

  it("names each clause's source, its active state and its narrowing", () => {
    const out = evaluateGrants(sources, new Set(["barbarian-rage"]));
    const text: unknown = expect.anything();
    expect(out.advantages).toEqual([
      { sourceId: "dwarf", rollType: "save", vs: "poisoned", description: text },
      { sourceId: "dwarf", rollType: "save", vs: "charmed", description: text },
      {
        sourceId: "rage",
        rollType: "check",
        vs: "str",
        description: text,
        whileActiveKey: "barbarian-rage",
      },
    ]);
    expect(out.disadvantages).toEqual([
      {
        sourceId: "blur",
        rollType: "attack",
        vs: "strength-attacks",
        description: text,
        consume: "each",
        scope: "strength",
      },
    ]);
    expect(out.incomingAttackAdvantages).toEqual([
      { sourceId: "rage", description: text, whileActiveKey: "barbarian-rage" },
    ]);
    expect(out.incomingAttackDisadvantages).toEqual([
      { sourceId: "blur", description: text },
    ]);
  });

  it("drops a clause its condition suppresses, and a clause whose state is off", () => {
    const out = evaluateGrants(sources, new Set(), new Map(), {
      conditions: new Set(["incapacitated"]),
    });
    expect(out.advantages.map((row) => row.vs)).toEqual(["poisoned"]);
    expect(out.incomingAttackAdvantages).toEqual([]);
  });

  it("keeps every clause among the compiled rules, with its source", () => {
    const out = evaluateGrants(sources, new Set(["barbarian-rage"]));
    const clauses = out.ruleOrigins.filter(({ rule }) => rule.op === "clause");
    expect(clauses.map(({ rule }) => rule.target)).toEqual([
      "roll:save:advantage",
      "roll:save:advantage",
      "roll:check:advantage",
      "roll:incoming-attack:advantage",
      "roll:incoming-attack:disadvantage",
      "roll:attack:disadvantage",
    ]);
  });
});

describe("roll rules: a clause never makes a source count for same-effect stacking", () => {
  it("a same-name source with only a clause leaves the other's bonuses summed", () => {
    const charm = (id: string, grants: GrantSource["grants"]): GrantSource => ({
      id,
      name: { en: "Charm", it: "Amuleto" },
      grants,
    });
    const out = evaluateGrants([
      charm("a", [
        { type: "ac-bonus", amount: 1 },
        { type: "ac-bonus", amount: 1 },
      ]),
      charm("b", [{ type: "advantage-on", rollType: "save", vs: "poisoned" }]),
    ]);
    expect(out.acBonus).toBe(2);
  });
});

describe("roll rules: rerolls, floors and dice on a roll compile to roll clauses", () => {
  it("a face-triggered reroll is a clause on every d20 roll", () => {
    expect(compileGrant({ type: "d20-reroll", faces: [1] })).toEqual([
      { op: "clause", target: "roll:d20:reroll", faces: [1] },
    ]);
  });

  it("a floor is a clause on its roll, with its reach", () => {
    expect(
      compileGrant({
        type: "roll-floor",
        rollType: "check",
        floor: 10,
        appliesTo: "proficient",
        ability: "CHA",
        description: NOTE,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:check:floor",
        floor: 10,
        appliesTo: "proficient",
        ability: "CHA",
        description: NOTE,
      },
    ]);
  });

  it("a die added to or taken from a roll is a clause on that roll", () => {
    expect(
      compileGrant({
        type: "roll-die-adjustment",
        rollType: "check",
        operation: "add",
        dice: "1d4",
        consume: "next",
        appliesTo: "stealth",
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:check:die",
        operation: "add",
        dice: "1d4",
        consume: "next",
        appliesTo: "stealth",
      },
    ]);
  });

  it("damage that cannot break concentration is a clause on the concentration save", () => {
    expect(
      compileGrant({
        type: "concentration-damage-proof",
        spells: { school: "abjuration" },
        alsoWhileIncapacitated: true,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:concentration:damage-proof",
        spells: { school: "abjuration" },
        alsoWhileIncapacitated: true,
      },
    ]);
  });

  it("the evaluator's rows come from the compiled clauses, with source and state", () => {
    const out = evaluateGrants(
      [
        source("luck", [{ type: "d20-reroll", faces: [1] }]),
        source("talent", [
          { type: "roll-floor", rollType: "check", floor: 10, appliesTo: "proficient" },
        ]),
        source("bless", [
          {
            type: "while-active",
            activeKey: "blessed",
            grants: [
              {
                type: "roll-die-adjustment",
                rollType: "save",
                operation: "add",
                dice: "1d4",
                consume: "each",
              },
              {
                type: "roll-floor",
                rollType: "save",
                floor: 5,
                appliesTo: "all",
                ability: "WIS",
              },
            ],
          },
        ]),
        source("steady-mind", [
          { type: "concentration-damage-proof", spellId: "shield" },
        ]),
      ],
      new Set(["blessed"])
    );
    const text: unknown = expect.anything();
    expect(out.d20Rerolls).toEqual([{ sourceId: "luck", faces: [1] }]);
    expect(out.rollFloors).toEqual([
      {
        sourceId: "talent",
        rollType: "check",
        floor: 10,
        appliesTo: "proficient",
        description: text,
      },
      {
        sourceId: "bless",
        rollType: "save",
        floor: 5,
        appliesTo: "all",
        ability: "WIS",
        description: text,
        whileActiveKey: "blessed",
      },
    ]);
    expect(out.rollDieAdjustments).toEqual([
      {
        sourceId: "bless",
        rollType: "save",
        operation: "add",
        dice: "1d4",
        consume: "each",
      },
    ]);
    expect(out.concentrationDamageProof).toEqual([
      { sourceId: "steady-mind", spellId: "shield" },
    ]);
  });
});

describe("roll rules: damage riders on the character's own rolls and on incoming damage", () => {
  it("a die modifier on the weapon's own damage dice is a damage clause", () => {
    expect(
      compileGrant({
        type: "damage-die-modifier",
        mode: "floor",
        appliesTo: "two-handed-melee",
        floorBelow: 2,
        floorTo: 3,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:damage:die-modifier",
        mode: "floor",
        appliesTo: "two-handed-melee",
        floorBelow: 2,
        floorTo: 3,
      },
    ]);
  });

  it("a rolled reduction of incoming damage is a clause on incoming damage", () => {
    expect(
      compileGrant({ type: "damage-die-reduction", damageTypes: ["fire"], dice: "1d4" })
    ).toEqual([
      {
        op: "clause",
        target: "roll:incoming-damage:die-reduction",
        damageTypes: ["fire"],
        dice: "1d4",
        oncePerTurn: false,
      },
    ]);
  });

  it("ignoring resistance is one flag per damage type, spells always included", () => {
    expect(
      compileGrant({
        type: "damage-penetration",
        appliesTo: "any",
        damageTypes: ["poison", "acid"],
        ignores: "resistance",
      })
    ).toEqual([
      { op: "flag", target: "damage:ignore-resistance:spell:poison" },
      { op: "flag", target: "damage:ignore-resistance:any:poison" },
      { op: "flag", target: "damage:ignore-resistance:spell:acid" },
      { op: "flag", target: "damage:ignore-resistance:any:acid" },
    ]);
    expect(
      compileGrant({
        type: "damage-penetration",
        appliesTo: "spell",
        damageTypes: ["fire"],
        ignores: "resistance",
      })
    ).toEqual([{ op: "flag", target: "damage:ignore-resistance:spell:fire" }]);
  });

  it("a round-1 damage doubler and a save-damage rule are clauses on their roll", () => {
    expect(
      compileGrant({
        type: "round1-damage-double",
        saveAbility: "CON",
        saveDcAbility: "DEX",
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:damage:round1-double",
        saveAbility: "CON",
        saveDcAbility: "DEX",
      },
    ]);
    expect(
      compileGrant({
        type: "save-damage-rule",
        ability: "DEX",
        requiresDamageOnSuccess: "half",
        onSuccess: "none",
        onFailure: "half",
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:save:damage-rule",
        ability: "DEX",
        requiresDamageOnSuccess: "half",
        onSuccess: "none",
        onFailure: "half",
      },
    ]);
  });

  it("the evaluator's damage rows come from the compiled rules", () => {
    const out = evaluateGrants(
      [
        source("gwf", [
          {
            type: "damage-die-modifier",
            mode: "reroll-keep-higher",
            appliesTo: "weapon",
          },
        ]),
        source("resistance", [
          {
            type: "damage-die-reduction",
            damageTypes: ["cold"],
            dice: "1d4",
            oncePerTurn: true,
          },
        ]),
        source("penetrator", [
          {
            type: "damage-penetration",
            appliesTo: "spell",
            damageTypes: ["fire"],
            ignores: "resistance",
          },
          {
            type: "damage-penetration",
            appliesTo: "any",
            damageTypes: ["poison"],
            ignores: "resistance",
          },
        ]),
        source("doubler", [
          { type: "round1-damage-double", saveAbility: "CON", saveDcAbility: "DEX" },
        ]),
        source("evasion", [
          {
            type: "save-damage-rule",
            ability: "DEX",
            requiresDamageOnSuccess: "half",
            onSuccess: "none",
            onFailure: "half",
            suppressedByConditions: ["incapacitated"],
          },
        ]),
      ],
      new Set()
    );
    expect(out.damageDieModifiers).toEqual([
      { sourceId: "gwf", mode: "reroll-keep-higher", appliesTo: "weapon" },
    ]);
    expect(out.damageDieReductions).toEqual([
      { sourceId: "resistance", damageTypes: ["cold"], dice: "1d4", oncePerTurn: true },
    ]);
    expect([...out.spellResistancePenetration]).toEqual(["fire", "poison"]);
    expect([...out.resistancePenetration]).toEqual(["poison"]);
    expect(out.round1DamageDoubles).toEqual([
      { sourceId: "doubler", saveAbility: "CON", saveDcAbility: "DEX" },
    ]);
    expect(out.saveDamageRules).toEqual([
      {
        sourceId: "evasion",
        ability: "DEX",
        requiresDamageOnSuccess: "half",
        onSuccess: "none",
        onFailure: "half",
      },
    ]);
  });

  it("a save-damage rule its condition suppresses is not compiled", () => {
    const out = evaluateGrants(
      [
        source("evasion", [
          {
            type: "save-damage-rule",
            ability: "DEX",
            requiresDamageOnSuccess: "half",
            onSuccess: "none",
            onFailure: "half",
            suppressedByConditions: ["incapacitated"],
          },
        ]),
      ],
      new Set(),
      new Map(),
      { conditions: new Set(["incapacitated"]) }
    );
    expect(out.saveDamageRules).toEqual([]);
  });
});

describe("roll rules: resistance penetration never makes a source count for stacking", () => {
  it("a same-name source that only ignores resistance leaves the other's bonuses summed", () => {
    const charm = (id: string, grants: GrantSource["grants"]): GrantSource => ({
      id,
      name: { en: "Charm", it: "Amuleto" },
      grants,
    });
    const out = evaluateGrants([
      charm("a", [
        { type: "ac-bonus", amount: 1 },
        { type: "ac-bonus", amount: 1 },
      ]),
      charm("b", [
        {
          type: "damage-penetration",
          appliesTo: "spell",
          damageTypes: ["fire"],
          ignores: "resistance",
        },
      ]),
    ]);
    expect(out.acBonus).toBe(2);
  });
});

describe("roll rules: spell and cantrip damage and healing compile to clauses", () => {
  it("each spell modifier is a clause with the grant's defaults filled in", () => {
    expect(compileGrant({ type: "spell-damage-bonus", damageTypes: ["fire"] })).toEqual([
      {
        op: "clause",
        target: "roll:spell-damage:bonus",
        damageTypes: ["fire"],
        value: "modifier",
        min: 0,
        scope: "all",
      },
    ]);
    expect(compileGrant({ type: "spell-damage-type-override", toType: "cold" })).toEqual([
      {
        op: "clause",
        target: "roll:spell-damage:type-override",
        toType: "cold",
        scope: "all",
      },
    ]);
    expect(
      compileGrant({
        type: "spell-die-augment",
        spellId: "fire-bolt",
        fromDie: 10,
        toDie: 12,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:spell-damage:die-augment",
        spellId: "fire-bolt",
        fromDie: 10,
        toDie: 12,
      },
    ]);
    expect(compileGrant({ type: "heal-bonus", amount: 2, scope: "cleric" })).toEqual([
      {
        op: "clause",
        target: "roll:spell-heal:bonus",
        amount: 2,
        perSpellLevel: false,
        minSpellLevel: 0,
        scope: "cleric",
      },
    ]);
    expect(compileGrant({ type: "maximize-spell-healing", minSpellLevel: 1 })).toEqual([
      {
        op: "clause",
        target: "roll:spell-heal:maximize",
        minSpellLevel: 1,
        scope: "all",
      },
    ]);
  });

  it("a cantrip modifier compiles only once its cantrip is known", () => {
    expect(
      compileGrant({ type: "cantrip-damage-bonus", spellId: "eldritch-blast", value: 2 })
    ).toEqual([
      {
        op: "clause",
        target: "roll:cantrip-damage:bonus",
        spellId: "eldritch-blast",
        value: 2,
        min: 0,
      },
    ]);
    expect(
      compileGrant({
        type: "cantrip-range-bonus",
        spellId: "eldritch-blast",
        bonusPerLevel: 30,
        scalesWith: "warlock",
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:cantrip:range-bonus",
        spellId: "eldritch-blast",
        bonusPerLevel: 30,
        scalesWith: "warlock",
      },
    ]);
    // A pick the evaluator could not resolve contributes nothing.
    expect(compileGrant({ type: "cantrip-damage-bonus", choiceKey: "pick" })).toEqual([]);
  });

  it("the evaluator resolves the picked cantrip, then reads the compiled rows", () => {
    const out = evaluateGrants(
      [
        source("invocation", [
          { type: "cantrip-damage-bonus", choiceKey: "blast-pick", defaultSpellId: "x" },
          {
            type: "cantrip-range-bonus",
            defaultSpellId: "eldritch-blast",
            bonusPerLevel: 30,
            scalesWith: "warlock",
          },
        ]),
        source("elemental", [
          { type: "spell-damage-bonus", damageTypes: ["fire"], ability: "CHA", min: 1 },
          { type: "spell-damage-type-override", toType: "cold", scope: "sorcerer" },
        ]),
        source("disciple", [
          { type: "heal-bonus", amount: 2, perSpellLevel: true, minSpellLevel: 1 },
          { type: "maximize-spell-healing" },
        ]),
        source("augment-a", [
          { type: "spell-die-augment", spellId: "fire-bolt", fromDie: 10, toDie: 12 },
        ]),
        source("augment-b", [
          { type: "spell-die-augment", spellId: "ray", fromDie: 8, toDie: 10 },
          { type: "spell-die-augment", spellId: "fire-bolt", fromDie: 8, toDie: 20 },
          { type: "spell-die-augment", spellId: "ray", fromDie: 6, toDie: 8 },
        ]),
      ],
      new Set(),
      new Map([["blast-pick", "eldritch-blast"]])
    );
    expect(out.cantripDamageBonuses).toEqual([
      { spellId: "eldritch-blast", value: "modifier", min: 0 },
    ]);
    expect(out.cantripRangeBonuses).toEqual([
      { spellId: "eldritch-blast", bonusPerLevel: 30, scalesWith: "warlock" },
    ]);
    expect(out.spellDamageBonuses).toEqual([
      { damageTypes: ["fire"], ability: "CHA", value: "modifier", min: 1, scope: "all" },
    ]);
    expect(out.spellDamageTypeOverrides).toEqual([{ toType: "cold", scope: "sorcerer" }]);
    expect(out.healBonuses).toEqual([
      { amount: 2, perSpellLevel: true, minSpellLevel: 1, scope: "all" },
    ]);
    expect(out.maximizeSpellHealing).toEqual([{ minSpellLevel: 0, scope: "all" }]);
    // The largest die wins per spell, in the place the spell first appeared.
    expect(out.spellDieAugments).toEqual([
      { spellId: "fire-bolt", fromDie: 8, toDie: 20 },
      { spellId: "ray", fromDie: 8, toDie: 10 },
    ]);
  });
});
