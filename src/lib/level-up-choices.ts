/**
 * Types and pure helpers for the inline level-up choice steps.
 * Kept in lib/ to satisfy react-refresh/only-export-components rule.
 */

import type { AbilityCode } from "@/data/types";

// ─── ASI Choice ──────────────────────────────────────────────────────────────

export type AsiChoiceMode = "plus2" | "plus1_1" | "feat";

export interface AsiChoice {
  mode: AsiChoiceMode;
  /** Stat chosen for +2 mode */
  plusTwo: AbilityCode | null;
  /** First stat for +1/+1 mode */
  plusOneA: AbilityCode | null;
  /** Second stat for +1/+1 mode */
  plusOneB: AbilityCode | null;
  /** Feat ID for feat mode */
  featId: string | null;
  /** H1 — when the picked feat carries an "Ability Score Increase" clause,
   *  the ability the player chose to boost (e.g. STR or CON for Heavy
   *  Armor Master). null when the feat has no ASI or the user hasn't
   *  picked yet. */
  featAbility: AbilityCode | null;
}

export function emptyAsiChoice(): AsiChoice {
  return {
    mode: "plus2",
    plusTwo: null,
    plusOneA: null,
    plusOneB: null,
    featId: null,
    featAbility: null,
  };
}

/**
 * Returns true when the choice is fully specified and ready to apply.
 *
 * `featRequiresAbility` lets the caller assert that the currently-selected
 * feat carries an ASI clause and therefore the user must also pick
 * `featAbility` for the choice to be complete. Defaults to false (back-compat).
 */
export function isAsiChoiceComplete(
  choice: AsiChoice,
  featRequiresAbility = false
): boolean {
  if (choice.mode === "plus2") return choice.plusTwo !== null;
  if (choice.mode === "plus1_1") {
    return (
      choice.plusOneA !== null &&
      choice.plusOneB !== null &&
      choice.plusOneA !== choice.plusOneB
    );
  }
  // mode === "feat"
  if (choice.featId === null) return false;
  if (featRequiresAbility && choice.featAbility === null) return false;
  return true;
}

/** Apply an ASI choice to an ability score record. Returns a new record. */
export function applyAsiToScores(
  scores: Record<AbilityCode, number>,
  choice: AsiChoice
): Record<AbilityCode, number> {
  if (choice.mode === "plus2" && choice.plusTwo) {
    return { ...scores, [choice.plusTwo]: Math.min(20, scores[choice.plusTwo] + 2) };
  }
  if (choice.mode === "plus1_1" && choice.plusOneA && choice.plusOneB) {
    return {
      ...scores,
      [choice.plusOneA]: Math.min(20, scores[choice.plusOneA] + 1),
      [choice.plusOneB]: Math.min(20, scores[choice.plusOneB] + 1),
    };
  }
  return scores;
}
