/** Exact hostile-input boundary for commands and bounded suspended review state. */

import { materialRefKey } from "@/lib/action-journal";
import {
  canonicalFingerprint,
  canonicalJson,
  conformCanonicalFingerprint,
} from "@/lib/canonical-fingerprint";
import { conformDamageResolution } from "@/lib/damage";
import { conformD20TestObservation } from "@/lib/d20-test";
import { conformDiceObservation } from "@/lib/dice-formula";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  MECHANICS_COMMAND_ANSWER_SCHEMA,
  MECHANICS_COMMAND_REQUESTER_SCHEMA,
  MECHANICS_COMMAND_SCHEMA,
  MECHANICS_COMMAND_SUSPENSION_SCHEMA,
  MECHANICS_EXECUTION_FRAME_SCHEMA,
  PROGRAM_ROOT_RECEIPT_SCHEMA,
  programRootReceiptIsCoherent,
  type MechanicsCommandSchemaCustomTypes,
} from "@/lib/mechanics-command-schema";
import { conformMechanicsInvocationRef } from "@/lib/mechanics-authority-ref";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import {
  conformClockRef,
  conformEntityRef,
  conformMechanicId,
  conformOccurrenceGenerationRef,
} from "@/lib/mechanics-reference-schema";
import { conformResourceRef } from "@/lib/resources";
import type {
  MechanicsCommand,
  MechanicsCommandAnswer,
  MechanicsCommandRequester,
  MechanicsCommandResumeMatch,
  MechanicsCommandSuspension,
  MechanicsExecutionFrame,
  MechanicsFingerprint,
  MechanicsRequesterAuthorization,
  MechanicsTrustedEngineContext,
  ProgramRootReceipt,
  ResolvedMechanicsRequesterDefinition,
} from "@/types/mechanics-command";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  MechanicsPhaseTrigger,
  MechanicsRole,
} from "@/types/mechanics-program-authoring";
import type { MechanicsTriggerEvidence } from "@/types/mechanics-trigger";
import type { EntityRef } from "@/types/mechanics-reference";

const MAX_ANSWERS = 512;
const MAX_DOCUMENT_FENCES = 256;
const MAX_ENTITY_TARGETS = 256;
const MAX_OBSERVATION_KEYS = 512;
const MAX_ORDERING_PARTITIONS = 256;
const MAX_ORDERING_PROPOSALS = 512;
const MAX_PAYMENTS = 64;
const MAX_INTEGER_ANSWER = 1_000_000_000;

function identifier(value: unknown): string | null {
  const id = conformMechanicId(value);
  return id !== null && id.trim() === id ? id : null;
}

function counter(value: unknown, positive: boolean): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= (positive ? 1 : 0)
    ? value
    : null;
}

function signedInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    value >= -MAX_INTEGER_ANSWER &&
    value <= MAX_INTEGER_ANSWER
    ? value
    : null;
}

function installedInvocation(
  value: unknown
): Extract<MechanicsInvocationRef, { readonly kind: "installed-capability" }> | null {
  const invocation = conformMechanicsInvocationRef(value);
  return invocation?.kind === "installed-capability" ? invocation : null;
}

const COMMAND_CONTEXT: ExactSchemaContext<
  MechanicsCommandSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "d20-observation": conformD20TestObservation,
    "clock-ref": conformClockRef,
    "damage-resolution": conformDamageResolution,
    "dice-observation": conformDiceObservation,
    "entity-ref": conformEntityRef,
    fingerprint: conformCanonicalFingerprint,
    id: identifier,
    "installed-invocation-ref": installedInvocation,
    "invocation-ref": conformMechanicsInvocationRef,
    "nonnegative-integer": (value) => counter(value, false),
    "occurrence-generation-ref": conformOccurrenceGenerationRef,
    "positive-integer": (value) => counter(value, true),
    "program-authority-receipt": conformMechanicsProgramAuthorityReceipt,
    "resource-ref": conformResourceRef,
    "signed-integer": signedInteger,
  },
  refs: {},
};

