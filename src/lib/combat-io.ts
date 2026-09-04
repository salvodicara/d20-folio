/**
 * The Firestore seam of the shared encounter — design §5.
 *
 * The reducer in `src/lib/combat` is pure; this is the only module that knows the encounter
 * lives in a document. It is deliberately thin: four verbs (create, append, subscribe,
 * checkpoint) plus a delete, and no state of its own beyond the monotonic seq clock.
 *
 * Two boundaries are load-bearing:
 *
 * 1. It imports from `firebase/firestore` and NEVER from `@/lib/firebase`. The app passes its
 *    own `Firestore` instance; the emulator suite passes an authenticated test context. The same
 *    code therefore runs, unmocked, in `tests/rules/encounter-io.emulator.test.ts`.
 * 2. Appending is `arrayUnion`, never a read-modify-write. Two players appending in the same
 *    round-trip both land: Firestore merges the union server-side, and the hybrid logical clock
 *    (`Seq`) — not arrival order — decides how the log folds. `arrayUnion` dedupes by deep
 *    equality, which is harmless here because every action carries a unique `id`.
 *
 * Compaction is the one operation that rewrites the document rather than growing it, so it runs
 * inside a transaction with an explicit compare-and-set on the stored checkpoint. Anything it
 * cannot prove — a missing document, one that no longer parses, a checkpoint that moved — comes
 * back as `"stale"` and writes nothing.
 */
import {
  arrayUnion,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { encounterWriteData, parseEncounter, type EncounterParse } from "./combat/codec";
import { compareSeq, sortBySeq, type Seq } from "./combat/ids";
import type { Action, Encounter } from "./combat/types";
import { stripUndefined } from "./strip-undefined";

/** The campaign-hosted encounter: `campaigns/{campaignId}/encounters/{encounterId}`. */
export function encounterRef(
  db: Firestore,
  campaignId: string,
  encounterId: string
): DocumentReference {
  return doc(db, "campaigns", campaignId, "encounters", encounterId);
}

/**
 * The solo-play encounter: `users/{uid}/characters/{characterId}/combat/state`.
 *
 * This path ALIASES a live document. Today's cockpit owns it as a `CombatState`
 * (`src/lib/combat-state-io.ts` writes exactly this path), so every existing character already
 * has one in the legacy shape. Writing an `Encounter` over it is the stage-6 cutover, and it
 * goes through the migration protocol (snapshot → dry-run → idempotent apply → verify), never
 * an opportunistic overwrite. A caller that reads the document and fails to parse it has found
 * a LEGACY document, not a missing one — see `leaveTable`'s `personal` contract in
 * `combat-lease.ts`.
 */
export function personalEncounterRef(
  db: Firestore,
  uid: string,
  characterId: string
): DocumentReference {
  return doc(db, "users", uid, "characters", characterId, "combat", "state");
}

/**
 * A monotonic `Seq` stamper for one client. The wall clock can run backwards (NTP, a sleeping
 * laptop), so the clock never emits a `ms` below the last one it emitted; within one millisecond
 * the counter increments. Two stamps from the same CLOCK are therefore always strictly ordered,
 * and `by` breaks the tie between users.
 *
 * `by` is the uid, not a session id, so one user on two devices runs two clocks and can emit an
 * identical `{ ms, counter, by }`. Those two stamps are not ordered by `Seq` at all: `sortBySeq`
 * is stable over the stored array, so they keep the stored order — the same on every client, so
 * the fold still converges. The guarantee is a total order over DISTINCT stamps, not that every
 * pair of stamps is strictly ordered.
 */
export function createSeqClock(by: string, now: () => number = Date.now): () => Seq {
  let last: Seq | null = null;
  return () => {
    const ms = last === null ? now() : Math.max(now(), last.ms);
    const counter = last !== null && last.ms === ms ? last.counter + 1 : 0;
    last = { ms, counter, by };
    return last;
  };
}

/** A fresh action id. Ids only need to be unique, never ordered — `Seq` does the ordering. */
export function newActionId(): string {
  return crypto.randomUUID();
}

/** Write a whole encounter document (the DM opening a table). */
export async function createEncounter(
  ref: DocumentReference,
  encounter: Encounter
): Promise<void> {
  await setDoc(ref, encounterWriteData(encounter));
}

/** Grow the log by one action. See the `arrayUnion` note in the module header. */
export async function appendAction(
  ref: DocumentReference,
  action: Action
): Promise<void> {
  await updateDoc(ref, { log: arrayUnion(stripUndefined(action)) });
}

export type EncounterSnapshot =
  | {
      readonly kind: "encounter";
      readonly encounter: Encounter;
      /** The local write is not acknowledged by the server yet (latency compensation). */
      readonly pending: boolean;
    }
  | { readonly kind: "missing" }
  | {
      readonly kind: "quarantined";
      readonly reason: Exclude<EncounterParse, { ok: true }>["reason"];
    }
  | { readonly kind: "error"; readonly error: Error };

/**
 * One listener per encounter document. `includeMetadataChanges` is required, not decorative: a
 * local append raises a snapshot with `hasPendingWrites: true` and then, once the server
 * acknowledges it, an otherwise identical snapshot with `false`. Without the flag the second
 * one never fires and the UI can never stop showing the action as in flight.
 *
 * The cost is that the APPENDING client sees the same encounter twice — once pending, once
 * acknowledged — with byte-identical content and only `pending` flipped, and the same happens on
 * cache/online transitions. A consumer must therefore treat `pending` as presentation state and
 * skip re-folding when nothing but `pending` changed; re-folding on every snapshot would double
 * the work of every local append for no new information.
 *
 * A document that does not parse is surfaced as `quarantined` rather than thrown: a future
 * build's schema must never crash this one, and it must never be silently overwritten either.
 */
export function subscribeEncounter(
  ref: DocumentReference,
  listener: (snapshot: EncounterSnapshot) => void
): () => void {
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!snapshot.exists()) {
        listener({ kind: "missing" });
        return;
      }
      const parsed = parseEncounter(snapshot.data());
      if (!parsed.ok) {
        listener({ kind: "quarantined", reason: parsed.reason });
        return;
      }
      listener({
        kind: "encounter",
        encounter: parsed.encounter,
        pending: snapshot.metadata.hasPendingWrites,
      });
    },
    (error: Error) => listener({ kind: "error", error })
  );
}

