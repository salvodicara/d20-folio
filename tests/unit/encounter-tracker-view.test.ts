/**
 * The campaign Scontro tracker's view model (design session, 2026-10-18; a Foundry-
 * style list): each row's name, portrait, initiative, whether it acts now, whether it
 * is defeated, and its HP as the viewer may see it: numbers, or only a band for a
 * concealed enemy. Plus the round and the turn's place in the order. The visibility
 * rule is the one the monster card applies: the DM, an ally and a revealed monster read
 * numbers; a player reads an enemy's band.
 */
import { describe, expect, it } from "vitest";

import { addMonster, startEncounter } from "@/features/campaigns/encounter";
import { buildEncounterView, type PcLive } from "@/features/campaigns/encounter-view";
import { encounterTrackerView } from "@/features/campaigns/encounter-tracker-view";
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

function fight(
  update: (monster: EncounterMonster) => EncounterMonster = (m) => m
): EncounterState {
  const state = addMonster(startEncounter({ u1: { characterId: "c1" } }, ["u1"], 1), {
    name: "Goblin",
    ac: 15,
    maxHp: 8,
    count: 2,
    initiative: 12,
    xp: 50,
  });
  return {
    ...state,
    round: 2,
    order: ["pc-u1", "monster-1", "monster-2"],
    currentCombatantId: "monster-1",
    combatants: state.combatants.map((c) => (c.kind === "monster" ? update(c) : c)),
  };
}

const tracker = (state: EncounterState, viewerIsDm: boolean) =>
  encounterTrackerView(
    state,
    buildEncounterView(state, { "pc-u1": pcLive }, viewerIsDm),
    viewerIsDm
  );

describe("encounterTrackerView", () => {
  it("knows the round, who acts now and where that is in the order", () => {
    const view = tracker(fight(), true);
    expect(view.round).toBe(2);
    expect(view.turnIndex).toBe(1);
    expect(view.rows.map((row) => [row.id, row.isCurrent])).toEqual([
      ["pc-u1", false],
      ["monster-1", true],
      ["monster-2", false],
    ]);
  });

  it("the DM reads every row's numbers", () => {
    const view = tracker(
      fight((m) => ({ ...m, hp: { current: 3, temp: 0, max: 8 } })),
      true
    );
    expect(view.rows.find((row) => row.id === "monster-1")?.hp).toEqual({
      kind: "numbers",
      current: 3,
      max: 8,
      temp: 0,
    });
  });

  it("a player reads a concealed enemy's band, never its numbers; a PC's numbers always", () => {
    const view = tracker(
      fight((m) => ({ ...m, hp: { current: 3, temp: 0, max: 8 } })),
      false
    );
    expect(view.rows.find((row) => row.id === "monster-1")?.hp).toEqual({
      kind: "band",
      band: "bloodied",
    });
    expect(view.rows.find((row) => row.id === "pc-u1")?.hp).toEqual({
      kind: "numbers",
      current: 18,
      max: 24,
      temp: 3,
    });
  });

  it("a revealed monster or an ally reads numbers to a player", () => {
    const revealed = tracker(
      fight((m) => ({ ...m, revealed: true })),
      false
    );
    expect(revealed.rows.find((row) => row.id === "monster-1")?.hp.kind).toBe("numbers");
    const ally = tracker(
      fight((m) => ({ ...m, side: "ally" })),
      false
    );
    expect(ally.rows.find((row) => row.id === "monster-2")?.hp.kind).toBe("numbers");
  });

  it("a creature at 0 HP is defeated, and a player sees it down", () => {
    const view = tracker(
      fight((m) => ({ ...m, hp: { current: 0, temp: 0, max: 8 } })),
      false
    );
    const goblin = view.rows.find((row) => row.id === "monster-2");
    expect(goblin).toMatchObject({ defeated: true, hp: { kind: "band", band: "down" } });
  });
});
