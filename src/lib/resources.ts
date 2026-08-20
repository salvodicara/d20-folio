/** Pure canonical kernel for authored, resolved, and mutable game resources. */

import {
  conformDiceFormula,
  conformDiceObservation,
  conformDiceResolution,
  evaluateDiceFormula,
  resolveDiceObservation,
  type DiceFormula,
  type DiceObservation,
  type DiceResolution,
  type DiceRollRequirement,
} from "@/lib/dice-formula";
import type {
  ResourceDepletionOutcome,
  ResourceEnteredRoll,
  ResourceSpec as CatalogueResourceSpec,
  ResourceUnit,
} from "@/data/types";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  conformIntegerExpression,
  evaluateIntegerExpression,
  type IntegerBindings,
} from "@/lib/integer-expression";
import { conformEntityRef, entityRefKey } from "@/lib/mechanics-reference-schema";
import type {
  ItemResourceCounterState,
  ItemResourceLogicalState,
  ItemResourceState,
  ItemResourceTransitionFingerprint,
  ItemResourceTransitionIntent,
} from "@/types/character";
import type { CharacterMaterialRef, EntityRef } from "@/types/mechanics-reference";
import {
  RESOURCE_CELL_SCHEMA,
  RESOURCE_INITIALIZATION_OBSERVATIONS_SCHEMA,
  RESOURCE_OPERATION_SCHEMA,
  RESOURCE_RECOVERY_TRIGGER_SCHEMA,
  RESOURCE_REF_SCHEMA,
  RESOURCE_SELECTOR_SCHEMA,
  RESOURCE_SPEC_SCHEMA,
  RESOURCE_TERM_SCHEMA,
  type CountResourceCell,
  type ResourceCapacity,
  type ResourceCapacityBase,
  type ResourceCell,
  type ResourceInitializationObservations,
  type ResourceInitializationResult,
  type ResourceOperation,
  type ResourceRecoveryTrigger,
  type ResourceRef,
  type ResourceRejection as CoreResourceRejection,
  type ResourceSchemaCustomTypes,
  type ResourceSelector,
  type ResourceSpec,
  type ResourceTerm,
  type ResourceTransitionFacts,
  type ResourceTransitionResult,
} from "@/types/resource";

export type {
  CountResourceCell,
  CurrencyDenomination,
  ResourceCapacity,
  ResourceCapacityBase,
  ResourceCapacitySpec,
  ResourceCell,
  ResourceDie,
  ResourceInitializationObservations,
  ResourceInitializationResult,
  ResourceInitialSpec,
  ResourceItemSelector,
  ResourceOperation,
  ResourceOwnerRole,
  ResourceRecoveryAmount,
  ResourceRecoverySpec,
  ResourceRecoveryTrigger,
  ResourceRef,
  ResourceSelector,
  ResourceSpec,
  ResourceTerm,
  ResourceTransitionFacts,
  ResourceTransitionResult,
  RolledResourceCell,
} from "@/types/resource";

/**
 * Everything the schema-first engine can reject, plus the physical-item command
 * layer's own closed failure modes. The core union stays authoritative in
 * `@/types/resource`; item-resource planners and appliers add exactly three
 * reasons of their own and never invent ad-hoc strings.
 */
export type ResourceRejection =
  | CoreResourceRejection
  | "invalid-command"
  | "invalid-state"
  | "revision-conflict";

const MAX_RESOURCE_VALUE = 1_000_000_000;
const MAX_ROLLED_ENTRIES = 2_048;
const MAX_ID_LENGTH = 128;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

function id(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function integer(
  value: unknown,
  minimum: number,
  maximum = MAX_RESOURCE_VALUE
): number | null {
  return Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
    ? (value as number)
    : null;
}

function characterMaterialRef(value: unknown): CharacterMaterialRef | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return keys.length === 3 &&
    candidate.kind === "character-play" &&
    id(candidate.uid) !== null &&
    id(candidate.characterId) !== null
    ? {
        characterId: candidate.characterId as string,
        kind: "character-play",
        uid: candidate.uid as string,
      }
    : null;
}

const RESOURCE_SCHEMA_CONTEXT: ExactSchemaContext<
  ResourceSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "character-material-ref": characterMaterialRef,
    "dice-formula": conformDiceFormula,
    "dice-observation": conformDiceObservation,
    "dice-resolution": conformDiceResolution,
    "entity-ref": (value): EntityRef | null => conformEntityRef(value),
    id,
    "integer-expression": conformIntegerExpression,
    "nonnegative-integer": (value) => integer(value, 0),
    "positive-integer": (value) => integer(value, 1),
    "spell-level": (value) => integer(value, 1, 9),
  },
  refs: {},
};

const conformResourceTriggerStructure = exactConformer(
  RESOURCE_RECOVERY_TRIGGER_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);
const conformResourceSpecStructure = exactConformer(
  RESOURCE_SPEC_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);
const conformResourceSelectorStructure = exactConformer(
  RESOURCE_SELECTOR_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);
const conformResourceTermStructure = exactConformer(
  RESOURCE_TERM_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);
const conformResourceRefStructure = exactConformer(
  RESOURCE_REF_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);
const conformResourceCellStructure = exactConformer(
  RESOURCE_CELL_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);
const conformInitializationObservationsStructure = exactConformer(
  RESOURCE_INITIALIZATION_OBSERVATIONS_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);
const conformResourceOperationStructure = exactConformer(
  RESOURCE_OPERATION_SCHEMA,
  RESOURCE_SCHEMA_CONTEXT
);

/** Exact conformer for one recovery boundary; aliases are deliberately rejected. */
export function conformResourceRecoveryTrigger(
  value: unknown
): Readonly<ResourceRecoveryTrigger> | null {
  return conformResourceTriggerStructure(value);
}

function recoveryKey(trigger: ResourceRecoveryTrigger): string {
  return trigger.kind === "event" ? `event\u0000${trigger.eventId}` : trigger.kind;
}

/** Exact authored-resource boundary with semantic cross-field invariants. */
export function conformResourceSpec(value: unknown): Readonly<ResourceSpec> | null {
  const spec = conformResourceSpecStructure(value);
  if (!spec || spec.recoveries.length > 64) return null;
  if (
    spec.capacity.kind === "unbounded" &&
    (spec.initial.kind === "full" ||
      spec.recoveries.some((recovery) => recovery.amount.kind === "full"))
  ) {
    return null;
  }
  const boundaries = spec.recoveries.map((recovery) => recoveryKey(recovery.trigger));
  return new Set(boundaries).size === boundaries.length ? spec : null;
}

/** Exact unresolved selector boundary. */
export function conformResourceSelector(
  value: unknown
): Readonly<ResourceSelector> | null {
  return conformResourceSelectorStructure(value);
}

/** Exact authored selector/amount pair shared by grants and character builds. */
export function conformResourceTerm(value: unknown): Readonly<ResourceTerm> | null {
  return conformResourceTermStructure(value);
}

/** Exact physical resource reference, with no catalogue identity embedded. */
export function conformResourceRef(value: unknown): Readonly<ResourceRef> | null {
  return conformResourceRefStructure(value);
}

