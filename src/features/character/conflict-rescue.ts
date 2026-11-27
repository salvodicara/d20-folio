/**
 * A build save the rules refused as a revision conflict (#1403): another device saved
 * first, typically while this one was offline. The refused edit is kept as a
 * build-only rescue copy and offered back by the rescue strip (Apply / Discard),
 * instead of being dropped with only a notice.
 *
 * `permission-denied` alone proves nothing (signed out, a sheet that is gone). The
 * proof is a server-confirmed sheet, in a shape this client knows, at or past the
 * refused generation: someone else stored it. The sheet hook calls `snapshot` only
 * for such sheets (a newer shape goes to the shape gate instead).
 *
 * Saves queued offline leave one after another, each a whole envelope of the sheet as
 * it was when it left. So a save sent after a refused one, but before the refusal
 * came back, carries the refused edit too ("a carrier"):
 * - when several are refused, the newest refused one is the copy;
 * - when a carrier lands, the edit is saved: nothing is kept (or the copy is dropped).
 * The decision waits for a sheet with no queued writes, so the queue has drained.
 *
 * One notice per refusal: «kept» once the copy is on the device, «not saved» when
 * nothing could be kept (no proof, a copy already there, storage refused).
 */
import type { CharacterDoc } from "@/types/character";

export type ConflictNotice = "kept" | "not-saved";

export interface ConflictRescueEnv {
  /** Keep the refused sheet as a build-only rescue copy. Resolves with the copy's
   *  `savedAt`, or null when a copy is already there or storage refused it. */
  keep(payload: CharacterDoc): Promise<number | null>;
  /** Drop the copy this rescue kept (identified by its `savedAt`). */
  drop(savedAt: number): void;
  notify(notice: ConflictNotice): void;
}

export interface ConflictRescue {
  /** A build save left. */
  sent(payload: CharacterDoc): void;
  /** A build save was acknowledged. */
  landed(payload: CharacterDoc): void;
  /** A build save was refused by the rules (`permission-denied`). */
  refused(payload: CharacterDoc): void;
  /** A parent snapshot in a known shape (`doc` null: the sheet is gone). */
  snapshot(doc: CharacterDoc | null, hasPendingWrites: boolean): void;
  /** The parent listener failed: the sheet can no longer be read. */
  listenerFailed(): void;
}

interface Refusal {
  payload: CharacterDoc;
  /** Its place in the send order. */
  seq: number;
  /** The last save sent when it came back: saves in (seq, carriedUpTo] carry it. */
  carriedUpTo: number;
}

export function createConflictRescue(env: ConflictRescueEnv): ConflictRescue {
  const order = new WeakMap<CharacterDoc, number>();
  let lastSent = 0;
  const landedSeqs: number[] = [];
  let candidate: Refusal | null = null;
  let own: (Refusal & { savedAt: number }) | null = null;
  let lastPending = true;
  let lastServerRevision: number | null | undefined;

  const carries = (refusal: Refusal, seq: number): boolean =>
    seq > refusal.seq && seq <= refusal.carriedUpTo;

  const decide = (serverRevision: number | null): void => {
    const refusal = candidate;
    if (!refusal) return;
    candidate = null;
    if (serverRevision === null || serverRevision < refusal.payload.revision) {
      env.notify("not-saved");
      return;
    }
    env.keep(refusal.payload).then(
      (savedAt) => {
        if (savedAt === null) {
          env.notify("not-saved");
          return;
        }
        // A carrier landed while the copy was written: the edit is saved after all.
        if (landedSeqs.some((seq) => carries(refusal, seq))) {
          env.drop(savedAt);
          return;
        }
        own = { ...refusal, savedAt };
        env.notify("kept");
      },
      () => env.notify("not-saved")
    );
  };

  return {
    sent(payload) {
      order.set(payload, ++lastSent);
    },
    landed(payload) {
      const seq = order.get(payload);
      if (seq === undefined) return;
      landedSeqs.push(seq);
      if (candidate && carries(candidate, seq)) candidate = null;
      if (own && carries(own, seq)) {
        env.drop(own.savedAt);
        own = null;
      }
    },
    refused(payload) {
      const seq = order.get(payload) ?? lastSent;
      if (!candidate || seq > candidate.seq)
        candidate = { payload, seq, carriedUpTo: lastSent };
      // The server's sheet may have arrived first, with the queue already drained.
      if (
        !lastPending &&
        typeof lastServerRevision === "number" &&
        lastServerRevision >= payload.revision
      )
        decide(lastServerRevision);
    },
    snapshot(doc, hasPendingWrites) {
      lastPending = hasPendingWrites;
      if (hasPendingWrites) return;
      lastServerRevision = doc ? doc.revision : null;
      decide(lastServerRevision);
    },
    listenerFailed() {
      if (!candidate) return;
      candidate = null;
      env.notify("not-saved");
    },
  };
}
