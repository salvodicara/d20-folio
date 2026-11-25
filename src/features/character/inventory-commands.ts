/**
 * The inventory's write moves, shared by the classic Inventory tab and the new Play
 * screen's item and coin panes (#1230), so both UIs write the character the same way.
 * Moved verbatim from the classic `InventoryTab` (the `sellItem` shape of
 * `purchase-offer`): remove a row (undoable, the item's resource state restored),
 * edit one field (a homebrew row also updates its library entry), set a quantity
 * (clamped to 1: the stepper never removes), equip or take off (one body armor at a
 * time, AC recomputed, heavy armor ends what it ends, the don/doff toast), and move
 * coins (the `adjust-currency` event, undoable).
 */
import type { TFunction } from "i18next";

import { getEquipment } from "@/data/equipment";
import { showArmorToast } from "@/features/character/center/armor-toast";
import {
  effectiveEquipmentForItemResources,
  withEquipment,
} from "@/lib/aggregate-character";
import { computeAC, isHeavyArmorEquipped } from "@/lib/compute";
import { armorCategoryOf, wearArmor } from "@/lib/play/armor-donning";
import { negateCurrencyDelta, type CurrencyDelta } from "@/lib/play/material-cost";
import { resolveActiveStatesEndingOn } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { registerUndoableToast } from "@/stores/undoStore";

export type ItemList = "weapons" | "equipment";
/** The classic card editors' field value (`WeaponCard`). */
export type ItemFieldValue = string | number | boolean | null;

/** Remove one row, with the 5 s undo; an equipment row's resource state comes back
 *  with it on undo. */
export function deleteItem(
  list: ItemList,
  idx: number,
  name: string,
  t: TFunction
): void {
  if (list === "weapons") deleteWeapon(idx, name, t);
  else deleteEquipment(idx, name, t);
}

function deleteWeapon(idx: number, name: string, t: TFunction): void {
  const char = useCharacterStore.getState().character;
  if (!char) return;
  const removed = char.character.weapons[idx];
  if (!removed) return;
  const message = t("common.deleted", { name });
  registerUndoableToast(
    { message },
    () => {
      const cur = useCharacterStore.getState().character;
      if (!cur) return null;
      const list = [...cur.character.weapons];
      list.splice(idx, 1);
      useCharacterStore.getState().setCharacter({
        ...cur,
        character: { ...cur.character, weapons: list },
      });
      return () => {
        const current = useCharacterStore.getState().character;
        if (!current) return;
        const restored = [...current.character.weapons];
        restored.splice(idx, 0, removed);
        useCharacterStore.getState().setCharacter({
          ...current,
          character: { ...current.character, weapons: restored },
        });
      };
    },
    { turnScoped: false }
  );
}

function deleteEquipment(idx: number, name: string, t: TFunction): void {
  const char = useCharacterStore.getState().character;
  if (!char) return;
  const removed = char.character.equipment[idx];
  if (!removed) return;
  const instanceId = "custom" in removed ? undefined : removed.instanceId;
  const priorResourceState = instanceId
    ? char.session.itemResources?.[instanceId]
    : undefined;
  const message = t("common.deleted", { name });
  registerUndoableToast(
    { message },
    () => {
      const store = useCharacterStore.getState();
      if (instanceId) {
        if (!store.removeItemResourceInstance(instanceId)) return null;
      } else {
        const cur = store.character;
        if (!cur || cur.character.equipment[idx] !== removed) return null;
        const list = [...cur.character.equipment];
        list.splice(idx, 1);
        store.setCharacter({ ...cur, character: withEquipment(cur.character, list) });
      }
      return () => {
        const current = useCharacterStore.getState().character;
        if (!current) return false;
        if (
          instanceId &&
          current.character.equipment.some(
            (ref) => !("custom" in ref) && ref.instanceId === instanceId
          )
        ) {
          return false;
        }
        const restored = [...current.character.equipment];
        restored.splice(Math.min(idx, restored.length), 0, removed);
        useCharacterStore.getState().setCharacter({
          ...current,
          character: withEquipment(current.character, restored),
          session:
            instanceId && priorResourceState
              ? {
                  ...current.session,
                  itemResources: {
                    ...current.session.itemResources,
                    [instanceId]: priorResourceState,
                  },
                }
              : current.session,
        });
        return true;
      };
    },
    { turnScoped: false }
  );
}

/** Edit one stored field of a row ("" clears it). Custom IS the library: an edited
 *  homebrew row updates its entry (no-op for an SRD ref); the library write itself is
 *  debounced in the persistence seam. */
