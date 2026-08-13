/** Pure simultaneous-group validation and collision analysis. */

import { materialRefKey } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { projectResolvedEntityConditions } from "@/lib/condition-projection";
import { parseMechanicsWorld } from "@/lib/mechanics-world";
import {
  conformMechanicsOperation,
  conformMechanicsTransaction,
  planMechanicsTransaction,
} from "@/lib/mechanics-operation";
import {
  conformMechanicId,
  conformOccurrenceRef,
} from "@/lib/mechanics-reference-schema";
import type {
  GroupProposal,
  MechanicsEndWaveEvents,
  MechanicsEvent,
  MechanicsPostEventDerivationResult,
  OrderingObservation,
  ResolutionGroup,
  ResolutionGroupAnalysis,
  ResolutionGroupContext,
  ResolutionGroupPlanResult,
  ResolutionPartition,
} from "@/types/mechanics-execution";
import type {
  MechanicsOperation,
  MechanicsOperationExecution,
} from "@/types/mechanics-operation";
import type { EntityRef, OccurrenceRef } from "@/types/mechanics-reference";
import type { MechanicsWorld } from "@/types/mechanics-world";
import type { MechanicsEndCandidate } from "@/types/mechanics-world";

const MAX_ID_LENGTH = 256;
const MAX_PROPOSALS = 512;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

function id(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
  );
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

/** Exact hostile-input boundary; accepted output owns no aliases with the input. */
export function conformResolutionGroup(value: unknown): Readonly<ResolutionGroup> | null {
  if (!exactRecord(value, ["basis", "groupId", "proposals"]) || !id(value.groupId)) {
    return null;
  }
  const parsedBasis = parseMechanicsWorld(value.basis);
  if (!parsedBasis.ok || !denseArray(value.proposals)) return null;
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
    basis: parsedBasis.value,
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

/** Analyze collisions against one shared basis without applying any proposal. */
export function analyzeResolutionGroup(value: unknown): ResolutionGroupAnalysis {
  const group = conformResolutionGroup(value);
  if (!group) return { kind: "rejected", reason: "invalid-group" };
  const byKey = new Map<string, GroupProposal[]>();
  for (const proposal of group.proposals) {
    const key = mechanicsOperationCollisionKey(proposal.operation);
    if (!key) return { kind: "rejected", reason: "unsupported-operation" };
    const bucket = byKey.get(key) ?? [];
    bucket.push(proposal);
    byKey.set(key, bucket);
  }
  const partitions = [...byKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([collisionKey, proposals]) => ({
      collisionKeys: [collisionKey],
      proposalIds: proposals.map(({ proposalId }) => proposalId).sort(),
    }));
  const collisions = [...byKey.entries()].filter(([, proposals]) => proposals.length > 1);
  const collisionKeys = collisions.map(([key]) => key).sort();
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
        .sort()
        .some((entry, index) => entry !== [...expected.proposalIds].sort()[index])
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
    !exactRecord(value, ["actionId", "actor", "causes", "factGuards", "ordering"]) ||
    (value.ordering !== null && typeof value.ordering !== "object")
  ) {
    return null;
  }
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
    causes: transaction.causes,
    factGuards: transaction.factGuards,
    ordering: value.ordering === null ? null : structuredClone(value.ordering),
  }) as Readonly<ResolutionGroupContext>;
}

/**
 * Resolve one simultaneous proposal set into a single atomic transaction.
 * Disjoint partitions use canonical order. Every collision requires exact
 * table ordering before any operation is simulated: arithmetic commutativity
 * cannot erase causal ordering, depletion triggers, or capacity failures.
 */