function framed(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

function characterParts(character: CharacterMaterialRef): readonly string[] {
  return [character.kind, character.uid, character.characterId];
}

/** Collision-safe opaque identity. Consumers may compare/store it but must never parse it. */
export function resourceRefKey(ref: ResourceRef): string {
  switch (ref.kind) {
    case "pool": {
      return framed([ref.kind, entityRefKey(ref.owner), ref.resourceId]);
    }
    case "standard-spell-slot":
      return framed([ref.kind, ...characterParts(ref.character), String(ref.level)]);
    case "pact-spell-slot":
      return framed([ref.kind, ...characterParts(ref.character)]);
    case "hit-die":
      return framed([ref.kind, ...characterParts(ref.character), ref.die]);
    case "currency":
      return framed([ref.kind, ...characterParts(ref.character), ref.denomination]);
    case "item-resource":
      return framed([
        ref.kind,
        ...characterParts(ref.character),
        ref.instanceId,
        String(ref.instanceOrdinal),
        ref.resourceId,
      ]);
    case "item-quantity":
      return framed([
        ref.kind,
        ...characterParts(ref.character),
        ref.instanceId,
        String(ref.instanceOrdinal),
      ]);
  }
}

// ── Physical-item resource identity ─────────────────────────────────────────

/**
 * Strict shape of one physical item copy's locale-free id: non-empty lower-case
 * kebab (letters/digits/hyphens, ≤ 64 chars). Covers both authored fixture ids
 * (`wand-copy-a`) and generated ids (`mi-<hex>`, lower-cased UUIDs); anything
 * else — path fragments, prototype-pollution keys, mixed case — fails closed.
 */
const ITEM_INSTANCE_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Runtime guard for the locale-free identity of one physical item copy. */
export function isValidItemInstanceId(value: unknown): value is string {
  return typeof value === "string" && ITEM_INSTANCE_ID_RE.test(value);
}

/**
 * Stable per-copy address of one resource on one physical item instance —
 * an opaque comparison/storage key, never parsed by consumers.
 */
export type ItemResourceKey = `item:${string}:${string}`;

/** Compose the one canonical {@link ItemResourceKey} for an instance's resource. */
export function makeItemResourceKey(
  instanceId: string,
  resourceId: string
): ItemResourceKey {
  return `item:${instanceId}:${resourceId}`;
}

/**
 * The exact payment address of one resource on one physical item copy: the
 * catalogue item, the per-copy instance, the declared resource id, and the
 * composed {@link ItemResourceKey}. The single identity shape shared by the
 * grant evaluator's item-backed free-cast payments, the smart-tracker's
 * availability resolver, and the item-resource command layer.
 */
export interface ItemResourceIdentity {
  instanceId: string;
  itemId: string;
  key: ItemResourceKey;
  resourceId: string;
}

/** Build the canonical identity for one resource on one physical item copy. */
export function makeItemResourceIdentity(
  itemId: string,
  instanceId: string,
  resourceId: string
): ItemResourceIdentity {
  return {
    instanceId,
    itemId,
    key: makeItemResourceKey(instanceId, resourceId),
    resourceId,
  };
}

/** Exact persistence conformer for one mutable resource cell. */
export function conformResourceCell(value: unknown): Readonly<ResourceCell> | null {
  const cell = conformResourceCellStructure(value);
  if (!cell) return null;
  const remaining = cell.kind === "count" ? cell.current : cell.values.length;
  const baseCapacity = baseCapacityValue(cell.capacity.base);
  const capacity = finiteCapacity(cell);
  if (
    (cell.kind === "rolled" && cell.values.length > MAX_ROLLED_ENTRIES) ||
    (cell.kind === "rolled" &&
      cell.values.some(
        (resolution) =>
          resolution !== null &&
          (resolution.total < 0 || resolution.total > MAX_RESOURCE_VALUE)
      )) ||
    (cell.kind === "rolled" &&
      baseCapacity !== null &&
      baseCapacity > MAX_ROLLED_ENTRIES) ||
    (cell.kind === "rolled" &&
      cell.capacity.override !== null &&
      cell.capacity.override > MAX_ROLLED_ENTRIES) ||
    (baseCapacity !== null && (baseCapacity < 0 || baseCapacity > MAX_RESOURCE_VALUE)) ||
    (capacity !== null && (capacity > MAX_RESOURCE_VALUE || remaining > capacity))
  ) {
    return null;
  }
  return cell;
}

/** Exact command boundary shared by program review and world transactions. */
export function conformResourceOperation(
  value: unknown
): Readonly<ResourceOperation> | null {
  return conformResourceOperationStructure(value);
}

function evaluatedResourceValue(
  expression: unknown,
  bindings: IntegerBindings
): number | null {
  const value = evaluateIntegerExpression(expression, bindings);
  return value !== null && value >= 0 && value <= MAX_RESOURCE_VALUE ? value : null;
}

function resourceRequirement(
  formula: DiceFormula,
  bindings: IntegerBindings,
  maximum = MAX_RESOURCE_VALUE
): Readonly<DiceRollRequirement> | null {
  const requirement = evaluateDiceFormula(formula, bindings);
  return requirement &&
    requirement.minimumTotal >= 0 &&
    requirement.maximumTotal <= maximum
    ? requirement
    : null;
}

function resourceResolution(
  requirement: DiceRollRequirement,
  observation: DiceObservation
): Readonly<DiceResolution> | null {
  const resolution = resolveDiceObservation(requirement, observation);
  return resolution && resolution.total >= 0 && resolution.total <= MAX_RESOURCE_VALUE
    ? resolution
    : null;
}

function needsPhysicalObservation(requirement: DiceRollRequirement): boolean {
  return requirement.trails.length > 0 || requirement.aggregates.length > 0;
}

function resolveResourceInput(
  requirement: DiceRollRequirement,
  observation: DiceObservation | undefined
): Readonly<DiceResolution> | null {
  if (observation) return resourceResolution(requirement, observation);
  return needsPhysicalObservation(requirement)
    ? null
    : resourceResolution(requirement, { aggregates: [], trails: [] });
}

function resolutionObservation(resolution: DiceResolution): DiceObservation {
  return {
    aggregates: resolution.aggregates.map(({ rollId, total }) => ({ rollId, total })),
    trails: resolution.trails.map(({ initialFace, steps, trailId }) => ({
      initialFace,
      steps,
      trailId,
    })),
  };
}

function resolutionMatchesRequirement(
  resolution: DiceResolution,
  requirement: DiceRollRequirement
): boolean {
  const rebuilt = resourceResolution(requirement, resolutionObservation(resolution));
  return rebuilt !== null && JSON.stringify(rebuilt) === JSON.stringify(resolution);
}

function resolutionCanReevaluate(
  resolution: DiceResolution,
  requirement: DiceRollRequirement
): boolean {
  return (
    resolution.trails.length === requirement.trails.length &&
    resolution.aggregates.length === requirement.aggregates.length &&
    resolution.deterministicTerms.length === requirement.deterministicTerms.length &&
    resolution.trails.every((trail, index) => {
      const expected = requirement.trails[index];
      return (
        expected !== undefined &&
        trail.trailId === expected.trailId &&
        trail.termId === expected.termId &&
        trail.operation === expected.operation &&
        trail.sides === expected.sides
      );
    }) &&
    resolution.aggregates.every((aggregate, index) => {
      const expected = requirement.aggregates[index];
      return (
        expected !== undefined &&
        aggregate.rollId === expected.rollId &&
        aggregate.termId === expected.termId &&
        aggregate.operation === expected.operation &&
        aggregate.count === expected.count &&
        aggregate.sides === expected.sides
      );
    }) &&
    resolution.deterministicTerms.every((term, index) => {
      const expected = requirement.deterministicTerms[index];
      return (
        expected !== undefined &&
        term.termId === expected.termId &&
        term.operation === expected.operation
      );
    })
  );
}

function remaining(cell: ResourceCell): number {
  return cell.kind === "count" ? cell.current : cell.values.length;
}

function baseCapacityValue(base: ResourceCapacityBase): number | null {
  switch (base.kind) {
    case "unbounded":
      return null;
    case "formula":
      return base.resolution.total;
    case "derived":
      return base.value;
  }
}

function capacityValue(capacity: ResourceCapacity): number | null {
  return capacity.override ?? baseCapacityValue(capacity.base);
}

function finiteCapacity(cell: ResourceCell): number | null {
  return capacityValue(cell.capacity);
}

function canonicalCell(cell: ResourceCell): Readonly<ResourceCell> | null {
  return conformResourceCell(cell);
}

function resized(
  cell: ResourceCell,
  capacity: ResourceCapacity
): Readonly<ResourceCell> | null {
  const oldCapacity = finiteCapacity(cell);
  const value = capacityValue(capacity);
  if (value === null) return canonicalCell({ ...cell, capacity });
  if (cell.kind === "count") {
    const current =
      oldCapacity === null
        ? Math.min(cell.current, value)
        : Math.max(value - (oldCapacity - cell.current), 0);
    return canonicalCell({
      capacity,
      current,
      disabled: cell.disabled,
      kind: "count",
    });
  }
  const target =
    oldCapacity === null
      ? Math.min(cell.values.length, value)
      : Math.max(value - (oldCapacity - cell.values.length), 0);
  if (target > MAX_ROLLED_ENTRIES) return null;
  const values = cell.values.slice(0, target);
  while (values.length < target) values.push(null);
  return canonicalCell({
    capacity,
    disabled: cell.disabled,
    kind: "rolled",
    values,
  });
}

function synchronized(
  spec: ResourceSpec,
  cell: ResourceCell,
  bindings: IntegerBindings
): Readonly<ResourceCell> | null {
  if (spec.kind === "rolled" && cell.kind === "rolled") {
    const requirement = resourceRequirement(spec.formula, bindings);
    if (
      !requirement ||
      cell.values.some(
        (resolution) =>
          resolution !== null && !resolutionMatchesRequirement(resolution, requirement)
      )
    ) {
      return null;
    }
  }
  switch (spec.capacity.kind) {
    case "bounded": {
      if (cell.capacity.base.kind !== "derived") return null;
      const value = evaluatedResourceValue(spec.capacity.amount, bindings);
      return value === null
        ? null
        : resized(cell, {
            base: { kind: "derived", value },
            override: cell.capacity.override,
          });
    }
    case "formula": {
      if (cell.capacity.base.kind !== "formula") return null;
      const requirement = resourceRequirement(
        spec.capacity.formula,
        bindings,
        spec.kind === "rolled" ? MAX_ROLLED_ENTRIES : MAX_RESOURCE_VALUE
      );
      if (
        !requirement ||
        !resolutionCanReevaluate(cell.capacity.base.resolution, requirement)
      ) {
        return null;
      }
      const resolution = resourceResolution(
        requirement,
        resolutionObservation(cell.capacity.base.resolution)
      );
      return resolution
        ? resized(cell, {
            base: { kind: "formula", resolution },
            override: cell.capacity.override,
          })
        : null;
    }
    case "unbounded":
      return cell.capacity.base.kind === "unbounded" ? cell : null;
  }
}

function initializationObservations(
  value: unknown
): Readonly<ResourceInitializationObservations> | null {
  return conformInitializationObservationsStructure(value);
}

/**
 * Materializes a resource without fabricating any physical roll. Missing table
 * input is returned as an explicit observation request.
 */
export function initializeResource(
  authoredSpec: unknown,
  bindings: IntegerBindings,
  suppliedObservations: unknown = {}
): ResourceInitializationResult {
  const spec = conformResourceSpec(authoredSpec);
  if (!spec) return { reason: "invalid-spec", status: "rejected" };
  const observations = initializationObservations(suppliedObservations);
  if (!observations) return { reason: "invalid-observation", status: "rejected" };
  if (spec.kind === "rolled" && !resourceRequirement(spec.formula, bindings)) {
    return { reason: "invalid-spec", status: "rejected" };
  }

  let capacity: ResourceCapacity;
  if (spec.capacity.kind === "bounded") {
    if (observations.capacity !== undefined) {
      return { reason: "unexpected-observation", status: "rejected" };
    }
    const value = evaluatedResourceValue(spec.capacity.amount, bindings);
    if (value === null || (spec.kind === "rolled" && value > MAX_ROLLED_ENTRIES)) {
      return { reason: "invalid-spec", status: "rejected" };
    }
    capacity = {
      base: { kind: "derived", value },
      override: null,
    };
  } else if (spec.capacity.kind === "formula") {
    const requirement = resourceRequirement(
      spec.capacity.formula,
      bindings,
      spec.kind === "rolled" ? MAX_ROLLED_ENTRIES : MAX_RESOURCE_VALUE
    );
    if (!requirement) return { reason: "invalid-spec", status: "rejected" };
    const needsObservation = needsPhysicalObservation(requirement);
    if (observations.capacity === undefined && needsObservation) {
      return {
        boundary: "capacity",
        requirement,
        status: "needs-observation",
      };
    }
    if (observations.capacity !== undefined && !needsObservation) {
      return { reason: "unexpected-observation", status: "rejected" };
    }
    const resolution = resolveResourceInput(requirement, observations.capacity);
    if (!resolution) {
      return { reason: "invalid-observation", status: "rejected" };
    }
    capacity = {
      base: { kind: "formula", resolution },
      override: null,
    };
  } else {
    if (observations.capacity !== undefined) {
      return { reason: "unexpected-observation", status: "rejected" };
    }
    capacity = { base: { kind: "unbounded" }, override: null };
  }

  let initial: number;
  if (spec.initial.kind === "full") {
    if (observations.initial !== undefined) {
      return { reason: "unexpected-observation", status: "rejected" };
    }
    const value = capacityValue(capacity);
    if (value === null) {
      return { reason: "unbounded-full", status: "rejected" };
    }
    initial = value;
  } else if (spec.initial.kind === "empty") {
    if (observations.initial !== undefined) {
      return { reason: "unexpected-observation", status: "rejected" };
    }
    initial = 0;
  } else if (spec.initial.kind === "fixed") {
    if (observations.initial !== undefined) {
      return { reason: "unexpected-observation", status: "rejected" };
    }
    const value = evaluatedResourceValue(spec.initial.amount, bindings);
    if (value === null) return { reason: "invalid-spec", status: "rejected" };
    initial = value;
  } else {
    const requirement = resourceRequirement(
      spec.initial.formula,
      bindings,
      spec.kind === "rolled" ? MAX_ROLLED_ENTRIES : MAX_RESOURCE_VALUE
    );
    if (!requirement) return { reason: "invalid-spec", status: "rejected" };
    const needsObservation = needsPhysicalObservation(requirement);
    if (observations.initial === undefined && needsObservation) {
      return {
        boundary: "initial",
        requirement,
        status: "needs-observation",
      };
    }
    if (observations.initial !== undefined && !needsObservation) {
      return { reason: "unexpected-observation", status: "rejected" };
    }
    const resolution = resolveResourceInput(requirement, observations.initial);
    if (!resolution) {
      return { reason: "invalid-observation", status: "rejected" };
    }
    initial = resolution.total;
  }

  const capacityMaximum = capacityValue(capacity);
  if (capacityMaximum !== null && initial > capacityMaximum) {
    return { reason: "overfill", status: "rejected" };
  }
  if (spec.kind === "rolled" && initial > MAX_ROLLED_ENTRIES) {
    return { reason: "invalid-spec", status: "rejected" };
  }
  const cell = canonicalCell(
    spec.kind === "count"
      ? { capacity, current: initial, disabled: false, kind: "count" }
      : {
          capacity,
          disabled: false,
          kind: "rolled",
          values: Array.from({ length: initial }, () => null),
        }
  );
  return cell
    ? { cell, status: "initialized" }
    : { reason: "invalid-spec", status: "rejected" };
}

function rejected(reason: CoreResourceRejection): ResourceTransitionResult {
  return { reason, status: "rejected" };
}

function applied(
  before: Readonly<ResourceCell>,
  afterValue: ResourceCell,
  operation: ResourceOperation,
  resolutions: Pick<ResourceTransitionFacts, "recoveryResolution" | "spentResolution"> = {
    recoveryResolution: null,
    spentResolution: null,
  }
): ResourceTransitionResult {
  const after = canonicalCell(afterValue);
  if (!after) return rejected("invalid-cell");
  const beforeRemaining = remaining(before);
  const afterRemaining = remaining(after);
  const facts: ResourceTransitionFacts = Object.freeze({
    afterRemaining,
    becameEmpty:
      (operation.kind === "spend" || operation.kind === "spend-roll") &&
      beforeRemaining > 0 &&
      afterRemaining === 0,
    beforeRemaining,
    recoveryResolution: resolutions.recoveryResolution,
    spentResolution: resolutions.spentResolution,
  });
  return { after, before, facts, status: "applied" };
}

function countOperation(
  physicalBefore: Readonly<ResourceCell>,
  before: Readonly<CountResourceCell>,
  operation: Extract<ResourceOperation, { readonly kind: "spend" | "gain" | "set-count" }>
): ResourceTransitionResult {
  let current: number;
  if (operation.kind === "spend") {
    if (operation.amount > before.current) return rejected("overdraw");
    current = before.current - operation.amount;
  } else if (operation.kind === "gain") {
    const next = before.current + operation.amount;
    if (!Number.isSafeInteger(next) || next > MAX_RESOURCE_VALUE) {
      return rejected("overfill");
    }
    current = next;
  } else {
    current = operation.value;
  }
  const capacity = finiteCapacity(before);
  if (capacity !== null && current > capacity) {
    return rejected("overfill");
  }
  return applied(physicalBefore, { ...before, current }, operation);
}

function recovered(
  spec: ResourceSpec,
  physicalBefore: Readonly<ResourceCell>,
  before: Readonly<ResourceCell>,
  operation: Extract<ResourceOperation, { readonly kind: "recover" }>,
  bindings: IntegerBindings
): ResourceTransitionResult {
  const recovery = spec.recoveries.find(
    (candidate) => recoveryKey(candidate.trigger) === recoveryKey(operation.trigger)
  );
  if (!recovery) return rejected("unsupported-boundary");
  let amount: number | "full";
  let recoveryResolution: Readonly<DiceResolution> | null = null;
  if (recovery.amount.kind === "formula") {
    const requirement = resourceRequirement(recovery.amount.formula, bindings);
    if (!requirement) return rejected("invalid-spec");
    const needsObservation = needsPhysicalObservation(requirement);
    const capacity = finiteCapacity(before);
    if (
      operation.observation === undefined &&
      before.kind === "count" &&
      capacity !== null &&
      before.current === capacity
    ) {
      return applied(physicalBefore, before, operation);
    }
    if (!operation.observation && needsObservation) {
      return { boundary: "recovery", requirement, status: "needs-observation" };
    }
    if (operation.observation && !needsObservation) {
      return rejected("unexpected-observation");
    }
    const resolution = resolveResourceInput(requirement, operation.observation);
    if (!resolution) {
      return rejected("invalid-observation");
    }
    recoveryResolution = resolution;
    amount = resolution.total;
  } else {
    if (operation.observation) return rejected("unexpected-observation");
    if (recovery.amount.kind === "full") {
      amount = "full";
    } else {
      const value = evaluatedResourceValue(recovery.amount.amount, bindings);
      if (value === null) return rejected("invalid-spec");
      amount = value;
    }
  }
  const capacity = finiteCapacity(before);
  if (amount === "full" && capacity === null) return rejected("unbounded-full");
  const target =
    amount === "full"
      ? (capacity as number)
      : capacity === null
        ? remaining(before) + amount
        : Math.min(remaining(before) + amount, capacity);
  if (!Number.isSafeInteger(target) || target > MAX_RESOURCE_VALUE) {
    return rejected("overfill");
  }
  if (before.kind === "count") {
    return applied(physicalBefore, { ...before, current: target }, operation, {
      recoveryResolution,
      spentResolution: null,
    });
  }
  if (target > MAX_ROLLED_ENTRIES) return rejected("overfill");
  const values =
    amount === "full"
      ? Array.from<null>({ length: target }).fill(null)
      : before.values.slice(0, target);
  while (values.length < target) values.push(null);
  return applied(physicalBefore, { ...before, values }, operation, {
    recoveryResolution,
    spentResolution: null,
  });
}

/**
 * Pure state reducer. It rejects missing/malformed state and every impossible
 * transition; it emits only canonical before/after cells plus derived facts.
 */
export function reduceResource(
  authoredSpec: unknown,
  storedCell: unknown,
  bindings: IntegerBindings,
  authoredOperation: unknown
): ResourceTransitionResult {
  const spec = conformResourceSpec(authoredSpec);
  if (!spec) return rejected("invalid-spec");
  if (storedCell == null) return rejected("missing");
  const cell = conformResourceCell(storedCell);
  if (!cell) return rejected("invalid-cell");
  const operation = conformResourceOperationStructure(authoredOperation);
  if (!operation) return rejected("invalid-operation");
  if (spec.kind !== cell.kind) return rejected("wrong-kind");
  const synchronizedCell = synchronized(spec, cell, bindings);
  if (!synchronizedCell) return rejected("invalid-cell");

  const allowedWhileDisabled =
    operation.kind === "set-disabled" ||
    operation.kind === "set-count" ||
    operation.kind === "override-capacity" ||
    operation.kind === "clear-capacity-override";
  if (synchronizedCell.disabled && !allowedWhileDisabled) return rejected("disabled");

  if (operation.kind === "set-disabled") {
    return applied(
      cell,
      { ...synchronizedCell, disabled: operation.disabled },
      operation
    );
  }
  if (operation.kind === "override-capacity") {
    const after = resized(synchronizedCell, {
      ...synchronizedCell.capacity,
      override: operation.capacity,
    });
    return after ? applied(cell, after, operation) : rejected("overfill");
  }
  if (operation.kind === "clear-capacity-override") {
    const after = resized(synchronizedCell, {
      ...synchronizedCell.capacity,
      override: null,
    });
    return after ? applied(cell, after, operation) : rejected("overfill");
  }
  if (operation.kind === "recover") {
    return recovered(spec, cell, synchronizedCell, operation, bindings);
  }
  if (
    operation.kind === "spend" ||
    operation.kind === "gain" ||
    operation.kind === "set-count"
  ) {
    return synchronizedCell.kind === "count"
      ? countOperation(cell, synchronizedCell, operation)
      : rejected("wrong-kind");
  }
  if (synchronizedCell.kind !== "rolled" || spec.kind !== "rolled") {
    return rejected("wrong-kind");
  }
  if (operation.index >= synchronizedCell.values.length) return rejected("out-of-range");
  if (operation.kind === "record-roll") {
    if (synchronizedCell.values[operation.index] !== null) {
      return rejected("already-recorded");
    }
    const requirement = resourceRequirement(spec.formula, bindings);
    if (!requirement) return rejected("invalid-spec");
    const needsObservation = needsPhysicalObservation(requirement);
    if (!operation.observation && needsObservation) {
      return {
        boundary: "record-roll",
        requirement,
        status: "needs-observation",
      };
    }
    if (operation.observation && !needsObservation) {
      return rejected("unexpected-observation");
    }
    const resolution = resolveResourceInput(requirement, operation.observation);
    if (!resolution) {
      return rejected("invalid-observation");
    }
    const values = [...synchronizedCell.values];
    values[operation.index] = resolution;
    return applied(cell, { ...synchronizedCell, values }, operation);
  }
  const spentResolution = synchronizedCell.values[operation.index];
  if (spentResolution == null) return rejected("unrecorded-roll");
  const values = synchronizedCell.values.filter((_, index) => index !== operation.index);
  return applied(cell, { ...synchronizedCell, values }, operation, {
    recoveryResolution: null,
    spentResolution,
  });
}

// ── Physical-item resource persistence ──────────────────────────────────────

const ITEM_RESOURCE_UNITS: readonly ResourceUnit[] = [
  "charges",
  "uses",
  "beads",
  "rounds",
];
const ITEM_RESOURCE_DISPOSITIONS = ["magical", "nonmagical", "destroyed"] as const;
const MAX_OCCURRENCE_ID_LENGTH = 240;
const MAX_ENTERED_ROLL_DICE = 100;
const MAX_ENTERED_ROLL_SIDES = 100;
const MAX_ENTERED_ROLL_MODIFIER = 1_000;

type ItemResourceDisposition = ItemResourceState["disposition"];

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

/** Ids addressing item counters share the instance-id charset and unsafe-set. */
function isValidItemResourceId(value: unknown): value is string {
  return isValidItemInstanceId(value) && !UNSAFE_IDS.has(value);
}

/** Occurrence ids are opaque causal handles: single-line, trimmed, bounded. */
function isValidOccurrenceId(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_OCCURRENCE_ID_LENGTH ||
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

function normalizedObjectKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
}

/** Structural equality; property order never matters, undefined means absent. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((entry, index) => deepEqual(entry, b[index]))
    );
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = normalizedObjectKeys(left);
  const rightKeys = normalizedObjectKeys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && deepEqual(left[key], right[key])
    )
  );
}

function isValidEnteredRoll(roll: ResourceEnteredRoll): boolean {
  const modifier = roll.modifier ?? 0;
  return (
    Number.isSafeInteger(roll.dice) &&
    roll.dice >= 1 &&
    roll.dice <= MAX_ENTERED_ROLL_DICE &&
    Number.isSafeInteger(roll.sides) &&
    roll.sides >= 2 &&
    roll.sides <= MAX_ENTERED_ROLL_SIDES &&
    Number.isSafeInteger(modifier) &&
    modifier >= 0 &&
    modifier <= MAX_ENTERED_ROLL_MODIFIER
  );
}

function enteredRollMinimum(roll: ResourceEnteredRoll): number {
  return roll.dice + (roll.modifier ?? 0);
}

function enteredRollMaximum(roll: ResourceEnteredRoll): number {
  return roll.dice * roll.sides + (roll.modifier ?? 0);
}

function isValidDepletionOutcomes(
  outcomes: ReadonlyArray<ResourceDepletionOutcome>
): boolean {
  return outcomes.length <= 8;
}

function isValidDepletionRule(rule: NonNullable<CatalogueResourceSpec["onEmpty"]>) {
  if (rule.kind === "deterministic") {
    return isValidDepletionOutcomes(rule.outcomes);
  }
  if (rule.bands.length === 0) return false;
  const bands = [...rule.bands].sort((left, right) => left.min - right.min);
  let expectedMin = 1;
  for (const band of bands) {
    if (
      integer(band.min, 1, 20) === null ||
      integer(band.max, 1, 20) === null ||
      band.min !== expectedMin ||
      band.max < band.min ||
      !isValidDepletionOutcomes(band.outcomes)
    ) {
      return false;
    }
    expectedMin = band.max + 1;
  }
  return expectedMin === 21;
}

function isValidCatalogueResourceSpec(spec: CatalogueResourceSpec): boolean {
  if (!isValidItemResourceId(spec.id)) return false;
  if (!ITEM_RESOURCE_UNITS.includes(spec.unit)) return false;
  if (spec.capacity.kind === "fixed") {
    if (integer(spec.capacity.amount, 1) === null) return false;
  } else if (!isValidEnteredRoll(spec.capacity.roll)) {
    return false;
  }
  if (spec.initial.kind === "fixed") {
    if (integer(spec.initial.amount, 0) === null) return false;
    if (spec.capacity.kind === "fixed" && spec.initial.amount > spec.capacity.amount) {
      return false;
    }
  } else if (spec.initial.kind === "entered-roll") {
    if (!isValidEnteredRoll(spec.initial.roll)) return false;
  }
  const boundaries = new Set<string>();
  for (const recovery of spec.recoveries ?? []) {
    const trigger = conformResourceRecoveryTrigger(recovery.trigger);
    if (!trigger) return false;
    const boundary = recoveryKey(trigger);
    if (boundaries.has(boundary)) return false;
    boundaries.add(boundary);
    if (recovery.amount.kind === "fixed") {
      if (integer(recovery.amount.amount, 1) === null) return false;
    } else if (recovery.amount.kind === "entered-roll") {
      if (!isValidEnteredRoll(recovery.amount.roll)) return false;
    }
  }
  return spec.onEmpty === undefined || isValidDepletionRule(spec.onEmpty);
}

/**
 * One catalogue item's complete typed resource declaration — the immutable
 * rules side of every physical-item command, keyed by the catalogue `itemId`.
 */
export interface ResourceItemSpec {
  itemId: string;
  resources: ReadonlyArray<CatalogueResourceSpec>;
}

/** The physical address one command binds to: catalogue id + item copy. */
export interface ResourceItemBinding {
  srdId: string;
  instanceId?: string;
}

/** Validate one item's authored resource declarations as a closed set. */
export function isValidResourceItemSpec(item: ResourceItemSpec): boolean {
  if (!isValidItemResourceId(item.itemId) || item.resources.length === 0) return false;
  const ids = new Set<string>();
  for (const spec of item.resources) {
    if (!isValidCatalogueResourceSpec(spec) || ids.has(spec.id)) return false;
    ids.add(spec.id);
  }
  return true;
}

/** Structural guard for one canonical physical-resource address. */
export function isCanonicalItemResourceIdentity(identity: ItemResourceIdentity): boolean {
  return (
    isValidItemResourceId(identity.itemId) &&
    isValidItemResourceId(identity.instanceId) &&
    isValidItemResourceId(identity.resourceId) &&
    identity.key === makeItemResourceKey(identity.instanceId, identity.resourceId)
  );
}

/** Two identities address the same physical resource iff every field matches. */
export function sameItemResourceIdentity(
  a: ItemResourceIdentity,
  b: ItemResourceIdentity
): boolean {
  return (
    a.itemId === b.itemId &&
    a.instanceId === b.instanceId &&
    a.resourceId === b.resourceId &&
    a.key === b.key
  );
}

function decodeItemResourceDisposition(value: unknown): ItemResourceDisposition | null {
  return ITEM_RESOURCE_DISPOSITIONS.find((candidate) => candidate === value) ?? null;
}

function decodeCounterState(value: unknown): ItemResourceCounterState | null {
  if (!plainRecord(value) || Object.keys(value).length !== 3) return null;
  const capacity = integer(value.capacity, 0);
  const current = integer(value.current, 0);
  if (
    capacity === null ||
    current === null ||
    current > capacity ||
    typeof value.disabled !== "boolean"
  ) {
    return null;
  }
  return { capacity, current, disabled: value.disabled };
}

function decodeCounterMap(
  value: unknown
): Record<string, ItemResourceCounterState> | null {
  if (!plainRecord(value)) return null;
  const decoded: Record<string, ItemResourceCounterState> = {};
  for (const [resourceId, counterValue] of Object.entries(value)) {
    if (!isValidItemResourceId(resourceId)) return null;
    const counter = decodeCounterState(counterValue);
    if (!counter) return null;
    decoded[resourceId] = counter;
  }
  return decoded;
}

/** `undefined` is the closed failure; `null` is a legal empty causal head. */
function decodeCausalHead(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isValidOccurrenceId(value) ? value : undefined;
}

function decodeLogicalState(value: unknown): ItemResourceLogicalState | null {
  if (!plainRecord(value) || Object.keys(value).length !== 3) return null;
  const resources = decodeCounterMap(value.resources);
  const disposition = decodeItemResourceDisposition(value.disposition);
  const causalHead = decodeCausalHead(value.causalHead);
  if (!resources || !disposition || causalHead === undefined) return null;
  return { causalHead, disposition, resources };
}

const INTENT_INPUT_KEYS = {
  gain: ["capacityRoll", "initialRoll"],
  recover: ["capacityRoll", "initialRoll", "recoveryRoll"],
  spend: ["capacityRoll", "initialRoll", "depletionD20"],
} as const satisfies Record<ItemResourceTransitionIntent["kind"], readonly string[]>;

function decodeIntentInputs(
  kind: ItemResourceTransitionIntent["kind"],
  value: unknown
): Record<string, number> | null {
  if (!plainRecord(value)) return null;
  const allowed: readonly string[] = INTENT_INPUT_KEYS[kind];
  const inputs: Record<string, number> = {};
  for (const [key, entered] of Object.entries(value)) {
    if (entered === undefined) continue;
    if (!allowed.includes(key)) return null;
    const bounded =
      key === "depletionD20" ? integer(entered, 1, 20) : integer(entered, 0);
    if (bounded === null) return null;
    inputs[key] = bounded;
  }
  return inputs;
}

function decodeTransitionIntent(
  value: unknown,
  itemId: string,
  instanceId: string
): ItemResourceTransitionIntent | null {
  if (!plainRecord(value)) return null;
  const kind = value.kind;
  if (kind !== "spend" && kind !== "gain" && kind !== "recover") return null;
  const expectedKeys =
    kind === "recover"
      ? [
          "kind",
          "occurrenceId",
          "expectedRevision",
          "itemId",
          "instanceId",
          "resourceId",
          "trigger",
          "inputs",
        ]
      : [
          "kind",
          "occurrenceId",
          "expectedRevision",
          "itemId",
          "instanceId",
          "resourceId",
          "amount",
          "inputs",
        ];
  const presentKeys = normalizedObjectKeys(value);
  if (
    presentKeys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => presentKeys.includes(key))
  ) {
    return null;
  }
  const expectedRevision = integer(value.expectedRevision, 0);
  const inputs = decodeIntentInputs(kind, value.inputs);
  if (
    !isValidOccurrenceId(value.occurrenceId) ||
    expectedRevision === null ||
    value.itemId !== itemId ||
    value.instanceId !== instanceId ||
    !isValidItemResourceId(value.resourceId) ||
    inputs === null
  ) {
    return null;
  }
  const base = {
    expectedRevision,
    instanceId,
    itemId,
    occurrenceId: value.occurrenceId,
    resourceId: value.resourceId,
  };
  if (kind === "recover") {
    const trigger = conformResourceRecoveryTrigger(value.trigger);
    if (!trigger) return null;
    return { kind, ...base, trigger: { ...trigger }, inputs };
  }
  const amount = integer(value.amount, 1);
  if (amount === null) return null;
  return { kind, ...base, amount, inputs };
}

