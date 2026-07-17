/**
 * SRD Classes Data — Aggregated Index
 * Combines all 12 class tables and features into unified collections with lookup helpers.
 */

import type { SrdClassTable, SrdClassFeatureData } from "@/data/types";
import { mergePack } from "@/lib/pack-merge";
import { packClassTables, packClassFeatures, packSubclasses } from "@pack";

import { BARBARIAN_TABLE, BARBARIAN_FEATURES } from "@/data/classes/barbarian";
import { BARD_TABLE, BARD_FEATURES } from "@/data/classes/bard";
import { CLERIC_TABLE, CLERIC_FEATURES } from "@/data/classes/cleric";
import { DRUID_TABLE, DRUID_FEATURES } from "@/data/classes/druid";
import { FIGHTER_TABLE, FIGHTER_FEATURES } from "@/data/classes/fighter";
import { MONK_TABLE, MONK_FEATURES } from "@/data/classes/monk";
import { PALADIN_TABLE, PALADIN_FEATURES } from "@/data/classes/paladin";
import { RANGER_TABLE, RANGER_FEATURES } from "@/data/classes/ranger";
import { ROGUE_TABLE, ROGUE_FEATURES } from "@/data/classes/rogue";
import { SORCERER_TABLE, SORCERER_FEATURES } from "@/data/classes/sorcerer";
import { WARLOCK_TABLE, WARLOCK_FEATURES, pactSlotLevel } from "@/data/classes/warlock";
import { WIZARD_TABLE, WIZARD_FEATURES } from "@/data/classes/wizard";

/**
 * Compose one public class table with its content-pack contributions:
 * pack-only subclasses append to `subclasses` (id collision throws;
 * identity without the pack).
 */
function withPackSubclasses(table: SrdClassTable): SrdClassTable {
  const extra = packSubclasses[table.id] ?? [];
  if (extra.length === 0) return table;
  return {
    ...table,
    subclasses: mergePack(`${table.id} subclass`, table.subclasses, extra),
  };
}

/** All class tables — public SRD (pack-extended) + pack-only classes. */
export const classTables: SrdClassTable[] = mergePack(
  "class",
  [
    BARBARIAN_TABLE,
    BARD_TABLE,
    CLERIC_TABLE,
    DRUID_TABLE,
    FIGHTER_TABLE,
    MONK_TABLE,
    PALADIN_TABLE,
    RANGER_TABLE,
    ROGUE_TABLE,
    SORCERER_TABLE,
    WARLOCK_TABLE,
    WIZARD_TABLE,
  ].map(withPackSubclasses),
  packClassTables
);

/** All class features (all classes combined) — public SRD + content pack. */
export const classFeatures: SrdClassFeatureData[] = mergePack(
  "class-feature",
  [
    ...BARBARIAN_FEATURES,
    ...BARD_FEATURES,
    ...CLERIC_FEATURES,
    ...DRUID_FEATURES,
    ...FIGHTER_FEATURES,
    ...MONK_FEATURES,
    ...PALADIN_FEATURES,
    ...RANGER_FEATURES,
    ...ROGUE_FEATURES,
    ...SORCERER_FEATURES,
    ...WARLOCK_FEATURES,
    ...WIZARD_FEATURES,
  ],
  packClassFeatures
);

/** Index for fast class table lookup by ID */
export const classTableIndex = new Map<string, SrdClassTable>(
  classTables.map((c) => [c.id, c])
);

/** Index for fast feature lookup by ID */
export const classFeatureIndex = new Map<string, SrdClassFeatureData>(
  classFeatures.map((f) => [f.id, f])
);

/** Get a class table by ID */
export function getClassTable(id: string): SrdClassTable | undefined {
  return classTableIndex.get(id);
}

// A1 — resolving a stable class/subclass id from a (possibly IT-localized) stored
// string lives in the SRD-FREE `@/data/srd-names` (`resolveClassId` /
// `resolveSubclassId`): id resolution must not pull the multi-megabyte class data,
// and after R3 the class display names live in the i18n catalogues, not on the
// class table. The old `getCharacterClassId` / `getCharacterSubclassId` (which
// matched on the class table's `name.en`/`name.it`) were unused and were removed
// in R6+R3 SLICE 7b.

/** Get all features for a specific class */
export function getClassFeatures(classId: string): SrdClassFeatureData[] {
  return classFeatures.filter((f) => f.class === classId);
}

/** Get features for a specific class at a specific level */
export function getFeaturesAtLevel(
  classId: string,
  level: number
): SrdClassFeatureData[] {
  return classFeatures.filter((f) => f.class === classId && f.level === level);
}

/** Get all subclass features */
export function getSubclassFeatures(
  classId: string,
  subclassId: string
): SrdClassFeatureData[] {
  return classFeatures.filter((f) => f.class === classId && f.subclass === subclassId);
}

// `searchFeatures` (name-substring search over class features) was unused and
// read the class-feature `name.en`/`name.it` BiText that R3 moved into the i18n
// catalogues — removed in R6+R3 SLICE 7b. A feature search, if needed, belongs in
// a view that resolves names via `localizeSrd`.

// Re-export only the symbols consumed THROUGH this barrel: BARD_TABLE / MONK_TABLE
// (the class-table consistency tests) and pactSlotLevel (slot-cost-scaled pact-weapon
// riders — Eldritch Smite +1d8 per slot level). Every other class TABLE/FEATURES is
// imported directly from its `@/data/classes/<class>` subpath.
export { BARD_TABLE, MONK_TABLE, pactSlotLevel };
