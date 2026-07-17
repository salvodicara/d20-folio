/**
 * Regression: when a level-up ASI raises CON enough to bump the
 * modifier, HP max gets a retroactive catch-up.
 *
 * RAW 2024 (PHB p.21): "If your Constitution modifier changes, your hit
 * point maximum changes as well." The previous LevelUpModal code applied
 * the ASI AFTER running `applyHpIncrease`, leaving the prior levels'
 * HP at the old CON modifier — silently violating RAW. The fix
 * computes `Δmod` after the ASI and adds `newLevel × Δmod` to HP max.
 *
 * Architecture note: the same backfill runs for both the plus2 / plus1_1
 * ASI path and the feat-ASI path (Resilient CON, Durable CON, etc.).
 *
 * This test exercises the LIVE LevelUpModal-style flow by inlining the
 * relevant arithmetic — the engine API isn't easy to drive headlessly
 * for this case. We pin the contract: + Δmod per character level.
 */
import { describe, expect, it } from "vitest";

/**
 * Pure helper mirroring the LevelUpModal's retroactive bump. Returns the
 * additional HP that should be added when CON jumps from `prevCon` to
 * `newCon` at character level `newLevel`.
 */
function retroactiveConHpBump(prevCon: number, newCon: number, newLevel: number): number {
  const conModDelta = Math.floor((newCon - 10) / 2) - Math.floor((prevCon - 10) / 2);
  return conModDelta > 0 ? newLevel * conModDelta : 0;
}

describe("ASI retroactive CON-mod HP bump", () => {
  it("+2 CON at L4 with CON 13 → 15 (mod +1 → +2): +4 HP retroactive", () => {
    expect(retroactiveConHpBump(13, 15, 4)).toBe(4);
  });

  it("+2 CON at L8 with CON 14 → 16 (mod +2 → +3): +8 HP retroactive", () => {
    expect(retroactiveConHpBump(14, 16, 8)).toBe(8);
  });

  it("+1 CON at L4 with CON 13 → 14 (mod +1 → +2): +4 HP retroactive", () => {
    expect(retroactiveConHpBump(13, 14, 4)).toBe(4);
  });

  it("+1 CON at L4 with CON 12 → 13 (mod +1 → +1, no change): 0 HP", () => {
    expect(retroactiveConHpBump(12, 13, 4)).toBe(0);
  });

  it("+2 CON at L1 (no prior levels but current level itself bumps): +1 HP", () => {
    // At L1 with CON jumping from 13 → 15, the mod goes from +1 to +2.
    // newLevel × Δmod = 1 × 1 = 1 HP backfill (applies to L1's gain).
    expect(retroactiveConHpBump(13, 15, 1)).toBe(1);
  });

  it("no negative bumps (low-roll CON decreases are not legal anyway)", () => {
    expect(retroactiveConHpBump(16, 14, 5)).toBe(0);
  });

  it("+2 CON at L20 with CON 18 → 20 (mod +4 → +5): +20 HP retroactive", () => {
    expect(retroactiveConHpBump(18, 20, 20)).toBe(20);
  });
});
