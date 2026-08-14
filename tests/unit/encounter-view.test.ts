import { describe, expect, it } from "vitest";

import {
  addReinforcement,
  buildBudgetView,
  buildEncounterView,
  type PcLive,
} from "@/features/campaigns/encounter-view";
import { addMonster, startEncounter } from "@/features/campaigns/encounter";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const pcLive: PcLive = {
  name: "Mara",
  ac: 16,
  maxHp: 24,
  currentHp: 18,
  tempHp: 3,
  conditions: [],
  initiative: 14,
  initiativeBonus: 2,
  initiativeRoll: 12,
  raceId: undefined,
  classes: [{ classId: "fighter", level: 3 }],
  portraitUrl: null,
  portraitCrop: null,
};

function encounter(): EncounterState {
  return addMonster(startEncounter({ u1: { characterId: "c1" } }, ["u1"], 1), {
    name: "Goblin",
    ac: 15,
    maxHp: 7,
    count: 2,
    initiative: 12,
    xp: 50,
  });
}

function withMonster(
  state: EncounterState,
  id: string,
  update: (monster: EncounterMonster) => EncounterMonster
): EncounterState {
  return {
    ...state,
    combatants: state.combatants.map((combatant) =>
      combatant.kind === "monster" && combatant.id === id ? update(combatant) : combatant
    ),
  };
}

describe("encounter scalar view", () => {
  it("projects each monster's scalar HP and keeps every batch member targetable", () => {
    const state = withMonster(encounter(), "monster-2", (monster) => ({
      ...monster,
      hp: { current: 3, temp: 2, max: 7 },
    }));
    const view = buildEncounterView(state, { "pc-u1": pcLive }, true);
    expect(view.rows.map(({ id }) => id)).toEqual(["pc-u1", "monster-1", "monster-2"]);
    expect(view.rows.find(({ id }) => id === "monster-2")).toMatchObject({
      name: "Goblin 2",
      currentHp: 3,
      tempHp: 2,
      maxHp: 7,
      down: false,
    });
  });

  it("projects conditions and defeated state per combatant", () => {
    const state = withMonster(encounter(), "monster-1", (monster) => ({
      ...monster,
      conditions: ["poisoned"],
      hp: { ...monster.hp, current: 0 },
    }));
    expect(
      buildEncounterView(state, { "pc-u1": pcLive }, true).rows.find(
        ({ id }) => id === "monster-1"
      )
    ).toMatchObject({ conditions: ["poisoned"], down: true });
  });

  it("filters hidden creatures only at the display edge, not from turn identity", () => {
    const state = withMonster(encounter(), "monster-1", (monster) => ({
      ...monster,
      hidden: true,
    }));
    const view = buildEncounterView(state, { "pc-u1": pcLive }, false);
    expect(view.rows.map(({ id }) => id)).not.toContain("monster-1");
    expect(view.turnOrderIds).toContain("monster-1");
  });

  it("costs each individual enemy exactly once", () => {
    expect(buildBudgetView(encounter(), { "pc-u1": pcLive })).toMatchObject({
      partySize: 1,
      pendingPcs: 0,
      costedXp: 100,
      uncostedGroups: 0,
    });
  });

  it("slots every reinforcement combatant independently into a frozen order", () => {
    const state = { ...encounter(), order: ["pc-u1", "monster-1", "monster-2"] };
    const next = addReinforcement(
      state,
      {
        name: "Wolf",
        ac: 13,
        maxHp: 11,
        count: 2,
        initiative: 20,
      },
      { "pc-u1": pcLive }
    );
    expect(next.order?.slice(0, 2)).toEqual(["monster-3", "monster-4"]);
    expect(new Set(next.combatants.map(({ id }) => id)).size).toBe(
      next.combatants.length
    );
  });
});
