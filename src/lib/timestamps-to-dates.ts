/**
 * Recursively convert every Firestore `Timestamp` in a parsed document tree to a
 * JS `Date` — the ONE generic read-boundary normalizer for date fields.
 *
 * Firestore auto-converts `Timestamp`s only at the TOP level of a document; any
 * `Timestamp` nested inside an array or a map arrives as a raw `Timestamp`
 * instance (e.g. `treasuryLog[].at`, the legacy `sharedNotes[].updatedAt`, a note
 * doc's `updatedAt`,
 * `logs[uid].syncedAt`). A per-field `instanceof Timestamp ? .toDate()` shim must
 * then be hand-written for EACH such field — and the day a new nested date field
 * is added without one, a `Timestamp` leaks into the app and a `.getTime()` call
 * throws `b.updatedAt.getTime is not a function`, taking down the whole surface
 * behind an error boundary.
 *
 * This walker kills that whole class: applied once to a parsed document, it
 * converts EVERY `Timestamp` anywhere in the tree, so a future nested date field
 * is covered BY CONSTRUCTION — no new per-field shim, no leak.
 *
 * Lives in its own pure module (NO Firebase imports) so it can be unit-tested in
 * CI without `VITE_FIREBASE_API_KEY` — same discipline as `strip-undefined.ts`.
 * The `Timestamp` check is duck-typed (a callable `.toDate()`) rather than an
 * `instanceof`, so it matches real SDK Timestamps AND test doubles, and never
 * needs to import from `firebase/firestore`.
 */

/** A value carrying a `toDate(): Date` method — a Firestore `Timestamp` or a
 *  faithful test double. */
function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  );
}

/**
 * Deep-convert every `Timestamp` in `value` to a `Date`. Plain objects and arrays
 * are recursed (a new container is returned so the input is never mutated);
 * `Date`s and primitives pass through untouched. Returns the same reference type
 * it was given, with all Timestamps replaced.
 */
export function timestampsToDates<T>(value: T): T {
  if (isTimestampLike(value)) return value.toDate() as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    const arr: unknown[] = value;
    return arr.map((v) => timestampsToDates(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = timestampsToDates(v);
    }
    return out as unknown as T;
  }
  return value;
}
