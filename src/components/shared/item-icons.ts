/**
 * item-icons — the SINGLE source of truth for the glyph that represents a
 * weapon / armor / shield / tool / gear / pack / magic item across the whole app
 * (D35). Every surface that draws an item seal — the inventory page, the
 * compendium, the Add-Item picker, the creation/level-up wizards, the weapon-
 * mastery + tool pickers — resolves through these helpers, so a given item reads
 * with the SAME glyph everywhere (consistency by design) and a tweak propagates
 * from one place.
 *
 * Lucide remains the action/control baseline. Object nouns that must read as
 * fantasy equipment use one normalized, attributed filled-glyph vocabulary behind
 * this resolver; consumers never import it directly. Icon-only helpers (no JSX)
 * so callers wrap them in `<KindSeal>` / `<Icon>` / `<UniversalCard sealIcon>`.
 */
import type { ComponentType, SVGProps } from "react";
import {
  BreastplateIcon,
  CampfireIcon,
  ClubIcon,
  CompassIcon,
  CrowbarIcon,
  CrossbowIcon,
  DiamondRingIcon,
  DiceIcon,
  FlailIcon,
  LockpicksIcon,
  MaceIcon,
  ManaclesIcon,
  MusketIcon,
  PistolIcon,
  PotionIcon,
  SickleIcon,
  SlingIcon,
  SpearIcon,
  StaffIcon,
  WarPickIcon,
  WeaponAxeIcon,
  WeaponBowIcon,
  WeaponHammerIcon,
  WeaponSwordIcon,
  WhipIcon,
  WizardStaffIcon,
} from "@/components/shared/fantasy-icons";
import {
  ClassArtificerIcon,
  ClassBardIcon,
  FolioDefendIcon,
  FolioInventoryIcon,
  FolioMagicItemIcon,
  FolioMetamagicIcon,
  FolioScrollIcon,
  FolioSpellIcon,
  FolioSupportIcon,
} from "@/components/shared/folio-icons";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_TOOLS_2024, type ToolCategory } from "@/lib/feat-skill-tool-choices";
import type { SrdEquipmentData, EquipmentCategory, MagicItemType } from "@/data/types";

export type ItemGlyph = ComponentType<SVGProps<SVGSVGElement>>;

// ── Weapons — by stable SRD weapon id, grouped into the families a player
//    recognises. Every weapon noun uses the same filled fantasy grammar. ──────
const WEAPON_ICON: Record<string, ItemGlyph> = {
  // Blades — one-handed swords + knives
  longsword: WeaponSwordIcon,
  shortsword: WeaponSwordIcon,
  rapier: WeaponSwordIcon,
  scimitar: WeaponSwordIcon,
  sickle: SickleIcon,
  dagger: WeaponSwordIcon,
  // Heavy blades retain the same single-sword family sign: crossed swords read
  // as "combat", not as the weapon itself.
  greatsword: WeaponSwordIcon,
  // Axes + axe-bladed polearms
  handaxe: WeaponAxeIcon,
  battleaxe: WeaponAxeIcon,
  greataxe: WeaponAxeIcon,
  glaive: WeaponSwordIcon,
  halberd: WeaponAxeIcon,
  // Hammers
  "light-hammer": WeaponHammerIcon,
  warhammer: WeaponHammerIcon,
  maul: WeaponHammerIcon,
  // Bludgeons retain the handling distinction a player must recognize; the
  // quarterstaff keeps its own straight-haft sign instead of a courtroom gavel.
  club: ClubIcon,
  greatclub: ClubIcon,
  mace: MaceIcon,
  morningstar: MaceIcon,
  flail: FlailIcon,
  quarterstaff: StaffIcon,
  // Picks + thrusting hafted weapons
  "war-pick": WarPickIcon,
  spear: SpearIcon,
  pike: SpearIcon,
  lance: SpearIcon,
  trident: SpearIcon,
  // Bows and crossbows are different handling models and different silhouettes;
  // the distinction earns a separate family sign in a weapon list.
  shortbow: WeaponBowIcon,
  longbow: WeaponBowIcon,
  "light-crossbow": CrossbowIcon,
  "hand-crossbow": CrossbowIcon,
  "heavy-crossbow": CrossbowIcon,
  // A sight marks a target, not a weapon. Long gun and pistol therefore keep
  // literal silhouettes; the blowgun follows its dart-projectile family.
  musket: MusketIcon,
  pistol: PistolIcon,
  blowgun: WeaponBowIcon,
  // Thrown projectiles reuse the filled archery sign; a family matters more than
  // a subtype silhouette at 12–16px. The sling uses a literal Y-shaped sign.
  sling: SlingIcon,
  dart: WeaponBowIcon,
  javelin: SpearIcon,
  // Lash
  whip: WhipIcon,
};

/** Per-weapon-type glyph (undefined / custom / manifested / pact → generic sword). */
export function weaponSealIcon(weaponId?: string): ItemGlyph {
  return (weaponId && WEAPON_ICON[weaponId]) || WeaponSwordIcon;
}

