/**
 * Shadow mode for the play log (phase 3a step 2, docs/architecture/play-log.md). Next
 * to every sheet event the store applies, it appends a log entry and checks parity:
 * the fold of the log must equal the live character. It changes nothing the player
 * sees; it measures. A write that bypassed the log starts a new checkpoint (counted),
 * and an undo is recorded as an entry, so a disagreement between today's snapshot
 * undo and the log's replay shows up as a mismatch instead of staying hidden.
 */
import type { CharacterDoc } from "@/types/character";
import { foldPlayLog, type PlayLogEntry } from "./play-log";
import type { SheetEvent } from "./sheet-events";

export interface ShadowResult {
  /** The entry this call appended. */
  id: string;
  /** Whether the fold of the log equals the live character after it. */
  parity: boolean;
}

export interface ShadowStats {
  entries: number;
  checkpoints: number;
  mismatches: number;
}

export interface PlayLogShadow {
  /** Record an applied event: `before` and `after` are the live character around it. */
  record(before: CharacterDoc, event: SheetEvent, after: CharacterDoc): ShadowResult;
  /** Record the undo of an earlier entry; `after` is the live character it restored. */
  undo(target: string, after: CharacterDoc): ShadowResult;
  /**
   * Undo through the log (phase 3a step 4): when the log reproduces `live`, record the
   * undo of `target` and return the fold without it, so only that event goes and every
   * later one stays. Null, recording nothing, when it does not (a write went around the
   * log): the caller then falls back to its snapshot.
   */
  undoFrom(live: CharacterDoc, target: string): CharacterDoc | null;
  stats(): ShadowStats;
}

/** The play state the log records: the session log's narrative lines are written
 *  next to it by the store, and will be derived from the log, so they do not count. */
const playState = (doc: CharacterDoc): string =>
  JSON.stringify({ ...doc, session: { ...doc.session, logEntries: [] } });

const same = (a: CharacterDoc, b: CharacterDoc): boolean => playState(a) === playState(b);

export function createPlayLogShadow(
  actor: string,
  options: { maxEntries?: number } = {}
): PlayLogShadow {
  const maxEntries = options.maxEntries ?? 50;
  let checkpoint: CharacterDoc | null = null;
  let entries: PlayLogEntry[] = [];
  let seq = 0;
  let checkpoints = 0;
  let mismatches = 0;

  const restart = (doc: CharacterDoc): void => {
    checkpoint = doc;
    entries = [];
    checkpoints++;
  };

  const check = (id: string, after: CharacterDoc): ShadowResult => {
    const parity = checkpoint !== null && same(foldPlayLog(checkpoint, entries), after);
    if (!parity) {
      mismatches++;
      // Parity is measured per step: carry on from the live character.
      restart(after);
    }
    return { id, parity };
  };

  return {
    record(before, event, after) {
      if (
        checkpoint === null ||
        entries.length >= maxEntries ||
        !same(foldPlayLog(checkpoint, entries), before)
      ) {
        restart(before);
      }
      const id = `shadow-${++seq}`;
      entries.push({ id, seq, actor, event });
      return check(id, after);
    },
    undo(target, after) {
      const id = `shadow-${++seq}`;
      entries.push({ id, seq, actor, undo: target });
      return check(id, after);
    },
    undoFrom(live, target) {
      if (checkpoint === null || !same(foldPlayLog(checkpoint, entries), live))
        return null;
      const id = `shadow-${++seq}`;
      entries.push({ id, seq, actor, undo: target });
      return foldPlayLog(checkpoint, entries);
    },
    stats: () => ({ entries: entries.length, checkpoints, mismatches }),
  };
}
