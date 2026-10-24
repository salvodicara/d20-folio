/**
 * One physical copy of an item on the sheet, and whether it can still spend its
 * charges: the single copy with that id, worn, attuned when it needs it, and still
 * magical. The one rule the item-resource commands, the inventory's resource rows
 * and the grant aggregation read (they each wrote it on their own before).
 *
 * A structured homebrew item is one copy whose item id is its own `instanceId`
 * (`homebrewItemData`), so it is found and gated by the same rule.
 */
import { attunementSatisfied } from "@/lib/attunement";
import { itemCopyItemId } from "@/lib/homebrew-items";
import type {
  CharacterDoc,
  CustomEquipment,
  ItemResourceState,
  SrdEquipmentRef,
} from "@/types/character";

/** The single copy of `itemId` with this `instanceId`, or null (absent, or two copies
 *  wrongly share the id). */
export function exactItemCopy(
  doc: CharacterDoc,
  itemId: string,
  instanceId: string
): SrdEquipmentRef | CustomEquipment | null {
  const copies = doc.character.equipment.filter(
    (entry) => entry.instanceId === instanceId && itemCopyItemId(entry) === itemId
  );
  return copies.length === 1 ? (copies[0] ?? null) : null;
}

/** Whether a copy is still magical: no item-resource state yet, or a state of this
 *  exact copy whose disposition is still magical. */
export function isMagicalCopy(
  state: ItemResourceState | undefined,
  itemId: string,
  instanceId: string
): boolean {
  return (
    state === undefined ||
    (state.itemId === itemId &&
      state.instanceId === instanceId &&
      state.disposition === "magical")
  );
}

/** Whether the copy can spend its charges now: the single copy, worn, attuned when it
 *  needs it, and still magical. */
export function canSpendCopy(
  doc: CharacterDoc,
  itemId: string,
  instanceId: string
): boolean {
  const copy = exactItemCopy(doc, itemId, instanceId);
  return (
    copy !== null &&
    copy.equipped === true &&
    attunementSatisfied(copy) &&
    isMagicalCopy(doc.session.itemResources?.[instanceId], itemId, instanceId)
  );
}
