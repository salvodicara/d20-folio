/**
 * SRD Spells Data — Aggregated Index
 * Combines all spell levels into a unified collection with lookup helpers.
 */

import type { SrdSpellData } from "@/data/types";
import { mergePack } from "@/lib/pack-merge";
import { packSpells } from "@pack";
import { SRD_CANTRIPS } from "@/data/spells/cantrips";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";
import { SRD_SPELLS_LEVEL4 } from "@/data/spells/level4";
import { SRD_SPELLS_LEVEL5 } from "@/data/spells/level5";
import { SRD_SPELLS_LEVEL6 } from "@/data/spells/level6";
import { SRD_SPELLS_LEVEL7 } from "@/data/spells/level7";
import { SRD_SPELLS_LEVEL8 } from "@/data/spells/level8";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";

/**
 * All spells, all levels (cantrips = level 0) — public SRD + content pack,
 * sorted by (level, id) so the browse order is deterministic and identical in
 * both build modes (the raw file order would strand pack entries at the end).
 */
export const spells: SrdSpellData[] = mergePack(
  "spell",
  [
    ...SRD_CANTRIPS,
    ...SRD_SPELLS_LEVEL1,
    ...SRD_SPELLS_LEVEL2,
    ...SRD_SPELLS_LEVEL3,
    ...SRD_SPELLS_LEVEL4,
    ...SRD_SPELLS_LEVEL5,
    ...SRD_SPELLS_LEVEL6,
    ...SRD_SPELLS_LEVEL7,
    ...SRD_SPELLS_LEVEL8,
    ...SRD_SPELLS_LEVEL9,
  ],
  packSpells
).sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));

/** Index for fast lookup by ID */
export const spellIndex = new Map<string, SrdSpellData>(spells.map((s) => [s.id, s]));

/** Get spells by level */
export function getSpellsByLevel(level: number): SrdSpellData[] {
  return spells.filter((s) => s.level === level);
}

/** Get spells by class */
export function getSpellsByClass(className: string): SrdSpellData[] {
  const lower = className.toLowerCase();
  return spells.filter((s) => s.classes.some((c) => c.toLowerCase() === lower));
}

/** Get spells by school */
export function getSpellsBySchool(school: SrdSpellData["school"]): SrdSpellData[] {
  return spells.filter((s) => s.school === school);
}

// `searchSpells` (name-substring search) was unused and read the spell
// `name.en`/`name.it` BiText that R3 moved into the i18n catalogues — removed in
// R6+R3 SLICE 7b. The live spell pickers search via `localizeSrd`-resolved labels
// in the view layer, not over the data.

/** Get a single spell by ID, or undefined */
export function getSpellById(id: string): SrdSpellData | undefined {
  return spellIndex.get(id);
}
