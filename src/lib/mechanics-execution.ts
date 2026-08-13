/** Pure simultaneous-group validation and collision analysis. */

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { conformMechanicsAuthoritySnapshot } from "@/lib/mechanics-authority";
import {
  finalizeMechanicsEndWave,
  isMechanicsEndWaveReceiptForWorld,
  rebaseMechanicsCausalState,
} from "@/lib/mechanics-world";
import {
  conformMechanicsOperation,
  conformMechanicsTransaction,
  simulateMechanicsTransaction,
} from "@/lib/mechanics-operation";
import { conformMechanicId } from "@/lib/mechanics-reference-schema";
import type { ActionFactGuard, JournalActorRef } from "@/types/action-journal";
import type { MechanicsAuthoritySnapshot } from "@/types/mechanics-authority";
import type {
  GroupProposal,
  MechanicsEvent,
  MechanicsEndWaveFinalizationResult,
  MechanicsPostEvent,
  MechanicsSourceEndingEventDerivationResult,
  OrderingObservation,
  ResolutionGroup,
  ResolutionGroupAnalysis,
  ResolutionGroupSimulationResult,
  ResolutionPartition,
} from "@/types/mechanics-execution";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
  MechanicsOperationExecution,
  MechanicsOperationStage,
} from "@/types/mechanics-operation";
import type { EntityRef } from "@/types/mechanics-reference";
import type { MechanicsCausalState, MechanicsWorld } from "@/types/mechanics-world";

const MAX_ID_LENGTH = 256;
const MAX_PROPOSALS = 512;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

/** Trusted transient input owned by this execution module, never a public command. */
interface ResolutionGroupContext {
  readonly actionId: string;
  readonly actor: JournalActorRef;
  readonly authoritySnapshot: Readonly<MechanicsAuthoritySnapshot>;
  readonly causes: readonly [
    Readonly<MechanicsOperationCause>,
    ...Readonly<MechanicsOperationCause>[],
  ];
  readonly factGuards: readonly Readonly<ActionFactGuard>[];
  readonly ordering: Readonly<OrderingObservation> | null;
  readonly state: Readonly<MechanicsCausalState>;
}

function id(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
  );
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const own = Reflect.ownKeys(value);
  const expected = [...keys].sort();
  return (
    own.length === expected.length &&
    own.every((key) => typeof key === "string") &&
    own.sort().every((key, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        key === expected[index] &&
        descriptor?.enumerable === true &&
        "value" in descriptor
      );
    })
  );
}

function denseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return false;
  }
  const own = Reflect.ownKeys(value);
  return (
    own.length === value.length + 1 &&
    own.at(-1) === "length" &&
    own.slice(0, -1).every((key, index) => key === String(index))
  );
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(freezeDeep);
  Object.freeze(value);
  return value;
}

export function conformResolutionGroup(value: unknown): Readonly<ResolutionGroup> | null {
  if (!exactRecord(value, ["groupId", "proposals"]) || !id(value.groupId)) {
    return null;
  }
  if (!denseArray(value.proposals)) return null;
  if (value.proposals.length < 1 || value.proposals.length > MAX_PROPOSALS) return null;

  const proposals: GroupProposal[] = [];
  const proposalIds = new Set<string>();
  const operationIds = new Set<string>();
  for (const proposalValue of value.proposals) {
    if (
      !exactRecord(proposalValue, ["operation", "proposalId"]) ||
      !id(proposalValue.proposalId) ||
      proposalIds.has(proposalValue.proposalId)
    ) {
      return null;
    }
    const operation = conformMechanicsOperation(proposalValue.operation);
    if (!operation || operationIds.has(operation.operationId)) return null;
    proposalIds.add(proposalValue.proposalId);
    operationIds.add(operation.operationId);
    proposals.push({ operation, proposalId: proposalValue.proposalId });
  }
  return freezeDeep({
    groupId: value.groupId,
    proposals,
  }) as Readonly<ResolutionGroup>;
}

