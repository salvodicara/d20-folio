/**
 * REMOTE-CHANGE FENCE (§5.4 case 9) — the own-sheet undo stack must NOT let a
 * snapshot-leg reverse-applier (prev-HP) clobber a same-character SERVER write from
 * another device / god-mode. The subscription composes `!hasPendingWrites` (a genuine
 * server update, not our own optimistic echo) with `combatTrioDiffers` (the incoming
 * combat subdoc materially differs from the live trio) to decide whether to `clear()`
 * the stack.
 *
 * `combatTrioDiffers` is the load-bearing comparison; it lives in the firebase-free
 * `lib/combat-state` so the fence decision is testable without mounting the hook. This
 * pins the comparison + the composed clear decision (CI-pure — no firebase).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { combatTrioDiffers } from "@/lib/combat-state";
import { useUndoStore } from "@/stores/undoStore";
import type { CombatState } from "@/types/combat-state";

const combat: CombatState = {
  hp: { current: 17, temp: 0 },
  conditions: ["poisoned"],
  initiativeRoll: null,
  deathSaves: { successes: 0, failures: 1 },
  round: 1,
};

const liveTrio = {
  hp: { current: 17, temp: 0 },
  deathSucc: 0,
  deathFail: 1,
  conditions: ["poisoned"],
};

/** The subscription's composed fence decision (verbatim shape from the hook). */
function shouldClear(hasPendingWrites: boolean, differs: boolean): boolean {
  return !hasPendingWrites && differs;
}

describe("combatTrioDiffers — the remote-fence comparison", () => {
  it("is false when the incoming snapshot matches the live trio (a server confirm)", () => {
    expect(combatTrioDiffers(liveTrio, combat)).toBe(false);
  });

  it("is true when HP differs", () => {
    expect(combatTrioDiffers({ ...liveTrio, hp: { current: 10, temp: 0 } }, combat)).toBe(
      true
    );
  });

  it("is true when temp HP / death saves / conditions differ", () => {
    expect(combatTrioDiffers({ ...liveTrio, hp: { current: 17, temp: 5 } }, combat)).toBe(
      true
    );
    expect(combatTrioDiffers({ ...liveTrio, deathFail: 2 }, combat)).toBe(true);
    expect(combatTrioDiffers({ ...liveTrio, conditions: [] }, combat)).toBe(true);
  });
});

describe("remote fence — composed clear decision drops the stack", () => {
  beforeEach(() => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  it("a server update (no pending writes) that materially differs clears the stack", () => {
    useUndoStore.getState().register({
      label: { message: "prev-HP" },
      turnScoped: false,
      undo: () => {},
      redo: () => null,
    });
    expect(useUndoStore.getState().past).toHaveLength(1);

    const differs = combatTrioDiffers(
      { ...liveTrio, hp: { current: 3, temp: 0 } },
      combat
    );
    if (shouldClear(false, differs)) useUndoStore.getState().clear();

    expect(useUndoStore.getState().past).toHaveLength(0);
  });

  it("our OWN optimistic echo (hasPendingWrites) never clears the stack", () => {
    useUndoStore.getState().register({
      label: { message: "prev-HP" },
      turnScoped: false,
      undo: () => {},
      redo: () => null,
    });
    // Even a materially-different snapshot is skipped while it carries pending writes.
    const differs = combatTrioDiffers(
      { ...liveTrio, hp: { current: 3, temp: 0 } },
      combat
    );
    if (shouldClear(true, differs)) useUndoStore.getState().clear();

    expect(useUndoStore.getState().past).toHaveLength(1);
  });
});
