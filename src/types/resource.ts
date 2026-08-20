/** Canonical schema-first language for every finite or unbounded game resource. */

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
import type {
  DiceFormula,
  DiceObservation,
  DiceResolution,
  DiceRollRequirement,
} from "@/types/dice-formula";
import type { IntegerExpression } from "@/types/integer-expression";
import type { CharacterMaterialRef, EntityRef } from "@/types/mechanics-reference";

const ID_SCHEMA = customSchema<"id", string>("id");
const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const SPELL_LEVEL_SCHEMA = customSchema<"spell-level", number>("spell-level");
const CHARACTER_MATERIAL_REF_SCHEMA = customSchema<
  "character-material-ref",
  CharacterMaterialRef
>("character-material-ref");
const ENTITY_REF_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const INTEGER_EXPRESSION_SCHEMA = customSchema<"integer-expression", IntegerExpression>(
  "integer-expression"
);
const DICE_FORMULA_SCHEMA = customSchema<"dice-formula", DiceFormula>("dice-formula");
const DICE_OBSERVATION_SCHEMA = customSchema<"dice-observation", DiceObservation>(
  "dice-observation"
);
const DICE_RESOLUTION_SCHEMA = customSchema<"dice-resolution", DiceResolution>(
  "dice-resolution"
);

/** Custom scalar contract used by every resource exact-schema conformer. */
export type ResourceSchemaCustomTypes = {
  readonly id: string;
  readonly "nonnegative-integer": number;
  readonly "positive-integer": number;
  readonly "spell-level": number;
  readonly "character-material-ref": CharacterMaterialRef;
  readonly "entity-ref": EntityRef;
  readonly "integer-expression": IntegerExpression;
  readonly "dice-formula": DiceFormula;
  readonly "dice-observation": DiceObservation;
  readonly "dice-resolution": DiceResolution;
};

export const RESOURCE_CAPACITY_SPEC_SCHEMA = discriminatedUnionSchema("kind", {
  bounded: objectSchema({
    amount: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("bounded"),
  }),
  formula: objectSchema({
    formula: DICE_FORMULA_SCHEMA,
    kind: literalSchema("formula"),
  }),
  unbounded: objectSchema({ kind: literalSchema("unbounded") }),
});
export type ResourceCapacitySpec = InferExactSchema<typeof RESOURCE_CAPACITY_SPEC_SCHEMA>;

export const RESOURCE_INITIAL_SPEC_SCHEMA = discriminatedUnionSchema("kind", {
  full: objectSchema({ kind: literalSchema("full") }),
  empty: objectSchema({ kind: literalSchema("empty") }),
  fixed: objectSchema({
    amount: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("fixed"),
  }),
  formula: objectSchema({
    formula: DICE_FORMULA_SCHEMA,
    kind: literalSchema("formula"),
  }),
});
export type ResourceInitialSpec = InferExactSchema<typeof RESOURCE_INITIAL_SPEC_SCHEMA>;

export const RESOURCE_RECOVERY_TRIGGER_SCHEMA = discriminatedUnionSchema("kind", {
  "short-rest": objectSchema({ kind: literalSchema("short-rest") }),
  "long-rest": objectSchema({ kind: literalSchema("long-rest") }),
  dawn: objectSchema({ kind: literalSchema("dawn") }),
  dusk: objectSchema({ kind: literalSchema("dusk") }),
  "turn-start": objectSchema({ kind: literalSchema("turn-start") }),
  "turn-end": objectSchema({ kind: literalSchema("turn-end") }),
  event: objectSchema({ eventId: ID_SCHEMA, kind: literalSchema("event") }),
  manual: objectSchema({ kind: literalSchema("manual") }),
});
export type ResourceRecoveryTrigger = InferExactSchema<
  typeof RESOURCE_RECOVERY_TRIGGER_SCHEMA
>;

export const RESOURCE_RECOVERY_AMOUNT_SCHEMA = discriminatedUnionSchema("kind", {
  full: objectSchema({ kind: literalSchema("full") }),
  fixed: objectSchema({
    amount: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("fixed"),
  }),
  formula: objectSchema({
    formula: DICE_FORMULA_SCHEMA,
    kind: literalSchema("formula"),
  }),
});
export type ResourceRecoveryAmount = InferExactSchema<
  typeof RESOURCE_RECOVERY_AMOUNT_SCHEMA
