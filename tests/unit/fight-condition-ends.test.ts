/**
 * Conditions given in a fight end early when the fight says so (edge-case M3):
 * Abjure Foes' Frightened ends when its target takes damage.
 */
import { describe, expect, it } from "vitest";
import {
  sourcedFightConditions,
  conditionEndsOf,
  fightConditionEnds,
  fightConditionEvents,
  type FightLook,
} from "@/lib/play/fight-condition-ends";
import type { CombatEffectOp } from "@/types/combat-effect";

const frightened: CombatEffectOp = {
  id: "op-1",
  kind: "apply",
  effect: {
    id: "fear-1",
    actor: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c1" },
    target: { kind: "monster", combatantId: "monster-1" },
    source: { kind: "feature", id: "paladin-abjure-foes", actionId: "abjure" },
    payload: { kind: "condition", conditionId: "frightened" },
    duration: { kind: "encounter" },
  },
};

function look(
  hp: number,
  temp = 0,
  turn: string | null = "pc-me",
  conditions: string[] = []
): FightLook {
  return {
    rows: [{ id: "monster-1", currentHp: hp, tempHp: temp, conditions }],
    currentCombatantId: turn,
  };
}

describe("fight condition ends", () => {
  it("reads how a source's condition ends from the catalogue", () => {
    expect(
      conditionEndsOf({ kind: "feature", id: "paladin-abjure-foes" }, "frightened")
    ).toEqual([{ on: "target-damaged" }]);
    expect(
      conditionEndsOf({ kind: "feature", id: "paladin-abjure-foes" }, "prone")
    ).toEqual([]);
  });

  it("the target taking damage ends Abjure Foes' Frightened; temp HP count", () => {
    expect(fightConditionEnds([frightened], look(20), look(14)).ended).toEqual([
      "fear-1",
    ]);
    expect(fightConditionEnds([frightened], look(20, 5), look(20, 2)).ended).toEqual([
      "fear-1",
    ]);
    expect(fightConditionEnds([frightened], look(20), look(20)).ended).toEqual([]);
    // A heal is not damage, and the first look only primes.
    expect(fightConditionEnds([frightened], look(10), look(15)).ended).toEqual([]);
    expect(fightConditionEnds([frightened], null, look(5)).ended).toEqual([]);
  });

  it("events: damage, falling Incapacitated, a turn ending", () => {
    expect(
      fightConditionEvents(look(20, 0, "monster-1"), look(20, 0, "pc-me", ["stunned"]))
    ).toEqual([
      { kind: "incapacitated", combatantId: "monster-1" },
      { kind: "turn-end", combatantId: "monster-1" },
    ]);
  });

  it("carries the save DC the effect was written with", () => {
    const withDc = {
      ...frightened,
      effect: { ...frightened.effect, bindings: { saveDc: 15 } },
    } as CombatEffectOp;
    expect(sourcedFightConditions([withDc])[0]?.saveDc).toBe(15);
    expect(sourcedFightConditions([frightened])[0]).not.toHaveProperty("saveDc");
  });
});
