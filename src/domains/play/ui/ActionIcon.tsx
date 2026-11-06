/**
 * An action row's framed slot (approved prototype x-play `.slot`): the glyph
 * `actionIcon` picks from the data, drawn from the attributed Game Icons set.
 */
import { createElement, type ComponentType, type ReactNode, type SVGProps } from "react";

import {
  CompassIcon,
  DamageAcidIcon,
  DamageBludgeoningIcon,
  DamageColdIcon,
  DamageFireIcon,
  DamageForceIcon,
  DamageLightningIcon,
  DamageNecroticIcon,
  DamagePiercingIcon,
  DamagePoisonIcon,
  DamagePsychicIcon,
  DamageRadiantIcon,
  DamageSlashingIcon,
  DamageThunderIcon,
  ManaclesIcon,
  SchoolAbjurationIcon,
  SchoolConjurationIcon,
  SchoolDivinationIcon,
  SchoolEnchantmentIcon,
  SchoolEvocationIcon,
  SchoolIllusionIcon,
  SchoolNecromancyIcon,
  SchoolTransmutationIcon,
  UnarmedFistIcon,
  WeaponSpearIcon,
} from "@/components/shared/fantasy-icons";
import {
  ClassArtificerIcon,
  ClassBarbarianIcon,
  ClassBardIcon,
  ClassClericIcon,
  ClassDruidIcon,
  ClassFighterIcon,
  ClassMonkIcon,
  ClassPaladinIcon,
  ClassRangerIcon,
  ClassRogueIcon,
  ClassSorcererIcon,
  ClassWarlockIcon,
  ClassWizardIcon,
  FolioBookIcon,
  FolioBurstIcon,
  FolioCombatIcon,
  FolioControlIcon,
  FolioDefendIcon,
  FolioFeatIcon,
  FolioFocusIcon,
  FolioInventoryIcon,
  FolioMagicItemIcon,
  FolioMoveIcon,
  FolioSpellIcon,
  FolioSupportIcon,
} from "@/components/shared/folio-icons";
import { weaponSealIcon } from "@/components/shared/item-icons";
import type { ActionIconKey } from "@/domains/play/action-icon";
import type { SpellSchool } from "@/data/types";
import type { DamageType } from "@/types/damage";

type Glyph = ComponentType<SVGProps<SVGSVGElement>>;

const DAMAGE: Record<DamageType, Glyph> = {
  acid: DamageAcidIcon,
  bludgeoning: DamageBludgeoningIcon,
  cold: DamageColdIcon,
  fire: DamageFireIcon,
  force: DamageForceIcon,
  lightning: DamageLightningIcon,
  necrotic: DamageNecroticIcon,
  piercing: DamagePiercingIcon,
  poison: DamagePoisonIcon,
  psychic: DamagePsychicIcon,
  radiant: DamageRadiantIcon,
  slashing: DamageSlashingIcon,
  thunder: DamageThunderIcon,
};

const SCHOOL: Record<SpellSchool, Glyph> = {
  abjuration: SchoolAbjurationIcon,
  conjuration: SchoolConjurationIcon,
  divination: SchoolDivinationIcon,
  enchantment: SchoolEnchantmentIcon,
  evocation: SchoolEvocationIcon,
  illusion: SchoolIllusionIcon,
  necromancy: SchoolNecromancyIcon,
  transmutation: SchoolTransmutationIcon,
};

const CLASS: Record<string, Glyph> = {
  artificer: ClassArtificerIcon,
  barbarian: ClassBarbarianIcon,
  bard: ClassBardIcon,
  cleric: ClassClericIcon,
  druid: ClassDruidIcon,
  fighter: ClassFighterIcon,
  monk: ClassMonkIcon,
  paladin: ClassPaladinIcon,
  ranger: ClassRangerIcon,
  rogue: ClassRogueIcon,
  sorcerer: ClassSorcererIcon,
  warlock: ClassWarlockIcon,
  wizard: ClassWizardIcon,
};

const SPEARS = new Set(["spear", "pike", "lance", "trident", "javelin"]);

/** The base actions every character has, each with its own sign. */
const BASE: Record<string, Glyph> = {
  dash: FolioMoveIcon,
  disengage: FolioMoveIcon,
  dodge: FolioDefendIcon,
  grapple: ManaclesIcon,
  shove: FolioBurstIcon,
  help: FolioSupportIcon,
  hide: FolioFocusIcon,
  influence: FolioControlIcon,
  magic: FolioMagicItemIcon,
  ready: FolioFocusIcon,
  search: CompassIcon,
  study: FolioBookIcon,
  utilize: FolioInventoryIcon,
  "object-interaction": FolioInventoryIcon,
  "opportunity-attack": FolioCombatIcon,
};

function glyphOf(key: ActionIconKey): Glyph {
  switch (key.kind) {
    case "weapon":
      // Play draws only Game Icons: its own spear for the thrusting family.
      return SPEARS.has(key.id) ? WeaponSpearIcon : weaponSealIcon(key.id);
    case "unarmed":
      return UnarmedFistIcon;
    case "damage":
      return DAMAGE[key.type];
    case "heal":
      return FolioSupportIcon;
    case "class":
      return CLASS[key.id] ?? FolioFeatIcon;
    case "base":
      return BASE[key.id] ?? FolioCombatIcon;
    case "school":
      return SCHOOL[key.id];
    case "spell":
      return FolioSpellIcon;
    case "feature":
      return FolioFeatIcon;
  }
}

/** The glyph alone, as a painted icon's fallback. */
export function ActionGlyph({ icon }: { icon: ActionIconKey }) {
  return createElement(glyphOf(icon));
}

/**
 * The row's square slot: the painted `art` when there is one (BG3's hotbar art), else the
 * glyph; `tip` is the BG3 tooltip shown on hover.
 */
export function ActionIcon({
  icon,
  art,
  tip,
}: {
  icon: ActionIconKey;
  art?: ReactNode;
  tip?: ReactNode;
}) {
  return (
    <span className="f-act-slot" data-painted={art ? "" : undefined} aria-hidden="true">
      {art ?? createElement(glyphOf(icon))}
      {tip}
    </span>
  );
}