>;

export const RESOURCE_RECOVERY_SPEC_SCHEMA = objectSchema({
  amount: RESOURCE_RECOVERY_AMOUNT_SCHEMA,
  trigger: RESOURCE_RECOVERY_TRIGGER_SCHEMA,
});
export type ResourceRecoverySpec = InferExactSchema<typeof RESOURCE_RECOVERY_SPEC_SCHEMA>;

export const RESOURCE_SPEC_SCHEMA = discriminatedUnionSchema("kind", {
  count: objectSchema({
    capacity: RESOURCE_CAPACITY_SPEC_SCHEMA,
    id: ID_SCHEMA,
    initial: RESOURCE_INITIAL_SPEC_SCHEMA,
    kind: literalSchema("count"),
    recoveries: arraySchema(RESOURCE_RECOVERY_SPEC_SCHEMA),
  }),
  rolled: objectSchema({
    capacity: RESOURCE_CAPACITY_SPEC_SCHEMA,
    id: ID_SCHEMA,
    initial: RESOURCE_INITIAL_SPEC_SCHEMA,
    kind: literalSchema("rolled"),
    recoveries: arraySchema(RESOURCE_RECOVERY_SPEC_SCHEMA),
    /** Formula for each recorded value, not the number of remaining entries. */
    formula: DICE_FORMULA_SCHEMA,
  }),
});
export type ResourceSpec = InferExactSchema<typeof RESOURCE_SPEC_SCHEMA>;

export const RESOURCE_OWNER_ROLE_SCHEMA = unionSchema([
  literalSchema("owner"),
  literalSchema("source"),
  literalSchema("target"),
  literalSchema("caster"),
  literalSchema("activator"),
  literalSchema("triggering-attacker"),
  literalSchema("victim"),
]);
export type ResourceOwnerRole = InferExactSchema<typeof RESOURCE_OWNER_ROLE_SCHEMA>;

export const RESOURCE_ITEM_SELECTOR_SCHEMA = discriminatedUnionSchema("kind", {
  "source-item": objectSchema({ kind: literalSchema("source-item") }),
  "reviewed-input": objectSchema({
    inputId: ID_SCHEMA,
    kind: literalSchema("reviewed-input"),
  }),
});
export type ResourceItemSelector = InferExactSchema<typeof RESOURCE_ITEM_SELECTOR_SCHEMA>;

const RESOURCE_DIE_SCHEMA = unionSchema([
  literalSchema("d4"),
  literalSchema("d6"),
  literalSchema("d8"),
  literalSchema("d10"),
  literalSchema("d12"),
]);
export type ResourceDie = InferExactSchema<typeof RESOURCE_DIE_SCHEMA>;

const CURRENCY_DENOMINATION_SCHEMA = unionSchema([
  literalSchema("pp"),
  literalSchema("gp"),
  literalSchema("ep"),
  literalSchema("sp"),
  literalSchema("cp"),
]);
export type CurrencyDenomination = InferExactSchema<typeof CURRENCY_DENOMINATION_SCHEMA>;

