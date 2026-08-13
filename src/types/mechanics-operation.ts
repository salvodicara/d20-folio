/** Exact commands and transient plans for atomic mechanics-world operations. */

import {
  arraySchema,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  objectSchema,
  recordSchema,
  unionSchema,
  type InferExactSchema,
} from "@/lib/exact-schema";
import type { CanonicalFingerprint } from "@/lib/canonical-fingerprint";
import type {
  ActionFactGuard,
  JournalActionDraft,
  JournalActorRef,
} from "@/types/action-journal";
import type { DamageResolution } from "@/types/damage";
import { EXHAUSTION_LEVEL_SCHEMA, type ExhaustionLevel } from "@/types/condition";
import type { DiceObservation, DiceRollRequirement } from "@/types/dice-formula";
import type { IntegerBindings } from "@/types/integer-expression";
import type { NewMechanicOccurrence } from "@/types/mechanic-occurrence";
import {
  END_RULE_SCHEMA,
  JSON_SCALAR_SCHEMA,
  PROGRAM_PHASE_STATE_SCHEMA,
} from "@/lib/mechanic-occurrence-schema";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { EntityRef, MaterialRef, OccurrenceRef } from "@/types/mechanics-reference";
import type { MechanicsWorld } from "@/types/mechanics-world";
import {
  RESOURCE_INITIALIZATION_OBSERVATIONS_SCHEMA,
  type ResourceCell,
  type ResourceInitializationObservations,
  type ResourceOperation,
  type ResourceRef,
  type ResourceRejection,
  type ResourceSpec,
  type ResourceTransitionFacts,
} from "@/types/resource";
import {
  CREATURE_HEALING_INPUT_SCHEMA,
  CREATURE_MAXIMUM_SYNC_INPUT_SCHEMA,
  CREATURE_REVIVAL_INPUT_SCHEMA,
  CREATURE_ZERO_HIT_POINTS_INPUT_SCHEMA,
  DEATH_SAVE_OUTCOME_SCHEMA,
  OBJECT_HIT_POINT_INPUT_SCHEMA,
  TEMPORARY_HIT_POINTS_CLEAR_SCHEMA,
  TEMPORARY_HIT_POINTS_GRANT_SCHEMA,
  ZERO_HIT_POINTS_POLICY_SCHEMA,
  type CreatureDamageFacts,
  type CreatureHealingFacts,
  type CreatureMaximumSyncFacts,
  type CreatureRevivalFacts,
  type ObjectDamageFacts,
  type ObjectMaximumSyncFacts,
  type ObjectRepairFacts,
} from "@/types/vitals";

const ID_SCHEMA = customSchema<"id", string>("id");
const ENTITY_REF_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const NULLABLE_ENTITY_REF_SCHEMA = unionSchema([ENTITY_REF_SCHEMA, literalSchema(null)]);
const MATERIAL_REF_VALUE_SCHEMA = customSchema<"material-ref", MaterialRef>(
  "material-ref"
);
type NewEffectOccurrence = Exclude<NewMechanicOccurrence, { readonly kind: "program" }>;
const NEW_EFFECT_OCCURRENCE_VALUE_SCHEMA = customSchema<
  "new-effect-occurrence",
  NewEffectOccurrence
>("new-effect-occurrence");
const NEW_PROGRAM_OCCURRENCE_SCHEMA = objectSchema({
  endRules: arraySchema(END_RULE_SCHEMA),
  kind: literalSchema("program"),
  phaseState: PROGRAM_PHASE_STATE_SCHEMA,
  registers: recordSchema("string", JSON_SCALAR_SCHEMA),
});
const OCCURRENCE_REF_VALUE_SCHEMA = customSchema<"occurrence-ref", OccurrenceRef>(
  "occurrence-ref"
);
const INTEGER_BINDINGS_VALUE_SCHEMA = customSchema<"integer-bindings", IntegerBindings>(
  "integer-bindings"
);
const RESOURCE_OPERATION_VALUE_SCHEMA = customSchema<
  "resource-operation",
  ResourceOperation
>("resource-operation");
const RESOURCE_REF_VALUE_SCHEMA = customSchema<"resource-ref", ResourceRef>(
  "resource-ref"
);
const RESOURCE_SPEC_VALUE_SCHEMA = customSchema<"resource-spec", ResourceSpec>(
  "resource-spec"
);
const JOURNAL_ACTOR_SCHEMA = customSchema<"journal-actor", JournalActorRef>(
  "journal-actor"
);
const ACTION_FACT_SCHEMA = customSchema<"action-fact", ActionFactGuard>("action-fact");
const CANONICAL_FINGERPRINT_SCHEMA = customSchema<
  "canonical-fingerprint",
  CanonicalFingerprint
