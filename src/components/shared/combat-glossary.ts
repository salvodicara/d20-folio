/**
 * Beginner glossary: the core combat terms Play explains on their visible labels,
 * with their official SRD 5.2.1 names (EN / IT). The bodies live in
 * `glossary.term.<id>`; the wiring sites take a `CombatTermId`, and
 * glossary-combat.guard reads this table, so the two can't drift (it also holds
 * the cover names to the `rule` catalogue's cover rows).
 *
 * Opportunity Attack is explained by its base action card (`base-opportunity-attack`).
 */
import type { CoverLevel } from "@/data/cover";
import type { LocaleText } from "@/data/types";
import type { GlossaryTermId } from "./GlossaryTip";

export const COMBAT_GLOSSARY = {
  advantage: { en: "Advantage", it: "Vantaggio" },
  disadvantage: { en: "Disadvantage", it: "Svantaggio" },
  halfCover: { en: "Half Cover", it: "Mezza Copertura" },
  threeQuartersCover: { en: "Three-Quarters Cover", it: "Tre Quarti di Copertura" },
  totalCover: { en: "Total Cover", it: "Copertura Totale" },
  bloodied: { en: "Bloodied", it: "Sanguinante" },
  temporaryHitPoints: { en: "Temporary Hit Points", it: "Punti Ferita Temporanei" },
  deathSavingThrow: { en: "Death Saving Throw", it: "Tiro Salvezza contro Morte" },
  resistance: { en: "Resistance", it: "Resistenza" },
  vulnerability: { en: "Vulnerability", it: "Vulnerabilità" },
  immunity: { en: "Immunity", it: "Immunità" },
  reaction: { en: "Reaction", it: "Reazione" },
  bonusAction: { en: "Bonus Action", it: "Azione Bonus" },
} as const satisfies Partial<Record<GlossaryTermId, LocaleText>>;

export type CombatTermId = keyof typeof COMBAT_GLOSSARY;

/** The cover table's levels as their glossary terms. */
export const COVER_TERM: Record<CoverLevel, { term: CombatTermId }> = {
  half: { term: "halfCover" },
  "three-quarters": { term: "threeQuartersCover" },
  total: { term: "totalCover" },
};
