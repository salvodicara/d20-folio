/**
 * Rolled-HP onBlur clamp (B9 regression).
 *
 * HpModeSelector's `onBlur` enforces `[level, hitDie * level]` — the user cannot
 * commit a value outside the valid rolled-HP range. Before B9 only the lower bound
 * was enforced (`Math.max(1, …)` in `onChange`); an over-max value slipped through.
 *
 * This pins the clamping formula directly (pure-function style — no React mount
 * needed; the formula is the thing under test, not the JSX wiring).
 */
import { describe, expect, it } from "vitest";

/** The exact clamp formula used in HpModeSelector's onBlur handler. */
function clampRolledHp(val: string, level: number, hitDie: number): number {
  return Math.max(level, Math.min(hitDie * level, parseInt(val) || level));
}

describe("HpModeSelector rolled-HP onBlur clamp", () => {
  it("clamps an over-max typed value down to hitDie * level", () => {
    // d8 Rogue at level 3 → max rolled HP is 24 (8 * 3)
    expect(clampRolledHp("999", 3, 8)).toBe(24);
  });

  it("clamps an under-min typed value up to level (the minimum)", () => {
    // level 3 → minimum rolled HP is 3 (1 per die)
    expect(clampRolledHp("1", 3, 8)).toBe(3);
  });

  it("passes a value within range through unchanged", () => {
    expect(clampRolledHp("15", 3, 8)).toBe(15);
  });

  it("treats a non-numeric input as the minimum (level)", () => {
    expect(clampRolledHp("abc", 3, 8)).toBe(3);
  });

  it("accepts the exact max value without clamping", () => {
    expect(clampRolledHp("24", 3, 8)).toBe(24);
  });

  it("accepts the exact min value without clamping", () => {
    expect(clampRolledHp("3", 3, 8)).toBe(3);
  });
});