function decodeTransitionFingerprint(
  value: unknown,
  itemId: string,
  instanceId: string
): ItemResourceTransitionFingerprint | null {
  if (!plainRecord(value) || normalizedObjectKeys(value).length !== 3) return null;
  const intent = decodeTransitionIntent(value.intent, itemId, instanceId);
  const before = decodeLogicalState(value.before);
  const after = decodeLogicalState(value.after);
  return intent && before && after && after.causalHead === intent.occurrenceId
    ? { after, before, intent }
    : null;
}

function decodeLastTransition(
  value: unknown,
  state: ItemResourceState
): ItemResourceState["lastTransition"] | null {
  if (!plainRecord(value)) return null;
  const expectedRevision = integer(value.expectedRevision, 0);
  if (expectedRevision === null || expectedRevision !== state.revision - 1) return null;
  if (value.status === "applied") {
    if (normalizedObjectKeys(value).length !== 3) return null;
    const intent = decodeTransitionIntent(value.intent, state.itemId, state.instanceId);
    if (
      !intent ||
      intent.expectedRevision !== expectedRevision ||
      state.causalHead !== intent.occurrenceId
    ) {
      return null;
    }
    return { expectedRevision, intent, status: "applied" };
  }
  if (value.status !== "reverted" || normalizedObjectKeys(value).length !== 4) {
    return null;
  }
  if (!isValidOccurrenceId(value.occurrenceId)) return null;
  const original = decodeTransitionFingerprint(
    value.original,
    state.itemId,
    state.instanceId
  );
  if (
    !original ||
    original.intent.expectedRevision >= expectedRevision ||
    !deepEqual(
      {
        causalHead: state.causalHead,
        disposition: state.disposition,
        resources: state.resources,
      },
      original.before
    )
  ) {
    return null;
  }
  return {
    expectedRevision,
    occurrenceId: value.occurrenceId,
    original,
    status: "reverted",
  };
}

