/**
 * useHpControls — death-save reset on a fresh knockout (Phase 6 fix).
 *
 * The damage seam behind all three HP surfaces (`handleApplyDamage`) is the SOLE
 * damage caller. RAW: dropping to 0 HP starts a FRESH dying state, so the death
 * saves must reset to 0/0 — otherwise a prior dying episode's marks linger and
 * the next knockout begins mid-death-throw ("where we left them"). The store
 * already resets on the heal-from-0 direction (`setHP`); these tests cover the
 * ENTERING-0 direction and prove undo is a faithful inverse (restores the EXACT
 * prior dying track, not a blanket 0/0).
 *
 * Drives the REAL `characterStore` (CI-pure — no firebase) seeded from the
 * bundled mock, so the engine path is exercised end-to-end. The toast store is
 * mocked only to capture the undo callback.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, type RenderHookResult } from "@testing-library/react";
import { useCharacterStore } from "@/stores/characterStore";
import {
  useHpControls,
  type HpControls,
} from "@/features/character/molecules/use-hp-controls";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { SessionState } from "@/types/character";

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

// The hook reads `showToast` via the selector-hook form; the store reads it via
// `getState()` (concentration toast). Support BOTH shapes with one mock.
vi.mock("@/stores/toastStore", () => {
  const useToastStore = Object.assign(
    (selector: (s: { showToast: typeof showToastMock }) => unknown) =>
      selector({ showToast: showToastMock }),
    { getState: () => ({ showToast: showToastMock }) }
  );
  return { useToastStore };
});

/** Seed the real store from the mock with an explicit HP + dying track. */
function seed(opts: {
  current: number;
  temp?: number;
  succ: number;
  fail: number;
  activeFeatures?: string[];
  conditions?: string[];
  sessionDefenses?: SessionState["sessionDefenses"];
}) {
  useCharacterStore.getState().setCharacter({
    ...MOCK_CHARACTER,
    session: {
      ...MOCK_CHARACTER.session,
      hp: { ...MOCK_CHARACTER.session.hp, current: opts.current, temp: opts.temp ?? 0 },
      deathSucc: opts.succ,
      deathFail: opts.fail,
      activeFeatures: opts.activeFeatures ?? [],
      conditions: opts.conditions ?? [],
      ...(opts.sessionDefenses ? { sessionDefenses: opts.sessionDefenses } : {}),
      // Keep the assertions focused on HP + death saves (no concentration toast).
      concentration: "",
    },
  });
}

/** Current session snapshot. */
const sess = () => useCharacterStore.getState().character?.session;

/** Apply `amount` of damage through the hook (amount-arg handler). Both store
 * updates are synchronous, so plain `act` flushes them. */
function applyDamage(
  result: RenderHookResult<HpControls, unknown>["result"],
  amount: string
) {
  act(() => {
    result.current.handleApplyDamage([{ amount: parseInt(amount, 10) }]);
  });
}

beforeEach(() => {
  showToastMock.mockReset();
});

