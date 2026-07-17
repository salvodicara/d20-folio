/**
 * equipment-add — the ONE place that adds an item to a character's bag, so every
 * add path (the Add-Item picker's Equipment + Magic Items tabs) STACKS an item
 * onto an existing identical entry instead of appending a duplicate row (the
 * long-standing "add a 2nd Potion of Healing → two separate rows" bug).
 *
 * Stacking rule: same SRD id AND no per-instance state that must stay distinct —
 * charges, attunement, an AC bonus, personal notes, or weapon overrides. Magic
 * items that carry charges/attunement are genuinely distinct instances, so they
 * never collapse; plain consumables/gear/ammo/weapons merge by quantity. Cosmetic
 * or srdId-derived flags (equipped, tracked, isConsumable…) are ignored and the
 * existing entry's are kept. Homebrew (`custom`) never stacks.
 */
import type {
  SrdEquipmentRef,
  CustomEquipment,
  SrdWeaponRef,
  CustomWeapon,
} from "@/types/character";

type EquipmentRef = SrdEquipmentRef | CustomEquipment;
type WeaponRef = SrdWeaponRef | CustomWeapon;

function equipmentStacks(existing: EquipmentRef, ref: SrdEquipmentRef): boolean {
  if ("custom" in existing) return false;
  return (
    existing.srdId === ref.srdId &&
    !existing.charges &&
    !ref.charges &&
    existing.attuned === undefined &&
    ref.attuned === undefined &&
    existing.acBonus === undefined &&
    ref.acBonus === undefined &&
    !existing.notes &&
    !ref.notes
  );
}

/** Add an SRD equipment ref, stacking onto a matching entry (bump quantity) rather
 *  than appending a duplicate. Returns a NEW array (callers spread into the doc). */
export function addEquipmentRef(
  list: readonly EquipmentRef[],
  ref: SrdEquipmentRef
): EquipmentRef[] {
  const idx = list.findIndex((e) => equipmentStacks(e, ref));
  if (idx < 0) return [...list, ref];
  return list.map((e, i) => {
    if (i !== idx) return e;
    const existing = e as SrdEquipmentRef;
    return { ...existing, quantity: (existing.quantity ?? 1) + (ref.quantity ?? 1) };
  });
}

function weaponStacks(existing: WeaponRef, ref: SrdWeaponRef): boolean {
  if ("custom" in existing) return false;
  return (
    existing.srdId === ref.srdId &&
    !existing.notes &&
    !ref.notes &&
    existing.attackBonusOverride == null &&
    ref.attackBonusOverride == null &&
    existing.damageOverride == null &&
    ref.damageOverride == null &&
    !existing.overrides &&
    !ref.overrides &&
    !existing.tags &&
    !ref.tags
  );
}

/** Add an SRD weapon ref, stacking onto a matching entry (bump quantity). */
export function addWeaponRef(list: readonly WeaponRef[], ref: SrdWeaponRef): WeaponRef[] {
  const idx = list.findIndex((w) => weaponStacks(w, ref));
  if (idx < 0) return [...list, ref];
  return list.map((w, i) =>
    i === idx ? { ...w, quantity: w.quantity + ref.quantity } : w
  );
}
