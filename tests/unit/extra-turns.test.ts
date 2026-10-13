/**
 * Extra turns (Thief's Reflexes, Time Stop) — the cases come from the catalogue texts in
 * `src/i18n/en/srd/class-features.json` and `spells.json`: the second turn's Initiative
 * offset, the "two turns during the first round", and Time Stop's 1d4 + 1 count.
 */
import { describe, expect, it } from "vitest";

import classFeatures from "@/i18n/en/srd/class-features.json";
import spells from "@/i18n/en/srd/spells.json";
import { getClassFeatures } from "@/data/classes";
import {
  THIEFS_REFLEXES_ID,
  TIME_STOP_ID,
  classesGrantThiefsReflexes,
  firstRoundSlots,
  parseTimeStopTurns,
  soloExtraTurnOffer,
  soloExtraTurnOrdinal,
  thiefsReflexesTurns,
  timeStopCastThisTurn,
} from "@/lib/play/extra-turns";
import {
  advanceTurn,
  beginEncounterTurns,
  parseEncounterState,
  prevTurn,
} from "@/features/campaigns/encounter";
import type { EncounterState } from "@/types/campaign";

const reflexesText =
  (classFeatures as unknown as Record<string, { description: string }>)[
    THIEFS_REFLEXES_ID
  ]?.description ?? "";
const timeStopText =
  (spells as unknown as Record<string, { description: string }>)[TIME_STOP_ID]
    ?.description ?? "";

/** "your initiative minus 10" → 10. */
const offset = Number(/initiative minus (\d+)/i.exec(reflexesText)?.[1]);
/** "two turns during the first round" → 2 turns in round 1. */
const reflexTurns = /take two turns during the first round/i.test(reflexesText) ? 2 : 0;
/** "1d4 + 1 turns" → [2, 5]. */
const [, dieSize, plus] = /1d(\d+) \+ (\d+) turns/.exec(timeStopText) ?? [];
const timeStopMin = 1 + Number(plus);
const timeStopMax = Number(dieSize) + Number(plus);

describe("catalogue cases", () => {
  it("reads the numbers this suite checks from the catalogue texts", () => {
    expect(offset).toBe(10);
    expect(reflexTurns).toBe(2);
    expect([timeStopMin, timeStopMax]).toEqual([2, 5]);
  });

  it("Thief's Reflexes is the level-17 Thief feature in the class data", () => {
    const feature = getClassFeatures("rogue").find((f) => f.id === THIEFS_REFLEXES_ID);
    expect(feature).toMatchObject({ class: "rogue", subclass: "thief" });
    const level = feature?.level ?? 0;
    const thief = (lvl: number) => [
      { classId: "rogue", subclassId: "thief", level: lvl },
    ];
    expect(classesGrantThiefsReflexes(thief(level))).toBe(true);
    expect(classesGrantThiefsReflexes(thief(level - 1))).toBe(false);
    expect(
      classesGrantThiefsReflexes([{ classId: "rogue", subclassId: "assassin", level }])
    ).toBe(false);
  });
});

describe("solo offer", () => {
  it("Thief's Reflexes offers turn 2 of 2 in round 1 only, once", () => {
    const base = { thiefsReflexes: true, reflexesTaken: false, timeStop: null };
    expect(soloExtraTurnOffer({ ...base, round: 1 })).toEqual({
      source: THIEFS_REFLEXES_ID,
      n: reflexTurns,
      of: reflexTurns,
    });
    expect(soloExtraTurnOffer({ ...base, round: 2 })).toBeNull();
    expect(soloExtraTurnOffer({ ...base, round: 1, reflexesTaken: true })).toBeNull();
    expect(soloExtraTurnOffer({ ...base, round: 1, thiefsReflexes: false })).toBeNull();
  });

  it("Time Stop counts its entered turns down inside the round it was cast", () => {
    const at = (taken: number, round = 3) =>
      soloExtraTurnOffer({
        round,
        thiefsReflexes: false,
        reflexesTaken: false,
        timeStop: { round: 3, total: timeStopMax, taken },
      });
    expect(at(0)).toEqual({ source: TIME_STOP_ID, n: 1, of: timeStopMax });
    expect(at(timeStopMax - 1)).toEqual({
      source: TIME_STOP_ID,
      n: timeStopMax,
      of: timeStopMax,
    });
    expect(at(timeStopMax)).toBeNull();
    expect(at(0, 4)).toBeNull(); // the round moved on: Time Stop is over
    expect(
      soloExtraTurnOrdinal({
        round: 3,
        reflexesTaken: false,
        timeStop: { round: 3, total: timeStopMax, taken: 2 },
      })
    ).toEqual({ n: 2, of: timeStopMax });
  });

  it("asks for the count only for a Time Stop cast during this turn", () => {
    const cast = {
      event: {
        kind: "action-use" as const,
        action: { srd: { kind: "spell" as const, key: TIME_STOP_ID, field: "name" } },
        slot: "action" as const,
        effect: "spell-cast" as const,
      },
    };
    const turn = { event: { kind: "turn-end" as const, round: 2 } };
    expect(timeStopCastThisTurn([turn, cast])).toBe(true);
    expect(timeStopCastThisTurn([cast, turn])).toBe(false);
    expect(timeStopCastThisTurn([])).toBe(false);
  });

  it("accepts only a 1d4 + 1 count", () => {
    expect(parseTimeStopTurns(String(timeStopMin))).toBe(timeStopMin);
    expect(parseTimeStopTurns(String(timeStopMax))).toBe(timeStopMax);
    expect(parseTimeStopTurns(String(timeStopMin - 1))).toBeNull();
    expect(parseTimeStopTurns(String(timeStopMax + 1))).toBeNull();
    expect(parseTimeStopTurns("3.5")).toBeNull();
    expect(parseTimeStopTurns("")).toBeNull();
  });
});