export function planResolutionGroup(
  groupValue: unknown,
  contextValue: unknown
): ResolutionGroupPlanResult {
  const group = conformResolutionGroup(groupValue);
  if (!group) {
    return { operationId: null, reason: "invalid-group", status: "rejected" };
  }
  const analysis = analyzeResolutionGroup(group);
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

  const result = planMechanicsTransaction(group.basis, {
    actionId: context.actionId,
    actor: context.actor,
    causes: context.causes,
    factGuards: context.factGuards,
    operations,
  });
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
    };
  }
  if (result.status === "no-change") {
    return {
      analysis,
      events: [],
      executions: result.executions,
      orderedProposalIds: freezeDeep([...orderedProposalIds]),
      status: "no-change",
      transaction: result.transaction,
      world: result.world,
    };
  }

  const events: MechanicsEvent[] = [];
  for (const stage of result.stages) {
    const derived = deriveMechanicsPostEvents(stage.before, stage.after, [
      stage.execution,
    ]);
    if (derived.status === "rejected") {
      return {
        operationId: stage.execution.operationId,
        reason: "post-event-derivation",
        status: "rejected",
      };
    }
    events.push(...derived.events);
  }
  return {
    action: result.action,
    analysis,
    events: freezeDeep(events),
    executions: result.executions,
    orderedProposalIds: freezeDeep([...orderedProposalIds]),
    status: "planned",
    transaction: result.transaction,
    world: result.world,
  };
}

function occurrenceAt(world: Readonly<MechanicsWorld>, ref: Readonly<OccurrenceRef>) {
  return world.documents.find(
    ({ material }) => materialRefKey(material) === materialRefKey(ref.material)
  )?.state.occurrences[ref.occurrenceId];
}

function conditions(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): ReadonlySet<string> {
  return new Set(
    projectResolvedEntityConditions(world, target)?.projection.effective.map(
      ({ conditionId }) => conditionId
    ) ?? []
  );
}

function conditionEvents(
  before: Readonly<MechanicsWorld>,
  after: Readonly<MechanicsWorld>,
  operationId: string,
  target: Readonly<EntityRef>
): MechanicsEvent[] {
  const prior = conditions(before, target);
  const next = conditions(after, target);
  return [...new Set([...prior, ...next])].sort().flatMap((conditionId) =>
    prior.has(conditionId) === next.has(conditionId)
      ? []
      : [
          {
            conditionId,
            eventId: eventId("condition-changed", operationId, {
              conditionId,
              present: next.has(conditionId),
              target,
            }),
            kind: "condition-changed" as const,
            operationId,
            present: next.has(conditionId),
            target,
          },
        ]
  ) as MechanicsEvent[];
}

