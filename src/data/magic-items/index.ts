import type { SrdMagicItemData } from "../types";
import { mergePack } from "@/lib/pack-merge";
import { packMagicItems } from "@pack";
import { MAGIC_ITEMS_PART_1 } from "./part-1";
import { MAGIC_ITEMS_PART_2 } from "./part-2";
import { MAGIC_ITEMS_PART_3 } from "./part-3";

/**
 * SRD Magic Items — D&D 2024 (Creative Commons). The roster was split out of a
 * single 627KB module into per-part files so no source file exceeds Babel's 500KB
 * codegen threshold; this barrel re-assembles it (public SRD + content pack)
 * and keeps the public API intact.
 */
export const SRD_MAGIC_ITEMS: SrdMagicItemData[] = mergePack(
  "magic-item",
  [...MAGIC_ITEMS_PART_1, ...MAGIC_ITEMS_PART_2, ...MAGIC_ITEMS_PART_3],
  packMagicItems
).sort((a, b) => a.id.localeCompare(b.id));

/** Magic item lookup by ID */
export const MAGIC_ITEMS_BY_ID: ReadonlyMap<string, SrdMagicItemData> = new Map(
  SRD_MAGIC_ITEMS.map((item) => [item.id, item])
);

/** Get a magic item by ID */
export function getMagicItem(id: string): SrdMagicItemData | undefined {
  return MAGIC_ITEMS_BY_ID.get(id);
}

/** Get all magic item IDs */
export function getAllMagicItemIds(): string[] {
  return SRD_MAGIC_ITEMS.map((item) => item.id);
}

/** Filter magic items by rarity */
export function getMagicItemsByRarity(
  rarity: SrdMagicItemData["rarity"]
): SrdMagicItemData[] {
  return SRD_MAGIC_ITEMS.filter((item) => item.rarity === rarity);
}

/** Filter magic items by type */
export function getMagicItemsByType(type: SrdMagicItemData["type"]): SrdMagicItemData[] {
  return SRD_MAGIC_ITEMS.filter((item) => item.type === type);
}

/** Filter magic items that require attunement */
export function getMagicItemsRequiringAttunement(): SrdMagicItemData[] {
  return SRD_MAGIC_ITEMS.filter((item) => item.attunement);
}