/** Stable opaque collision address for one terminal operation. */
export function mechanicsOperationCollisionKey(
  operation: Readonly<MechanicsOperation>
): string | null {
  switch (operation.kind) {
    case "creature-damage":
    case "object-damage":
      return `collision:${canonicalFingerprint({
        kind: "vitals",
        target: operation.damage.computed.target,
      })}`;
    case "creature-healing":
    case "object-repair":
    case "temporary-hit-points-grant":
    case "temporary-hit-points-clear":
    case "creature-stabilize":
    case "creature-kill":
    case "creature-reduce-to-zero":
    case "creature-revive":
    case "creature-death-save":
    case "creature-maximum-sync":
    case "object-maximum-sync":
    case "exhaustion-transition":
      return `collision:${canonicalFingerprint({
        kind: "vitals",
        target: operation.target,
      })}`;
    case "resource-transition":
    case "resource-initialize":
    case "resource-remove":
      return `collision:${canonicalFingerprint({
        kind: "resource",
        resource: operation.resource,
      })}`;
    case "occurrence-create":
      return `collision:${canonicalFingerprint({
        kind: "occurrence",
        occurrence: {
          material: operation.material,
          occurrenceId: operation.occurrenceId,
        },
      })}`;
    case "occurrence-end":
      return `collision:${canonicalFingerprint({
        kind: "occurrence",
        occurrence: operation.occurrence,
      })}`;
  }
}

function requestId(groupId: string, partitions: readonly ResolutionPartition[]): string {
  return `ordering:${canonicalFingerprint({ groupId, partitions })}`;
}

function eventId(
  kind: MechanicsEvent["kind"],
  operationId: string,
  subject: unknown
): string {
  return `event:${canonicalFingerprint({ kind, operationId, subject })}`;
}

function analyzeConformedResolutionGroup(
  group: Readonly<ResolutionGroup>
): ResolutionGroupAnalysis {
  const byKey = new Map<string, GroupProposal[]>();
  for (const proposal of group.proposals) {
    const key = mechanicsOperationCollisionKey(proposal.operation);
    if (!key) return { kind: "rejected", reason: "unsupported-operation" };
    const bucket = byKey.get(key) ?? [];
    bucket.push(proposal);
    byKey.set(key, bucket);
  }
  const partitions = [...byKey.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([collisionKey, proposals]) => ({
      collisionKeys: [collisionKey],
      proposalIds: proposals.map(({ proposalId }) => proposalId).sort(compareCodeUnits),
    }));
  const collisions = [...byKey.entries()].filter(([, proposals]) => proposals.length > 1);
  const collisionKeys = collisions.map(([key]) => key).sort(compareCodeUnits);
  if (collisions.length === 0) return { collisionKeys, kind: "disjoint", partitions };
  return {
    collisionKeys,
    kind: "needs-ordering",
    partitions,
    requestId: requestId(
      group.groupId,
      partitions.filter(({ proposalIds }) => proposalIds.length > 1)
    ),
  };
}

/** Analyze collisions without applying any proposal. */
export function analyzeResolutionGroup(value: unknown): ResolutionGroupAnalysis {
  const group = conformResolutionGroup(value);
  return group
    ? analyzeConformedResolutionGroup(group)
    : { kind: "rejected", reason: "invalid-group" };
}

