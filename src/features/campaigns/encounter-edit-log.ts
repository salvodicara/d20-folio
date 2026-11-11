/**
 * The DM's encounter edit log: the fight edits made on this device that the server has
 * not confirmed yet, kept as the same pure reducers the screen applies (hide, reveal,
 * a monster's Hit Points…). Pure; `encounter-edit-sync.ts` wires it to the store and
 * Firestore.
 *
 * - The screen shows the log replayed over the newest server fight, so a snapshot that
 *   lands between two edits (a player's roll) never hides or loses an edit.
 * - A send takes every waiting edit as one batch and replays it onto the server's
 *   newest fight inside a transaction, so a concurrent change (a player passing the
 *   turn, another device's move) is kept rather than overwritten.
 * - While a batch is out, snapshots wait: the server's echo of the write must not be
 *   shown with the batch replayed over it a second time.
 */
import { canonicalJsonEquals } from "@/lib/character-snapshot-reconciler";
import type { EncounterState } from "@/types/campaign";

/** One edit: a pure reducer, bound to the fight it was made in. */
export interface EncounterEdit {
  epoch: number;
  apply: (fight: EncounterState) => EncounterState;
}

export interface EncounterEditLog {
  /** The newest fight the server is known to hold (`null`: no fight). */
  server: EncounterState | null;
  /** Edits waiting to be sent, oldest first. */
  waiting: readonly EncounterEdit[];
  /** The batch being written now, or `null`. */
  sending: readonly EncounterEdit[] | null;
  /** The newest snapshot that landed while the batch was out. */
  arrived?: { fight: EncounterState | null };
}

export function openEditLog(server: EncounterState | null): EncounterEditLog {
  return { server, waiting: [], sending: null };
}

/** The edits replayed in order onto a fight; an edit from another fight is skipped. */
export function replayEdits(
  fight: EncounterState | null,
  edits: readonly EncounterEdit[]
): EncounterState | null {
  let out = fight;
  for (const edit of edits) {
    if (out && out.epoch === edit.epoch) out = edit.apply(out);
  }
  return out;
}

/** What the screen shows: every unconfirmed edit over the server's fight. */
export function shownFight(log: EncounterEditLog): EncounterState | null {
  return replayEdits(log.server, [...(log.sending ?? []), ...log.waiting]);
}

export function logEdit(log: EncounterEditLog, edit: EncounterEdit): EncounterEditLog {
  return { ...log, waiting: [...log.waiting, edit] };
}

/** A server snapshot of the fight. During a send it waits for the send to end. */
export function logSnapshot(
  log: EncounterEditLog,
  fight: EncounterState | null
): EncounterEditLog {
  if (log.sending) return { ...log, arrived: { fight } };
  return { ...log, server: fight };
}

/** Take every waiting edit as one batch; `null` when nothing waits or a send is out. */
export function beginSend(
  log: EncounterEditLog
): { log: EncounterEditLog; batch: readonly EncounterEdit[] } | null {
  if (log.sending || log.waiting.length === 0) return null;
  const batch = log.waiting;
  return { log: { server: log.server, waiting: [], sending: batch }, batch };
}

/**
 * The batch is on the server as `written`. A snapshot that arrived meanwhile and equals
 * it is the write's own echo; a different one may be older or newer than the write, so
 * the caller reads the server once more (`recheck`).
 */
export function sendDone(
  log: EncounterEditLog,
  written: EncounterState | null
): { log: EncounterEditLog; recheck: boolean } {
  const arrived = log.arrived;
  const echo = arrived !== undefined && canonicalJsonEquals(arrived.fight, written);
  return {
    log: { server: written, waiting: log.waiting, sending: null },
    recheck: arrived !== undefined && !echo,
  };
}

/** The batch could not be written at all: it is dropped, and the server's fight shown. */
export function sendFailed(log: EncounterEditLog): EncounterEditLog {
  return {
    server: log.arrived ? log.arrived.fight : log.server,
    waiting: log.waiting,
    sending: null,
  };
}
