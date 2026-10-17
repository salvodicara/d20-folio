/**
 * Buying and selling a catalogue item with the character's coins (SRD 5.2.1 "Coins":
 * 1 pp = 10 gp, 1 gp = 2 ep = 10 sp = 100 cp; "Selling Treasure": ordinary equipment
 * sells for half its price). Paying makes change across every coin, the way D&D Beyond
 * and Foundry dnd5e convert currency: the price's own coin first, then the larger coins
 * broken as few as needed, then the smaller ones; the change comes back in the
 * largest coins that fit. Prices travel as copper so no rounding hides a coin.
 */
import type { CurrencyUnit, SrdEquipmentData } from "@/data/types";
import { srdText } from "@/lib/loc-text";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import type { CurrencyDelta } from "./material-cost";

type Currency = CharacterDoc["session"]["currency"];

/** Each coin's worth in copper pieces. */
export const COIN_CP: Readonly<Record<CurrencyUnit, number>> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

const BY_VALUE: readonly CurrencyUnit[] = ["cp", "sp", "ep", "gp", "pp"];
/** The coins change and sales are counted out in (no electrum, no platinum: a
 *  merchant pays in the common coins, as the SRD prices are named). */
const CHANGE_COINS: readonly CurrencyUnit[] = ["gp", "sp", "cp"];

/** The whole purse in copper. */
export function purseCp(currency: Currency): number {
  return BY_VALUE.reduce((sum, coin) => sum + currency[coin] * COIN_CP[coin], 0);
}

/** What `units` of a catalogue item cost, in copper (a bundle item, such as 20
 *  Arrows, is priced per bundle). */
export function purchasePriceCp(item: SrdEquipmentData, units: number): number {
  const bundle = item.bundleSize ?? 1;
  return Math.round((item.cost.amount * COIN_CP[item.cost.unit] * units) / bundle);
}

/** Half the list price of ONE item (one piece of a bundle), rounded down to the copper. */
export function salePriceCp(item: SrdEquipmentData): number {
  const bundle = item.bundleSize ?? 1;
  return Math.floor((item.cost.amount * COIN_CP[item.cost.unit]) / bundle / 2);
}

/** A copper total counted out in gold, silver and copper (37 gp 5 sp). */
export function coinParts(cp: number): Array<{ amount: number; coin: CurrencyUnit }> {
  const parts: Array<{ amount: number; coin: CurrencyUnit }> = [];
  let rest = cp;
  for (const coin of CHANGE_COINS) {
    const amount = Math.floor(rest / COIN_CP[coin]);
    if (amount > 0) parts.push({ amount, coin });
    rest -= amount * COIN_CP[coin];
  }
  return parts;
}

/** A copper total as the player reads it ("37 gp 5 sp", IT "37 mo 5 ma"); `t` names
 *  each coin from the `equipment.currencyAbbr` catalogue. */
export function coinsText(cp: number, t: (key: string) => string): string {
  return coinParts(cp)
    .map(({ amount, coin }) => `${amount} ${t(`equipment.currencyAbbr.${coin}`)}`)
    .join(" ");
}

/** The coin a price is best named in: the largest of gp / sp / cp that counts it whole. */
function priceCoin(cp: number): CurrencyUnit {
  return CHANGE_COINS.find((coin) => cp % COIN_CP[coin] === 0) ?? "cp";
}

/**
 * The coins that pay `priceCp`, change included, or null when the whole purse is
 * worth less. Order: the price's own coin, the larger coins smallest first, then the
 * smaller coins largest first; each gives no more coins than still needed, and what
 * the last coin overpays comes back as change.
 */
export function paymentDelta(currency: Currency, priceCp: number): CurrencyDelta | null {
  if (priceCp <= 0 || purseCp(currency) < priceCp) return null;
  const own = priceCoin(priceCp);
  const ownValue = COIN_CP[own];
  const order = [
    own,
    ...BY_VALUE.filter((coin) => COIN_CP[coin] > ownValue),
    ...BY_VALUE.filter((coin) => COIN_CP[coin] < ownValue).reverse(),
  ];
  const delta: CurrencyDelta = {};
  let remaining = priceCp;
  for (const coin of order) {
    if (remaining <= 0) break;
    const taken = Math.min(currency[coin], Math.ceil(remaining / COIN_CP[coin]));
    if (taken === 0) continue;
    delta[coin] = -taken;
    remaining -= taken * COIN_CP[coin];
  }
  for (const { amount, coin } of coinParts(-remaining)) {
    delta[coin] = (delta[coin] ?? 0) + amount;
  }
  return Object.fromEntries(Object.entries(delta).filter(([, amount]) => amount !== 0));
}

/** The coins a sale brings in, or null when it is worth nothing. */
export function saleDelta(cp: number): CurrencyDelta | null {
  if (cp <= 0) return null;
  return Object.fromEntries(coinParts(cp).map(({ amount, coin }) => [coin, amount]));
}

/** The log line of a purchase or a sale: the item's catalogue id and the copper. */
export function itemTradeLogEvent(
  trade: "buy" | "sell",
  itemId: string,
  cp: number
): CombatEvent {
  return { kind: "item-trade", trade, item: srdText("equipment", itemId, "name"), cp };
}