export function updateItemField(
  list: ItemList,
  idx: number,
  field: string,
  value: ItemFieldValue
): void {
  const store = useCharacterStore.getState();
  const char = store.character;
  if (!char) return;
  if (list === "weapons") {
    const weaponsCopy = [...char.character.weapons];
    const ref = weaponsCopy[idx];
    if (!ref) return;
    weaponsCopy[idx] = { ...ref, [field]: value === "" ? undefined : value };
    const next = { ...char.character, weapons: weaponsCopy };
    store.setCharacter({ ...char, character: next });
    if ("custom" in ref) {
      useLibraryStore.getState().syncFromCharacter(next, "weapon", ref.instanceId);
    }
    return;
  }
  const equipCopy = [...char.character.equipment];
  const ref = equipCopy[idx];
  if (!ref) return;
  equipCopy[idx] = { ...ref, [field]: value === "" ? undefined : value };
  const next = { ...char.character, equipment: equipCopy };
  store.setCharacter({ ...char, character: next });
  if ("custom" in ref) {
    useLibraryStore.getState().syncFromCharacter(next, "equipment", ref.instanceId);
  }
}

/** A row's count, never below 1 (the classic `QuantityEditor`'s clamp): taking the
 *  last one away is «Rimuovi», not a zero. */
export function setItemQuantity(list: ItemList, idx: number, quantity: number): void {
  updateItemField(list, idx, "quantity", Math.max(1, Math.floor(quantity)));
}

/**
 * Put an equipment row on or take it off. One body armor at a time: putting armor on
 * takes the worn one off. AC is recomputed; heavy armor ends the states it ends; the
 * SRD don/doff time is the reason line, ONE toast per tap (a swap reads as one change).
 * `nameOf` names another equipment row (the armor taken off).
 */
export function toggleEquipped(
  idx: number,
  t: TFunction,
  { name, nameOf }: { name?: string; nameOf?: (idx: number) => string | undefined } = {}
): void {
  const store = useCharacterStore.getState();
  const char = store.character;
  if (!char) return;
  const ref = char.character.equipment[idx];
  if (!ref) return;
  const equipping = !(ref.equipped ?? false);
  const { equipment: equipCopy, doffed } = wearArmor(
    char.character.equipment,
    idx,
    getEquipment
  );
  const effectiveEquipment = effectiveEquipmentForItemResources(
    equipCopy,
    char.session.itemResources
  );
  const newAC = computeAC(
    effectiveEquipment,
    char.character.abilityScores,
    getEquipment,
    char.character.features
  );
  const nextCharacter = {
    ...char,
    character: { ...char.character, equipment: equipCopy, ac: newAC },
  };
  store.setCharacter(nextCharacter);
  if (isHeavyArmorEquipped(effectiveEquipment, getEquipment)) {
    for (const key of resolveActiveStatesEndingOn(nextCharacter, "heavy-armor")) {
      store.setActiveFeature(key, false);
    }
  }
  // Never blocks: the toggle above already applied (override everywhere).
  const onCategory = armorCategoryOf(ref, getEquipment);
  const offIdx = doffed[0];
  const offRef = offIdx === undefined ? undefined : char.character.equipment[offIdx];
  const offCategory = offRef && armorCategoryOf(offRef, getEquipment);
  const offName = offIdx === undefined ? undefined : nameOf?.(offIdx);
  if (onCategory && name) {
    showArmorToast(
      t,
      { name, category: onCategory, equipping },
      offCategory && offName ? { name: offName, category: offCategory } : undefined
    );
  }
}

/** Add or take coins (one delta, any coins), with the 5 s undo. A coin never goes
 *  below 0. Returns whether anything moved. */
export function adjustCoins(delta: CurrencyDelta, message: string): boolean {
  if (!Object.values(delta).some((n) => n)) return false;
  let moved = false;
  registerUndoableToast(
    { message },
    () => {
      const before = useCharacterStore.getState().character?.session.currency;
      if (
        !before ||
        !useCharacterStore.getState().dispatch({ kind: "adjust-currency", delta })
      )
        return null;
      moved = true;
      // Undo restores exactly what was there (a take clamped at 0 gives back only
      // what it took).
      const after = useCharacterStore.getState().character?.session.currency;
      const taken: CurrencyDelta = {};
      for (const coin of ["pp", "gp", "ep", "sp", "cp"] as const) {
        const d = (after?.[coin] ?? 0) - before[coin];
        if (d) taken[coin] = d;
      }
      return () => {
        useCharacterStore.getState().dispatch({
          kind: "adjust-currency",
          delta: negateCurrencyDelta(taken),
        });
      };
    },
    { turnScoped: false }
  );
  return moved;
}
