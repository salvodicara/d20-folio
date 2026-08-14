import { describe, expect, it } from "vitest";

import {
  addMonster,
  advanceTurn,
  applyHp,
  beginEncounterTurns,
  isDown,
  monsterInstanceName,
  parseEncounterState,
  removeCombatant,
  setHp,
  setMonsterCondition,
  setMonsterTempHp,
  startEncounter,
  toggleCondition,
  type MonsterInput,
} from "@/features/campaigns/encounter";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const goblins: MonsterInput = {
  name: "Goblin",
  ac: 15,
  maxHp: 7,
  count: 3,
  initiative: 12,
  xp: 50,
};

function empty(): EncounterState {
  return {
    combatants: [],
    nextMonsterOrdinal: 1,
    round: 1,
    currentCombatantId: null,
    epoch: 42,
    status: "active",
  };
}

function monster(state: EncounterState, id: string): EncounterMonster {
  const result = state.combatants.find(
    (combatant): combatant is EncounterMonster =>
      combatant.kind === "monster" && combatant.id === id
  );
  if (!result) throw new Error(`Missing ${id}`);
  return result;
}

describe("encounter scalar monster model", () => {
  it("starts with pure PC references", () => {
    expect(
      startEncounter(
        { u1: { characterId: "c1" }, u2: { characterId: "c2" } },
        ["u2", "missing", "u1"],
        99
      )
    ).toMatchObject({
      combatants: [
        { kind: "pc", id: "pc-u2", memberUid: "u2", characterId: "c2" },
        { kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "c1" },
      ],
      round: 1,
      currentCombatantId: null,
      epoch: 99,
    });
  });

  it("creates one scalar combatant per batch member with deterministic unique ids", () => {
    const first = addMonster(empty(), goblins);
    expect(first.combatants.map(({ id }) => id)).toEqual([
      "monster-1",
      "monster-2",
      "monster-3",
    ]);
    for (const [index, combatant] of first.combatants.entries()) {
      expect(combatant).toMatchObject({
        kind: "monster",
        hp: { current: 7, temp: 0, max: 7 },
        groupId: "monster-1",
        groupIndex: index + 1,
        groupSize: 3,
      });
      expect(combatant).not.toHaveProperty("tokens");
      expect(combatant).not.toHaveProperty("maxHp");
      expect(combatant).not.toHaveProperty("tempHp");
    }

    const second = addMonster(first, { ...goblins, name: "Ogre", count: 1 });
    expect(second.combatants.at(-1)).toMatchObject({
      id: "monster-4",
      name: "Ogre",
      hp: { current: 7, temp: 0, max: 7 },
    });
    expect(monsterInstanceName(monster(first, "monster-2"))).toBe("Goblin 2");
    expect(second.nextMonsterOrdinal).toBe(5);
  });

  it("accepts only the current scalar wire model and monotonic allocator", () => {
    const state = addMonster(empty(), { ...goblins, count: 1 });
    expect(parseEncounterState(state)).toBe(state);
    expect(() => parseEncounterState({ ...state, nextMonsterOrdinal: 1 })).toThrow(
      TypeError
    );
    expect(() =>
      parseEncounterState({
        ...state,
        combatants: [
          {
            ...monster(state, "monster-1"),
            hp: { current: 7, temp: 0, max: 7, unexpected: 1 },
          },
        ],
      })
    ).toThrow(TypeError);
  });

  it("owns current, temporary and maximum HP in one scalar record", () => {
    const seeded = addMonster(empty(), { ...goblins, count: 1 });
    const damaged = applyHp(seeded, "monster-1", -3);
    expect(monster(damaged, "monster-1").hp).toEqual({
      current: 4,
      temp: 0,
      max: 7,
    });

    const withTemp = setMonsterTempHp(damaged, "monster-1", 5);
    expect(monster(withTemp, "monster-1").hp).toEqual({
      current: 4,
      temp: 5,
      max: 7,
    });
    expect(monster(setHp(withTemp, "monster-1", 100), "monster-1").hp.current).toBe(7);
    expect(monster(setHp(withTemp, "monster-1", -10), "monster-1").hp.current).toBe(0);
  });

  it("sets and toggles conditions idempotently per combatant", () => {
    const seeded = addMonster(empty(), { ...goblins, count: 1 });
    const poisoned = setMonsterCondition(seeded, "monster-1", "poisoned", true);
    expect(monster(poisoned, "monster-1").conditions).toEqual(["poisoned"]);
    expect(setMonsterCondition(poisoned, "monster-1", "poisoned", true)).toBe(poisoned);
    expect(
      monster(toggleCondition(poisoned, "monster-1", "poisoned"), "monster-1").conditions
    ).toEqual([]);
  });

  it("skips defeated monsters and preserves deterministic frozen-order identity", () => {
    let state = addMonster(empty(), { ...goblins, count: 2 });
    state = beginEncounterTurns(state, ["monster-1", "monster-2"]);
    state = setHp(state, "monster-2", 0);
    expect(isDown(monster(state, "monster-2"))).toBe(true);
    expect(advanceTurn(state)).toMatchObject({
      currentCombatantId: "monster-1",
      round: 2,
    });
  });

  it("removes one creature without disturbing its batch siblings", () => {
    const state = beginEncounterTurns(addMonster(empty(), { ...goblins, count: 3 }), [
      "monster-1",
      "monster-2",
      "monster-3",
    ]);
    const next = removeCombatant(state, "monster-2");
    expect(next.combatants.map(({ id }) => id)).toEqual(["monster-1", "monster-3"]);
    expect(next.order).toEqual(["monster-1", "monster-3"]);
    expect(
      addMonster(removeCombatant(next, "monster-3"), {
        ...goblins,
        count: 1,
      }).combatants.at(-1)?.id
    ).toBe("monster-4");
  });
});
