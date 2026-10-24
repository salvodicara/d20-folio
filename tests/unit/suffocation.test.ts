/**
 * Suffocation (SRD 5.2.1 Rules Glossary, "Suffocation [Hazard]"):
 *
 *   "A creature can hold its breath for a number of minutes equal to 1 plus its
 *   Constitution modifier (minimum of 30 seconds) before suffocation begins. When a
 *   creature runs out of breath or is choking, it gains 1 Exhaustion level at the end
 *   of each of its turns. When a creature can breathe again, it removes all levels of
 *   Exhaustion it gained from suffocating."
 *
 * One round is 6 seconds, so a minute is 10 turn ends and 30 seconds is 5. A creature
 * that can breathe water and air (Water Breathing potion, Gift of the Depths, Alter
 * Self's Aquatic Adaptation) does not run out of breath underwater.
 */
import { describe, expect, it } from "vitest";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { drinkPotion } from "@/lib/play/states";
import {
  breathHoldRounds,
  breathLogEvents,
  SUFFOCATION_SOURCE,
} from "@/lib/play/suffocation";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { sanitizeSession } from "@/lib/sanitize-session";
import type { AbilityCode } from "@/data/types";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function diver(con: number, session: Partial<SessionState> = {}): CharacterDoc {
  const scores: Record<AbilityCode, number> = {
    STR: 10,
    DEX: 10,
    CON: con,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };
  return makeCharacterDoc(
    {
      classId: "fighter",
      level: 5,
      abilityScores: scores,
      equipment: [{ srdId: "potion-of-water-breathing", quantity: 1 }],
    },
    { hp: { current: 40, temp: 0 }, ...session }
  );
}

const run = (doc: CharacterDoc, ...events: Parameters<typeof applySheetEvent>[1][]) =>
  events.reduce((d, e) => applySheetEvent(d, e) ?? d, doc);

const turnEnds = (doc: CharacterDoc, n: number): CharacterDoc =>
  run(doc, ...Array.from({ length: n }, () => ({ kind: "breath-turn-end" }) as const));

describe("how long a creature holds its breath", () => {
  it("is 1 + Constitution modifier minutes, 10 turns a minute", () => {
    expect(breathHoldRounds(10)).toBe(10); // +0 → 1 minute
    expect(breathHoldRounds(14)).toBe(30); // +2 → 3 minutes
    expect(breathHoldRounds(20)).toBe(60); // +5 → 6 minutes
  });

  it("is never less than 30 seconds (5 turns)", () => {
    expect(breathHoldRounds(8)).toBe(5); // −1 → 0 minutes → 30 seconds
    expect(breathHoldRounds(3)).toBe(5); // −4 → −3 minutes → 30 seconds
  });

  it("starts from the character's Constitution", () => {
    const held = run(diver(14), { kind: "hold-breath" });
    expect(held.session.breath).toEqual({ roundsLeft: 30, gained: 0 });
  });
});

describe("running out of breath", () => {
  it("holds for the budget, then gains 1 Exhaustion at the end of each turn", () => {
    const held = run(diver(10), { kind: "hold-breath" }); // 10 turns
    const lastBreath = turnEnds(held, 10);
    expect(lastBreath.session.exhaustion).toBe(0);
    expect(lastBreath.session.breath).toEqual({ roundsLeft: 0, gained: 0 });
    const first = turnEnds(lastBreath, 1);
    expect(first.session.exhaustion).toBe(1);
    const third = turnEnds(first, 2);
    expect(third.session.exhaustion).toBe(3);
    expect(third.session.breath).toEqual({ roundsLeft: 0, gained: 3 });
  });

  it("a choking creature gains Exhaustion from its first turn end", () => {
    const choking = run(diver(20), { kind: "hold-breath", choking: true });
    expect(turnEnds(choking, 1).session.exhaustion).toBe(1);
  });

  it("time passing counts every turn of it: a minute is 10 turn ends", () => {
    const held = run(diver(10), { kind: "hold-breath" }); // 1 minute of air
    const after = run(held, { kind: "time-passes", minutes: 1.3 }); // 13 turns
    expect(after.session.exhaustion).toBe(3);
    expect(after.session.breath).toEqual({ roundsLeft: 0, gained: 3 });
  });

  it("stops at Exhaustion 6 (death)", () => {
    const held = run(diver(10, { exhaustion: 2 }), { kind: "hold-breath" });
    const after = run(held, { kind: "time-passes", minutes: 10 });
    expect(after.session.exhaustion).toBe(6);
    expect(after.session.breath?.gained).toBe(4);
  });

  it("does nothing to a creature that is breathing", () => {
    const doc = diver(10);
    expect(applySheetEvent(doc, { kind: "breath-turn-end" })).toBeNull();
    expect(applySheetEvent(doc, { kind: "breathe-again" })).toBeNull();
  });
});

