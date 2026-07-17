/**
 * H1 / A4 Phase 8 — Derive the structured "Ability Score Increase" choice
 * from a feat.
 *
 * Originally (M48) this module regex-parsed the English description; A4
 * Phase 8 reshapes it to read from the declarative `feat.grants[]` field
 * instead. The public API is preserved so every existing consumer
 * (LevelUpModal ASI step, LevelUpAsiStep picker, tests) keeps working
 * unchanged. The legacy regex code is gone; if `feat.grants[]` is empty
 * the result is null (matches the previous behaviour for non-ASI feats).
 */

import type { AbilityCode, SrdFeatData } from "@/data/types";
import type { Grant } from "@/lib/grants";

export interface FeatAsi {
  /** Ability keys the player can choose from. */
  abilities: AbilityCode[];
  /** How much to add (always +1 for 2024 feats; left flexible). */
  amount: number;
  /**
   * Soft cap from the grant. Defaults to 20 (RAW 2024 — every standard
   * feat's "up to a maximum of 20" wording). Epic Boon feats raise it
   * to 30. The grant's `cap?: number` is forwarded here so consumers
   * (LevelUpModal, applyFeatAsi default) honor it without re-reading
   * the grant.
   */
  cap: number;
}

/**
 * Inspect the feat's declarative grants and return the structured ASI
 * info. Matches both single-ability (`type: "ability-score"`) and
 * multi-choice (`type: "choice-ability-score"`) grants.
 */
export function featAsi(feat: Pick<SrdFeatData, "grants">): FeatAsi | null {
  const grants: ReadonlyArray<Grant> = feat.grants ?? [];
  for (const g of grants) {
    if (g.type === "ability-score") {
      return { abilities: [g.ability], amount: g.amount, cap: g.cap ?? 20 };
    }
    if (g.type === "choice-ability-score") {
      return { abilities: [...g.abilities], amount: g.amount, cap: g.cap ?? 20 };
    }
  }
  return null;
}

/**
 * Apply `amount` to one ability (clamped to a soft cap of 20 — matches 2024
 * RAW for feat-granted ASI; "up to a maximum of 20" is in every relevant
 * feat). Returns a new abilityScores object.
 */
export function applyFeatAsi(
  abilityScores: Record<AbilityCode, number>,
  ability: AbilityCode,
  amount: number,
  cap = 20
): Record<AbilityCode, number> {
  const current = abilityScores[ability];
  const next = Math.min(cap, current + amount);
  return { ...abilityScores, [ability]: next };
}
