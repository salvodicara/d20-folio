/**
 * Beginner glossary: the core combat terms Play explains on their visible labels,
 * with their official SRD 5.2.1 names (EN / IT). The bodies live in
 * `glossary.term.<id>`; the wiring sites take a `CombatTermId`, and
 * glossary-combat.guard reads this table, so the two can't drift.
 *
 * Opportunity Attack is explained by its base action card (`base-opportunity-attack`).
 * A term that is a toggle's label (Critical, Difficult Terrain, Surprised, cover)
 * is explained by an info mark right after the toggle (`.glossary-info`).
 */
import { COVER_REFERENCE, type CoverLevel } from "@/data/cover";
import type { BiText } from "@/data/types";
import type { Locale } from "@/lib/locale";
import { localizeText } from "@/lib/views/srd-i18n";
import type { GlossaryTermId } from "./GlossaryTip";

const coverName = (id: CoverLevel): BiText =>
  COVER_REFERENCE.find((c) => c.id === id)?.name ?? { en: id, it: id };

export const COMBAT_GLOSSARY = {
  advantage: { en: "Advantage", it: "Vantaggio" },
  disadvantage: { en: "Disadvantage", it: "Svantaggio" },
  halfCover: coverName("half"),
  threeQuartersCover: coverName("three-quarters"),
  totalCover: coverName("total"),
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
} as const satisfies Partial<Record<GlossaryTermId, BiText>>;

export type CombatTermId = keyof typeof COMBAT_GLOSSARY;

/** The cover table's levels as their glossary terms. */
export const COVER_TERM: Record<CoverLevel, { term: CombatTermId }> = {
  half: { term: "halfCover" },
  "three-quarters": { term: "threeQuartersCover" },
  total: { term: "totalCover" },
};

/** A combat term's official name in `locale` (a glossary tip's rubric). */
export const combatTermName = (id: CombatTermId, locale: Locale): string =>
  localizeText({ lit: COMBAT_GLOSSARY[id] }, locale);
