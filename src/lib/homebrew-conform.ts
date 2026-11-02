/**
 * homebrew-conform — the field loop every homebrew validator shares (spells, items,
 * monsters, actions). Each known field of the authored object is conformed against
 * its exact schema; a field the schema rejects is left out of play — never
 * repaired, never erased from storage. Grants are conformed one by one
 * (`conformGrants`, in `homebrew-grants`).
 *
 * Imports only the schema kit (never the engine), so every homebrew module can
 * share it without an import cycle.
 */
import {
  arraySchema,
  conformExact,
  customSchema,
  literalSchema,
  unionSchema,
  type ExactSchema,
  type ExactSchemaContext,
} from "@/lib/exact-schema";
import type { Grant } from "@/lib/grants";
import { ABILITY_CODES } from "@/types/ability";
import { DAMAGE_TYPE_SCHEMA } from "@/types/damage";

/** A plain JSON object (not an array, not a class instance). */
export function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** One of these string literals. */
export const literals = (values: ReadonlyArray<string>): ExactSchema =>
  unionSchema(values.map((value) => literalSchema(value)));

export const ABILITY = literals(ABILITY_CODES);
export const TRUE = literalSchema(true);
export const DAMAGE_TYPES = arraySchema(DAMAGE_TYPE_SCHEMA);

/** A plain JSON object whose inner shape is the catalogue's own nested dialect (an
 *  action, a stat block, a bestiary rule): checked to be an object here, read by the
 *  same consumer the catalogue's goes through. */
export const OBJECT = customSchema<"object", Readonly<Record<string, unknown>>>("object");
export const GRANT = customSchema<"grant", Grant>("grant");

/**
 * Every field of `authored` its schema accepts, in schema order. `special` replaces
 * the schema check for a key (a per-element list, a semantic check); null leaves the
 * field out.
 */
export function conformFields<
  Customs extends Readonly<Record<string, unknown>>,
  Refs extends Readonly<Record<string, unknown>>,
>(
  schemas: Readonly<Record<string, ExactSchema>>,
  authored: Readonly<Record<string, unknown>>,
  context: ExactSchemaContext<Customs, Refs>,
  special: Readonly<Record<string, (raw: unknown) => unknown>> = {}
): Record<string, unknown> {
  const accepted: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(schemas)) {
    if (!Object.hasOwn(authored, key)) continue;
    const conform = special[key];
    const value: unknown = conform
      ? conform(authored[key])
      : conformExact(schema, authored[key], context);
    if (value !== null) accepted[key] = value;
  }
  return accepted;
}

/** `fn` memoised per input object (a stored object is never mutated in place); an
 *  undefined result is not cached. */
export function memoByObject<Key extends object, Value>(
  fn: (key: Key) => Value | undefined
): (key: Key) => Value | undefined {
  const cache = new WeakMap<Key, Value>();
  return (key) => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const value = fn(key);
    if (value !== undefined) cache.set(key, value);
    return value;
  };
}