// ─── Shared encounter ────────────────────────────────────────────────────────────

const ROGUE_INIT = 20;
const thief = [{ classId: "rogue", subclassId: "thief", level: 17 }];
/** Rogue 20 · Ogre 15 · Cleric (exactly rogue − offset) · Goblin (one below). */
const combatants = [
  { id: "pc-rogue", initiative: ROGUE_INIT, classes: thief },
  { id: "monster-1", initiative: 15 },
  { id: "pc-cleric", initiative: ROGUE_INIT - offset },
  { id: "monster-2", initiative: ROGUE_INIT - offset - 1 },
];
const order = combatants.map((c) => c.id);

function encounter(): EncounterState {
  return {
    combatants: [
      { kind: "pc", id: "pc-rogue", memberUid: "rogue", characterId: "c-rogue" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Ogre",
        ac: 11,
        initiative: 15,
        conditions: [],
        hp: { current: 59, temp: 0, max: 59 },
      },
      { kind: "pc", id: "pc-cleric", memberUid: "cleric", characterId: "c-cleric" },
      {
        kind: "monster",
        id: "monster-2",
        name: "Goblin",
        ac: 15,
        initiative: ROGUE_INIT - offset - 1,
        conditions: [],
        hp: { current: 7, temp: 0, max: 7 },
      },
    ],
    nextMonsterOrdinal: 3,
    round: 1,
    currentCombatantId: null,
    epoch: 1,
    status: "active",
  };
}

const pointer = (e: EncounterState) =>
  `${e.round}:${e.currentCombatantId}${e.extraTurns?.some((t) => t.started && t.id === e.currentCombatantId) && e.round === 1 ? "*" : ""}`;

describe("shared encounter second turn", () => {
  it("slots the second turn at Initiative minus the catalogue offset (ties go first)", () => {
    expect(thiefsReflexesTurns(order, combatants)).toEqual([
      { id: "pc-rogue", beforeId: "monster-2" },
    ]);
    expect(
      firstRoundSlots(order, thiefsReflexesTurns(order, combatants), 1).map(
        (s) => `${s.id}${s.extra ? "*" : ""}`
      )
    ).toEqual(["pc-rogue", "monster-1", "pc-cleric", "pc-rogue*", "monster-2"]);
    // Round 2+ is the plain order.
    expect(
      firstRoundSlots(order, [{ id: "pc-rogue", beforeId: "monster-2" }], 2)
    ).toEqual(order.map((id) => ({ id, extra: false })));
  });

  it("puts the second turn at the round's end when nobody is lower", () => {
    expect(thiefsReflexesTurns(order.slice(0, 3), combatants)).toEqual([
      { id: "pc-rogue", beforeId: null },
    ]);
  });

  it("steps the rogue twice in round 1 and once in round 2, then rewinds", () => {
    let e = beginEncounterTurns(
      encounter(),
      order,
      thiefsReflexesTurns(order, combatants)
    );
    const seen = [pointer(e)];
    for (let i = 0; i < 6; i++) {
      e = advanceTurn(e);
      seen.push(pointer(e));
    }
    expect(seen).toEqual([
      "1:pc-rogue",
      "1:monster-1",
      "1:pc-cleric",
      "1:pc-rogue*",
      "1:monster-2",
      "2:pc-rogue",
      "2:monster-1",
    ]);
    const back = [];
    for (let i = 0; i < 6; i++) {
      e = prevTurn(e);
      back.push(pointer(e));
    }
    expect(back).toEqual([
      "2:pc-rogue",
      "1:monster-2",
      "1:pc-rogue*",
      "1:pc-cleric",
      "1:monster-1",
      "1:pc-rogue",
    ]);
  });

  it("without Thief's Reflexes nothing is stored and the order is unchanged", () => {
    const plain = combatants.map(({ id, initiative }) => ({ id, initiative }));
    const e = beginEncounterTurns(encounter(), order, thiefsReflexesTurns(order, plain));
    expect(e.extraTurns).toBeUndefined();
    expect(pointer(advanceTurn(advanceTurn(advanceTurn(e))))).toBe("1:monster-2");
  });

  it("an older reader's state (no field) and a malformed field both read as the plain order", () => {
    const begun = beginEncounterTurns(encounter(), order);
    expect(parseEncounterState({ ...begun, extraTurns: [{ id: 3 }] }).extraTurns).toBe(
      undefined
    );
    const stored = { ...begun, extraTurns: [{ id: "pc-rogue", beforeId: "monster-2" }] };
    expect(parseEncounterState(stored)).toBe(stored);
  });
});