>("canonical-fingerprint");
const MECHANICS_INVOCATION_REF_VALUE_SCHEMA = customSchema<
  "mechanics-invocation-ref",
  MechanicsInvocationRef
>("mechanics-invocation-ref");
const MECHANICS_PROGRAM_AUTHORITY_RECEIPT_VALUE_SCHEMA = customSchema<
  "mechanics-program-authority-receipt",
  MechanicsProgramAuthorityReceipt
>("mechanics-program-authority-receipt");
export const MECHANICS_OPERATION_CAUSE_SCHEMA = objectSchema({
  authority: MECHANICS_PROGRAM_AUTHORITY_RECEIPT_VALUE_SCHEMA,
  causeId: CANONICAL_FINGERPRINT_SCHEMA,
  invocation: MECHANICS_INVOCATION_REF_VALUE_SCHEMA,
});

export type MechanicsOperationCause = InferExactSchema<
  typeof MECHANICS_OPERATION_CAUSE_SCHEMA,
  {
    readonly "canonical-fingerprint": CanonicalFingerprint;
    readonly "mechanics-invocation-ref": MechanicsInvocationRef;
    readonly "mechanics-program-authority-receipt": MechanicsProgramAuthorityReceipt;
  }
>;
const MECHANICS_OPERATION_CAUSE_VALUE_SCHEMA = customSchema<
  "mechanics-operation-cause",
  MechanicsOperationCause
>("mechanics-operation-cause");
const DAMAGE_RESOLUTION_VALUE_SCHEMA = customSchema<
  "damage-resolution",
  DamageResolution
>("damage-resolution");
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);

export const HIT_POINT_MAXIMUM_FACT_ADDRESS = ["hit-point-maximum"] as const;

/** Damage has no separate canonical vitals input, so external evidence carries its value. */
export const HIT_POINT_MAXIMUM_EVIDENCE_SCHEMA = discriminatedUnionSchema("kind", {
  fact: objectSchema({
    kind: literalSchema("fact"),
    value: POSITIVE_INTEGER_SCHEMA,
  }),
  material: objectSchema({ kind: literalSchema("material") }),
});

export type HitPointMaximumEvidence = InferExactSchema<
  typeof HIT_POINT_MAXIMUM_EVIDENCE_SCHEMA,
  MechanicsOperationSchemaCustomTypes
>;

/** Canonical vitals inputs already carry the value; this field records only its authority. */
export const HIT_POINT_MAXIMUM_SOURCE_SCHEMA = discriminatedUnionSchema("kind", {
  fact: objectSchema({ kind: literalSchema("fact") }),
  material: objectSchema({ kind: literalSchema("material") }),
});

export type HitPointMaximumSource = InferExactSchema<
  typeof HIT_POINT_MAXIMUM_SOURCE_SCHEMA
>;

const OPERATION_COMMON_SCHEMA = {
  causeId: CANONICAL_FINGERPRINT_SCHEMA,
  operationId: ID_SCHEMA,
} as const;

const TARGETED_OPERATION_SCHEMA = {
  ...OPERATION_COMMON_SCHEMA,
  target: ENTITY_REF_SCHEMA,
} as const;

const MAXIMUM_BOUND_OPERATION_SCHEMA = {
  ...TARGETED_OPERATION_SCHEMA,
  maximumHitPointsSource: HIT_POINT_MAXIMUM_SOURCE_SCHEMA,
} as const;

export const EXHAUSTION_TRANSITION_SCHEMA = discriminatedUnionSchema("kind", {
  gain: objectSchema({ amount: POSITIVE_INTEGER_SCHEMA, kind: literalSchema("gain") }),
  remove: objectSchema({
    amount: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("remove"),
  }),
  set: objectSchema({ kind: literalSchema("set"), level: EXHAUSTION_LEVEL_SCHEMA }),
});

export type ExhaustionTransition = InferExactSchema<
  typeof EXHAUSTION_TRANSITION_SCHEMA,
  MechanicsOperationSchemaCustomTypes
>;

const CONDITION_IMMUNITY_OVERRIDE_SCHEMA = unionSchema([
  objectSchema({ reasonId: ID_SCHEMA }),
  literalSchema(null),
]);

