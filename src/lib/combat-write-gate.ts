/**
 * The `combat/state` writer sends a play state only when it differs from what the
 * server holds or is about to hold: the last state this sheet received, or the last
 * one it sent.
 *
 * Why: the store persists the play state whenever the session object changes, and a
 * session is often rebuilt with the same content (a cast rebuilds it several times).
 * Each such write is a billed ~25 KB Firestore write, and an echoed snapshot that
 * rebuilt the session sent the same state straight back (rehearsal 2026-11-06:
 * ~16 identical writes in a few seconds with the cast dialog open). Comparing by
 * content stops both, whatever rebuilt the session.
 */
import { canonicalJson } from "@/lib/canonical-fingerprint";
import type { CombatState } from "@/types/combat-state";

/**
 * What to do with a state the store asks to persist:
 *  - `send`: it differs from what the server holds or is about to hold;
 *  - `held`: the server already holds it (the caller settles it as written);
 *  - `in-flight`: a write of the same state is on its way (its answer settles it).
 */
export type CombatWriteVerdict = "send" | "held" | "in-flight";

export interface CombatWriteGate {
  /** The state the server holds now (a snapshot arrived, or a write was acknowledged). */
  observe(state: CombatState): void;
  /** The verdict for `state`; a `send` counts as in flight from now on. */
  admit(state: CombatState): CombatWriteVerdict;
  /** The server's state is unknown again (a write failed): the next state is sent. */
  forget(): void;
}

export function createCombatWriteGate(): CombatWriteGate {
  let last: { json: string; confirmed: boolean } | null = null;
  return {
    observe(state) {
      last = { json: canonicalJson(state), confirmed: true };
    },
    admit(state) {
      const json = canonicalJson(state);
      if (last?.json === json) return last.confirmed ? "held" : "in-flight";
      last = { json, confirmed: false };
      return "send";
    },
    forget() {
      last = null;
    },
  };
}
