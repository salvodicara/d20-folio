/** Schema-first physical-dice arithmetic. The engine specifies rolls; it never rolls. */

import {
  arraySchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { IntegerExpression } from "@/types/integer-expression";

export const STANDARD_DIE_SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof STANDARD_DIE_SIDES)[number];

const ID_SCHEMA = customSchema<"id", string>("id");
const TERM_ID_SCHEMA = customSchema<"term-id", string>("term-id");
const DIE_SIDES_SCHEMA = customSchema<"die-sides", DieSides>("die-sides");
const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const SIGNED_INTEGER_SCHEMA = customSchema<"signed-integer", number>("signed-integer");
const INTEGER_EXPRESSION_SCHEMA = customSchema<"integer-expression", IntegerExpression>(
  "integer-expression"
);

const OPERATION_SCHEMA = unionSchema([literalSchema("add"), literalSchema("subtract")]);

const DICE_FORMULA_TERM_SCHEMA = discriminatedUnionSchema("kind", {
  dice: objectSchema({
    count: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("dice"),
    operation: OPERATION_SCHEMA,
    sides: DIE_SIDES_SCHEMA,
    termId: TERM_ID_SCHEMA,
  }),
  "aggregate-dice": objectSchema({
    count: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("aggregate-dice"),
    operation: OPERATION_SCHEMA,
    sides: DIE_SIDES_SCHEMA,
    termId: TERM_ID_SCHEMA,
  }),
  integer: objectSchema({
    kind: literalSchema("integer"),
    operation: OPERATION_SCHEMA,
    termId: TERM_ID_SCHEMA,
    value: INTEGER_EXPRESSION_SCHEMA,
  }),
});

/** One ordered additive formula. `aggregate-dice` is only for intrinsically faceless facts. */
export const DICE_FORMULA_SCHEMA = objectSchema({
  terms: arraySchema(DICE_FORMULA_TERM_SCHEMA, 1),
});
export type DiceFormula = InferExactSchema<typeof DICE_FORMULA_SCHEMA>;
export type DiceFormulaTerm = DiceFormula["terms"][number];

const DICE_TRAIL_STEP_SCHEMA = discriminatedUnionSchema("kind", {
  replacement: objectSchema({
    face: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("replacement"),
    sourceId: ID_SCHEMA,
  }),
  "required-reroll": objectSchema({
    face: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("required-reroll"),
    ruleId: ID_SCHEMA,
  }),
});