/**
 * Exact fail-closed decoder for one persisted whole-item resource state. It
 * needs no catalogue: identity binding, counter arithmetic, causal-head
 * coherence, and transition fingerprints are all internally checkable. Unknown
 * top-level fields are dropped; every nested record is exact.
 */
export function decodeItemResourceState(
  value: unknown,
  instanceId: string
): ItemResourceState | null {
  if (!plainRecord(value) || !isValidItemResourceId(instanceId)) return null;
  if (!isValidItemResourceId(value.itemId) || value.instanceId !== instanceId) {
    return null;
  }
  const revision = integer(value.revision, 0);
  const resources = decodeCounterMap(value.resources);
  const disposition = decodeItemResourceDisposition(value.disposition);
  const causalHead = decodeCausalHead(value.causalHead);
  if (revision === null || !resources || !disposition || causalHead === undefined) {
    return null;
  }
  const decoded: ItemResourceState = {
    causalHead,
    disposition,
    instanceId,
    itemId: value.itemId,
    resources,
    revision,
  };
  if (value.lastTransition === undefined) {
    return causalHead === null ? decoded : null;
  }
  const lastTransition = decodeLastTransition(value.lastTransition, decoded);
  if (!lastTransition) return null;
  decoded.lastTransition = lastTransition;
  return decoded;
}

