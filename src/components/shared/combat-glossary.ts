/**
 * Beginner glossary: the core combat terms Play explains on their visible labels.
 * The bodies live in `glossary.term.<id>`; the wiring sites take a `CombatTermId`,
 * and glossary-combat.guard reads this table (with each term's official SRD 5.2.1
 * name from the catalogues), so the two can't drift. The cover terms are named as
 * the `rule` catalogue's cover rows (`COVER_TERM`).
 *
 * Opportunity Attack is explained by its base action card (`base-opportunity-attack`).
 */
import type { CoverLevel } from "@/data/cover";
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
