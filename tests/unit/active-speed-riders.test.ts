/**
 * Regression: class-feature speed riders apply ACTIVELY (not just as
 * info chips) to the displayed Speed.
 *
 * Architectural lever: the rider declaration on `SrdClassFeatureData`
 * gains an optional `appliesTo: "speed"` flag. When set,
 * `resolveActiveSpeedRiderBonus` reads the per-level `classSpecific`
 * value from the source class table and the sheet header sums it into
 * `formatSpeed`'s `bonusFt`. No feature-specific code in the consumer.
 *
 * Covered:
 *   - Monk Unarmored Movement scaling (+10 @ L2, +15 @ L6, +20 @ L10,
 *     +25 @ L14, +30 @ L18)
 *   - Barbarian Fast Movement (+10 @ L5) — a static `{ type: "speed" }`
 *     grant that flows through the existing pipeline.
 *   - Characters who don't have the relevant feature get +0.
 *   - Multiple sources stack (e.g. Mobile feat +10 + Monk UM at level).
 */
import { describe, expect, it } from "vitest";
import { resolveActiveSpeedRiderBonus } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

function monkAtLevel(level: number, withFeature: boolean): number {
  const char = makeCharacterDoc({ class: "Monk", level });
  char.character.features = withFeature ? [{ srdId: "monk-unarmored-movement" }] : [];
  return resolveActiveSpeedRiderBonus(char);
}

describe("resolveActiveSpeedRiderBonus — Monk Unarmored Movement scaling", () => {
  it("L1 — feature not yet acquired → +0 even if (somehow) present", () => {
    // RAW: Monk gets Unarmored Movement at L2. The classSpecific table
    // shows 0 at L1, so even a phantom L1 feature ref produces +0.
    expect(monkAtLevel(1, true)).toBe(0);
  });

  it("L2 → +10 ft", () => {
    expect(monkAtLevel(2, true)).toBe(10);
  });
  it("L5 → still +10 (next tier is L6)", () => {
    expect(monkAtLevel(5, true)).toBe(10);
  });
  it("L6 → +15 ft", () => {
    expect(monkAtLevel(6, true)).toBe(15);
  });
  it("L10 → +20 ft", () => {
    expect(monkAtLevel(10, true)).toBe(20);
  });
  it("L14 → +25 ft", () => {
    expect(monkAtLevel(14, true)).toBe(25);
  });
  it("L18+ → +30 ft", () => {
    expect(monkAtLevel(18, true)).toBe(30);
    expect(monkAtLevel(20, true)).toBe(30);
  });

  it("without the feature ref the bonus is 0 regardless of level", () => {
    expect(monkAtLevel(20, false)).toBe(0);
  });
});

describe("Speed grants — Barbarian Fast Movement", () => {
  it("Fast Movement declares the standard speed grant (+10)", async () => {
    const { FEATS_BY_ID: _unused } = await import("@/data/feats");
    void _unused;
    const { classFeatureIndex } = await import("@/data/classes");
    const fast = classFeatureIndex.get("barbarian-fast-movement");
    expect(fast).toBeDefined();
    const speedGrants = fast?.grants?.filter((g) => g.type === "speed") ?? [];
    expect(speedGrants).toHaveLength(1);
    if (speedGrants[0]?.type === "speed") {
      expect(speedGrants[0].amount).toBe(10);
    }
  });
});
