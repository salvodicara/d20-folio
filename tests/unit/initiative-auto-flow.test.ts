/**
 * Regression: Initiative now auto-includes Alert / DEX-on-ASI / PB tier-ups.
 *
 * Before this pass the persisted `charData.initiativeBonus` field was set
 * once at creation (= bare DEX modifier) and never refreshed. Taking the
 * Alert feat ("Initiative Proficiency. When you roll Initiative, you can
 * add your Proficiency Bonus to the roll.") silently failed to bump the
 * Combat page's initiative bonus chip. Same for an ASI raising DEX or a
 * level-up moving PB from +2 to +3.
 *
 * The fix introduces a dedicated `initiativeBonusOverride: number | null`
 * field. Consumers (combat.tsx, abilities.tsx) now read the live
 * `computeInitiative(DEX, effectivePB, hasAlert, exhaustion)` and only
 * defer to the override when it's a number. This test pins the live
 * computation through every combination of those four inputs.
 */
import { describe, expect, it } from "vitest";
import {
  computeInitiative,
  effectiveProficiencyBonus,
  characterHasFeat,
} from "@/lib/compute";

describe("Initiative auto-flow — live computation", () => {
  it("bare DEX modifier when no Alert / no exhaustion", () => {
    expect(computeInitiative(16, 2, false, 0)).toBe(3);
    expect(computeInitiative(14, 2, false, 0)).toBe(2);
  });

  it("adds PB when the character has the Alert feat (Initiative Proficiency)", () => {
    // DEX 16 (+3), PB +3 (level 5), Alert
    expect(computeInitiative(16, 3, true, 0)).toBe(3 + 3);
    expect(computeInitiative(16, 5, true, 0)).toBe(3 + 5); // Even at custom PB override 5
  });

  it("applies exhaustion penalty (−2 per level) as a D20 Test", () => {
    expect(computeInitiative(16, 2, false, 2)).toBe(3 + 0 - 4);
    expect(computeInitiative(16, 2, true, 3)).toBe(3 + 2 - 6);
  });

  it("effectiveProficiencyBonus(level, override) feeds the right PB into Alert", () => {
    // PB override 6 → with Alert, init = DEX + 6
    expect(computeInitiative(14, effectiveProficiencyBonus(5, 6), true, 0)).toBe(2 + 6);
    // No override → falls through to level table
    expect(computeInitiative(14, effectiveProficiencyBonus(5, null), true, 0)).toBe(
      2 + 3
    );
  });

  it("characterHasFeat detects Alert via humanOriginFeat / bgFeat / features array", () => {
    expect(
      characterHasFeat("alert", { humanOriginFeat: "alert", bgFeat: "", features: [] })
    ).toBe(true);
    expect(
      characterHasFeat("alert", { humanOriginFeat: "", bgFeat: "alert", features: [] })
    ).toBe(true);
    expect(
      characterHasFeat("alert", {
        humanOriginFeat: "",
        bgFeat: "",
        features: [{ srdId: "alert" }],
      })
    ).toBe(true);
    expect(
      characterHasFeat("alert", { humanOriginFeat: "", bgFeat: "", features: [] })
    ).toBe(false);
  });
});
