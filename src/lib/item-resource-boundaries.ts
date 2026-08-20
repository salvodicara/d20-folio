/** Pure, exact-boundary orchestration for resources owned by physical items. */

import type { ResourceRecoveryTrigger, SrdMagicItemData } from "@/data/types";
import type {
  CustomEquipment,
  ItemResourceState,
  SrdEquipmentRef,
} from "@/types/character";
import {
  parseItemResources,
  resolveItemResources,
  type ItemResourceOmission,
} from "@/lib/item-resources";
import {
  prepareItemResourceCommand,
  prepareItemResourceRevert,
  type ItemResourceCommandRejection,
  type ItemResourceCommandRecipe,
  type PreparedItemResourceCommand,
} from "@/lib/item-resource-commands";
import {
  applyResourceOperation,
  isCanonicalItemResourceIdentity,
  makeItemResourceIdentity,
  sameItemResourceIdentity,
  type ItemResourceIdentity,
  type ItemResourceOperation,
  type ResourceInputRequest,
  type ResourceItemBinding,
  type ResourceItemSpec,
  type ResourceRevertReceipt,
} from "@/lib/resources";

type BoundaryKind = "short-rest" | "long-rest" | "dawn" | "dusk";

/** Rest and day-cycle boundaries stay distinct; there is deliberately no alias. */
export type ItemResourceRecoveryBoundary = Extract<
  ResourceRecoveryTrigger,
  { kind: BoundaryKind }
>;

type RecoveryInputRequest = Exclude<ResourceInputRequest, { kind: "depletion-d20" }>;
type RecoveryRecipe = Extract<ItemResourceCommandRecipe, { kind: "recover" }>;

/** One table-entered fact, addressed to one exact physical resource. */
export interface ItemResourceBoundaryFact {
  identity: ItemResourceIdentity;
  kind: RecoveryInputRequest["kind"];
  value: number;
}

/** A pending input request that cannot collide with another copy or resource. */
export type ItemResourceBoundaryInputRequest = RecoveryInputRequest & {
  identity: ItemResourceIdentity;
};

/** Each entry keeps its recipe, whole-item CAS, and receipt together. */
export interface PreparedItemResourceBoundary {
  kind: "item-resource-boundary";
  trigger: ItemResourceRecoveryBoundary;
  occurrenceId: string;
  entries: ReadonlyArray<PreparedItemResourceCommand>;
}

export interface PreparedItemResourceBoundaryRevertEntry {
  item: ResourceItemSpec;
  binding: Required<ResourceItemBinding>;
  original: PreparedItemResourceCommand;
  operation: ItemResourceOperation;
  receipt: ResourceRevertReceipt;
}

export interface PreparedItemResourceBoundaryRevert {
  kind: "item-resource-boundary-revert";
  occurrenceId: string;
  original: PreparedItemResourceBoundary;
  entries: ReadonlyArray<PreparedItemResourceBoundaryRevertEntry>;
}

/** The structural subset the store needs for one simulated atomic batch. */
export interface ItemResourceOperationEntry {
  item: ResourceItemSpec;
  binding: ResourceItemBinding;
  operation: ItemResourceOperation;
}

export type ItemResourceBoundaryRejection =
  | ItemResourceCommandRejection
  | "invalid-boundary"
  | "invalid-catalogue"
  | "invalid-inventory"
  | "invalid-facts"
  | "invalid-occurrence"
  | "missing-state";

export type ItemResourceBoundaryPreparation =
  | { status: "prepared"; prepared: PreparedItemResourceBoundary }
  | { status: "pending-input"; requests: ItemResourceBoundaryInputRequest[] }
  | {
      status: "rejected";
      reason: ItemResourceBoundaryRejection;
      omissions?: ItemResourceOmission[];
    };

export type ItemResourceBoundaryRevertPreparation =
  | { status: "prepared"; prepared: PreparedItemResourceBoundaryRevert }
  | { status: "rejected"; reason: ItemResourceBoundaryRejection };

export type ItemResourceBoundaryReplayPreparation =
  | { status: "prepared"; prepared: PreparedItemResourceBoundary }
  | { status: "pending-input"; requests: ItemResourceBoundaryInputRequest[] }
  | { status: "rejected"; reason: ItemResourceBoundaryRejection };

export type ItemResourceOperationBatchResult =
  | {
      status: "applied" | "already-applied";
      itemResources: Record<string, ItemResourceState>;
    }
  | { status: "conflict" | "rejected" };