/**
 * Replace the document with a compacted one, but only if the stored checkpoint is still the one
 * the caller folded on (`expectedThrough`, `null` when the document has no checkpoint yet).
 *
 * The written log is `next.log` plus every stored action after the new checkpoint that `next`
 * does not already carry, matched by id: an append that landed between the caller's fold and the
 * transaction is preserved instead of being erased by the rewrite. Actions at or before the new
 * checkpoint are already folded into `next.checkpoint.state`, so they are dropped on purpose —
 * INCLUDING one the caller never saw, which the rewrite therefore discards without folding it in.
 * That is deliberate and matches `fold`, which skips anything at or before `checkpoint.through`
 * whether or not it contributed to the state: a checkpoint declares the past closed. The grace
 * window is what keeps that horizon far enough behind the newest append for it not to bite.
 *
 * Top-level keys this build does not understand (`Encounter.unknown`) are merged rather than
 * overwritten, with the STORED value winning: a newer build may have added a key between the
 * caller's fold and this transaction, and compaction must never be the thing that drops it.
 *
 * Firestore re-runs a contended transaction callback. That is safe here because the callback
 * derives EVERYTHING it writes from the read it just made — it keeps no state across attempts —
 * so a retry simply re-decides `written` or `stale` against the newer document.
 */
export async function checkpointEncounter(
  db: Firestore,
  ref: DocumentReference,
  next: Encounter,
  expectedThrough: Seq | null
): Promise<"written" | "stale"> {
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return "stale";
    const parsed = parseEncounter(snapshot.data());
    // A quarantined document is never rewritten: we cannot prove what we would be discarding.
    if (!parsed.ok) return "stale";
    const storedThrough = parsed.encounter.checkpoint?.through ?? null;
    const matches =
      storedThrough === null || expectedThrough === null
        ? storedThrough === expectedThrough
        : compareSeq(storedThrough, expectedThrough) === 0;
    if (!matches) return "stale";

    const through = next.checkpoint?.through ?? null;
    const known = new Set(next.log.map((action) => action.id));
    const raced = parsed.encounter.log.filter(
      (action) =>
        !known.has(action.id) && (through === null || compareSeq(action.seq, through) > 0)
    );
    const log = raced.length === 0 ? next.log : sortBySeq([...next.log, ...raced]);
    const unknown = { ...next.unknown, ...parsed.encounter.unknown };
    const merged: Encounter =
      Object.keys(unknown).length === 0 ? { ...next, log } : { ...next, log, unknown };
    transaction.set(ref, encounterWriteData(merged));
    return "written";
  });
}

/** Remove the encounter document (the DM closing a table). */
export async function deleteEncounter(ref: DocumentReference): Promise<void> {
  await deleteDoc(ref);
}
