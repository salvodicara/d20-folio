/** Closed schema-first weapon properties and intrinsic attack capabilities. */

import {
  arraySchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { DiceFormula } from "@/types/dice-formula";

const POSITIVE_DISTANCE_FT_SCHEMA = customSchema<"positive-distance-ft", number>(
  "positive-distance-ft"
);
const STABLE_ITEM_ID_SCHEMA = customSchema<"stable-item-id", string>("stable-item-id");
const DICE_FORMULA_VALUE_SCHEMA = customSchema<"dice-formula", DiceFormula>(
  "dice-formula"
);

/** One normal/long weapon range. Equal limits represent attacks with no long band. */
export const WEAPON_RANGE_PAIR_SCHEMA = objectSchema({
  longFt: POSITIVE_DISTANCE_FT_SCHEMA,
  normalFt: POSITIVE_DISTANCE_FT_SCHEMA,
});
export type WeaponRangePair = InferExactSchema<typeof WEAPON_RANGE_PAIR_SCHEMA>;

/** The nine weapon properties defined by the 2024 rules. */
export const WEAPON_PROPERTY_SCHEMA = discriminatedUnionSchema("kind", {
  ammunition: objectSchema({
    ammunitionItemId: STABLE_ITEM_ID_SCHEMA,
    kind: literalSchema("ammunition"),
    range: WEAPON_RANGE_PAIR_SCHEMA,
  }),
  finesse: objectSchema({ kind: literalSchema("finesse") }),
  heavy: objectSchema({ kind: literalSchema("heavy") }),
  light: objectSchema({ kind: literalSchema("light") }),
  loading: objectSchema({ kind: literalSchema("loading") }),
  reach: objectSchema({
    kind: literalSchema("reach"),
    reachFt: POSITIVE_DISTANCE_FT_SCHEMA,
  }),
  thrown: objectSchema({
    kind: literalSchema("thrown"),
    range: WEAPON_RANGE_PAIR_SCHEMA,
  }),
  "two-handed": objectSchema({
    kind: literalSchema("two-handed"),
    requirement: unionSchema([literalSchema("always"), literalSchema("unless-mounted")]),
  }),
  versatile: objectSchema({
    damage: DICE_FORMULA_VALUE_SCHEMA,
    kind: literalSchema("versatile"),
  }),
});
export type WeaponProperty = InferExactSchema<typeof WEAPON_PROPERTY_SCHEMA>;

/**
 * A weapon property or an intrinsic ranged-attack capability. `range` is not a
 * rules property: it describes manifested/custom attacks that neither consume
 * ammunition nor throw the weapon.
 */
export const WEAPON_CAPABILITY_SCHEMA = unionSchema([
  WEAPON_PROPERTY_SCHEMA,
  objectSchema({
    kind: literalSchema("range"),
    range: WEAPON_RANGE_PAIR_SCHEMA,
  }),
]);
export type WeaponCapability = InferExactSchema<typeof WEAPON_CAPABILITY_SCHEMA>;

/** Canonical persisted order. It matches the stable property-kind ids. */
export const WEAPON_CAPABILITY_KINDS = [
  "ammunition",
  "finesse",
  "heavy",
  "light",
  "loading",
  "range",
  "reach",
  "thrown",
  "two-handed",
  "versatile",
] as const satisfies readonly WeaponCapability["kind"][];

export const WEAPON_CAPABILITIES_SCHEMA = arraySchema(WEAPON_CAPABILITY_SCHEMA);
export type WeaponCapabilities = InferExactSchema<typeof WEAPON_CAPABILITIES_SCHEMA>;

export type WeaponPropertySchemaCustomTypes = {
  readonly "dice-formula": DiceFormula;
  readonly "positive-distance-ft": number;
  readonly "stable-item-id": string;
};
