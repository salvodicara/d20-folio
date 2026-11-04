/**
 * Spending Hit Point Dice outside a rest (pack case C7): a feature or spell lets a
 * creature roll some of its unexpended Hit Point Dice and gain the total plus a
 * bonus, as healing, extra damage, temporary HP or a bonus to a saving throw.
 * Pure: how many dice may be spent and what a roll gives; the dice and the roll
 * stay the player's.
 */
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { totalLevel } from "@/lib/classes";
import { abilityModifier, aggregateAbilityScores } from "@/lib/compute";
import { hitDicePool } from "@/lib/play/hit-dice";
import { proficiencyBonus } from "@/lib/proficiency";
import type { CharacterDoc } from "@/types/character";

/** A rule's spend, as the catalogue authors it (trigger `do` or spell effect). */
export interface HitPointDiceRule {
  /** How many dice: a number, or the slot's level. */
  max: number | "slot-level";
  /** One more die per slot level above the spell's. */
  perUpcast?: number;
  /** Added once to the total. */
  bonus?: "slot-level" | "spellcasting-mod" | "con-mod" | "proficiency";
  /** What the total becomes (healing when absent). */
  into?: "healing" | "damage" | "temp-hp" | "save";
  /** Only an even roll gives anything. */
  evenOnly?: true;
  /** Where an odd roll goes instead (an even one goes `into`). */
  oddInto?: "healing" | "damage" | "temp-hp" | "save";
  /** The target spends its own dice; the spender otherwise. */
  spender?: "target";
  /** Exactly `max` dice, not up to `max`. */
  exactly?: true;
}

/** What the player may spend now, and the bonus the total gains. */
export interface HitPointDiceOffer {
  min: number;
  max: number;
  bonus: number;
  into: NonNullable<HitPointDiceRule["into"]>;
  evenOnly: boolean;
  /** Where an odd roll goes, when the rule splits even from odd. */
  oddInto?: NonNullable<HitPointDiceRule["into"]>;
}

/** The numbers a spend reads. `slotLevel`/`spellLevel` only for a spell's cast. */
export interface HitPointDiceContext {
  /** The spender's unexpended Hit Point Dice. */
  available: number;
  slotLevel?: number;
  spellLevel?: number;
  spellcastingMod: number;
  conMod: number;
  proficiency: number;
}

/** The numbers a character's spend reads: its unexpended dice and its effective
 *  modifiers (an Amulet of Health counts), plus the cast's levels when a spell
 *  makes the offer. */
export function hitPointDiceContext(
  doc: CharacterDoc,
  cast?: { slotLevel: number; spellLevel: number }
): HitPointDiceContext {
  const character = doc.character;
  const total = hitDicePool(character).reduce((n, entry) => n + entry.count, 0);
  const scores = aggregateAbilityScores(
    character.abilityScores,
    aggregateCharacterGrants(character, doc.session),
    character.abilityScoreOverrides
  );
  const ability = character.spellcasting?.ability;
  return {
    available: Math.max(0, total - doc.session.hitDice.used),
    ...(cast ?? {}),
    spellcastingMod: ability ? abilityModifier(scores[ability]) : 0,
    conMod: abilityModifier(scores.CON),
    proficiency: proficiencyBonus(totalLevel(character)),
  };
}

/** The offer a rule makes now, or null when the spender has no dice left. */
export function hitPointDiceSpend(
  rule: HitPointDiceRule,
  ctx: HitPointDiceContext
): HitPointDiceOffer | null {
  if (ctx.available <= 0) return null;
  const slot = ctx.slotLevel ?? 0;
  const base = rule.max === "slot-level" ? slot : rule.max;
  const upcast = Math.max(0, slot - (ctx.spellLevel ?? slot)) * (rule.perUpcast ?? 0);
  const max = Math.min(ctx.available, base + upcast);
  if (max <= 0) return null;
  return {
    min: rule.exactly ? max : 0,
    max,
    bonus: bonusOf(rule.bonus, ctx),
    into: rule.into ?? "healing",
    evenOnly: rule.evenOnly === true,
    ...(rule.oddInto ? { oddInto: rule.oddInto } : {}),
  };
}

function bonusOf(bonus: HitPointDiceRule["bonus"], ctx: HitPointDiceContext): number {
  switch (bonus) {
    case "slot-level":
      return ctx.slotLevel ?? 0;
    case "spellcasting-mod":
      return ctx.spellcastingMod;
    case "con-mod":
      return ctx.conMod;
    case "proficiency":
      return ctx.proficiency;
    case undefined:
      return 0;
  }
}

/** What `count` dice rolling `rolled` give: the total plus the bonus, never below
 *  0; nothing with no dice spent, or an odd roll where only an even one counts. */
export function hitPointDiceAmount(
  offer: HitPointDiceOffer,
  count: number,
  rolled: number
): number {
  if (count <= 0) return 0;
  if (offer.evenOnly && rolled % 2 !== 0) return 0;
  return Math.max(0, rolled + offer.bonus);
}

/** What `count` dice rolling `rolled` give and where it goes: an odd roll goes to
 *  `oddInto` when the rule splits them (temporary HP on even, damage on odd). */
export function hitPointDiceGain(
  offer: HitPointDiceOffer,
  count: number,
  rolled: number
): { amount: number; into: HitPointDiceOffer["into"] } {
  const odd = rolled % 2 !== 0;
  if (offer.oddInto && odd && count > 0) {
    return { amount: Math.max(0, rolled + offer.bonus), into: offer.oddInto };
  }
  return { amount: hitPointDiceAmount(offer, count, rolled), into: offer.into };
}
