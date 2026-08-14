/** Strict persisted collection boundary for local combat-effect lifecycles. */

import {
  conformCombatEffectLifecycle,
  type CombatEffectLifecycleRuntime,
} from "@/lib/combat-effect-lifecycle";

export type CombatEffectLifecycleCollection = ReadonlyArray<
  Readonly<CombatEffectLifecycleRuntime>
>;

function plainDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.hasOwn(descriptors, "length") &&
    Object.keys(descriptors).length === value.length + 1 &&
    Array.from({ length: value.length }, (_, index) => descriptors[String(index)]).every(
      (descriptor) =>
        descriptor !== undefined && descriptor.enumerable && "value" in descriptor
    )
  );
}

function compareIdentity(
  left: Readonly<CombatEffectLifecycleRuntime>,
  right: Readonly<CombatEffectLifecycleRuntime>
): number {
  for (const key of ["occurrenceId", "programId", "sourceId"] as const) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

/**
 * Accept only one JSON-plain, individually valid runtime per exact identity.
 * Output order is canonical and the full returned graph is immutable.
 */
export function conformCombatEffectLifecycleCollection(
  value: unknown
): CombatEffectLifecycleCollection | null {
  try {
    if (!plainDenseArray(value)) return null;
    const identities = new Set<string>();
    const runtimes: Array<Readonly<CombatEffectLifecycleRuntime>> = [];
    for (const candidate of value) {
      const runtime = conformCombatEffectLifecycle(candidate);
      if (!runtime) return null;
      const identity = JSON.stringify([
        runtime.occurrenceId,
        runtime.programId,
        runtime.sourceId,
      ]);
      if (identities.has(identity)) return null;
      identities.add(identity);
      runtimes.push(runtime);
    }
    runtimes.sort(compareIdentity);
    return Object.freeze(runtimes);
  } catch {
    return null;
  }
}

/** Stable JSON for the canonical lifecycle collection. */
export function serializeCombatEffectLifecycleCollection(value: unknown): string {
  const collection = conformCombatEffectLifecycleCollection(value);
  if (!collection) {
    throw new TypeError("Invalid combat-effect lifecycle collection");
  }
  return JSON.stringify(collection);
}
