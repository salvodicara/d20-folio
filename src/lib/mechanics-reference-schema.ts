/** Exact structural grammar for universal mechanics references. */

import {
  customSchema,
  discriminatedUnionSchema,
  exactConformer,
  literalSchema,
  objectSchema,
  refSchema,
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

export const ENTITY_REF_SCHEMA = objectSchema({
  entityId: ID_SCHEMA,
  material: MATERIAL_REF,
});

export type EntityRefSchemaShape = InferExactSchema<typeof ENTITY_REF_SCHEMA>;

const ENTITY_REF_SCHEMA_CONTEXT: ExactSchemaContext<
  { readonly id: string },
  { readonly "material-ref": MaterialRefSchemaShape }
> = {
  customs: { id: conformMechanicId },
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
