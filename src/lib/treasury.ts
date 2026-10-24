/**
 * The treasury model (owner direction 2026-10-23, row 15; design note
 * docs/architecture/treasury.md). Every coin has exactly one owner, a character or
 * the party chest. Coins only change hands through a {@link TreasuryMove}, a logged
 * record from one owner (or "found", from outside the party) to another (or "spent",
 * out of it). There is no "set the total", and every move can be undone by its
 * reverse ({@link reverseMove}). The campaign's treasury is a view, the sum of what
 * its owners hold.
 *
 * Pure: no store, no persistence. Coins are whole and never negative. A split keeps
 * each coin whole unless the table asks it to make change (owner, 2026-10-24: the
 * common practice, remainder to the chest, with exact change as an option).
 */
import type { CurrencyUnit } from "@/data/types";

export type Purse = Record<CurrencyUnit, number>;

export type TreasuryOwner =
  | { kind: "character"; characterId: string }
  | { kind: "chest" };

/** Outside the party: where found coins come from and spent ones go. */
export type TreasuryOutside = { kind: "found" } | { kind: "spent" };

export interface TreasuryMove {
  id: string;
  from: TreasuryOwner | TreasuryOutside;
  to: TreasuryOwner | TreasuryOutside;
  coins: Purse;
  /** The move this one undoes (its exact reverse). */
  undoes?: string;
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

const isOutside = (end: TreasuryMove["from"]): end is TreasuryOutside =>
  end.kind === "found" || end.kind === "spent";

/** What each coin is worth in copper (SRD 5.2.1 "Coins"). */
const COPPER: Record<CurrencyUnit, number> = { pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1 };

/** A purse's worth in copper pieces. */
export function purseValueCp(coins: Partial<Purse>): number {
  const purse = purseOf(coins);
  return COINS.reduce((sum, coin) => sum + purse[coin] * COPPER[coin], 0);
}

/** The undo of `move`: the same coins back the other way, linked to it. */
export function reverseMove(
  move: TreasuryMove,
  id: string,
  meta: { by: string; at: number; note: string }
): TreasuryMove {
  return {
    id,
    from: move.to,
    to: move.from,
    coins: move.coins,
    undoes: move.id,
    ...meta,
  };
}

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
  if (!isOutside(move.from)) {
    const key = ownerKey(move.from);
    const from = purseOf(next[key] ?? {});
    if (COINS.some((coin) => from[coin] < coins[coin])) return null;
    next[key] = Object.fromEntries(
      COINS.map((coin) => [coin, from[coin] - coins[coin]])
    ) as Purse;
  }
  if (!isOutside(move.to)) {
    const key = ownerKey(move.to);
    const to = purseOf(next[key] ?? {});
    next[key] = Object.fromEntries(
      COINS.map((coin) => [coin, to[coin] + coins[coin]])
    ) as Purse;
  }
  return next;
}

/**
 * Who found loot goes to: one owner ("to me", "to the chest") or a split. A split
 * keeps each coin whole; `makeChange` breaks what doesn't divide into the next coin
 * down so the shares come out equal.
 */
export type LootAssignment =
  | { to: TreasuryOwner }
  | { split: readonly TreasuryOwner[]; makeChange?: boolean };

/** Where a coin that doesn't divide is broken into: the next coin down, and how many. */
const CHANGE: Partial<Record<CurrencyUnit, { into: CurrencyUnit; count: number }>> = {
  pp: { into: "gp", count: 10 },
  gp: { into: "sp", count: 10 },
  ep: { into: "sp", count: 5 },
  sp: { into: "cp", count: 10 },
};

/**
 * The moves that bring found coins into the party. A split divides each coin evenly
 * among the owners named (breaking coins into change when asked); what still doesn't
 * divide goes to the chest, so nothing is lost.
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
  // Highest coin first, so a coin broken into change is divided with the next one.
  const pool = { ...coins };
  const share = emptyPurse();
  const leftover = emptyPurse();
  for (const coin of COINS) {
    share[coin] = Math.floor(pool[coin] / among.length);
    const rest = pool[coin] - share[coin] * among.length;
    const change = assignment.makeChange ? CHANGE[coin] : undefined;
    if (change) pool[change.into] += rest * change.count;
    else leftover[coin] = rest;
  }
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
