/**
 * The play log's storage (phase 3a step 5, docs/architecture/play-log.md): one document
 * per entry at `users/{uid}/characters/{charId}/playLog/{entryId}`, stamped with the
 * server's time. Read back in server order (then id) and numbered, so `seq` is never
 * stored and two devices can never disagree on it; device clocks are not trusted.
 *
 * The writer is OFF (`PLAY_LOG_WRITER_ENABLED`): nothing in the app writes here yet.
 * Each entry would add one write per sheet action, on top of the play state's own, so
 * it is turned on only after a game day's real write count, doubled, stays well inside
 * the free tier (owner decision, 2026-10-16).
 */

import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Firestore,
} from "firebase/firestore";

import type { PlayLogEntry } from "./play-log";
import type { SheetEvent } from "./sheet-events";

/** Off until the owner turns it on, after measuring a game day's writes. */
export const PLAY_LOG_WRITER_ENABLED = false;

/** The stored shape of an entry: everything but `seq` (the read order gives it), plus
 *  the server's time. */
export function playLogEntryDoc(entry: PlayLogEntry): Record<string, unknown> {
  const { seq: _seq, ...stored } = entry;
  void _seq;
  return { ...stored, serverAt: serverTimestamp() };
}

/** An entry without its `seq`, variant by variant (a plain `Omit` would merge them). */
type WithoutSeq<E> = E extends PlayLogEntry ? Omit<E, "seq"> : never;
type Unsequenced = WithoutSeq<PlayLogEntry>;

/** A stored document back into an entry (without its `seq`), or null when it lacks
 *  the shape the fold relies on: the log is shared input, so it is read defensively. */
function storedEntry(data: Record<string, unknown>): Unsequenced | null {
  const { id, actor } = data;
  if (typeof id !== "string" || typeof actor !== "string") return null;
  const isMap = (value: unknown): boolean => typeof value === "object" && value !== null;
  if (typeof data.undo === "string") return { id, actor, undo: data.undo };
  if (typeof data.redo === "string") return { id, actor, redo: data.redo };
  if (typeof data.correct === "string" && isMap(data.event))
    return {
      id,
      actor,
      correct: data.correct,
      event: data.event as SheetEvent,
    };
  if (isMap(data.event)) return { id, actor, event: data.event as SheetEvent };
  return null;
}

export interface PlayLogStore {
  append(entry: PlayLogEntry): Promise<void>;
  /** Every entry, in server order, numbered from 0. */
  load(): Promise<PlayLogEntry[]>;
}

export function createFirestorePlayLogStore(
  db: Firestore,
  uid: string,
  characterId: string
): PlayLogStore {
  const entries = collection(db, "users", uid, "characters", characterId, "playLog");
  return {
    async append(entry) {
      await setDoc(doc(entries, entry.id), playLogEntryDoc(entry));
    },
    async load() {
      const snap = await getDocs(entries);
      return snap.docs
        .map((d) => {
          const data = d.data({ serverTimestamps: "estimate" });
          const at =
            data.serverAt instanceof Timestamp ? data.serverAt.toMillis() : Infinity;
          return { at, id: d.id, entry: storedEntry(data) };
        })
        .filter((row) => row.entry !== null)
        .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((row, seq) => ({ ...row.entry, seq }) as PlayLogEntry);
    },
  };
}