function hpZeroEvent(
  operation: Readonly<MechanicsOperationExecution>,
  target: Readonly<EntityRef>
): MechanicsEvent[] {
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

function executionFactsMatch(execution: Readonly<MechanicsOperationExecution>): boolean {
  switch (execution.kind) {
    case "creature-damage":
      return (
        Number.isSafeInteger(execution.facts.damageTaken) &&
        execution.facts.damageTaken >= 0 &&
        typeof execution.facts.wouldDropToZero === "boolean" &&
        typeof execution.facts.remainedAtOne === "boolean"
      );
    case "object-damage":
      return (
        Number.isSafeInteger(execution.facts.hitPointsLost) &&
        execution.facts.hitPointsLost >= 0
      );
    case "resource-transition":
      return typeof execution.facts.becameEmpty === "boolean";
    case "occurrence-create":
    case "occurrence-end":
      return (
        execution.facts.ended.every(
          (reference) => conformOccurrenceRef(reference) !== null
        ) &&
        (execution.facts.created === null ||
          conformOccurrenceRef(execution.facts.created) !== null)
      );
    case "creature-maximum-sync":
      return typeof execution.facts.maximumReachedZero === "boolean";
    case "exhaustion-transition":
      return typeof execution.facts.becameDead === "boolean";
    default:
      return true;
  }
}

function eventsForExecution(
  before: Readonly<MechanicsWorld>,
  after: Readonly<MechanicsWorld>,
  execution: Readonly<MechanicsOperationExecution>
): MechanicsEvent[] {
  if (execution.kind === "creature-damage") {
    const operation = execution.operation;
    const target = operation.damage.computed.target;
    return [
      {
        attacker: operation.attacker,
        criticalHit: operation.criticalHit,
        eventId: eventId("damage-taken", operation.operationId, {
          packetId: operation.damage.computed.packetId,
          target,
        }),
        kind: "damage-taken",
        operationId: operation.operationId,
        resolution: operation.damage,
      },
      ...hpZeroEvent(execution, target),
      ...conditionEvents(before, after, operation.operationId, target),
    ];
  }
  if (execution.kind === "object-damage") {
    const operation = execution.operation;
    return [
      {
        attacker: operation.attacker,
        criticalHit: operation.criticalHit,
        eventId: eventId("damage-taken", operation.operationId, {
          packetId: operation.damage.computed.packetId,
          target: operation.damage.computed.target,
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
    const operation = execution.operation;
    return operation.occurrence.kind !== "program"
      ? conditionEvents(before, after, operation.operationId, operation.occurrence.target)
      : [];
  }
  if (execution.kind === "occurrence-end") {
    const operation = execution.operation;
    const ended = execution.facts.ended.map((occurrence) => ({
      eventId: eventId("occurrence-ended", operation.operationId, occurrence),
      kind: "occurrence-ended" as const,
      occurrence,
      operationId: operation.operationId,
    }));
    const targets = execution.facts.ended.flatMap((occurrence) => {
      const prior = occurrenceAt(before, occurrence);
      return prior?.kind === "condition" ? [prior.target] : [];
    });
    return [
      ...ended,
      ...targets.flatMap((target) =>
        conditionEvents(before, after, operation.operationId, target)
      ),
    ];
  }
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
    return [
      ...hpZeroEvent(execution, operation.target),
      ...conditionEvents(before, after, operation.operationId, operation.target),
    ];
  }
  return [];
}

/** Derive post-resolution facts only; it neither executes operations nor captures subscribers. */
export function deriveMechanicsPostEvents(
  beforeValue: unknown,
  afterValue: unknown,
  executions: readonly Readonly<MechanicsOperationExecution>[]
): MechanicsPostEventDerivationResult {
  const before = parseMechanicsWorld(beforeValue);
  if (!before.ok) return { reason: "invalid-before", status: "rejected" };
  const after = parseMechanicsWorld(afterValue);
  if (!after.ok) return { reason: "invalid-after", status: "rejected" };
  if (!denseArray(executions)) {
    return { reason: "execution-mismatch", status: "rejected" };
  }
  const operationIds = new Set<string>();
  const accepted: MechanicsOperationExecution[] = [];
  for (const execution of executions) {
    if (
      !exactRecord(execution, ["facts", "kind", "operation", "operationId", "status"]) ||
      conformMechanicId(execution.operationId) === null ||
      operationIds.has(execution.operationId) ||
      execution.kind !== execution.operation.kind ||
      execution.operationId !== execution.operation.operationId ||
      !conformMechanicsOperation(execution.operation) ||
      !executionFactsMatch(execution)
    ) {
      return { reason: "execution-mismatch", status: "rejected" };
    }
    operationIds.add(execution.operationId);
    accepted.push(execution);
  }
  const events = accepted.flatMap((execution) =>
    eventsForExecution(before.value, after.value, execution)
  );
  return { events: freezeDeep(events), status: "derived" };
}

function occurrenceRefKey(reference: Readonly<OccurrenceRef>): string {
  return `${materialRefKey(reference.material)}\u0000${reference.occurrenceId}`;
}

/**
 * Convert a previously discovered end wave into causal events while every
 * source occurrence is still readable. The coordinator must deliver these
 * events to the captured subscribers before calling `finalizeMechanicsEndWave`.
 */
export function deriveMechanicsEndWaveEvents(
  beforeValue: unknown,
  candidates: readonly Readonly<MechanicsEndCandidate>[],
  operationId: string
): MechanicsEndWaveEvents | null {
  const before = parseMechanicsWorld(beforeValue);
  if (!before.ok || conformMechanicId(operationId) === null || !denseArray(candidates)) {
    return null;
  }
  const seen = new Set<string>();
  const events: MechanicsEvent[] = [];
  for (const candidate of candidates) {
    const key = occurrenceRefKey(candidate.occurrence);
    const occurrence = occurrenceAt(before.value, candidate.occurrence);
    if (
      seen.has(key) ||
      !occurrence ||
      !denseArray(candidate.causes) ||
      candidate.causes.length === 0
    ) {
      return null;
    }
    seen.add(key);
    events.push({
      eventId: eventId("source-ended", operationId, candidate.occurrence),
      kind: "source-ended",
      occurrence: candidate.occurrence,
      operationId,
    });
  }
  return { events: freezeDeep(events), status: "derived" };
}
