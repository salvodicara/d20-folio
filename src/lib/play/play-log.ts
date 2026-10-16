/**
 * The play log as the record (re-foundation phase 3a, docs/architecture/play-log.md).
 * A character's play state is the fold of its entries over a checkpoint: each entry
 * is a sheet event, or an undo, redo or correction of an earlier entry. Pure: no
 * store, no persistence, no wiring yet.
 */
import type { CharacterDoc } from "@/types/character";
import { applySheetEvent, type SheetEvent } from "./sheet-events";

interface EntryHeader {
  /** Unique and stable across devices. */
  id: string;
  /** The order the entries fold in. */
  seq: number;
  /** Who wrote it (a uid, or a role while that is all the caller knows). */
  actor: string;
}

/** One line of a character's play log. */
export type PlayLogEntry = EntryHeader &
  (
    | { event: SheetEvent }
    | { undo: string }
    | { redo: string }
    | { correct: string; event: SheetEvent }
  );

/** An entry that still counts after undos, redos and corrections, with its final event. */
export interface EffectiveEvent {
  id: string;
  seq: number;
  event: SheetEvent;
}

/**
 * The events that still count, in `seq` order: an undo takes its target out, a redo
 * puts it back, a correction swaps its event. A meta entry whose target is unknown
 * (or is itself a meta entry) changes nothing.
 */
export function effectiveEvents(entries: readonly PlayLogEntry[]): EffectiveEvent[] {
  const ordered = [...entries].sort((a, b) => a.seq - b.seq);
  const events = new Map<string, EffectiveEvent>();
  const undone = new Set<string>();
  for (const entry of ordered) {
    if ("undo" in entry) {
      if (events.has(entry.undo)) undone.add(entry.undo);
    } else if ("redo" in entry) {
      undone.delete(entry.redo);
    } else if ("correct" in entry) {
      const target = events.get(entry.correct);
      if (target) events.set(entry.correct, { ...target, event: entry.event });
    } else {
      events.set(entry.id, { id: entry.id, seq: entry.seq, event: entry.event });
    }
  }
  return [...events.values()].filter((event) => !undone.has(event.id));
}

/**
 * The character after its log: the effective events replayed in order from the
 * checkpoint through the sheet transitions. An event that changes nothing is skipped.
 * The checkpoint is never modified.
 */
export function foldPlayLog(
  checkpoint: CharacterDoc,
  entries: readonly PlayLogEntry[]
): CharacterDoc {
  let doc = checkpoint;
  for (const { event } of effectiveEvents(entries)) {
    doc = applySheetEvent(doc, event) ?? doc;
  }
  return doc;
}
