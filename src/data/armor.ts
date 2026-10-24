/**
 * SRD Equipment — Armor — D&D 2024
 *
 * All armor from the 2024 SRD (5.2.1).
 * Source: dnd2024.wikidot.com/equipment:armor (Creative Commons)
 */

import type { ArmorCategory, SrdEquipmentData } from "./types";

export const SRD_ARMOR: SrdEquipmentData[] = [
  // ============================================================
  // Light Armor (1 Minute to Don or Doff)
  // ============================================================
  {
    id: "padded-armor",
    category: "armor",
    cost: { amount: 5, unit: "gp" },
    weight: 8,
    ac: { base: 11, dexBonus: true },
    armorCategory: "light",
    stealthDisadvantage: true,
    source: "SRD",
  },
  {
    id: "leather-armor",
    category: "armor",
    cost: { amount: 10, unit: "gp" },
    weight: 10,
    ac: { base: 11, dexBonus: true },
    armorCategory: "light",
    stealthDisadvantage: false,
    source: "SRD",
  },
  {
    id: "studded-leather-armor",
    category: "armor",
    cost: { amount: 45, unit: "gp" },
    weight: 13,
    ac: { base: 12, dexBonus: true },
    armorCategory: "light",
    stealthDisadvantage: false,
    source: "SRD",
  },

  // ============================================================
  // Medium Armor (5 Minutes to Don, 1 Minute to Doff)
  // ============================================================
  {
    id: "hide-armor",
    category: "armor",
    cost: { amount: 10, unit: "gp" },
    weight: 12,
    ac: { base: 12, dexBonus: true, maxDex: 2 },
    armorCategory: "medium",
    stealthDisadvantage: false,
    source: "SRD",
  },
  {
    id: "chain-shirt",
    category: "armor",
    cost: { amount: 50, unit: "gp" },
    weight: 20,
    ac: { base: 13, dexBonus: true, maxDex: 2 },
    armorCategory: "medium",
    stealthDisadvantage: false,
    source: "SRD",
  },
  {
    id: "scale-mail",
    category: "armor",
    cost: { amount: 50, unit: "gp" },
    weight: 45,
    ac: { base: 14, dexBonus: true, maxDex: 2 },
    armorCategory: "medium",
    stealthDisadvantage: true,
    source: "SRD",
  },
  {
    id: "breastplate",
    category: "armor",
    cost: { amount: 400, unit: "gp" },
    weight: 20,
    ac: { base: 14, dexBonus: true, maxDex: 2 },
    armorCategory: "medium",
    stealthDisadvantage: false,
    source: "SRD",
  },
  {
    id: "half-plate-armor",
    category: "armor",
    cost: { amount: 750, unit: "gp" },
    weight: 40,
    ac: { base: 15, dexBonus: true, maxDex: 2 },
    armorCategory: "medium",
    stealthDisadvantage: true,
    source: "SRD",
  },

  // ============================================================
  // Heavy Armor (10 Minutes to Don, 5 Minutes to Doff)
  // ============================================================
  {
    id: "ring-mail",
    category: "armor",
    cost: { amount: 30, unit: "gp" },
    weight: 40,
    ac: { base: 14, dexBonus: false },
    armorCategory: "heavy",
    stealthDisadvantage: true,
    source: "SRD",
  },
  {
    id: "chain-mail",
    category: "armor",
    cost: { amount: 75, unit: "gp" },
    weight: 55,
    ac: { base: 16, dexBonus: false },
    armorCategory: "heavy",
    stealthDisadvantage: true,
    strengthReq: 13,
    source: "SRD",
  },
  {
    id: "splint-armor",
    category: "armor",
    cost: { amount: 200, unit: "gp" },
    weight: 60,
    ac: { base: 17, dexBonus: false },
    armorCategory: "heavy",
    stealthDisadvantage: true,
    strengthReq: 15,
    source: "SRD",
  },
  {
    id: "plate-armor",
    category: "armor",
    cost: { amount: 1500, unit: "gp" },
    weight: 65,
    ac: { base: 18, dexBonus: false },
    armorCategory: "heavy",
    stealthDisadvantage: true,
    strengthReq: 15,
    source: "SRD",
  },

  // ============================================================
  // Shield
  // ============================================================
  {
    id: "shield",
    category: "shield",
    cost: { amount: 10, unit: "gp" },
    weight: 6,
    ac: { base: 2, dexBonus: false },
    armorCategory: "shield",
    stealthDisadvantage: false,
    source: "SRD",
  },
];

/** Armor lookup by ID */
export const ARMOR_BY_ID: ReadonlyMap<string, SrdEquipmentData> = new Map(
  SRD_ARMOR.map((a) => [a.id, a])
);

/** Get an armor by ID */
export function getArmor(id: string): SrdEquipmentData | undefined {
  return ARMOR_BY_ID.get(id);
}

/** Get armor by category */
export function getArmorByCategory(
  category: "light" | "medium" | "heavy" | "shield"
): SrdEquipmentData[] {
  return SRD_ARMOR.filter((a) => a.armorCategory === category);
}

/** Minutes to put armor on or take it off, or `"utilize"`: the Utilize action. */
export type ArmorTime = number | "utilize";

/**
 * Time to don or doff armor (SRD 5.2.1 "Armor" table headings: Light 1 minute to
 * don or doff, Medium 5 to don and 1 to doff, Heavy 10 and 5, Shield the Utilize
 * action), keyed by the armor category every armor row already declares.
 */
export const ARMOR_DON_DOFF: Readonly<
  Record<ArmorCategory, { don: ArmorTime; doff: ArmorTime }>
> = {
  light: { don: 1, doff: 1 },
  medium: { don: 5, doff: 1 },
  heavy: { don: 10, doff: 5 },
  shield: { don: "utilize", doff: "utilize" },
};

/** Get all wearable armor (excludes shields) */
export function getWearableArmor(): SrdEquipmentData[] {
  return SRD_ARMOR.filter((a) => a.category === "armor");
}