export const RESOURCE_SELECTOR_SCHEMA = discriminatedUnionSchema("kind", {
  pool: objectSchema({
    kind: literalSchema("pool"),
    owner: RESOURCE_OWNER_ROLE_SCHEMA,
    resourceId: ID_SCHEMA,
  }),
  "spell-slot": objectSchema({
    kind: literalSchema("spell-slot"),
    level: discriminatedUnionSchema("kind", {
      exact: objectSchema({ kind: literalSchema("exact"), value: SPELL_LEVEL_SCHEMA }),
      minimum: objectSchema({
        kind: literalSchema("minimum"),
        value: SPELL_LEVEL_SCHEMA,
      }),
    }),
    owner: RESOURCE_OWNER_ROLE_SCHEMA,
    pool: unionSchema([
      literalSchema("standard"),
      literalSchema("pact"),
      literalSchema("either"),
    ]),
  }),
  "hit-die": objectSchema({
    die: discriminatedUnionSchema("kind", {
      exact: objectSchema({ kind: literalSchema("exact"), value: RESOURCE_DIE_SCHEMA }),
      any: objectSchema({ kind: literalSchema("any") }),
    }),
    kind: literalSchema("hit-die"),
    owner: RESOURCE_OWNER_ROLE_SCHEMA,
  }),
  currency: objectSchema({
    denomination: CURRENCY_DENOMINATION_SCHEMA,
    kind: literalSchema("currency"),
    owner: RESOURCE_OWNER_ROLE_SCHEMA,
  }),
  "item-resource": objectSchema({
    item: RESOURCE_ITEM_SELECTOR_SCHEMA,
    kind: literalSchema("item-resource"),
    owner: RESOURCE_OWNER_ROLE_SCHEMA,
    resourceId: ID_SCHEMA,
  }),
  "item-quantity": objectSchema({
    item: RESOURCE_ITEM_SELECTOR_SCHEMA,
    kind: literalSchema("item-quantity"),
    owner: RESOURCE_OWNER_ROLE_SCHEMA,
  }),
});
export type ResourceSelector = InferExactSchema<typeof RESOURCE_SELECTOR_SCHEMA>;

/** One canonical authored quantity against an unresolved resource selector. */
export const RESOURCE_TERM_SCHEMA = objectSchema({
  amount: INTEGER_EXPRESSION_SCHEMA,
  selector: RESOURCE_SELECTOR_SCHEMA,
});
export type ResourceTerm = InferExactSchema<typeof RESOURCE_TERM_SCHEMA>;

export const RESOURCE_REF_SCHEMA = discriminatedUnionSchema("kind", {
  pool: objectSchema({
    kind: literalSchema("pool"),
    owner: ENTITY_REF_SCHEMA,
    resourceId: ID_SCHEMA,
  }),
  "standard-spell-slot": objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    kind: literalSchema("standard-spell-slot"),
    level: SPELL_LEVEL_SCHEMA,
  }),
  "pact-spell-slot": objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    kind: literalSchema("pact-spell-slot"),
  }),
  "hit-die": objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    die: RESOURCE_DIE_SCHEMA,
    kind: literalSchema("hit-die"),
  }),
  currency: objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    denomination: CURRENCY_DENOMINATION_SCHEMA,
    kind: literalSchema("currency"),
  }),
  "item-resource": objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    instanceId: ID_SCHEMA,
    instanceOrdinal: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("item-resource"),
    resourceId: ID_SCHEMA,
  }),
  "item-quantity": objectSchema({
    character: CHARACTER_MATERIAL_REF_SCHEMA,
    instanceId: ID_SCHEMA,
    instanceOrdinal: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("item-quantity"),
  }),
});
export type ResourceRef = InferExactSchema<typeof RESOURCE_REF_SCHEMA>;

export const RESOURCE_CAPACITY_BASE_SCHEMA = discriminatedUnionSchema("kind", {
  derived: objectSchema({
    kind: literalSchema("derived"),
    value: NONNEGATIVE_INTEGER_SCHEMA,
  }),
  formula: objectSchema({
    kind: literalSchema("formula"),
    resolution: DICE_RESOLUTION_SCHEMA,
  }),
  unbounded: objectSchema({ kind: literalSchema("unbounded") }),
});
export type ResourceCapacityBase = InferExactSchema<typeof RESOURCE_CAPACITY_BASE_SCHEMA>;

export const RESOURCE_CAPACITY_SCHEMA = objectSchema({
  base: RESOURCE_CAPACITY_BASE_SCHEMA,
  override: unionSchema([NONNEGATIVE_INTEGER_SCHEMA, literalSchema(null)]),
});
export type ResourceCapacity = InferExactSchema<typeof RESOURCE_CAPACITY_SCHEMA>;

