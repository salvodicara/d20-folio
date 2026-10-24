/**
 * The treasury model (owner direction 2026-10-23, row 15; design note
 * docs/architecture/treasury.md). Every coin has exactly one owner, a character or
 * the party chest. Coins only change hands through a {@link TreasuryMove}, a logged
 * record from one owner (or "found", from outside the party) to another (or "spent",
 * out of it). There is no "set the total": a correction is a move back. The
 * campaign's treasury is a view, the sum of what its owners hold.
 *
 * Pure: no store, no persistence. Coins are whole, never negative, and never changed
 * into other coins here (a split divides each coin on its own).
 */
import type { CurrencyUnit } from "@/data/types";

export type Purse = Record<CurrencyUnit, number>;

export type TreasuryOwner =
  | { kind: "character"; characterId: string }
  | { kind: "chest" };

export interface TreasuryMove {
  id: string;
  from: TreasuryOwner | { kind: "found" };
  to: TreasuryOwner | { kind: "spent" };
  coins: Purse;
  /** The member who made the move. */
  by: string;
  /** When (ms since epoch). */
  at: number;
  note: string;
}

/** What each owner holds, by {@link ownerKey}. An absent owner holds nothing. */
export type Holdings = Readonly<Record<string, Purse>>;

/** The coins in canonical order (highest first). */
export const COINS: readonly CurrencyUnit[] = ["pp", "gp", "ep", "sp", "cp"];

export function emptyPurse(): Purse {
  return { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
}

export function ownerKey(owner: TreasuryOwner): string {
  return owner.kind === "chest" ? "chest" : `character:${owner.characterId}`;
}

function purseOf(coins: Partial<Purse>): Purse {
  return { ...emptyPurse(), ...coins };
}

const isEmpty = (purse: Purse): boolean => COINS.every((coin) => purse[coin] === 0);

/**
 * The holdings after `move`, or null when it can't happen: nothing to move, a
 * negative or fractional amount, or more than its owner holds.
 */
export function applyMove(holdings: Holdings, move: TreasuryMove): Holdings | null {
  const { coins } = move;
  if (!COINS.every((coin) => Number.isSafeInteger(coins[coin]) && coins[coin] >= 0))
    return null;
  if (isEmpty(coins)) return null;
  const next: Record<string, Purse> = { ...holdings };
  if (move.from.kind !== "found") {
    const key = ownerKey(move.from);
    const from = purseOf(next[key] ?? {});
    if (COINS.some((coin) => from[coin] < coins[coin])) return null;
    next[key] = Object.fromEntries(
      COINS.map((coin) => [coin, from[coin] - coins[coin]])
    ) as Purse;
  }
  if (move.to.kind !== "spent") {
    const key = ownerKey(move.to);
    const to = purseOf(next[key] ?? {});
    next[key] = Object.fromEntries(
      COINS.map((coin) => [coin, to[coin] + coins[coin]])
    ) as Purse;
  }
  return next;
}

/** Who found loot goes to: one owner ("to me", "to the chest") or a split. */
export type LootAssignment = { to: TreasuryOwner } | { split: readonly TreasuryOwner[] };

/**
 * The moves that bring found coins into the party. A split divides each coin evenly
 * among the owners named; what doesn't divide goes to the chest, so nothing is lost.
 * One move per owner who receives something, ids `${id}-${n}` for a split.
 */
export function lootMoves(
  found: Partial<Purse>,
  assignment: LootAssignment,
  id: string,
  meta: { by: string; at: number; note: string }
): TreasuryMove[] {
  const coins = purseOf(found);
  const from = { kind: "found" } as const;
  if ("to" in assignment) return [{ id, from, to: assignment.to, coins, ...meta }];
  const among = assignment.split;
  if (among.length === 0) return [{ id, from, to: { kind: "chest" }, coins, ...meta }];
  const share = Object.fromEntries(
    COINS.map((coin) => [coin, Math.floor(coins[coin] / among.length)])
  ) as Purse;
  const leftover = Object.fromEntries(
    COINS.map((coin) => [coin, coins[coin] - share[coin] * among.length])
  ) as Purse;
  const shares: { to: TreasuryOwner; coins: Purse }[] = among.map((to) => ({
    to,
    coins: share,
  }));
  if (!isEmpty(leftover)) {
    // The chest may itself be one of the owners named: its share and the leftover merge.
    const chest = shares.find((s) => s.to.kind === "chest");
    if (chest)
      chest.coins = Object.fromEntries(
        COINS.map((coin) => [coin, chest.coins[coin] + leftover[coin]])
      ) as Purse;
    else shares.push({ to: { kind: "chest" }, coins: leftover });
  }
  return shares
    .filter((s) => !isEmpty(s.coins))
    .map((s, n) => ({ id: `${id}-${n}`, from, to: s.to, coins: s.coins, ...meta }));
}

export interface CampaignHoldings {
  chest: Purse;
  members: { characterId: string; purse: Purse }[];
  /** Everything the party holds, chest included. */
  total: Purse;
}

/** The campaign's treasury view: the chest, each member's purse and their sum. */
export function campaignHoldings(holdings: Holdings): CampaignHoldings {
  const members = Object.entries(holdings).flatMap(([key, purse]) =>
    key.startsWith("character:")
      ? [{ characterId: key.slice("character:".length), purse: purseOf(purse) }]
      : []
  );
  const chest = purseOf(holdings.chest ?? {});
  const total = Object.fromEntries(
    COINS.map((coin) => [
      coin,
      chest[coin] + members.reduce((sum, m) => sum + m.purse[coin], 0),
    ])
  ) as Purse;
  return { chest, members, total };
}
