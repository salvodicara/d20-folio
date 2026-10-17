/**
 * Beginner glossary: the core combat terms Play explains on their visible labels.
 * The bodies live in `glossary.term.<id>`; the wiring sites take a `CombatTermId`,
 * and glossary-combat.guard reads this table (with each term's official SRD 5.2.1
 * name from the catalogues), so the two can't drift. The cover terms are named as
 * the `rule` catalogue's cover rows (`COVER_TERM`).
 *
 * Opportunity Attack is explained by its base action card (`base-opportunity-attack`).
 * A term that is a toggle's label (Critical, Difficult Terrain, Surprised, cover)
 * is explained by an info mark right after the toggle (`.glossary-info`).
 */
import type { CoverLevel } from "@/data/cover";
import type { Locale } from "@/lib/locale";
import { localizeText } from "@/lib/views/srd-i18n";
import type { GlossaryTermId } from "./GlossaryTip";

export const COMBAT_GLOSSARY = [
  "advantage",
  "disadvantage",
  "bloodied",
  "temporaryHitPoints",
  "deathSavingThrow",
  "resistance",
  "vulnerability",
  "immunity",
  "reaction",
  "bonusAction",
  "criticalHit",
  "difficultTerrain",
  "surprise",
] as const satisfies readonly GlossaryTermId[];

/** The cover table's levels as their glossary terms, named as the cover rows are. */
export const COVER_TERM = {
  half: { term: "halfCover" },
  "three-quarters": { term: "threeQuartersCover" },
  total: { term: "totalCover" },
} as const satisfies Record<CoverLevel, { term: GlossaryTermId }>;

export type CombatTermId =
  | (typeof COMBAT_GLOSSARY)[number]
  | (typeof COVER_TERM)[CoverLevel]["term"];

/**
 * The toggle terms' official names, as the ui key that holds each one: the label
 * the sheet already shows where one exists, else a `glossary.name.<term>` entry.
 */
export const TOGGLE_TERM_NAME_KEY = {
  criticalHit: "abilities.critRange",
  difficultTerrain: "glossary.name.difficultTerrain",
  surprise: "glossary.name.surprise",
} as const satisfies Partial<Record<CombatTermId, string>>;

/** A toggle term's official name in `locale` (a glossary tip's rubric). */
export const combatTermName = (
  id: keyof typeof TOGGLE_TERM_NAME_KEY,
  locale: Locale
): string => localizeText({ ui: TOGGLE_TERM_NAME_KEY[id] }, locale);