describe("breathing again", () => {
  it("removes every level gained from suffocating, and only those", () => {
    const held = run(diver(10, { exhaustion: 1 }), { kind: "hold-breath" });
    const drowning = turnEnds(held, 12); // 2 levels from suffocating
    expect(drowning.session.exhaustion).toBe(3);
    const saved = run(drowning, { kind: "breathe-again" });
    expect(saved.session.exhaustion).toBe(1);
    expect(saved.session.breath).toBeUndefined();
  });

  it("a creature dead of suffocation stays dead", () => {
    const held = run(diver(10), { kind: "hold-breath" });
    const dead = run(held, { kind: "time-passes", minutes: 10 });
    expect(dead.session.exhaustion).toBe(6);
    expect(run(dead, { kind: "breathe-again" }).session.exhaustion).toBe(6);
  });
});

describe("a creature that can breathe water", () => {
  const withPotion = (doc: CharacterDoc): CharacterDoc => {
    const session = drinkPotion(doc, "potion-of-water-breathing", 0);
    if (!session) throw new Error("the potion did not light");
    return { ...doc, session };
  };

  it("does not start holding its breath", () => {
    expect(applySheetEvent(withPotion(diver(10)), { kind: "hold-breath" })).toBeNull();
  });

  it("breathes again as soon as it can: the potion drunk while drowning", () => {
    const drowning = turnEnds(run(diver(10), { kind: "hold-breath" }), 12);
    expect(drowning.session.exhaustion).toBe(2);
    const next = turnEnds(withPotion(drowning), 1);
    expect(next.session.exhaustion).toBe(0);
    expect(next.session.breath).toBeUndefined();
  });

  it("still chokes: water breathing is no help against a choke", () => {
    const choking = run(withPotion(diver(10)), { kind: "hold-breath", choking: true });
    expect(turnEnds(choking, 2).session.exhaustion).toBe(2);
  });
});

describe("the log line of each automatic level", () => {
  it("gaining a level reads as Exhaustion gained from Suffocation", () => {
    const lastBreath = turnEnds(run(diver(10), { kind: "hold-breath" }), 10);
    expect(breathLogEvents(lastBreath, lastBreath)).toEqual([]);
    expect(breathLogEvents(lastBreath, turnEnds(lastBreath, 1))).toEqual([
      { kind: "condition-gain", conditionId: "exhaustion", source: SUFFOCATION_SOURCE },
    ]);
  });

  it("breathing again reads as Exhaustion lost", () => {
    const drowning = turnEnds(run(diver(10), { kind: "hold-breath" }), 11);
    expect(breathLogEvents(drowning, run(drowning, { kind: "breathe-again" }))).toEqual([
      { kind: "condition-loss", conditionId: "exhaustion" },
    ]);
  });

  it("an Exhaustion change that is not suffocation logs nothing here", () => {
    const doc = diver(10);
    expect(breathLogEvents(doc, run(doc, { kind: "set-exhaustion", level: 2 }))).toEqual(
      []
    );
  });
});

describe("the held breath is stored with the play session", () => {
  it("round-trips through the compact state", () => {
    const held = turnEnds(run(diver(10), { kind: "hold-breath" }), 12);
    const state = sessionToState(held.session);
    expect(state.breath).toEqual({ roundsLeft: 0, gained: 2 });
    expect(stateToSession(state).breath).toEqual({ roundsLeft: 0, gained: 2 });
    expect(sanitizeSession(held.session).breath).toEqual({ roundsLeft: 0, gained: 2 });
  });

  it("a malformed stored breath reads as breathing", () => {
    expect(stateToSession({ breath: { roundsLeft: "x" } }).breath).toBeUndefined();
    expect(stateToSession({ breath: { roundsLeft: -1, gained: 0 } }).breath).toBe(
      undefined
    );
  });
});
