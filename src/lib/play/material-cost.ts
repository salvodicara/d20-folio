/**
 * The gold a cast's material component costs (SRD 5.2.1 "Material (M)"): a priced
 * component the spell consumes is offered as a one-tap deduction from the purse; a
 * kept one is only a reminder. Reads the spell's structured `{ gp, consumed }`
 * component facts (`activityFromSpell`), the ones the spell card's tag reads.
 */
import { getSpellById } from "@/data/spells";
import { activityFromSpell } from "@/lib/activities/from-spell";
import { srdText } from "@/lib/loc-text";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

export interface MaterialCost {
  spellId: string;
  gp: number;
  consumed: boolean;
}

type Currency = CharacterDoc["session"]["currency"];
export type CurrencyDelta = Partial<Record<keyof Currency, number>>;

const GP_PER_PP = 10;

/** The priced material component of a spell, or null (none, custom, unknown). */
export function castMaterialCost(spellId: string | undefined): MaterialCost | null {
  const spell = spellId ? getSpellById(spellId) : undefined;
  if (!spell) return null;
  const components = activityFromSpell(spell).cost.components;
  if (!components?.gp) return null;
  return { spellId: spell.id, gp: components.gp, consumed: !!components.consumed };
}

/**
 * The coins that pay `gp` gold: gold pieces first, then platinum broken into gold
 * (the change comes back as gold). Null when gold and platinum together fall short;
 * the smaller coins stay for the player to settle by hand.
 */
export function goldSpendDelta(currency: Currency, gp: number): CurrencyDelta | null {
  if (gp <= 0) return null;
  const fromGold = Math.min(currency.gp, gp);
  const rest = gp - fromGold;
  if (rest === 0) return { gp: -gp };
  const platinum = Math.ceil(rest / GP_PER_PP);
  if (platinum > currency.pp) return null;
  const change = platinum * GP_PER_PP - rest;
  return { gp: change - fromGold, pp: -platinum };
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
  return {
    kind: "rider-use",
    action: srdText("spell", cost.spellId, "name"),
    rider: { lit: { en: `${cost.gp} gp`, it: `${cost.gp} mo` } },
    effect: "generic",
  };
}
