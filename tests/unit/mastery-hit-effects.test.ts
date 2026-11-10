/**
 * Weapon masteries that leave a state on the creature hit (SRD 5.2.1): Vex
 * (Advantage on your next attack against it, before the end of your next turn),
 * Sap (Disadvantage on its next attack roll, before the start of your next turn),
 * Slow (its Speed −10 ft until the start of your next turn; never more than 10).
 * The DM reads the monster's side through `monsterTurnModifiers`.
 */
import { describe, expect, it } from "vitest";
import { masteryHitEffects } from "@/lib/play/mastery-hit-effects";
import { monsterTurnModifiers } from "@/lib/play/monster-turn-modifiers";
import type { CombatEffectOp, CombatantRef } from "@/types/combat-effect";

const fighter: CombatantRef = {
  kind: "pc",
  combatantId: "pc-ana",
  memberUid: "ana",
  characterId: "c1",
};
const orc: CombatantRef = { kind: "monster", combatantId: "orc-1" };

let n = 0;
const hit = (masteries: string[], actor: CombatantRef = fighter) =>
  masteryHitEffects({
    masteries,
    actionId: "longsword",
    actor,
    target: orc,
    round: 2,
    effectId: () => `e${++n}`,
  });
const ops = (effects: ReturnType<typeof hit>): CombatEffectOp[] =>
  effects.map((effect) => ({ id: `op-${effect.id}`, kind: "apply", effect }));

describe("masteryHitEffects", () => {
  it("writes one state per mastery that leaves one, ending at the attacker's turn edge", () => {
    const effects = hit(["sap", "slow", "vex", "topple"]);
    expect(effects.map((e) => [e.source.id, e.payload])).toEqual([
      ["mastery-vex", { kind: "grant-group", activeKey: "vexed" }],
      ["mastery-sap", { kind: "grant-group", activeKey: "sapped" }],
      ["mastery-slow", { kind: "grant-group", activeKey: "slowed" }],
    ]);
    expect(effects.find((e) => e.source.id === "mastery-sap")?.duration).toEqual({
      kind: "turn-boundary",
      combatantId: "pc-ana",
      round: 3,
      phase: "turn-start",
    });
    expect(effects.find((e) => e.source.id === "mastery-vex")?.duration).toMatchObject({
      phase: "turn-end",
    });
  });

  it("a weapon without these masteries writes nothing", () => {
    expect(hit(["topple", "graze"])).toEqual([]);
  });
});

describe("monsterTurnModifiers", () => {
  it("Sap: the monster's next attack roll has Disadvantage", () => {
    expect(monsterTurnModifiers(ops(hit(["sap"])), "orc-1").attack).toBe("disadvantage");
  });

  it("Slow: its Speed drops by 10 ft, and two Slow hits still only 10", () => {
    const two = [
      ...ops(hit(["slow"])),
      ...ops(hit(["slow"], { ...fighter, combatantId: "pc-bo", memberUid: "bo" })),
    ];
    expect(monsterTurnModifiers(ops(hit(["slow"])), "orc-1").speedDeltaFt).toBe(-10);
    expect(monsterTurnModifiers(two, "orc-1").speedDeltaFt).toBe(-10);
  });

  it("nothing on the monster: a straight roll and its own Speed", () => {
    expect(monsterTurnModifiers([], "orc-1")).toEqual({ attack: null, speedDeltaFt: 0 });
  });

  it("Vex is about attacks against it, not its own", () => {
    expect(monsterTurnModifiers(ops(hit(["vex"])), "orc-1").attack).toBeNull();
  });
});
