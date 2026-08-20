/** Exact, locale-free facts for one physical D20 Test. */

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
import type { AbilityCode } from "@/types/ability";
import {
  DICE_REPLACEMENT_RULE_SCHEMA,
  type DiceFormula,
  type DiceObservation,
  type DiceResolution,
  type DiceRollRequirement,
  type ResolvedDiceReplacementRule,
} from "@/types/dice-formula";
import type { IntegerExpression } from "@/types/integer-expression";
import type { EntityRef } from "@/types/mechanics-reference";

const ID_SCHEMA = customSchema<"id", string>("id");
const SIGNED_INTEGER_SCHEMA = customSchema<"signed-integer", number>("signed-integer");
const ENTITY_REF_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const ABILITY_SCHEMA = customSchema<"ability", AbilityCode>("ability");
const INTEGER_EXPRESSION_SCHEMA = customSchema<"integer-expression", IntegerExpression>(
  "integer-expression"
);
const DICE_OBSERVATION_SCHEMA = customSchema<"dice-observation", DiceObservation>(
  "dice-observation"
);
const DICE_FORMULA_SCHEMA = customSchema<"dice-formula", DiceFormula>("dice-formula");
const NULL_SCHEMA = literalSchema(null);

const OUTCOME_SCHEMA = unionSchema([literalSchema("success"), literalSchema("failure")]);

