/**
 * M8 — Cover quick-reference (D&D 2024 PHB).
 *
 * It renders in the Play tab's "Rules Reference" panel (`SituationalRules`),
 * alongside the mounted/underwater and travel-pace tables, and its Half and
 * Three-Quarters rows are the one-tap cover states on the AC tile
 * (`src/lib/cover-states.ts`). The values are
 * authoritative and shouldn't drift — see the unit test in
 * `tests/unit/cover.test.ts`.
 *
 * Total cover means the target can't be targeted directly by an attack or
 * effect that requires line-of-sight; an area still affects them only if
 * the effect can curve around the cover (e.g. some AoEs).
 *
 * Each row's name and one-line summary live in the `rule` SRD catalogue
 * (`src/i18n/<locale>/srd/rules.json`) under {@link coverKey}.
 */

export type CoverLevel = "half" | "three-quarters" | "total";

export interface CoverEffect {
  /** Stable id (kebab-case) */
  id: CoverLevel;
  /** AC bonus to the target (or null for total cover) */
  acBonus: number | null;
  /** DEX-save bonus to the target (or null for total cover) */
  dexSaveBonus: number | null;
}

/** The `rule` catalogue key of a cover level (`cover.half`): its `name` and `summary`. */
export function coverKey(id: CoverLevel): string {
  return `cover.${id}`;
}

export const COVER_REFERENCE: ReadonlyArray<CoverEffect> = [
  { id: "half", acBonus: 2, dexSaveBonus: 2 },
  { id: "three-quarters", acBonus: 5, dexSaveBonus: 5 },
  { id: "total", acBonus: null, dexSaveBonus: null },
];