// ── Armor — body armor is a worn garment; shields are shields. Mundane + magic
//    armor share this so the armor glyph is identical everywhere. ──────────────
export function armorSealIcon(armorCategory?: string): ItemGlyph {
  return armorCategory === "shield" ? FolioDefendIcon : BreastplateIcon;
}

// ── Tools — by tool category (the wizard tool picker passes the category; the
//    inventory/compendium look the category up by id below, so a Lute reads the
//    same Music glyph in the picker and the bag). One glyph per category — the
//    switch is EXHAUSTIVE (a new `ToolCategory` is a compile error here). ───────
export function toolSealIcon(category: ToolCategory): ItemGlyph {
  switch (category) {
    case "artisan":
      return ClassArtificerIcon;
    case "instrument":
      return ClassBardIcon;
    case "gaming":
      return DiceIcon;
    case "kit":
      return FolioInventoryIcon;
    case "navigator":
      return CompassIcon;
    case "thieves":
      return LockpicksIcon;
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
  "arcane-focus": FolioSpellIcon,
  "druidic-focus": FolioSpellIcon,
  "holy-symbol": FolioSpellIcon,
  "component-pouch": FolioSpellIcon,
  spellbook: FolioSpellIcon,
  // Ammunition — lucide has no dedicated arrow/bullet glyph, so arrows/bolts/quiver
  // share the archery bow-and-arrow icon (the same family as the bows that fire them).
  arrows: WeaponBowIcon,
  "crossbow-bolts": WeaponBowIcon,
  quiver: WeaponBowIcon,
  // Light + fire
  candle: CampfireIcon,
  torch: CampfireIcon,
  tinderbox: CampfireIcon,
  "alchemists-fire": CampfireIcon,
  lamp: CampfireIcon,
  "lantern-bullseye": CampfireIcon,
  "lantern-hooded": CampfireIcon,
  // Flasks / alchemy / liquids
  oil: PotionIcon,
  acid: PotionIcon,
  antitoxin: PotionIcon,
  "holy-water": PotionIcon,
  "poison-basic": PotionIcon,
  waterskin: PotionIcon,
  perfume: PotionIcon,
  // Camp + provisions
  backpack: FolioInventoryIcon,
  bedroll: FolioInventoryIcon,
  blanket: FolioInventoryIcon,
  tent: FolioInventoryIcon,
  rations: FolioInventoryIcon,
  // Clothing
  "clothes-fine": FolioInventoryIcon,
  "clothes-travelers": FolioInventoryIcon,
  costume: FolioInventoryIcon,
  // Bindings / security / utility
  bell: FolioInventoryIcon,
  lock: LockpicksIcon,
  manacles: ManaclesIcon,
  chain: ManaclesIcon,
  "grappling-hook": FolioInventoryIcon,
  crowbar: CrowbarIcon,
  shovel: ClassArtificerIcon,
  "tinkers-tools": ClassArtificerIcon,
  "healers-kit": FolioSupportIcon,
  "climbers-kit": FolioInventoryIcon,
  ink: FolioScrollIcon,
  "musical-instrument": ClassBardIcon,
};

/** Glyph for a gear/tool item by id (tools route through the shared tool-category
 *  glyph so they match the wizard picker; gear uses the family map). A tool-category
 *  item that isn't in the tool catalogue (e.g. a kit modelled as gear) falls back to
 *  the gear family map. */
function gearSealIcon(item: SrdEquipmentData): ItemGlyph {
  const toolCategory = TOOL_CATEGORY_BY_ID.get(item.id);
  if (toolCategory) return toolSealIcon(toolCategory);
  return GEAR_ICON[item.id] ?? FolioInventoryIcon;
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
      return PotionIcon;
    case "ring":
      return DiamondRingIcon;
    case "rod":
      return FolioMetamagicIcon;
    case "scroll":
      return FolioScrollIcon;
    case "staff":
      return WizardStaffIcon;
    case "wand":
      return FolioMetamagicIcon;
    case "wondrous":
    default:
      return FolioMagicItemIcon;
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
      return FolioDefendIcon;
    case "pack":
      return FolioInventoryIcon;
    case "gear":
    case "tool":
      return gearSealIcon(item);
  }
}

/** A representative glyph for an equipment CATEGORY (the filter-chip facet on the
 *  Add-Item picker + compendium) — mirrors the magic-item type facet so both
 *  read with a leading glyph. Body armor = the garment; gear = a neutral box. */
const CATEGORY_ICON: Record<EquipmentCategory, ItemGlyph> = {
  weapon: WeaponSwordIcon,
  armor: BreastplateIcon,
  shield: FolioDefendIcon,
  gear: FolioInventoryIcon,
  tool: ClassArtificerIcon,
  pack: FolioInventoryIcon,
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
  if (!srdId) return FolioInventoryIcon;
  const item = EQUIPMENT_BY_ID.get(srdId);
  return item ? equipmentSealIcon(item) : FolioInventoryIcon;
}
