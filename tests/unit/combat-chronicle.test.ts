import { describe, expect, it } from "vitest";

import {
  inferOutcome,
  recordCondition,
  recordMonsterDamage,
  recordMonsterHp,
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