/** Authored authority for replacing physical die faces; no resource semantics live here. */
export const DICE_REPLACEMENT_RULE_SCHEMA = discriminatedUnionSchema("kind", {
  "any-face": objectSchema({
    kind: literalSchema("any-face"),
    maximumUses: INTEGER_EXPRESSION_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
  faces: objectSchema({
    faces: arraySchema(POSITIVE_INTEGER_SCHEMA, 1),
    kind: literalSchema("faces"),
    maximumUses: INTEGER_EXPRESSION_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
});
export type DiceReplacementRule = InferExactSchema<typeof DICE_REPLACEMENT_RULE_SCHEMA>;

export const DICE_REPLACEMENT_POLICY_SCHEMA = arraySchema(DICE_REPLACEMENT_RULE_SCHEMA);
export type DiceReplacementPolicy = InferExactSchema<
  typeof DICE_REPLACEMENT_POLICY_SCHEMA
>;

/** A rejected face must be physically rerolled, repeatedly, until accepted. */
export const DICE_ACCEPTANCE_RULE_SCHEMA = objectSchema({
  kind: literalSchema("reroll-faces-until-accepted"),
  rejectedFaces: arraySchema(POSITIVE_INTEGER_SCHEMA, 1),
  ruleId: ID_SCHEMA,
  termIds: arraySchema(TERM_ID_SCHEMA, 1),
});
export type DiceAcceptanceRule = InferExactSchema<typeof DICE_ACCEPTANCE_RULE_SCHEMA>;
export const DICE_ACCEPTANCE_POLICY_SCHEMA = arraySchema(DICE_ACCEPTANCE_RULE_SCHEMA);
export type DiceAcceptancePolicy = InferExactSchema<typeof DICE_ACCEPTANCE_POLICY_SCHEMA>;

const DICE_TRAIL_OBSERVATION_SCHEMA = objectSchema({
  initialFace: POSITIVE_INTEGER_SCHEMA,
  steps: arraySchema(DICE_TRAIL_STEP_SCHEMA),
  trailId: ID_SCHEMA,
});

const DICE_AGGREGATE_OBSERVATION_SCHEMA = objectSchema({
  rollId: ID_SCHEMA,
  total: NONNEGATIVE_INTEGER_SCHEMA,
});

/** Physical facts entered by the table. Replacement order is semantically significant. */
export const DICE_OBSERVATION_SCHEMA = objectSchema({
  aggregates: arraySchema(DICE_AGGREGATE_OBSERVATION_SCHEMA),
  trails: arraySchema(DICE_TRAIL_OBSERVATION_SCHEMA),
});
export type DiceObservation = InferExactSchema<typeof DICE_OBSERVATION_SCHEMA>;
export type DiceTrailObservation = DiceObservation["trails"][number];
export type DiceTrailStep = DiceTrailObservation["steps"][number];
export type DiceReplacement = Extract<DiceTrailStep, { readonly kind: "replacement" }>;
export type DiceRequiredReroll = Extract<
  DiceTrailStep,
  { readonly kind: "required-reroll" }
>;
export type DiceAggregateObservation = DiceObservation["aggregates"][number];

export type ResolvedDiceReplacementRule =
  | {
      readonly kind: "any-face";
      readonly maximumUses: number;
      readonly sourceId: string;
    }
  | {
      readonly faces: readonly number[];
      readonly kind: "faces";
      readonly maximumUses: number;
      readonly sourceId: string;
    };

const DICE_TRAIL_REQUIREMENT_SCHEMA = objectSchema({
  maximumFace: DIE_SIDES_SCHEMA,
  minimumFace: literalSchema(1),
  operation: OPERATION_SCHEMA,
  sides: DIE_SIDES_SCHEMA,
  termId: TERM_ID_SCHEMA,
  trailId: ID_SCHEMA,
});

const DICE_AGGREGATE_REQUIREMENT_SCHEMA = objectSchema({
  count: NONNEGATIVE_INTEGER_SCHEMA,
  maximumTotal: NONNEGATIVE_INTEGER_SCHEMA,
  minimumTotal: NONNEGATIVE_INTEGER_SCHEMA,
  operation: OPERATION_SCHEMA,
  rollId: ID_SCHEMA,
  sides: DIE_SIDES_SCHEMA,
  termId: TERM_ID_SCHEMA,
});

const DICE_INTEGER_REQUIREMENT_SCHEMA = objectSchema({
  operation: OPERATION_SCHEMA,
  termId: TERM_ID_SCHEMA,
  value: SIGNED_INTEGER_SCHEMA,
});

/** Fully evaluated roll contract consumed by an input surface or automation planner. */
export const DICE_ROLL_REQUIREMENT_SCHEMA = objectSchema({
  acceptanceRules: arraySchema(DICE_ACCEPTANCE_RULE_SCHEMA),
  aggregates: arraySchema(DICE_AGGREGATE_REQUIREMENT_SCHEMA),
  deterministicTerms: arraySchema(DICE_INTEGER_REQUIREMENT_SCHEMA),
  maximumTotal: SIGNED_INTEGER_SCHEMA,
  minimumTotal: SIGNED_INTEGER_SCHEMA,
  trails: arraySchema(DICE_TRAIL_REQUIREMENT_SCHEMA),
});
export type DiceRollRequirement = InferExactSchema<typeof DICE_ROLL_REQUIREMENT_SCHEMA>;
export type DiceTrailRequirement = DiceRollRequirement["trails"][number];
export type DiceAggregateRequirement = DiceRollRequirement["aggregates"][number];
export type DiceIntegerRequirement = DiceRollRequirement["deterministicTerms"][number];

const RESOLVED_DICE_TRAIL_SCHEMA = objectSchema({
  contribution: SIGNED_INTEGER_SCHEMA,
  effectiveFace: POSITIVE_INTEGER_SCHEMA,
  initialFace: POSITIVE_INTEGER_SCHEMA,
  operation: OPERATION_SCHEMA,
  steps: arraySchema(DICE_TRAIL_STEP_SCHEMA),
  sides: DIE_SIDES_SCHEMA,
  termId: TERM_ID_SCHEMA,
  trailId: ID_SCHEMA,
});

const RESOLVED_DICE_AGGREGATE_SCHEMA = objectSchema({
  contribution: SIGNED_INTEGER_SCHEMA,
  count: NONNEGATIVE_INTEGER_SCHEMA,
  operation: OPERATION_SCHEMA,
  rollId: ID_SCHEMA,
  sides: DIE_SIDES_SCHEMA,
  termId: TERM_ID_SCHEMA,
  total: NONNEGATIVE_INTEGER_SCHEMA,
});

const RESOLVED_DICE_INTEGER_SCHEMA = objectSchema({
  contribution: SIGNED_INTEGER_SCHEMA,
  operation: OPERATION_SCHEMA,
  termId: TERM_ID_SCHEMA,
  value: SIGNED_INTEGER_SCHEMA,
});

/** Exact resolved total with every physical and deterministic contribution preserved. */
export const DICE_RESOLUTION_SCHEMA = objectSchema({
  aggregates: arraySchema(RESOLVED_DICE_AGGREGATE_SCHEMA),
  deterministicTerms: arraySchema(RESOLVED_DICE_INTEGER_SCHEMA),
  total: SIGNED_INTEGER_SCHEMA,
  trails: arraySchema(RESOLVED_DICE_TRAIL_SCHEMA),
});
export type DiceResolution = InferExactSchema<typeof DICE_RESOLUTION_SCHEMA>;
export type ResolvedDiceTrail = DiceResolution["trails"][number];
export type ResolvedDiceAggregate = DiceResolution["aggregates"][number];
export type ResolvedDiceInteger = DiceResolution["deterministicTerms"][number];

export type DiceFormulaSchemaCustomTypes = {
  readonly id: string;
  readonly "term-id": string;
  readonly "die-sides": DieSides;
  readonly "nonnegative-integer": number;
  readonly "positive-integer": number;
  readonly "signed-integer": number;
  readonly "integer-expression": IntegerExpression;
};
