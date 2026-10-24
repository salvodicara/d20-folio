/**
 * The coins a cast's material component costs (SRD 5.2.1 "Material (M)"): a priced
 * component the spell consumes is offered as a one-tap deduction from the purse; a
 * kept one is only a reminder. Reads the spell's structured `{ gp, consumed }`
 * component facts (`activityFromSpell`), the ones the spell card's tag reads.
 */
import type { SrdSpellData } from "@/data/types";
import { activityFromSpell } from "@/lib/activities/from-spell";
import { coinPrice, NEXT_COIN } from "@/lib/coin-price";
import { srdText, uiText } from "@/lib/loc-text";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

export interface MaterialCost {
  spellId: string;
  gp: number;
  consumed: boolean;
}

type Currency = CharacterDoc["session"]["currency"];
export type CurrencyDelta = Partial<Record<keyof Currency, number>>;

/** The priced material component of a spell, or null (none, custom, unknown). */
export function castMaterialCost(spell: SrdSpellData | undefined): MaterialCost | null {
  if (!spell) return null;
  const components = activityFromSpell(spell).cost.components;
  if (!components?.gp) return null;
  return { spellId: spell.id, gp: components.gp, consumed: !!components.consumed };
}

/**
 * The coins that pay a `gp` price, in the price's own coin (see {@link coinPrice}):
 * that coin first, then the next coin up broken into it (the change comes back in
 * the price's coin) — gold then platinum, copper then silver. Null when those two
 * fall short; the other coins stay for the player to settle by hand.
 */
export function goldSpendDelta(currency: Currency, gp: number): CurrencyDelta | null {
  if (gp <= 0) return null;
  const { amount, coin } = coinPrice(gp);
  const next = NEXT_COIN[coin];
  const fromCoin = Math.min(currency[coin], amount);
  const rest = amount - fromCoin;
  if (rest === 0) return { [coin]: -amount };
  const broken = Math.ceil(rest / 10);
  if (broken > currency[next]) return null;
  const change = broken * 10 - rest;
  return { [coin]: change - fromCoin, [next]: -broken };
}

export function negateCurrencyDelta(delta: CurrencyDelta): CurrencyDelta {
  return Object.fromEntries(
    Object.entries(delta).map(([coin, amount]) => [coin, -amount])
  );
}

/** Move the named coins by their delta, or null when nothing moves. */
export function adjustCurrency(
  session: SessionState,
  delta: CurrencyDelta
): SessionState | null {
  const moves = Object.entries(delta).filter(([, amount]) => amount);
  if (moves.length === 0) return null;
  const currency = { ...session.currency };
  for (const [coin, amount] of moves) {
    const key = coin as keyof Currency;
    currency[key] = Math.max(0, currency[key] + amount);
  }
  return { ...session, currency };
}

/** The log line: "Spent 300 gp on Revivify" (the existing rider-use row). */
export function materialCostLogEvent(cost: MaterialCost): CombatEvent {
  const { amount, coin } = coinPrice(cost.gp);
  return {
    kind: "rider-use",
    action: srdText("spell", cost.spellId, "name"),
    rider: uiText(`equipment.coinAmount.${coin}`, { amount }),
    effect: "generic",
  };
}
