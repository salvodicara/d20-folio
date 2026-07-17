/**
 * item-icons — the SINGLE source of truth for the lucide glyph that represents a
 * weapon / armor / shield / tool / gear / pack / magic item across the whole app
 * (D35). Every surface that draws an item seal — the inventory page, the
 * compendium, the Add-Item picker, the creation/level-up wizards, the weapon-
 * mastery + tool pickers — resolves through these helpers, so a given item reads
 * with the SAME glyph everywhere (consistency by design) and a tweak propagates
 * from one place.
 *
 * All glyphs are REUSED lucide icons (no generated art). Icon-only helpers (no
 * JSX) so callers wrap them in `<KindSeal>` / `<Icon>` / `<UniversalCard sealIcon>`.
 */
import type { ComponentType, SVGProps } from "react";
import {
  // weapons
  Sword,
  Swords,
  Axe,
  Hammer,
  Gavel,
  Pickaxe,
  BowArrow,
  Crosshair,
  Target,
  Zap,
  // armor / shields
  Shirt,
  Shield,
  // tools (one glyph per category — artisan/instrument/gaming/kit/navigator/thieves)
  Wrench,
  Music,
  Dice5,
  Briefcase,
  Compass,
  KeyRound,
  // gear families
  Backpack,
  Package,
  Box,
  Flame,
  Lamp,
  FlaskRound,
  FlaskConical,
  Sparkles,
  Leaf,
  Cross,
  Stethoscope,
  BookOpen,
  ScrollText,
  Bed,
  Tent,
  Utensils,
  Droplet,
  Bell,
  Lock,
  Anchor,
  PenTool,
  Drama,
  CircleDot,
  Wand,
  Wand2,
} from "lucide-react";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_TOOLS_2024, type ToolCategory } from "@/lib/feat-skill-tool-choices";
import type { SrdEquipmentData, EquipmentCategory, MagicItemType } from "@/data/types";

export type ItemGlyph = ComponentType<SVGProps<SVGSVGElement>>;

// ── Weapons — by stable SRD weapon id, grouped into the families a player
//    recognises (closest reused lucide glyphs). ────────────────────────────────
const WEAPON_ICON: Record<string, ItemGlyph> = {
  // Blades — one-handed swords + knives
  longsword: Sword,
  shortsword: Sword,
  rapier: Sword,
  scimitar: Sword,
  sickle: Sword,
  dagger: Sword,
  // Heavy / two blades
  greatsword: Swords,
  // Axes + axe-bladed polearms
  handaxe: Axe,
  battleaxe: Axe,
  greataxe: Axe,
  glaive: Axe,
  halberd: Axe,
  // Hammers
  "light-hammer": Hammer,
  warhammer: Hammer,
  maul: Hammer,
  // Bludgeons — maces, clubs, flails, staves
  club: Gavel,
  greatclub: Gavel,
  mace: Gavel,
  morningstar: Gavel,
  flail: Gavel,
  quarterstaff: Gavel,
  // Picks + thrusting hafted weapons
  "war-pick": Pickaxe,
  spear: Pickaxe,
  pike: Pickaxe,
  lance: Pickaxe,
  trident: Pickaxe,
  // Bows + crossbows — one archery family (lucide has no separate crossbow icon,
  // and a crossbow IS a bow-type launcher), so they share the bow-and-arrow glyph.
  shortbow: BowArrow,
  longbow: BowArrow,
  "light-crossbow": BowArrow,
  "hand-crossbow": BowArrow,
  "heavy-crossbow": BowArrow,
  // Firearms + blowgun — ranged, but not bows
  musket: Crosshair,
  pistol: Crosshair,
  blowgun: Crosshair,
  // Thrown / sling
  sling: Target,
  dart: Target,
  javelin: Target,
  // Lash
  whip: Zap,
};

/** Per-weapon-type glyph (undefined / custom / manifested / pact → generic sword). */
export function weaponSealIcon(weaponId?: string): ItemGlyph {
  return (weaponId && WEAPON_ICON[weaponId]) || Sword;
}

// ── Armor — body armor is a worn garment; shields are shields. Mundane + magic
//    armor share this so the armor glyph is identical everywhere. ──────────────
export function armorSealIcon(armorCategory?: string): ItemGlyph {
  return armorCategory === "shield" ? Shield : Shirt;
}

// ── Tools — by tool category (the wizard tool picker passes the category; the
//    inventory/compendium look the category up by id below, so a Lute reads the
//    same Music glyph in the picker and the bag). One glyph per category — the
//    switch is EXHAUSTIVE (a new `ToolCategory` is a compile error here). ───────
export function toolSealIcon(category: ToolCategory): ItemGlyph {
  switch (category) {
    case "artisan":
      return Wrench;
    case "instrument":
      return Music;
    case "gaming":
      return Dice5;
    case "kit":
      return Briefcase;
    case "navigator":
      return Compass;
    case "thieves":
      return KeyRound;
  }
}

/** Every tool's category by id — total over the catalogue (category is required,
 *  so the lookup never returns undefined for a real tool id). */