/** DamageResolution owns the sole target identity for both damage variants. */
export const MECHANICS_OPERATION_SCHEMA = discriminatedUnionSchema("kind", {
  "creature-damage": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    attacker: NULLABLE_ENTITY_REF_SCHEMA,
    criticalHit: booleanSchema,
    damage: DAMAGE_RESOLUTION_VALUE_SCHEMA,
    kind: literalSchema("creature-damage"),
    maximumHitPoints: HIT_POINT_MAXIMUM_EVIDENCE_SCHEMA,
    zeroHitPointsPolicy: ZERO_HIT_POINTS_POLICY_SCHEMA,
  }),
  "object-damage": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    attacker: NULLABLE_ENTITY_REF_SCHEMA,
    criticalHit: booleanSchema,
    damage: DAMAGE_RESOLUTION_VALUE_SCHEMA,
    kind: literalSchema("object-damage"),
    maximumHitPoints: HIT_POINT_MAXIMUM_EVIDENCE_SCHEMA,
  }),
  "creature-healing": objectSchema({
    ...MAXIMUM_BOUND_OPERATION_SCHEMA,
    input: CREATURE_HEALING_INPUT_SCHEMA,
    kind: literalSchema("creature-healing"),
  }),
  "object-repair": objectSchema({
    ...MAXIMUM_BOUND_OPERATION_SCHEMA,
    input: OBJECT_HIT_POINT_INPUT_SCHEMA,
    kind: literalSchema("object-repair"),
  }),
  "temporary-hit-points-grant": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    grant: TEMPORARY_HIT_POINTS_GRANT_SCHEMA,
    kind: literalSchema("temporary-hit-points-grant"),
  }),
  "temporary-hit-points-clear": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    clear: TEMPORARY_HIT_POINTS_CLEAR_SCHEMA,
    kind: literalSchema("temporary-hit-points-clear"),
  }),
  "creature-stabilize": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    kind: literalSchema("creature-stabilize"),
  }),
  "creature-kill": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    kind: literalSchema("creature-kill"),
  }),
  "creature-reduce-to-zero": objectSchema({
    ...MAXIMUM_BOUND_OPERATION_SCHEMA,
    input: CREATURE_ZERO_HIT_POINTS_INPUT_SCHEMA,
    kind: literalSchema("creature-reduce-to-zero"),
  }),
  "creature-revive": objectSchema({
    ...MAXIMUM_BOUND_OPERATION_SCHEMA,
    input: CREATURE_REVIVAL_INPUT_SCHEMA,
    kind: literalSchema("creature-revive"),
  }),
  "creature-death-save": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    kind: literalSchema("creature-death-save"),
    outcome: DEATH_SAVE_OUTCOME_SCHEMA,
  }),
  "creature-maximum-sync": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    input: CREATURE_MAXIMUM_SYNC_INPUT_SCHEMA,
    kind: literalSchema("creature-maximum-sync"),
  }),
  "object-maximum-sync": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    input: CREATURE_MAXIMUM_SYNC_INPUT_SCHEMA,
    kind: literalSchema("object-maximum-sync"),
  }),
  "occurrence-create": unionSchema([
    objectSchema({
      ...OPERATION_COMMON_SCHEMA,
      kind: literalSchema("occurrence-create"),
      material: MATERIAL_REF_VALUE_SCHEMA,
      occurrence: NEW_PROGRAM_OCCURRENCE_SCHEMA,
      occurrenceId: ID_SCHEMA,
    }),
    objectSchema({
      ...OPERATION_COMMON_SCHEMA,
      conditionImmunityOverride: CONDITION_IMMUNITY_OVERRIDE_SCHEMA,
      kind: literalSchema("occurrence-create"),
      material: MATERIAL_REF_VALUE_SCHEMA,
      occurrence: NEW_EFFECT_OCCURRENCE_VALUE_SCHEMA,
      occurrenceId: ID_SCHEMA,
    }),
  ]),
  "occurrence-end": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    kind: literalSchema("occurrence-end"),
    occurrence: OCCURRENCE_REF_VALUE_SCHEMA,
  }),
  "exhaustion-transition": objectSchema({
    ...TARGETED_OPERATION_SCHEMA,
    kind: literalSchema("exhaustion-transition"),
    transition: EXHAUSTION_TRANSITION_SCHEMA,
  }),
  "resource-transition": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    bindings: INTEGER_BINDINGS_VALUE_SCHEMA,
    kind: literalSchema("resource-transition"),
    resource: RESOURCE_REF_VALUE_SCHEMA,
    spec: RESOURCE_SPEC_VALUE_SCHEMA,
    transition: RESOURCE_OPERATION_VALUE_SCHEMA,
  }),
  "resource-initialize": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    bindings: INTEGER_BINDINGS_VALUE_SCHEMA,
    kind: literalSchema("resource-initialize"),
    observations: RESOURCE_INITIALIZATION_OBSERVATIONS_SCHEMA,
    resource: RESOURCE_REF_VALUE_SCHEMA,
    spec: RESOURCE_SPEC_VALUE_SCHEMA,
  }),
  "resource-remove": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    kind: literalSchema("resource-remove"),
    resource: RESOURCE_REF_VALUE_SCHEMA,
  }),
});

