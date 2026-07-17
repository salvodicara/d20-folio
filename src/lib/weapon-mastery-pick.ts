/**
 * M1 — Weapon Mastery choice modelling.
 *
 * Fighter (L1, 3 weapons), Barbarian / Paladin / Ranger / Rogue (L1, 2
 * weapons each) gain the ability to use the Mastery property of N
 * Simple/Martial weapons they're proficient with. The level-up wizard
 * uses this helper to (a) detect when the picker is needed, (b) list the
 * SRD weapons that have a mastery property, and (c) record the picks
 * on `character.weaponMasteries`.
 *
 * Counts are taken verbatim from the existing 2024 feature descriptions
 * in `src/data/classes/<class>.ts` — no invention.
 */

import { SRD_WEAPONS } from "@/data/weapons";
import { getClassTable } from "@/data/classes";
import type { SrdEquipmentData } from "@/data/types";
import type { CharacterData } from "@/types/character";

/** The general feat (`feat:weapon-master`) that grants its own Weapon Mastery slot. */
const WEAPON_MASTER_FEAT_ID = "weapon-master";

/**
 * Placeholder feature ids that signal "the player needs to pick mastery weapons".
 * The five martial-class features grant their level-scaled slots; the Weapon Master
 * FEAT (`feat:weapon-master`) grants ONE more on top (2024 RAW: "use the mastery
 * property of one kind of Simple or Martial weapon of your choice … you can change
 * the kind of weapon" each Long Rest). All of them surface the SAME picker.
 */
const WEAPON_MASTERY_FEATURE_IDS: ReadonlySet<string> = new Set([
  "fighter-weapon-mastery",
  "barbarian-weapon-mastery",
  "paladin-weapon-mastery",
  "ranger-weapon-mastery",
  "rogue-weapon-mastery",
  WEAPON_MASTER_FEAT_ID,
]);

/** Returns true when the supplied feature id grants Weapon Mastery picks. */
export function isWeaponMasteryPlaceholder(featureId: string): boolean {
  return WEAPON_MASTERY_FEATURE_IDS.has(featureId);
}

/**
 * Extra Weapon Mastery slots a character gains from FEATS (not class). 2024 RAW:
 * the Weapon Master feat grants ONE mastery slot (swappable each Long Rest). Read
 * from `features[]` (the materialized feat view) by stable id — never a label.
 */
export function featMasterySlots(character: CharacterData): number {
  return character.features.some((f) => "srdId" in f && f.srdId === WEAPON_MASTER_FEAT_ID)
    ? 1
    : 0;
}

/**
 * Number of weapons the player picks for Weapon Mastery, READ from the class's
 * Weapon Mastery table column at the given class level — the SINGLE source of
 * truth (`classSpecific.weaponMastery`, declared beside the other scaling
 * columns in `src/data/classes/<class>.ts`). Per 2024 RAW: Fighter scales
 * 3/4/5/6 at L1/4/10/16, Barbarian 2/3/4 at L1/4/10, and Paladin/Ranger/Rogue
 * are a flat 2 (no scaling column). A class that doesn't grant Weapon Mastery
 * has no `weaponMastery` column, so this returns 0. `level` defaults to 1 and is
 * clamped to the [1, 20] table range. Reading the table (never a hand-written
 * per-class number here) is what keeps the picker from ever drifting from RAW —
 * the bug in #30 was a hardcoded flat-2 that ignored the Barbarian column.
 */
export function weaponMasteryCountForClass(classId: string, level = 1): number {
  const table = getClassTable(classId);
  if (!table) return 0;
  const clamped = Math.max(1, Math.min(20, Math.floor(level)));
  const row = table.levels.find((l) => l.level === clamped);
  const count = row?.classSpecific?.weaponMastery;
  return typeof count === "number" ? count : 0;
}

/**
 * The TOTAL number of Weapon Mastery weapons a character may pick on a single class
 * entry — the class column at this entry's level PLUS the feat slots (the Weapon
 * Master feat's +1). The character-wide count is the single source of truth the
 * picker `max` and the build-reconcile clamp both read, so a feat-granted slot can
 * never be picked beyond (picker) nor clamped away (reconcile). The feat slot folds
 * into the PRIMARY entry — the one the Features-tab re-pick writes to — so a
 * non-mastery class (e.g. a Wizard who took the feat) still gets exactly one slot.
 */
export function weaponMasteryCount(
  character: CharacterData,
  classId: string,
  level: number,
  { isPrimary = true }: { isPrimary?: boolean } = {}
): number {
  return (
    weaponMasteryCountForClass(classId, level) +
    (isPrimary ? featMasterySlots(character) : 0)
  );
}

/**
 * All SRD weapons that carry a Mastery property (Topple, Push, Cleave,
 * Vex, Slow, Sap, Graze, Nick — the 2024 mastery properties), sorted by
 * SRD id. These are the only valid picks for Weapon Mastery.
 */
export function listMasterableWeapons(): SrdEquipmentData[] {
  return SRD_WEAPONS.filter((w) => typeof w.mastery === "string").sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}
