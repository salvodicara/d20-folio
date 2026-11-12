/**
 * A spell whose die grows against a hurt target (a creature missing any of its Hit
 * Points): the spell row carries both formulas, scaled the same way, and the one
 * that applies follows the target's Hit Points.
 */
import { describe, expect, it } from "vitest";
import { damageForTarget, hurtDice } from "@/lib/play/hurt-target-damage";

describe("the bigger die against a hurt target", () => {
  it("keeps the die count and swaps the face", () => {
    expect(hurtDice("1d8", "d12")).toBe("1d12");
    expect(hurtDice("3d8", "d12")).toBe("3d12");
    expect(hurtDice("2d8+3", "d12")).toBe("2d12+3");
  });

  it("a target at full Hit Points takes the base die; one missing any takes the bigger", () => {
    const summary = { damage: "2d8", damageIfHurt: "2d12" };
    expect(damageForTarget(summary, { currentHp: 20, maxHp: 20 })).toBe("2d8");
    expect(damageForTarget(summary, { currentHp: 19, maxHp: 20 })).toBe("2d12");
  });

  it("a spell without the rule, or an unknown target, keeps its own die", () => {
    expect(damageForTarget({ damage: "1d10" }, { currentHp: 1, maxHp: 20 })).toBe("1d10");
    expect(damageForTarget({ damage: "2d8", damageIfHurt: "2d12" }, undefined)).toBe(
      "2d8"
    );
  });
});