interface RecoveryCandidate {
  identity: ItemResourceIdentity;
  item: ResourceItemSpec;
  binding: Required<ResourceItemBinding>;
  state?: ItemResourceState;
}

function exactBoundary(value: unknown): value is ItemResourceRecoveryBoundary {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const trigger = value as Record<string, unknown>;
  return (
    Object.keys(trigger).length === 1 &&
    ["short-rest", "long-rest", "dawn", "dusk"].includes(String(trigger.kind))
  );
}

function validOccurrenceBase(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 240 ||
    value.trim() !== value
  ) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

function occurrenceAt(base: string, index: number): string {
  return `${base}:${index + 1}`;
}

function factKey(
  identity: ItemResourceIdentity,
  kind: RecoveryInputRequest["kind"]
): string {
  return `${identity.itemId}:${identity.key}:${kind}`;
}

function matchesBoundary(
  trigger: ResourceRecoveryTrigger,
  boundary: ItemResourceRecoveryBoundary
): boolean {
  return trigger.kind === boundary.kind;
}

function recipeInputs(
  identity: ItemResourceIdentity,
  facts: ReadonlyMap<string, number>
): RecoveryRecipe["inputs"] {
  const capacityRoll = facts.get(factKey(identity, "capacity-roll"));
  const initialRoll = facts.get(factKey(identity, "initial-roll"));
  const recoveryRoll = facts.get(factKey(identity, "recovery-roll"));
  return {
    ...(capacityRoll !== undefined ? { capacityRoll } : {}),
    ...(initialRoll !== undefined ? { initialRoll } : {}),
    ...(recoveryRoll !== undefined ? { recoveryRoll } : {}),
  };
}

/**
 * Prepare every exact-trigger recovery in canonical equipment/spec order.
 * Planning is sequential per physical item, but nothing is mutated until the
 * returned operations pass the store's whole-batch CAS.
 */
