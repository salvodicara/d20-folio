/**
 * The clock's time of day (M18): optional, set by the table. Dawn is 06:00 and dusk
 * 18:00; passing time or a Long Rest that crosses one fires it. With no time set, a
 * Long Rest counts as passing a dawn (today's behaviour) and passing time crosses
 * nothing.
 */
import { describe, expect, it } from "vitest";

import { longRestCharacter } from "@/lib/play/rests";
import { crossedDawn, crossedDusk, passTime, restCrossesDawn } from "@/lib/play/time";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { applySheetEvent } from "@/lib/play/sheet-events";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const at = (hh: number, mm = 0) => hh * 60 + mm;
const doc = (timeOfDay?: number): CharacterDoc =>
  makeCharacterDoc({}, timeOfDay === undefined ? {} : { timeOfDay });

describe("crossing dawn and dusk", () => {
  it("a stretch crosses dawn when it passes 06:00", () => {
    expect(crossedDawn(at(22), 480)).toBe(true); // 22:00 → 06:00
    expect(crossedDawn(at(5), 60)).toBe(true); // 05:00 → 06:00
    expect(crossedDawn(at(6), 60)).toBe(false); // already past it
    expect(crossedDawn(at(7), 60)).toBe(false);
    expect(crossedDawn(at(7), 24 * 60)).toBe(true); // a whole day
    expect(crossedDawn(undefined, 480)).toBe(false); // no time set
  });

  it("dusk at 18:00", () => {
    expect(crossedDusk(at(17), 120)).toBe(true);
    expect(crossedDusk(at(19), 120)).toBe(false);
  });
});

describe("the clock moves with time", () => {
  it("passing time moves the time of day, around midnight", () => {
    expect(passTime(doc(at(22)), 480)?.session.timeOfDay).toBe(at(6));
    expect(passTime(doc(at(23, 30)), 60)?.session.timeOfDay).toBe(at(0, 30));
  });

  it("with no time set, passing time leaves it unset", () => {
    expect(passTime(doc(), 60)?.session.timeOfDay).toBeUndefined();
  });

  it("a Long Rest moves the clock 8 hours, and crosses dawn when it spans 06:00", () => {
    expect(longRestCharacter(doc(at(22))).session.timeOfDay).toBe(at(6));
    expect(restCrossesDawn(doc(at(22)), 480)).toBe(true);
    expect(restCrossesDawn(doc(at(8)), 480)).toBe(false);
    // No time set: a Long Rest counts as passing a dawn (today's behaviour).
    expect(restCrossesDawn(doc(), 480)).toBe(true);
  });

  it("the table sets or clears the time, and it survives a save", () => {
    const set = applySheetEvent(doc(), { kind: "set-time-of-day", minutes: at(22) });
    if (!set) throw new Error("the time was not set");
    expect(set.session.timeOfDay).toBe(at(22));
    const saved = stateToSession(
      JSON.parse(JSON.stringify(sessionToState(set.session))) as Record<string, unknown>
    );
    expect(saved.timeOfDay).toBe(at(22));
    const cleared = applySheetEvent(set, { kind: "set-time-of-day", minutes: null });
    expect(cleared?.session.timeOfDay).toBeUndefined();
  });
});
