/** Exact commands and transient plans for atomic mechanics-world operations. */

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
import { PHASE_EXECUTION_RECEIPT_SCHEMA } from "@/lib/mechanics-command-schema";
import type { CanonicalFingerprint } from "@/lib/canonical-fingerprint";
import type { ActionFactGuard, JournalActorRef } from "@/types/action-journal";
import type { DamageResolution } from "@/types/damage";
import { EXHAUSTION_LEVEL_SCHEMA, type ExhaustionLevel } from "@/types/condition";
import type { DiceObservation, DiceRollRequirement } from "@/types/dice-formula";
import type { IntegerBindings } from "@/types/integer-expression";
import type {
  EndRule,
  EffectOccurrence,
  JsonScalar,
  NewMechanicOccurrence,
  ProgramPhaseStateEntry,
} from "@/types/mechanic-occurrence";
import { JSON_SCALAR_SCHEMA } from "@/lib/mechanic-occurrence-schema";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type { MechanicsAuthoritySnapshot } from "@/types/mechanics-authority";
import type {
  EntityRef,
  InventoryGenerationRef,
  MaterialEntityRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import type {
  CreatureMaterialEntity,
  InventoryInstance,
  MaterialEntity,
  ObjectMaterialEntity,
} from "@/types/material-state";
import type {
  MechanicsBoundaryCommand,
  MechanicsCausalState,
  MechanicsWorld,
} from "@/types/mechanics-world";
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
import type {
  TurnEconomyClaimCommand,
  TurnEconomyNoChangeReason,
  TurnEconomyProjection,
  TurnEconomyRejection,
  TurnEconomyState,
} from "@/types/turn-economy";
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
const MATERIAL_ENTITY_REF_VALUE_SCHEMA = customSchema<
  "material-entity-ref",
  MaterialEntityRef
>("material-entity-ref");
const NULLABLE_ENTITY_REF_SCHEMA = unionSchema([ENTITY_REF_SCHEMA, literalSchema(null)]);
const INVENTORY_GENERATION_REF_VALUE_SCHEMA = customSchema<
  "inventory-generation-ref",
  InventoryGenerationRef
>("inventory-generation-ref");
type NewEffectOccurrence = Exclude<NewMechanicOccurrence, { readonly kind: "program" }>;
type ProgramStepOccurrenceOrigin = EffectOccurrence["origin"];
const NEW_EFFECT_OCCURRENCE_VALUE_SCHEMA = customSchema<
  "new-effect-occurrence",
  NewEffectOccurrence
>("new-effect-occurrence");
const PROGRAM_STEP_OCCURRENCE_ORIGIN_VALUE_SCHEMA = customSchema<
  "program-step-occurrence-origin",
  ProgramStepOccurrenceOrigin
>("program-step-occurrence-origin");
const OCCURRENCE_GENERATION_REF_VALUE_SCHEMA = customSchema<
  "occurrence-generation-ref",
  OccurrenceGenerationRef
>("occurrence-generation-ref");
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
export const MECHANICS_OPERATION_CAUSE_SCHEMA = objectSchema({
  causeId: CANONICAL_FINGERPRINT_SCHEMA,
  invocation: MECHANICS_INVOCATION_REF_VALUE_SCHEMA,
});

export type MechanicsOperationCause = InferExactSchema<
  typeof MECHANICS_OPERATION_CAUSE_SCHEMA,
  {
    readonly "canonical-fingerprint": CanonicalFingerprint;
    readonly "mechanics-invocation-ref": MechanicsInvocationRef;
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
const TURN_ECONOMY_COMMAND_VALUE_SCHEMA = customSchema<
  "turn-economy-command",
  TurnEconomyClaimCommand
>("turn-economy-command");
const TURN_ECONOMY_PROJECTION_VALUE_SCHEMA = customSchema<
  "turn-economy-projection",
  TurnEconomyProjection
>("turn-economy-projection");
const END_RULE_VALUE_SCHEMA = customSchema<"end-rule", EndRule>("end-rule");

type MaterialRuntimeFields = "availability" | "ordinal" | "ownerOccurrence";
export type NewMaterialEntity =
  | Omit<CreatureMaterialEntity, MaterialRuntimeFields>
  | Omit<ObjectMaterialEntity, MaterialRuntimeFields>;
const NEW_MATERIAL_ENTITY_VALUE_SCHEMA = customSchema<
  "new-material-entity",
  NewMaterialEntity
>("new-material-entity");

export type NewInventoryInstance = Omit<InventoryInstance, "ordinal" | "ownerOccurrence">;
const NEW_INVENTORY_INSTANCE_VALUE_SCHEMA = customSchema<
  "new-inventory-instance",
  NewInventoryInstance
>("new-inventory-instance");

const INVENTORY_CHANGE_SCHEMA = discriminatedUnionSchema("kind", {
  attuned: objectSchema({ kind: literalSchema("attuned"), value: booleanSchema }),
  equipped: objectSchema({ kind: literalSchema("equipped"), value: booleanSchema }),
  quantity: objectSchema({
    kind: literalSchema("quantity"),
    value: customSchema<"nonnegative-integer", number>("nonnegative-integer"),
  }),
});

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
  "turn-economy-transition": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    combatant: ENTITY_REF_SCHEMA,
    command: TURN_ECONOMY_COMMAND_VALUE_SCHEMA,
    kind: literalSchema("turn-economy-transition"),
    projection: TURN_ECONOMY_PROJECTION_VALUE_SCHEMA,
  }),
  "entity-create": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    endRules: arraySchema(END_RULE_VALUE_SCHEMA),
    entity: MATERIAL_ENTITY_REF_VALUE_SCHEMA,
    kind: literalSchema("entity-create"),
    lifecycle: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
    origin: PROGRAM_STEP_OCCURRENCE_ORIGIN_VALUE_SCHEMA,
    parent: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
    value: NEW_MATERIAL_ENTITY_VALUE_SCHEMA,
  }),
  "entity-availability": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    availability: unionSchema([literalSchema("present"), literalSchema("dismissed")]),
    kind: literalSchema("entity-availability"),
    target: MATERIAL_ENTITY_REF_VALUE_SCHEMA,
  }),
  "entity-controller": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    controller: NULLABLE_ENTITY_REF_SCHEMA,
    kind: literalSchema("entity-controller"),
    target: MATERIAL_ENTITY_REF_VALUE_SCHEMA,
  }),
  "inventory-create": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    endRules: arraySchema(END_RULE_VALUE_SCHEMA),
    instance: NEW_INVENTORY_INSTANCE_VALUE_SCHEMA,
    item: INVENTORY_GENERATION_REF_VALUE_SCHEMA,
    kind: literalSchema("inventory-create"),
    lifecycle: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
    origin: PROGRAM_STEP_OCCURRENCE_ORIGIN_VALUE_SCHEMA,
    parent: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
  }),
  "inventory-transition": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    change: INVENTORY_CHANGE_SCHEMA,
    enchantmentBearer: unionSchema([
      INVENTORY_GENERATION_REF_VALUE_SCHEMA,
      literalSchema(null),
    ]),
    item: INVENTORY_GENERATION_REF_VALUE_SCHEMA,
    kind: literalSchema("inventory-transition"),
  }),
  "inventory-end": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    enchantmentBearer: unionSchema([
      INVENTORY_GENERATION_REF_VALUE_SCHEMA,
      literalSchema(null),
    ]),
    item: INVENTORY_GENERATION_REF_VALUE_SCHEMA,
    kind: literalSchema("inventory-end"),
  }),
  "program-root-create": objectSchema({
    endRules: arraySchema(END_RULE_VALUE_SCHEMA),
    ...OPERATION_COMMON_SCHEMA,
    kind: literalSchema("program-root-create"),
    materialEpoch: customSchema<"nonnegative-integer", number>("nonnegative-integer"),
    root: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
  }),
  "program-phase-transition": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    expected: PHASE_EXECUTION_RECEIPT_SCHEMA,
    kind: literalSchema("program-phase-transition"),
    next: PHASE_EXECUTION_RECEIPT_SCHEMA,
    root: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
  }),
  "program-register-transition": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    expected: JSON_SCALAR_SCHEMA,
    kind: literalSchema("program-register-transition"),
    next: JSON_SCALAR_SCHEMA,
    registerId: ID_SCHEMA,
    root: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
  }),
  "occurrence-create": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    conditionImmunityOverride: CONDITION_IMMUNITY_OVERRIDE_SCHEMA,
    created: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
    kind: literalSchema("occurrence-create"),
    occurrence: NEW_EFFECT_OCCURRENCE_VALUE_SCHEMA,
    parent: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
  }),
  "occurrence-end": objectSchema({
    ...OPERATION_COMMON_SCHEMA,
    kind: literalSchema("occurrence-end"),
    occurrence: OCCURRENCE_GENERATION_REF_VALUE_SCHEMA,
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
  readonly "end-rule": EndRule;
  readonly "entity-ref": EntityRef;
  readonly id: string;
  readonly "integer-bindings": IntegerBindings;
  readonly "inventory-generation-ref": InventoryGenerationRef;
  readonly "journal-actor": JournalActorRef;
  readonly "material-entity-ref": MaterialEntityRef;
  readonly "material-entity-id": string;
  readonly "mechanics-invocation-ref": MechanicsInvocationRef;
  readonly "mechanics-operation-cause": MechanicsOperationCause;
  readonly "new-effect-occurrence": NewEffectOccurrence;
  readonly "new-material-entity": NewMaterialEntity;
  readonly "new-inventory-instance": NewInventoryInstance;
  readonly "nonnegative-integer": number;
  readonly "occurrence-generation-ref": OccurrenceGenerationRef;
  readonly "positive-integer": number;
  readonly "program-step-occurrence-origin": ProgramStepOccurrenceOrigin;
  readonly "resource-operation": ResourceOperation;
  readonly "resource-ref": ResourceRef;
  readonly "resource-spec": ResourceSpec;
  readonly "turn-economy-command": TurnEconomyClaimCommand;
  readonly "turn-economy-projection": TurnEconomyProjection;
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
  | "entity-collision"
  | "inventory-collision"
  | "stale-allocation-state"
  | "missing-controller"
  | "controller-cycle"
  | "program-root-collision"
  | "missing-program-root"
  | "stale-program-state"
  | "invalid-program-state"
  | "overflow"
  | "missing-resource-definition-fact"
  | "resource-collision"
  | "resource-fixed-shape"
  | "occurrence-collision"
  | "concentration-replacement-required"
  | "invalid-override"
  | TurnEconomyRejection
  | `resource-${ResourceRejection}`
  | "fact-conflict";

export interface OccurrenceCreateFacts {
  readonly created: Readonly<OccurrenceGenerationRef>;
}

export interface ProgramRootCreateFacts {
  readonly root: Readonly<OccurrenceGenerationRef>;
}

export interface ProgramPhaseTransitionFacts {
  readonly after: Readonly<ProgramPhaseStateEntry>;
  readonly before: Readonly<ProgramPhaseStateEntry>;
  readonly root: Readonly<OccurrenceGenerationRef>;
}

export interface ProgramRegisterTransitionFacts {
  readonly after: JsonScalar;
  readonly before: JsonScalar;
  readonly registerId: string;
  readonly root: Readonly<OccurrenceGenerationRef>;
}

export interface OccurrenceEndRequestFacts {
  readonly requested: Readonly<OccurrenceGenerationRef>;
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

export interface TurnEconomyTransitionFacts {
  readonly after: Readonly<TurnEconomyState>;
  readonly before: Readonly<TurnEconomyState>;
}

export interface EntityCreateFacts {
  readonly entity: Readonly<MaterialEntityRef>;
  readonly lifecycle: Readonly<OccurrenceGenerationRef>;
}

export interface EntityAvailabilityFacts {
  readonly after: MaterialEntity["availability"];
  readonly before: MaterialEntity["availability"];
}

export interface EntityControllerFacts {
  readonly after: Readonly<EntityRef> | null;
  readonly before: Readonly<EntityRef> | null;
}

export interface InventoryCreateFacts {
  readonly created: Readonly<InventoryGenerationRef>;
  readonly instance: Readonly<InventoryInstance>;
  readonly lifecycle: Readonly<OccurrenceGenerationRef>;
}

export interface InventoryTransitionFacts {
  readonly after: Readonly<InventoryInstance>;
  readonly before: Readonly<InventoryInstance>;
  readonly detachedFrom: Readonly<InventoryGenerationRef> | null;
  readonly lifecycleEndRequested: Readonly<OccurrenceGenerationRef> | null;
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
  readonly "turn-economy-transition": Readonly<TurnEconomyTransitionFacts>;
  readonly "entity-create": Readonly<EntityCreateFacts>;
  readonly "entity-availability": Readonly<EntityAvailabilityFacts>;
  readonly "entity-controller": Readonly<EntityControllerFacts>;
  readonly "inventory-create": Readonly<InventoryCreateFacts>;
  readonly "inventory-transition": Readonly<InventoryTransitionFacts>;
  readonly "inventory-end": Readonly<InventoryTransitionFacts>;
  readonly "program-root-create": Readonly<ProgramRootCreateFacts>;
  readonly "program-phase-transition": Readonly<ProgramPhaseTransitionFacts>;
  readonly "program-register-transition": Readonly<ProgramRegisterTransitionFacts>;
  readonly "occurrence-create": Readonly<OccurrenceCreateFacts>;
  readonly "occurrence-end": Readonly<OccurrenceEndRequestFacts>;
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

/**
 * One applied terminal step and its exact transaction-local world boundary.
 * Newly satisfied end rules are discovered only after the final ordered step,
 * so neither projection is itself a reusable causal-state receipt.
 */
export interface MechanicsOperationStage {
  readonly after: Readonly<MechanicsWorld>;
  readonly before: Readonly<MechanicsWorld>;
  readonly execution: Readonly<MechanicsOperationExecution>;
}

/** Trusted pure-kernel inputs that never enter public command JSON. */
export interface MechanicsTransactionSimulationContext {
  readonly authoritySnapshot: Readonly<MechanicsAuthoritySnapshot>;
  readonly state: Readonly<MechanicsCausalState>;
}

/** A validated request that the higher-level executor must resolve causally. */
export type MechanicsOperationConsequence = {
  readonly causeId: CanonicalFingerprint;
  readonly kind: "occurrence-end";
  readonly occurrence: Readonly<OccurrenceGenerationRef>;
  readonly operationId: string;
};

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
  readonly "turn-economy-transition": TurnEconomyNoChangeReason;
  readonly "entity-create": "entity-already-created";
  readonly "entity-availability": "entity-availability-unchanged";
  readonly "entity-controller": "entity-controller-unchanged";
  readonly "inventory-create": "inventory-already-created";
  readonly "inventory-transition": "inventory-unchanged";
  readonly "inventory-end": "inventory-not-active";
  readonly "program-root-create": "program-root-already-created";
  readonly "program-phase-transition": "program-phase-already-committed";
  readonly "program-register-transition": "program-register-unchanged";
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

export type MechanicsTransactionSimulationResult =
  | {
      readonly actionFacts: readonly Readonly<ActionFactGuard>[];
      readonly consequences: readonly Readonly<MechanicsOperationConsequence>[];
      readonly executions: readonly (
        | MechanicsOperationExecution
        | MechanicsOperationNoChange
      )[];
      readonly stages: readonly MechanicsOperationStage[];
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "simulated";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly actionFacts: readonly [];
      readonly consequences: readonly [];
      readonly executions: readonly MechanicsOperationNoChange[];
      readonly stages: readonly [];
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "no-change";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly boundary: "capacity" | "initial" | "record-roll" | "recovery";
      readonly operationId: string;
      readonly requirement: Readonly<DiceRollRequirement>;
      readonly status: "needs-observation";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly boundary: Readonly<
        Extract<MechanicsBoundaryCommand, { readonly kind: "complete-turn" }>
      >;
      readonly operationId: string;
      readonly status: "needs-boundary";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly reason: MechanicsOperationRejection;
      readonly operationId: string | null;
      readonly status: "rejected";
    };

declare const MECHANICS_TRANSACTION_PROJECTION: unique symbol;

/**
 * Kernel-issued, process-local view of one complete ordered compiler prefix.
 * It is not a causal state and cannot be persisted or reconstructed from JSON.
 */
export interface MechanicsTransactionProjection {
  readonly [MECHANICS_TRANSACTION_PROJECTION]: true;
  readonly inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[];
  readonly world: Readonly<MechanicsWorld>;
}

/** Compiler-only simulation of a complete ordered prefix without causal closure. */
export type MechanicsTransactionProjectionResult =
  | {
      readonly actionFacts: readonly Readonly<ActionFactGuard>[];
      readonly changed: boolean;
      readonly consequences: readonly Readonly<MechanicsOperationConsequence>[];
      readonly executions: readonly (
        | MechanicsOperationExecution
        | MechanicsOperationNoChange
      )[];
      readonly projection: Readonly<MechanicsTransactionProjection>;
      readonly stages: readonly MechanicsOperationStage[];
      readonly status: "projected";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | Extract<
      MechanicsTransactionSimulationResult,
      { readonly status: "needs-observation" | "needs-boundary" | "rejected" }
    >;
