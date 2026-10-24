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
import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import { resolveItemBoundDamageRiders } from "@/lib/compute";
import type { Grant } from "@/lib/grants";
import {
  damageTrayPlan,
  initialTrayRow,
  onRoll20Amount,
  onRoll20Lines,
  onRoll20Option,
  rowAmount,
  setAttackOutcome,
  setD20Face,
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
import type { DamageType } from "@/types/damage";
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

/** Each sword is a Longsword; the Mace of Smiting is a Mace. */
const BASE_WEAPON: Record<string, string> = { "mace-of-smiting": "mace" };
const weaponOf = (itemId: string) => BASE_WEAPON[itemId] ?? "longsword";

function wielding(itemId: string): CharacterDoc {
  return makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [worn(itemId)],
    weapons: [{ srdId: weaponOf(itemId), quantity: 1, enchantItemId: itemId }],
  });
}

function trayFor(itemId: string) {
  const row = resolveActions(wielding(itemId)).find(
    (a) => a.source === "weapon" && a.weaponId === weaponOf(itemId)
  );
  if (!row) throw new Error(`no ${weaponOf(itemId)} row`);
  const action = localizeAction(row, "en");
  const plan = damageTrayPlan(action, ["monster-1"], "pc-me");
  if (!plan) throw new Error("no tray");
  return { action, plan };
}

function critical(
  itemId: string,
  creatureType?: CreatureType,
  defenses?: DamageDefenses
) {
  const { plan } = trayFor(itemId);
  const hit = initialTrayRow(plan, "monster-1", defenses, creatureType);
  // A natural 20: the d20 face is known, and it is a Critical Hit.
  return { plan, hit, crit: setD20Face(hit, 20, plan) };
}

/** Everything the on-a-20 riders add to a row on top of a rolled 0. */
function extraOn(itemId: string, creatureType?: CreatureType): number {
  const { plan, crit } = critical(itemId, creatureType);
  return rowAmount(0, crit, plan);
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

  it.each(ON_ROLL_20)("%s: only a natural 20 adds it, never any Critical", (id) => {
    const want = statedOnRoll20(id);
    const { plan, hit, crit } = critical(id);
    expect(crit.attack).toBe("critical");
    expect(crit.natural20).toBe(true);
    // A Champion's Critical Hit on a 19 (Improved Critical): no rider, nothing to confirm.
    const champion = setAttackOutcome(setD20Face(hit, 19, plan), "critical", plan);
    expect(champion.natural20).toBe(false);
    expect(onRoll20Amount(champion, plan)).toBe(0);
    expect(onRoll20Lines(champion, plan)).toEqual([]);
    expect(rowAmount(10, champion, plan)).toBe(10);
    expect(onRoll20Option(champion, plan)).toBeNull();
    // Only "Critical" tapped, face unknown: never added silently, offered instead.
    const tapped = setAttackOutcome(hit, "critical", plan);
    expect(rowAmount(10, tapped, plan)).toBe(10);
    expect(onRoll20Option(tapped, plan)).toMatchObject({ amount: want.amount });
    // Confirming the natural 20 adds it.
    expect(rowAmount(10, setD20Face(tapped, 20, plan), plan)).toBe(10 + want.amount);
    expect(onRoll20Option(crit, plan)).toBeNull();
  });

  it.each(ON_ROLL_20)("%s: never a hit-time option, nothing on a plain hit", (id) => {
    const { action } = trayFor(id);
    expect(
      combatDamageParts(action).filter((p) => p.id.startsWith("extra-"))
    ).toHaveLength(0);
    const { plan, hit } = critical(id);
    expect(onRoll20Amount(hit, plan)).toBe(0);
    expect(rowAmount(10, hit, plan)).toBe(10);
  });

  it("a rider of the primary type rides the primary's multiplier", () => {
    // Sword of Sharpness's 14 Slashing on a Longsword (Slashing): one amount, halved.
    const resistant = { ...NO_DEFENSES, resistances: new Set<DamageType>(["slashing"]) };
    const { plan, crit } = critical("sword-of-sharpness", undefined, resistant);
    expect(plan.damageType).toBe("slashing");
    expect(crit.multiplier).toBe("0.5");
    expect(onRoll20Amount(crit, plan)).toBe(14);
    expect(rowAmount(10, crit, plan)).toBe(Math.floor((10 + 14) / 2));
  });

  it("a rider of another type is its own line with its own multiplier", () => {
    // Sword of Life Stealing's 15 Necrotic on a Slashing hit.
    const slashResistant = {
      ...NO_DEFENSES,
      resistances: new Set<DamageType>(["slashing"]),
    };
    const resisted = critical("sword-of-life-stealing", "humanoid", slashResistant);
    expect(onRoll20Amount(resisted.crit, resisted.plan)).toBe(0);
    expect(onRoll20Lines(resisted.crit, resisted.plan)).toEqual([
      expect.objectContaining({ amount: 15, damageType: "necrotic", multiplier: "1" }),
    ]);
    // The resisted Slashing halves; the Necrotic stays whole.
    expect(rowAmount(10, resisted.crit, resisted.plan)).toBe(5 + 15);
    const necroticResistant = {
      ...NO_DEFENSES,
      resistances: new Set<DamageType>(["necrotic"]),
    };
    const own = critical("sword-of-life-stealing", "humanoid", necroticResistant);
    expect(own.crit.multiplier).toBe("1");
    expect(rowAmount(10, own.crit, own.plan)).toBe(10 + 7);
  });

  it("Sword of Life Stealing: not against a Construct or an Undead", () => {
    expect(text("sword-of-life-stealing")).toMatch(/isn’t a Construct or an Undead/);
    expect(extraOn("sword-of-life-stealing", "undead")).toBe(0);
    expect(extraOn("sword-of-life-stealing", "construct")).toBe(0);
    expect(extraOn("sword-of-life-stealing", "humanoid")).toBe(15);
    expect(extraOn("sword-of-life-stealing")).toBe(15);
  });

  it("Mace of Smiting: 7, or 14 if it's a Construct", () => {
    const m =
      /extra (\d+) Bludgeoning damage, or (\d+) Bludgeoning damage if it’s a Construct/.exec(
        text("mace-of-smiting")
      );
    const base = Number(m?.[1]);
    const vsConstruct = Number(m?.[2]);
    // Two riders: the base excluding Constructs, the Construct amount only for them.
    expect(
      resolveItemBoundDamageRiders(getMagicItem("mace-of-smiting")?.grants, () => false)
    ).toEqual([
      expect.objectContaining({
        dice: String(base),
        excludeCreatureTypes: ["construct"],
      }),
      expect.objectContaining({
        dice: String(vsConstruct),
        targetCreatureTypes: ["construct"],
      }),
    ]);
    expect(extraOn("mace-of-smiting")).toBe(base);
    expect(extraOn("mace-of-smiting", "construct")).toBe(vsConstruct);
    expect(extraOn("mace-of-smiting", "undead")).toBe(base);
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
