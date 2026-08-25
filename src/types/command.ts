import type { EffectInstance } from "@/types/effect-instance";
import type { RuleDefinition } from "@/types/rule-definition";

export type CommandId = `cmd:v1:${string}`;
export type StateId = `state:v1:${string}`;
export type EntityId = `entity:v1:${string}`;
export type ResourceId = `resource:v1:${string}`;
export type RuleId = `rule:v1:${string}`;
export type SourceId = `source:v1:${string}`;
export type EffectId = `effect:v1:${string}`;
export type RulingId = `ruling:v1:${string}`;
export type RequestId = `req:v1:${string}`;
export type PatchId = `patch:v1:${string}`;
export type EventId = `event:v1:${string}`;
export type ReceiptId = `receipt:v1:${string}`;
export type Fingerprint = `fp:v1:${string}`;

export interface SerializableObject {
  readonly [key: string]: SerializableValue;
}

export type SerializableValue =
  | null
  | boolean
  | number
  | string
  | readonly SerializableValue[]
  | SerializableObject;

export type RevisionRef = {
  stateId: StateId;
  revision: number;
};

export type ResourceState = {
  resourceId: ResourceId;
  current: number;
  maximum: number;
};

export type WorldState = {
  schemaVersion: 1;
  stateId: StateId;
  revision: number;
  resources: readonly ResourceState[];
  effects: readonly EffectInstance[];
};

export type UseRuleCommand = {
  schemaVersion: 1;
  kind: "use-rule";
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  actorId: EntityId;
  subjectId: EntityId;
  ruleId: RuleId;
  ruleVersion: number;
  expectedRevision: RevisionRef;
  choices: Readonly<Record<string, SerializableValue>>;
};

export type UndoReceiptCommand = {
  schemaVersion: 1;
  kind: "undo-receipt";
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  actorId: EntityId;
  subjectId: EntityId;
  expectedRevision: RevisionRef;
  receipt: CommandReceipt;
};

export type SemanticCommand = UseRuleCommand | UndoReceiptCommand;

export type SelectedTargetsRequest = {
  kind: "selected-targets";
  requestId: RequestId;
  min: number;
  max: number;
  candidateIds: readonly EntityId[];
};

export type TableGeometryPair = {
  fromId: EntityId;
  toId: EntityId;
};

export type TableGeometryRequest = {
  kind: "table-geometry";
  requestId: RequestId;
  pairs: readonly TableGeometryPair[];
};

export type ObservedOutcomeRequest = {
  kind: "observed-outcome";
  requestId: RequestId;
  valueType: "integer" | "boolean" | "stable-id";
  minimum: number | null;
  maximum: number | null;
  allowedIds: readonly SourceId[];
};

export type RulingRequest = {
  kind: "ruling";
  requestId: RequestId;
  rulingIds: readonly RulingId[];
};

export type ExternalInputRequest =
  | SelectedTargetsRequest
  | TableGeometryRequest
  | ObservedOutcomeRequest
  | RulingRequest;

export type SelectedTargetsAnswer = {
  kind: "selected-targets";
  requestId: RequestId;
  targetIds: readonly EntityId[];
};

export type TableGeometryDistance = TableGeometryPair & {
  feet: number;
};

export type TableGeometryAnswer = {
  kind: "table-geometry";
  requestId: RequestId;
  distances: readonly TableGeometryDistance[];
};

export type ObservedOutcomeAnswer = {
  kind: "observed-outcome";
  requestId: RequestId;
  value: number | boolean | SourceId;
};

export type RulingAnswer = {
  kind: "ruling";
  requestId: RequestId;
  rulingId: RulingId;
  accepted: boolean;
};

export type ExternalAnswer =
  | SelectedTargetsAnswer
  | TableGeometryAnswer
  | ObservedOutcomeAnswer
  | RulingAnswer;

export type ExternalAnswers = {
  schemaVersion: 1;
  values: readonly ExternalAnswer[];
};

export type SetResourcePatch = {
  schemaVersion: 1;
  kind: "set-resource";
  patchId: PatchId;
  stateId: StateId;
  resourceId: ResourceId;
  before: number;
  after: number;
};

export type CommandPatch = SetResourcePatch;

export type ResourceChangedEvent = {
  schemaVersion: 1;
  kind: "resource-spent" | "resource-restored";
  eventId: EventId;
  actorId: EntityId;
  subjectId: EntityId;
  ruleId: RuleId;
  resourceId: ResourceId;
  amount: number;
};

export type CommandEvent = ResourceChangedEvent;

export type RevisionChange = {
  stateId: StateId;
  before: number;
  after: number;
};

export type CommandReceipt = {
  schemaVersion: 1;
  receiptId: ReceiptId;
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  resultFingerprint: Fingerprint;
  patches: readonly CommandPatch[];
  events: readonly CommandEvent[];
  revisions: readonly RevisionChange[];
  inversePatches: readonly CommandPatch[];
};

export type ResolveCommandInput = {
  schemaVersion: 1;
  mode: "preview" | "commit";
  ruleDefinition: RuleDefinition | null;
  world: WorldState;
  command: SemanticCommand;
  externalAnswers: ExternalAnswers;
  priorReceipt: CommandReceipt | null;
};

export type RejectionReason =
  | "invalid-input"
  | "command-too-large"
  | "command-too-deep"
  | "command-too-complex"
  | "unknown-field"
  | "invalid-number"
  | "invalid-id"
  | "duplicate-id"
  | "unknown-command-kind"
  | "unknown-rule-kind"
  | "command-payload-mismatch"
  | "command-id-payload-mismatch"
  | "rule-fingerprint-mismatch"
  | "rule-reference-mismatch"
  | "state-mismatch"
  | "revision-mismatch"
  | "answer-request-mismatch"
  | "invalid-external-answers"
  | "illegal-target"
  | "resource-unavailable"
  | "insufficient-resource"
  | "invalid-receipt"
  | "invalid-patch"
  | "no-change";

export type NeedExternalInput = {
  status: "need-external-input";
  commandId: CommandId;
  request: ExternalInputRequest;
};

export type Rejected = {
  status: "rejected";
  reason: RejectionReason;
};

export type ResolvedFacts = {
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  resultFingerprint: Fingerprint;
  patches: readonly CommandPatch[];
  events: readonly CommandEvent[];
  revisions: readonly RevisionChange[];
};

export type Preview = ResolvedFacts & {
  status: "preview";
};

export type CommitResult = ResolvedFacts & {
  status: "committed";
  receipt: CommandReceipt;
};

export type ResolutionOutcome = NeedExternalInput | Rejected | Preview | CommitResult;
