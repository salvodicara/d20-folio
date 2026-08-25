import {
  canonicalFingerprint,
  type CanonicalFingerprint,
} from "@/lib/canonical-fingerprint";
import type {
  CommandEvent,
  CommandId,
  CommandPatch,
  CommandReceipt,
  EventId,
  ExternalInputRequest,
  Fingerprint,
  PatchId,
  ReceiptId,
  RequestId,
  ResolvedFacts,
  RuleId,
  SemanticCommand,
  StateId,
} from "@/types/command";
import type { RuleDefinition } from "@/types/rule-definition";

export type ExternalRequestIdentityContext = {
  commandId: CommandId;
  payloadFingerprint: Fingerprint;
  ruleId: RuleId;
  ruleVersion: number;
  stateId: StateId;
  expectedRevision: number;
};

function versionedDigest<Prefix extends string>(
  prefix: Prefix,
  projection: unknown
): `${Prefix}:v1:${string}` {
  const digest: CanonicalFingerprint = canonicalFingerprint(projection);
  return `${prefix}:v1:${digest.slice("sha256:".length)}`;
}

export function ruleDefinitionFingerprint(definition: RuleDefinition): Fingerprint {
  return versionedDigest("fp", {
    codec: "rule-definition:v1",
    definition: {
      schemaVersion: definition.schemaVersion,
      kind: definition.kind,
      ruleId: definition.ruleId,
      ruleVersion: definition.ruleVersion,
      provenance: definition.provenance,
      resourceId: definition.resourceId,
      amount: definition.amount,
      target: definition.target,
    },
  });
}

export function commandPayloadFingerprint(command: SemanticCommand): Fingerprint {
  const projected =
    command.kind === "use-rule"
      ? {
          schemaVersion: command.schemaVersion,
          kind: command.kind,
          actorId: command.actorId,
          subjectId: command.subjectId,
          ruleId: command.ruleId,
          ruleVersion: command.ruleVersion,
          expectedRevision: command.expectedRevision,
          choices: command.choices,
        }
      : {
          schemaVersion: command.schemaVersion,
          kind: command.kind,
          actorId: command.actorId,
          subjectId: command.subjectId,
          expectedRevision: command.expectedRevision,
          receiptId: command.receipt.receiptId,
        };
  return versionedDigest("fp", {
    codec: "semantic-command:v1",
    command: projected,
  });
}

function requestWithoutId(request: ExternalInputRequest): unknown {
  switch (request.kind) {
    case "selected-targets":
      return {
        kind: request.kind,
        min: request.min,
        max: request.max,
        candidateIds: request.candidateIds,
      };
    case "table-geometry":
      return { kind: request.kind, pairs: request.pairs };
    case "observed-outcome":
      return {
        kind: request.kind,
        valueType: request.valueType,
        minimum: request.minimum,
        maximum: request.maximum,
        allowedIds: request.allowedIds,
      };
    case "ruling":
      return { kind: request.kind, rulingIds: request.rulingIds };
  }
}

export function externalRequestId(
  context: ExternalRequestIdentityContext,
  request: ExternalInputRequest
): RequestId {
  return versionedDigest("req", {
    codec: "external-request:v1",
    ...context,
    request: requestWithoutId(request),
  });
}

export function commandPatchId(
  commandId: CommandId,
  index: number,
  patch: CommandPatch | Omit<CommandPatch, "patchId">
): PatchId {
  return versionedDigest("patch", {
    codec: "command-patch:v1",
    commandId,
    index,
    patch: {
      schemaVersion: patch.schemaVersion,
      kind: patch.kind,
      stateId: patch.stateId,
      resourceId: patch.resourceId,
      before: patch.before,
      after: patch.after,
    },
  });
}

export function commandEventId(
  commandId: CommandId,
  index: number,
  event: CommandEvent | Omit<CommandEvent, "eventId">
): EventId {
  return versionedDigest("event", {
    codec: "command-event:v1",
    commandId,
    index,
    event: {
      schemaVersion: event.schemaVersion,
      kind: event.kind,
      actorId: event.actorId,
      subjectId: event.subjectId,
      ruleId: event.ruleId,
      resourceId: event.resourceId,
      amount: event.amount,
    },
  });
}

export function resolutionResultFingerprint(
  result: Pick<
    ResolvedFacts,
    "commandId" | "payloadFingerprint" | "patches" | "events" | "revisions"
  >
): Fingerprint {
  return versionedDigest("fp", {
    codec: "resolution-result:v1",
    commandId: result.commandId,
    payloadFingerprint: result.payloadFingerprint,
    patches: result.patches,
    events: result.events,
    revisions: result.revisions,
  });
}

export function commandReceiptId(
  receipt: CommandReceipt | Omit<CommandReceipt, "receiptId">
): ReceiptId {
  return versionedDigest("receipt", {
    codec: "command-receipt:v1",
    commandId: receipt.commandId,
    payloadFingerprint: receipt.payloadFingerprint,
    resultFingerprint: receipt.resultFingerprint,
    patches: receipt.patches,
    events: receipt.events,
    revisions: receipt.revisions,
    inversePatches: receipt.inversePatches,
  });
}
