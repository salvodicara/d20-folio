/**
 * Which glossary term explains each guided-creation rubric — PD, rule 30 audit
 * (2026-09-09). A pure lookup for the screen owner: the creation step labels
 * pass through here so every rubric can carry the one `GlossaryTip` primitive
 * (`glossary.term.<id>`, EN + IT) without the screen naming term ids itself.
 * The reference products define every keyword where it is shown (research
 * 2026-09-09-game-feel.md §2.4); this is the seam that makes that possible.
 */

/** The glossary catalogue ids, typed off the EN shard (type-only, never bundled). */
export type GlossaryTermId =
  keyof (typeof import("@/i18n/en/ui/glossary.json"))["glossary"]["term"];

/** Creation rubric → glossary term. The object shape matches `GlossaryTipProps`. */
export const CREATION_GLOSSARY: Readonly<Record<string, { term: GlossaryTermId }>> = {
  species: { term: "species" },
  background: { term: "background" },
  class: { term: "characterClass" },
  subclass: { term: "subclass" },
  fightingStyle: { term: "fightingStyle" },
  weaponMastery: { term: "weaponMastery" },
  standardArray: { term: "standardArray" },
  alignment: { term: "alignment" },
  originFeat: { term: "originFeat" },
  skills: { term: "skillProficiency" },
  pointBuy: { term: "pointBuy" },
  feat: { term: "feat" },
  hitPoints: { term: "hitPoints" },
  abilityScores: { term: "abilityScores" },
};

/** The glossary term for a creation rubric, or `undefined` when none explains it. */
export function creationGlossaryTerm(rubric: string): GlossaryTermId | undefined {
  return CREATION_GLOSSARY[rubric]?.term;
}
