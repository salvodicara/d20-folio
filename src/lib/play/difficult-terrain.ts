/**
 * Difficult Terrain (SRD 5.2.1 Rules Glossary): every foot of movement in it
 * costs 1 extra foot. The movement meter's ×2 toggle spends the feet the player
 * marks at that cost per foot (the same `costPerFoot` scalar the turn-economy
 * kernel prices a move with). Movement goes in 5-ft steps; a step the remaining
 * movement can't pay is not taken. Pure numbers.
 */

export const DIFFICULT_TERRAIN_COST_PER_FOOT = 2;

const STEP_FT = 5;

/**
 * The movement used after the player marks `nextUsedFt` (from `prevUsedFt`) while
 * each foot costs `costPerFoot`, within a turn budget of `budgetFt`. Marking
 * movement back returns it as marked.
 */
export function spendMovement(
  prevUsedFt: number,
  nextUsedFt: number,
  costPerFoot: number,
  budgetFt: number
): number {
  const movedFt = nextUsedFt - prevUsedFt;
  if (movedFt <= 0 || costPerFoot <= 1) return nextUsedFt;
  const stepCostFt = STEP_FT * costPerFoot;
  const affordableFt =
    Math.floor(Math.max(0, budgetFt - prevUsedFt) / stepCostFt) * STEP_FT;
  return prevUsedFt + Math.min(movedFt, affordableFt) * costPerFoot;
}
