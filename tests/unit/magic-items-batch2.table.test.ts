/**
 * Magic items, batch 2: what each item's English catalogue text states, carried by
 * the engine. Every case is read from the text (the on-a-20 damage, the score a
 * book raises, the armor drawback it lifts), never typed twice.
 */
import { describe, expect, it } from "vitest";
import { getEquipment } from "@/data/equipment";
import { getMagicItem } from "@/data/magic-items";
import type { AbilityCode, CreatureType } from "@/data/types";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { combatDamageParts } from "@/lib/combat-resolution";
import { resolveItemBoundDamageRiders } from "@/lib/compute";
import type { Grant } from "@/lib/grants";
import {
  damageTrayPlan,
  initialTrayRow,
  onRoll20Amount,
  rowAmount,
  setAttackOutcome,
} from "@/lib/play/damage-tray";
import { takeDamage } from "@/lib/play/damage";
import { slowedFallFtPerRound } from "@/lib/play/fall";
import { hitDiceHealing } from "@/lib/play/hit-dice";
import { studyItemAbilityScores } from "@/lib/play/study-item";
import { compileGrant, foldRules } from "@/lib/rules";
import {
  effectiveWalkingSpeedFt,
  resolveActions,
  wornArmorDisadvantageClauses,
} from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";
import { srd } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const text = (id: string): string => srd("magic-item", id, "description", "en");

function worn(itemId: string, extra: Partial<SrdEquipmentRef> = {}): SrdEquipmentRef {
  return {
    srdId: itemId,
    instanceId: `${itemId}-copy`,
    equipped: true,
    attuned: true,
    quantity: 1,
    ...extra,
  };
}

// ── On a roll of 20 ───────────────────────────────────────────────────────────

/** "roll a 20 … takes an extra 14 Slashing damage" → 14 slashing. */
function statedOnRoll20(id: string) {
  const m = /roll a 20[^.]*?extra (\d+) (\w+) damage/.exec(text(id));
  if (!m) throw new Error(`${id} states no on-a-20 damage`);
  return { amount: Number(m[1]), damageType: (m[2] ?? "").toLowerCase() };
}

function wielding(itemId: string): CharacterDoc {
  return makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [worn(itemId)],
    weapons: [{ srdId: "longsword", quantity: 1, enchantItemId: itemId }],
  });
}

function trayFor(itemId: string) {
  const row = resolveActions(wielding(itemId)).find(
    (a) => a.source === "weapon" && a.weaponId === "longsword"
  );
  if (!row) throw new Error("no longsword row");
  const action = localizeAction(row, "en");
  const plan = damageTrayPlan(action, ["monster-1"], "pc-me");
  if (!plan) throw new Error("no tray");
  return { action, plan };
}

function critical(itemId: string, creatureType?: CreatureType) {
  const { plan } = trayFor(itemId);
  const hit = initialTrayRow(plan, "monster-1", undefined, creatureType);
  return { plan, hit, crit: setAttackOutcome(hit, "critical", plan) };
}

const ON_ROLL_20 = ["sword-of-sharpness", "sword-of-life-stealing", "mace-of-smiting"];

describe("on-a-20 weapon riders", () => {
  it.each(ON_ROLL_20)("%s declares its on-a-20 damage, nothing on a plain hit", (id) => {
    const want = statedOnRoll20(id);
    const riders = resolveItemBoundDamageRiders(getMagicItem(id)?.grants, () => false);
    expect(riders[0]).toMatchObject({
      dice: String(want.amount),
      damageType: want.damageType,
      onRoll20: true,
    });
    expect(riders.every((r) => r.onRoll20)).toBe(true);
  });

  it.each(ON_ROLL_20)("%s: a Critical row adds it, a hit row does not", (id) => {
    const want = statedOnRoll20(id);
    const { action } = trayFor(id);
    // Never offered as a hit-time optional part.
    expect(
      combatDamageParts(action).filter((p) => p.id.startsWith("extra-"))
    ).toHaveLength(0);
    const { plan, hit, crit } = critical(id);
    expect(onRoll20Amount(hit, plan)).toBe(0);
    expect(rowAmount(10, hit, plan)).toBe(10);
    expect(rowAmount(10, crit, plan)).toBe(10 + want.amount);
  });

  it("Sword of Life Stealing: not against a Construct or an Undead", () => {
    expect(text("sword-of-life-stealing")).toMatch(/isn’t a Construct or an Undead/);
    expect(
      onRoll20Amount(
        critical("sword-of-life-stealing", "undead").crit,
        critical("sword-of-life-stealing").plan
      )
    ).toBe(0);
    const { plan, crit } = critical("sword-of-life-stealing", "construct");
    expect(onRoll20Amount(crit, plan)).toBe(0);
    const humanoid = critical("sword-of-life-stealing", "humanoid");
    expect(onRoll20Amount(humanoid.crit, humanoid.plan)).toBe(15);
  });

  it("Mace of Smiting: 7, or 14 if it's a Construct", () => {
    const m =
      /extra (\d+) Bludgeoning damage, or (\d+) Bludgeoning damage if it’s a Construct/.exec(
        text("mace-of-smiting")
      );
    const any = critical("mace-of-smiting");
    expect(onRoll20Amount(any.crit, any.plan)).toBe(Number(m?.[1]));
    const construct = critical("mace-of-smiting", "construct");
    expect(onRoll20Amount(construct.crit, construct.plan)).toBe(Number(m?.[2]));
  });
});

