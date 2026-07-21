/**
 * SRD Equipment — Adventuring Gear — D&D 2024
 *
 * Standard adventuring gear from the 2024 SRD (5.2.1).
 * Source: dnd2024.wikidot.com/equipment:adventuring-gear (Creative Commons)
 */

import type { SrdEquipmentData } from "./types";

export const SRD_GEAR: SrdEquipmentData[] = [
  {
    id: "acid",
    category: "gear",
    cost: { amount: 25, unit: "gp" },
    weight: 1,
    source: "SRD",
    isConsumable: true,
  },
  {
    id: "alchemists-fire",
    category: "gear",
    cost: { amount: 50, unit: "gp" },
    weight: 1,
    source: "SRD",
    isConsumable: true,
  },
  {
    id: "antitoxin",
    category: "gear",
    cost: { amount: 50, unit: "gp" },
    source: "SRD",
    isConsumable: true,
  },
  {
    id: "backpack",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "ball-bearings",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "bedroll",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 7,
    source: "SRD",
  },
  {
    id: "bell",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    source: "SRD",
  },
  {
    id: "blanket",
    category: "gear",
    cost: { amount: 5, unit: "sp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "caltrops",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "candle",
    category: "gear",
    cost: { amount: 1, unit: "cp" },
    source: "SRD",
  },
  {
    id: "chain",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 10,
    source: "SRD",
  },
  {
    id: "climbers-kit",
    category: "gear",
    cost: { amount: 25, unit: "gp" },
    weight: 12,
    source: "SRD",
  },
  {
    id: "clothes-fine",
    category: "gear",
    cost: { amount: 15, unit: "gp" },
    weight: 6,
    source: "SRD",
  },
  {
    id: "clothes-travelers",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 4,
    source: "SRD",
  },
  {
    id: "component-pouch",
    category: "gear",
    cost: { amount: 25, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "crowbar",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "grappling-hook",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 4,
    source: "SRD",
  },
  {
    id: "healers-kit",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "holy-water",
    category: "gear",
    cost: { amount: 25, unit: "gp" },
    weight: 1,
    source: "SRD",
    isConsumable: true,
  },
  {
    id: "hunting-trap",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 25,
    source: "SRD",
  },
  {
    id: "ink",
    category: "gear",
    cost: { amount: 10, unit: "gp" },
    source: "SRD",
  },
  {
    id: "lamp",
    category: "gear",
    cost: { amount: 5, unit: "sp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "lantern-bullseye",
    category: "gear",
    cost: { amount: 10, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "lantern-hooded",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "lock",
    category: "gear",
    cost: { amount: 10, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "manacles",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 6,
    source: "SRD",
  },
  {
    id: "mirror",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 0.5,
    source: "SRD",
  },
  {
    id: "net",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "oil",
    category: "gear",
    cost: { amount: 1, unit: "sp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "poison-basic",
    category: "gear",
    cost: { amount: 100, unit: "gp" },
    source: "SRD",
    isConsumable: true,
  },
  // NOTE: "Potion of Healing" is NOT here — it is a MAGIC item (magic-items.ts),
  // so it only appears under the Add-Item → Magic Items tab. It used to be
  // duplicated as mundane gear too, which leaked it into the Equipment tab and
  // split it into two catalogue entries. The magic-item copy carries its weight
  // (0.5 lb) + potionFormula so the inventory still shows the heal + weight.
  {
    id: "rations",
    category: "gear",
    cost: { amount: 5, unit: "sp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "rope",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "shovel",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "tent",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 20,
    source: "SRD",
  },
  {
    id: "tinderbox",
    category: "gear",
    cost: { amount: 5, unit: "sp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "torch",
    category: "gear",
    cost: { amount: 1, unit: "cp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "waterskin",
    category: "gear",
    cost: { amount: 2, unit: "sp" },
    weight: 5,
    source: "SRD",
  },

  // ============================================================
  // Packs (equipment bundles)
  // ============================================================
  {
    id: "burglars-pack",
    category: "pack",
    cost: { amount: 16, unit: "gp" },
    weight: 42,
    source: "SRD",
  },
  {
    id: "diplomats-pack",
    category: "pack",
    cost: { amount: 39, unit: "gp" },
    weight: 39,
    source: "SRD",
  },
  {
    id: "dungeoneers-pack",
    category: "pack",
    cost: { amount: 12, unit: "gp" },
    weight: 55,
    source: "SRD",
  },
  {
    id: "entertainers-pack",
    category: "pack",
    cost: { amount: 40, unit: "gp" },
    weight: 58.5,
    source: "SRD",
  },
  {
    id: "explorers-pack",
    category: "pack",
    cost: { amount: 10, unit: "gp" },
    weight: 55,
    source: "SRD",
  },
  {
    id: "priests-pack",
    category: "pack",
    cost: { amount: 33, unit: "gp" },
    weight: 29,
    source: "SRD",
  },
  {
    id: "scholars-pack",
    category: "pack",
    cost: { amount: 40, unit: "gp" },
    weight: 22,
    source: "SRD",
  },

  // ============================================================
  // Tools (artisan's tools, kits, instruments) — D&D 2024 PHB
  // ============================================================
  {
    id: "thieves-tools",
    category: "tool",
    cost: { amount: 25, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "disguise-kit",
    category: "tool",
    cost: { amount: 25, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "poisoners-kit",
    category: "tool",
    cost: { amount: 50, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "herbalism-kit",
    category: "tool",
    cost: { amount: 5, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "woodcarvers-tools",
    category: "tool",
    cost: { amount: 15, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  // Artisan's Tools — the full set, so a Monk's chosen tool resolves to a real,
  // localized catalogue item (the chosen-tool linkage). Prices/weights per the
  // 2024 PHB tools table. (woodcarvers-tools + tinkers-tools are above/below.)
  {
    id: "alchemists-supplies",
    category: "tool",
    cost: { amount: 50, unit: "gp" },
    weight: 8,
    source: "SRD",
  },
  {
    id: "brewers-supplies",
    category: "tool",
    cost: { amount: 20, unit: "gp" },
    weight: 9,
    source: "SRD",
  },
  {
    id: "calligraphers-supplies",
    category: "tool",
    cost: { amount: 10, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "carpenters-tools",
    category: "tool",
    cost: { amount: 8, unit: "gp" },
    weight: 6,
    source: "SRD",
  },
  {
    id: "cartographers-tools",
    category: "tool",
    cost: { amount: 15, unit: "gp" },
    weight: 6,
    source: "SRD",
  },
  {
    id: "cobblers-tools",
    category: "tool",
    cost: { amount: 5, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "cooks-utensils",
    category: "tool",
    cost: { amount: 1, unit: "gp" },
    weight: 8,
    source: "SRD",
  },
  {
    id: "glassblowers-tools",
    category: "tool",
    cost: { amount: 30, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "jewelers-tools",
    category: "tool",
    cost: { amount: 25, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "leatherworkers-tools",
    category: "tool",
    cost: { amount: 5, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "masons-tools",
    category: "tool",
    cost: { amount: 10, unit: "gp" },
    weight: 8,
    source: "SRD",
  },
  {
    id: "painters-supplies",
    category: "tool",
    cost: { amount: 10, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "potters-tools",
    category: "tool",
    cost: { amount: 10, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "smiths-tools",
    category: "tool",
    cost: { amount: 20, unit: "gp" },
    weight: 8,
    source: "SRD",
  },
  {
    id: "weavers-tools",
    category: "tool",
    cost: { amount: 1, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  // Musical Instruments — the full set, same rationale (a Monk may pick an
  // instrument; lute is above). Prices/weights per the 2024 PHB tools table.
  {
    id: "bagpipes",
    category: "tool",
    cost: { amount: 30, unit: "gp" },
    weight: 6,
    source: "SRD",
  },
  {
    id: "drum",
    category: "tool",
    cost: { amount: 6, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "dulcimer",
    category: "tool",
    cost: { amount: 25, unit: "gp" },
    weight: 10,
    source: "SRD",
  },
  {
    id: "flute",
    category: "tool",
    cost: { amount: 2, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "horn",
    category: "tool",
    cost: { amount: 3, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "lyre",
    category: "tool",
    cost: { amount: 30, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "pan-flute",
    category: "tool",
    cost: { amount: 12, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "shawm",
    category: "tool",
    cost: { amount: 2, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "viol",
    category: "tool",
    cost: { amount: 30, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "lute",
    category: "tool",
    cost: { amount: 35, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  // Gaming Sets — the concrete picks behind the "Gaming Set" umbrella (a Gaming-Set
  // background's tool choice + its "Gaming Set (same as above)" pack item resolve to
  // one of these real, localized catalogue rows, never a name-only string).
  {
    id: "dice-set",
    category: "tool",
    cost: { amount: 1, unit: "sp" },
    weight: 0,
    source: "SRD",
  },
  {
    id: "playing-card-set",
    category: "tool",
    cost: { amount: 5, unit: "sp" },
    weight: 0,
    source: "SRD",
  },
  // The remaining utility kits / universal tools the 2024 background packages list,
  // so every starting-tool resolves to a localized catalogue row (no EN-baked custom).
  {
    id: "forgery-kit",
    category: "tool",
    cost: { amount: 15, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "navigators-tools",
    category: "tool",
    cost: { amount: 25, unit: "gp" },
    weight: 2,
    source: "SRD",
  },

  // ============================================================
  // Additional adventuring gear — D&D 2024 PHB
  // ============================================================
  {
    id: "spellbook",
    category: "gear",
    cost: { amount: 50, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  // Warlock Option-A "Book (occult lore)" — a real catalogue row (stable id) so
  // the starting package resolves to a localized item, never a name-only string.
  {
    id: "book",
    category: "gear",
    cost: { amount: 25, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  // Wizard Option-A "Robe" — a real catalogue row (stable id) so the starting
  // package resolves to a localized item, never a name-only string.
  {
    id: "robe",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 4,
    source: "SRD",
  },
  {
    id: "perfume",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    source: "SRD",
  },
  {
    id: "costume",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 4,
    source: "SRD",
  },
  // Spellcasting focuses, ammunition, and starting tools — modeled as real SRD items
  // so class starting equipment resolves automatically (no "add manually" placeholders).
  {
    id: "arcane-focus",
    category: "gear",
    cost: { amount: 10, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "druidic-focus",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "holy-symbol",
    category: "gear",
    cost: { amount: 5, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "musical-instrument",
    category: "gear",
    cost: { amount: 30, unit: "gp" },
    weight: 3,
    source: "SRD",
  },
  {
    id: "quiver",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    // AI-translated IT (no authoritative IT SRD term verified) — owner to confirm.
    id: "tinkers-tools",
    category: "gear",
    cost: { amount: 50, unit: "gp" },
    weight: 10,
    source: "SRD",
  },
  {
    id: "arrows",
    category: "gear",
    // SRD: "Arrows (20) — 1 GP — 1 lb" (the cost + weight are for the bundle of 20).
    cost: { amount: 1, unit: "gp" },
    weight: 1,
    bundleSize: 20,
    source: "SRD",
    isConsumable: true,
  },
  {
    id: "crossbow-bolts",
    category: "gear",
    // SRD: "Crossbow Bolts (20) — 1 GP — 1.5 lb" (cost + weight are for the 20-pack).
    cost: { amount: 1, unit: "gp" },
    weight: 1.5,
    bundleSize: 20,
    source: "SRD",
    isConsumable: true,
  },
  {
    // RA-14 — the Sling's ammunition (SRD: "Bullets, Sling (20) — 4 CP — 1.5 lb").
    id: "sling-bullets",
    category: "gear",
    cost: { amount: 4, unit: "cp" },
    weight: 1.5,
    bundleSize: 20,
    source: "SRD",
    isConsumable: true,
  },
  {
    // RA-14 — the Blowgun's ammunition (SRD: "Needles, Blowgun (50) — 1 GP — 1 lb").
    id: "blowgun-needles",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 1,
    bundleSize: 50,
    source: "SRD",
    isConsumable: true,
  },
  {
    // RA-14 — the Musket/Pistol's ammunition (SRD 5.2.1 Ammunition table, p. 96:
    // "Bullets, Firearm — 10 — Pouch — 2 lb. — 3 GP").
    id: "firearm-bullets",
    category: "gear",
    cost: { amount: 3, unit: "gp" },
    weight: 2,
    bundleSize: 10,
    source: "SRD",
    isConsumable: true,
  },

  // ============================================================
  // Background-pack adventuring gear — D&D 2024 PHB
  //
  // The recurring NAME-ONLY items the 2024 BACKGROUND starting-equipment lines
  // print (Pouch, Map, Glass Bottle, Iron Pot, …) — every one a REAL adventuring
  // gear row on dnd2024.wikidot.com/equipment:adventuring-gear. Modeled here as
  // catalogue rows (stable id → localized name via the SRD catalogue) so a
  // background pack resolves them through the SAME id→`localizeSrd` seam as every
  // other item, never an inline-BiText custom string. Prices + weights verified
  // against the wikidot gear table + the official IT SRD 5.2.1 gear table.
  // ============================================================
  {
    id: "pouch",
    category: "gear",
    cost: { amount: 5, unit: "sp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "map",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    source: "SRD",
  },
  {
    id: "map-or-scroll-case",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 1,
    source: "SRD",
  },
  {
    id: "ink-pen",
    category: "gear",
    cost: { amount: 2, unit: "cp" },
    source: "SRD",
  },
  // Parchment + Paper — sold per SHEET, so "Parchment (10 sheets)" is quantity 10
  // of this row (the ×N badge carries the count — no baked "(N sheets)" string).
  {
    id: "parchment",
    category: "gear",
    cost: { amount: 1, unit: "sp" },
    source: "SRD",
  },
  {
    id: "paper",
    category: "gear",
    cost: { amount: 2, unit: "sp" },
    source: "SRD",
  },
  {
    id: "glass-bottle",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "iron-pot",
    category: "gear",
    cost: { amount: 2, unit: "gp" },
    weight: 10,
    source: "SRD",
  },
  // Iron Spikes — sold in bundles of ten (one pack item = one bundle).
  {
    id: "iron-spikes",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 5,
    bundleSize: 10,
    source: "SRD",
  },
  {
    id: "basket",
    category: "gear",
    cost: { amount: 4, unit: "sp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "bucket",
    category: "gear",
    cost: { amount: 5, unit: "cp" },
    weight: 2,
    source: "SRD",
  },
  {
    id: "ladder",
    category: "gear",
    cost: { amount: 1, unit: "sp" },
    weight: 25,
    source: "SRD",
  },
  {
    id: "pole",
    category: "gear",
    cost: { amount: 5, unit: "cp" },
    weight: 7,
    source: "SRD",
  },
  {
    id: "string",
    category: "gear",
    cost: { amount: 1, unit: "sp" },
    source: "SRD",
  },
  {
    id: "signal-whistle",
    category: "gear",
    cost: { amount: 5, unit: "cp" },
    source: "SRD",
  },
  {
    id: "block-and-tackle",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    weight: 5,
    source: "SRD",
  },
  {
    id: "portable-ram",
    category: "gear",
    cost: { amount: 4, unit: "gp" },
    weight: 35,
    source: "SRD",
  },
  {
    id: "vial",
    category: "gear",
    cost: { amount: 1, unit: "gp" },
    source: "SRD",
  },
];

/** Gear lookup by ID */
export const GEAR_BY_ID: ReadonlyMap<string, SrdEquipmentData> = new Map(
  SRD_GEAR.map((g) => [g.id, g])
);

/** Get a gear item by ID */
export function getGear(id: string): SrdEquipmentData | undefined {
  return GEAR_BY_ID.get(id);
}

/** Get all equipment packs */
export function getEquipmentPacks(): SrdEquipmentData[] {
  return SRD_GEAR.filter((g) => g.category === "pack");
}

/** Get all adventuring gear (excludes packs) */
export function getAdventuringGear(): SrdEquipmentData[] {
  return SRD_GEAR.filter((g) => g.category === "gear");
}
