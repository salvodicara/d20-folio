/** Pure construction of inventory refs for physical magic-item copies. */

import type { SrdMagicItemData } from "@/data/types";
import type { SrdEquipmentRef } from "@/types/character";
import { parseMagicItemAcBonus, parseMagicItemCharges } from "@/lib/magic-item-utils";
import { createItemInstanceId, type ItemInstanceIdFactory } from "@/lib/item-resources";

const MAX_PICKER_QUANTITY = 9_999;

/** Consumables with no mutable pool can honestly share one aggregate stock row. */
function isStackable(item: SrdMagicItemData): boolean {
  return (
    (item.type === "potion" || item.type === "scroll") &&
    !item.resources?.length &&
    !item.attunement
  );
}

/**
 * Build minimal refs without parsing resource prose. Every durable magic item is
 * one physical row per copy; only stateless potions/scrolls remain stock stacks.
 */
export function createMagicItemEquipmentRefs(
  item: SrdMagicItemData,
  quantity = 1,
  idFactory?: ItemInstanceIdFactory
): SrdEquipmentRef[] {
  const count =
    Number.isSafeInteger(quantity) && quantity > 0 && quantity <= MAX_PICKER_QUANTITY
      ? quantity
      : 1;
  const acBonus = parseMagicItemAcBonus(item);
  // Compatibility bridge for the not-yet-migrated corpus only. A typed item
  // never gets this second owner; migrated rows resolve exclusively from
  // `resources`. Delete this branch once the corpus guard reaches zero.
  const hasLegacyGrantPool = item.grants?.some(
    (grant) => grant.type === "free-cast-spell" || grant.type === "free-cast-from-list"
  );
  const legacyCharges =
    !item.resources?.length && !hasLegacyGrantPool
      ? parseMagicItemCharges(item)
      : undefined;
  const base: SrdEquipmentRef = {
    srdId: item.id,
    equipped: item.type === "armor" || item.type === "ring",
    ...(acBonus !== undefined ? { acBonus } : {}),
    ...(legacyCharges !== undefined
      ? {
          charges: {
            current: legacyCharges,
            max: legacyCharges,
            recovery: "long-rest" as const,
          },
        }
      : {}),
    ...(item.attunement ? { attuned: false } : {}),
    ...(item.type === "potion" ? { isConsumable: true, isPotion: true } : {}),
  };

  if (isStackable(item)) return [{ ...base, quantity: count }];

  const ids = new Set<string>();
  return Array.from({ length: count }, () => {
    const instanceId = createItemInstanceId(idFactory);
    if (ids.has(instanceId)) {
      throw new TypeError("Item instance factory returned a duplicate id");
    }
    ids.add(instanceId);
    return { ...base, quantity: 1, instanceId };
  });
}
