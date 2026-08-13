/** Exact transient grammar for public mechanics commands and suspended review. */

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
import type { CanonicalFingerprint } from "@/lib/canonical-fingerprint";
import { MECHANICS_TRIGGER_EVIDENCE_SCHEMA } from "@/lib/mechanics-trigger-schema";
import { MATERIAL_REF_SCHEMA } from "@/lib/mechanics-reference-schema";
import type { D20TestObservation } from "@/types/d20-test";
import type { DiceObservation } from "@/types/dice-formula";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { EntityRef, OccurrenceRef } from "@/types/mechanics-reference";
import type { ResourceRef } from "@/types/resource";

const ID_SCHEMA = customSchema<"id", string>("id");
const NONNEGATIVE_INTEGER_SCHEMA = customSchema<"nonnegative-integer", number>(
  "nonnegative-integer"
);
const POSITIVE_INTEGER_SCHEMA = customSchema<"positive-integer", number>(
  "positive-integer"
);
const SIGNED_INTEGER_SCHEMA = customSchema<"signed-integer", number>("signed-integer");
const FINGERPRINT_SCHEMA = customSchema<"fingerprint", MechanicsFingerprintSchemaShape>(
  "fingerprint"
);
const ENTITY_REF_SCHEMA = customSchema<"entity-ref", EntityRef>("entity-ref");
const OCCURRENCE_REF_SCHEMA = customSchema<"occurrence-ref", OccurrenceRef>(
  "occurrence-ref"
);
const RESOURCE_REF_SCHEMA = customSchema<"resource-ref", ResourceRef>("resource-ref");
const D20_OBSERVATION_SCHEMA = customSchema<"d20-observation", D20TestObservation>(
  "d20-observation"
);
const DICE_OBSERVATION_SCHEMA = customSchema<"dice-observation", DiceObservation>(
  "dice-observation"
);
const INVOCATION_REF_SCHEMA = customSchema<"invocation-ref", MechanicsInvocationRef>(
  "invocation-ref"
);
const PROGRAM_AUTHORITY_RECEIPT_SCHEMA = customSchema<
  "program-authority-receipt",
  MechanicsProgramAuthorityReceipt
>("program-authority-receipt");
const INSTALLED_INVOCATION_REF_SCHEMA = customSchema<
  "installed-invocation-ref",
  Extract<MechanicsInvocationRef, { readonly kind: "installed-capability" }>
>("installed-invocation-ref");
const NULL_SCHEMA = literalSchema(null);

export type MechanicsFingerprintSchemaShape = CanonicalFingerprint;

/**
 * A payment answer selects one physical resource for one engine-issued id.
 * Only execution can bind `(requestId, paymentId)` to its authoritative requirement.
 */
const PAYMENT_ANSWER_SCHEMA = objectSchema({
  paymentId: ID_SCHEMA,
  resource: RESOURCE_REF_SCHEMA,
});

const ORDERING_PARTITION_SCHEMA = objectSchema({
  collisionKey: ID_SCHEMA,
  proposalIds: arraySchema(ID_SCHEMA, 1),
});

/** Answers echo only engine-issued request/payment ids plus observed or chosen facts. */
export const MECHANICS_COMMAND_ANSWER_SCHEMA = discriminatedUnionSchema("kind", {
  entities: objectSchema({
    kind: literalSchema("entities"),
    requestId: ID_SCHEMA,
    targets: arraySchema(ENTITY_REF_SCHEMA),
  }),
  d20: objectSchema({
    kind: literalSchema("d20"),
    observation: D20_OBSERVATION_SCHEMA,
    payments: arraySchema(PAYMENT_ANSWER_SCHEMA),
    requestId: ID_SCHEMA,
  }),
  dice: objectSchema({
    kind: literalSchema("dice"),
    observation: DICE_OBSERVATION_SCHEMA,
    payments: arraySchema(PAYMENT_ANSWER_SCHEMA),
    requestId: ID_SCHEMA,
  }),
  choice: objectSchema({
    choiceId: ID_SCHEMA,
    kind: literalSchema("choice"),
    requestId: ID_SCHEMA,
  }),
  integer: objectSchema({
    kind: literalSchema("integer"),
    requestId: ID_SCHEMA,
    value: SIGNED_INTEGER_SCHEMA,
  }),
  boolean: objectSchema({
    kind: literalSchema("boolean"),
    requestId: ID_SCHEMA,
    value: booleanSchema,
  }),
  table: objectSchema({
    kind: literalSchema("table"),
    requestId: ID_SCHEMA,
    rowId: ID_SCHEMA,
  }),
  resource: objectSchema({
    kind: literalSchema("resource"),
    requestId: ID_SCHEMA,
    resource: RESOURCE_REF_SCHEMA,
  }),
  item: objectSchema({
    instanceId: ID_SCHEMA,
    instanceOrdinal: POSITIVE_INTEGER_SCHEMA,
    kind: literalSchema("item"),
    requestId: ID_SCHEMA,
  }),
  ordering: objectSchema({
    kind: literalSchema("ordering"),
    partitions: arraySchema(ORDERING_PARTITION_SCHEMA, 1),
    requestId: ID_SCHEMA,
  }),
});

export type MechanicsCommandAnswerSchemaShape = InferExactSchema<
  typeof MECHANICS_COMMAND_ANSWER_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

export const MECHANICS_COMMAND_SCHEMA = discriminatedUnionSchema("kind", {
  invoke: objectSchema({
    commandId: ID_SCHEMA,
    invocation: INSTALLED_INVOCATION_REF_SCHEMA,
    kind: literalSchema("invoke"),
    schema: literalSchema(1),
  }),
  resume: objectSchema({
    answers: arraySchema(MECHANICS_COMMAND_ANSWER_SCHEMA),
    kind: literalSchema("resume"),
    schema: literalSchema(1),
    suspensionId: FINGERPRINT_SCHEMA,
  }),
});

