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
 *
 * Waiting for the server means it can wait FOREVER — a table played on a train has no server to
 * hear from — so the wait is bounded and the failure is loud. It rejects rather than falling
 * back to the cache: the caller keeps the seat and says the write-back needs a connection, which
 * is honest, whereas a cached base would overwrite the document with stale numbers and say
 * nothing. Offline-first means the surface keeps working, not that a write invents its own base.
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

/** How long the write-back waits for the server before giving up and saying so. */
export const SERVER_READ_TIMEOUT_MS = 8_000;

/** Thrown when no server snapshot arrives in time — the caller keeps the seat. */
export class ServerReadTimeout extends Error {
  constructor() {
    super("combat-state: no server snapshot within the timeout");
    this.name = "ServerReadTimeout";
  }
}

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
  characterId: string,
  timeoutMs: number = SERVER_READ_TIMEOUT_MS
): Promise<CombatState | null> {
  return new Promise((resolve, reject) => {
    // A record, not two locals: the listener can answer SYNCHRONOUSLY, before `subscribe`
    // has returned its teardown, so "settled" and "how to close it" have to be readable from
    // both sides of that return without either shadowing the other.
    const listener: {
      stop: (() => void) | null;
      settled: boolean;
      timer: ReturnType<typeof setTimeout> | null;
    } = { stop: null, settled: false, timer: null };
    const finish = (run: () => void): void => {
      if (listener.settled) return;
      listener.settled = true;
      // On the record, not in a local: the listener can answer SYNCHRONOUSLY, before the
      // timer below has even been created.
      if (listener.timer !== null) clearTimeout(listener.timer);
      listener.stop?.();
      run();
    };
    listener.timer = setTimeout(
      () => finish(() => reject(new ServerReadTimeout())),
      timeoutMs
    );
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
