/**
 * The party chest's moves (Tesoro, owner 2026-11-02): put an item in, take it out, hand
 * out loot to oneself, to the chest, or split in equal shares. Pure plans: each move is
 * the documents it creates, the chest stacks it changes and the coins it moves, so one
 * undo checks that all of it is still as the move left it and takes it back.
 *
 * Nobody writes another player's sheet: what goes to a player becomes a pickup addressed
 * to them, which their own sheet collects when it next loads.
 */

import type {
  ChestItem,
  ChestItemRef,
  ChestLogEntry,
  CoinPurse,
  Pickup,
  TreasuryLogEntry,
} from "@/types/campaign";
import type { CurrencyUnit } from "@/data/types";

export type ChestCollection = "chest" | "pickups" | "chestLog";

export interface ChestDoc {
  collection: ChestCollection;
  id: string;
  data: ChestItem | Pickup | ChestLogEntry;
}

/** One chest stack before and after a move (`null`: absent). */
export interface ChestStackChange {
  id: string;
  before: ChestItem | null;
  after: ChestItem | null;
}

export interface ChestMove {
  created: ChestDoc[];
  changed: ChestStackChange[];
  /** Coins into the treasury, and the `treasuryLog` lines that record them. */
  treasury?: { delta: CoinPurse; entries: TreasuryLogEntry[] };
}

export interface MoveContext {
  uid: string;
  now: number;
  newId: () => string;
}

const COIN_ORDER: readonly CurrencyUnit[] = ["pp", "gp", "ep", "sp", "cp"];

function cleanPurse(coins: CoinPurse): CoinPurse {
  return Object.fromEntries(
    COIN_ORDER.flatMap((unit) => {
      const amount = Math.floor(coins[unit] ?? 0);
      return amount > 0 ? [[unit, amount]] : [];
    })
  );
}

const hasCoins = (coins: CoinPurse): boolean => Object.keys(coins).length > 0;

function logLine(
  ctx: MoveContext,
  line: Omit<ChestLogEntry, "id" | "by" | "at">
): ChestDoc {
  const id = ctx.newId();
  return { collection: "chestLog", id, data: { id, by: ctx.uid, at: ctx.now, ...line } };
}

function stack(
  ctx: MoveContext,
  item: ChestItemRef,
  quantity: number,
  note?: string
): ChestDoc {
  const id = ctx.newId();
  const data: ChestItem = {
    id,
    item,
    quantity,
    ...(note ? { note } : {}),
    addedBy: ctx.uid,
    at: ctx.now,
  };
  return { collection: "chest", id, data };
}

function pickup(
  ctx: MoveContext,
  ownerUid: string,
  reason: Pickup["reason"],
  content: { coins?: CoinPurse; item?: ChestItemRef; quantity?: number }
): ChestDoc {
  const id = ctx.newId();
  const data: Pickup = { id, ownerUid, reason, by: ctx.uid, at: ctx.now, ...content };
  return { collection: "pickups", id, data };
}

/** Put `quantity` of an item into the chest. */
export function planPut(
  ctx: MoveContext,
  input: { item: ChestItemRef; quantity: number; note?: string }
): ChestMove | null {
  const quantity = Math.floor(input.quantity);
  if (quantity < 1) return null;
  return {
    created: [
      stack(ctx, input.item, quantity, input.note?.trim() || undefined),
      logLine(ctx, { kind: "put", item: input.item, quantity }),
    ],
    changed: [],
  };
}

/** Take `quantity` of a chest stack: it leaves the chest as a pickup for the taker. */
export function planTake(
  ctx: MoveContext,
  current: ChestItem | null,
  input: { quantity: number }
): ChestMove | null {
  const quantity = Math.floor(input.quantity);
  if (!current || quantity < 1 || quantity > current.quantity) return null;
  const left = current.quantity - quantity;
  return {
    created: [
      pickup(ctx, ctx.uid, "take", { item: current.item, quantity }),
      logLine(ctx, { kind: "take", item: current.item, quantity }),
    ],
    changed: [
      {
        id: current.id,
        before: current,
        after: left > 0 ? { ...current, quantity: left } : null,
      },
    ],
  };
}