const TOOL_CATEGORY_BY_ID = new Map<string, ToolCategory>(
  SRD_TOOLS_2024.map((tool) => [tool.id, tool.category])
);

// ── Gear — by item id where a fitting glyph exists; the rest fall back to a
//    neutral box. Grouped by what the item IS so a bag of gear reads at a glance. ─
const GEAR_ICON: Record<string, ItemGlyph> = {
  // Arcane / divine focuses + books
  "arcane-focus": Sparkles,
  "druidic-focus": Leaf,
  "holy-symbol": Cross,
  "component-pouch": Sparkles,
  spellbook: BookOpen,
  // Ammunition — lucide has no dedicated arrow/bullet glyph, so arrows/bolts/quiver
  // share the archery bow-and-arrow icon (the same family as the bows that fire them).
  arrows: BowArrow,
  "crossbow-bolts": BowArrow,
  quiver: BowArrow,
  // Light + fire
  candle: Flame,
  torch: Flame,
  tinderbox: Flame,
  "alchemists-fire": Flame,
  lamp: Lamp,
  "lantern-bullseye": Lamp,
  "lantern-hooded": Lamp,
  // Flasks / alchemy / liquids
  oil: FlaskRound,
  acid: FlaskConical,
  antitoxin: FlaskRound,
  "holy-water": FlaskRound,
  "poison-basic": FlaskConical,
  waterskin: Droplet,
  perfume: Droplet,
  // Camp + provisions
  backpack: Backpack,
  bedroll: Bed,
  blanket: Bed,
  tent: Tent,
  rations: Utensils,
  // Clothing
  "clothes-fine": Shirt,
  "clothes-travelers": Shirt,
  costume: Drama,
  // Bindings / security / utility
  bell: Bell,
  lock: Lock,
  manacles: Lock,
  chain: Lock,
  "grappling-hook": Anchor,
  crowbar: Wrench,
  shovel: Pickaxe,
  "tinkers-tools": Wrench,
  "healers-kit": Stethoscope,
  "climbers-kit": Briefcase,
  ink: PenTool,
  "musical-instrument": Music,
};

/** Glyph for a gear/tool item by id (tools route through the shared tool-category
 *  glyph so they match the wizard picker; gear uses the family map). A tool-category
 *  item that isn't in the tool catalogue (e.g. a kit modelled as gear) falls back to
 *  the gear family map. */
function gearSealIcon(item: SrdEquipmentData): ItemGlyph {
  const toolCategory = TOOL_CATEGORY_BY_ID.get(item.id);
  if (toolCategory) return toolSealIcon(toolCategory);
  return GEAR_ICON[item.id] ?? Box;
}

// ── Magic items — by type. Armor + weapon reuse the mundane resolvers so a magic
//    breastplate reads with the same armor glyph as a plain one. ───────────────
export function magicItemSealIcon(type: MagicItemType): ItemGlyph {
  switch (type) {
    case "armor":
      return armorSealIcon();
    case "weapon":
      return weaponSealIcon();
    case "potion":
      return FlaskRound;
    case "ring":
      return CircleDot;
    case "rod":
      return Wand;
    case "scroll":
      return ScrollText;
    case "staff":
    case "wand":
      return Wand2;
    case "wondrous":
    default:
      return Sparkles;
  }
}

/** The ONE dispatcher: any SRD equipment row → its glyph. Exhaustive over
 *  `EquipmentCategory` (a new category becomes a compile error here — by design). */
export function equipmentSealIcon(item: SrdEquipmentData): ItemGlyph {
  switch (item.category) {
    case "weapon":
      return weaponSealIcon(item.id);
    case "armor":
      return armorSealIcon(item.armorCategory);
    case "shield":
      return Shield;
    case "pack":
      return Package;
    case "gear":
    case "tool":
      return gearSealIcon(item);
  }
}

/** A representative glyph for an equipment CATEGORY (the filter-chip facet on the
 *  Add-Item picker + compendium) — mirrors the magic-item type facet so both
 *  read with a leading glyph. Body armor = the garment; gear = a neutral box. */
const CATEGORY_ICON: Record<EquipmentCategory, ItemGlyph> = {
  weapon: Sword,
  armor: Shirt,
  shield: Shield,
  gear: Box,
  tool: Wrench,
  pack: Package,
};

export function equipmentCategoryIcon(category: EquipmentCategory): ItemGlyph {
  return CATEGORY_ICON[category];
}

const EQUIPMENT_BY_ID = new Map<string, SrdEquipmentData>(
  SRD_EQUIPMENT.map((item) => [item.id, item])
);

/** Glyph for an SRD equipment id (when only the id is in hand — e.g. the creation
 *  wizard's starting-gear list). Unknown / custom ids → neutral box. */
export function equipmentSealIconById(srdId?: string): ItemGlyph {
  if (!srdId) return Box;
  const item = EQUIPMENT_BY_ID.get(srdId);
  return item ? equipmentSealIcon(item) : Box;
}