export const RESOURCE_CELL_SCHEMA = discriminatedUnionSchema("kind", {
  count: objectSchema({
    capacity: RESOURCE_CAPACITY_SCHEMA,
    current: NONNEGATIVE_INTEGER_SCHEMA,
    disabled: booleanSchema,
    kind: literalSchema("count"),
  }),
  rolled: objectSchema({
    capacity: RESOURCE_CAPACITY_SCHEMA,
    disabled: booleanSchema,
    kind: literalSchema("rolled"),
    values: arraySchema(unionSchema([DICE_RESOLUTION_SCHEMA, literalSchema(null)])),
  }),
});
export type ResourceCell = InferExactSchema<typeof RESOURCE_CELL_SCHEMA>;
export type CountResourceCell = Extract<ResourceCell, { readonly kind: "count" }>;
export type RolledResourceCell = Extract<ResourceCell, { readonly kind: "rolled" }>;

export const RESOURCE_INITIALIZATION_OBSERVATIONS_SCHEMA = objectSchema(
  {},
  {
    capacity: DICE_OBSERVATION_SCHEMA,
    initial: DICE_OBSERVATION_SCHEMA,
  }
);
export type ResourceInitializationObservations = InferExactSchema<
  typeof RESOURCE_INITIALIZATION_OBSERVATIONS_SCHEMA
>;

export const RESOURCE_OPERATION_SCHEMA = discriminatedUnionSchema("kind", {
  spend: objectSchema({
    amount: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("spend"),
  }),
  gain: objectSchema({
    amount: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("gain"),
  }),
  "set-count": objectSchema({
    kind: literalSchema("set-count"),
    value: NONNEGATIVE_INTEGER_SCHEMA,
  }),
  "record-roll": objectSchema(
    {
      index: NONNEGATIVE_INTEGER_SCHEMA,
      kind: literalSchema("record-roll"),
    },
    { observation: DICE_OBSERVATION_SCHEMA }
  ),
  "spend-roll": objectSchema({
    index: NONNEGATIVE_INTEGER_SCHEMA,
    kind: literalSchema("spend-roll"),
  }),
  recover: objectSchema(
    {
      kind: literalSchema("recover"),
      trigger: RESOURCE_RECOVERY_TRIGGER_SCHEMA,
    },
    { observation: DICE_OBSERVATION_SCHEMA }
  ),
  "set-disabled": objectSchema({
    disabled: booleanSchema,
    kind: literalSchema("set-disabled"),
  }),
  "override-capacity": objectSchema({
    capacity: NONNEGATIVE_INTEGER_SCHEMA,
    kind: literalSchema("override-capacity"),
  }),
  "clear-capacity-override": objectSchema({
    kind: literalSchema("clear-capacity-override"),
  }),
});
export type ResourceOperation = InferExactSchema<typeof RESOURCE_OPERATION_SCHEMA>;

export interface ResourceTransitionFacts {
  readonly beforeRemaining: number;
  readonly afterRemaining: number;
  readonly becameEmpty: boolean;
  readonly recoveryResolution: Readonly<DiceResolution> | null;
  readonly spentResolution: Readonly<DiceResolution> | null;
}

export type ResourceRejection =
  | "invalid-spec"
  | "invalid-cell"
  | "invalid-operation"
  | "missing"
  | "disabled"
  | "wrong-kind"
  | "unexpected-observation"
  | "invalid-observation"
  | "unsupported-boundary"
  | "overdraw"
  | "overfill"
  | "unbounded-full"
  | "already-recorded"
  | "unrecorded-roll"
  | "out-of-range";

export type ResourceTransitionResult =
  | {
      readonly status: "applied";
      readonly before: Readonly<ResourceCell>;
      readonly after: Readonly<ResourceCell>;
      readonly facts: ResourceTransitionFacts;
    }
  | {
      readonly status: "needs-observation";
      readonly boundary: "record-roll" | "recovery";
      readonly requirement: Readonly<DiceRollRequirement>;
    }
  | { readonly status: "rejected"; readonly reason: ResourceRejection };

export type ResourceInitializationResult =
  | { readonly status: "initialized"; readonly cell: Readonly<ResourceCell> }
  | {
      readonly status: "needs-observation";
      readonly boundary: "capacity" | "initial";
      readonly requirement: Readonly<DiceRollRequirement>;
    }
  | { readonly status: "rejected"; readonly reason: ResourceRejection };
