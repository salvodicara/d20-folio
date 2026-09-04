/**
 * Compaction of the shared encounter document — design §5.3.
 *
 * A Firestore document is capped at 1 MiB and an encounter log grows for as long as the table
 * plays, so at some point the head of the log has to become a folded state. That is all a
 * checkpoint is: `{ through, state }`, where `state` is the fold of every action up to and
 * including `through`, and the log keeps only what came after. `fold` already knows this
 * contract (it starts on `checkpoint.state` and skips actions at or before `checkpoint.through`),
 * so a compacted document folds to exactly the state the uncompacted one folds to.
 *
 * Compaction is destructive: an action swallowed by a checkpoint can no longer be undone, and a
 * client that has not folded it yet can no longer see it. Hence the grace window — the newest
 * `CHECKPOINT_GRACE_MS` of the log is never compacted, so a client that reconnects inside the
 * window still receives the raw actions. `checkpointThrough` picks the newest action outside the
 * window, and returns `null` when there is nothing safe to compact. The window's upper bound is
 * the caller's clock capped against the newest stamp, so one client with a skewed wall clock
 * cannot collapse it — see `checkpointThrough`.
 *
 * Undo is a LOG-level fact, not an action that resolves, so it does not respect the boundary the
 * way ordinary actions do: an `undo` may sit after `through` and target an action before it.
 * `compact` therefore folds the head together with EVERY undo in the log, not just the head's
 * own — see the note on `compact`. The residue is that redo across a checkpoint is impossible: an
 * undo-of-undo appended AFTER compaction cannot restore a target the checkpoint already skipped,
 * because that target is no longer in the log to re-apply. This is accepted; the grace window is
 * the knob that decides how long a table keeps the right to change its mind.
 *
 * This module is inside the pure combat kernel: no clock, no randomness, no Firebase. The caller
 * (`src/lib/combat-io.ts`) supplies the document and writes the result.
 */
import { encounterWriteData } from "./codec";
import { fold } from "./fold";
import { compareSeq, sortBySeq, type Seq } from "./ids";
import type { Catalogue } from "./catalogue";
import type { Action, Encounter } from "./types";

/** Compact past this many actions in the log. */
export const COMPACT_ACTIONS = 200;

/** …or past this many encoded bytes, well under Firestore's 1 MiB document ceiling. */
export const COMPACT_BYTES = 512 * 1024;

/** Never compact the newest five minutes of the log — see the grace window above. */
export const CHECKPOINT_GRACE_MS = 5 * 60_000;

const ENCODER = new TextEncoder();

/** The encoded size of the document as it is written, `unknown` keys included. */
export function encounterBytes(encounter: Encounter): number {
  return ENCODER.encode(JSON.stringify(encounterWriteData(encounter))).length;
}

/** Whether the document has outgrown either half of the budget. */
export function shouldCompact(encounter: Encounter): boolean {
  return (
    encounter.log.length > COMPACT_ACTIONS || encounterBytes(encounter) > COMPACT_BYTES
  );
}

/**
 * The seq to compact through: the newest action at least `graceMs` behind the window's upper
 * bound, and which sorts strictly after the current checkpoint. `null` when nothing qualifies —
 * an empty log, a log entirely inside the grace window, or a log whose old actions the current
 * checkpoint already covers.
 *
 * The bound is `min(newest.seq.ms, nowMs)`, NOT `newest.seq.ms` alone. `seq.ms` is stamped by
 * whichever client appended the action, so one member whose device runs fast pushes the newest
 * stamp into the future and collapses the window to nothing — and the next checkpoint then
 * swallows appends other clients have queued but not yet landed, which the fold skips forever.
 * `nowMs` is the compacting caller's own wall clock, and it is REQUIRED: this module is pure by
 * design (no clock of its own — the boundary guard greps for one), so the caller,
 * `src/lib/combat-io.ts`, must supply the reading rather than let a default hide the decision.
 */
export function checkpointThrough(
  encounter: Encounter,
  graceMs: number,
  nowMs: number
): Seq | null {
  const sorted = sortBySeq(encounter.log);
  const newest = sorted[sorted.length - 1];
  if (newest === undefined) return null;
  const cutoff = Math.min(newest.seq.ms, nowMs) - graceMs;
  const current = encounter.checkpoint?.through ?? null;
  let candidate: Seq | null = null;
  for (const action of sorted) {
    // `sortBySeq` orders by `ms` first, so once one action is inside the window, so is the rest.
    if (action.seq.ms > cutoff) break;
    if (current !== null && compareSeq(action.seq, current) <= 0) continue;
    candidate = action.seq;
  }
  return candidate;
}

/**
 * Fold the log up to and including `through` into a checkpoint, keeping only the actions after
 * it. The head is folded through `fold` itself — including the document's existing checkpoint —
 * so a second compaction stacks on the first rather than replaying from zero.
 *
 * The head is folded together with every `undo` in the WHOLE log, the tail's included. An undo
 * never changes state by itself (`fold` skips it and only reads it through `undoneIds`), so
 * adding the tail's undos to the head fold cannot apply anything extra — it can only negate a
 * head action an undo after the boundary targets, which is exactly the fact that would otherwise
 * be lost. A chain of undo-of-undo resolves for the same reason: both members are present, so
 * the undone undo stops counting.
 *
 * The tail is kept EXACTLY as it was, crossing undo included. On a later fold that undo targets
 * an id the log no longer holds, which is a harmless no-op: its effect is already baked into
 * `checkpoint.state`.
 */
export function compact(
  encounter: Encounter,
  catalogue: Catalogue,
  through: Seq
): Encounter {
  const head: Action[] = [];
  const tail: Action[] = [];
  for (const action of encounter.log) {
    if (compareSeq(action.seq, through) <= 0) head.push(action);
    else {
      tail.push(action);
      if (action.kind === "undo") head.push(action);
    }
  }
  const { state } = fold({ ...encounter, log: head }, catalogue);
  return { ...encounter, log: tail, checkpoint: { through, state } };
}
