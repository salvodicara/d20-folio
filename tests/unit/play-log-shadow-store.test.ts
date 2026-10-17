/**
 * Shadow mode wired into the store (phase 3a step 2): in development every
 * `dispatch` records its sheet event in the character's shadow log, and its undo as
 * an undo entry. A normal run of real store actions keeps parity: the fold of the
 * log equals the live character after every step.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { makeCharacterDoc } from "./_helpers";
import { playLogShadowStats, useCharacterStore } from "@/stores/characterStore";

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
