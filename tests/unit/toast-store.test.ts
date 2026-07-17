import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useToastStore, TOAST_EXIT_MS } from "@/stores/toastStore";

const s = () => useToastStore.getState();
beforeEach(() => {
  vi.useFakeTimers();
  s().clearAll();
});
afterEach(() => vi.useRealTimers());

describe("toastStore", () => {
  it("showToast adds a toast and returns its id", () => {
    const id = s().showToast({ message: "Deleted Fireball", duration: 5000 });
    expect(id).toMatch(/^toast-/);
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]?.message).toBe("Deleted Fireball");
  });

  it("auto-dismisses after its duration (leaving → gone after exit animation)", () => {
    s().showToast({ message: "x", duration: 5000 });
    expect(s().toasts).toHaveLength(1);
    // After the main duration the toast enters `leaving` state, not yet removed
    vi.advanceTimersByTime(5000);
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]?.leaving).toBe(true);
    // After the exit animation completes the toast is gone
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(s().toasts).toHaveLength(0);
  });

  it("dismissToast marks toast as leaving then removes it after exit animation", () => {
    const id = s().showToast({ message: "x", duration: 5000 });
    s().dismissToast(id);
    // Timer cleared immediately
    expect(s().timers[id]).toBeUndefined();
    // Toast still present but flagged leaving
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]?.leaving).toBe(true);
    // Gone after exit duration
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(s().toasts).toHaveLength(0);
  });

  it("undoToast invokes onUndo and removes the toast after exit animation", () => {
    const onUndo = vi.fn();
    const id = s().showToast({ message: "x", duration: 5000, onUndo });
    s().undoToast(id);
    expect(onUndo).toHaveBeenCalledTimes(1);
    // leaving, not yet gone
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]?.leaving).toBe(true);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(s().toasts).toHaveLength(0);
  });

  it("undoToast on a toast without onUndo just removes it (no throw)", () => {
    const id = s().showToast({ message: "x", duration: 5000 });
    expect(() => s().undoToast(id)).not.toThrow();
    // leaving while animation plays
    expect(s().toasts).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_EXIT_MS);
    expect(s().toasts).toHaveLength(0);
  });

  // ── THE ONE-SNACKBAR RULE (the reversal contract) — at most ONE undo-bearing
  //    toast is visible: a new undoable act's announcement updates the live undo
  //    toast IN PLACE (same id, same DOM element), swapping message + onUndo and
  //    RESETTING the countdown. No stacking; depth lives on the undo stack.
  it("a new undo toast replaces the live one in place (same id, no second toast)", () => {
    const first = s().showToast({
      message: "Longsword — attack 1 of 2",
      duration: 5000,
      onUndo: vi.fn(),
    });
    const undo2 = vi.fn();
    const second = s().showToast({
      message: "Longsword — attack 2 of 2",
      duration: 5000,
      onUndo: undo2,
    });
    // Same id, ONE toast, text updated, onUndo swapped to the latest act's.
    expect(second).toBe(first);
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]?.message).toBe("Longsword — attack 2 of 2");
    s().toasts[0]?.onUndo?.();
    expect(undo2).toHaveBeenCalledTimes(1);
  });

  it("a NOTICE (no onUndo) never claims the undo snackbar slot — the lanes are separate", () => {
    s().showToast({ message: "act", duration: 5000, onUndo: vi.fn() });
    s().showToast({ message: "no uses left", duration: 2000 });
    // Two toasts: the undo snackbar + the independent notice.
    expect(s().toasts).toHaveLength(2);
    // …and a second notice stacks in the notice lane, leaving the snackbar alone.
    s().showToast({ message: "another notice", duration: 2000 });
    expect(s().toasts.filter((t) => !t.onUndo)).toHaveLength(2);
    expect(s().toasts.filter((t) => t.onUndo)).toHaveLength(1);
  });

  it("replacement resets the countdown so the evolving announcement stays live", () => {
    s().showToast({ message: "one", duration: 5000, onUndo: vi.fn() });
    vi.advanceTimersByTime(4000); // 1s from expiry…
    s().showToast({ message: "two", duration: 5000, onUndo: vi.fn() }); // …reset
    vi.advanceTimersByTime(4000); // total 8s, but only 4s since the reset
    expect(s().toasts).toHaveLength(1);
    expect(s().toasts[0]?.leaving).toBeFalsy();
    // The reset countdown still expires on its own 5s schedule.
    vi.advanceTimersByTime(1000 + TOAST_EXIT_MS);
    expect(s().toasts).toHaveLength(0);
  });

  it("a fresh act (after the toast left) starts a NEW toast, not a resurrection", () => {
    const firstId = s().showToast({
      message: "one",
      duration: 5000,
      onUndo: vi.fn(),
    });
    s().dismissToast(firstId); // flagged leaving
    const second = s().showToast({
      message: "two",
      duration: 5000,
      onUndo: vi.fn(),
    });
    // The leaving toast is skipped → a brand-new toast is created alongside it.
    expect(s().toasts.find((t) => t.id === second)?.leaving).toBeFalsy();
    expect(s().toasts.some((t) => t.message === "two" && !t.leaving)).toBe(true);
  });

  it("clearAll removes every toast and timer immediately", () => {
    s().showToast({ message: "a", duration: 5000 });
    s().showToast({ message: "b", duration: 5000 });
    expect(s().toasts).toHaveLength(2);
    s().clearAll();
    expect(s().toasts).toHaveLength(0);
    expect(Object.keys(s().timers)).toHaveLength(0);
  });
});
