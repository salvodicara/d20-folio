/** Exact structural grammar for universal mechanics references. */

import { canonicalJson } from "@/lib/canonical-fingerprint";
import {
  customSchema,
  discriminatedUnionSchema,
  exactConformer,
  literalSchema,
  objectSchema,
  refSchema,
  unionSchema,
  type ExactSchemaContext,
  type InferExactSchema,
} from "@/lib/exact-schema";

const MAX_ID_LENGTH = 256;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

/** One identifier boundary shared by every mechanics reference and graph. */
export function conformMechanicId(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

const ID_SCHEMA = customSchema<"id", string>("id");
const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const MATERIAL_ENTITY_ID_SCHEMA = customSchema<"material-entity-id", string>(
  "material-entity-id"
);

export const CHARACTER_MATERIAL_REF_SCHEMA = objectSchema({
  characterId: ID_SCHEMA,
  kind: literalSchema("character-play"),
  uid: ID_SCHEMA,
});

export const SHARED_MATERIAL_REF_SCHEMA = objectSchema({
  campaignId: ID_SCHEMA,
  kind: literalSchema("shared-combat"),
});

export const MATERIAL_REF_SCHEMA = discriminatedUnionSchema("kind", {
  "character-play": CHARACTER_MATERIAL_REF_SCHEMA,
  "shared-combat": SHARED_MATERIAL_REF_SCHEMA,
});

export type MaterialRefSchemaShape = InferExactSchema<typeof MATERIAL_REF_SCHEMA>;
export type CharacterMaterialRefSchemaShape = InferExactSchema<
  typeof CHARACTER_MATERIAL_REF_SCHEMA
>;
export type SharedMaterialRefSchemaShape = InferExactSchema<
  typeof SHARED_MATERIAL_REF_SCHEMA
>;

const MATERIAL_REF = refSchema<"material-ref", MaterialRefSchemaShape>("material-ref");

export const CLOCK_REF_SCHEMA = objectSchema({
  epoch: NONNEGATIVE_INTEGER_SCHEMA,
  material: MATERIAL_REF,
});

export type ClockRefSchemaShape = InferExactSchema<typeof CLOCK_REF_SCHEMA>;

const conformClockRefStructure = exactConformer(CLOCK_REF_SCHEMA, {
  customs: {
    id: conformMechanicId,
    "nonnegative-integer": (value) =>
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      !Object.is(value, -0)
        ? value
        : null,
  },
  refs: { "material-ref": MATERIAL_REF_SCHEMA },
});

/** Strict universal clock-reference boundary, independent of material state. */
export function conformClockRef(value: unknown): Readonly<ClockRefSchemaShape> | null {
  return conformClockRefStructure(value);
}

export const SELF_ENTITY_REF_SCHEMA = objectSchema({
  entityId: literalSchema("self"),
  material: CHARACTER_MATERIAL_REF_SCHEMA,
});

export const MATERIAL_ENTITY_REF_SCHEMA = objectSchema({
  entityId: MATERIAL_ENTITY_ID_SCHEMA,
  material: MATERIAL_REF,
  ordinal: POSITIVE_INTEGER_SCHEMA,
});

/** One exact physical entity identity; character self is its material generation. */
export const ENTITY_REF_SCHEMA = unionSchema([
  SELF_ENTITY_REF_SCHEMA,
  MATERIAL_ENTITY_REF_SCHEMA,
]);

export type EntityRefSchemaShape = InferExactSchema<typeof ENTITY_REF_SCHEMA>;
export type SelfEntityRefSchemaShape = InferExactSchema<typeof SELF_ENTITY_REF_SCHEMA>;
export type MaterialEntityRefSchemaShape = InferExactSchema<
  typeof MATERIAL_ENTITY_REF_SCHEMA
>;

/** Entity ids are reusable logical slots; only non-self ids need a material ordinal. */
export function conformMaterialEntityId(value: unknown): string | null {
  const id = conformMechanicId(value);
  return id === "self" ? null : id;
}

function conformPositiveInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    !Object.is(value, -0)
    ? value
    : null;
}

const ENTITY_REF_SCHEMA_CONTEXT: ExactSchemaContext<
  {
    readonly id: string;
    readonly "material-entity-id": string;
    readonly "positive-integer": number;
  },
  { readonly "material-ref": MaterialRefSchemaShape }
