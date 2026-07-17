/**
 * SRD consumable resolution.
 *
 * The single source for "is this inventory item a potion/consumable, and which
 * action-economy slot does using it occupy" — derived from the SRD catalogue
 * (magic items + equipment), so the inventory panel and the combat action board
 * can never disagree (golden rule 6).
 *
 * NOTE: the old full-object resolvers (`resolveSpell`/`resolveEquipment`/
 * `resolveWeapon`) were removed in R6+R3 SLICE 7b — every live surface localizes
 * SRD content at its own edge from the entity's STABLE `srdId` (inventory-view /
 * smart-tracker / the picker specs via `localizeSrd`), so materializing a
 * resolved object that copied `srdData.name.en` (English-only, locale-broken) is
 * both dead and an anti-pattern. Only the locale-FREE consumable derivation
 * below remained in use.
 */

import type { ActionType } from "@/data/types";
import type { SrdEquipmentRef, CustomEquipment } from "@/types/character";
import { isCustomEquipment as checkCustomEquipment } from "@/types/character";
import { getEquipment } from "@/data/equipment";
import { getMagicItem } from "@/data/magic-items";

/**
 * Whether an inventory item is a potion / consumable and its heal formula — DERIVED
 * from the SRD catalogue (magic items + equipment), the single source so the
 * inventory panel and the combat action board can never disagree (golden rule 6).
 *
 * The ref carries only mutable state (quantity); it must NOT be relied on to declare
 * display facts. A leftover `ref.isPotion` (a hand-authored mock, or a picker-added
 * item before minimization drops it) is still honoured, but a MINIMAL / imported ref
 * with no flags is resolved purely from the catalogue — which is why a freshly
 * imported `potion-of-healing` (a magic item) still surfaces its drink action.
 */
export function resolveItemConsumable(ref: SrdEquipmentRef | CustomEquipment): {
  isPotion: boolean;
  potionFormula: string | undefined;
  isConsumable: boolean;
} {
  if (checkCustomEquipment(ref)) {
    const isPotion = ref.isPotion ?? false;
    return {
      isPotion,
      potionFormula: ref.potionFormula,
      isConsumable: isPotion || (ref.isConsumable ?? false),
    };
  }
  const srdItem = getEquipment(ref.srdId);
  // Magic items (Potion of Healing lives here, NOT in gear) resolve only when the
  // id isn't a plain equipment entry — mirrors the inventory panel's lookup order.
  const magicItem = srdItem ? undefined : getMagicItem(ref.srdId);
  const isPotion =
    magicItem?.type === "potion" ||
    ref.srdId.startsWith("potion-") ||
    (ref.isPotion ?? false);
  const potionFormula =
    srdItem?.potionFormula ?? magicItem?.potionFormula ?? ref.potionFormula;
  const isConsumable =
    isPotion || (srdItem?.isConsumable ?? false) || (ref.isConsumable ?? false);
  return { isPotion, potionFormula, isConsumable };
}

/**
 * The action-economy slot a usable item occupies (2024 rules): a potion is drunk as
 * a **Bonus Action**; any other consumable (thrown acid / oil / holy water) takes an
 * **Action**; plain gear is **free** (no economy). The single source so the inventory
 * panel's slot-colour badge and the combat action's economy type are derived
 * identically and can never disagree (golden rule 6) — the border colour is keyed
 * universally off the slot, so emitting the right slot IS following the economy.
 */
export function consumableActionSlot(c: {
  isPotion: boolean;
  isConsumable: boolean;
}): ActionType {
  if (c.isPotion) return "bonus";
  if (c.isConsumable) return "action";
  return "free";
}