const conformAnswerStructure = exactConformer(
  MECHANICS_COMMAND_ANSWER_SCHEMA,
  COMMAND_CONTEXT
);
const conformCommandStructure = exactConformer(MECHANICS_COMMAND_SCHEMA, COMMAND_CONTEXT);
const conformRequesterStructure = exactConformer(
  MECHANICS_COMMAND_REQUESTER_SCHEMA,
  COMMAND_CONTEXT
);
const conformExecutionFrameStructure = exactConformer(
  MECHANICS_EXECUTION_FRAME_SCHEMA,
  COMMAND_CONTEXT
);
const conformProgramRootReceiptStructure = exactConformer(
  PROGRAM_ROOT_RECEIPT_SCHEMA,
  COMMAND_CONTEXT
);
const conformSuspensionStructure = exactConformer(
  MECHANICS_COMMAND_SUSPENSION_SCHEMA,
  COMMAND_CONTEXT
);

function strictlyIncreasing<Value>(
  values: readonly Value[],
  key: (value: Value) => string
): boolean {
  let previous: string | null = null;
  for (const value of values) {
    const current = key(value);
    if (previous !== null && previous >= current) return false;
    previous = current;
  }
  return true;
}

function answerSemantics(answer: Readonly<MechanicsCommandAnswer>): boolean {
  if (answer.kind === "entities") {
    return answer.targets.length <= MAX_ENTITY_TARGETS;
  }
  if (answer.kind === "ordering") {
    if (
      answer.partitions.length > MAX_ORDERING_PARTITIONS ||
      !strictlyIncreasing(answer.partitions, ({ collisionKey }) => collisionKey)
    ) {
      return false;
    }
    const proposalIds = answer.partitions.flatMap(
      ({ proposalIds: partitionProposalIds }) => partitionProposalIds
    );
    return (
      proposalIds.length <= MAX_ORDERING_PROPOSALS &&
      new Set(proposalIds).size === proposalIds.length
    );
  }
  if (answer.kind === "d20" || answer.kind === "dice") {
    return (
      answer.payments.length <= MAX_PAYMENTS &&
      strictlyIncreasing(answer.payments, ({ paymentId }) => paymentId)
    );
  }
  return true;
}

function answersAreCanonical(
  answers: readonly Readonly<MechanicsCommandAnswer>[]
): boolean {
  return (
    answers.length <= MAX_ANSWERS &&
    strictlyIncreasing(answers, ({ requestId }) => requestId) &&
    answers.every(answerSemantics)
  );
}

/** Exact standalone answer boundary used by UI adapters and suspension stores. */
export function conformMechanicsCommandAnswer(
  value: unknown
): Readonly<MechanicsCommandAnswer> | null {
  const answer = conformAnswerStructure(value);
  return answer && answerSemantics(answer) ? answer : null;
}

/** Public command boundary. It contains no requester, actor, program, role, or fact. */
export function conformMechanicsCommand(
  value: unknown
): Readonly<MechanicsCommand> | null {
  const command = conformCommandStructure(value);
  return command && (command.kind !== "resume" || answersAreCanonical(command.answers))
    ? command
    : null;
}

/** Separate authentication/worklist context; it can never become a JournalActorRef. */
export function conformMechanicsCommandRequester(
  value: unknown
): Readonly<MechanicsCommandRequester> | null {
  return conformRequesterStructure(value);
}

/**
 * Match public resume input to its exact suspension. The action id has one source:
 * the suspension's preallocated command id, never resume input.
 */
export function conformMechanicsCommandResume(
  commandValue: unknown,
  suspensionValue: unknown
): Readonly<MechanicsCommandResumeMatch> | null {
  const command = conformMechanicsCommand(commandValue);
  const suspension = conformMechanicsCommandSuspension(suspensionValue);
  if (
    command?.kind !== "resume" ||
    !suspension ||
    command.suspensionId !== suspension.suspensionId
  ) {
    return null;
  }
  return Object.freeze({
    command,
    commandId: suspension.commandId,
    suspension,
  });
}

/**
 * Least-authority activation policy. `resolvedDefinition` must come from the
 * authoritative resolver; anchors never confer permission to activate a capability.
 */