function counterConformsToSpec(
  counter: ItemResourceCounterState,
  spec: CatalogueResourceSpec
): boolean {
  if (spec.capacity.kind === "fixed") return counter.capacity === spec.capacity.amount;
  return (
    counter.capacity >= enteredRollMinimum(spec.capacity.roll) &&
    counter.capacity <= enteredRollMaximum(spec.capacity.roll)
  );
}

function countersConformToItem(
  item: ResourceItemSpec,
  resources: Record<string, ItemResourceCounterState>
): boolean {
  return Object.entries(resources).every(([resourceId, counter]) => {
    const spec = item.resources.find((candidate) => candidate.id === resourceId);
    return spec !== undefined && counterConformsToSpec(counter, spec);
  });
}

/**
 * Catalogue-aware semantic validation of one decoded state: the state must
 * bind exactly to this catalogue item and physical copy, and every stored or
 * fingerprinted counter must be one the catalogue declares, with a capacity
 * the declaration can actually produce.
 */
export function isValidItemResourceState(
  item: ResourceItemSpec,
  ref: { srdId: string; instanceId: string },
  state: ItemResourceState
): boolean {
  if (!isValidResourceItemSpec(item) || item.itemId !== ref.srdId) return false;
  const decoded = decodeItemResourceState(state, ref.instanceId);
  if (!decoded || decoded.itemId !== item.itemId) return false;
  if (!countersConformToItem(item, decoded.resources)) return false;
  const transition = decoded.lastTransition;
  if (!transition) return true;
  const intent =
    transition.status === "applied" ? transition.intent : transition.original.intent;
  if (!item.resources.some((candidate) => candidate.id === intent.resourceId)) {
    return false;
  }
  if (transition.status === "reverted") {
    return (
      countersConformToItem(item, transition.original.before.resources) &&
      countersConformToItem(item, transition.original.after.resources)
    );
  }
  return true;
}

