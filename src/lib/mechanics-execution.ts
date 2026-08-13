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
  MechanicsOperationAccessFootprint,
  MechanicsEvent,
  MechanicsEndWaveFinalizationResult,
  MechanicsPostEvent,
  MechanicsSourceEndingEventDerivationResult,
  OrderingObservation,
  OrderingRequestPartition,
  ResolutionGroup,
  ResolutionGroupAnalysis,
  ResolutionPrecedence,
  ResolutionGroupSimulationResult,
  ResolutionPartition,
} from "@/types/mechanics-execution";
import type { EndRule, NewMechanicOccurrence } from "@/types/mechanic-occurrence";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
  MechanicsOperationExecution,
  MechanicsOperationStage,
} from "@/types/mechanics-operation";
import type { EntityRef, InventoryGenerationRef } from "@/types/mechanics-reference";
import type { MechanicsCausalState, MechanicsWorld } from "@/types/mechanics-world";
import type { ResourceRef } from "@/types/resource";

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

function exactRecordSnapshot(
  value: unknown,
  keys: readonly string[]
): Record<string, unknown> | null {
  try {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    const own = Reflect.ownKeys(value);
    const expected = [...keys].sort();
    if (
      own.length !== expected.length ||
      !own.every((key) => typeof key === "string") ||
      [...own].sort().some((key, index) => key !== expected[index])
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function denseArraySnapshot(value: unknown, maximum = MAX_PROPOSALS): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return null;
    }
    const own = Reflect.ownKeys(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length: unknown =
      lengthDescriptor && "value" in lengthDescriptor
        ? (lengthDescriptor as { readonly value: unknown }).value
        : null;
    if (
      typeof length !== "number" ||
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > maximum ||
      own.length !== length + 1 ||
      !own.every((key) => typeof key === "string") ||
      !own.includes("length")
    ) {
      return null;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      if (!own.includes(key)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true || !("value" in descriptor)) return null;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(freezeDeep);
  Object.freeze(value);
  return value;
}

function conformResolutionGroupValue(value: unknown): Readonly<ResolutionGroup> | null {
  const record = exactRecordSnapshot(value, ["groupId", "proposals"]);
  if (!record || !id(record.groupId)) return null;
  const rawProposals = denseArraySnapshot(record.proposals);
  if (!rawProposals || rawProposals.length < 1) return null;

  const proposals: GroupProposal[] = [];
  const proposalIds = new Set<string>();
  const operationIds = new Set<string>();
  for (const proposalValue of rawProposals) {
    const proposal = exactRecordSnapshot(proposalValue, ["operation", "proposalId"]);
    if (!proposal || !id(proposal.proposalId) || proposalIds.has(proposal.proposalId)) {
      return null;
    }
    const operation = conformMechanicsOperation(proposal.operation);
    if (!operation || operationIds.has(operation.operationId)) return null;
    proposalIds.add(proposal.proposalId);
    operationIds.add(operation.operationId);
    proposals.push({ operation, proposalId: proposal.proposalId });
  }
  return freezeDeep({
    groupId: record.groupId,
    proposals,
  }) as Readonly<ResolutionGroup>;
}

/** Hostile-input wrapper: proxy traps are rejection, never engine control flow. */
export function conformResolutionGroup(value: unknown): Readonly<ResolutionGroup> | null {
  try {
    return conformResolutionGroupValue(value);
  } catch {
    return null;
  }
}

function collisionAddress(value: unknown): string {
  return `collision:${canonicalFingerprint(value)}`;
}

function occurrenceAddress(reference: unknown): string {
  return collisionAddress({ kind: "occurrence-generation", occurrence: reference });
}

function entityAddress(kind: string, reference: Readonly<EntityRef>): string {
  return collisionAddress({ entity: reference, kind });
}

function inventoryAddress(reference: Readonly<InventoryGenerationRef>): string {
  return collisionAddress({ item: reference, kind: "inventory-generation" });
}

const controllerGraph = collisionAddress({ kind: "controller-graph" });
const encounterMembership = collisionAddress({ kind: "encounter-membership" });
const enchantmentGraph = collisionAddress({ kind: "enchantment-graph" });

function entityReads(reference: Readonly<EntityRef>): readonly string[] {
  return [
    entityAddress("entity-availability", reference),
    entityAddress("entity-generation", reference),
  ];
}

function effectProjectionAddress(reference: Readonly<EntityRef>): string {
  return entityAddress("entity-effect-projection", reference);
}

function timelineBindingAddress(material: Readonly<EntityRef["material"]>): string {
  return collisionAddress({ kind: "timeline-binding", material });
}

function endRuleTimelineBinding(
  owner: Readonly<EntityRef["material"]>,
  rules: readonly Readonly<EndRule>[]
): readonly string[] {
  return rules.some(
    (rule) =>
      rule.kind === "time-reached" ||
      rule.kind === "rest-completed" ||
      rule.kind === "day-phase"
  )
    ? [timelineBindingAddress(owner)]
    : [];
}

function occurrenceProjectionReads(
  occurrence: Readonly<NewEffectOccurrence>
): readonly string[] {
  const projected =
    occurrence.kind === "condition" ||
    occurrence.kind === "concentration" ||
    occurrence.kind === "polymorph-form"
      ? [
          effectProjectionAddress(occurrence.target),
          entityAddress("entity-vitals", occurrence.target),
        ]
      : [];
  return occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty")
    ? [...projected, entityAddress("entity-vitals", occurrence.target)]
    : projected;
}

function occurrenceProjectionWrites(
  occurrence: Readonly<NewEffectOccurrence>
): readonly string[] {
  return occurrence.kind === "condition" ||
    occurrence.kind === "concentration" ||
    occurrence.kind === "polymorph-form" ||
    (occurrence.kind === "standing" && occurrence.fact.kind === "condition-immunity")
    ? [effectProjectionAddress(occurrence.target)]
    : [];
}

function endRuleEntities(
  rules: readonly Readonly<EndRule>[]
): readonly Readonly<EntityRef>[] {
  return rules.flatMap((rule) =>
    rule.kind === "rest-completed" || rule.kind === "turn-boundary"
      ? [rule.combatant]
      : []
  );
}

type NewEffectOccurrence = Exclude<NewMechanicOccurrence, { readonly kind: "program" }>;

function effectEntities(
  occurrence: Readonly<NewEffectOccurrence>
): readonly Readonly<EntityRef>[] {
  return [
    occurrence.target,
    ...(occurrence.kind === "standing" && occurrence.fact.kind === "target-mark"
      ? [occurrence.fact.marked]
      : []),
    ...endRuleEntities(occurrence.endRules),
  ];
}

function resourceItem(
  resource: Readonly<ResourceRef>
): Readonly<InventoryGenerationRef> | null {
  return resource.kind === "item-resource" || resource.kind === "item-quantity"
    ? {
        instanceId: resource.instanceId,
        instanceOrdinal: resource.instanceOrdinal,
        owner: resource.character,
      }
    : null;
}

function footprint(
  reads: readonly string[],
  semanticWrites: readonly string[],
  technicalWrites: readonly string[] = []
): Readonly<MechanicsOperationAccessFootprint> {
  return freezeDeep({
    reads: [...new Set(reads)].sort(compareCodeUnits),
    semanticWrites: [...new Set(semanticWrites)].sort(compareCodeUnits),
    technicalWrites: [...new Set(technicalWrites)].sort(compareCodeUnits),
  });
}

/** Exact logical read/write footprint for one terminal operation. */
export function mechanicsOperationAccessFootprint(
  operation: Readonly<MechanicsOperation>
): Readonly<MechanicsOperationAccessFootprint> {
  switch (operation.kind) {
    case "creature-damage":
    case "object-damage": {
      const target = operation.damage.computed.target;
      const vitals = entityAddress("entity-vitals", target);
      return footprint([...entityReads(target), vitals], [vitals]);
    }
    case "creature-healing":
    case "object-repair":
    case "temporary-hit-points-clear":
    case "creature-stabilize":
    case "creature-kill":
    case "creature-reduce-to-zero":
    case "creature-revive":
    case "creature-death-save":
    case "creature-maximum-sync":
    case "object-maximum-sync":
    case "exhaustion-transition": {
      const vitals = entityAddress("entity-vitals", operation.target);
      return footprint([...entityReads(operation.target), vitals], [vitals]);
    }
    case "temporary-hit-points-grant": {
      const vitals = entityAddress("entity-vitals", operation.target);
      return footprint(
        [
          ...entityReads(operation.target),
          vitals,
          ...(operation.grant.sourceOccurrence === null
            ? []
            : [occurrenceAddress(operation.grant.sourceOccurrence)]),
        ],
        [vitals]
      );
    }
    case "resource-transition":
    case "resource-initialize":
    case "resource-remove": {
      const resource = collisionAddress({
        kind: "resource",
        resource: operation.resource,
      });
      const owner =
        operation.resource.kind === "pool" && operation.resource.owner.entityId !== "self"
          ? [entityAddress("entity-generation", operation.resource.owner)]
          : [];
      const item = resourceItem(operation.resource);
      return footprint(
        [resource, ...owner, ...(item === null ? [] : [inventoryAddress(item)])],
        [resource]
      );
    }
    case "turn-economy-transition": {
      const economy = collisionAddress({
        combatant: operation.combatant,
        kind: "turn-economy",
      });
      return footprint(
        [...entityReads(operation.combatant), encounterMembership, economy],
        [economy]
      );
    }
    case "entity-create": {
      const temporaryHitPointSource =
        operation.value.kind === "creature"
          ? operation.value.vitals.hitPoints.temporary.sourceOccurrence
          : null;
      const linkedInventory =
        operation.value.kind === "object" &&
        operation.value.template.kind === "inventory-item"
          ? {
              instanceId: operation.value.template.instanceId,
              instanceOrdinal: operation.value.template.instanceOrdinal,
              owner: operation.value.template.owner,
            }
          : null;
      return footprint(
        [
          controllerGraph,
          occurrenceAddress(operation.parent),
          ...(temporaryHitPointSource === null
            ? []
            : [occurrenceAddress(temporaryHitPointSource)]),
          ...(linkedInventory === null ? [] : [inventoryAddress(linkedInventory)]),
          ...(operation.value.controller === null
            ? []
            : [entityAddress("entity-generation", operation.value.controller)]),
          ...endRuleEntities(operation.endRules).flatMap(entityReads),
          ...endRuleTimelineBinding(
            operation.lifecycle.occurrence.material,
            operation.endRules
          ),
        ],
        [
          controllerGraph,
          entityAddress("entity-availability", operation.entity),
          entityAddress("entity-controller", operation.entity),
          entityAddress("entity-generation", operation.entity),
          occurrenceAddress(operation.lifecycle),
        ],
        [
          collisionAddress({
            kind: "entity-allocation",
            material: operation.entity.material,
          }),
          collisionAddress({
            kind: "occurrence-allocation",
            material: operation.lifecycle.occurrence.material,
          }),
        ]
      );
    }
    case "entity-availability": {
      const exact = entityReads(operation.target);
      return footprint(
        [
          ...exact,
          encounterMembership,
          timelineBindingAddress(operation.target.material),
        ],
        [
          entityAddress("entity-availability", operation.target),
          encounterMembership,
          timelineBindingAddress(operation.target.material),
        ]
      );
    }
    case "entity-controller":
      return footprint(
        [
          controllerGraph,
          entityAddress("entity-controller", operation.target),
          entityAddress("entity-generation", operation.target),
          ...(operation.controller === null
            ? []
            : [entityAddress("entity-generation", operation.controller)]),
        ],
        [controllerGraph, entityAddress("entity-controller", operation.target)]
      );
    case "inventory-create": {
      const enchantment = operation.instance.enchantment;
      return footprint(
        [
          ...(enchantment === null ? [] : [enchantmentGraph]),
          occurrenceAddress(operation.parent),
          ...(enchantment === null ? [] : [inventoryAddress(enchantment)]),
          ...endRuleEntities(operation.endRules).flatMap(entityReads),
          ...endRuleTimelineBinding(operation.item.owner, operation.endRules),
        ],
        [
          ...(enchantment === null ? [] : [enchantmentGraph]),
          inventoryAddress(operation.item),
          occurrenceAddress(operation.lifecycle),
        ],
        [
          collisionAddress({
            kind: "inventory-allocation",
            material: operation.item.owner,
          }),
          collisionAddress({
            kind: "occurrence-allocation",
            material: operation.lifecycle.occurrence.material,
          }),
        ]
      );
    }
    case "inventory-transition":
    case "inventory-end": {
      const item = inventoryAddress(operation.item);
      const bearer =
        operation.enchantmentBearer === null
          ? null
          : inventoryAddress(operation.enchantmentBearer);
      const mutatesEnchantmentGraph =
        operation.kind === "inventory-end" ||
        (operation.change.kind === "quantity" && operation.change.value === 0);
      return footprint(
        [enchantmentGraph, item, ...(bearer === null ? [] : [bearer])],
        [
          ...(mutatesEnchantmentGraph ? [enchantmentGraph] : []),
          item,
          ...(mutatesEnchantmentGraph && bearer !== null ? [bearer] : []),
        ]
      );
    }
    case "program-state-transition": {
      const root = occurrenceAddress(operation.receipt.root);
      return operation.receipt.kind === "create"
        ? footprint(
            [],
            [root],
            [
              collisionAddress({
                kind: "occurrence-allocation",
                material: operation.receipt.root.occurrence.material,
              }),
            ]
          )
        : footprint([root], [root]);
    }
    case "occurrence-create":
      return footprint(
        [
          occurrenceAddress(operation.parent),
          ...effectEntities(operation.occurrence).flatMap(entityReads),
          ...endRuleTimelineBinding(
            operation.created.occurrence.material,
            operation.occurrence.endRules
          ),
          ...occurrenceProjectionReads(operation.occurrence),
        ],
        [
          occurrenceAddress(operation.created),
          ...occurrenceProjectionWrites(operation.occurrence),
        ],
        [
          collisionAddress({
            kind: "occurrence-allocation",
            material: operation.created.occurrence.material,
          }),
        ]
      );
    case "occurrence-end": {
      const occurrence = occurrenceAddress(operation.occurrence);
      return footprint([occurrence], [occurrence]);
    }
  }
}

function technicalOrdinal(operation: Readonly<MechanicsOperation>, key: string): number {
  if (operation.kind === "entity-create") {
    return key ===
      collisionAddress({ kind: "entity-allocation", material: operation.entity.material })
      ? operation.entity.ordinal
      : operation.lifecycle.ordinal;
  }
  if (operation.kind === "inventory-create") {
    return key ===
      collisionAddress({ kind: "inventory-allocation", material: operation.item.owner })
      ? operation.item.instanceOrdinal
      : operation.lifecycle.ordinal;
  }
  if (operation.kind === "occurrence-create") return operation.created.ordinal;
  if (
    operation.kind === "program-state-transition" &&
    operation.receipt.kind === "create"
  ) {
    return operation.receipt.root.ordinal;
  }
  throw new TypeError("Technical write has no allocator ordinal");
}

function topologicalProposalIds(
  proposalIds: readonly string[],
  precedence: readonly Readonly<ResolutionPrecedence>[]
): readonly string[] | null {
  const ids = new Set(proposalIds);
  const successors = new Map<string, Set<string>>(
    proposalIds.map((proposalId) => [proposalId, new Set()])
  );
  const indegree = new Map(proposalIds.map((proposalId) => [proposalId, 0]));
  for (const edge of precedence) {
    if (
      !ids.has(edge.beforeProposalId) ||
      !ids.has(edge.afterProposalId) ||
      edge.beforeProposalId === edge.afterProposalId
    ) {
      return null;
    }
    const outgoing = successors.get(edge.beforeProposalId);
    if (!outgoing || outgoing.has(edge.afterProposalId)) continue;
    outgoing.add(edge.afterProposalId);
    indegree.set(edge.afterProposalId, (indegree.get(edge.afterProposalId) ?? 0) + 1);
  }
  const ready = proposalIds
    .filter((proposalId) => indegree.get(proposalId) === 0)
    .sort(compareCodeUnits);
  const ordered: string[] = [];
  while (ready.length > 0) {
    const proposalId = ready.shift();
    if (proposalId === undefined) break;
    ordered.push(proposalId);
    for (const successor of successors.get(proposalId) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) {
        ready.push(successor);
        ready.sort(compareCodeUnits);
      }
    }
  }
  return ordered.length === proposalIds.length ? ordered : null;
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
  const footprints = group.proposals.map((proposal, index) => ({
    access: mechanicsOperationAccessFootprint(proposal.operation),
    index,
    proposal,
  }));
  if (
    footprints.some(
      ({ access }) =>
        access.semanticWrites.length === 0 && access.technicalWrites.length === 0
    )
  ) {
    return { kind: "rejected", reason: "unsupported-operation" };
  }
  const executionParent = footprints.map((_, index) => index);
  const semanticParent = footprints.map((_, index) => index);
  const find = (parent: number[], index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index] as number] as number;
      index = parent[index] as number;
    }
    return index;
  };
  const unite = (parent: number[], left: number, right: number): void => {
    const leftRoot = find(parent, left);
    const rightRoot = find(parent, right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  type AccessUse = {
    readonly access: "read" | "semantic-write" | "technical-write";
    readonly index: number;
    readonly proposalId: string;
  };
  const usesByKey = new Map<string, AccessUse[]>();
  footprints.forEach(({ access, proposal }, index) => {
    const add = (key: string, kind: AccessUse["access"]): void => {
      const uses = usesByKey.get(key) ?? [];
      uses.push({ access: kind, index, proposalId: proposal.proposalId });
      usesByKey.set(key, uses);
    };
    for (const key of access.reads) add(key, "read");
    for (const key of access.semanticWrites) add(key, "semantic-write");
    for (const key of access.technicalWrites) add(key, "technical-write");
  });
  const conflictingKeys = [...usesByKey.entries()].filter(([, uses]) => {
    const proposalIds = new Set(uses.map(({ proposalId }) => proposalId));
    return proposalIds.size > 1 && uses.some(({ access }) => access !== "read");
  });
  const semanticConflicts = conflictingKeys.filter(([, uses]) => {
    const byProposal = new Map<string, Set<AccessUse["access"]>>();
    for (const use of uses) {
      const accesses = byProposal.get(use.proposalId) ?? new Set();
      accesses.add(use.access);
      byProposal.set(use.proposalId, accesses);
    }
    return ![...byProposal.values()].every(
      (accesses) => accesses.size === 1 && accesses.has("technical-write")
    );
  });
  for (const [, uses] of conflictingKeys) {
    const indices = [...new Set(uses.map(({ index }) => index))];
    const first = indices[0];
    if (first === undefined) continue;
    for (const index of indices.slice(1)) {
      unite(executionParent, first, index);
    }
  }
  for (const [, uses] of semanticConflicts) {
    const indices = [...new Set(uses.map(({ index }) => index))];
    const first = indices[0];
    if (first === undefined) continue;
    for (const index of indices.slice(1)) {
      unite(semanticParent, first, index);
    }
  }
  const components = new Map<number, typeof footprints>();
  footprints.forEach((entry, index) => {
    const root = find(executionParent, index);
    const component = components.get(root) ?? [];
    component.push(entry);
    components.set(root, component);
  });
  const partitions: ResolutionPartition[] = [];
  for (const component of components.values()) {
    const componentIds = new Set(component.map(({ proposal }) => proposal.proposalId));
    const collisionKeys = conflictingKeys
      .filter(([, uses]) => uses.some(({ proposalId }) => componentIds.has(proposalId)))
      .map(([key]) => key)
      .sort(compareCodeUnits);

    const technicalPrecedenceByKey = new Map<string, ResolutionPrecedence>();
    for (const [key, uses] of conflictingKeys) {
      const technicalWriters = [
        ...new Map(
          uses
            .filter(
              ({ access, proposalId }) =>
                access === "technical-write" && componentIds.has(proposalId)
            )
            .map(({ index, proposalId }) => {
              const operation = group.proposals[index]?.operation;
              return operation
                ? ([proposalId, { operation, proposalId }] as const)
                : null;
            })
            .filter((entry) => entry !== null)
        ).values(),
      ].sort((left, right) => {
        const byOrdinal =
          technicalOrdinal(left.operation, key) - technicalOrdinal(right.operation, key);
        return byOrdinal || compareCodeUnits(left.proposalId, right.proposalId);
      });
      for (let index = 1; index < technicalWriters.length; index += 1) {
        const before = technicalWriters[index - 1];
        const after = technicalWriters[index];
        if (!before || !after) continue;
        const beforeProposalId = before.proposalId;
        const afterProposalId = after.proposalId;
        technicalPrecedenceByKey.set(`${beforeProposalId}\u0000${afterProposalId}`, {
          afterProposalId,
          beforeProposalId,
        });
      }
    }
    const technicalPrecedence = [...technicalPrecedenceByKey.values()].sort(
      (left, right) =>
        compareCodeUnits(left.beforeProposalId, right.beforeProposalId) ||
        compareCodeUnits(left.afterProposalId, right.afterProposalId)
    );
    const proposalIds = topologicalProposalIds(
      component.map(({ proposal }) => proposal.proposalId),
      technicalPrecedence
    );
    if (!proposalIds) return { kind: "rejected", reason: "invalid-group" };

    const semanticGroups = new Map<number, Set<string>>();
    for (const { index, proposal } of component) {
      const participates = semanticConflicts.some(([, uses]) =>
        uses.some((use) => use.index === index)
      );
      if (!participates) continue;
      const root = find(semanticParent, index);
      const ids = semanticGroups.get(root) ?? new Set<string>();
      ids.add(proposal.proposalId);
      semanticGroups.set(root, ids);
    }
    const orderingPartitions = [...semanticGroups.entries()]
      .map(([root, ids]): OrderingRequestPartition => {
        const collisionKey = semanticConflicts
          .filter(([, uses]) =>
            uses.some(({ index }) => find(semanticParent, index) === root)
          )
          .map(([key]) => key)
          .sort(compareCodeUnits)[0];
        if (collisionKey === undefined) {
          throw new TypeError("Semantic component has no collision key");
        }
        return {
          collisionKey,
          proposalIds: [...ids].sort(compareCodeUnits),
        };
      })
      .sort((left, right) => compareCodeUnits(left.collisionKey, right.collisionKey));
    partitions.push({
      collisionKeys,
      orderingPartitions,
      proposalIds,
      technicalPrecedence,
    });
  }
  partitions.sort((left, right) => {
    const byCollision = compareCodeUnits(
      left.collisionKeys[0] ?? "",
      right.collisionKeys[0] ?? ""
    );
    return (
      byCollision ||
      compareCodeUnits(left.proposalIds[0] ?? "", right.proposalIds[0] ?? "")
    );
  });
  const collisionKeys = conflictingKeys.map(([key]) => key).sort(compareCodeUnits);
  if (partitions.every(({ orderingPartitions }) => orderingPartitions.length === 0)) {
    return { collisionKeys, kind: "disjoint", partitions };
  }
  return {
    collisionKeys,
    kind: "needs-ordering",
    partitions,
    requestId: requestId(
      group.groupId,
      partitions.filter(({ orderingPartitions }) => orderingPartitions.length > 0)
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
function conformOrderingObservationValue(
  value: unknown,
  request: {
    readonly requestId: string;
    readonly partitions: readonly OrderingRequestPartition[];
  }
): Readonly<OrderingObservation> | null {
  const record = exactRecordSnapshot(value, ["kind", "partitions", "requestId"]);
  if (!record || record.kind !== "ordering" || record.requestId !== request.requestId) {
    return null;
  }
  const rawPartitions = denseArraySnapshot(record.partitions, request.partitions.length);
  if (!rawPartitions || rawPartitions.length !== request.partitions.length) return null;
  const expectedByKey = new Map(
    request.partitions.map((partition) => [partition.collisionKey, partition])
  );
  const partitions: Array<{ collisionKey: string; proposalIds: string[] }> = [];
  for (const raw of rawPartitions) {
    const partition = exactRecordSnapshot(raw, ["collisionKey", "proposalIds"]);
    if (!partition || typeof partition.collisionKey !== "string") return null;
    const proposalIds = denseArraySnapshot(
      partition.proposalIds,
      request.partitions.length > 0 ? MAX_PROPOSALS : 0
    );
    if (!proposalIds || proposalIds.some((entry) => !id(entry))) {
      return null;
    }
    const conformedIds = proposalIds as string[];
    const expected = expectedByKey.get(partition.collisionKey);
    if (
      !expected ||
      conformedIds.length !== expected.proposalIds.length ||
      new Set(conformedIds).size !== conformedIds.length ||
      [...conformedIds]
        .sort(compareCodeUnits)
        .some(
          (entry, index) =>
            entry !== [...expected.proposalIds].sort(compareCodeUnits)[index]
        )
    ) {
      return null;
    }
    expectedByKey.delete(partition.collisionKey);
    partitions.push({
      collisionKey: partition.collisionKey,
      proposalIds: [...conformedIds],
    });
  }
  if (expectedByKey.size !== 0) return null;
  return freezeDeep({
    kind: "ordering",
    partitions,
    requestId: record.requestId,
  });
}

/** Hostile-input wrapper: proxy traps are rejection, never engine control flow. */
export function conformOrderingObservation(
  value: unknown,
  request: {
    readonly requestId: string;
    readonly partitions: readonly OrderingRequestPartition[];
  }
): Readonly<OrderingObservation> | null {
  try {
    return conformOrderingObservationValue(value, request);
  } catch {
    return null;
  }
}

function orderingRequestPartitions(
  analysis: Extract<ResolutionGroupAnalysis, { readonly kind: "needs-ordering" }>
): readonly OrderingRequestPartition[] {
  return analysis.partitions
    .flatMap(({ orderingPartitions }) => orderingPartitions)
    .sort((left, right) => compareCodeUnits(left.collisionKey, right.collisionKey));
}

/** Merge table-owned semantic order with immutable allocator precedence. */
export function orderResolutionPartitions(
  analysis: Exclude<ResolutionGroupAnalysis, { readonly kind: "rejected" }>,
  observation?: Readonly<OrderingObservation>
): readonly ResolutionPartition[] | null {
  if (analysis.kind !== "needs-ordering") return analysis.partitions;
  const requestPartitions = orderingRequestPartitions(analysis);
  const ordered = conformOrderingObservation(observation, {
    partitions: requestPartitions,
    requestId: analysis.requestId,
  });
  if (!ordered) return null;
  const orderedByKey = new Map(
    ordered.partitions.map((partition) => [partition.collisionKey, partition.proposalIds])
  );
  const resolved: ResolutionPartition[] = [];
  for (const partition of analysis.partitions) {
    const precedence: ResolutionPrecedence[] = [...partition.technicalPrecedence];
    for (const request of partition.orderingPartitions) {
      const semanticOrder = orderedByKey.get(request.collisionKey);
      if (!semanticOrder) return null;
      for (let index = 1; index < semanticOrder.length; index += 1) {
        const beforeProposalId = semanticOrder[index - 1];
        const afterProposalId = semanticOrder[index];
        if (!beforeProposalId || !afterProposalId) return null;
        precedence.push({
          afterProposalId,
          beforeProposalId,
        });
      }
    }
    const proposalIds = topologicalProposalIds(partition.proposalIds, precedence);
    if (!proposalIds) return null;
    resolved.push({ ...partition, proposalIds });
  }
  return resolved;
}

function conformResolutionGroupContextValue(
  value: unknown,
  operations: readonly Readonly<MechanicsOperation>[]
): Readonly<ResolutionGroupContext> | null {
  const record = exactRecordSnapshot(value, [
    "actionId",
    "actor",
    "authoritySnapshot",
    "causes",
    "factGuards",
    "ordering",
    "state",
  ]);
  if (!record) return null;
  const authoritySnapshot = conformMechanicsAuthoritySnapshot(record.authoritySnapshot);
  if (!authoritySnapshot || typeof record.state !== "object" || record.state === null) {
    return null;
  }
  const candidateState = record.state as Readonly<MechanicsCausalState>;
  const causalState = rebaseMechanicsCausalState(candidateState.world, candidateState);
  if (!causalState.ok) return null;
  const transaction = conformMechanicsTransaction({
    actionId: record.actionId,
    actor: record.actor,
    causes: record.causes,
    factGuards: record.factGuards,
    operations,
  });
  if (!transaction) return null;
  return freezeDeep({
    actionId: transaction.actionId,
    actor: transaction.actor,
    authoritySnapshot,
    causes: transaction.causes,
    factGuards: transaction.factGuards,
    state: causalState.value,
  });
}

function conformResolutionGroupContext(
  value: unknown,
  operations: readonly Readonly<MechanicsOperation>[]
): Readonly<ResolutionGroupContext> | null {
  try {
    return conformResolutionGroupContextValue(value, operations);
  } catch {
    return null;
  }
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
  const group = conformResolutionGroup(groupValue);
  if (!group) {
    return { operationId: null, reason: "invalid-group", status: "rejected" };
  }
  const analysis = analyzeConformedResolutionGroup(group);
  if (analysis.kind === "rejected") {
    return { operationId: null, reason: analysis.reason, status: "rejected" };
  }
  const contextSnapshot = exactRecordSnapshot(contextValue, [
    "actionId",
    "actor",
    "authoritySnapshot",
    "causes",
    "factGuards",
    "ordering",
    "state",
  ]);
  if (!contextSnapshot) {
    return { operationId: null, reason: "invalid-context", status: "rejected" };
  }
  const rawOrdering = contextSnapshot.ordering;
  if (analysis.kind !== "needs-ordering" && rawOrdering !== null) {
    return { operationId: null, reason: "unexpected-ordering", status: "rejected" };
  }
  if (analysis.kind === "needs-ordering" && rawOrdering === null) {
    const partitions = orderingRequestPartitions(analysis);
    return {
      analysis,
      request: {
        kind: "ordering",
        partitions,
        requestId: analysis.requestId,
      },
      status: "needs-ordering",
    };
  }
  const ordering =
    analysis.kind === "needs-ordering"
      ? conformOrderingObservation(rawOrdering, {
          partitions: orderingRequestPartitions(analysis),
          requestId: analysis.requestId,
        })
      : null;
  if (analysis.kind === "needs-ordering" && ordering === null) {
    return { operationId: null, reason: "invalid-ordering", status: "rejected" };
  }
  const context = conformResolutionGroupContext(
    contextSnapshot,
    group.proposals.map(({ operation }) => operation)
  );
  if (!context) {
    return { operationId: null, reason: "invalid-context", status: "rejected" };
  }

  const partitions = orderResolutionPartitions(analysis, ordering ?? undefined);
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
  if (result.status === "needs-boundary") {
    return {
      analysis,
      boundary: result.boundary,
      operationId: result.operationId,
      orderedProposalIds: freezeDeep([...orderedProposalIds]),
      status: "needs-boundary",
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
  if (
    execution.kind === "turn-economy-transition" ||
    execution.kind === "entity-create" ||
    execution.kind === "entity-availability" ||
    execution.kind === "entity-controller" ||
    execution.kind === "inventory-create" ||
    execution.kind === "inventory-transition" ||
    execution.kind === "inventory-end" ||
    execution.kind === "program-state-transition" ||
    execution.kind === "occurrence-create"
  ) {
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