/**
 * One reviewed table action. Operations are ordered game consequences; only the
 * envelope owns action identity and actor, so any multi-target or cascading
 * resolution becomes one atomic journal entry.
 */
export const MECHANICS_TRANSACTION_SCHEMA = objectSchema({
  actionId: ID_SCHEMA,
  actor: JOURNAL_ACTOR_SCHEMA,
  causes: arraySchema(MECHANICS_OPERATION_CAUSE_VALUE_SCHEMA, 1),
  factGuards: arraySchema(ACTION_FACT_SCHEMA),
  operations: arraySchema(MECHANICS_OPERATION_SCHEMA, 1),
});

export type MechanicsOperation = InferExactSchema<
  typeof MECHANICS_OPERATION_SCHEMA,
  MechanicsOperationSchemaCustomTypes
>;

export type MechanicsTransaction = InferExactSchema<
  typeof MECHANICS_TRANSACTION_SCHEMA,
  MechanicsOperationSchemaCustomTypes
>;

export type MechanicsOperationSchemaCustomTypes = {
  readonly "action-fact": ActionFactGuard;
  readonly "canonical-fingerprint": CanonicalFingerprint;
  readonly "damage-resolution": DamageResolution;
  readonly "dice-observation": DiceObservation;
  readonly "entity-ref": EntityRef;
  readonly id: string;
  readonly "integer-bindings": IntegerBindings;
  readonly "journal-actor": JournalActorRef;
  readonly "material-ref": MaterialRef;
  readonly "mechanics-invocation-ref": MechanicsInvocationRef;
  readonly "mechanics-operation-cause": MechanicsOperationCause;
  readonly "mechanics-program-authority-receipt": MechanicsProgramAuthorityReceipt;
  readonly "new-effect-occurrence": NewEffectOccurrence;
  readonly "nonnegative-integer": number;
  readonly "occurrence-ref": OccurrenceRef;
  readonly "positive-integer": number;
  readonly "resource-operation": ResourceOperation;
  readonly "resource-ref": ResourceRef;
  readonly "resource-spec": ResourceSpec;
};

export type MechanicsOperationRejection =
  | "invalid-transaction"
  | "invalid-operation"
  | "invalid-world"
  | "invalid-cause"
  | "missing-actor"
  | "missing-target"
  | "target-unavailable"
  | "wrong-target-kind"
  | "missing-hit-point-maximum"
  | "stale-hit-point-maximum"
  | "target-dead"
  | "target-not-dead"
  | "target-not-dying"
  | "invalid-transition"
  | "invalid-after"
  | "missing-resource-definition-fact"
  | "resource-collision"
  | "resource-fixed-shape"
  | "occurrence-collision"
  | "concentration-replacement-required"
  | `resource-${ResourceRejection}`
  | "fact-conflict"
  | "action-planner-rejected";

export interface OccurrenceTransitionFacts {
  readonly created: Readonly<OccurrenceRef> | null;
  readonly ended: readonly Readonly<OccurrenceRef>[];
}

export interface ExhaustionTransitionFacts {
  readonly after: ExhaustionLevel;
  readonly becameDead: boolean;
  readonly before: ExhaustionLevel;
}

export interface ResourceInitializationFacts {
  readonly cell: Readonly<ResourceCell>;
  readonly observations: Readonly<ResourceInitializationObservations>;
}

export interface ResourceRemovalFacts {
  readonly removed: Readonly<ResourceCell>;
}

