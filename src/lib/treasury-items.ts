/**
 * The treasury's items (owner direction 2026-10-23, row 15; design note
 * docs/architecture/treasury.md). Like coins, every item has exactly one owner, a
 * character or the party chest, and changes hands only through an {@link ItemMove}: a
 * logged record that can always be undone ({@link reverseItemMove}).
 *
 * A whole item moves as it is, except that its new owner neither wears nor attunes to
 * it yet (its undo puts both back). Part of a stack (3 of 10 arrows) starts a new stack
 * at the receiver (`splitAs`) or joins one of theirs (`mergeInto`). An item found comes
 * in from outside with the move; a sold or broken one goes out ("spent").
 *
 * Pure: no store, no persistence. Every item here carries an `instanceId` (the wiring
 * gives one to a plain stack that has none).
 */
import type { CustomEquipment, SrdEquipmentRef } from "@/types/character";
import { ownerKey, type TreasuryOutside, type TreasuryOwner } from "./treasury";

export type TreasuryItem = (SrdEquipmentRef & { instanceId: string }) | CustomEquipment;

/** What items each owner holds, by `ownerKey`. An absent owner holds none. */
export type ItemHoldings = Readonly<Record<string, readonly TreasuryItem[]>>;

export interface ItemMove {
  id: string;
  from: TreasuryOwner | TreasuryOutside;
  to: TreasuryOwner | TreasuryOutside;
  /** The item at the source; for a found item, the new item's id. */
  instanceId: string;
  /** How many (a single item is 1). */
  quantity: number;
  /** The item itself, when it comes from outside the party. */
  item?: TreasuryItem;
  /** The id the moved part takes when it starts a new stack at the receiver. */
  splitAs?: string;
  /** The receiver's stack of the same item it joins. */
  mergeInto?: string;
  /** Worn and attuned again on arrival (an undo puts back what the move took off). */
  restore?: { equipped?: boolean; attuned?: boolean };
  /** Set when applied: the whole entry left its owner, worn and attuned like this. */
  took?: { equipped?: boolean; attuned?: boolean };
  /** The move this one undoes. */
  undoes?: string;
  by: string;
  at: number;
  note: string;
}

const isOutside = (end: ItemMove["from"]): end is TreasuryOutside =>
  end.kind === "found" || end.kind === "spent";

const countOf = (item: TreasuryItem): number => item.quantity ?? 1;

const sameItem = (a: TreasuryItem, b: TreasuryItem): boolean =>
  "custom" in a
    ? "custom" in b && a.name === b.name
    : !("custom" in b) && a.srdId === b.srdId;

/** The item as it arrives: no longer worn or attuned, unless the move restores it. */
function arriving(
  item: TreasuryItem,
  instanceId: string,
  quantity: number | undefined,
  restore: ItemMove["restore"]
): TreasuryItem {
  const { equipped: _equipped, attuned: _attuned, quantity: _quantity, ...rest } = item;
  void _equipped;
  void _attuned;
  void _quantity;
  return {
    ...rest,
    instanceId,
    ...(quantity !== undefined ? { quantity } : {}),
    ...(restore?.equipped ? { equipped: true } : {}),
    ...(restore?.attuned ? { attuned: true } : {}),
  };
}

/**
 * The holdings after `move`, and the move as applied (with what it took off, so its
 * undo is exact), or null when it can't happen: an item the owner doesn't have, more
 * than the stack holds, part of a stack with nowhere to go, a stack joined to a
 * different item, an id the receiver already uses, or no quantity.
 */
export function applyItemMove(
  holdings: ItemHoldings,
  move: ItemMove
): { holdings: ItemHoldings; applied: ItemMove } | null {
  const { quantity } = move;
  if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
  const next: Record<string, readonly TreasuryItem[]> = { ...holdings };
  let source: TreasuryItem;
  let whole: boolean;
  let applied: ItemMove = move;

  if (isOutside(move.from)) {
    if (!move.item || move.item.instanceId !== move.instanceId) return null;
    source = move.item;
    whole = true;
  } else {
    const key = ownerKey(move.from);
    const items = next[key] ?? [];
    const found = items.find((i) => i.instanceId === move.instanceId);
    if (!found || quantity > countOf(found)) return null;
    source = found;
    whole = quantity === countOf(found);
    if (!whole && !move.splitAs && !move.mergeInto) return null;
    next[key] = whole
      ? items.filter((i) => i !== found)
      : items.map((i) => (i === found ? { ...i, quantity: countOf(i) - quantity } : i));
    if (whole)
      applied = { ...move, took: { equipped: found.equipped, attuned: found.attuned } };
  }

  if (!isOutside(move.to)) {
    const key = ownerKey(move.to);
    const items = next[key] ?? [];
    if (move.mergeInto) {
      const target = items.find((i) => i.instanceId === move.mergeInto);
      if (!target || !sameItem(target, source)) return null;
      next[key] = items.map((i) =>
        i === target ? { ...i, quantity: countOf(i) + quantity } : i
      );
    } else {
      const id = move.splitAs ?? move.instanceId;
      if (items.some((i) => i.instanceId === id)) return null;
      const keepCount = whole && source.quantity === undefined ? undefined : quantity;
      next[key] = [...items, arriving(source, id, keepCount, move.restore)];
    }
  }
  return { holdings: next, applied };
}

/**
 * The undo of an applied move: the same items back where they came from. A whole item
 * comes back as it was (worn, attuned, with its own id); part of a stack rejoins the
 * stack it left; a found item goes back out.
 */
export function reverseItemMove(
  applied: ItemMove,
  id: string,
  meta: { by: string; at: number; note: string }
): ItemMove {
  const here = applied.mergeInto ?? applied.splitAs ?? applied.instanceId;
  const back: ItemMove = {
    id,
    from: applied.to,
    to: applied.from,
    instanceId: here,
    quantity: applied.quantity,
    undoes: applied.id,
    ...meta,
  };
  if (isOutside(applied.from)) return back;
  return applied.took
    ? { ...back, splitAs: applied.instanceId, restore: applied.took }
    : { ...back, mergeInto: applied.instanceId };
}