/** Validate the exact player/DM ordering independently inside each collision partition. */
export function conformOrderingObservation(
  value: unknown,
  request: {
    readonly requestId: string;
    readonly partitions: readonly ResolutionPartition[];
  }
): Readonly<OrderingObservation> | null {
  if (
    !exactRecord(value, ["kind", "partitions", "requestId"]) ||
    value.kind !== "ordering" ||
    value.requestId !== request.requestId ||
    !denseArray(value.partitions) ||
    value.partitions.length !== request.partitions.length
  ) {
    return null;
  }
  const expectedByKey = new Map(
    request.partitions.map((partition) => [partition.collisionKeys[0], partition])
  );
  const partitions: Array<{ collisionKey: string; proposalIds: string[] }> = [];
  for (const raw of value.partitions) {
    if (
      !exactRecord(raw, ["collisionKey", "proposalIds"]) ||
      typeof raw.collisionKey !== "string" ||
      !denseArray(raw.proposalIds) ||
      raw.proposalIds.some((entry) => !id(entry))
    ) {
      return null;
    }
    const expected = expectedByKey.get(raw.collisionKey);
    if (
      !expected ||
      raw.proposalIds.length !== expected.proposalIds.length ||
      new Set(raw.proposalIds).size !== raw.proposalIds.length ||
      [...raw.proposalIds]
        .sort(compareCodeUnits)
        .some(
          (entry, index) =>
            entry !== [...expected.proposalIds].sort(compareCodeUnits)[index]
        )
    ) {
      return null;
    }
    expectedByKey.delete(raw.collisionKey);
    partitions.push({
      collisionKey: raw.collisionKey,
      proposalIds: [...raw.proposalIds],
    });
  }
  if (expectedByKey.size !== 0) return null;
  return freezeDeep({
    kind: "ordering",
    partitions,
    requestId: value.requestId,
  });
}

/** Return deterministic partitions; only colliding partitions consult observations. */
export function orderResolutionPartitions(
  analysis: Exclude<ResolutionGroupAnalysis, { readonly kind: "rejected" }>,
  observation?: Readonly<OrderingObservation>
): readonly ResolutionPartition[] | null {
  if (analysis.kind !== "needs-ordering") return analysis.partitions;
  const collisions = analysis.partitions.filter(
    ({ proposalIds }) => proposalIds.length > 1
  );
  const ordered = conformOrderingObservation(observation, {
    partitions: collisions,
    requestId: analysis.requestId,
  });
  if (!ordered) return null;
  const orderedByKey = new Map(
    ordered.partitions.map((partition) => [partition.collisionKey, partition.proposalIds])
  );
  return analysis.partitions.map((partition) => ({
    ...partition,
    proposalIds: orderedByKey.get(partition.collisionKeys[0]) ?? partition.proposalIds,
  }));
}

function conformResolutionGroupContext(
  value: unknown,
  operations: readonly Readonly<MechanicsOperation>[]
): Readonly<ResolutionGroupContext> | null {
  if (
    !exactRecord(value, [
      "actionId",
      "actor",
      "authoritySnapshot",
      "causes",
      "factGuards",
      "ordering",
      "state",
    ]) ||
    (value.ordering !== null && typeof value.ordering !== "object")
  ) {
    return null;
  }
  const authoritySnapshot = conformMechanicsAuthoritySnapshot(value.authoritySnapshot);
  if (!authoritySnapshot || typeof value.state !== "object" || value.state === null) {
    return null;
  }
  const candidateState = value.state as Readonly<MechanicsCausalState>;
  const causalState = rebaseMechanicsCausalState(candidateState.world, candidateState);
  if (!causalState.ok) return null;
  const transaction = conformMechanicsTransaction({
    actionId: value.actionId,
    actor: value.actor,
    causes: value.causes,
    factGuards: value.factGuards,
    operations,
  });
  if (!transaction) return null;
  return freezeDeep({
    actionId: transaction.actionId,
    actor: transaction.actor,
    authoritySnapshot,
    causes: transaction.causes,
    factGuards: transaction.factGuards,
    ordering: value.ordering === null ? null : structuredClone(value.ordering),
    state: causalState.value,
  }) as Readonly<ResolutionGroupContext>;
}

/**
 * Resolve one simultaneous proposal set into a single atomic transaction.
 * Disjoint partitions use canonical order. Every collision requires exact
 * table ordering before any operation is simulated: arithmetic commutativity
 * cannot erase causal ordering, depletion triggers, or capacity failures.
 */
