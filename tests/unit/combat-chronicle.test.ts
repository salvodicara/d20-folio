import { describe, expect, it } from "vitest";

import {
  inferOutcome,
  recordCondition,
  recordMonsterAc,
  recordMonsterDamage,
  recordMonsterHp,
  recordMonsterSpeed,
  recordPcHp,
  undoConditionEvent,
  undoHpEvent,
} from "@/features/campaigns/combat-chronicle";
import {
  addMonster,
  setMonsterCondition,
  setMonsterTempHp,
} from "@/features/campaigns/encounter";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

function fight(): EncounterState {
  return addMonster(
    {
      combatants: [],
      nextMonsterOrdinal: 1,
      round: 2,
      currentCombatantId: null,
      epoch: 1,
      status: "active",
    },
    { name: "Goblin", ac: 15, maxHp: 7, count: 1, initiative: 12 }
  );
}

function monster(state: EncounterState): EncounterMonster {
  const result = state.combatants.find(
    (combatant): combatant is EncounterMonster => combatant.kind === "monster"
  );
  if (!result) throw new Error("Missing monster");
  return result;
}

describe("scalar monster combat chronicle", () => {
  it("applies damage through temporary HP and records one reversible factual beat", () => {
    const withTemp = setMonsterTempHp(fight(), "monster-1", 5);
    const damaged = recordMonsterDamage(withTemp, "monster-1", 8, "pc-one", {
      custom: "Strike",
    });

    expect(monster(damaged).hp).toEqual({ current: 4, temp: 0, max: 7 });
    expect(damaged.events).toEqual([
      expect.objectContaining({
        id: "0",
        round: 2,
        kind: "hp-damage",
        targetId: "monster-1",
        amount: 8,
        current: 4,
        max: 7,
        tempAbsorbed: 5,
        attackerId: "pc-one",
      }),
    ]);

    const restored = undoHpEvent(damaged, "0");
    expect(monster(restored).hp).toEqual({ current: 7, temp: 5, max: 7 });
    expect(restored.events).toEqual([]);
  });

  it("never reuses an event id after an earlier line was undone", () => {
    let state = fight();
    for (const amount of [1, 1, 1])
      state = recordMonsterDamage(state, "monster-1", amount);
    state = undoHpEvent(state, "1");
    state = recordMonsterDamage(state, "monster-1", 2);

    const ids = state.events?.map(({ id }) => id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);

    // Undoing the newest line must restore exactly its own 2 HP, not the older 1 HP.
    const latest = state.events?.at(-1);
    if (!latest) throw new Error("Missing latest event");
    const undone = undoHpEvent(state, latest.id);
    expect(monster(undone).hp.current).toBe(monster(state).hp.current + 2);
    expect(undone.events?.map((e) => ("amount" in e ? e.amount : null))).toEqual([1, 1]);
  });

  it("records healing against the same scalar HP home without duplicating no-ops", () => {
    const damaged = recordMonsterDamage(fight(), "monster-1", 4);
    const healed = recordMonsterHp(damaged, "monster-1", 6);
    expect(monster(healed).hp.current).toBe(6);
    expect(healed.events?.at(-1)).toMatchObject({
      kind: "hp-heal",
      amount: 3,
      current: 6,
      max: 7,
    });
    expect(recordMonsterHp(healed, "monster-1", 6)).toBe(healed);
  });

  it("records a PC heal as the HP actually regained, not the amount asked for", () => {
    const state = recordPcHp(fight(), {
      targetId: "pc-1",
      kind: "heal",
      amount: 40,
      preCurrent: 0,
      postCurrent: 24,
      max: 24,
    });
    expect(state.events?.at(-1)).toMatchObject({
      kind: "hp-heal",
      targetId: "pc-1",
      amount: 24,
      current: 24,
      max: 24,
    });
  });

  it("records nothing for a PC heal that lands no HP (already at max)", () => {
    const state = fight();
    const healed = recordPcHp(state, {
      targetId: "pc-1",
      kind: "heal",
      amount: 5,
      preCurrent: 24,
      postCurrent: 24,
      max: 24,
    });
    expect(healed).toBe(state);
  });

  it("records a down crossing once and removes it when damage is undone", () => {
    const down = recordMonsterDamage(fight(), "monster-1", 20);
    expect(down.events?.map(({ kind }) => kind)).toEqual(["hp-damage", "down"]);
    const restored = undoHpEvent(down, "0");
    expect(monster(restored).hp.current).toBe(7);
    expect(restored.events).toEqual([]);
  });

  it("reverses a monster condition event on the same combatant", () => {
    const poisoned = setMonsterCondition(fight(), "monster-1", "poisoned", true);
    const recorded = recordCondition(poisoned, "monster-1", "poisoned", true);
    const restored = undoConditionEvent(recorded, "0");
    expect(monster(restored).conditions).toEqual([]);
    expect(restored.events).toEqual([]);
  });

  it("infers victory only when every enemy creature is defeated", () => {
    const two = addMonster(fight(), {
      name: "Wolf",
      ac: 13,
      maxHp: 11,
      count: 1,
      initiative: 10,
    });
    const firstDown = recordMonsterDamage(two, "monster-1", 99);
    expect(inferOutcome(firstDown)).toBe("ended");
    expect(inferOutcome(recordMonsterDamage(firstDown, "monster-2", 99))).toBe("victory");
  });
});

describe("the DM's monster AC change is a chronicle beat", () => {
  it("sets the AC and records Goblin 15 → 13 (Slow), once", () => {
    const slowed = recordMonsterAc(fight(), "monster-1", 13);
    expect(monster(slowed).ac).toBe(13);
    expect(slowed.events).toEqual([
      {
        id: "0",
        round: 2,
        kind: "stat-change",
        targetId: "monster-1",
        stat: "ac",
        from: 15,
        to: 13,
      },
    ]);
  });

  it("an unchanged or rejected AC records nothing", () => {
    const state = fight();
    expect(recordMonsterAc(state, "monster-1", 15)).toBe(state);
    expect(recordMonsterAc(state, "monster-1", Number.NaN)).toBe(state);
    expect(recordMonsterAc(state, "monster-9", 12)).toBe(state);
  });
});

describe("the DM's monster speed change is a chronicle beat", () => {
  it("sets the override and records 30 ft → 20 ft (Slow) from the speed the card showed", () => {
    const slowed = recordMonsterSpeed(fight(), "monster-1", 20, 30);
    expect(monster(slowed).speed).toBe(20);
    expect(slowed.events).toEqual([
      {
        id: "0",
        round: 2,
        kind: "stat-change",
        targetId: "monster-1",
        stat: "speed",
        from: 30,
        to: 20,
      },
    ]);
  });

  it("a monster with no known speed records only the new one", () => {
    const set = recordMonsterSpeed(fight(), "monster-1", 25, null);
    expect(set.events).toEqual([
      {
        id: "0",
        round: 2,
        kind: "stat-change",
        targetId: "monster-1",
        stat: "speed",
        to: 25,
      },
    ]);
  });

  it("an unchanged or rejected speed records nothing", () => {
    const slowed = recordMonsterSpeed(fight(), "monster-1", 20, 30);
    expect(recordMonsterSpeed(slowed, "monster-1", 20, 20)).toBe(slowed);
    expect(recordMonsterSpeed(slowed, "monster-1", Number.NaN, 20)).toBe(slowed);
    expect(recordMonsterSpeed(slowed, "monster-9", 10, 30)).toBe(slowed);
  });
});
