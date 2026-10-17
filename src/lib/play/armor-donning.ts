/**
 * What putting armor on or taking it off costs in time (SRD 5.2.1 "Armor": the
 * {@link ARMOR_DON_DOFF} table). The sheet never blocks the Equip toggle (the player
 * may be changing between scenes); it says the time, and inside a fight it flags a
 * minutes-long change, which no single action covers.
 */
import { ARMOR_DON_DOFF, type ArmorTime } from "@/data/armor";
import type { ArmorCategory, SrdEquipmentData } from "@/data/types";
import type { CharacterDoc } from "@/types/character";

type Equipment = CharacterDoc["character"]["equipment"];

/** The armor category of an inventory row (SRD or homebrew); undefined for non-armor. */
export function armorCategoryOf(
  ref: Equipment[number],
  lookup: (id: string) => SrdEquipmentData | undefined
): ArmorCategory | undefined {
  return "custom" in ref ? ref.armorCategory : lookup(ref.srdId)?.armorCategory;
}

/** Body armor (not a Shield): an SRD armor row, or homebrew with a body category. */
function isBodyArmor(
  ref: Equipment[number],
  lookup: (id: string) => SrdEquipmentData | undefined
): boolean {
  if ("custom" in ref) return !!ref.armorCategory && ref.armorCategory !== "shield";
  return lookup(ref.srdId)?.category === "armor";
}

/**
 * Flip the Equip state of the row at `idx`. A creature wears one body armor
 * (SRD 5.2.1 "Armor"), so putting body armor on takes the worn one off; `doffed`
 * lists the rows that came off. A Shield, or taking armor off, changes nothing else.
 */
export function wearArmor(
  equipment: Equipment,
  idx: number,
  lookup: (id: string) => SrdEquipmentData | undefined
): { equipment: Equipment; doffed: number[] } {
  const target = equipment[idx];
  if (!target) return { equipment, doffed: [] };
  const equipping = !(target.equipped ?? false);
  const flipped = equipment.map((ref, i) =>
    i === idx ? { ...ref, equipped: equipping } : ref
  );
  return equipping && isBodyArmor(target, lookup)
    ? doffBodyArmor(flipped, lookup, idx)
    : { equipment: flipped, doffed: [] };
}

/** Take off every worn body armor but the row at `except` (a new armor going on). */
export function doffBodyArmor(
  equipment: Equipment,
  lookup: (id: string) => SrdEquipmentData | undefined,
  except?: number
): { equipment: Equipment; doffed: number[] } {
  const doffed: number[] = [];
  const next = equipment.map((ref, i) => {
    if (i === except || !ref.equipped || !isBodyArmor(ref, lookup)) return ref;
    doffed.push(i);
    return { ...ref, equipped: false };
  });
  return { equipment: next, doffed };
}

/** Changing one body armor for another: the old one's doff time, the new one's don
 *  time (always minutes, so a fight flags it). */
export function armorSwap(
  off: ArmorCategory,
  on: ArmorCategory,
  inEncounter: boolean
): { doff: ArmorTime; don: ArmorTime; tooSlowForFight: boolean } {
  return {
    doff: ARMOR_DON_DOFF[off].doff,
    don: ARMOR_DON_DOFF[on].don,
    tooSlowForFight: inEncounter,
  };
}

export interface ArmorChange {
  verb: "don" | "doff";
  time: ArmorTime;
  /** In a fight, and the change takes minutes rather than an action. */
  tooSlowForFight: boolean;
}

/** The don (equipping) or doff time of an armor category; null for non-armor. */
export function armorChange(
  category: ArmorCategory | undefined,
  equipping: boolean,
  inEncounter: boolean
): ArmorChange | null {
  if (!category) return null;
  const times = ARMOR_DON_DOFF[category];
  const time = equipping ? times.don : times.doff;
  return {
    verb: equipping ? "don" : "doff",
    time,
    tooSlowForFight: inEncounter && typeof time === "number",
  };
}
