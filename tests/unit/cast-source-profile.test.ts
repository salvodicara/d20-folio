import { describe, expect, it } from "vitest";
import {
  applyCastSourceOverrides,
  applyCastSourceOverridesToAction,
  resolveCastSourceOverridesForLevel,
} from "@/lib/cast-source-profile";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { srdText } from "@/lib/loc-text";

function spellAction(summary: ResolvedAction["summary"]): ResolvedAction {
  return {
    id: "spell-web",
    name: "web",
    nameLoc: srdText("spell", "web", "name"),
    type: "action",
    source: "spell",
    spellLevel: 2,
    spellId: "web",
    concentration: true,
    summary,
    costsSlot: true,
    pinned: false,
    defaultPinned: false,
  };
}

describe("cast-source profile", () => {
  it.each([
    ["save DC", { saveDC: 13 }, { saveDC: 13, attackBonus: 8 }],
    ["attack bonus", { attackBonus: 5 }, { saveDC: 16, attackBonus: 5 }],
    [
      "concentration and duration",
      { concentration: false, maxRounds: 10 },
      { saveDC: 16, attackBonus: 8, concentration: false, maxRounds: 10 },
    ],
  ] as const)(
    "overrides %s while preserving the other base facts",
    (_label, overrides, expected) => {
      expect(
        applyCastSourceOverrides(
          { saveDC: 16, attackBonus: 8, concentration: true },
          overrides
        )
      ).toMatchObject(expected);
    }
  );

  it("applies relevant action facts without replacing unrelated spell data", () => {
    const action = spellAction({
      saveDC: 16,
      attackBonus: 8,
      saveAbility: "DEX",
      damage: "2d6",
      range: "60",
    });
    const resolved = applyCastSourceOverridesToAction(
      action,
      { saveDC: 13, attackBonus: 5, concentration: false, maxRounds: 10 },
      "source:web"
    );

    expect(resolved).toMatchObject({
      concentration: false,
      activatesKey: "source:web",
      activeDurationRounds: 10,
      summary: {
        saveDC: 13,
        attackBonus: 5,
        saveAbility: "DEX",
        damage: "2d6",
        range: "60",
      },
    });
  });

  it("does not invent save or attack facts for a spell that has neither", () => {
    const action = spellAction({ range: "Self" });
    const resolved = applyCastSourceOverridesToAction(action, {
      saveDC: 17,
      attackBonus: 5,
    });

    expect(resolved.summary).toEqual({ range: "Self" });
    expect(applyCastSourceOverridesToAction(action)).toBe(action);
  });

  it("removes only an ineligible level-gated active effect", () => {
    const overrides = {
      concentration: false,
      activeEffect: {
        activeKey: "lineage-teleport-resistance",
        minLevel: 5,
        duration: { kind: "turn-boundary", phase: "turn-start", turns: 1 },
      },
    } as const;

    expect(resolveCastSourceOverridesForLevel(overrides, 3)).toEqual({
      concentration: false,
    });
    expect(resolveCastSourceOverridesForLevel(overrides, 5)).toBe(overrides);
  });

  it("applies target types and a source-scoped turn-boundary state", () => {
    const action = spellAction({
      range: "Touch",
      targeting: { affinity: "ally", excludeSelf: true, maxTargets: 1 },
    });
    const resolved = applyCastSourceOverridesToAction(action, {
      targetCreatureTypes: ["beast"],
      activeEffect: {
        activeKey: "lineage-teleport-resistance",
        duration: { kind: "turn-boundary", phase: "turn-start", turns: 1 },
      },
    });

    expect(resolved).toMatchObject({
      activatesKey: "lineage-teleport-resistance",
      activeTurnBoundary: { phase: "turn-start", turns: 1 },
      summary: {
        targeting: {
          affinity: "ally",
          excludeSelf: true,
          maxTargets: 1,
          creatureTypes: ["beast"],
        },
      },
    });
  });
});
