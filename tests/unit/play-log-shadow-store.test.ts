/**
 * Shadow mode wired into the store (phase 3a step 2): in development every
 * `dispatch` records its sheet event in the character's shadow log, and its undo as
 * an undo entry. A normal run of real store actions keeps parity: the fold of the
 * log equals the live character after every step.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";
import { playLogShadowStats, useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";

function load(): string {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.id = `shadow-${Math.random().toString(36).slice(2)}`;
  doc.session.logEntries = [];
  doc.session.conditions = [];
  doc.session.hp = { current: 30, temp: 0 };
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  return doc.id;
}

const store = () => useCharacterStore.getState();

describe("play log shadow in the store", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null });
  });

  it("records every dispatched event and keeps parity, undo included", () => {
    const id = load();
    store().dispatch({ kind: "add-condition", condition: "poisoned" });
    store().dispatch({ kind: "spend-slot", level: 1, pactMagic: false });
    const undoTemp = store().dispatch({ kind: "set-temp-hp", temp: 5 });
    undoTemp?.();
    expect(playLogShadowStats(id)).toMatchObject({ checkpoints: 1, mismatches: 0 });
    expect(playLogShadowStats(id)?.entries).toBe(4);
  });

  it("an older action's undo goes through the log: later changes stay (dev)", () => {
    const id = load();
    const usedBefore = store().character?.session.spellSlots["1"]?.used ?? 0;
    const undoSlot = store().dispatch({ kind: "spend-slot", level: 1, pactMagic: false });
    store().dispatch({ kind: "set-temp-hp", temp: 5 });
    undoSlot?.();
    const session = store().character?.session;
    expect(session?.hp.temp).toBe(5);
    expect(session?.spellSlots["1"]?.used ?? 0).toBe(usedBefore);
    expect(playLogShadowStats(id)).toMatchObject({ mismatches: 0 });
  });

  it("falls back to the snapshot when a write went around the log", () => {
    const id = load();
    const usedBefore = store().character?.session.spellSlots["1"]?.used ?? 0;
    const undoSlot = store().dispatch({ kind: "spend-slot", level: 1, pactMagic: false });
    const before = store().character;
    if (!before) throw new Error("no character");
    // A write outside dispatch (a world commit, a rest dialog…): the log no longer
    // reproduces the sheet, so the undo restores today's snapshot.
    useCharacterStore.setState({
      character: { ...before, session: { ...before.session, notes: "outside" } },
    });
    undoSlot?.();
    expect(store().character?.session.notes).not.toBe("outside");
    expect(store().character?.session.spellSlots["1"]?.used ?? 0).toBe(usedBefore);
    expect(playLogShadowStats(id)).toMatchObject({ mismatches: 0 });
  });

  it("damage, healing and temporary HP reach the log as intentions", () => {
    const id = load();
    store().applyDamage(5);
    store().applyHealing(2);
    store().gainTempHp(4);
    expect(store().character?.session.hp).toEqual({ current: 27, temp: 4 });
    // One checkpoint: none of the three wrote around the log.
    expect(playLogShadowStats(id)).toEqual({ entries: 3, checkpoints: 1, mismatches: 0 });
  });

  it("death saves reach the log: no write around it", () => {
    const id = load();
    store().dispatch({ kind: "add-condition", condition: "poisoned" });
    store().setDeathSaves(1, 0);
    store().setDeathSaves(1, 1);
    store().dispatch({ kind: "spend-slot", level: 1, pactMagic: false });
    expect(store().character?.session).toMatchObject({ deathSucc: 1, deathFail: 1 });
    expect(playLogShadowStats(id)).toEqual({ entries: 4, checkpoints: 1, mismatches: 0 });
  });

  it("a Short Rest and a Long Rest reach the log", () => {
    const id = load();
    // Not concentrating: ending concentration still writes around the log (its own step).
    const doc = store().character;
    if (!doc) throw new Error("no character");
    useCharacterStore.setState({
      character: { ...doc, session: { ...doc.session, concentration: "" } },
    });
    store().dispatch({ kind: "spend-slot", level: 1, pactMagic: false });
    store().shortRest();
    store().longRest();
    expect(store().character?.session.spellSlots["1"]?.used ?? 0).toBe(0);
    expect(playLogShadowStats(id)).toEqual({ entries: 3, checkpoints: 1, mismatches: 0 });
  });

  it("removing a condition reaches the log, and its undo brings it back", () => {
    const id = load();
    store().dispatch({ kind: "add-condition", condition: "poisoned" });
    const undo = store().removeConditionSilent("poisoned");
    expect(store().character?.session.conditions).not.toContain("poisoned");
    expect(playLogShadowStats(id)).toEqual({ entries: 2, checkpoints: 1, mismatches: 0 });
    undo?.();
    expect(store().character?.session.conditions).toContain("poisoned");
    expect(playLogShadowStats(id)).toMatchObject({ checkpoints: 1, mismatches: 0 });
  });

  it("a defense gained or lost in play (a potion's resistance) reaches the log", () => {
    const id = load();
    store().addSessionDefense("resistance", "fire");
    expect(store().character?.session.sessionDefenses?.resistance).toEqual(["fire"]);
    store().removeSessionDefense("resistance", "fire");
    expect(store().character?.session.sessionDefenses?.resistance ?? []).toEqual([]);
    expect(playLogShadowStats(id)).toEqual({ entries: 2, checkpoints: 1, mismatches: 0 });
    // The removal's undo (its toast) brings the resistance back.
    useUndoStore.getState().undo();
    expect(store().character?.session.sessionDefenses?.resistance).toEqual(["fire"]);
  });

  it("recorded tracker rolls and a pool top-up reach the log; their undos stay narrow", () => {
    const doc = {
      ...makeCharacterDoc(
        {
          classId: "monk",
          level: 3,
          features: [
            { srdId: "monk-focus" },
            {
              custom: true,
              title: "Foretelling",
              emoji: "",
              source: "Homebrew",
              tags: [],
              contentBlocks: [],
              trackers: [
                {
                  id: "foretelling",
                  label: "Foretelling",
                  total: "2",
                  recovery: "long-rest",
                  recordedRolls: { min: 1, max: 20 },
                },
              ],
              instanceId: customInstanceId("Foretelling"),
            },
          ],
        },
        { trackers: { "monk-focus": { used: 3 } } }
      ),
      id: `shadow-trackers-${Math.random().toString(36).slice(2)}`,
    };
    useCharacterStore.setState({
      character: doc,
      loading: false,
      error: null,
      readonly: false,
    });
    store().setTrackerRoll("foretelling", 0, 17);
    const undoSpend = store().spendTrackerRoll("foretelling", 0);
    const undoTopUp = store().topUpTracker("monk-focus", "full");
    expect(store().character?.session.trackers.foretelling).toEqual({
      used: 1,
      rolls: [null],
    });
    expect(store().character?.session.trackers["monk-focus"]).toBeUndefined();
    expect(playLogShadowStats(doc.id)).toEqual({
      entries: 3,
      checkpoints: 1,
      mismatches: 0,
    });
    undoTopUp?.();
    undoSpend?.();
    expect(store().character?.session.trackers["monk-focus"]).toEqual({ used: 3 });
    expect(store().character?.session.trackers.foretelling).toEqual({
      used: 0,
      rolls: [17, null],
    });
  });

  it("End Turn's per-turn recovery (Sneak Attack) reaches the log", () => {
    const doc = {
      ...makeCharacterDoc(
        { classId: "rogue", level: 3, features: [{ srdId: "rogue-sneak-attack" }] },
        { trackers: { "rogue-sneak-attack": { used: 1 } } }
      ),
      id: `shadow-rogue-${Math.random().toString(36).slice(2)}`,
    };
    useCharacterStore.setState({
      character: doc,
      loading: false,
      error: null,
      readonly: false,
    });
    store().dispatch({ kind: "add-condition", condition: "poisoned" });
    const undo = store().recoverPerTurnTrackers();
    expect(store().character?.session.trackers["rogue-sneak-attack"]).toBeUndefined();
    expect(playLogShadowStats(doc.id)).toEqual({
      entries: 2,
      checkpoints: 1,
      mismatches: 0,
    });
    // Its undo stays field-scoped (it composes inside End Turn's undo).
    undo?.();
    expect(store().character?.session.trackers["rogue-sneak-attack"]).toEqual({
      used: 1,
    });
  });
});
