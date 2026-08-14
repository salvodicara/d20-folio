/**
 * Pure identity and persistence adapters for resources owned by physical items.
 * Catalogue data defines mechanics; equipment refs only bind a physical copy to
 * that data. Nothing in this module reads or parses display prose.
 */

import type { ResourceSpec } from "@/data/types";
import type {
  CharacterDoc,
  CustomEquipment,
  ItemResourceCounterState,
  ItemResourceState,
  SrdEquipmentRef,
} from "@/types/character";
import type { SrdMagicItemData } from "@/data/types";
import {
  decodeItemResourceState,
  isValidItemResourceState,
  isValidItemInstanceId,
  makeItemResourceKey,
  type ItemResourceKey,
} from "@/lib/resources";

/** Runtime guard for the locale-free identity of one physical item copy. */
export function isItemInstanceId(value: unknown): value is string {
  return isValidItemInstanceId(value);
}

export type ItemInstanceIdFactory = () => string;

/**
 * Create a strict, lower-case item identity. The factory seam keeps tests and
 * one-off migrations deterministic; production uses the platform UUID source.
 */
export function createItemInstanceId(
  factory: ItemInstanceIdFactory = () => crypto.randomUUID()
): string {
  const instanceId = factory().toLowerCase();
  if (!isItemInstanceId(instanceId)) {
    throw new TypeError("Item instance factory returned an invalid id");
  }
  return instanceId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWhole(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

/** Strict JSON-safe normalization for the session's instance-keyed item state. */
export function normalizeItemResources(
  value: unknown
): Record<string, ItemResourceState> {
  const normalized: Record<string, ItemResourceState> = {};
  if (!isRecord(value)) return normalized;
  for (const [instanceId, stateValue] of Object.entries(value)) {
    if (!isItemInstanceId(instanceId)) continue;
    const state = decodeItemResourceState(stateValue, instanceId);
    if (state) normalized[instanceId] = state;
  }
  return normalized;
}

export type ParsedItemResources =
  | { ok: true; value: Record<string, ItemResourceState> }
  | { ok: false };

/**
 * Strict persistence boundary. Unlike the tolerant display normalizer, this
 * rejects an explicitly stored malformed map instead of erasing it and letting
 * catalogue defaults silently refill the item on the next save.
 */
export function parseItemResources(value: unknown): ParsedItemResources {
  if (value === undefined) return { ok: true, value: {} };
  if (!isRecord(value)) return { ok: false };
  const normalized: Record<string, ItemResourceState> = {};
  for (const [instanceId, stateValue] of Object.entries(value)) {
    if (!isItemInstanceId(instanceId)) return { ok: false };
    const state = decodeItemResourceState(stateValue, instanceId);
    if (!state) return { ok: false };
    normalized[instanceId] = state;
  }
  return { ok: true, value: normalized };
}

export interface ResolvedItemResource {
  itemId: string;
  instanceId: string;
  resourceId: string;
  key: ItemResourceKey;
  spec: ResourceSpec;
  /** Whole-item ownership state, including revision and disposition. */
  itemState?: ItemResourceState;
  /** Stored counter, absent when this resource still has its catalogue default. */
  state?: ItemResourceCounterState;
  /** Stored or catalogue-default value; absent while a table roll is required. */
  capacity?: number;
  /** Stored or catalogue-default value; absent while a table roll is required. */
  current?: number;
}

export type ItemResourceOmissionReason =
  | "missing-instance-id"
  | "invalid-instance-id"
  | "duplicate-instance-id"
  | "invalid-resource-id"
  | "duplicate-resource-id"
  | "invalid-state"
  | "state-item-mismatch";

export interface ItemResourceOmission {
  itemId: string;
  instanceId?: string;
  resourceId?: string;
  reason: ItemResourceOmissionReason;
}

export interface ResolvedItemResources {
  resources: ResolvedItemResource[];
  omissions: ItemResourceOmission[];
}

function catalogueDefault(spec: ResourceSpec): {
  capacity?: number;
  current?: number;
} {
  const capacity = spec.capacity.kind === "fixed" ? spec.capacity.amount : undefined;
  switch (spec.initial.kind) {
    case "full":
      return { capacity, current: capacity };
    case "empty":
      return { capacity, current: 0 };
    case "fixed":
      return { capacity, current: spec.initial.amount };
    case "entered-roll":
      return { capacity };
  }
}

/**
 * Resolve physical equipment copies against typed catalogue specs and canonical
 * session state. Duplicate/missing/invalid identities are omitted explicitly;
 * copies are never collapsed by catalogue id.
 */
export function resolveItemResources(args: {
  equipment: readonly (SrdEquipmentRef | CustomEquipment)[];
  catalogue: readonly Pick<SrdMagicItemData, "id" | "resources">[];
  itemResources?: unknown;
}): ResolvedItemResources {
  const catalogue = new Map(args.catalogue.map((item) => [item.id, item] as const));
  const parsedState = parseItemResources(args.itemResources);
  const normalizedState = parsedState.ok ? parsedState.value : {};
  const omissions: ItemResourceOmission[] = [];
  const candidates: Array<{
    ref: SrdEquipmentRef;
    item: Pick<SrdMagicItemData, "id" | "resources">;
  }> = [];

  for (const entry of args.equipment) {
    if ("custom" in entry) continue;
    const item = catalogue.get(entry.srdId);
    if (!item?.resources?.length) continue;
    if (entry.instanceId === undefined) {
      omissions.push({ itemId: entry.srdId, reason: "missing-instance-id" });
      continue;
    }
    if (!isItemInstanceId(entry.instanceId)) {
      omissions.push({
        itemId: entry.srdId,
        instanceId: entry.instanceId,
        reason: "invalid-instance-id",
      });
      continue;
    }
    candidates.push({ ref: entry, item });
  }

  const identityCounts = new Map<string, number>();
  for (const { ref } of candidates) {
    const id = ref.instanceId as string;
    identityCounts.set(id, (identityCounts.get(id) ?? 0) + 1);
  }

  const resources: ResolvedItemResource[] = [];
  for (const { ref, item } of candidates) {
    const instanceId = ref.instanceId as string;
    if (identityCounts.get(instanceId) !== 1) {
      omissions.push({
        itemId: item.id,
        instanceId,
        reason: "duplicate-instance-id",
      });
      continue;
    }
    if (!parsedState.ok) {
      omissions.push({ itemId: item.id, instanceId, reason: "invalid-state" });
      continue;
    }
    const itemState = normalizedState[instanceId];
    const matchingState =
      itemState?.itemId === item.id && itemState.instanceId === instanceId
        ? itemState
        : undefined;
    if (itemState && !matchingState) {
      omissions.push({
        itemId: item.id,
        instanceId,
        reason: "state-item-mismatch",
      });
      continue;
    }
    if (
      matchingState &&
      !isValidItemResourceState(
        { itemId: item.id, resources: item.resources ?? [] },
        { srdId: item.id, instanceId },
        matchingState
      )
    ) {
      omissions.push({ itemId: item.id, instanceId, reason: "invalid-state" });
      continue;
    }

    const resourceCounts = new Map<string, number>();
    for (const spec of item.resources ?? []) {
      resourceCounts.set(spec.id, (resourceCounts.get(spec.id) ?? 0) + 1);
    }
    for (const spec of item.resources ?? []) {
      if (!isItemInstanceId(spec.id) || resourceCounts.get(spec.id) !== 1) {
        omissions.push({
          itemId: item.id,
          instanceId,
          resourceId: spec.id,
          reason: isItemInstanceId(spec.id)
            ? "duplicate-resource-id"
            : "invalid-resource-id",
        });
        continue;
      }
      const counter = matchingState?.resources[spec.id];
      const defaults = catalogueDefault(spec);
      resources.push({
        itemId: item.id,
        instanceId,
        resourceId: spec.id,
        key: makeItemResourceKey(instanceId, spec.id),
        spec,
        ...(matchingState ? { itemState: matchingState } : {}),
        ...(counter ? { state: counter } : {}),
        ...(counter || defaults.capacity !== undefined
          ? { capacity: counter?.capacity ?? defaults.capacity }
          : {}),
        ...(counter || defaults.current !== undefined
          ? { current: counter?.current ?? defaults.current }
          : {}),
      });
    }
  }

  return { resources, omissions };
}

export type ItemResourceMigrationAmbiguityReason =
  | "invalid-instance-id"
  | "duplicate-instance-id"
  | "generated-instance-id-conflict"
  | "multiple-legacy-copies"
  | "multiple-resource-specs"
  | "conflicting-legacy-owners"
  | "existing-state-conflict"
  | "invalid-legacy-state"
  | "unsupported-legacy-spec";

export interface ItemResourceMigrationAmbiguity {
  itemId: string;
  reason: ItemResourceMigrationAmbiguityReason;
  equipmentIndexes: number[];
}

export type ItemResourceMigrationResult =
  | {
      status: "migrated" | "unchanged";
      doc: CharacterDoc;
      stampedInstances: number;
      migratedOwners: number;
    }
  | {
      status: "ambiguous";
      doc: CharacterDoc;
      ambiguities: ItemResourceMigrationAmbiguity[];
    };

function counterFromCharges(
  ref: SrdEquipmentRef,
  spec: ResourceSpec
): ItemResourceCounterState | undefined {
  const charges = ref.charges;
  if (
    !charges ||
    !isWhole(charges.max, 1) ||
    !isWhole(charges.current) ||
    charges.current > charges.max ||
    spec.capacity.kind !== "fixed" ||
    spec.capacity.amount !== charges.max
  ) {
    return undefined;
  }
  return { capacity: charges.max, current: charges.current, disabled: false };
}

function counterFromTracker(
  tracker: unknown,
  spec: ResourceSpec
): ItemResourceCounterState | undefined {
  if (
    !isRecord(tracker) ||
    !isWhole(tracker.used) ||
    tracker.rolls !== undefined ||
    spec.capacity.kind !== "fixed" ||
    spec.initial.kind !== "full" ||
    tracker.used > spec.capacity.amount
  ) {
    return undefined;
  }
  return {
    capacity: spec.capacity.amount,
    current: spec.capacity.amount - tracker.used,
    disabled: false,
  };
}

function migratedItemState(
  itemId: string,
  instanceId: string,
  resourceId: string,
  counter: ItemResourceCounterState
): ItemResourceState {
  return {
    itemId,
    instanceId,
    revision: 0,
    resources: { [resourceId]: counter },
    disposition: "magical",
    causalHead: null,
  };
}

/**
 * Plan-and-apply the bounded legacy bridge for resource-bearing equipment. It is
 * pure and all-or-nothing: any ownership ambiguity returns the original doc and
 * diagnostics. Callers supply identities; the app never wires this into reads.
 */
export function migrateLegacyItemResources(
  doc: CharacterDoc,
  catalogueItems: readonly Pick<SrdMagicItemData, "id" | "resources">[],
  idFactory: ItemInstanceIdFactory
): ItemResourceMigrationResult {
  const catalogue = new Map(
    catalogueItems
      .filter((item) => item.resources?.length)
      .map((item) => [item.id, item] as const)
  );
  const refs = doc.character.equipment;
  const byItemId = new Map<string, number[]>();
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!ref) continue;
    if ("custom" in ref || !catalogue.has(ref.srdId)) continue;
    const indexes = byItemId.get(ref.srdId) ?? [];
    indexes.push(index);
    byItemId.set(ref.srdId, indexes);
  }

  const ambiguities: ItemResourceMigrationAmbiguity[] = [];
  const parsedExistingState = parseItemResources(doc.session.itemResources);
  if (!parsedExistingState.ok) {
    const affected = [...byItemId];
    return {
      status: "ambiguous",
      doc,
      ambiguities:
        affected.length > 0
          ? affected.map(([itemId, equipmentIndexes]) => ({
              itemId,
              reason: "invalid-legacy-state" as const,
              equipmentIndexes,
            }))
          : [
              {
                itemId: "item-resources",
                reason: "invalid-legacy-state",
                equipmentIndexes: [],
              },
            ],
    };
  }
  const existingState = parsedExistingState.value;
  const occupiedIds = new Set(Object.keys(existingState));
  for (const ref of refs) {
    if ("custom" in ref || ref.instanceId === undefined) continue;
    if (!isItemInstanceId(ref.instanceId) || occupiedIds.has(ref.instanceId)) {
      // An existing state with the same id is expected and checked below. Only
      // equipment duplicates are rejected in this preliminary pass.
      continue;
    }
    occupiedIds.add(ref.instanceId);
  }

  const seenEquipmentIds = new Map<string, number[]>();
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!ref) continue;
    if ("custom" in ref || !catalogue.has(ref.srdId) || !ref.instanceId) continue;
    if (!isItemInstanceId(ref.instanceId)) {
      ambiguities.push({
        itemId: ref.srdId,
        reason: "invalid-instance-id",
        equipmentIndexes: [index],
      });
      continue;
    }
    const indexes = seenEquipmentIds.get(ref.instanceId) ?? [];
    indexes.push(index);
    seenEquipmentIds.set(ref.instanceId, indexes);
  }
  for (const indexes of seenEquipmentIds.values()) {
    if (indexes.length < 2) continue;
    const ref = refs[indexes[0] ?? -1];
    if (!ref || "custom" in ref) continue;
    ambiguities.push({
      itemId: ref.srdId,
      reason: "duplicate-instance-id",
      equipmentIndexes: indexes,
    });
  }

  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!ref || "custom" in ref || !ref.instanceId || !isItemInstanceId(ref.instanceId)) {
      continue;
    }
    const item = catalogue.get(ref.srdId);
    const state = existingState[ref.instanceId];
    if (
      item?.resources?.length &&
      state &&
      !isValidItemResourceState(
        { itemId: item.id, resources: item.resources },
        { srdId: item.id, instanceId: ref.instanceId },
        state
      )
    ) {
      ambiguities.push({
        itemId: ref.srdId,
        reason: "existing-state-conflict",
        equipmentIndexes: [index],
      });
    }
  }

  for (const [itemId, indexes] of byItemId) {
    const item = catalogue.get(itemId);
    if (!item) continue;
    const specs = item.resources ?? [];
    const tracker = doc.session.trackers[itemId];
    const physicalCount = indexes.reduce((total, index) => {
      const ref = refs[index];
      if (!ref || "custom" in ref) return total;
      return total + (isWhole(ref.quantity, 1) ? ref.quantity : 1);
    }, 0);
    if (tracker !== undefined && physicalCount !== 1) {
      ambiguities.push({
        itemId,
        reason: "multiple-legacy-copies",
        equipmentIndexes: indexes,
      });
    }
    for (const index of indexes) {
      const ref = refs[index];
      if (!ref || "custom" in ref) continue;
      const quantity = isWhole(ref.quantity, 1) ? ref.quantity : 1;
      if ((ref.charges !== undefined || tracker !== undefined) && quantity !== 1) {
        ambiguities.push({
          itemId,
          reason: "multiple-legacy-copies",
          equipmentIndexes: [index],
        });
      }
      if (ref.charges !== undefined && tracker !== undefined) {
        ambiguities.push({
          itemId,
          reason: "conflicting-legacy-owners",
          equipmentIndexes: [index],
        });
      }
      if ((ref.charges !== undefined || tracker !== undefined) && specs.length !== 1) {
        ambiguities.push({
          itemId,
          reason: "multiple-resource-specs",
          equipmentIndexes: [index],
        });
      }
    }
  }

  if (ambiguities.length > 0) {
    return { status: "ambiguous", doc, ambiguities };
  }

  const equipment: CharacterDoc["character"]["equipment"] = [];
  const itemResources = { ...existingState };
  let trackers = { ...doc.session.trackers };
  let stampedInstances = 0;
  let migratedOwners = 0;
  let changed = false;

  for (let index = 0; index < refs.length; index += 1) {
    const entry = refs[index];
    if (!entry) continue;
    if ("custom" in entry) {
      equipment.push(entry);
      continue;
    }
    const item = catalogue.get(entry.srdId);
    if (!item?.resources?.length) {
      equipment.push(entry);
      continue;
    }
    const quantity = isWhole(entry.quantity, 1) ? entry.quantity : 1;
    const copies = quantity > 1 ? quantity : 1;
    for (let copy = 0; copy < copies; copy += 1) {
      let instanceId = copy === 0 ? entry.instanceId : undefined;
      if (instanceId === undefined) {
        try {
          instanceId = createItemInstanceId(idFactory);
        } catch {
          return {
            status: "ambiguous",
            doc,
            ambiguities: [
              {
                itemId: entry.srdId,
                reason: "generated-instance-id-conflict",
                equipmentIndexes: [index],
              },
            ],
          };
        }
        if (occupiedIds.has(instanceId)) {
          return {
            status: "ambiguous",
            doc,
            ambiguities: [
              {
                itemId: entry.srdId,
                reason: "generated-instance-id-conflict",
                equipmentIndexes: [index],
              },
            ],
          };
        }
        occupiedIds.add(instanceId);
        stampedInstances += 1;
        changed = true;
      }

      const nextRef: SrdEquipmentRef = {
        ...entry,
        instanceId,
        quantity: 1,
      };
      const spec = item.resources[0];
      if (!spec) {
        equipment.push(nextRef);
        continue;
      }
      const legacyCharges = copy === 0 ? entry.charges : undefined;
      const legacyTracker =
        copy === 0 && (byItemId.get(entry.srdId)?.length ?? 0) === 1
          ? trackers[entry.srdId]
          : undefined;
      const counter = legacyCharges
        ? counterFromCharges(entry, spec)
        : legacyTracker
          ? counterFromTracker(legacyTracker, spec)
          : undefined;
      if ((legacyCharges || legacyTracker) && !counter) {
        return {
          status: "ambiguous",
          doc,
          ambiguities: [
            {
              itemId: entry.srdId,
              reason:
                spec.capacity.kind === "fixed"
                  ? "invalid-legacy-state"
                  : "unsupported-legacy-spec",
              equipmentIndexes: [index],
            },
          ],
        };
      }
      if (counter) {
        if (itemResources[instanceId]) {
          return {
            status: "ambiguous",
            doc,
            ambiguities: [
              {
                itemId: entry.srdId,
                reason: "existing-state-conflict",
                equipmentIndexes: [index],
              },
            ],
          };
        }
        itemResources[instanceId] = migratedItemState(
          entry.srdId,
          instanceId,
          spec.id,
          counter
        );
        delete nextRef.charges;
        if (legacyTracker) {
          trackers = Object.fromEntries(
            Object.entries(trackers).filter(([trackerId]) => trackerId !== entry.srdId)
          );
        }
        migratedOwners += 1;
        changed = true;
      }
      equipment.push(nextRef);
    }
  }

  const migratedDoc: CharacterDoc = {
    ...doc,
    character: { ...doc.character, equipment },
    session: {
      ...doc.session,
      trackers,
      ...(Object.keys(itemResources).length > 0 ? { itemResources } : {}),
    },
  };
  return {
    status: changed ? "migrated" : "unchanged",
    doc: changed ? migratedDoc : doc,
    stampedInstances,
    migratedOwners,
  };
}
