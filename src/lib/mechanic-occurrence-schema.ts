/** Exact structural grammar for active mechanical occurrences and their references. */

import {
  arraySchema,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  recordSchema,
  refSchema,
  stringSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import {
  CLOCK_REF_SCHEMA,
  ENTITY_REF_SCHEMA,
  MATERIAL_REF_SCHEMA,
  OCCURRENCE_GENERATION_REF_SCHEMA,
  type ClockRefSchemaShape,
  type EntityRefSchemaShape,
  type MaterialRefSchemaShape,
  type OccurrenceGenerationRefSchemaShape,
} from "@/lib/mechanics-reference-schema";
import { NON_EXHAUSTION_CONDITION_ID_SCHEMA } from "@/types/condition";
import { DAMAGE_DEFENSE_RULE_SCHEMA, type DamageDefenseRule } from "@/types/damage";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

const ID_SCHEMA = customSchema<"id", string>("id");
const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const NULL_SCHEMA = literalSchema(null);

const CLOCK_REF = refSchema<"clock-ref", ClockRefSchemaShape>("clock-ref");
const ENTITY_REF = refSchema<"entity-ref", EntityRefSchemaShape>("entity-ref");
const DAMAGE_DEFENSE_RULE = refSchema<"damage-defense-rule", DamageDefenseRule>(
  "damage-defense-rule"
);
const PROGRAM_AUTHORITY = customSchema<
  "mechanics-program-authority-receipt",
  MechanicsProgramAuthorityReceipt
>("mechanics-program-authority-receipt");

const OBSERVED_MECHANICS_BOUNDARY_VARIANTS = {
  "combat-end": objectSchema({
    clock: CLOCK_REF,
    kind: literalSchema("combat-end"),
  }),
  "day-phase": objectSchema({
    clock: CLOCK_REF,
    kind: literalSchema("day-phase"),
    phase: unionSchema([literalSchema("dawn"), literalSchema("dusk")]),
  }),
  "rest-completed": objectSchema({
    clock: CLOCK_REF,
    combatant: ENTITY_REF,
    kind: literalSchema("rest-completed"),
    rest: unionSchema([literalSchema("short"), literalSchema("long")]),
  }),
  "time-reached": objectSchema({
    clock: CLOCK_REF,
    elapsedSeconds: NONNEGATIVE_INTEGER_SCHEMA,
    kind: literalSchema("time-reached"),
  }),
  "turn-boundary": objectSchema({
    clock: CLOCK_REF,
    combatant: ENTITY_REF,
    kind: literalSchema("turn-boundary"),
    phase: unionSchema([literalSchema("start"), literalSchema("end")]),
    round: POSITIVE_INTEGER_SCHEMA,
  }),
} as const;

/** Resolved runtime expirations; program phase rules freeze one execution. */
export const END_RULE_SCHEMA = discriminatedUnionSchema("kind", {
  ...OBSERVED_MECHANICS_BOUNDARY_VARIANTS,
  "occurrence-end": objectSchema({
    kind: literalSchema("occurrence-end"),
    occurrenceId: ID_SCHEMA,
  }),
  "program-phase-end": objectSchema({
    execution: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("program-phase-end"),
    occurrenceId: ID_SCHEMA,
    phaseId: ID_SCHEMA,
  }),
  "temporary-hp-empty": objectSchema({ kind: literalSchema("temporary-hp-empty") }),
});

export type EndRuleSchemaShape = InferExactSchema<typeof END_RULE_SCHEMA>;
const END_RULE = refSchema<"end-rule", EndRuleSchemaShape>("end-rule");

export const OBSERVED_MECHANICS_BOUNDARY_SCHEMA = discriminatedUnionSchema("kind", {
  ...OBSERVED_MECHANICS_BOUNDARY_VARIANTS,
});

export type ObservedMechanicsBoundarySchemaShape = InferExactSchema<
  typeof OBSERVED_MECHANICS_BOUNDARY_SCHEMA
>;
const OBSERVED_MECHANICS_BOUNDARY = refSchema<
  "observed-mechanics-boundary",
  ObservedMechanicsBoundarySchemaShape
>("observed-mechanics-boundary");
const OCCURRENCE_GENERATION_REF = refSchema<
  "occurrence-generation-ref",
  OccurrenceGenerationRefSchemaShape
>("occurrence-generation-ref");

export const MECHANICS_END_CAUSE_SCHEMA = discriminatedUnionSchema("kind", {
  "concentration-broken": objectSchema({
    kind: literalSchema("concentration-broken"),
  }),
  "dependency-ended": objectSchema({
    dependency: OCCURRENCE_GENERATION_REF,
    kind: literalSchema("dependency-ended"),
  }),
  "explicit-boundary": objectSchema({
    boundary: OBSERVED_MECHANICS_BOUNDARY,
    kind: literalSchema("explicit-boundary"),
  }),
  "live-entity-missing": objectSchema({
    entity: ENTITY_REF,
    kind: literalSchema("live-entity-missing"),
  }),
  requested: objectSchema({ kind: literalSchema("requested") }),
  "temporary-hit-points-empty": objectSchema({
    kind: literalSchema("temporary-hit-points-empty"),
  }),
});

export type MechanicsEndCauseSchemaShape = InferExactSchema<
  typeof MECHANICS_END_CAUSE_SCHEMA
>;
const MECHANICS_END_CAUSE = refSchema<
  "mechanics-end-cause",
  MechanicsEndCauseSchemaShape
>("mechanics-end-cause");
const OCCURRENCE_ENDING_SCHEMA = objectSchema({
  causes: arraySchema(MECHANICS_END_CAUSE, 1),
});

export const JSON_SCALAR_SCHEMA = unionSchema([
  stringSchema,
  numberSchema,
  booleanSchema,
  NULL_SCHEMA,
]);

export type JsonScalarSchemaShape = InferExactSchema<typeof JSON_SCALAR_SCHEMA>;

/** Durable exact-once state for one declared program phase. */
export const PROGRAM_PHASE_STATE_ENTRY_SCHEMA = objectSchema({
  execution: NONNEGATIVE_INTEGER_SCHEMA,
  lastTriggerEventId: unionSchema([ID_SCHEMA, NULL_SCHEMA]),
});

export type ProgramPhaseStateEntrySchemaShape = InferExactSchema<
  typeof PROGRAM_PHASE_STATE_ENTRY_SCHEMA
>;

/** The keys are the program's complete declared phase set. */
export const PROGRAM_PHASE_STATE_SCHEMA = recordSchema(
  "string",
  PROGRAM_PHASE_STATE_ENTRY_SCHEMA
);

export type ProgramPhaseStateSchemaShape = InferExactSchema<
  typeof PROGRAM_PHASE_STATE_SCHEMA
>;

export const STANDING_FACT_SCHEMA = discriminatedUnionSchema("kind", {
  "active-key": objectSchema({
    key: ID_SCHEMA,
    kind: literalSchema("active-key"),
  }),
  "condition-immunity": objectSchema({
    conditionId: ID_SCHEMA,
    kind: literalSchema("condition-immunity"),
  }),
  "damage-defense": objectSchema({
    kind: literalSchema("damage-defense"),
    rule: DAMAGE_DEFENSE_RULE,
  }),
  "grant-group": objectSchema({
    groupId: ID_SCHEMA,
    kind: literalSchema("grant-group"),
  }),
  "program-fact": objectSchema({
    factId: ID_SCHEMA,
    kind: literalSchema("program-fact"),
    value: JSON_SCALAR_SCHEMA,
  }),
  "target-mark": objectSchema({
    kind: literalSchema("target-mark"),
    markId: ID_SCHEMA,
    marked: ENTITY_REF,
  }),
});

export type StandingFactSchemaShape = InferExactSchema<typeof STANDING_FACT_SCHEMA>;
const STANDING_FACT = refSchema<"standing-fact", StandingFactSchemaShape>(
  "standing-fact"
);

const EFFECT_BASE = {
  endRules: arraySchema(END_RULE),
  parentId: ID_SCHEMA,
  target: ENTITY_REF,
} as const;

function occurrenceSchema<
  const Persistence extends Readonly<
    Record<string, import("@/lib/exact-schema").ExactSchema>
  >,
>(persistence: Persistence) {
  const effect = { ...EFFECT_BASE, ...persistence };
  return discriminatedUnionSchema("kind", {
    concentration: objectSchema({ ...effect, kind: literalSchema("concentration") }),
    condition: objectSchema(
      {
        ...effect,
        conditionId: NON_EXHAUSTION_CONDITION_ID_SCHEMA,
        kind: literalSchema("condition"),
      },
      { hidden: objectSchema({ findDc: NONNEGATIVE_INTEGER_SCHEMA }) }
    ),
    "material-lifecycle": objectSchema({
      ...effect,
      kind: literalSchema("material-lifecycle"),
    }),
    "polymorph-form": objectSchema({
      ...effect,
      formId: ID_SCHEMA,
      kind: literalSchema("polymorph-form"),
    }),
    program: objectSchema({
      ...persistence,
      authority: PROGRAM_AUTHORITY,
      endRules: arraySchema(END_RULE),
      kind: literalSchema("program"),
      phaseState: PROGRAM_PHASE_STATE_SCHEMA,
      registers: recordSchema("string", JSON_SCALAR_SCHEMA),
    }),
    standing: objectSchema({
      ...effect,
      fact: STANDING_FACT,
      kind: literalSchema("standing"),
    }),
  });
}

export const NEW_MECHANIC_OCCURRENCE_SCHEMA = occurrenceSchema({});
export const MECHANIC_OCCURRENCE_SCHEMA = occurrenceSchema({
  ending: unionSchema([OCCURRENCE_ENDING_SCHEMA, NULL_SCHEMA]),
  ordinal: POSITIVE_INTEGER_SCHEMA,
});

export type NewMechanicOccurrenceSchemaShape = InferExactSchema<
  typeof NEW_MECHANIC_OCCURRENCE_SCHEMA
>;
export type MechanicOccurrenceSchemaShape = InferExactSchema<
  typeof MECHANIC_OCCURRENCE_SCHEMA
>;

export const OCCURRENCE_STATE_SCHEMA = objectSchema({
  nextOccurrenceOrdinal: POSITIVE_INTEGER_SCHEMA,
  occurrences: recordSchema("string", MECHANIC_OCCURRENCE_SCHEMA),
});

export type OccurrenceStateSchemaShape = InferExactSchema<typeof OCCURRENCE_STATE_SCHEMA>;

export type MechanicOccurrenceSchemaCustomTypes = {
  readonly "flat-adjustment": number;
  readonly id: string;
  readonly "material-entity-id": string;
  readonly "mechanics-program-authority-receipt": MechanicsProgramAuthorityReceipt;
  readonly "nonnegative-integer": number;
  readonly "positive-integer": number;
};

export type MechanicOccurrenceSchemaRefTypes = {
  readonly "clock-ref": ClockRefSchemaShape;
  readonly "damage-defense-rule": DamageDefenseRule;
  readonly "entity-ref": EntityRefSchemaShape;
  readonly "end-rule": EndRuleSchemaShape;
  readonly "material-ref": MaterialRefSchemaShape;
  readonly "mechanics-end-cause": MechanicsEndCauseSchemaShape;
  readonly "observed-mechanics-boundary": ObservedMechanicsBoundarySchemaShape;
  readonly "occurrence-generation-ref": OccurrenceGenerationRefSchemaShape;
  readonly "standing-fact": StandingFactSchemaShape;
};

export const MECHANIC_OCCURRENCE_SCHEMA_REFS = {
  "clock-ref": CLOCK_REF_SCHEMA,
  "damage-defense-rule": DAMAGE_DEFENSE_RULE_SCHEMA,
  "entity-ref": ENTITY_REF_SCHEMA,
  "end-rule": END_RULE_SCHEMA,
  "material-ref": MATERIAL_REF_SCHEMA,
  "mechanics-end-cause": MECHANICS_END_CAUSE_SCHEMA,
  "observed-mechanics-boundary": OBSERVED_MECHANICS_BOUNDARY_SCHEMA,
  "occurrence-generation-ref": OCCURRENCE_GENERATION_REF_SCHEMA,
  "standing-fact": STANDING_FACT_SCHEMA,
} as const;