// ── Armor ────────────────────────────────────────────────────────────────────

describe("Adamantine and Mithral Armor", () => {
  function dying(equipment: SrdEquipmentRef[]): CharacterDoc {
    return makeCharacterDoc(
      { equipment },
      {
        hp: { current: 0, temp: 0 },
        deathSucc: 0,
        deathFail: 0,
      }
    );
  }

  it("Adamantine: a Critical Hit against you becomes a normal hit", () => {
    expect(text("adamantine-armor")).toMatch(
      /critical hit against you becomes a normal hit/
    );
    // At 0 HP a Critical Hit is two failed death saves; a normal hit is one.
    expect(takeDamage(dying([]), 3, { crit: true })?.session.deathFail).toBe(2);
    expect(
      takeDamage(dying([worn("adamantine-armor")]), 3, { crit: true })?.session.deathFail
    ).toBe(1);
    // Carried, not worn: no effect.
    expect(
      takeDamage(dying([worn("adamantine-armor", { equipped: false })]), 3, {
        crit: true,
      })?.session.deathFail
    ).toBe(2);
  });

  function inPlate(extra: SrdEquipmentRef[]): CharacterDoc {
    const doc = makeCharacterDoc({
      equipment: [worn("plate-armor"), ...extra],
      abilityScores: { STR: 8, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    });
    return doc;
  }
  const stealth = (doc: CharacterDoc) =>
    wornArmorDisadvantageClauses(doc).filter((c) => c.vs === "stealth");

  it("Mithral: no Disadvantage on Stealth and no Strength requirement", () => {
    expect(text("mithral-armor")).toMatch(
      /doesn't impose Disadvantage on Stealth checks and has no Strength requirement/
    );
    const plain = inPlate([]);
    expect(stealth(plain)).toHaveLength(1);
    expect(effectiveWalkingSpeedFt(plain, getEquipment)).toBe(20);
    const mithral = inPlate([worn("mithral-armor")]);
    expect(stealth(mithral)).toHaveLength(0);
    expect(effectiveWalkingSpeedFt(mithral, getEquipment)).toBe(30);
  });
});

// ── Periapt of Wound Closure, Potion of Vitality ─────────────────────────────

/** The folded rules of an item's grants, nested states included (a drunk potion). */
function rulesOf(itemId: string) {
  const leaves = (grants: ReadonlyArray<Grant>): Grant[] =>
    grants.flatMap((g) => (g.type === "while-active" ? leaves(g.grants) : [g]));
  return {
    values: foldRules(
      leaves(getMagicItem(itemId)?.grants ?? []).flatMap((g) => compileGrant(g) ?? [])
    ),
  };
}

describe("Periapt of Wound Closure", () => {
  it("you stabilize automatically when dying", () => {
    expect(text("periapt-of-wound-closure")).toMatch(
      /stabilize automatically when dying/
    );
    const at = (equipment: SrdEquipmentRef[]) =>
      makeCharacterDoc(
        { equipment },
        {
          hp: { current: 4, temp: 0 },
          deathSucc: 0,
          deathFail: 0,
        }
      );
    const plain = takeDamage(at([]), 10)?.session;
    expect(plain?.hp.current).toBe(0);
    expect([plain?.deathSucc, plain?.deathFail]).toEqual([0, 0]);
    const periapt = takeDamage(at([worn("periapt-of-wound-closure")]), 10)?.session;
    expect(periapt?.hp.current).toBe(0);
    // Stable: three successes, no failures.
    expect([periapt?.deathSucc, periapt?.deathFail]).toEqual([3, 0]);
  });

  it("Hit Dice restore double the HP", () => {
    expect(text("periapt-of-wound-closure")).toMatch(/double the number of HP restored/);
    const pool = [{ die: 10 as const, count: 5 }];
    const input = { pool, count: 2, rolled: 9, conMod: 2 };
    expect(hitDiceHealing({ ...input, aggregate: { values: foldRules([]) } })).toBe(13);
    expect(
      hitDiceHealing({ ...input, aggregate: rulesOf("periapt-of-wound-closure") })
    ).toBe(26);
  });

  it("the worn periapt reaches the aggregate", () => {
    const doc = makeCharacterDoc({ equipment: [worn("periapt-of-wound-closure")] });
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect(
      hitDiceHealing({
        pool: [{ die: 10, count: 5 }],
        count: 1,
        rolled: 4,
        conMod: 0,
        aggregate: agg,
      })
    ).toBe(8);
  });
});

describe("Potion of Vitality", () => {
  it("for 24 hours each spent Hit Point Die restores its maximum", () => {
    expect(text("potion-of-vitality")).toMatch(
      /next 24 hours, you regain the maximum number of Hit Points for any Hit Point Die/
    );
    expect(getMagicItem("potion-of-vitality")?.durationRounds).toBe(24 * 60 * 10);
    const pool = [{ die: 10 as const, count: 5 }];
    // No roll needed: 2 × d10 maximum + 2 × CON +1.
    expect(
      hitDiceHealing({
        pool,
        count: 2,
        rolled: null,
        conMod: 1,
        aggregate: rulesOf("potion-of-vitality"),
      })
    ).toBe(22);
  });
});

// ── Manuals and Tomes ────────────────────────────────────────────────────────

const ABILITY: Record<string, AbilityCode> = {
  Strength: "STR",
  Dexterity: "DEX",
  Constitution: "CON",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHA",
};
const BOOKS = [
  "manual-of-bodily-health",
  "manual-of-gainful-exercise",
  "manual-of-quickness-of-action",
  "tome-of-clear-thought",
  "tome-of-leadership-and-influence",
  "tome-of-understanding",
];

describe("Manuals and Tomes", () => {
  const BASE: Record<AbilityCode, number> = {
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };

  it.each(BOOKS)("%s raises the score its text names, to its maximum", (id) => {
    const m = /your (\w+) increases by (\d+), to a maximum of (\d+)/.exec(text(id));
    const ability = ABILITY[m?.[1] ?? ""];
    if (!ability || !m) throw new Error(`${id} names no score`);
    const amount = Number(m[2]);
    const cap = Number(m[3]);
    const grants = getMagicItem(id)?.grants;
    expect(studyItemAbilityScores(BASE, grants)).toEqual({
      ...BASE,
      [ability]: 10 + amount,
    });
    expect(
      studyItemAbilityScores({ ...BASE, [ability]: cap - 1 }, grants)?.[ability]
    ).toBe(cap);
    expect(studyItemAbilityScores({ ...BASE, [ability]: cap }, grants)).toBeNull();
  });

  it.each(BOOKS)("%s is no standing bonus while carried", (id) => {
    const doc = makeCharacterDoc({ equipment: [worn(id)] });
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect(Object.values(agg.itemAbilityScoreBonus).every((n) => n === 0)).toBe(true);
  });
});

// ── Ring of Feather Falling, Oathbow ─────────────────────────────────────────

describe("Ring of Feather Falling and Oathbow", () => {
  it("Ring of Feather Falling: descend 60 feet per round, no falling damage", () => {
    const m = /descend (\d+) feet per round and take no damage from falling/.exec(
      text("ring-of-feather-falling")
    );
    const doc = makeCharacterDoc({ equipment: [worn("ring-of-feather-falling")] });
    expect(
      slowedFallFtPerRound(aggregateCharacterGrants(doc.character, doc.session))
    ).toBe(Number(m?.[1]));
  });

  it("Oathbow: an extra 3d6 Piercing while a sworn enemy is named", () => {
    const m = /extra (\d+d\d+) (\w+) damage/.exec(text("oathbow"));
    const lit = resolveItemBoundDamageRiders(getMagicItem("oathbow")?.grants, () => true);
    expect(lit).toEqual([{ dice: m?.[1], damageType: m?.[2]?.toLowerCase() }]);
    expect(
      resolveItemBoundDamageRiders(getMagicItem("oathbow")?.grants, () => false)
    ).toEqual([]);
  });
});