// ── Physical-item resource commands ─────────────────────────────────────────

/**
 * One table-entered fact the planner still needs before an operation can
 * exist. Rolls stay physical: the planner never invents a result, it asks.
 */
export type ResourceInputRequest =
  | {
      kind: "capacity-roll" | "initial-roll" | "recovery-roll";
      resourceId: string;
      roll: ResourceEnteredRoll;
      min: number;
      max: number;
    }
  | { kind: "depletion-d20"; resourceId: string; min: number; max: number };

/** The command language against one declared resource on one bound copy. */
export type ResourceCommand =
  | {
      kind: "spend";
      occurrenceId: string;
      expectedRevision: number;
      resourceId: string;
      amount: number;
      inputs: { capacityRoll?: number; initialRoll?: number; depletionD20?: number };
    }
  | {
      kind: "gain";
      occurrenceId: string;
      expectedRevision: number;
      resourceId: string;
      amount: number;
      inputs: { capacityRoll?: number; initialRoll?: number };
    }
  | {
      kind: "recover";
      occurrenceId: string;
      expectedRevision: number;
      resourceId: string;
      trigger: ResourceRecoveryTrigger;
      inputs: { capacityRoll?: number; initialRoll?: number; recoveryRoll?: number };
    };

/**
 * The planned whole-state CAS transition for one physical copy. `before` is
 * the exact observed state (`null` before first materialization); `after`
 * embeds the full intent so the operation stays self-verifying forever.
 */
export interface ItemResourceOperation {
  itemId: string;
  instanceId: string;
  before: ItemResourceState | null;
  after: ItemResourceState;
}

/** Player-facing facts of one planned forward command. */
export interface ResourceReceipt {
  itemId: string;
  instanceId: string;
  resourceId: string;
  resourceKey: ItemResourceKey;
  command: "spend" | "gain" | "recover";
  occurrenceId: string;
  before: number;
  after: number;
  /** Present only when this spend consumed the last unit and consulted d20 bands. */
  depletionOutcomes?: ReadonlyArray<ResourceDepletionOutcome>;
}

/** Player-facing facts of one planned semantic revert. */
export interface ResourceRevertReceipt {
  itemId: string;
  instanceId: string;
  resourceId: string;
  resourceKey: ItemResourceKey;
  command: "revert";
  occurrenceId: string;
  /** The committed occurrence this revert causally cancels. */
  revertedOccurrenceId: string;
  /** `null` when the counter returns to its unstored catalogue default. */
  before: number | null;
  after: number | null;
}

export type ResourcePlanResult =
  | { status: "planned"; operation: ItemResourceOperation; receipt: ResourceReceipt }
  | { status: "pending-input"; requests: ResourceInputRequest[] }
  | { status: "already-applied" }
  | { status: "rejected"; reason: ResourceRejection };

export type ResourceRevertPlanResult =
  | {
      status: "planned";
      operation: ItemResourceOperation;
      receipt: ResourceRevertReceipt;
    }
  | { status: "already-applied" }
  | { status: "rejected"; reason: ResourceRejection };

export type ResourceApplyResult =
  | { status: "applied"; state: ItemResourceState }
  | { status: "already-applied"; state: ItemResourceState }
  | { status: "conflict"; state?: ItemResourceState }
  | { status: "rejected"; state?: ItemResourceState };

function planRejected(reason: ResourceRejection): ResourcePlanResult {
  return { reason, status: "rejected" };
}

function rollInputRequest(
  kind: "capacity-roll" | "initial-roll" | "recovery-roll",
  resourceId: string,
  roll: ResourceEnteredRoll
): ResourceInputRequest {
  return {
    kind,
    max: enteredRollMaximum(roll),
    min: enteredRollMinimum(roll),
    resourceId,
    roll: {
      dice: roll.dice,
      sides: roll.sides,
      ...(roll.modifier === undefined ? {} : { modifier: roll.modifier }),
    },
  };
}

