/**
 * Studying a manual or tome (Manual of Bodily Health, Tome of Clear Thought, …):
 * after the reading, an ability score rises for good — "increases by 2, to a
 * maximum of 30" — and the book loses its magic. The increase is written into the
 * stored score like an Ability Score Improvement, so it stays when the book is
 * sold or lost, and every reader of the stored sheet sees it. Pure: the store
 * writes the returned scores and spends the book's single `uses` resource, whose
 * depletion leaves the copy nonmagical, so the same book can't be studied twice.
 */
import type { AbilityCode } from "@/data/types";
import type { Grant } from "@/lib/grants";

/**
 * The scores after studying an item with these grants, or `null` when the item
 * raises nothing (it has no `permanent-ability-increase`) or every raised score is
 * already at its maximum.
 */
export function studyItemAbilityScores(
  scores: Readonly<Record<AbilityCode, number>>,
  grants: ReadonlyArray<Grant> | undefined
): Record<AbilityCode, number> | null {
  let next: Record<AbilityCode, number> = { ...scores };
  for (const grant of grants ?? []) {
    if (grant.type !== "permanent-ability-increase") continue;
    const current = next[grant.ability];
    // Never lowers a score already above the maximum.
    next = {
      ...next,
      [grant.ability]: Math.max(current, Math.min(grant.cap, current + grant.amount)),
    };
  }
  const changed = (Object.keys(next) as AbilityCode[]).some(
    (ability) => next[ability] !== scores[ability]
  );
  return changed ? next : null;
}