export interface MechanicsOperationFactsByKind {
  readonly "creature-damage": Readonly<CreatureDamageFacts>;
  readonly "object-damage": Readonly<ObjectDamageFacts>;
  readonly "creature-healing": Readonly<CreatureHealingFacts>;
  readonly "object-repair": Readonly<ObjectRepairFacts>;
  readonly "temporary-hit-points-grant": null;
  readonly "temporary-hit-points-clear": null;
  readonly "creature-stabilize": null;
  readonly "creature-kill": null;
  readonly "creature-reduce-to-zero": null;
  readonly "creature-revive": Readonly<CreatureRevivalFacts>;
  readonly "creature-death-save": null;
  readonly "creature-maximum-sync": Readonly<CreatureMaximumSyncFacts>;
  readonly "object-maximum-sync": Readonly<ObjectMaximumSyncFacts>;
  readonly "occurrence-create": Readonly<OccurrenceTransitionFacts>;
  readonly "occurrence-end": Readonly<OccurrenceTransitionFacts>;
  readonly "exhaustion-transition": Readonly<ExhaustionTransitionFacts>;
  readonly "resource-transition": Readonly<ResourceTransitionFacts>;
  readonly "resource-initialize": Readonly<ResourceInitializationFacts>;
  readonly "resource-remove": Readonly<ResourceRemovalFacts>;
}

export type MechanicsOperationExecution = {
  [Kind in MechanicsOperation["kind"]]: {
    readonly facts: MechanicsOperationFactsByKind[Kind];
    readonly kind: Kind;
    readonly operationId: string;
    readonly operation: Readonly<Extract<MechanicsOperation, { readonly kind: Kind }>>;
    readonly status: "applied";
  };
}[MechanicsOperation["kind"]];

/** One applied terminal step and its exact transient state boundary. */
export interface MechanicsOperationStage {
  readonly after: Readonly<MechanicsWorld>;
  readonly before: Readonly<MechanicsWorld>;
  readonly execution: Readonly<MechanicsOperationExecution>;
}

export interface MechanicsOperationNoChangeReasonByKind {
  readonly "creature-damage": "zero-effective-damage";
  readonly "object-damage": "zero-effective-damage" | "already-destroyed";
  readonly "creature-healing": "hit-points-full";
  readonly "object-repair": "hit-points-full";
  readonly "temporary-hit-points-grant":
    | "temporary-hit-points-kept"
    | "temporary-hit-points-unchanged";
  readonly "temporary-hit-points-clear": "no-matching-temporary-hit-points";
  readonly "creature-stabilize": "already-stable";
  readonly "creature-kill": "already-dead";
  readonly "creature-reduce-to-zero": "already-zero";
  readonly "creature-revive": never;
  readonly "creature-death-save": never;
  readonly "creature-maximum-sync": "maximum-already-synchronized";
  readonly "object-maximum-sync": "maximum-already-synchronized";
  readonly "occurrence-create":
    | "condition-immune"
    | "concentration-unsustainable"
    | "occurrence-already-active";
  readonly "occurrence-end": "occurrence-not-active";
  readonly "exhaustion-transition": "exhaustion-unchanged";
  readonly "resource-transition": "resource-unchanged";
  readonly "resource-initialize": never;
  readonly "resource-remove": never;
}

export type MechanicsOperationNoChange = {
  [Kind in MechanicsOperation["kind"]]: {
    readonly kind: Kind;
    readonly operationId: string;
    readonly operation: Readonly<Extract<MechanicsOperation, { readonly kind: Kind }>>;
    readonly reason: MechanicsOperationNoChangeReasonByKind[Kind];
    readonly status: "no-change";
  };
}[MechanicsOperation["kind"]];

export type MechanicsTransactionResult =
  | {
      readonly action: JournalActionDraft;
      readonly executions: readonly (
        | MechanicsOperationExecution
        | MechanicsOperationNoChange
      )[];
      readonly stages: readonly MechanicsOperationStage[];
      readonly status: "planned";
      readonly transaction: Readonly<MechanicsTransaction>;
      readonly world: Readonly<MechanicsWorld>;
    }
  | {
      readonly executions: readonly MechanicsOperationNoChange[];
      readonly status: "no-change";
      readonly transaction: Readonly<MechanicsTransaction>;
      readonly world: Readonly<MechanicsWorld>;
    }
  | {
      readonly boundary: "capacity" | "initial" | "record-roll" | "recovery";
      readonly operationId: string;
      readonly requirement: Readonly<DiceRollRequirement>;
      readonly status: "needs-observation";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly reason: MechanicsOperationRejection;
      readonly operationId: string | null;
      readonly status: "rejected";
    };
