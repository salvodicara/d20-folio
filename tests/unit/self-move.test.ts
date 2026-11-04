/**
 * The turn's movement, one rule for both play surfaces: Speed, once more per Dash
 * (SRD "Dash": extra movement equal to your Speed), plus a use's "move up to half
 * your Speed" (Tactical Shift, Instinctive Pounce), in whole 5-foot squares.
 */
import { describe, expect, it } from "vitest";

import { selfMoveFeet, turnMovementBudgetFt } from "@/lib/play/self-move";

describe("the turn's movement", () => {
  it("half your Speed, in whole squares", () => {
    expect(selfMoveFeet(0.5, 30)).toBe(15);
    expect(selfMoveFeet(0.5, 25)).toBe(10);
    expect(selfMoveFeet(0.5, 0)).toBe(0);
  });

  it("Speed, once more per Dash, plus what a use added", () => {
    expect(turnMovementBudgetFt(30, { dashesThisTurn: 0 })).toBe(30);
    expect(turnMovementBudgetFt(30, { dashesThisTurn: 1 })).toBe(60);
    expect(turnMovementBudgetFt(30, { dashesThisTurn: 1, extraMovementFt: 15 })).toBe(75);
  });
});