export type MechanicsCommandSchemaShape = InferExactSchema<
  typeof MECHANICS_COMMAND_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

/**
 * Authentication/worklist context is deliberately outside MechanicsCommand.
 * Conformance proves shape only; a trusted adapter must construct this value.
 */
export const MECHANICS_COMMAND_REQUESTER_SCHEMA = discriminatedUnionSchema("kind", {
  "authenticated-user": objectSchema({
    kind: literalSchema("authenticated-user"),
    uid: ID_SCHEMA,
  }),
  engine: objectSchema({
    causeEventId: ID_SCHEMA,
    kind: literalSchema("engine"),
  }),
});

export type MechanicsCommandRequesterSchemaShape = InferExactSchema<
  typeof MECHANICS_COMMAND_REQUESTER_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

export const PHASE_EXECUTION_RECEIPT_SCHEMA = objectSchema({
  execution: NONNEGATIVE_INTEGER_SCHEMA,
  phaseId: ID_SCHEMA,
  triggerEventId: unionSchema([ID_SCHEMA, NULL_SCHEMA]),
});

export type PhaseExecutionReceiptSchemaShape = InferExactSchema<
  typeof PHASE_EXECUTION_RECEIPT_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

/** Pre-commit allocation/CAS receipt. Replays complete immediately and never suspend. */
export const PROGRAM_ROOT_RECEIPT_SCHEMA = discriminatedUnionSchema("kind", {
  create: objectSchema({
    kind: literalSchema("create"),
    materialEpoch: NONNEGATIVE_INTEGER_SCHEMA,
    next: PHASE_EXECUTION_RECEIPT_SCHEMA,
    ordinal: POSITIVE_INTEGER_SCHEMA,
    root: OCCURRENCE_REF_SCHEMA,
  }),
  advance: objectSchema({
    expected: PHASE_EXECUTION_RECEIPT_SCHEMA,
    kind: literalSchema("advance"),
    next: PHASE_EXECUTION_RECEIPT_SCHEMA,
    root: OCCURRENCE_REF_SCHEMA,
  }),
});

export type ProgramRootReceiptSchemaShape = InferExactSchema<
  typeof PROGRAM_ROOT_RECEIPT_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

export const MECHANICS_DOCUMENT_FENCE_SCHEMA = objectSchema({
  epoch: NONNEGATIVE_INTEGER_SCHEMA,
  material: MATERIAL_REF_SCHEMA,
  revision: NONNEGATIVE_INTEGER_SCHEMA,
});

export type MechanicsDocumentFenceSchemaShape = InferExactSchema<
  typeof MECHANICS_DOCUMENT_FENCE_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

export const MECHANICS_OBSERVATION_KEY_SCHEMA = objectSchema({
  observationKey: FINGERPRINT_SCHEMA,
  requestId: ID_SCHEMA,
});

export type MechanicsObservationKeySchemaShape = InferExactSchema<
  typeof MECHANICS_OBSERVATION_KEY_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

/** Complete recoverable execution facts; opaque hashes are never a substitute for its body. */
export const MECHANICS_EXECUTION_FRAME_SCHEMA = objectSchema({
  authority: PROGRAM_AUTHORITY_RECEIPT_SCHEMA,
  invocation: INVOCATION_REF_SCHEMA,
  rootReceipt: PROGRAM_ROOT_RECEIPT_SCHEMA,
  trigger: MECHANICS_TRIGGER_EVIDENCE_SCHEMA,
});

export type MechanicsExecutionFrameSchemaShape = InferExactSchema<
  typeof MECHANICS_EXECUTION_FRAME_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

/** Bounded transient state, separate from MechanicsWorld but fully recoverable. */
export const MECHANICS_COMMAND_SUSPENSION_SCHEMA = objectSchema({
  answers: arraySchema(MECHANICS_COMMAND_ANSWER_SCHEMA),
  commandId: ID_SCHEMA,
  documentFences: arraySchema(MECHANICS_DOCUMENT_FENCE_SCHEMA, 1),
  frame: MECHANICS_EXECUTION_FRAME_SCHEMA,
  observationKeys: arraySchema(MECHANICS_OBSERVATION_KEY_SCHEMA),
  schema: literalSchema(1),
  suspensionId: FINGERPRINT_SCHEMA,
});

export type MechanicsCommandSuspensionSchemaShape = InferExactSchema<
  typeof MECHANICS_COMMAND_SUSPENSION_SCHEMA,
  MechanicsCommandSchemaCustomTypes
>;

export type MechanicsCommandSchemaCustomTypes = {
  readonly "d20-observation": D20TestObservation;
  readonly "dice-observation": DiceObservation;
  readonly "entity-ref": EntityRef;
  readonly fingerprint: MechanicsFingerprintSchemaShape;
  readonly id: string;
  readonly "installed-invocation-ref": Extract<
    MechanicsInvocationRef,
    { readonly kind: "installed-capability" }
  >;
  readonly "invocation-ref": MechanicsInvocationRef;
  readonly "nonnegative-integer": number;
  readonly "occurrence-ref": OccurrenceRef;
  readonly "positive-integer": number;
  readonly "program-authority-receipt": MechanicsProgramAuthorityReceipt;
  readonly "resource-ref": ResourceRef;
  readonly "signed-integer": number;
  readonly "clock-ref": import("@/types/mechanics-reference").ClockRef;
  readonly "damage-resolution": import("@/types/damage").DamageResolution;
};