export function authorizeMechanicsRequester(
  requester: Readonly<MechanicsCommandRequester>,
  resolvedDefinition: ResolvedMechanicsRequesterDefinition,
  engineContext?: Readonly<MechanicsTrustedEngineContext>
): Readonly<MechanicsRequesterAuthorization> {
  const owner = resolvedDefinition.installation.owner;
  if (owner.kind === "material-authority") {
    return Object.freeze({
      reason: "material-authority-policy-required",
      status: "denied",
    });
  }
  if (requester.kind === "engine") {
    return engineContext?.kind === "trusted-engine"
      ? Object.freeze({ basis: "trusted-engine", status: "authorized" })
      : Object.freeze({ reason: "engine-context-required", status: "denied" });
  }
  if (owner.material.kind !== "character-play") {
    return Object.freeze({ reason: "owner-not-character-play", status: "denied" });
  }
  return owner.material.uid === requester.uid
    ? Object.freeze({ basis: "installation-owner", status: "authorized" })
    : Object.freeze({ reason: "requester-owner-mismatch", status: "denied" });
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function triggerRoleEntity(
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  evidence: Readonly<MechanicsTriggerEvidence>,
  role: MechanicsRole
): Readonly<EntityRef> | null {
  if (role === "triggering-attacker") {
    return evidence.kind === "damage-taken" ? evidence.attacker : null;
  }
  if (role === "victim") {
    if (evidence.kind === "damage-taken") return evidence.resolution.packet.target;
    return evidence.kind === "hit-points-zero" ? evidence.target : null;
  }
  return authority.anchors[role];
}

function roleMatches(
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  evidence: Readonly<MechanicsTriggerEvidence>,
  role: MechanicsRole,
  entity: Readonly<EntityRef>
): boolean {
  const resolved = triggerRoleEntity(authority, evidence, role);
  return resolved !== null && sameCanonical(resolved, entity);
}

/** Shape-level trigger proof; selectors needing world state are checked by execution. */
function phaseTriggerMatches(
  trigger: Readonly<MechanicsPhaseTrigger>,
  evidence: Readonly<MechanicsTriggerEvidence>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): boolean {
  if (trigger.kind !== evidence.kind) return false;
  switch (trigger.kind) {
    case "invocation":
      return evidence.kind === "invocation";
    case "turn-boundary":
      return (
        evidence.kind === "turn-boundary" &&
        trigger.phase === evidence.phase &&
        sameCanonical(evidence.clock.material, evidence.combatant.material) &&
        roleMatches(authority, evidence, trigger.combatant, evidence.combatant)
      );
    case "resource-depleted":
      return evidence.kind === "resource-depleted";
    case "hit-points-zero":
      return (
        evidence.kind === "hit-points-zero" &&
        roleMatches(authority, evidence, trigger.target, evidence.target)
      );
    case "damage-taken":
      return (
        evidence.kind === "damage-taken" &&
        roleMatches(
          authority,
          evidence,
          trigger.target,
          evidence.resolution.packet.target
        )
      );
    case "rest-completed":
      return (
        evidence.kind === "rest-completed" &&
        trigger.rest === evidence.rest &&
        sameCanonical(evidence.clock.material, evidence.combatant.material) &&
        roleMatches(authority, evidence, trigger.combatant, evidence.combatant)
      );
    case "day-phase":
      return evidence.kind === "day-phase" && trigger.phase === evidence.phase;
    case "source-end":
      return evidence.kind === "source-end";
    case "program-phase-end":
      return (
        evidence.kind === "program-phase-end" && trigger.phaseId === evidence.phaseId
      );
    case "area-boundary":
      return (
        evidence.kind === "area-boundary" &&
        trigger.boundary === evidence.boundary &&
        roleMatches(authority, evidence, trigger.entity, evidence.entity)
      );
    case "manual-table-event": {
      const owner = authority.installation.owner;
      return (
        evidence.kind === "manual-table-event" &&
        trigger.eventId === evidence.eventId &&
        "kind" in owner &&
        owner.kind === "material-authority" &&
        owner.authority === evidence.authority
      );
    }
    // The root's possessor declares the pulse; advance CAS on the exact
    // execution + trigger event id keeps each declaration single-use.
    case "root-pulse":
      return evidence.kind === "root-pulse" && trigger.eventId === evidence.eventId;
  }
}

function frameSemantics(frame: Readonly<MechanicsExecutionFrame>): boolean {
  const { authority, invocation, rootReceipt, trigger } = frame;
  const program = authority.snapshot.program;
  if (!program || !programRootReceiptIsCoherent(rootReceipt)) return false;
  if (
    rootReceipt.next.triggerEventId !==
    (trigger.kind === "invocation" ? null : trigger.triggerEventId)
  ) {
    return false;
  }
  const phase = program.phases.find(
    ({ phaseId }) => phaseId === rootReceipt.next.phaseId
  );
  if (!phase || !phaseTriggerMatches(phase.trigger, trigger, authority)) return false;
  if (
    trigger.kind === "program-phase-end" &&
    !sameCanonical(trigger.occurrence, rootReceipt.root)
  ) {
    return false;
  }

  const rootMaterial = rootReceipt.root.occurrence.material;
  if (!sameCanonical(rootMaterial, authority.installation.owner.material)) return false;

  if (rootReceipt.kind === "create") {
    return (
      trigger.kind === "invocation" &&
      invocation.kind === "installed-capability" &&
      sameCanonical(invocation.installation, authority.installation)
    );
  }
  return (
    trigger.kind !== "invocation" &&
    invocation.kind === "program-root" &&
    sameCanonical(invocation.occurrence, rootReceipt.root)
  );
}

/** Exact standalone program-root allocation/CAS receipt. */
export function conformProgramRootReceipt(
  value: unknown
): Readonly<ProgramRootReceipt> | null {
  const receipt = conformProgramRootReceiptStructure(value);
  return receipt && programRootReceiptIsCoherent(receipt) ? receipt : null;
}

/** Exact standalone recoverable frame boundary shared by commands and execution. */
export function conformMechanicsExecutionFrame(
  value: unknown
): Readonly<MechanicsExecutionFrame> | null {
  const frame = conformExecutionFrameStructure(value);
  return frame && frameSemantics(frame) ? frame : null;
}

type SuspensionIdentity = Pick<
  MechanicsCommandSuspension,
  "commandId" | "documentFences" | "frame" | "observationKeys" | "schema"
>;

/** Stable id of a recoverable frame; answers may evolve without changing its identity. */
export function mechanicsCommandSuspensionId(
  suspension: Readonly<SuspensionIdentity>
): MechanicsFingerprint {
  return canonicalFingerprint({
    commandId: suspension.commandId,
    documentFences: suspension.documentFences,
    frame: suspension.frame,
    observationKeys: suspension.observationKeys,
    schema: suspension.schema,
  });
}

/** Exact, canonical, bounded, deeply frozen suspension boundary. */
export function conformMechanicsCommandSuspension(
  value: unknown
): Readonly<MechanicsCommandSuspension> | null {
  const suspension = conformSuspensionStructure(value);
  if (
    !suspension ||
    suspension.documentFences.length > MAX_DOCUMENT_FENCES ||
    suspension.observationKeys.length > MAX_OBSERVATION_KEYS ||
    !answersAreCanonical(suspension.answers) ||
    !strictlyIncreasing(suspension.documentFences, ({ material }) =>
      materialRefKey(material)
    ) ||
    !strictlyIncreasing(suspension.observationKeys, ({ requestId }) => requestId) ||
    !conformMechanicsExecutionFrame(suspension.frame) ||
    suspension.suspensionId !== mechanicsCommandSuspensionId(suspension)
  ) {
    return null;
  }

  const { invocation, rootReceipt } = suspension.frame;
  const rootKey = materialRefKey(rootReceipt.root.occurrence.material);
  const rootFence = suspension.documentFences.find(
    ({ material }) => materialRefKey(material) === rootKey
  );
  if (!rootFence) return null;
  if (
    rootReceipt.kind === "create" &&
    (invocation.kind !== "installed-capability" ||
      materialRefKey(invocation.installation.owner.material) !== rootKey ||
      rootFence.epoch !== rootReceipt.materialEpoch)
  ) {
    return null;
  }
  if (
    rootReceipt.kind === "advance" &&
    (invocation.kind !== "program-root" ||
      materialRefKey(invocation.occurrence.occurrence.material) !== rootKey ||
      !sameCanonical(invocation.occurrence, rootReceipt.root))
  ) {
    return null;
  }

  const observationRequestIds = new Set(
    suspension.observationKeys.map(({ requestId }) => requestId)
  );
  if (
    suspension.answers.some(
      (answer) =>
        (answer.kind === "d20" || answer.kind === "dice") &&
        !observationRequestIds.has(answer.requestId)
    )
  ) {
    return null;
  }
  return suspension;
}
