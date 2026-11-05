/**
 * A magic item's rules beyond its wearer's sheet (edge-case M20,
 * docs/architecture/2026-11-dm-state-and-roster.md). This module holds the public
 * ones, which hide nothing: the damage an item takes as an object, and a sentient
 * item's conflict DC. Pure.
 */
import { getMagicItem } from "@/data/magic-items";
import { abilityModifier } from "@/lib/ability";

/** The damage a magic item takes (SRD 5.2.1 "Magic Items"): most have Resistance to
 *  all damage; Potions and Scrolls, and anything the catalogue doesn't know, take it
 *  whole. */
export function damageToItem(itemId: string, amount: number): number {
  const item = getMagicItem(itemId);
  if (!item || item.type === "potion" || item.type === "scroll") return amount;
  return Math.floor(amount / 2);
}

/** A sentient item's conflict: its bearer's Charisma save against 12 + the item's
 *  Charisma modifier. */
export function sentientConflictDc(item: { charisma: number }): number {
  return 12 + abilityModifier(item.charisma);
}
