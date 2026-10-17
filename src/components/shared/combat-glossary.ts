/**
 * Beginner glossary: the core combat terms Play explains on their visible labels,
 * with their official SRD 5.2.1 names (EN / IT). The bodies live in
 * `glossary.term.<id>`; the wiring sites take a `CombatTermId`, and
 * glossary-combat.guard reads this table, so the two can't drift. The cover terms
 * take their names from the `rule` catalogue's cover rows (`COVER_TERM`).
 *
 * Opportunity Attack is explained by its base action card (`base-opportunity-attack`).
 * A term that is a toggle's label (Critical, Difficult Terrain, Surprised, cover)
 * is explained by an info mark right after the toggle (`.glossary-info`).
 */
import type { CoverLevel } from "@/data/cover";
import type { LocaleText } from "@/data/types";
import type { Locale } from "@/lib/locale";
import { localizeText } from "@/lib/views/srd-i18n";
import type { GlossaryTermId } from "./GlossaryTip";

export const COMBAT_GLOSSARY = {
  advantage: { en: "Advantage", it: "Vantaggio" },
  disadvantage: { en: "Disadvantage", it: "Svantaggio" },
  bloodied: { en: "Bloodied", it: "Sanguinante" },
  temporaryHitPoints: { en: "Temporary Hit Points", it: "Punti Ferita Temporanei" },
  deathSavingThrow: { en: "Death Saving Throw", it: "Tiro Salvezza contro Morte" },
  resistance: { en: "Resistance", it: "Resistenza" },
  vulnerability: { en: "Vulnerability", it: "Vulnerabilità" },
  immunity: { en: "Immunity", it: "Immunità" },
  reaction: { en: "Reaction", it: "Reazione" },
  bonusAction: { en: "Bonus Action", it: "Azione Bonus" },
  criticalHit: { en: "Critical Hit", it: "Colpo Critico" },
  difficultTerrain: { en: "Difficult Terrain", it: "Terreno Difficile" },
  surprise: { en: "Surprise", it: "Sorpresa" },
} as const satisfies Partial<Record<GlossaryTermId, LocaleText>>;

/** The cover table's levels as their glossary terms, named as the cover rows are. */
export const COVER_TERM = {
  half: { term: "halfCover" },
  "three-quarters": { term: "threeQuartersCover" },
  total: { term: "totalCover" },
} as const satisfies Record<CoverLevel, { term: GlossaryTermId }>;

export type CombatTermId =
  | keyof typeof COMBAT_GLOSSARY
  | (typeof COVER_TERM)[CoverLevel]["term"];

/** A combat term's official name in `locale` (a glossary tip's rubric). */
export const combatTermName = (
  id: keyof typeof COMBAT_GLOSSARY,
  locale: Locale
): string => localizeText({ lit: COMBAT_GLOSSARY[id] }, locale);
