/**
 * Shadow mode wired into the store (phase 3a step 2): in development every
 * `dispatch` records its sheet event in the character's shadow log, and its undo as
 * an undo entry. A normal run of real store actions keeps parity: the fold of the
 * log equals the live character after every step.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
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

  it("warns when a snapshot undo and the log's replay disagree", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = load();
    const undoSlot = store().dispatch({ kind: "spend-slot", level: 1, pactMagic: false });
    store().dispatch({ kind: "set-temp-hp", temp: 5 });
    // Undoing the older event restores its whole snapshot (dropping the temp HP too);
    // the log takes out only that event.
    undoSlot?.();
    expect(playLogShadowStats(id)?.mismatches).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[play-log shadow]"));
    warn.mockRestore();
  });
});