export function prepareItemResourceBoundary(args: {
  trigger: ItemResourceRecoveryBoundary;
  occurrenceId: string;
  equipment: readonly (SrdEquipmentRef | CustomEquipment)[];
  catalogue: readonly Pick<SrdMagicItemData, "id" | "resources">[];
  itemResources?: unknown;
  facts?: readonly ItemResourceBoundaryFact[];
}): ItemResourceBoundaryPreparation {
  if (!exactBoundary(args.trigger)) {
    return { status: "rejected", reason: "invalid-boundary" };
  }
  if (!validOccurrenceBase(args.occurrenceId)) {
    return { status: "rejected", reason: "invalid-occurrence" };
  }

  const catalogueIds = new Set<string>();
  for (const item of args.catalogue) {
    if (catalogueIds.has(item.id)) {
      return { status: "rejected", reason: "invalid-catalogue" };
    }
    catalogueIds.add(item.id);
  }
  const definitions = new Map(
    args.catalogue.map((item) => [
      item.id,
      { itemId: item.id, resources: item.resources ?? [] } satisfies ResourceItemSpec,
    ])
  );
  const resolved = resolveItemResources({
    equipment: args.equipment,
    catalogue: args.catalogue,
    itemResources: args.itemResources,
  });
  if (resolved.omissions.length > 0) {
    return {
      status: "rejected",
      reason: "invalid-inventory",
      omissions: resolved.omissions,
    };
  }

  const candidates: RecoveryCandidate[] = [];
  for (const resource of resolved.resources) {
    if (
      !resource.spec.recoveries?.some(({ trigger }) =>
        matchesBoundary(trigger, args.trigger)
      ) ||
      (resource.state === undefined && resource.spec.initial.kind === "full") ||
      (resource.itemState?.disposition !== undefined &&
        resource.itemState.disposition !== "magical") ||
      resource.state?.disabled ||
      (resource.current !== undefined &&
        resource.capacity !== undefined &&
        resource.current >= resource.capacity)
    ) {
      continue;
    }
    const item = definitions.get(resource.itemId);
    if (!item) return { status: "rejected", reason: "invalid-catalogue" };
    candidates.push({
      identity: makeItemResourceIdentity(
        resource.itemId,
        resource.instanceId,
        resource.resourceId
      ),
      item,
      binding: { srdId: resource.itemId, instanceId: resource.instanceId },
      ...(resource.itemState ? { state: resource.itemState } : {}),
    });
  }

  const candidatesByKey = new Map(
    candidates.map((candidate) => [candidate.identity.key, candidate] as const)
  );
  if (candidatesByKey.size !== candidates.length) {
    return { status: "rejected", reason: "invalid-catalogue" };
  }
  const facts = new Map<string, number>();
  for (const fact of args.facts ?? []) {
    const candidate = candidatesByKey.get(fact.identity.key);
    if (
      !isCanonicalItemResourceIdentity(fact.identity) ||
      !candidate ||
      !sameItemResourceIdentity(candidate.identity, fact.identity) ||
      !["capacity-roll", "initial-roll", "recovery-roll"].includes(fact.kind) ||
      !Number.isSafeInteger(fact.value) ||
      fact.value < 0
    ) {
      return { status: "rejected", reason: "invalid-facts" };
    }
    const key = factKey(fact.identity, fact.kind);
    if (facts.has(key)) return { status: "rejected", reason: "invalid-facts" };
    facts.set(key, fact.value);
  }

  const working = new Map<string, ItemResourceState | undefined>();
  const blocked = new Set<string>();
  const entries: PreparedItemResourceCommand[] = [];
  const pending: ItemResourceBoundaryInputRequest[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate || blocked.has(candidate.identity.instanceId)) continue;
    if (!working.has(candidate.identity.instanceId)) {
      working.set(candidate.identity.instanceId, candidate.state);
    }
    const recipe: RecoveryRecipe = {
      kind: "recover",
      identity: candidate.identity,
      trigger: structuredClone(args.trigger),
      inputs: recipeInputs(candidate.identity, facts),
    };
    const result = prepareItemResourceCommand({
      item: candidate.item,
      state: working.get(candidate.identity.instanceId),
      recipe,
      occurrenceId: occurrenceAt(args.occurrenceId, index),
    });
    if (result.status === "rejected") return result;
    if (result.status === "already-applied") continue;
    if (result.status === "pending-input") {
      if (result.requests.some(({ kind }) => kind === "depletion-d20")) {
        return { status: "rejected", reason: "invalid-command" };
      }
      pending.push(
        ...result.requests.map((request) => ({
          ...(structuredClone(request) as RecoveryInputRequest),
          identity: structuredClone(candidate.identity),
        }))
      );
      blocked.add(candidate.identity.instanceId);
      continue;
    }
    if (result.prepared.receipt.before === result.prepared.receipt.after) continue;
    const staged = applyResourceOperation(
      result.prepared.item,
      result.prepared.binding,
      working.get(candidate.identity.instanceId),
      result.prepared.operation
    );
    if (staged.status !== "applied") {
      return {
        status: "rejected",
        reason: staged.status === "conflict" ? "revision-conflict" : "invalid-state",
      };
    }
    working.set(candidate.identity.instanceId, staged.state);
    entries.push(result.prepared);
  }
  if (pending.length > 0) return { status: "pending-input", requests: pending };
  return {
    status: "prepared",
    prepared: {
      kind: "item-resource-boundary",
      trigger: structuredClone(args.trigger),
      occurrenceId: args.occurrenceId,
      entries,
    },
  };
}

function validReplayEntry(
  entry: PreparedItemResourceCommand,
  trigger: ItemResourceRecoveryBoundary
): boolean {
  const recipe = entry.recipe;
  if (
    recipe.kind !== "recover" ||
    !exactBoundary(recipe.trigger) ||
    !matchesBoundary(recipe.trigger, trigger) ||
    !isCanonicalItemResourceIdentity(recipe.identity) ||
    entry.item.itemId !== recipe.identity.itemId ||
    entry.binding.srdId !== recipe.identity.itemId ||
    entry.binding.instanceId !== recipe.identity.instanceId ||
    entry.operation.itemId !== recipe.identity.itemId ||
    entry.operation.instanceId !== recipe.identity.instanceId ||
    entry.receipt.itemId !== recipe.identity.itemId ||
    entry.receipt.instanceId !== recipe.identity.instanceId ||
    entry.receipt.resourceId !== recipe.identity.resourceId ||
    entry.receipt.resourceKey !== recipe.identity.key ||
    entry.receipt.command !== "recover"
  ) {
    return false;
  }
  const validated = applyResourceOperation(
    entry.item,
    entry.binding,
    entry.operation.before ?? undefined,
    entry.operation
  );
  if (validated.status !== "applied") return false;
  const transition = entry.operation.after.lastTransition;
  return (
    transition?.status === "applied" &&
    transition.intent.kind === "recover" &&
    transition.intent.occurrenceId === entry.receipt.occurrenceId &&
    transition.intent.resourceId === recipe.identity.resourceId &&
    matchesBoundary(transition.intent.trigger, trigger) &&
    transition.intent.inputs.capacityRoll === recipe.inputs.capacityRoll &&
    transition.intent.inputs.initialRoll === recipe.inputs.initialRoll &&
    transition.intent.inputs.recoveryRoll === recipe.inputs.recoveryRoll
  );
}

