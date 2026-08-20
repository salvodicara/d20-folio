/** Exact, locale-free contracts for concrete damage resolution. */

import {
  arraySchema,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { EntityRef } from "@/types/mechanics-reference";

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

export const DAMAGE_TYPE_SCHEMA = unionSchema(
  DAMAGE_TYPES.map((damageType) => literalSchema(damageType))
);

export const DAMAGE_DELIVERIES = ["attack", "saving-throw", "automatic"] as const;
export type DamageDelivery = (typeof DAMAGE_DELIVERIES)[number];

export const DAMAGE_DELIVERY_SCHEMA = unionSchema(
  DAMAGE_DELIVERIES.map((delivery) => literalSchema(delivery))
);

export const DAMAGE_TRAITS = [
  "spell",
  "weapon",
  "ranged-weapon",
  "magical",
  "siege",
] as const;
export type DamageTrait = (typeof DAMAGE_TRAITS)[number];

export const DAMAGE_TRAIT_SCHEMA = unionSchema(
  DAMAGE_TRAITS.map((trait) => literalSchema(trait))
);

const ID_SCHEMA = customSchema<"id", string>("id");
const ENTITY_REF_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const DAMAGE_AMOUNT_SCHEMA = customSchema<"damage-amount", number>("damage-amount");
const TOTAL_DAMAGE_SCHEMA = customSchema<"total-damage", number>("total-damage");
const FLAT_ADJUSTMENT_SCHEMA = customSchema<"flat-adjustment", number>("flat-adjustment");
const POSITIVE_THRESHOLD_SCHEMA = customSchema<"positive-threshold", number>(
  "positive-threshold"
);
const SIGNED_TOTAL_SCHEMA = customSchema<"signed-total", number>("signed-total");

export const DAMAGE_PART_SCHEMA = objectSchema({
  amount: DAMAGE_AMOUNT_SCHEMA,
  damageType: DAMAGE_TYPE_SCHEMA,
  partId: ID_SCHEMA,
});
export type DamagePart = InferExactSchema<
  typeof DAMAGE_PART_SCHEMA,
  DamageSchemaCustomTypes
>;

/** A concrete packet contains only amounts already resolved or entered at the table. */
export const DAMAGE_PACKET_SCHEMA = objectSchema({
  delivery: DAMAGE_DELIVERY_SCHEMA,
  packetId: ID_SCHEMA,
  parts: arraySchema(DAMAGE_PART_SCHEMA, 1),
  target: ENTITY_REF_SCHEMA,
  traits: arraySchema(DAMAGE_TRAIT_SCHEMA),
});
export type DamagePacket = InferExactSchema<
  typeof DAMAGE_PACKET_SCHEMA,
  DamageSchemaCustomTypes
>;

export const DAMAGE_DEFENSE_SELECTOR_SCHEMA = objectSchema({
  damageTypes: arraySchema(DAMAGE_TYPE_SCHEMA),
  deliveries: arraySchema(DAMAGE_DELIVERY_SCHEMA),
  forbiddenTraits: arraySchema(DAMAGE_TRAIT_SCHEMA),
  requiredTraits: arraySchema(DAMAGE_TRAIT_SCHEMA),
});
export type DamageDefenseSelector = InferExactSchema<
  typeof DAMAGE_DEFENSE_SELECTOR_SCHEMA
>;

export const DAMAGE_DEFENSE_RULE_SCHEMA = discriminatedUnionSchema("kind", {
  immunity: objectSchema({
    kind: literalSchema("immunity"),
    selector: DAMAGE_DEFENSE_SELECTOR_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
  resistance: objectSchema({
    kind: literalSchema("resistance"),
    selector: DAMAGE_DEFENSE_SELECTOR_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
  vulnerability: objectSchema({
    kind: literalSchema("vulnerability"),
    selector: DAMAGE_DEFENSE_SELECTOR_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
  "flat-adjustment": objectSchema({
    amount: FLAT_ADJUSTMENT_SCHEMA,
    kind: literalSchema("flat-adjustment"),
    selector: DAMAGE_DEFENSE_SELECTOR_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
});
export type DamageDefenseRule = InferExactSchema<
  typeof DAMAGE_DEFENSE_RULE_SCHEMA,
  DamageSchemaCustomTypes
>;

/** Ordered target-side facts. `null` is the only representation of no threshold. */
export const DAMAGE_DEFENSE_PROFILE_SCHEMA = objectSchema({
  damageThreshold: unionSchema([POSITIVE_THRESHOLD_SCHEMA, literalSchema(null)]),
  rules: arraySchema(DAMAGE_DEFENSE_RULE_SCHEMA),
});
export type DamageDefenseProfile = InferExactSchema<
  typeof DAMAGE_DEFENSE_PROFILE_SCHEMA,
  DamageSchemaCustomTypes
>;

const DAMAGE_ALLOCATION_PART_SCHEMA = objectSchema({
  amount: DAMAGE_AMOUNT_SCHEMA,
  partId: ID_SCHEMA,
});

export const DAMAGE_ALLOCATION_OBSERVATION_SCHEMA = objectSchema({
  parts: arraySchema(DAMAGE_ALLOCATION_PART_SCHEMA, 1),
  sourceId: ID_SCHEMA,
});
export type DamageAllocationObservation = InferExactSchema<
  typeof DAMAGE_ALLOCATION_OBSERVATION_SCHEMA,
  DamageSchemaCustomTypes
>;

export const DAMAGE_ALLOCATION_OBSERVATIONS_SCHEMA = arraySchema(
  DAMAGE_ALLOCATION_OBSERVATION_SCHEMA
);
export type DamageAllocationObservations = InferExactSchema<
  typeof DAMAGE_ALLOCATION_OBSERVATIONS_SCHEMA,
  DamageSchemaCustomTypes
>;

export const DAMAGE_TABLE_OVERRIDE_SCHEMA = objectSchema({
  amount: TOTAL_DAMAGE_SCHEMA,
  kind: literalSchema("net-total"),
  reasonId: ID_SCHEMA,
});
export type DamageTableOverride = InferExactSchema<
  typeof DAMAGE_TABLE_OVERRIDE_SCHEMA,
  DamageSchemaCustomTypes
>;

const DAMAGE_FLAT_APPLICATION_SCHEMA = objectSchema({
  after: TOTAL_DAMAGE_SCHEMA,
  allocatedAmount: SIGNED_TOTAL_SCHEMA,
  before: TOTAL_DAMAGE_SCHEMA,
  kind: literalSchema("flat-adjustment"),
  requestedAmount: FLAT_ADJUSTMENT_SCHEMA,
  sourceId: ID_SCHEMA,
});

const damageBinaryApplicationSchema = <
  const Kind extends "immunity" | "resistance" | "vulnerability",
>(
  kind: Kind
) =>
  objectSchema({
    after: TOTAL_DAMAGE_SCHEMA,
    applied: booleanSchema,
    before: TOTAL_DAMAGE_SCHEMA,
    kind: literalSchema(kind),
    sourceId: ID_SCHEMA,
  });

export const DAMAGE_RULE_APPLICATION_SCHEMA = discriminatedUnionSchema("kind", {
  "flat-adjustment": DAMAGE_FLAT_APPLICATION_SCHEMA,
  immunity: damageBinaryApplicationSchema("immunity"),
  resistance: damageBinaryApplicationSchema("resistance"),
  vulnerability: damageBinaryApplicationSchema("vulnerability"),
});
export type DamageRuleApplication = InferExactSchema<
  typeof DAMAGE_RULE_APPLICATION_SCHEMA,
  DamageSchemaCustomTypes
>;

export const DAMAGE_PART_RESOLUTION_SCHEMA = objectSchema({
  adjustedAmount: TOTAL_DAMAGE_SCHEMA,
  damageType: DAMAGE_TYPE_SCHEMA,
  netAmount: TOTAL_DAMAGE_SCHEMA,
  partId: ID_SCHEMA,
  rawAmount: DAMAGE_AMOUNT_SCHEMA,
  resolvedAmount: TOTAL_DAMAGE_SCHEMA,
  ruleApplications: arraySchema(DAMAGE_RULE_APPLICATION_SCHEMA),
});
export type DamagePartResolution = InferExactSchema<
  typeof DAMAGE_PART_RESOLUTION_SCHEMA,
  DamageSchemaCustomTypes
>;

export const DAMAGE_COMPUTATION_SCHEMA = objectSchema({
  adjustedTotal: TOTAL_DAMAGE_SCHEMA,
  damageThreshold: unionSchema([POSITIVE_THRESHOLD_SCHEMA, literalSchema(null)]),
  netTotal: TOTAL_DAMAGE_SCHEMA,
  packetId: ID_SCHEMA,
  parts: arraySchema(DAMAGE_PART_RESOLUTION_SCHEMA, 1),
  rawTotal: TOTAL_DAMAGE_SCHEMA,
  resolvedTotal: TOTAL_DAMAGE_SCHEMA,
  target: ENTITY_REF_SCHEMA,
  thresholdApplied: booleanSchema,
});
export type DamageComputation = InferExactSchema<
  typeof DAMAGE_COMPUTATION_SCHEMA,
  DamageSchemaCustomTypes
>;

const DAMAGE_COMPUTED_EFFECTIVE_SCHEMA = objectSchema({
  amount: TOTAL_DAMAGE_SCHEMA,
  kind: literalSchema("computed"),
});

export const DAMAGE_RESOLUTION_SCHEMA = objectSchema({
  computed: DAMAGE_COMPUTATION_SCHEMA,
  effective: unionSchema([
    DAMAGE_COMPUTED_EFFECTIVE_SCHEMA,
    DAMAGE_TABLE_OVERRIDE_SCHEMA,
  ]),
  packet: DAMAGE_PACKET_SCHEMA,
});
export type DamageResolution = InferExactSchema<
  typeof DAMAGE_RESOLUTION_SCHEMA,
  DamageSchemaCustomTypes
>;

const DAMAGE_REVIEW_PART_SCHEMA = objectSchema({
  maximumAmount: unionSchema([DAMAGE_AMOUNT_SCHEMA, literalSchema(null)]),
  partId: ID_SCHEMA,
});

export const DAMAGE_ALLOCATION_REQUIREMENT_SCHEMA = objectSchema({
  amount: DAMAGE_AMOUNT_SCHEMA,
  operation: unionSchema([literalSchema("increase"), literalSchema("reduction")]),
  packetId: ID_SCHEMA,
  parts: arraySchema(DAMAGE_REVIEW_PART_SCHEMA, 1),
  sourceId: ID_SCHEMA,
});
export type DamageAllocationRequirement = InferExactSchema<
  typeof DAMAGE_ALLOCATION_REQUIREMENT_SCHEMA,
  DamageSchemaCustomTypes
>;

export type DamageResolutionAttempt =
  | {
      readonly kind: "review-required";
      readonly requirement: Readonly<DamageAllocationRequirement>;
    }
  | {
      readonly kind: "resolved";
      readonly resolution: Readonly<DamageResolution>;
    };

export type DamageSchemaCustomTypes = {
  readonly id: string;
  readonly "entity-ref": EntityRef;
  readonly "damage-amount": number;
  readonly "total-damage": number;
  readonly "flat-adjustment": number;
  readonly "positive-threshold": number;
  readonly "signed-total": number;
};