const RESOLUTION_SCHEMA = discriminatedUnionSchema("kind", {
  rolled: objectSchema({ kind: literalSchema("rolled") }),
  automatic: objectSchema({
    kind: literalSchema("automatic"),
    outcome: OUTCOME_SCHEMA,
    reasonId: ID_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
  ineligible: objectSchema({
    kind: literalSchema("ineligible"),
    reasonId: ID_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
});

const MODIFIER_SCHEMA = objectSchema({
  sourceId: ID_SCHEMA,
  value: INTEGER_EXPRESSION_SCHEMA,
});

const ENTERED_MODIFIER_RULE_SCHEMA = discriminatedUnionSchema("kind", {
  exact: objectSchema({
    kind: literalSchema("exact"),
    maximum: INTEGER_EXPRESSION_SCHEMA,
    minimum: INTEGER_EXPRESSION_SCHEMA,
    required: booleanSchema,
    sourceId: ID_SCHEMA,
  }),
  "dice-formula": objectSchema({
    formula: DICE_FORMULA_SCHEMA,
    kind: literalSchema("dice-formula"),
    required: booleanSchema,
    sourceId: ID_SCHEMA,
  }),
});

const FACE_FLOOR_RULE_SCHEMA = objectSchema({
  minimumFace: INTEGER_EXPRESSION_SCHEMA,
  sourceId: ID_SCHEMA,
});

const TOTAL_FLOOR_RULE_SCHEMA = objectSchema({
  minimumTotal: INTEGER_EXPRESSION_SCHEMA,
  sourceId: ID_SCHEMA,
});

const SUBSTITUTION_RULE_SCHEMA = objectSchema({
  face: INTEGER_EXPRESSION_SCHEMA,
  sourceId: ID_SCHEMA,
});

const REPLACEMENT_RULE_SCHEMA = objectSchema({
  appliesTo: unionSchema([literalSchema("d20"), literalSchema("any-die")]),
  rule: DICE_REPLACEMENT_RULE_SCHEMA,
});

const ROLL_RULES_SCHEMA = objectSchema({
  advantageSourceIds: arraySchema(ID_SCHEMA),
  disadvantageSourceIds: arraySchema(ID_SCHEMA),
  extraD20SourceIds: arraySchema(ID_SCHEMA),
  faceFloors: arraySchema(FACE_FLOOR_RULE_SCHEMA),
  replacements: arraySchema(REPLACEMENT_RULE_SCHEMA),
  substitutions: arraySchema(SUBSTITUTION_RULE_SCHEMA),
  totalFloors: arraySchema(TOTAL_FLOOR_RULE_SCHEMA),
});

const COMMON_REQUEST_FIELDS = {
  actor: ENTITY_REF_SCHEMA,
  enteredModifiers: arraySchema(ENTERED_MODIFIER_RULE_SCHEMA),
  modifiers: arraySchema(MODIFIER_SCHEMA),
  resolution: RESOLUTION_SCHEMA,
  rollRules: ROLL_RULES_SCHEMA,
  testId: ID_SCHEMA,
} as const;

/** One authored test. Initiative is an Ability Check whose `difficultyClass` is `null`. */
export const D20_TEST_REQUEST_SCHEMA = discriminatedUnionSchema("kind", {
  attack: objectSchema({
    ...COMMON_REQUEST_FIELDS,
    armorClass: INTEGER_EXPRESSION_SCHEMA,
    automaticCriticalSourceIds: arraySchema(ID_SCHEMA),
    criticalThreshold: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("attack"),
    target: ENTITY_REF_SCHEMA,
  }),
  "ability-check": objectSchema({
    ...COMMON_REQUEST_FIELDS,
    ability: ABILITY_SCHEMA,
    difficultyClass: unionSchema([INTEGER_EXPRESSION_SCHEMA, NULL_SCHEMA]),
    kind: literalSchema("ability-check"),
    target: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
  }),
  "saving-throw": objectSchema({
    ...COMMON_REQUEST_FIELDS,
    ability: ABILITY_SCHEMA,
    difficultyClass: INTEGER_EXPRESSION_SCHEMA,
    kind: literalSchema("saving-throw"),
    target: unionSchema([ENTITY_REF_SCHEMA, NULL_SCHEMA]),
  }),
  "death-save": objectSchema({
    ...COMMON_REQUEST_FIELDS,
    kind: literalSchema("death-save"),
    recoveryThreshold: INTEGER_EXPRESSION_SCHEMA,
    target: NULL_SCHEMA,
  }),
});

export type D20TestRequest = InferExactSchema<typeof D20_TEST_REQUEST_SCHEMA>;
export type D20TestKind = D20TestRequest["kind"];
export type D20ResolutionFact = D20TestRequest["resolution"];
export type D20Modifier = D20TestRequest["modifiers"][number];
export type D20EnteredModifierRule = D20TestRequest["enteredModifiers"][number];
export type D20RollRules = D20TestRequest["rollRules"];
export type D20FaceFloorRule = D20RollRules["faceFloors"][number];
export type D20ReplacementRule = D20RollRules["replacements"][number];
export type D20SubstitutionRule = D20RollRules["substitutions"][number];
export type D20TotalFloorRule = D20RollRules["totalFloors"][number];

const ENTERED_MODIFIER_SCHEMA = discriminatedUnionSchema("kind", {
  exact: objectSchema({
    kind: literalSchema("exact"),
    sourceId: ID_SCHEMA,
    value: SIGNED_INTEGER_SCHEMA,
  }),
  "dice-formula": objectSchema({
    kind: literalSchema("dice-formula"),
    observation: DICE_OBSERVATION_SCHEMA,
    sourceId: ID_SCHEMA,
  }),
});

const SUBSTITUTION_OBSERVATION_SCHEMA = objectSchema({
  kind: literalSchema("substitution"),
  sourceId: ID_SCHEMA,
});

const TABLE_OVERRIDE_COMMON_FIELDS = {
  reasonId: ID_SCHEMA,
  sourceId: ID_SCHEMA,
} as const;

const TABLE_OVERRIDE_SCHEMA = discriminatedUnionSchema("kind", {
  attack: objectSchema({
    ...TABLE_OVERRIDE_COMMON_FIELDS,
    critical: booleanSchema,
    hit: booleanSchema,
    kind: literalSchema("attack"),
  }),
  "death-save": objectSchema({
    ...TABLE_OVERRIDE_COMMON_FIELDS,
    kind: literalSchema("death-save"),
    result: unionSchema([
      literalSchema("one-success"),
      literalSchema("one-failure"),
      literalSchema("two-failures"),
      literalSchema("regain-one-hit-point"),
    ]),
  }),
  outcome: objectSchema({
    ...TABLE_OVERRIDE_COMMON_FIELDS,
    kind: literalSchema("outcome"),
    outcome: OUTCOME_SCHEMA,
  }),
});

/** Entered table facts. Resource spending is planned outside this value. */
export const D20_TEST_OBSERVATION_SCHEMA = objectSchema({
  d20: unionSchema([
    DICE_OBSERVATION_SCHEMA,
    SUBSTITUTION_OBSERVATION_SCHEMA,
    NULL_SCHEMA,
  ]),
  enteredModifiers: arraySchema(ENTERED_MODIFIER_SCHEMA),
  tableOverride: unionSchema([TABLE_OVERRIDE_SCHEMA, NULL_SCHEMA]),
});

export type D20TestObservation = InferExactSchema<typeof D20_TEST_OBSERVATION_SCHEMA>;
export type D20EnteredModifier = D20TestObservation["enteredModifiers"][number];
export type D20TableOverride = Exclude<D20TestObservation["tableOverride"], null>;
export type D20SubstitutionObservation = Extract<
  Exclude<D20TestObservation["d20"], DiceObservation | null>,
  { readonly kind: "substitution" }
>;

export type D20RollMode =
  | "normal"
  | "advantage"
  | "disadvantage"
  | "cancelled"
  | "not-rolled";

export interface ResolvedD20Modifier {
  readonly sourceId: string;
  readonly value: number;
}

export type ResolvedD20EnteredModifierRule =
  | {
      readonly kind: "exact";
      readonly maximum: number;
      readonly minimum: number;
      readonly required: boolean;
      readonly sourceId: string;
    }
  | {
      readonly kind: "dice-formula";
      readonly required: boolean;
      readonly requirement: Readonly<DiceRollRequirement>;
      readonly sourceId: string;
    };

export interface ResolvedD20FaceFloorRule {
  readonly minimumFace: number;
  readonly sourceId: string;
}

export interface ResolvedD20TotalFloorRule {
  readonly minimumTotal: number;
  readonly sourceId: string;
}

export interface ResolvedD20SubstitutionRule {
  readonly face: number;
  readonly sourceId: string;
}

export interface ResolvedD20ReplacementRule {
  readonly appliesTo: "d20" | "any-die";
  readonly rule: Readonly<ResolvedDiceReplacementRule>;
}

export interface D20TargetNumber {
  readonly kind: "armor-class" | "difficulty-class";
  readonly value: number;
}

/** Concrete input contract shown by a review surface before physical entry. */
export interface D20TestReview {
  readonly criticalThreshold: number | null;
  readonly deterministicModifier: number;
  readonly d20Requirement: Readonly<DiceRollRequirement> | null;
  readonly enteredModifiers: readonly ResolvedD20EnteredModifierRule[];
  readonly faceFloors: readonly ResolvedD20FaceFloorRule[];
  readonly mode: D20RollMode;
  readonly modifiers: readonly ResolvedD20Modifier[];
  readonly recoveryThreshold: number | null;
  readonly replacements: readonly ResolvedD20ReplacementRule[];
  readonly request: Readonly<D20TestRequest>;
  readonly substitutions: readonly ResolvedD20SubstitutionRule[];
  readonly targetNumber: D20TargetNumber | null;
  readonly totalFloors: readonly ResolvedD20TotalFloorRule[];
}

export type ResolvedD20EnteredModifier =
  | {
      readonly kind: "exact";
      readonly sourceId: string;
      readonly value: number;
    }
  | {
      readonly kind: "dice-formula";
      readonly resolution: Readonly<DiceResolution>;
      readonly sourceId: string;
      readonly value: number;
    };

export type D20OutcomeStatus = "success" | "failure" | "total-only" | "ineligible";
export type D20OutcomeBasis = "roll" | "automatic" | "ineligible" | "table-override";
export type D20OutcomeId =
  | "hit"
  | "miss"
  | "critical-hit"
  | "success"
  | "failure"
  | "total-only"
  | "ineligible"
  | "death-save-success"
  | "death-save-failure"
  | "death-save-natural-one"
  | "death-save-two-failures"
  | "death-save-recovery";

interface D20OutcomeBase {
  readonly basis: D20OutcomeBasis;
  readonly outcomeId: D20OutcomeId;
  readonly status: D20OutcomeStatus;
}

export interface D20AttackOutcome extends D20OutcomeBase {
  readonly appliedAutomaticCriticalSourceIds: readonly string[];
  readonly critical: boolean;
  readonly criticalThreshold: number;
  readonly hit: boolean;
  readonly kind: "attack";
  readonly naturalCritical: boolean;
  readonly naturalOne: boolean;
}

export interface D20OrdinaryOutcome extends D20OutcomeBase {
  readonly kind: "ability-check" | "saving-throw";
}

export interface D20DeathSaveOutcome extends D20OutcomeBase {
  readonly failures: 0 | 1 | 2;
  readonly hitPointsRegained: 0 | 1;
  readonly kind: "death-save";
  readonly naturalOne: boolean;
  readonly recoveryBenefit: boolean;
  readonly recoveryThreshold: number;
  readonly successes: 0 | 1;
}

export type D20Outcome = D20AttackOutcome | D20OrdinaryOutcome | D20DeathSaveOutcome;

/** Fully evaluated, immutable table fact. It is not a persistence format. */
export interface D20TestResult {
  readonly appliedFaceFloorSourceIds: readonly string[];
  readonly appliedSubstitution: ResolvedD20SubstitutionRule | null;
  readonly appliedTotalFloorSourceIds: readonly string[];
  readonly computedOutcome: D20Outcome;
  readonly effectiveFace: number | null;
  readonly enteredModifierTotal: number;
  readonly margin: number | null;
  readonly observation: Readonly<D20TestObservation>;
  readonly outcome: D20Outcome;
  readonly preFloorTotal: number | null;
  readonly review: D20TestReview;
  readonly resolvedEnteredModifiers: readonly ResolvedD20EnteredModifier[];
  readonly selectedNaturalFace: number | null;
  readonly selectedTrailId: string | null;
  readonly total: number | null;
}

export type D20TestSchemaCustomTypes = {
  readonly ability: AbilityCode;
  readonly "dice-formula": DiceFormula;
  readonly "dice-observation": DiceObservation;
  readonly "entity-ref": EntityRef;
  readonly id: string;
  readonly "integer-expression": IntegerExpression;
  readonly "positive-integer": number;
  readonly "signed-integer": number;
};