/**
 * Replan only a prior boundary's committed entries after an exact revert.
 * Entered facts remain on each stored recipe; a missing fact returns pending
 * input to the caller as a closed failure and never discovers new candidates.
 */
export function prepareItemResourceBoundaryReplay(args: {
  original: PreparedItemResourceBoundary;
  occurrenceId: string;
  itemResources?: unknown;
}): ItemResourceBoundaryReplayPreparation {
  if (!exactBoundary(args.original.trigger)) {
    return { status: "rejected", reason: "invalid-boundary" };
  }
  if (!validOccurrenceBase(args.occurrenceId)) {
    return { status: "rejected", reason: "invalid-occurrence" };
  }
  const parsed = parseItemResources(args.itemResources);
  if (!parsed.ok) return { status: "rejected", reason: "invalid-state" };

  const originalOccurrences = new Set<string>();
  const originalIdentities = new Set<string>();
  for (const entry of args.original.entries) {
    if (!validReplayEntry(entry, args.original.trigger)) {
      return { status: "rejected", reason: "invalid-command" };
    }
    const identityKey = `${entry.recipe.identity.itemId}:${entry.recipe.identity.key}`;
    if (
      originalOccurrences.has(entry.receipt.occurrenceId) ||
      originalIdentities.has(identityKey)
    ) {
      return { status: "rejected", reason: "invalid-command" };
    }
    originalOccurrences.add(entry.receipt.occurrenceId);
    originalIdentities.add(identityKey);
  }

  const working = new Map(Object.entries(parsed.value));
  const entries: PreparedItemResourceCommand[] = [];
  for (let index = 0; index < args.original.entries.length; index += 1) {
    const original = args.original.entries[index];
    if (!original || original.recipe.kind !== "recover") {
      return { status: "rejected", reason: "invalid-command" };
    }
    const state = working.get(original.binding.instanceId);
    if (!state) return { status: "rejected", reason: "missing-state" };
    const occurrenceId = occurrenceAt(args.occurrenceId, index);
    if (originalOccurrences.has(occurrenceId)) {
      return { status: "rejected", reason: "invalid-occurrence" };
    }
    const result = prepareItemResourceCommand({
      item: original.item,
      state,
      recipe: structuredClone(original.recipe),
      occurrenceId,
    });
    if (result.status === "rejected") return result;
    if (result.status === "already-applied") continue;
    if (result.status === "pending-input") {
      if (result.requests.some(({ kind }) => kind === "depletion-d20")) {
        return { status: "rejected", reason: "invalid-command" };
      }
      return {
        status: "pending-input",
        requests: result.requests.map((request) => ({
          ...(structuredClone(request) as RecoveryInputRequest),
          identity: structuredClone(original.recipe.identity),
        })),
      };
    }
    if (result.prepared.receipt.before === result.prepared.receipt.after) continue;
    const staged = applyResourceOperation(
      result.prepared.item,
      result.prepared.binding,
      state,
      result.prepared.operation
    );
    if (staged.status !== "applied") {
      return {
        status: "rejected",
        reason: staged.status === "conflict" ? "revision-conflict" : "invalid-state",
      };
    }
    working.set(original.binding.instanceId, staged.state);
    entries.push(result.prepared);
  }
  return {
    status: "prepared",
    prepared: {
      kind: "item-resource-boundary",
      trigger: structuredClone(args.original.trigger),
      occurrenceId: args.occurrenceId,
      entries,
    },
  };
}

