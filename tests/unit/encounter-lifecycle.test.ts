/**
 * The shared-combat lifecycle (owner direction 2026-10-23, row 12): combat starts on
 * the first initiative roll, for the whole campaign, with no Start button, and it
 * never blocks. A late roll or a late member joins. The DM, the player whose turn it
 * is, or anyone once a turn has stalled moves the turn on. The fight ends by itself
 * when every enemy is down, on a rest, or after an hour with nothing happening; "End"
 * is anyone's. Pure engine: nothing here is wired to a screen yet.
 */
import { describe, expect, it } from "vitest";

import { addMonster, parseEncounterState } from "@/features/campaigns/encounter";
import {
  IDLE_END_MS,
  STALLED_TURN_MS,
  canAdvanceTurn,
  encounterEndReason,
  passTurn,
  rollInitiative,
} from "@/features/campaigns/encounter-lifecycle";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const seeds = { u1: { characterId: "c1" }, u2: { characterId: "c2" } };
const party = { seeds, attachedUids: ["u1", "u2"] };
const T0 = 1_000_000;

function started(): EncounterState {
  // Ana (u1) rolls 12 first: the fight is on for everyone.
  return rollInitiative(null, {
    ...party,
    combatantId: "pc-u1",
    pcInitiatives: { "pc-u1": 12 },
    now: T0,
  });
}

function withGoblins(state: EncounterState, initiative: number): EncounterState {
  return addMonster(state, { name: "Goblin", ac: 15, maxHp: 7, count: 2, initiative });
}

function setMonsterHp(
  state: EncounterState,
  id: string,
  current: number
): EncounterState {
  return {
    ...state,
    combatants: state.combatants.map((c) =>
      c.kind === "monster" && c.id === id ? { ...c, hp: { ...c.hp, current } } : c
    ),
  };
}

describe("combat starts on the first initiative roll", () => {
  it("with every attached member in it and the roller's turn up", () => {
    const fight = started();
    expect(fight.combatants.map((c) => c.id)).toEqual(["pc-u1", "pc-u2"]);
    expect(fight.order).toEqual(["pc-u1"]);
    expect(fight.currentCombatantId).toBe("pc-u1");
    expect(fight.round).toBe(1);
    expect(fight.clock).toEqual({
      startedAt: T0,
      lastActivityAt: T0,
      turnStartedAt: T0,
      turnsBegun: false,
    });
  });

  it("until a turn is passed, a higher roll that comes in later takes the top", () => {
    const fight = rollInitiative(started(), {
      ...party,
      combatantId: "pc-u2",
      pcInitiatives: { "pc-u1": 12, "pc-u2": 18 },
      now: T0 + 5_000,
    });
    expect(fight.order).toEqual(["pc-u2", "pc-u1"]);
    expect(fight.currentCombatantId).toBe("pc-u2");
    expect(fight.clock?.turnStartedAt).toBe(T0 + 5_000);
  });

  it("the DM's monsters slot in by their initiative", () => {
    const withMonsters = withGoblins(started(), 15);
    const fight = rollInitiative(withMonsters, {
      ...party,
      combatantId: "monster-1",
      pcInitiatives: { "pc-u1": 12 },
      now: T0 + 1_000,
    });
    expect(fight.order).toEqual(["monster-1", "monster-2", "pc-u1"]);
    expect(fight.currentCombatantId).toBe("monster-1");
  });
});

