/**
 * The fold: the encounter log, sorted by the hybrid logical clock, reduced by `resolve`.
 *
 * Undo is a log-level fact: an undone action is skipped, and anything that depended on it
 * (an intent answering a window it opened) is recorded as rejected rather than silently
 * dropped. Every client with the same set of actions computes the same state and the same
 * rejections.
 */
import type { Catalogue } from "./catalogue";
import { compareSeq, sortBySeq, type ActionId } from "./ids";
import { resolve } from "./resolve";
import type { Action, Encounter, FoldedState, Rejection } from "./types";

export interface FoldResult {
  readonly state: FoldedState;
  readonly rejections: readonly {
    readonly action: ActionId;
    readonly rejection: Rejection;
  }[];
  readonly applied: number;
}

export function initialState(): FoldedState {
  return {
    epoch: 0,
    clock: {
      phase: "idle",
      round: 0,
      order: [],
      current: null,
      initiative: {},
      restOrdinal: 0,
      dayPhaseOrdinal: 0,
    },
    entities: {},
    relations: [],
    effects: {},
    windows: [],
    checks: [],
    declared: {},
    rolls: {},
    spent: {},
    nextOrdinal: 1,
    revision: 0,
    settings: { revealMonsterHp: false },
  };
}

/** Ids undone by a live (not itself undone) undo action. */
function undoneIds(log: readonly Action[]): Set<ActionId> {
  const undos = log.filter(
    (a): a is Extract<Action, { kind: "undo" }> => a.kind === "undo"
  );
  const undoneUndos = new Set(
    undos.filter((u) => undos.some((o) => o.of === u.id)).map((u) => u.id)
  );
  return new Set(undos.filter((u) => !undoneUndos.has(u.id)).map((u) => u.of));
}

/** `start` is the state to fold on top of: `initialState()` for a fresh encounter, or a
 *  checkpoint's folded state for compaction (design doc §5.3). */
export function fold(
  encounter: Encounter,
  catalogue: Catalogue,
  start: FoldedState = initialState()
): FoldResult {
  const from = encounter.checkpoint;
  let state = from ? from.state : start;
  const skip = undoneIds(encounter.log);
  const rejections: { action: ActionId; rejection: Rejection }[] = [];
  let applied = 0;
  for (const action of sortBySeq(encounter.log)) {
    if (from && compareSeq(action.seq, from.through) <= 0) continue;
    if (action.kind === "undo" || skip.has(action.id)) continue;
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") {
      rejections.push({ action: action.id, rejection: result.rejection });
      continue;
    }
    state = result.state;
    applied += 1;
  }
  return { state, rejections, applied };
}
