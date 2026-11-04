/**
 * The 2024 point-buy table and budget — the ONE encoding the creation draft,
 * its gates and the point-buy picker all read.
 *
 * Pure module — no React, no locale reads.
 */
import { ALL_ABILITY_CODES, type AbilityCode } from "@/data/types";

/** Point-buy cost table: score → points spent. */
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
export const POINT_BUY_BUDGET = 27;

/**
 * Point-buy cost of a score — the ONE seam every budget tally routes through.
 * Any score outside the 8–15 table is UNSPENDABLE (`Infinity`), so a value left
 * out of range by a Manual→Point-Buy round-trip can never read as a free 0-cost
 * purchase: the tally becomes infinite, the remaining budget never lands on 0,
 * and the point-buy gate stays blocked. (Bare `POINT_BUY_COST[score] ?? 0`
 * treated an illegal 30 as a spent-nothing buy, letting the budget be defeated.)
 */
export function pointBuyCost(score: number): number {
  return POINT_BUY_COST[score] ?? Infinity;
}

/** Points left of the budget for a set of base scores (`-Infinity` when illegal). */
export function pointBuyRemaining(scores: Record<AbilityCode, number>): number {
  return (
    POINT_BUY_BUDGET -
    ALL_ABILITY_CODES.reduce((sum, code) => sum + pointBuyCost(scores[code]), 0)
  );
}
