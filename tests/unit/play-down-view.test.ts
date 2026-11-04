/**
 * At 0 Hit Points on the Play screen (approved prototype x-play-down): the death saves,
 * and once Stable how long it has been (2024: after 1d4 hours it regains 1 HP, the
 * table rolls), from the engine's `stableMinutes`. Standing or dead: nothing to show.
 */
import { describe, expect, it } from "vitest";
import { playDownView } from "@/domains/play/play-down-view";
import { makeCharacterDoc } from "./_helpers";

const at = (hp: number, saves: { s?: number; f?: number; stableSince?: number } = {}) => {
  const doc = makeCharacterDoc(
    { classId: "fighter", level: 3 },
    { hp: { current: hp, temp: 0 } }
  );
  return {
    ...doc,
    session: {
      ...doc.session,
      deathSucc: saves.s ?? 0,
      deathFail: saves.f ?? 0,
      ...(saves.stableSince !== undefined ? { stableSince: saves.stableSince } : {}),
    },
  };
};

describe("playDownView", () => {
  it("standing: nothing", () => {
    expect(playDownView(at(5))).toBeNull();
  });
  it("dying: the saves so far", () => {
    expect(playDownView(at(0, { s: 1, f: 2 }))).toEqual({
      successes: 1,
      failures: 2,
      stable: false,
      stableMinutes: null,
    });
  });
  it("Stable: three successes, and since when", () => {
    expect(playDownView(at(0, { s: 3, stableSince: 40 }))).toMatchObject({
      stable: true,
      stableMinutes: 40,
    });
  });
  it("dead: not this block", () => {
    expect(playDownView(at(0, { f: 3 }))).toBeNull();
  });
});
