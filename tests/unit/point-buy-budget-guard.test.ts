/**
 * B09 — Point-Buy budget defeated by round-tripping through Manual entry.
 *
 * Manual ability entry clamps only to [1,30]. Switching Manual→Point-Buy with a
 * score left outside the 8–15 table used to make that ability read as a free,
 * 0-cost purchase (`POINT_BUY_COST[30] ?? 0` === 0), so the player could spend
 * the full 27 on the other five, land `pointsRemaining === 0`, and Create an
 * illegal 30. `pointBuyCost` is the single seam every budget tally now routes
 * through: an out-of-table score is UNSPENDABLE (Infinity), so the tally goes
 * infinite and `pointsRemaining` can never reach 0 — the gate stays blocked.
 */
import { describe, it, expect } from "vitest";
import {
  pointBuyCost,
  POINT_BUY_COST,
  POINT_BUY_BUDGET,
  ABILITY_CODES,
} from "@/features/creation/steps/steps";
import type { AbilityCode } from "@/data/types";

describe("pointBuyCost — the budget-tally seam", () => {
  it("returns the table cost for every legal 8–15 score", () => {
    for (const [score, cost] of Object.entries(POINT_BUY_COST)) {
      expect(pointBuyCost(Number(score))).toBe(cost);
    }
    expect(pointBuyCost(8)).toBe(0);
    expect(pointBuyCost(15)).toBe(9);
  });

  it("treats any out-of-table score as unspendable (Infinity)", () => {
    // The raw map has no entry — the defect was `?? 0` turning this into a free
    // 0-cost buy.
    expect(POINT_BUY_COST[30]).toBeUndefined();
    expect(pointBuyCost(30)).toBe(Infinity);
    expect(pointBuyCost(16)).toBe(Infinity);
    expect(pointBuyCost(7)).toBe(Infinity);
    expect(pointBuyCost(1)).toBe(Infinity);
  });
});

describe("point-buy gate — the Manual→Point-Buy round-trip", () => {
  /** The gate's tally, computed exactly as the wizard/point-buy view do. */
  function pointsSpent(scores: Record<AbilityCode, number>): number {
    return ABILITY_CODES.reduce((sum, code) => sum + pointBuyCost(scores[code]), 0);
  }

  it("an illegal 30 (with 27 spent on the rest) never reads as an in-budget build", () => {
    // STR left at 30 by Manual entry; the other five spend EXACTLY 27
    // (15+15+15 = 27, 8+8 = 0). Pre-fix this tallied to 27 → remaining 0 → the
    // `usePointBuy && pointsRemaining !== 0` gate passed and Create saved 30.
    const exploit: Record<AbilityCode, number> = {
      STR: 30,
      DEX: 15,
      CON: 15,
      INT: 15,
      WIS: 8,
      CHA: 8,
    };
    const remaining = POINT_BUY_BUDGET - pointsSpent(exploit);
    expect(Number.isFinite(remaining)).toBe(false);
    // The gate keys on `pointsRemaining !== 0` — it stays blocked.
    expect(remaining).not.toBe(0);
  });

  it("a legal, fully-spent build still reconciles to exactly 0 remaining", () => {
    const legal: Record<AbilityCode, number> = {
      STR: 15,
      DEX: 15,
      CON: 15,
      INT: 8,
      WIS: 8,
      CHA: 8,
    };
    expect(POINT_BUY_BUDGET - pointsSpent(legal)).toBe(0);
  });
});
