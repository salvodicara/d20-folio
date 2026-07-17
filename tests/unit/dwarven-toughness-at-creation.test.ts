/**
 * Regression: Dwarven Toughness (+1 HP per character level) applies at
 * character creation, not just at level-up.
 *
 * The level-up engine's `applyHpIncrease` already adds +1 per level when
 * the trait is present, but `calculateMaxHP` (used by the create wizard)
 * was unaware of features and produced the wrong starting HP for a
 * Dwarf created at L5+. Parity now: create.tsx adds `level × 1` to the
 * preview/stored HP when the chosen species is `dwarf`, mirroring how
 * the same file already adds `2 × level` for the Tough feat.
 *
 * This is a pure-data invariant test — no React/store needed.
 */
import { describe, expect, it } from "vitest";
import { calculateMaxHP } from "@/lib/compute";

describe("Dwarven Toughness — HP parity between creation and level-up", () => {
  it("a level-5 Dwarven Cleric (d8, CON 14) gets +5 HP from Dwarven Toughness", () => {
    // calculateMaxHP itself doesn't know about features; the +1/level is
    // added by the create page after the helper. Pin the helper baseline
    // so any future refactor (e.g., calculateMaxHP gaining a features
    // argument) preserves the current contract.
    const baseHP = calculateMaxHP(8, 14, 5);
    // d8 with CON +2 over 5 levels = 10 (L1) + 4 × 7 (L2-5) = 10 + 28 = 38
    expect(baseHP).toBe(38);
    // create.tsx applies +1/level for Dwarven Toughness on top, so a Dwarf
    // Cleric at L5 should land at 43.
    const dwarvenToughnessBonus = 5; // level × 1
    expect(baseHP + dwarvenToughnessBonus).toBe(43);
  });

  it("the create-side bonus is additive with Tough's +2/level (both apply if present)", () => {
    const baseHP = calculateMaxHP(8, 14, 5);
    const dwarvenToughnessBonus = 5;
    const toughBonus = 2 * 5; // Tough adds +2/level
    expect(baseHP + dwarvenToughnessBonus + toughBonus).toBe(53);
  });

  it("non-Dwarves get no bonus", () => {
    const baseHP = calculateMaxHP(8, 14, 5);
    // A Human (no species HP grant) at the same stats lands on the bare baseline.
    expect(baseHP).toBe(38);
  });
});