describe("it never blocks", () => {
  it("a late roll after turns have begun slots in without moving the current turn", () => {
    const begun = passTurn(withGoblins(started(), 15), T0 + 10_000);
    const before = begun.currentCombatantId;
    // Bo (u2) rolls a 20 mid-round: he is in, and acts from his slot next time round.
    const fight = rollInitiative(begun, {
      ...party,
      combatantId: "pc-u2",
      pcInitiatives: { "pc-u1": 12, "pc-u2": 20 },
      now: T0 + 20_000,
    });
    expect(fight.order?.[0]).toBe("pc-u2");
    expect(fight.currentCombatantId).toBe(before);
  });

  it("a member who attached after the start joins when they roll", () => {
    const fight = rollInitiative(started(), {
      seeds: { ...seeds, u3: { characterId: "c3" } },
      attachedUids: ["u1", "u2", "u3"],
      combatantId: "pc-u3",
      pcInitiatives: { "pc-u1": 12, "pc-u3": 9 },
      now: T0 + 3_000,
    });
    expect(fight.combatants.map((c) => c.id)).toContain("pc-u3");
    expect(fight.order).toEqual(["pc-u1", "pc-u3"]);
  });

  it("the DM, the player on turn, or anyone after a stall can pass the turn", () => {
    const fight = started(); // Ana's turn since T0
    expect(canAdvanceTurn(fight, { uid: "dm", isDm: true }, T0)).toBe(true);
    expect(canAdvanceTurn(fight, { uid: "u1", isDm: false }, T0)).toBe(true);
    expect(canAdvanceTurn(fight, { uid: "u2", isDm: false }, T0 + 5_000)).toBe(false);
    expect(canAdvanceTurn(fight, { uid: "u2", isDm: false }, T0 + STALLED_TURN_MS)).toBe(
      true
    );
  });

  it("passing the turn starts the next one's clock", () => {
    const fight = passTurn(withGoblins(started(), 15), T0 + 30_000);
    expect(fight.clock).toMatchObject({
      lastActivityAt: T0 + 30_000,
      turnStartedAt: T0 + 30_000,
      turnsBegun: true,
    });
  });
});

describe("the fight ends by itself", () => {
  it("when every enemy is down, not before, and a downed ally doesn't count", () => {
    let fight = withGoblins(started(), 15);
    fight = addMonster(fight, {
      name: "Guard",
      ac: 16,
      maxHp: 11,
      count: 1,
      initiative: 5,
      side: "ally",
    });
    const ids = fight.combatants
      .filter((c): c is EncounterMonster => c.kind === "monster")
      .map((m) => m.id);
    expect(ids).toEqual(["monster-1", "monster-2", "monster-3"]); // the guard is 3
    expect(encounterEndReason(fight, { now: T0 })).toBeNull();
    // A downed ally ends nothing.
    expect(
      encounterEndReason(setMonsterHp(fight, "monster-3", 0), { now: T0 })
    ).toBeNull();
    fight = setMonsterHp(fight, "monster-1", 0);
    expect(encounterEndReason(fight, { now: T0 })).toBeNull();
    // The last goblin falls while the guard still stands: the fight is won.
    fight = setMonsterHp(fight, "monster-2", 0);
    expect(encounterEndReason(fight, { now: T0 })).toBe("enemies-defeated");
  });

  it("with no enemies on the table yet, it doesn't end", () => {
    expect(encounterEndReason(started(), { now: T0 })).toBeNull();
  });

  it("on a rest", () => {
    expect(encounterEndReason(started(), { now: T0, restTaken: true })).toBe("rest");
  });

  it("after an hour with nothing happening", () => {
    expect(encounterEndReason(started(), { now: T0 + IDLE_END_MS - 1 })).toBeNull();
    expect(encounterEndReason(started(), { now: T0 + IDLE_END_MS })).toBe("idle");
  });

  it("a fight started before the clock existed never ends as idle", () => {
    const { clock: _clock, ...old } = started();
    void _clock;
    expect(encounterEndReason(old, { now: T0 + 10 * IDLE_END_MS })).toBeNull();
  });
});

describe("the stored clock", () => {
  it("reads back, and a malformed one reads as absent instead of breaking the fight", () => {
    const fight = started();
    expect(parseEncounterState(structuredClone(fight)).clock).toEqual(fight.clock);
    const bad = { ...structuredClone(fight), clock: { startedAt: "soon" } };
    expect(parseEncounterState(bad).clock).toBeUndefined();
  });
});
