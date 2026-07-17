/**
 * useHpControls × the session undo stack — a damage commit round-trips through
 * undo → redo → undo with the HP pool, temp HP, AND the dying track landing back on
 * the EXACT prior values (a faithful inverse, and a re-runnable redo).
 *
 * `handleApplyDamage` is the Pattern-B site (its toast message differs on a Death-Ward
 * trigger): the mutation runs first, then the entry is registered manually with a
 * `redo` that re-runs the same handler. This test drives the REAL `characterStore`
 * (CI-pure — no firebase) + the REAL `undoStore`, exercising register → undo → redo →
 * undo end-to-end. The toast store is mocked only to keep the seam quiet.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { MOCK_CHARACTER } from "@/lib/mock";

vi.mock("@/stores/toastStore", () => {
  const showToast = vi.fn(() => "toast-1");
  const useToastStore = Object.assign(
    (selector: (s: { showToast: typeof showToast }) => unknown) =>
      selector({ showToast }),
    { getState: () => ({ showToast, dismissToast: vi.fn() }) }
  );
  return { useToastStore };
});

const sess = () => useCharacterStore.getState().character?.session;

beforeEach(() => {
  // Reset the undo store so each test starts with an empty LIFO (§5.4 test hygiene).
  useUndoStore.setState({ characterId: null, past: [], future: [] });
  useCharacterStore.getState().setCharacter({
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      hp: { ...MOCK_CHARACTER.session.hp, current: 5, temp: 4 },
      deathSucc: 1,
      deathFail: 2,
      activeFeatures: [],
      concentration: "",
    },
  });
});

describe("useHpControls — undo/redo round-trip", () => {
  it("damage → undo → redo → undo restores HP, temp, and death saves exactly", () => {
    const { result } = renderHook(() => useHpControls());

    // 12 damage: temp (4) absorbs first, the rest drops current 5 → 0 (a knockout,
    // which resets the dying track to 0/0).
    act(() => result.current.handleApplyDamage([{ amount: 12 }]));
    expect(sess()?.hp.current).toBe(0);
    expect(sess()?.hp.temp).toBe(0);
    expect(sess()?.deathSucc).toBe(0);
    expect(sess()?.deathFail).toBe(0);
    expect(useUndoStore.getState().past).toHaveLength(1);

    // Undo → the exact prior pool + dying track return.
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(sess()?.hp.current).toBe(5);
    expect(sess()?.hp.temp).toBe(4);
    expect(sess()?.deathSucc).toBe(1);
    expect(sess()?.deathFail).toBe(2);
    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(useUndoStore.getState().future).toHaveLength(1);

    // Redo → re-runs the SAME resolved damage (Pattern B), re-registering a fresh entry.
    act(() => {
      useUndoStore.getState().redo();
    });
    expect(sess()?.hp.current).toBe(0);
    expect(sess()?.hp.temp).toBe(0);
    expect(sess()?.deathSucc).toBe(0);
    expect(sess()?.deathFail).toBe(0);
    expect(useUndoStore.getState().past).toHaveLength(1);

    // Undo again → back to the original, identical to the pre-damage snapshot.
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(sess()?.hp.current).toBe(5);
    expect(sess()?.hp.temp).toBe(4);
    expect(sess()?.deathSucc).toBe(1);
    expect(sess()?.deathFail).toBe(2);
  });
});
