/**
 * Per-domain reconciliation of the two character listeners (design §5.3; audit F7).
 * The parent (build + metadata) and the child (`combat/state`) arrive independently. A
 * domain with a pending local write keeps materializing that payload until the server
 * acknowledges it (a snapshot without `hasPendingWrites` that equals it, or the write
 * promise resolving); a sibling snapshot can therefore never republish an older remote
 * value over a local edit. A server value that differs from the pending one is a
 * conflict: recorded, still hidden behind the local payload, resolved when the write is
 * rejected (the rules' revision CAS) or acknowledged.
 *
 * Pure by construction (registered in `tests/unit/pure-modules-guard.test.ts`): it holds
 * no Firestore handle, no store reference and no clock — the hook feeds it snapshots and
 * write outcomes and reads back the pair to publish.
 */
export interface SnapshotMeta {
  hasPendingWrites: boolean;
}

interface Domain<V> {
  remote: V | null | undefined;
  pending: V | undefined;
  conflict: boolean;
}

export interface Reconciliation<P, C> {
  /** What to publish: the unacknowledged local payload, else the last server value. */
  parent: P | null | undefined;
  child: C | null | undefined;
  /**
   * The last SERVER-acknowledged value, independent of any pending payload. The parent's
   * is what the compare-and-set bases on: a caller must never advance a `revision` past a
   * generation the server has not confirmed, and never publish an optimistic one.
   */
  parentRemote: P | null | undefined;
  childRemote: C | null | undefined;
  parentPending: boolean;
  childPending: boolean;
  /**
   * INFORMATIONAL only — a server value that differs from the pending payload. The
   * write's own rejection callback is what drives the error state and the republish;
   * nothing reads these flags to decide behaviour.
   */
  parentConflict: boolean;
  childConflict: boolean;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

/** Key-order-insensitive structural equality (the domain payloads are plain JSON). */
export function canonicalJsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export interface CharacterSnapshotReconciler<P, C> {
  receiveParent: (value: P | null, meta: SnapshotMeta) => void;
  receiveChild: (value: C | null, meta: SnapshotMeta) => void;
  markParentPending: (value: P) => void;
  markChildPending: (value: C) => void;
  acknowledgeParentWrite: (value: P) => void;
  acknowledgeChildWrite: (value: C) => void;
  rejectParentWrite: (value: P) => void;
  rejectChildWrite: (value: C) => void;
  current: () => Reconciliation<P, C>;
  reset: () => void;
}

export function createCharacterSnapshotReconciler<P, C>(
  equals: (a: unknown, b: unknown) => boolean = canonicalJsonEquals
): CharacterSnapshotReconciler<P, C> {
  const empty = <V>(): Domain<V> => ({
    remote: undefined,
    pending: undefined,
    conflict: false,
  });
  let parent = empty<P>();
  let child = empty<C>();
  const receive = <V>(d: Domain<V>, value: V | null, meta: SnapshotMeta): void => {
    if (meta.hasPendingWrites && d.pending !== undefined) return; // our own echo
    d.remote = value;
    if (d.pending === undefined) {
      d.conflict = false;
      return;
    }
    if (equals(d.pending, value)) {
      d.pending = undefined;
      d.conflict = false;
      return;
    }
    d.conflict = true;
  };
  const settle = <V>(d: Domain<V>, value: V, ack: boolean): void => {
    if (d.pending === undefined || !equals(d.pending, value)) return;
    if (ack) d.remote = value;
    d.pending = undefined;
    d.conflict = false;
  };
  return {
    receiveParent: (v, m) => receive(parent, v, m),
    receiveChild: (v, m) => receive(child, v, m),
    markParentPending: (v) => {
      parent.pending = v;
      parent.conflict = false;
    },
    markChildPending: (v) => {
      child.pending = v;
      child.conflict = false;
    },
    acknowledgeParentWrite: (v) => settle(parent, v, true),
    acknowledgeChildWrite: (v) => settle(child, v, true),
    rejectParentWrite: (v) => settle(parent, v, false),
    rejectChildWrite: (v) => settle(child, v, false),
    current(): Reconciliation<P, C> {
      return {
        parent: parent.pending ?? parent.remote,
        child: child.pending ?? child.remote,
        parentRemote: parent.remote,
        childRemote: child.remote,
        parentPending: parent.pending !== undefined,
        childPending: child.pending !== undefined,
        parentConflict: parent.conflict,
        childConflict: child.conflict,
      };
    },
    reset() {
      parent = empty<P>();
      child = empty<C>();
    },
  };
}
