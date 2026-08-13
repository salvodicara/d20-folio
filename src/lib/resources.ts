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
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  conformIntegerExpression,
  evaluateIntegerExpression,
  type IntegerBindings,
} from "@/lib/integer-expression";
import { conformEntityRef, entityRefKey } from "@/lib/mechanics-reference-schema";
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
  type ResourceRejection,
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
  ResourceRejection,
  ResourceSelector,
  ResourceSpec,
  ResourceTerm,
  ResourceTransitionFacts,
  ResourceTransitionResult,
  RolledResourceCell,
} from "@/types/resource";

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

function rejected(reason: ResourceRejection): ResourceTransitionResult {
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
  if (spentResolution === null) return rejected("unrecorded-roll");
  const values = synchronizedCell.values.filter((_, index) => index !== operation.index);
  return applied(cell, { ...synchronizedCell, values }, operation, {
    recoveryResolution: null,
    spentResolution,
  });
}