describe("useHpControls — death-save reset on knockout", () => {
  it("resets the dying track to 0/0 when damage drops HP from >0 to exactly 0", () => {
    // A prior episode left 2 successes + 1 failure on the sheet while alive.
    seed({ current: 10, succ: 2, fail: 1 });
    const { result } = renderHook(() => useHpControls());

    applyDamage(result, "10");

    expect(sess()?.hp.current).toBe(0);
    // Fresh dying state — the lingering 2/1 is wiped.
    expect(sess()?.deathSucc).toBe(0);
    expect(sess()?.deathFail).toBe(0);
  });

  it("leaves the dying track untouched when damage does NOT reach 0", () => {
    seed({ current: 38, succ: 2, fail: 1 });
    const { result } = renderHook(() => useHpControls());

    applyDamage(result, "5");

    expect(sess()?.hp.current).toBe(33);
    // No knockout → death saves are not reset.
    expect(sess()?.deathSucc).toBe(2);
    expect(sess()?.deathFail).toBe(1);
  });

  it("reproduces the owner's sequence: stable at 0 → heal → re-drop reads a FRESH 0/0", () => {
    // At 0 HP, stabilised (3 successes).
    seed({ current: 0, succ: 3, fail: 0 });
    const { result } = renderHook(() => useHpControls());

    // Heal up — the store's heal-from-0 path already resets the dying track.
    act(() => {
      useCharacterStore.getState().setHP(20);
    });
    expect(sess()?.hp.current).toBe(20);
    expect(sess()?.deathSucc).toBe(0);

    // Drop to 0 again — the pips stay a fresh 0/0 (no stale "where we left them").
    applyDamage(result, "20");
    expect(sess()?.hp.current).toBe(0);
    expect(sess()?.deathSucc).toBe(0);
    expect(sess()?.deathFail).toBe(0);
  });

  it("undo of a killing blow restores the EXACT prior dying track (not 0/0)", () => {
    seed({ current: 10, succ: 2, fail: 1 });
    const { result } = renderHook(() => useHpControls());

    applyDamage(result, "10");
    // The reset landed.
    expect(sess()?.deathSucc).toBe(0);
    expect(sess()?.deathFail).toBe(0);

    // Pull the undo callback off the damage toast (the one carrying onUndo).
    const damageToast = showToastMock.mock.calls
      .map((c) => c[0] as { onUndo?: () => void })
      .find((arg) => typeof arg.onUndo === "function");
    expect(damageToast?.onUndo).toBeTypeOf("function");

    act(() => {
      damageToast?.onUndo?.();
    });

    // HP and the prior dying track both come back — a faithful inverse.
    expect(sess()?.hp.current).toBe(10);
    expect(sess()?.deathSucc).toBe(2);
    expect(sess()?.deathFail).toBe(1);
  });

  it("Death Ward: a lethal hit clamps to 1, ends the ward — and undo re-lights it", () => {
    // The ward is lit (the warded creature's sheet). A hit that would cross to 0
    // fires the store interrupt: HP clamps to 1, the ward toggle ends.
    seed({ current: 8, succ: 0, fail: 0, activeFeatures: ["spell-death-ward"] });
    const { result } = renderHook(() => useHpControls());

    applyDamage(result, "20");
    expect(sess()?.hp.current).toBe(1);
    expect(sess()?.activeFeatures).not.toContain("spell-death-ward");

    // The undo is a faithful inverse: HP restored AND the ward re-lit (un-spent).
    const damageToast = showToastMock.mock.calls
      .map((c) => c[0] as { onUndo?: () => void })
      .find((arg) => typeof arg.onUndo === "function");
    expect(damageToast?.onUndo).toBeTypeOf("function");

    act(() => {
      damageToast?.onUndo?.();
    });

    expect(sess()?.hp.current).toBe(8);
    expect(sess()?.activeFeatures).toContain("spell-death-ward");
  });
});

describe("useHpControls — RA-05 typed damage intake (the character's own defenses)", () => {
  it("a fire-resistant hit halves through the session-defense overlay (12 → 6)", () => {
    seed({ current: 38, succ: 0, fail: 0, sessionDefenses: { resistance: ["fire"] } });
    const { result } = renderHook(() => useHpControls());
    expect(result.current.defendedTypes).toEqual(["fire"]);
    act(() => {
      result.current.handleApplyDamage([{ amount: 12, type: "fire" }]);
    });
    expect(sess()?.hp.current).toBe(32);
  });

  it("an IMMUNE hit changes nothing and registers NO undo entry (a plain notice)", () => {
    seed({ current: 38, succ: 0, fail: 0, sessionDefenses: { immunity: ["poison"] } });
    const { result } = renderHook(() => useHpControls());
    act(() => {
      result.current.handleApplyDamage([{ amount: 12, type: "poison" }]);
    });
    expect(sess()?.hp.current).toBe(38);
    // The notice toast carries no onUndo (nothing changed → nothing to undo).
    const undoToast = showToastMock.mock.calls
      .map((c) => c[0] as { onUndo?: () => void })
      .find((arg) => typeof arg.onUndo === "function");
    expect(undoToast).toBeUndefined();
  });

  it("a multi-part hit (8 slashing resisted + 7 fire) applies the summed nets in ONE act", () => {
    seed({
      current: 38,
      succ: 0,
      fail: 0,
      sessionDefenses: { resistance: ["slashing"] },
    });
    const { result } = renderHook(() => useHpControls());
    act(() => {
      result.current.handleApplyDamage([
        { amount: 8, type: "slashing" },
        { amount: 7, type: "fire" },
      ]);
    });
    expect(sess()?.hp.current).toBe(27); // 38 − (4 + 7)
    // …and undo restores it in one gesture.
    const damageToast = showToastMock.mock.calls
      .map((c) => c[0] as { onUndo?: () => void })
      .find((arg) => typeof arg.onUndo === "function");
    act(() => damageToast?.onUndo?.());
    expect(sess()?.hp.current).toBe(38);
  });

  it("an untyped part passes verbatim even when defenses exist (override-first)", () => {
    seed({ current: 38, succ: 0, fail: 0, sessionDefenses: { resistance: ["fire"] } });
    const { result } = renderHook(() => useHpControls());
    act(() => {
      result.current.handleApplyDamage([{ amount: 12 }]);
    });
    expect(sess()?.hp.current).toBe(26);
  });
});

