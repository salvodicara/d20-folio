/**
 * The 0-HP family for the new Play screen (headless: direction renders it). What the
 * classic DyingBanner and HP popover show and do, from the same seams: the state (up,
 * dying, stable, dead) with the cause of a death, the death saves, the d20 to enter,
 * the zero-HP savers and what the fall brings; and the commits: a death save entered,
 * a saver used, a hit taken at 0 (a Critical Hit is two failures), stabilising.
 * Cases from the classic behaviour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "i18next";

import {
  applyZeroHpSaver,
  downView,
  recordDeathSave,
  stabilise,
  takeDamage,
} from "@/domains/play/down-model";
import { asRaceId } from "@/data/srd-names";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const t = i18n.getFixedT("en");
const ENDURANCE = "race:orc:relentless-endurance";
const DUST = { kind: "disintegrated", sourceId: "disintegrate" } as const;

function open(doc: CharacterDoc): void {
  useCharacterStore.setState({ character: doc, readonly: false });
}
const live = (): CharacterDoc => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no sheet");
  return doc;
};

const down = (session: Partial<SessionState> = {}, race = "human") =>
  makeCharacterDoc(
    { race: asRaceId(race), classId: "fighter", level: 5 },
    { hp: { current: 0, temp: 0 }, ...session }
  );

beforeEach(() => useUndoStore.setState({ past: [], future: [] }));

describe("downView", () => {
  it("standing: up, nothing to show", () => {
    expect(downView(makeCharacterDoc())).toMatchObject({
      state: "up",
      zeroHpSavers: [],
      deadReason: null,
    });
  });

  it("at 0 HP: dying, the saves so far, one d20 to enter", () => {
    expect(downView(down({ deathSucc: 1, deathFail: 2 }))).toMatchObject({
      state: "dying",
      deathSaves: { successes: 1, failures: 2, limit: { successes: 3, failures: 3 } },
      d20: { faceCount: 1, mode: null },
    });
  });

  it("three successes: stable", () => {
    expect(downView(down({ deathSucc: 3 })).state).toBe("stable");
  });

  it("dead, and why: three failures, or Exhaustion 6 at full HP (no longer null)", () => {
    expect(downView(down({ deathFail: 3 }))).toMatchObject({
      state: "dead",
      deadReason: "death-saves",
    });
    expect(downView(makeCharacterDoc({}, { exhaustion: 6 }))).toMatchObject({
      state: "dead",
      deadReason: "exhaustion",
    });
  });

  it("an Orc at 0: Relentless Endurance on offer, and the Disintegrate dust waits for it", () => {
    const fallen = applySheetEvent(
      makeCharacterDoc(
        { race: asRaceId("orc"), classId: "fighter", level: 5 },
        { hp: { current: 10, temp: 0 } }
      ),
      { kind: "take-damage", amount: 40, onZeroHp: DUST }
    );
    if (!fallen) throw new Error("no hit");
    const view = downView(fallen);
    expect(view.zeroHpSavers.map((s) => s.sourceId)).toEqual([ENDURANCE]);
    expect(view.fallConsequence).toEqual(DUST);
  });
});

describe("the 0-HP commits", () => {
  it("a death save entered: 10+ a success, a 1 two failures, a 20 back on your feet", () => {
    open(down());
    recordDeathSave([12], t);
    expect(live().session.deathSucc).toBe(1);
    recordDeathSave([1], t);
    expect(live().session.deathFail).toBe(2);
    recordDeathSave([20], t);
    expect(downView(live()).state).toBe("up");
    expect(live().session.hp.current).toBe(1);
  });

  it("a hit at 0 HP is one failure; a Critical Hit is two", () => {
    open(down());
    takeDamage(3, { crit: false }, t);
    expect(live().session.deathFail).toBe(1);
    open(down());
    takeDamage(3, { crit: true }, t);
    expect(live().session.deathFail).toBe(2);
  });

  it("Relentless Endurance used: back at 1 HP, undoably", () => {
    const fallen = applySheetEvent(
      makeCharacterDoc(
        { race: asRaceId("orc"), classId: "fighter", level: 5 },
        { hp: { current: 10, temp: 0 } }
      ),
      { kind: "take-damage", amount: 40 }
    );
    if (!fallen) throw new Error("no hit");
    open(fallen);
    applyZeroHpSaver(ENDURANCE, undefined, t, "en");
    expect(live().session.hp.current).toBe(1);
    useUndoStore.getState().undo();
    expect(live().session.hp.current).toBe(0);
  });

  it("stabilise: three successes, the track closes", () => {
    open(down({ deathFail: 1 }));
    stabilise(t);
    expect(downView(live())).toMatchObject({
      state: "stable",
      deathSaves: { successes: 3, failures: 1 },
    });
  });
});
