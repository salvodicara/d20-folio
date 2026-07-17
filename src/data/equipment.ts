/**
 * SRD Equipment — Aggregated Index
 *
 * Combines weapons, armor, and adventuring gear into a unified equipment collection.
 * Use this as the main entry point for equipment data.
 */

import type { SrdEquipmentData } from "./types";
import { SRD_WEAPONS, WEAPONS_BY_ID } from "./weapons";
import { SRD_ARMOR, ARMOR_BY_ID } from "./armor";
import { SRD_GEAR, GEAR_BY_ID } from "./gear";

/** All SRD equipment combined */
export const SRD_EQUIPMENT: SrdEquipmentData[] = [
  ...SRD_WEAPONS,
  ...SRD_ARMOR,
  ...SRD_GEAR,
];

/** Unified equipment lookup by ID (searches all categories) */
export function getEquipment(id: string): SrdEquipmentData | undefined {
  return WEAPONS_BY_ID.get(id) ?? ARMOR_BY_ID.get(id) ?? GEAR_BY_ID.get(id);
}

/** Get equipment by category */
export function getEquipmentByCategory(
  category: SrdEquipmentData["category"]
): SrdEquipmentData[] {
  return SRD_EQUIPMENT.filter((item) => item.category === category);
}

// Re-export sub-modules for direct access
export {
  SRD_WEAPONS,
  WEAPONS_BY_ID,
  getWeapon,
  getSimpleWeapons,
  getMartialWeapons,
  getMeleeWeapons,
  getRangedWeapons,
} from "./weapons";

export {
  SRD_ARMOR,
  ARMOR_BY_ID,
  getArmor,
  getArmorByCategory,
  getWearableArmor,
} from "./armor";

export {
  SRD_GEAR,
  GEAR_BY_ID,
  getGear,
  getEquipmentPacks,
  getAdventuringGear,
} from "./gear";