/** Plan one semantic LIFO inverse per original operation, in reverse order. */
export function prepareItemResourceBoundaryRevert(args: {
  original: PreparedItemResourceBoundary;
  occurrenceId: string;
  itemResources?: unknown;
}): ItemResourceBoundaryRevertPreparation {
  if (!validOccurrenceBase(args.occurrenceId)) {
    return { status: "rejected", reason: "invalid-occurrence" };
  }
  const parsed = parseItemResources(args.itemResources);
  if (!parsed.ok) return { status: "rejected", reason: "invalid-state" };
  const working = new Map(Object.entries(parsed.value));
  const entries: PreparedItemResourceBoundaryRevertEntry[] = [];
  const originals = [...args.original.entries].reverse();
  const originalOccurrences = new Set(
    args.original.entries.map(({ receipt }) => receipt.occurrenceId)
  );
  if (originalOccurrences.size !== args.original.entries.length) {
    return { status: "rejected", reason: "invalid-command" };
  }
  for (let index = 0; index < originals.length; index += 1) {
    const original = originals[index];
    if (!original) continue;
    const state = working.get(original.binding.instanceId);
    if (!state) return { status: "rejected", reason: "missing-state" };
    const occurrenceId = occurrenceAt(args.occurrenceId, index);
    if (originalOccurrences.has(occurrenceId)) {
      return { status: "rejected", reason: "invalid-occurrence" };
    }
    const result = prepareItemResourceRevert({
      prepared: original,
      state,
      occurrenceId,
    });
    if (result.status === "rejected") return result;
    if (result.status === "already-applied") continue;
    const staged = applyResourceOperation(
      original.item,
      original.binding,
      state,
      result.operation
    );
    if (staged.status !== "applied") {
      return {
        status: "rejected",
        reason: staged.status === "conflict" ? "revision-conflict" : "invalid-state",
      };
    }
    working.set(original.binding.instanceId, staged.state);
    entries.push({
      item: original.item,
      binding: original.binding,
      original,
      operation: result.operation,
      receipt: result.receipt,
    });
  }
  return {
    status: "prepared",
    prepared: {
      kind: "item-resource-boundary-revert",
      occurrenceId: args.occurrenceId,
      original: args.original,
      entries,
    },
  };
}

function operationChainsAreValid(
  entries: readonly ItemResourceOperationEntry[]
): boolean {
  const working = new Map<string, ItemResourceState | undefined>();
  for (const entry of entries) {
    const instanceId = entry.binding.instanceId;
    if (typeof instanceId !== "string") return false;
    if (!working.has(instanceId)) {
      working.set(instanceId, entry.operation.before ?? undefined);
    }
    const result = applyResourceOperation(
      entry.item,
      entry.binding,
      working.get(instanceId),
      entry.operation
    );
    if (result.status !== "applied") return false;
    working.set(instanceId, result.state);
  }
  return true;
}

/** Simulate a whole batch without mutation; one conflict rejects every entry. */
export function simulateItemResourceOperations(
  itemResources: unknown,
  entries: readonly ItemResourceOperationEntry[]
): ItemResourceOperationBatchResult {
  const parsed = parseItemResources(itemResources);
  if (!parsed.ok || !operationChainsAreValid(entries)) return { status: "rejected" };
  const working = structuredClone(parsed.value);
  const grouped = new Map<string, ItemResourceOperationEntry[]>();
  for (const entry of entries) {
    const instanceId = entry.binding.instanceId;
    if (typeof instanceId !== "string") return { status: "rejected" };
    const group = grouped.get(instanceId) ?? [];
    group.push(entry);
    grouped.set(instanceId, group);
  }

  let changed = false;
  for (const [instanceId, group] of grouped) {
    let state = working[instanceId];
    let start = 0;
    for (let index = group.length - 1; index >= 0; index -= 1) {
      const entry = group[index];
      if (!entry) continue;
      const probe = applyResourceOperation(
        entry.item,
        entry.binding,
        state,
        entry.operation
      );
      if (probe.status === "rejected") return { status: "rejected" };
      if (probe.status === "already-applied") {
        start = index + 1;
        break;
      }
    }
    for (let index = start; index < group.length; index += 1) {
      const entry = group[index];
      if (!entry) continue;
      const result = applyResourceOperation(
        entry.item,
        entry.binding,
        state,
        entry.operation
      );
      if (result.status === "conflict") return { status: "conflict" };
      if (result.status === "rejected") return { status: "rejected" };
      if (result.status === "applied") changed = true;
      state = result.state;
    }
    if (state) working[instanceId] = state;
  }
  return {
    status: changed ? "applied" : "already-applied",
    itemResources: working,
  };
}
