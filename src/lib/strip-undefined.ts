/**
 * Recursively strip `undefined` values from an object tree.
 * Firestore rejects documents containing `undefined` — this ensures clean writes.
 * Arrays are traversed; nested objects are recursed; primitives pass through.
 *
 * Lives in its own pure module (NO Firebase imports) so it can be unit-tested
 * in environments without VITE_FIREBASE_API_KEY (CI). The previous version
 * lived inside `src/lib/firestore.ts`, which transitively imported
 * `src/lib/firebase.ts` and crashed at module-load in CI. Same pattern as
 * `src/lib/sanitize-character.ts` — kept pure for the same reason.
 *
 * The `Timestamp` instance check is duck-typed (constructor name match) to
 * avoid importing from `firebase/firestore` here. Real Timestamp instances
 * from the SDK pass through; tests can use either plain objects (always
 * deep-cloned) or real Timestamps (preserved).
 */

function isTimestampLike(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const ctor = (value as { constructor?: { name?: string } }).constructor;
  return ctor?.name === "Timestamp";
}

export function stripUndefined(obj: unknown): unknown {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj instanceof Date || isTimestampLike(obj)) return obj;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = stripUndefined(value);
      }
    }
    return result;
  }
  return obj;
}
