/**
 * Rolled-HP clamp at creation (B9 regression, #1315). The entered number is the
 * CON-free hit-dice total; level 1 always counts the die maximum, so the legal range
 * is [die + (level − 1), die × level]. HpModeSelector's onBlur commits
 * `clampRolledDice`, the same function the build reads.
 */
import { describe, expect, it } from "vitest";
import { clampRolledDice, fixedDice, rolledDiceRange } from "@/lib/creation/draft";

describe("creation rolled-HP clamp (d8, level 3)", () => {
  it("the range is 10..24: level 1 is the die maximum (8), then 1..8 per level", () => {
    expect(rolledDiceRange(8, 3)).toEqual({ min: 10, max: 24 });
  });

  it("clamps an over-max value down to die × level", () => {
    expect(clampRolledDice(999, 8, 3)).toBe(24);
  });

  it("clamps an under-min value up: level 1 can never roll below the maximum", () => {
    expect(clampRolledDice(3, 8, 3)).toBe(10);
  });

  it("passes a value within range through unchanged", () => {
    expect(clampRolledDice(15, 8, 3)).toBe(15);
  });

  it("the fixed dice total is 8 + 5 + 5 = 18", () => {
    expect(fixedDice(8, 3)).toBe(18);
  });

  it("level 1 has a single legal value, the die maximum", () => {
    expect(rolledDiceRange(10, 1)).toEqual({ min: 10, max: 10 });
  });
});