function logicalStateOf(state: ItemResourceState | null): ItemResourceLogicalState {
  return state === null
    ? { causalHead: null, disposition: "magical", resources: {} }
    : {
        causalHead: state.causalHead,
        disposition: state.disposition,
        resources: state.resources,
      };
}

interface ItemResourceDerivation {
  status: "derived";
  counter: ItemResourceCounterState;
  before: number;
  after: number;
  disposition: ItemResourceDisposition;
  depletionOutcomes: ReadonlyArray<ResourceDepletionOutcome> | null;
}

type ItemResourceDeriveResult =
  | ItemResourceDerivation
  | { status: "pending-input"; requests: ResourceInputRequest[] }
  | { status: "rejected"; reason: ResourceRejection };

/**
 * The one pure transition law: initialization from the catalogue plus entered
 * facts, then the intended spend/gain/recovery arithmetic, then depletion
 * bands. Planning, application, and revert verification all re-run it.
 */
function deriveItemResourceTransition(
  spec: CatalogueResourceSpec,
  logical: ItemResourceLogicalState,
  intent: ItemResourceTransitionIntent
): ItemResourceDeriveResult {
  if (logical.disposition !== "magical") {
    return { reason: "invalid-state", status: "rejected" };
  }
  const existing = logical.resources[intent.resourceId];
  let capacity: number;
  let current: number;
  let disabled: boolean;
  if (existing) {
    if (existing.disabled) return { reason: "disabled", status: "rejected" };
    if (!counterConformsToSpec(existing, spec)) {
      return { reason: "invalid-state", status: "rejected" };
    }
    capacity = existing.capacity;
    current = existing.current;
    disabled = existing.disabled;
  } else {
    const requests: ResourceInputRequest[] = [];
    if (spec.capacity.kind === "fixed") {
      capacity = spec.capacity.amount;
    } else {
      const roll = spec.capacity.roll;
      const entered = intent.inputs.capacityRoll;
      if (entered === undefined) {
        requests.push(rollInputRequest("capacity-roll", intent.resourceId, roll));
        capacity = enteredRollMaximum(roll);
      } else if (
        entered < enteredRollMinimum(roll) ||
        entered > enteredRollMaximum(roll)
      ) {
        return { reason: "invalid-observation", status: "rejected" };
      } else {
        capacity = entered;
      }
    }
    if (spec.initial.kind === "full") {
      current = capacity;
    } else if (spec.initial.kind === "empty") {
      current = 0;
    } else if (spec.initial.kind === "fixed") {
      current = spec.initial.amount;
    } else {
      const roll = spec.initial.roll;
      const entered = intent.inputs.initialRoll;
      if (entered === undefined) {
        requests.push(rollInputRequest("initial-roll", intent.resourceId, roll));
        current = 0;
      } else if (
        entered < enteredRollMinimum(roll) ||
        entered > enteredRollMaximum(roll)
      ) {
        return { reason: "invalid-observation", status: "rejected" };
      } else {
        current = entered;
      }
    }
    if (requests.length > 0) return { requests, status: "pending-input" };
    if (current > capacity) return { reason: "overfill", status: "rejected" };
    disabled = false;
  }

  let next: number;
  let disposition: ItemResourceDisposition = logical.disposition;
  let depletionOutcomes: ReadonlyArray<ResourceDepletionOutcome> | null = null;
  if (intent.kind === "spend") {
    if (intent.amount > current) return { reason: "overdraw", status: "rejected" };
    next = current - intent.amount;
    if (next === 0 && spec.onEmpty) {
      if (spec.onEmpty.kind === "deterministic") {
        depletionOutcomes = spec.onEmpty.outcomes;
      } else {
        const entered = intent.inputs.depletionD20;
        if (entered === undefined) {
          return {
            requests: [
              { kind: "depletion-d20", max: 20, min: 1, resourceId: intent.resourceId },
            ],
            status: "pending-input",
          };
        }
        const band = spec.onEmpty.bands.find(
          (candidate) => entered >= candidate.min && entered <= candidate.max
        );
        if (!band) return { reason: "invalid-spec", status: "rejected" };
        depletionOutcomes = band.outcomes;
      }
      for (const outcome of depletionOutcomes) {
        disposition = outcome.disposition;
      }
    }
  } else if (intent.kind === "gain") {
    next = current + intent.amount;
    if (next > capacity) return { reason: "overfill", status: "rejected" };
  } else {
    const recovery = (spec.recoveries ?? []).find(
      (candidate) => recoveryKey(candidate.trigger) === recoveryKey(intent.trigger)
    );
    if (!recovery) return { reason: "unsupported-boundary", status: "rejected" };
    let amount: number;
    if (recovery.amount.kind === "full") {
      amount = capacity - current;
    } else if (recovery.amount.kind === "fixed") {
      amount = recovery.amount.amount;
    } else {
      const roll = recovery.amount.roll;
      const entered = intent.inputs.recoveryRoll;
      if (entered === undefined) {
        return {
          requests: [rollInputRequest("recovery-roll", intent.resourceId, roll)],
          status: "pending-input",
        };
      }
      if (entered < enteredRollMinimum(roll) || entered > enteredRollMaximum(roll)) {
        return { reason: "invalid-observation", status: "rejected" };
      }
      amount = entered;
    }
    next = Math.min(current + amount, capacity);
  }
  return {
    after: next,
    before: current,
    counter: { capacity, current: next, disabled },
    depletionOutcomes,
    disposition,
    status: "derived",
  };
}

/** Rebuild the canonical intent from a caller command; null fails closed. */
function conformCommandIntent(
  command: ResourceCommand,
  itemId: string,
  instanceId: string
): ItemResourceTransitionIntent | null {
  const base = {
    expectedRevision: command.expectedRevision,
    inputs: command.inputs,
    instanceId,
    itemId,
    kind: command.kind,
    occurrenceId: command.occurrenceId,
    resourceId: command.resourceId,
  };
  const record: Record<string, unknown> =
    command.kind === "recover"
      ? { ...base, trigger: command.trigger }
      : { ...base, amount: command.amount };
  return decodeTransitionIntent(record, itemId, instanceId);
}

function commandOfIntent(intent: ItemResourceTransitionIntent): ResourceCommand {
  const base = {
    expectedRevision: intent.expectedRevision,
    occurrenceId: intent.occurrenceId,
    resourceId: intent.resourceId,
  };
  if (intent.kind === "recover") {
    return {
      kind: "recover",
      ...base,
      inputs: { ...intent.inputs },
      trigger: { ...intent.trigger },
    };
  }
  return intent.kind === "spend"
    ? { kind: "spend", ...base, amount: intent.amount, inputs: { ...intent.inputs } }
    : { kind: "gain", ...base, amount: intent.amount, inputs: { ...intent.inputs } };
}

/**
 * Plan one forward command against an observed whole-item state. Planning is
 * pure: it either returns the exact CAS operation plus receipt, asks for the
 * table facts it still needs, recognizes its own committed occurrence, or
 * fails closed.
 */
export function planResourceCommand(
  item: ResourceItemSpec,
  binding: ResourceItemBinding,
  state: ItemResourceState | undefined,
  command: ResourceCommand
): ResourcePlanResult {
  if (!isValidResourceItemSpec(item)) return planRejected("invalid-spec");
  const instanceId = binding.instanceId;
  if (binding.srdId !== item.itemId || !isValidItemResourceId(instanceId)) {
    return planRejected("invalid-command");
  }
  const intent = conformCommandIntent(command, item.itemId, instanceId);
  if (!intent) return planRejected("invalid-command");
  const spec = item.resources.find((candidate) => candidate.id === intent.resourceId);
  if (!spec) return planRejected("invalid-command");
  if (
    state !== undefined &&
    !isValidItemResourceState(item, { instanceId, srdId: item.itemId }, state)
  ) {
    return planRejected("invalid-state");
  }
  const lastTransition = state?.lastTransition;
  if (
    lastTransition?.status === "applied" &&
    lastTransition.intent.occurrenceId === intent.occurrenceId
  ) {
    return { status: "already-applied" };
  }
  if (intent.expectedRevision !== (state?.revision ?? 0)) {
    return planRejected("revision-conflict");
  }

  const before = state ?? null;
  const derivation = deriveItemResourceTransition(spec, logicalStateOf(before), intent);
  if (derivation.status !== "derived") return derivation;

  const after: ItemResourceState = {
    causalHead: intent.occurrenceId,
    disposition: derivation.disposition,
    instanceId,
    itemId: item.itemId,
    lastTransition: {
      expectedRevision: before?.revision ?? 0,
      intent,
      status: "applied",
    },
    resources: {
      ...(before?.resources ?? {}),
      [intent.resourceId]: derivation.counter,
    },
    revision: (before?.revision ?? 0) + 1,
  };
  const operation: ItemResourceOperation = {
    after: structuredClone(after),
    before: before === null ? null : structuredClone(before),
    instanceId,
    itemId: item.itemId,
  };
  const receipt: ResourceReceipt = {
    after: derivation.after,
    before: derivation.before,
    command: intent.kind,
    instanceId,
    itemId: item.itemId,
    occurrenceId: intent.occurrenceId,
    resourceId: intent.resourceId,
    resourceKey: makeItemResourceKey(instanceId, intent.resourceId),
    ...(derivation.depletionOutcomes === null
      ? {}
      : { depletionOutcomes: structuredClone(derivation.depletionOutcomes) }),
  };
  return { operation, receipt, status: "planned" };
}

