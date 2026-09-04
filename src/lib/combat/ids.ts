/**
 * Identity and ordering primitives of the combat engine.
 *
 * `Seq` is a hybrid logical clock stamped by the client that appends an action: physical
 * milliseconds, a per-client counter for same-millisecond appends, and the author uid as the
 * final tie-break. It is a total order over DISTINCT stamps, and that order is what every
 * client folds the encounter log in, so two clients holding the same set of actions always
 * fold to the same state regardless of the order the actions arrived in.
 *
 * The tie-break is the uid, not a session id, so two devices signed in as the SAME user can
 * emit an identical `{ ms, counter, by }`. Such stamps do not order against each other;
 * `sortBySeq` is a stable sort over the stored array, so they keep the array's own order —
 * identical on every client, since every client folds the same stored array. Ties are
 * therefore harmless to convergence; they are simply not ordered by `Seq`.
 */

export type EntityId = string;
export type EffectId = string;
export type ActionId = string;
export type WindowId = string;
export type MechanicId = string;
export type LabelId = string;

export interface Seq {
  readonly ms: number;
  readonly counter: number;
  readonly by: string;
}

export function compareSeq(a: Seq, b: Seq): -1 | 0 | 1 {
  if (a.ms !== b.ms) return a.ms < b.ms ? -1 : 1;
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  if (a.by !== b.by) return a.by < b.by ? -1 : 1;
  return 0;
}

/** A stable, non-mutating sort by `seq`. */
export function sortBySeq<T extends { readonly seq: Seq }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareSeq(a.seq, b.seq));
}

export function seqKey(seq: Seq): string {
  return `${seq.ms}:${seq.counter}:${seq.by}`;
}

/** Exhaustiveness guard: a new union member is a compile error until it is handled. */
export function assertNever(value: never, context: string): never {
  throw new Error(`combat: unhandled ${context}: ${JSON.stringify(value)}`);
}