> = {
  customs: {
    id: conformMechanicId,
    "material-entity-id": conformMaterialEntityId,
    "positive-integer": conformPositiveInteger,
  },
  refs: { "material-ref": MATERIAL_REF_SCHEMA },
};

const conformEntityRefStructure = exactConformer(
  ENTITY_REF_SCHEMA,
  ENTITY_REF_SCHEMA_CONTEXT
);

/** Strict universal entity-reference boundary, independent of material state. */
export function conformEntityRef(value: unknown): Readonly<EntityRefSchemaShape> | null {
  return conformEntityRefStructure(value);
}

/** Canonical collision/deduplication key for one exact entity generation. */
export function entityRefKey(value: Readonly<EntityRefSchemaShape>): string {
  const reference = conformEntityRef(value);
  if (!reference) throw new TypeError("Invalid entity reference");
  return canonicalJson(reference);
}

/** Exact identity of one physical inventory instance generation. */
export const INVENTORY_GENERATION_REF_SCHEMA = objectSchema({
  instanceId: MATERIAL_ENTITY_ID_SCHEMA,
  instanceOrdinal: POSITIVE_INTEGER_SCHEMA,
  owner: CHARACTER_MATERIAL_REF_SCHEMA,
});

export type InventoryGenerationRefSchemaShape = InferExactSchema<
  typeof INVENTORY_GENERATION_REF_SCHEMA
>;

const conformInventoryGenerationRefStructure = exactConformer(
  INVENTORY_GENERATION_REF_SCHEMA,
  ENTITY_REF_SCHEMA_CONTEXT
);

/** Strict anti-ABA inventory identity, independent of current material state. */
export function conformInventoryGenerationRef(
  value: unknown
): Readonly<InventoryGenerationRefSchemaShape> | null {
  return conformInventoryGenerationRefStructure(value);
}

/** Canonical collision/deduplication key for one inventory generation. */
export function inventoryGenerationRefKey(
  value: Readonly<InventoryGenerationRefSchemaShape>
): string {
  const reference = conformInventoryGenerationRef(value);
  if (!reference) throw new TypeError("Invalid inventory generation reference");
  return canonicalJson(reference);
}

export const OCCURRENCE_REF_SCHEMA = objectSchema({
  material: MATERIAL_REF,
  occurrenceId: ID_SCHEMA,
});

export type OccurrenceRefSchemaShape = InferExactSchema<typeof OCCURRENCE_REF_SCHEMA>;

const conformOccurrenceRefStructure = exactConformer(
  OCCURRENCE_REF_SCHEMA,
  ENTITY_REF_SCHEMA_CONTEXT
);

/** Strict universal occurrence-reference boundary, independent of occurrence state. */
export function conformOccurrenceRef(
  value: unknown
): Readonly<OccurrenceRefSchemaShape> | null {
  return conformOccurrenceRefStructure(value);
}

/**
 * Exact identity of one active generation occupying an occurrence address.
 * `OccurrenceRef` alone is only a logical slot and must never authorize a
 * causal runtime transition because that slot can be reused after removal.
 */
export const OCCURRENCE_GENERATION_REF_SCHEMA = objectSchema({
  occurrence: OCCURRENCE_REF_SCHEMA,
  ordinal: POSITIVE_INTEGER_SCHEMA,
});

export type OccurrenceGenerationRefSchemaShape = InferExactSchema<
  typeof OCCURRENCE_GENERATION_REF_SCHEMA
>;

const conformOccurrenceGenerationRefStructure = exactConformer(
  OCCURRENCE_GENERATION_REF_SCHEMA,
  {
    customs: {
      id: conformMechanicId,
      "positive-integer": conformPositiveInteger,
    },
    refs: { "material-ref": MATERIAL_REF_SCHEMA },
  }
);

/** Strict anti-ABA occurrence identity, independent of current world state. */
export function conformOccurrenceGenerationRef(
  value: unknown
): Readonly<OccurrenceGenerationRefSchemaShape> | null {
  return conformOccurrenceGenerationRefStructure(value);
}

/** Canonical collision/deduplication key for one exact occurrence generation. */
export function occurrenceGenerationRefKey(
  value: Readonly<OccurrenceGenerationRefSchemaShape>
): string {
  const reference = conformOccurrenceGenerationRef(value);
  if (!reference) throw new TypeError("Invalid occurrence generation reference");
  return canonicalJson(reference);
}