export function simulateResolutionGroup(
  groupValue: unknown,
  contextValue: unknown
): ResolutionGroupSimulationResult {
  if (!exactRecord(groupValue, ["groupId", "proposals"])) {
    return { operationId: null, reason: "invalid-group", status: "rejected" };
  }
  if (
    !exactRecord(contextValue, [
      "actionId",
      "actor",
      "authoritySnapshot",
      "causes",
      "factGuards",
      "ordering",
      "state",
    ])
  ) {
    return { operationId: null, reason: "invalid-context", status: "rejected" };
  }
  const group = conformResolutionGroup(groupValue);
  if (!group) {
    return { operationId: null, reason: "invalid-group", status: "rejected" };
  }
  const analysis = analyzeConformedResolutionGroup(group);
  if (analysis.kind === "rejected") {
    return { operationId: null, reason: analysis.reason, status: "rejected" };
  }
  const context = conformResolutionGroupContext(
    contextValue,
    group.proposals.map(({ operation }) => operation)
  );
  if (!context) {
    return { operationId: null, reason: "invalid-context", status: "rejected" };
  }

  if (analysis.kind !== "needs-ordering" && context.ordering !== null) {
    return { operationId: null, reason: "unexpected-ordering", status: "rejected" };
  }
  if (analysis.kind === "needs-ordering" && context.ordering === null) {
    return {
      analysis,
      request: {
        kind: "ordering",
        partitions: analysis.partitions.filter(
          ({ proposalIds }) => proposalIds.length > 1
        ),
        requestId: analysis.requestId,
      },
      status: "needs-ordering",
    };
  }

  const partitions = orderResolutionPartitions(analysis, context.ordering ?? undefined);
  if (!partitions) {
    return { operationId: null, reason: "invalid-ordering", status: "rejected" };
  }
  const proposalById = new Map(
    group.proposals.map((proposal) => [proposal.proposalId, proposal] as const)
  );
  const orderedProposalIds = partitions.flatMap(({ proposalIds }) => proposalIds);
  const operations = orderedProposalIds.map(
    (proposalId) => proposalById.get(proposalId)?.operation
  );
  if (
    operations.some((operation) => operation === undefined) ||
    operations.length !== group.proposals.length
  ) {
    return { operationId: null, reason: "invalid-group", status: "rejected" };
  }

  const result = simulateMechanicsTransaction(
    {
      actionId: context.actionId,
      actor: context.actor,
      causes: context.causes,
      factGuards: context.factGuards,
      operations,
    },
    { authoritySnapshot: context.authoritySnapshot, state: context.state }
  );
  if (result.status === "rejected") {
    return {
      operationId: result.operationId,
      reason: result.reason,
      status: "rejected",
    };
  }
  if (result.status === "needs-observation") {
    return {
      analysis,
      boundary: result.boundary,
      operationId: result.operationId,
      orderedProposalIds: freezeDeep([...orderedProposalIds]),
      requirement: result.requirement,
      status: "needs-observation",
      transaction: result.transaction,
    };
  }
  if (result.status === "no-change") {
    return {
      actionFacts: [],
      analysis,
      consequences: [],
      events: [],
      executions: result.executions,
      orderedProposalIds: freezeDeep([...orderedProposalIds]),
      stages: [],
      state: result.state,
      status: "no-change",
      transaction: result.transaction,
    };
  }

  const events: MechanicsPostEvent[] = [];
  for (const stage of result.stages) {
    events.push(...deriveMechanicsPostEvents(stage));
  }
  return {
    actionFacts: result.actionFacts,
    analysis,
    consequences: result.consequences,
    events: freezeDeep(events),
    executions: result.executions,
    orderedProposalIds: freezeDeep([...orderedProposalIds]),
    stages: result.stages,
    state: result.state,
    status: "simulated",
    transaction: result.transaction,
  };
}

function hpZeroEvent(
  operation: Readonly<MechanicsOperationExecution>,
  target: Readonly<EntityRef>
): MechanicsPostEvent[] {
  const becameZero =
    operation.kind === "creature-damage"
      ? operation.facts.wouldDropToZero && !operation.facts.remainedAtOne
      : operation.kind === "creature-reduce-to-zero"
        ? true
        : operation.kind === "creature-maximum-sync"
          ? operation.facts.maximumReachedZero
          : operation.kind === "exhaustion-transition"
            ? operation.facts.becameDead
            : false;
  return becameZero
    ? [
        {
          eventId: eventId("hit-points-zero", operation.operationId, target),
          kind: "hit-points-zero",
          operationId: operation.operationId,
          target,
        },
      ]
    : [];
}

