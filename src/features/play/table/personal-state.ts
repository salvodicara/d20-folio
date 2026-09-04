/**
 * Reading the personal `combat/state` for a write-back (stage 6 design §5).
 *
 * `leaveTable` overwrites that document WHOLE — the encoder's own header says so — so the state
 * it is projected onto has to be what the SERVER holds, not what this client happens to have in
 * its offline cache. Firestore's first delivery on a fresh listener is normally the cache: it is
 * exactly right for painting a screen and exactly wrong here, because standing up from the table
 * would then overwrite the live document with a base that predates whatever the sheet wrote in
 * between, and silently lose it.
 *
 * So this resolves on the first snapshot that is BOTH server-confirmed (`fromCache === false`)
 * and free of local echoes (`hasPendingWrites === false`), and on nothing else. The subscription
 * is injected rather than imported so the rule can be driven by a fake in a test — the whole
 * point of the module is a race nobody can reproduce by hand.
 */
import type { CombatState } from "@/types/combat-state";
import type { CombatStateMeta } from "@/lib/combat-state-io";

/** The shape of `subscribeCombatState`, as a parameter. */
export type SubscribeCombatState = (
  uid: string,
  characterId: string,
  cb: (state: CombatState | null, meta: CombatStateMeta) => void,
  onError?: (error: Error) => void
) => () => void;

/** True only for a snapshot the server has confirmed and no local write is still riding. */
export function isServerConfirmed(meta: CombatStateMeta): boolean {
  return !meta.fromCache && !meta.hasPendingWrites;
}

/**
 * The live document as the server holds it, read once.
 *
 * Rejects on a listener error (a rules denial, an unparseable document) rather than resolving
 * with a guess: a write-back that cannot read its own base must not happen at all.
 */
export function readServerCombatState(
  subscribe: SubscribeCombatState,
  uid: string,
  characterId: string
): Promise<CombatState | null> {
  return new Promise((resolve, reject) => {
    // A record, not two locals: the listener can answer SYNCHRONOUSLY, before `subscribe`
    // has returned its teardown, so "settled" and "how to close it" have to be readable from
    // both sides of that return without either shadowing the other.
    const listener: { stop: (() => void) | null; settled: boolean } = {
      stop: null,
      settled: false,
    };
    const finish = (run: () => void): void => {
      if (listener.settled) return;
      listener.settled = true;
      listener.stop?.();
      run();
    };
    listener.stop = subscribe(
      uid,
      characterId,
      (state, meta) => {
        if (!isServerConfirmed(meta)) return; // a cached echo: keep waiting for the server
        finish(() => resolve(state));
      },
      (error) => finish(() => reject(error))
    );
    if (listener.settled) listener.stop();
  });
}