/** True iff replaying the embedded intent over `before` reproduces `after`. */
function verifyAppliedOperation(
  item: ResourceItemSpec,
  operation: ItemResourceOperation
): boolean {
  const transition = operation.after.lastTransition;
  if (transition?.status !== "applied") return false;
  const intent = transition.intent;
  if (intent.itemId !== operation.itemId || intent.instanceId !== operation.instanceId) {
    return false;
  }
  const replay = planResourceCommand(
    item,
    { instanceId: operation.instanceId, srdId: operation.itemId },
    operation.before ?? undefined,
    commandOfIntent(intent)
  );
  return (
    replay.status === "planned" && deepEqual(replay.operation.after, operation.after)
  );
}

/** True iff the revert restores its fingerprint exactly and the fingerprint
 * itself re-derives under the live catalogue. */
function verifyRevertedOperation(
  item: ResourceItemSpec,
  operation: ItemResourceOperation
): boolean {
  const transition = operation.after.lastTransition;
  if (transition?.status !== "reverted") return false;
  const original = transition.original;
  const intent = original.intent;
  const before = operation.before;
  if (
    !before ||
    intent.itemId !== operation.itemId ||
    intent.instanceId !== operation.instanceId ||
    operation.after.revision !== before.revision + 1 ||
    transition.expectedRevision !== before.revision ||
    !deepEqual(logicalStateOf(before), original.after) ||
    !deepEqual(logicalStateOf(operation.after), original.before)
  ) {
    return false;
  }
  const spec = item.resources.find((candidate) => candidate.id === intent.resourceId);
  if (!spec) return false;
  const derivation = deriveItemResourceTransition(spec, original.before, intent);
  if (derivation.status !== "derived") return false;
  const expectedAfter: ItemResourceLogicalState = {
    causalHead: intent.occurrenceId,
    disposition: derivation.disposition,
    resources: {
      ...original.before.resources,
      [intent.resourceId]: derivation.counter,
    },
  };
  return deepEqual(expectedAfter, original.after);
}

/**
 * The one CAS application law shared by the store's single and batched
 * commits. It re-verifies the operation against the catalogue, then matches
 * the live state: exact `before` applies, exact `after` is the idempotent
 * retry, anything else is a conflict.
 */
export function applyResourceOperation(
  item: ResourceItemSpec,
  binding: ResourceItemBinding,
  state: ItemResourceState | undefined,
  operation: ItemResourceOperation
): ResourceApplyResult {
  const current = state ?? null;
  if (!isValidResourceItemSpec(item)) return { status: "rejected" };
  const instanceId = binding.instanceId;
  if (
    binding.srdId !== item.itemId ||
    !isValidItemResourceId(instanceId) ||
    operation.itemId !== item.itemId ||
    operation.instanceId !== instanceId
  ) {
    return { status: "rejected" };
  }
  const ref = { instanceId, srdId: item.itemId };
  if (
    (operation.before !== null &&
      !isValidItemResourceState(item, ref, operation.before)) ||
    !isValidItemResourceState(item, ref, operation.after)
  ) {
    return { status: "rejected" };
  }
  const transition = operation.after.lastTransition;
  const authentic =
    transition?.status === "applied"
      ? verifyAppliedOperation(item, operation)
      : transition?.status === "reverted"
        ? verifyRevertedOperation(item, operation)
        : false;
  if (!authentic) return { status: "rejected" };
  if (current !== null && deepEqual(current, operation.after)) {
    return { state: structuredClone(current), status: "already-applied" };
  }
  if (deepEqual(current, operation.before)) {
    return { state: structuredClone(operation.after), status: "applied" };
  }
  return {
    status: "conflict",
    ...(current === null ? {} : { state: structuredClone(current) }),
  };
}

/**
 * Plan the causal LIFO inverse of one committed operation against live state.
 * The revert restores the operation's exact logical `before` under a fresh
 * occurrence; the fingerprint it stores keeps the whole chain self-verifying.
 */
export function planResourceRevert(
  item: ResourceItemSpec,
  binding: ResourceItemBinding,
  state: ItemResourceState,
  operation: ItemResourceOperation,
  opts: { occurrenceId: string; expectedRevision: number }
): ResourceRevertPlanResult {
  if (!isValidResourceItemSpec(item))
    return { reason: "invalid-spec", status: "rejected" };
  const instanceId = binding.instanceId;
  if (
    binding.srdId !== item.itemId ||
    !isValidItemResourceId(instanceId) ||
    operation.itemId !== item.itemId ||
    operation.instanceId !== instanceId ||
    !isValidOccurrenceId(opts.occurrenceId) ||
    integer(opts.expectedRevision, 0) === null
  ) {
    return { reason: "invalid-command", status: "rejected" };
  }
  const ref = { instanceId, srdId: item.itemId };
  if (
    (operation.before !== null &&
      !isValidItemResourceState(item, ref, operation.before)) ||
    !isValidItemResourceState(item, ref, operation.after) ||
    operation.after.lastTransition?.status !== "applied" ||
    !verifyAppliedOperation(item, operation)
  ) {
    return { reason: "invalid-command", status: "rejected" };
  }
  const intent = operation.after.lastTransition.intent;
  if (opts.occurrenceId === intent.occurrenceId) {
    return { reason: "invalid-command", status: "rejected" };
  }
  if (!isValidItemResourceState(item, ref, state)) {
    return { reason: "invalid-state", status: "rejected" };
  }
  const stateTransition = state.lastTransition;
  if (
    stateTransition?.status === "reverted" &&
    stateTransition.occurrenceId === opts.occurrenceId
  ) {
    return { status: "already-applied" };
  }
  if (opts.expectedRevision !== state.revision) {
    return { reason: "revision-conflict", status: "rejected" };
  }
  if (
    state.causalHead !== intent.occurrenceId ||
    !deepEqual(logicalStateOf(state), logicalStateOf(operation.after))
  ) {
    return { reason: "invalid-state", status: "rejected" };
  }

  const restored = structuredClone(logicalStateOf(operation.before));
  const fingerprint: ItemResourceTransitionFingerprint = {
    after: structuredClone(logicalStateOf(operation.after)),
    before: structuredClone(restored),
    intent: structuredClone(intent),
  };
  const after: ItemResourceState = {
    causalHead: restored.causalHead,
    disposition: restored.disposition,
    instanceId,
    itemId: item.itemId,
    lastTransition: {
      expectedRevision: state.revision,
      occurrenceId: opts.occurrenceId,
      original: fingerprint,
      status: "reverted",
    },
    resources: restored.resources,
    revision: state.revision + 1,
  };
  const revertOperation: ItemResourceOperation = {
    after,
    before: structuredClone(state),
    instanceId,
    itemId: item.itemId,
  };
  const receipt: ResourceRevertReceipt = {
    after: restored.resources[intent.resourceId]?.current ?? null,
    before: operation.after.resources[intent.resourceId]?.current ?? null,
    command: "revert",
    instanceId,
    itemId: item.itemId,
    occurrenceId: opts.occurrenceId,
    resourceId: intent.resourceId,
    resourceKey: makeItemResourceKey(instanceId, intent.resourceId),
    revertedOccurrenceId: intent.occurrenceId,
  };
  return { operation: revertOperation, receipt, status: "planned" };
}