export type LootDestination = "me" | "chest" | "split";

/**
 * Hand out what was found. "me": a pickup for the one handing it out. "chest": coins to
 * the treasury, items to the chest. "split": the coins in equal shares, one pickup per
 * member with an attached character, the remainder and every item to the chest.
 */
export function planLoot(
  ctx: MoveContext,
  input: {
    coins: CoinPurse;
    items: ReadonlyArray<{ item: ChestItemRef; quantity: number }>;
    to: LootDestination;
    /** Who shares a split: the members with an attached character. */
    sharers: readonly string[];
  }
): ChestMove | null {
  const coins = cleanPurse(input.coins);
  const items = input.items
    .map((entry) => ({ ...entry, quantity: Math.floor(entry.quantity) }))
    .filter((entry) => entry.quantity >= 1);
  if (!hasCoins(coins) && items.length === 0) return null;
  const created: ChestDoc[] = [];
  let toTreasury: CoinPurse = {};
  if (input.to === "me") {
    if (hasCoins(coins)) created.push(pickup(ctx, ctx.uid, "loot", { coins }));
    for (const entry of items)
      created.push(
        pickup(ctx, ctx.uid, "loot", { item: entry.item, quantity: entry.quantity })
      );
  } else {
    for (const entry of items) created.push(stack(ctx, entry.item, entry.quantity));
    if (input.to === "chest" || input.sharers.length === 0) toTreasury = coins;
    else {
      const n = input.sharers.length;
      const share = cleanPurse(
        Object.fromEntries(
          COIN_ORDER.map((unit) => [unit, Math.floor((coins[unit] ?? 0) / n)])
        )
      );
      toTreasury = cleanPurse(
        Object.fromEntries(
          COIN_ORDER.map((unit) => [unit, (coins[unit] ?? 0) - (share[unit] ?? 0) * n])
        )
      );
      if (hasCoins(share)) {
        for (const ownerUid of input.sharers)
          created.push(pickup(ctx, ownerUid, "share", { coins: share }));
      }
    }
  }
  created.push(
    logLine(ctx, {
      kind: "loot",
      to: input.to,
      ...(hasCoins(coins) ? { coins } : {}),
      ...(items.length > 0
        ? { quantity: items.reduce((n, entry) => n + entry.quantity, 0) }
        : {}),
    })
  );
  const entries: TreasuryLogEntry[] = COIN_ORDER.flatMap((unit) => {
    const amount = toTreasury[unit];
    return amount
      ? [
          {
            amount,
            currency: unit,
            type: "add" as const,
            note: "loot",
            by: ctx.uid,
            at: new Date(ctx.now),
          },
        ]
      : [];
  });
  return {
    created,
    changed: [],
    ...(entries.length > 0 ? { treasury: { delta: toTreasury, entries } } : {}),
  };
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1)))
      : inner
  );

/**
 * Whether a move can still be undone: every document it created is still there as it
 * created it (a collected pickup is gone, so the move stays), and every chest stack it
 * changed is still as it left it.
 */
export function moveStillCurrent(
  move: ChestMove,
  read: (collection: ChestCollection, id: string) => unknown
): boolean {
  return (
    move.created.every((created) => {
      const now = read(created.collection, created.id);
      return (
        now !== null && now !== undefined && canonical(now) === canonical(created.data)
      );
    }) &&
    move.changed.every((change) => {
      const now = read("chest", change.id) ?? null;
      return canonical(now) === canonical(change.after);
    })
  );
}

/** What a pickup puts on its owner's sheet: coins, and an item for the bag. */
export function pickupForSheet(pickup: Pickup): {
  coins: CoinPurse | null;
  item:
    | { srdId: string; quantity: number }
    | { custom: true; name: string; quantity: number }
    | null;
} {
  const coins = pickup.coins ? cleanPurse(pickup.coins) : {};
  const quantity = Math.max(1, Math.floor(pickup.quantity ?? 1));
  const item = pickup.item
    ? "srdId" in pickup.item
      ? { srdId: pickup.item.srdId, quantity }
      : { custom: true as const, name: pickup.item.name, quantity }
    : null;
  return { coins: hasCoins(coins) ? coins : null, item };
}