describe("useHpControls — RA-11 applyDeathSave (the entered d20)", () => {
  it("10+ marks one success", () => {
    seed({ current: 0, succ: 0, fail: 0 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(10));
    expect(sess()?.deathSucc).toBe(1);
    expect(sess()?.deathFail).toBe(0);
  });

  it("2–9 marks one failure", () => {
    seed({ current: 0, succ: 0, fail: 0 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(9));
    expect(sess()?.deathFail).toBe(1);
  });

  it("a natural 1 marks TWO failures", () => {
    seed({ current: 0, succ: 0, fail: 0 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(1));
    expect(sess()?.deathFail).toBe(2);
  });

  it("a natural 20 regains 1 HP, wakes (Unconscious shed), and resets the track", () => {
    seed({ current: 0, succ: 2, fail: 2, conditions: ["unconscious"] });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(20));
    expect(sess()?.hp.current).toBe(1);
    expect(sess()?.deathSucc).toBe(0);
    expect(sess()?.deathFail).toBe(0);
    expect(sess()?.conditions).not.toContain("unconscious");
  });

  it("the third success stabilises", () => {
    seed({ current: 0, succ: 2, fail: 0 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(15));
    expect(sess()?.deathSucc).toBe(3);
    expect(result.current.stable).toBe(true);
  });

  it("the third failure kills", () => {
    seed({ current: 0, succ: 0, fail: 2 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(3));
    expect(sess()?.deathFail).toBe(3);
    expect(result.current.dead).toBe(true);
  });

  it("no-ops above 0 HP (nothing to roll while up)", () => {
    seed({ current: 10, succ: 0, fail: 0 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(10));
    expect(sess()?.deathSucc).toBe(0);
  });

  it("no-ops once STABLE (no more saves are made)", () => {
    seed({ current: 0, succ: 3, fail: 0 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(3));
    expect(sess()?.deathFail).toBe(0);
  });

  it("no-ops once DEAD (a nat 20 cannot revive a corpse)", () => {
    seed({ current: 0, succ: 0, fail: 3 });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(20));
    expect(sess()?.hp.current).toBe(0);
    expect(sess()?.deathFail).toBe(3);
  });

  it("undo of a natural-20 revival restores 0 HP, the track, and Unconscious exactly", () => {
    seed({ current: 0, succ: 1, fail: 2, conditions: ["unconscious"] });
    const { result } = renderHook(() => useHpControls());
    act(() => result.current.applyDeathSave(20));
    expect(sess()?.hp.current).toBe(1);

    const toast = showToastMock.mock.calls
      .map((c) => c[0] as { onUndo?: () => void })
      .find((arg) => typeof arg.onUndo === "function");
    act(() => toast?.onUndo?.());
    expect(sess()?.hp.current).toBe(0);
    expect(sess()?.deathSucc).toBe(1);
    expect(sess()?.deathFail).toBe(2);
    expect(sess()?.conditions).toContain("unconscious");
  });
});
