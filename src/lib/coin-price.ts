/** The coins a price is named in. */
export const PRICE_COINS = ["cp", "sp", "gp"] as const;
export type PriceCoin = (typeof PRICE_COINS)[number];

/** The next coin up from a price's coin; each is worth ten of the one before. */
export const NEXT_COIN = { cp: "sp", sp: "gp", gp: "pp" } as const;

/**
 * A gp price named in its own coin: the largest of copper/silver/gold that counts it
 * whole (300 → 300 gp, 0.5 → 5 sp, 0.02 → 2 cp — Gentle Repose's "2 copper pieces").
 */
export function coinPrice(gp: number): { amount: number; coin: PriceCoin } {
  const cp = Math.round(gp * 100);
  if (cp % 100 === 0) return { amount: cp / 100, coin: "gp" };
  if (cp % 10 === 0) return { amount: cp / 10, coin: "sp" };
  return { amount: cp, coin: "cp" };
}
