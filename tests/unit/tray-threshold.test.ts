/**
 * Power Word Kill / Stun (SRD 5.2.1): "If the target has 100 Hit Points or fewer, it
 * dies. Otherwise, it takes 12d12 Psychic damage"; "If the target has 150 Hit Points
 * or fewer, it has the Stunned condition. Otherwise, its Speed is 0 until the start
 * of your next turn". When the viewer can't see the target's HP, the DM's yes/no
 * answer picks the branch, and only that branch applies.
 */
import { describe, expect, it } from "vitest";

import { defaultCombatState, reduceKill } from "@/lib/combat-state";
import {
  initialTrayRow,
  rowAmount,
  rowConditions,
  setThresholdAnswer,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { killCharacter } from "@/lib/play/vitals";

import { makeCharacterDoc } from "./_helpers";

const kill: DamageTrayPlan = {
  effect: "damage",
  damageType: "psychic",
  hitPointThreshold: { max: 100, atOrBelow: "dies" },
  targets: ["ogre"],
};
const stun: DamageTrayPlan = {
  effect: null,
  hitPointThreshold: { max: 150, atOrBelow: "condition", otherwise: "speed-zero" },
  conditions: { options: ["stunned"], pickOne: false },
  targets: ["ogre"],
};

describe("the DM answers", () => {
  it("unknown HP: the row reads as printed until the DM answers", () => {
    const row = initialTrayRow(kill, "ogre");
    expect(row.outcome).toEqual({ kind: "threshold", branch: null });
    expect(rowAmount(80, row, kill)).toBe(80);
  });

  it("Kill, yes: the target dies, no damage", () => {
    const row = setThresholdAnswer(initialTrayRow(kill, "ogre"), kill, true);
    expect(row.outcome).toEqual({ kind: "threshold", branch: "dies" });
    expect(rowAmount(80, row, kill)).toBe(0);
  });

  it("Kill, no: the 12d12 damage lands", () => {
    const row = setThresholdAnswer(initialTrayRow(kill, "ogre"), kill, false);
    expect(row.outcome).toEqual({ kind: "threshold", branch: "otherwise" });
    expect(rowAmount(80, row, kill)).toBe(80);
  });

  it("Stun, yes: Stunned; no: Speed 0 and no condition", () => {
    const yes = setThresholdAnswer(initialTrayRow(stun, "ogre"), stun, true);
    expect(rowConditions(yes)).toEqual(["stunned"]);
    const no = setThresholdAnswer(initialTrayRow(stun, "ogre"), stun, false);
    expect(no.outcome).toEqual({ kind: "threshold", branch: "speed-zero" });
    expect(rowConditions(no)).toEqual([]);
  });

  it("a known HP needs no answer", () => {
    const row = initialTrayRow(kill, "ogre", undefined, undefined, {
      current: 40,
      max: 59,
    });
    expect(row.outcome).toEqual({ kind: "threshold", branch: "dies" });
  });
});

describe("dying outright", () => {
  it("me: 0 HP and dead, the death's clock started", () => {
    const doc = makeCharacterDoc({}, { hp: { current: 40, temp: 0 } });
    const dead = killCharacter(doc);
    expect(dead?.hp.current).toBe(0);
    expect(dead?.deathFail).toBe(3);
    expect(killCharacter({ ...doc, session: dead ?? doc.session })).toBeNull();
  });

  it("another PC through the play state", () => {
    const state = defaultCombatState(30);
    expect(reduceKill(state)).toMatchObject({
      hp: { current: 0 },
      deathSaves: { failures: 3 },
    });
  });
});
