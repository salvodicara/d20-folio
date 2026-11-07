/**
 * The session fields the open sheet projects at runtime and the codec never stores:
 * the effects others left on it, its campaign's table rules, its campaign's clock.
 * A change to one of them alone is no change to persist. Re-projecting the clock after
 * a snapshot dropped it used to send the whole play state back to Firestore, over and
 * over (rehearsal 2026-11-06); tests/unit/session-overlays.guard.test.ts keeps this list
 * equal to the fields `types/character.ts` documents as never serialized.
 */
import type { SessionState } from "@/types/character";

export const RUNTIME_SESSION_OVERLAYS = [
  "encounterEffects",
  "tableRules",
  "campaignClock",
] as const satisfies ReadonlyArray<keyof SessionState>;

const OVERLAYS: ReadonlySet<string> = new Set(RUNTIME_SESSION_OVERLAYS);

/** Whether `next` changes a stored field of `prev` (an overlay alone does not). */
export function storedSessionChanged(prev: SessionState, next: SessionState): boolean {
  if (prev === next) return false;
  const before = prev as unknown as Record<string, unknown>;
  const after = next as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!OVERLAYS.has(key) && before[key] !== after[key]) return true;
  }
  return false;
}
