/**
 * The Tesoro tab's chest: what the loot window promises before Confirm, read off the
 * engine's own plan (`planLoot`), so the preview and the move can never disagree; an
 * item's name in the reader's language; and «Chi ha preso cosa» with coins and items
 * together, newest first.
 */
import type { ChestMove } from "@/features/campaigns/chest";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type {
  ChestItemRef,
  ChestLogEntry,
  CoinPurse,
  Pickup,
  TreasuryLogEntry,
} from "@/types/campaign";

export interface LootSummary {
  /** What each sharer gets (a split), or null. */
  share: CoinPurse | null;
  sharers: number;
  /** Coins that go into the shared chest's purse. */
  toChest: CoinPurse;
  /** How many items go into the chest. */
  itemsToChest: number;
  /** What waits for the one handing it out («a me»), or null. */
  toMe: { coins: CoinPurse; items: number } | null;
}

export function lootSummary(move: ChestMove | null): LootSummary | null {
  if (!move) return null;
  const pickups = move.created.flatMap((d) =>
    d.collection === "pickups" ? [d.data as Pickup] : []
  );
  const shares = pickups.filter((p) => p.reason === "share");
  const mine = pickups.filter((p) => p.reason === "loot");
  const itemsToChest = move.created.reduce(
    (n, d) =>
      n + (d.collection === "chest" ? (d.data as { quantity: number }).quantity : 0),
    0
  );
  return {
    share: shares[0]?.coins ?? null,
    sharers: shares.length,
    toChest: move.treasury?.delta ?? {},
    itemsToChest,
    toMe:
      mine.length > 0
        ? {
            coins: mine.reduce<CoinPurse>(
              (acc, p) => ({ ...acc, ...(p.coins ?? {}) }),
              {}
            ),
            items: mine.reduce((n, p) => n + (p.item ? (p.quantity ?? 1) : 0), 0),
          }
        : null,
  };
}

/** A chest item's name: the catalogue's, in the reader's language, or the typed one. */
export function chestItemName(ref: ChestItemRef, locale: Locale): string {
  if ("custom" in ref) return ref.name;
  for (const kind of ["equipment", "magic-item"] as const)
    if (hasSrd(kind, ref.srdId, "name", locale))
      return localizeSrd(kind, ref.srdId, "name", locale);
  return ref.srdId;
}

export type HistoryLine =
  | {
      kind: "coins";
      at: number;
      who: string | null;
      direction: "in" | "out";
      entry: TreasuryLogEntry;
    }
  | { kind: ChestLogEntry["kind"]; at: number; who: string | null; entry: ChestLogEntry };

export function treasuryAndChestHistory(
  coins: readonly TreasuryLogEntry[],
  items: readonly ChestLogEntry[],
  players: Readonly<Record<string, string>>
): HistoryLine[] {
  return [
    // Loot's coins are told by its own line; the coin line it also wrote stays for v0.25.
    ...coins
      .filter((entry) => entry.note !== "loot")
      .map(
        (entry): HistoryLine => ({
          kind: "coins",
          at: entry.at.getTime(),
          who: players[entry.by] ?? null,
          direction: entry.type === "add" ? "in" : "out",
          entry,
        })
      ),
    ...items.map(
      (entry): HistoryLine => ({
        kind: entry.kind,
        at: entry.at,
        who: players[entry.by] ?? null,
        entry,
      })
    ),
  ].sort((a, b) => b.at - a.at);
}