/** Ordinary post-events can consume only a transaction-kernel stage. */
function deriveMechanicsPostEvents(
  stage: Readonly<MechanicsOperationStage>
): MechanicsPostEvent[] {
  const { execution } = stage;
  if (execution.kind === "creature-damage") {
    const operation = execution.operation;
    const target = operation.damage.computed.target;
    return [
      {
        attacker: operation.attacker,
        criticalHit: operation.criticalHit,
        eventId: eventId("damage-taken", operation.operationId, {
          attacker: operation.attacker,
          criticalHit: operation.criticalHit,
          resolution: operation.damage,
        }),
        kind: "damage-taken",
        operationId: operation.operationId,
        resolution: operation.damage,
      },
      ...hpZeroEvent(execution, target),
    ];
  }
  if (execution.kind === "object-damage") {
    const operation = execution.operation;
    return [
      {
        attacker: operation.attacker,
        criticalHit: operation.criticalHit,
        eventId: eventId("damage-taken", operation.operationId, {
          attacker: operation.attacker,
          criticalHit: operation.criticalHit,
          resolution: operation.damage,
        }),
        kind: "damage-taken",
        operationId: operation.operationId,
        resolution: operation.damage,
      },
    ];
  }
  if (execution.kind === "resource-transition" && execution.facts.becameEmpty) {
    const operation = execution.operation;
    return [
      {
        eventId: eventId("resource-depleted", operation.operationId, operation.resource),
        kind: "resource-depleted",
        operationId: operation.operationId,
        resource: operation.resource,
      },
    ];
  }
  if (execution.kind === "occurrence-create") {
    return [];
  }
  if (execution.kind === "occurrence-end") return [];
  if (
    execution.kind === "creature-healing" ||
    execution.kind === "temporary-hit-points-grant" ||
    execution.kind === "temporary-hit-points-clear" ||
    execution.kind === "creature-stabilize" ||
    execution.kind === "creature-kill" ||
    execution.kind === "creature-reduce-to-zero" ||
    execution.kind === "creature-revive" ||
    execution.kind === "creature-death-save" ||
    execution.kind === "creature-maximum-sync" ||
    execution.kind === "exhaustion-transition"
  ) {
    const operation = execution.operation;
    return hpZeroEvent(execution, operation.target);
  }
  return [];
}

/**
 * Convert an exact discovered receipt into pre-finalization events. World-core
 * re-proves the complete wave against its readable basis before anything fires.
 */
export function deriveMechanicsSourceEndingEvents(
  worldValue: unknown,
  waveValue: unknown,
  operationId: string
): MechanicsSourceEndingEventDerivationResult {
  if (conformMechanicId(operationId) === null) {
    return { reason: "invalid-end-wave", status: "rejected" };
  }
  if (!isMechanicsEndWaveReceiptForWorld(worldValue, waveValue)) {
    return { reason: "invalid-end-wave", status: "rejected" };
  }
  const wave = waveValue;
  return {
    events: freezeDeep(
      wave.candidates.map(({ occurrence }) => ({
        eventId: eventId("source-ending", operationId, occurrence),
        kind: "source-ending" as const,
        occurrence,
        operationId,
      }))
    ),
    status: "derived",
  };
}

/**
 * Finalize one exact latched wave. The ratified post-finalization event grammar
 * is empty; state cleanup remains represented by the action journal.
 */
export function finalizeMechanicsEndWaveWithEvents(
  beforeValue: unknown,
  waveValue: unknown
): MechanicsEndWaveFinalizationResult {
  const finalized = finalizeMechanicsEndWave(
    beforeValue as Readonly<MechanicsWorld>,
    waveValue as Parameters<typeof finalizeMechanicsEndWave>[1]
  );
  return finalized.status === "rejected"
    ? { reason: finalized.reason, status: "rejected" }
    : freezeDeep({
        events: [] as const,
        status: "finalized" as const,
        world: finalized.world,
      });
}
