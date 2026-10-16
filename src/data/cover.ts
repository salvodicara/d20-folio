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
 */

import type { LocaleText } from "@/data/types";

export type CoverLevel = "half" | "three-quarters" | "total";

export interface CoverEffect {
  /** Stable id (kebab-case) */
  id: CoverLevel;
  /** Bilingual cover-level name */
  name: LocaleText;
  /** AC bonus to the target (or null for total cover) */
  acBonus: number | null;
  /** DEX-save bonus to the target (or null for total cover) */
  dexSaveBonus: number | null;
  /** Bilingual one-line summary */
  summary: LocaleText;
}

export const COVER_REFERENCE: ReadonlyArray<CoverEffect> = [
  {
    id: "half",
    name: { en: "Half Cover", it: "Mezza Copertura" },
    acBonus: 2,
    dexSaveBonus: 2,
    summary: {
      en: "+2 AC and +2 Dexterity saving throws.",
      it: "+2 alla CA e +2 ai tiri salvezza su Destrezza.",
    },
  },
  {
    id: "three-quarters",
    name: { en: "Three-Quarters Cover", it: "Tre Quarti di Copertura" },
    acBonus: 5,
    dexSaveBonus: 5,
    summary: {
      en: "+5 AC and +5 Dexterity saving throws.",
      it: "+5 alla CA e +5 ai tiri salvezza su Destrezza.",
    },
  },
  {
    id: "total",
    name: { en: "Total Cover", it: "Copertura Totale" },
    acBonus: null,
    dexSaveBonus: null,
    summary: {
      en: "Can't be targeted directly by an attack or targeted spell.",
      it: "Non può essere bersaglio diretto di un attacco o incantesimo mirato.",
    },
  },
];
