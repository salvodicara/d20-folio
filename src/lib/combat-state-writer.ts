/**
 * The sheet's `combat/state` writer: what the store asks to persist reaches Firestore
 * at most once per change.
 *
 *  - A synchronous command (a cast: HP, resources, Concentration, the log) asks
 *    several times; the asks of one tick are coalesced into one (a microtask).
 *  - A state the server already holds, or one already on its way, is not sent again
 *    (`combat-write-gate`): a session rebuilt with the same content, or the projected
 *    campaign clock re-set after a snapshot dropped it, used to send the same ~25 KB
 *    back each time (rehearsal 2026-11-06: ~16 billed writes in a few seconds).
 *
 * The reconciler marks the state pending before it leaves, so a parent snapshot landing
 * meanwhile republishes this play state, not the stored one; the answer settles it, and
 * a failure drops it and lets the caller republish what the server holds.
 */
import { createCombatWriteGate } from "@/lib/combat-write-gate";
import type { CombatState } from "@/types/combat-state";

export interface CombatStateWriter {
  /** Persist `state` (coalesced with the other asks of this tick). */
  write(state: CombatState): void;
  /** The server's snapshot arrived: it holds `state`. */
  observe(state: CombatState): void;
  /** Stop writing (the sheet closed or was quarantined); a queued ask is dropped. */
  stop(): void;
}

export function createCombatStateWriter(deps: {
  send: (state: CombatState) => Promise<void>;
  reconciler: {
    markChildPending: (state: CombatState) => void;
    acknowledgeChildWrite: (state: CombatState) => void;
    rejectChildWrite: (state: CombatState) => void;
  };
  onRejected: (error: unknown) => void;
}): CombatStateWriter {
  const gate = createCombatWriteGate();
  const { reconciler } = deps;
  let enabled = true;
  let queued: CombatState | null = null;

  const flush = (state: CombatState): void => {
    const verdict = gate.admit(state);
    // Already on the server: settle it as written. On its way: its answer settles it.
    if (verdict === "held") reconciler.acknowledgeChildWrite(state);
    if (verdict !== "send") return;
    void deps.send(state).then(
      () => {
        gate.observe(state);
        reconciler.acknowledgeChildWrite(state);
      },
      (error: unknown) => {
        gate.forget();
        reconciler.rejectChildWrite(state);
        deps.onRejected(error);
      }
    );
  };

  return {
    write(state) {
      if (!enabled) return;
      // The edit is pending now, including the window before its queued send.
      reconciler.markChildPending(state);
      const first = queued === null;
      queued = state;
      if (!first) return;
      queueMicrotask(() => {
        const next = queued;
        queued = null;
        if (next && enabled) flush(next);
      });
    },
    observe(state) {
      gate.observe(state);
    },
    stop() {
      enabled = false;
      queued = null;
    },
  };
}
