/** 2024 Exhaustion reduces every Speed: a fixed fly speed loses 5 ft per level, and its
 *  "where does this number come from?" parts say so and still sum to it. */
import { describe, expect, it } from "vitest";
import { evaluateGrants } from "@/lib/grants";
import { breakdownTotal } from "@/lib/value-breakdown";
import {
  deriveSensesAndSpeeds,
  nonWalkingSpeedBreakdown,
  resolveNonWalkingSpeed,
} from "@/lib/views/sheet-view";

const flyer = evaluateGrants([
  { id: "wings", grants: [{ type: "fly-speed", amount: 40 }] },
]);

describe("exhaustion on non-walking speeds", () => {
  it("a fixed speed loses 5 ft per level, never below 0", () => {
    expect(resolveNonWalkingSpeed(40, 30, 2)).toBe(30);
    expect(resolveNonWalkingSpeed(10, 30, 6)).toBe(0);
    // A speed equal to the walking one follows the (already reduced) walk instead.
    expect(resolveNonWalkingSpeed("equal-to-walking", 20, 2)).toBe(20);
  });

  it("the shown fly speed and its parts agree", () => {
    const shown = deriveSensesAndSpeeds(flyer, 30, 2).speeds.find(
      (s) => s.kind === "fly"
    );
    expect(shown?.rangeFt).toBe(30);
    const parts = nonWalkingSpeedBreakdown(flyer, "fly", 30, 2);
    expect(breakdownTotal(parts)).toBe(30);
    expect(parts).toContainEqual({ label: { term: "character.exhaustion" }, value: -10 });
  });
});
