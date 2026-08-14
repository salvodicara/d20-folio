/** Pure durable cursor and causal ledger for reviewed combat-effect programs. */

import type { CombatEffectAreaFact } from "@/data/types";
import type {
  CombatEffectCommandBatch,
  CombatEffectCommandLifecycleReceipt,
} from "@/lib/combat-effect-command";
import { conformCombatEffectAtomicReadSet } from "@/lib/combat-effect-atomic";

type JsonPrimitive = string | number | boolean | null;
type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

type LifecycleEvent = NonNullable<CombatEffectCommandLifecycleReceipt["events"]>[number];
type LifecycleConsequence =
  CombatEffectCommandLifecycleReceipt["auxiliaryConsequences"][number];

export interface CombatEffectLifecycleTally {
  id: string;
  value: number;
}

export interface CombatEffectLifecycleLayerState {
  id: string;
  state: "active" | "destroyed";
}

export interface CombatEffectLifecyclePhaseCursor {
  phaseId: string;
  nextOccurrence: number;
}

/** Exact program cursor after the current causal head. */
export interface CombatEffectLifecycleCursor {
  tallies: ReadonlyArray<CombatEffectLifecycleTally>;
  layerStates: ReadonlyArray<CombatEffectLifecycleLayerState>;
  areaStates: ReadonlyArray<CombatEffectAreaFact>;
  ended: boolean;
  phases: ReadonlyArray<CombatEffectLifecyclePhaseCursor>;
}

export interface CombatEffectLifecycleCommand {
  schema: 1;
  commandId: string;
  payloadIdentity: string;
  phaseId: string;
  occurrence: number;
  attempt: number;
  predecessorCommandId: string | null;
  causalState: "committed" | "undone";
  before: CombatEffectLifecycleCursor;
  after: CombatEffectLifecycleCursor;
  events: ReadonlyArray<LifecycleEvent>;
  auxiliaryConsequences: ReadonlyArray<LifecycleConsequence>;
}

export interface CombatEffectLifecycleOwnedEvent {
  commandId: string;
  event: LifecycleEvent;
}

export interface CombatEffectLifecycleOwnedConsequence {
  commandId: string;
  consequence: LifecycleConsequence;
}

/** One persisted runtime per occurrence + program + source identity. */
export interface CombatEffectLifecycleRuntime {
  schema: 1;
  occurrenceId: string;
  programId: string;
  sourceId: string;
  cursor: CombatEffectLifecycleCursor;
  headCommandId: string | null;
  commands: ReadonlyArray<CombatEffectLifecycleCommand>;
  events: ReadonlyArray<CombatEffectLifecycleOwnedEvent>;
  auxiliaryConsequences: ReadonlyArray<CombatEffectLifecycleOwnedConsequence>;
}

export type CombatEffectLifecycleRejection =
  | "invalid-runtime"
  | "invalid-batch"
  | "not-coordinator"
  | "invalid-transition"
  | "identity-conflict"
  | "duplicate-command"
  | "stale-command"
  | "head-conflict"
  | "occurrence-conflict"
  | "cursor-conflict"
  | "ended";

export type CombatEffectLifecycleResult =
  | { status: "applied"; runtime: Readonly<CombatEffectLifecycleRuntime> }
  | { status: "rejected"; reason: CombatEffectLifecycleRejection };

interface NormalizedLifecycle {
  occurrenceId: string;
  programId: string;
  phaseId: string;
  sourceId: string;
  occurrence: number;
  attempt: number;
  initialTallies: ReadonlyArray<CombatEffectLifecycleTally>;
  finalTallies: ReadonlyArray<CombatEffectLifecycleTally>;
  initialLayerStates: ReadonlyArray<CombatEffectLifecycleLayerState>;
  finalLayerStates: ReadonlyArray<CombatEffectLifecycleLayerState>;
  initialAreaStates: ReadonlyArray<CombatEffectAreaFact>;
  finalAreaStates: ReadonlyArray<CombatEffectAreaFact>;
  ended: boolean;
  events: ReadonlyArray<LifecycleEvent>;
  auxiliaryConsequences: ReadonlyArray<LifecycleConsequence>;
}

interface NormalizedBatch {
  commandId: string;
  payloadIdentity: string;
  direction: "forward" | "reverse";
  expectedCausalState: "available" | "committed" | "undone";
  nextCausalState: "available" | "committed" | "undone";
  lifecycle: NormalizedLifecycle;
}

const AREA_FACTS = new Set<CombatEffectAreaFact>([
  "difficult-terrain",
  "obscured",
  "ranged-weapon-impossible",
  "strong-wind",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function incrementableOccurrence(value: unknown): value is number {
  return nonNegativeInteger(value) && value < Number.MAX_SAFE_INTEGER;
}

function exactKeys(
  value: Record<string, unknown>,
  required: ReadonlyArray<string>,
  optional: ReadonlyArray<string> = []
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function plainJson(value: unknown, stack = new WeakSet<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || stack.has(value)) return false;
  stack.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid =
    Object.getOwnPropertySymbols(value).length === 0 &&
    (Array.isArray(value)
      ? Object.getPrototypeOf(value) === Array.prototype &&
        Object.keys(descriptors).length === value.length + 1 &&
        Object.hasOwn(descriptors, "length") &&
        Array.from(
          { length: value.length },
          (_, index) => descriptors[String(index)]
        ).every(
          (descriptor) =>
            descriptor !== undefined &&
            descriptor.enumerable &&
            "value" in descriptor &&
            plainJson(descriptor.value, stack)
        )
      : (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null) &&
        Object.entries(descriptors).every(
          ([key, descriptor]) =>
            key.length > 0 &&
            descriptor.enumerable &&
            "value" in descriptor &&
            plainJson(descriptor.value, stack)
        ));
  stack.delete(value);
  return valid;
}

function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const object = value as { readonly [key: string]: JsonValue };
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key] as JsonValue)])
    );
  }
  return value;
}

function frozen<T>(value: T): Readonly<T> {
  if (!plainJson(value))
    throw new TypeError("Combat-effect lifecycle must be JSON-plain");
  const result = canonical(value) as T;
  const freeze = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || Object.isFrozen(entry)) return;
    Object.freeze(entry);
    Object.values(entry).forEach(freeze);
  };
  freeze(result);
  return result;
}

function equal(left: unknown, right: unknown): boolean {
  return (
    plainJson(left) &&
    plainJson(right) &&
    JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
  );
}

function orderedUniqueIds(entries: ReadonlyArray<{ id: string }>): boolean {
  return entries.every((entry, index) => {
    if (!nonEmpty(entry.id) || index === 0) return nonEmpty(entry.id);
    const previous = entries[index - 1];
    return previous !== undefined && previous.id < entry.id;
  });
}

function validTallies(
  value: unknown
): value is ReadonlyArray<CombatEffectLifecycleTally> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ["id", "value"]) &&
        nonEmpty(entry.id) &&
        nonNegativeInteger(entry.value)
    ) &&
    orderedUniqueIds(value as ReadonlyArray<CombatEffectLifecycleTally>)
  );
}

function validLayerStates(
  value: unknown
): value is ReadonlyArray<CombatEffectLifecycleLayerState> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ["id", "state"]) &&
        nonEmpty(entry.id) &&
        (entry.state === "active" || entry.state === "destroyed")
    ) &&
    orderedUniqueIds(value as ReadonlyArray<CombatEffectLifecycleLayerState>)
  );
}

function validAreaStates(value: unknown): value is ReadonlyArray<CombatEffectAreaFact> {
  return (
    Array.isArray(value) &&
    value.every((fact) => AREA_FACTS.has(fact as CombatEffectAreaFact)) &&
    value.every((fact, index) => index === 0 || (value[index - 1] as string) < fact)
  );
}

function validPhases(
  value: unknown
): value is ReadonlyArray<CombatEffectLifecyclePhaseCursor> {
  if (!Array.isArray(value)) return false;
  const entries: ReadonlyArray<unknown> = value;
  let previous: string | null = null;
  for (const entry of entries) {
    if (
      !record(entry) ||
      !exactKeys(entry, ["phaseId", "nextOccurrence"]) ||
      !nonEmpty(entry.phaseId) ||
      !nonNegativeInteger(entry.nextOccurrence) ||
      entry.nextOccurrence <= 0 ||
      (previous !== null && previous >= entry.phaseId)
    ) {
      return false;
    }
    previous = entry.phaseId;
  }
  return true;
}

function validCursor(value: unknown): value is CombatEffectLifecycleCursor {
  return (
    record(value) &&
    exactKeys(value, ["tallies", "layerStates", "areaStates", "ended", "phases"]) &&
    validTallies(value.tallies) &&
    validLayerStates(value.layerStates) &&
    validAreaStates(value.areaStates) &&
    typeof value.ended === "boolean" &&
    validPhases(value.phases)
  );
}

function validTarget(value: unknown): boolean {
  return (
    record(value) && exactKeys(value, ["combatantId"]) && nonEmpty(value.combatantId)
  );
}

function validRecipient(value: unknown): boolean {
  return (
    record(value) &&
    ((value.kind === "source" &&
      exactKeys(value, ["kind", "id"]) &&
      nonEmpty(value.id)) ||
      (value.kind === "target" &&
        exactKeys(value, ["kind", "target"]) &&
        validTarget(value.target)))
  );
}

function validProvenance(
  value: unknown,
  identity: Pick<
    NormalizedLifecycle,
    "occurrenceId" | "programId" | "phaseId" | "occurrence"
  >
): boolean {
  return (
    record(value) &&
    exactKeys(value, [
      "occurrenceId",
      "programId",
      "phaseId",
      "stepId",
      "target",
      "instance",
      "iteration",
    ]) &&
    value.occurrenceId === identity.occurrenceId &&
    value.programId === identity.programId &&
    value.phaseId === identity.phaseId &&
    nonEmpty(value.stepId) &&
    (value.target === null || validTarget(value.target)) &&
    (value.instance === null || nonNegativeInteger(value.instance)) &&
    value.iteration === identity.occurrence
  );
}

function validEvent(
  value: unknown,
  identity: NormalizedLifecycle
): value is LifecycleEvent {
  if (!record(value) || !validProvenance(value.provenance, identity)) return false;
  if (value.kind === "layer") {
    return (
      exactKeys(value, [
        "kind",
        "provenance",
        "layerId",
        "stateKey",
        "before",
        "after",
      ]) &&
      nonEmpty(value.layerId) &&
      nonEmpty(value.stateKey) &&
      (value.before === "active" || value.before === "destroyed") &&
      (value.after === "active" || value.after === "destroyed")
    );
  }
  if (value.kind === "area-state") {
    return (
      exactKeys(
        value,
        ["kind", "provenance", "operation", "fact", "before", "after"],
        ["lifetime"]
      ) &&
      (value.operation === "apply" || value.operation === "remove") &&
      AREA_FACTS.has(value.fact as CombatEffectAreaFact) &&
      typeof value.before === "boolean" &&
      typeof value.after === "boolean" &&
      (value.lifetime === undefined || plainJson(value.lifetime))
    );
  }
  return (
    value.kind === "relocation-event" &&
    exactKeys(value, ["kind", "provenance", "recipient", "mode", "destination"]) &&
    validRecipient(value.recipient) &&
    (value.mode === "teleport" || value.mode === "plane-transfer") &&
    record(value.destination) &&
    ((value.destination.kind === "manual" && exactKeys(value.destination, ["kind"])) ||
      (value.destination.kind === "table" &&
        exactKeys(value.destination, ["kind", "inputId", "roll"]) &&
        nonEmpty(value.destination.inputId) &&
        plainJson(value.destination.roll)))
  );
}

function validConsequence(
  value: unknown,
  identity: NormalizedLifecycle
): value is LifecycleConsequence {
  if (!record(value) || !validProvenance(value.provenance, identity)) return false;
  return value.kind === "counter"
    ? exactKeys(
        value,
        ["kind", "provenance", "counterId", "before", "after"],
        ["stateKey"]
      ) &&
        nonEmpty(value.counterId) &&
        (value.stateKey === undefined || nonEmpty(value.stateKey)) &&
        nonNegativeInteger(value.before) &&
        nonNegativeInteger(value.after)
    : value.kind === "end-program" && exactKeys(value, ["kind", "provenance"]);
}

function entriesFromRecord(
  value: unknown
): ReadonlyArray<CombatEffectLifecycleTally> | null {
  if (
    !record(value) ||
    Object.entries(value).some(
      ([id, amount]) => !nonEmpty(id) || !nonNegativeInteger(amount)
    )
  ) {
    return null;
  }
  return Object.entries(value)
    .map(([id, amount]) => ({ id, value: amount as number }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function layersFromRecord(
  value: unknown
): ReadonlyArray<CombatEffectLifecycleLayerState> | null {
  if (
    !record(value) ||
    Object.entries(value).some(
      ([id, state]) => !nonEmpty(id) || (state !== "active" && state !== "destroyed")
    )
  ) {
    return null;
  }
  return Object.entries(value)
    .map(([id, state]) => ({ id, state: state as "active" | "destroyed" }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function areasFromReceipt(value: unknown): ReadonlyArray<CombatEffectAreaFact> | null {
  if (!Array.isArray(value)) return null;
  const areas: CombatEffectAreaFact[] = [];
  for (const fact of value as ReadonlyArray<unknown>) {
    if (typeof fact !== "string" || !AREA_FACTS.has(fact as CombatEffectAreaFact)) {
      return null;
    }
    areas.push(fact as CombatEffectAreaFact);
  }
  return new Set(areas).size === areas.length ? areas.sort() : null;
}

function sameIds(
  left: ReadonlyArray<{ id: string }>,
  right: ReadonlyArray<{ id: string }>
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry.id === right[index]?.id)
  );
}

function commandId(identity: {
  occurrenceId: string;
  programId: string;
  phaseId: string;
  sourceId: string;
  occurrence: number;
  attempt: number;
}): string {
  return [
    identity.occurrenceId,
    identity.programId,
    identity.phaseId,
    identity.sourceId,
    String(identity.occurrence),
    String(identity.attempt),
  ]
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function normalizeLifecycle(value: unknown): NormalizedLifecycle | null {
  if (
    !record(value) ||
    !exactKeys(
      value,
      [
        "occurrenceId",
        "programId",
        "phaseId",
        "sourceId",
        "occurrence",
        "attempt",
        "auxiliaryConsequences",
        "initialTallies",
        "finalTallies",
        "ended",
      ],
      [
        "events",
        "initialLayerStates",
        "finalLayerStates",
        "initialAreaStates",
        "finalAreaStates",
      ]
    ) ||
    !nonEmpty(value.occurrenceId) ||
    !nonEmpty(value.programId) ||
    !nonEmpty(value.phaseId) ||
    !nonEmpty(value.sourceId) ||
    !incrementableOccurrence(value.occurrence) ||
    !nonNegativeInteger(value.attempt) ||
    !Array.isArray(value.auxiliaryConsequences) ||
    (value.events !== undefined && !Array.isArray(value.events)) ||
    typeof value.ended !== "boolean"
  ) {
    return null;
  }
  const initialTallies = entriesFromRecord(value.initialTallies);
  const finalTallies = entriesFromRecord(value.finalTallies);
  const initialLayerStates = layersFromRecord(value.initialLayerStates ?? {});
  const finalLayerStates = layersFromRecord(value.finalLayerStates ?? {});
  const initialAreaStates = areasFromReceipt(value.initialAreaStates ?? []);
  const finalAreaStates = areasFromReceipt(value.finalAreaStates ?? []);
  if (
    !initialTallies ||
    !finalTallies ||
    !sameIds(initialTallies, finalTallies) ||
    !initialLayerStates ||
    !finalLayerStates ||
    !sameIds(initialLayerStates, finalLayerStates) ||
    !initialAreaStates ||
    !finalAreaStates ||
    (value.initialLayerStates === undefined) !== (value.finalLayerStates === undefined) ||
    (value.initialAreaStates === undefined) !== (value.finalAreaStates === undefined)
  ) {
    return null;
  }
  const normalized = {
    occurrenceId: value.occurrenceId,
    programId: value.programId,
    phaseId: value.phaseId,
    sourceId: value.sourceId,
    occurrence: value.occurrence,
    attempt: value.attempt,
    initialTallies,
    finalTallies,
    initialLayerStates,
    finalLayerStates,
    initialAreaStates,
    finalAreaStates,
    ended: value.ended,
    events: (value.events ?? []) as ReadonlyArray<LifecycleEvent>,
    auxiliaryConsequences:
      value.auxiliaryConsequences as ReadonlyArray<LifecycleConsequence>,
  } satisfies NormalizedLifecycle;
  if (
    !normalized.events.every((event) => validEvent(event, normalized)) ||
    !normalized.auxiliaryConsequences.every((consequence) =>
      validConsequence(consequence, normalized)
    ) ||
    !validAuthoredTransition(normalized)
  ) {
    return null;
  }
  return frozen(normalized);
}

function normalizeBatch(value: unknown): NormalizedBatch | null {
  if (
    !plainJson(value) ||
    !record(value) ||
    !exactKeys(value, [
      "schema",
      "commandId",
      "payloadIdentity",
      "adapterId",
      "surface",
      "direction",
      "expectedCausalState",
      "nextCausalState",
      "readSet",
      "readSetPolicy",
      "coordinatesLifecycle",
      "operations",
      "lifecycle",
    ]) ||
    value.schema !== 1 ||
    !nonEmpty(value.commandId) ||
    !nonEmpty(value.payloadIdentity) ||
    !nonEmpty(value.adapterId) ||
    (value.surface !== "local" && value.surface !== "shared") ||
    (value.direction !== "forward" && value.direction !== "reverse") ||
    !["available", "committed", "undone"].includes(value.expectedCausalState as string) ||
    !["available", "committed", "undone"].includes(value.nextCausalState as string) ||
    !["initial", "undo", "redo"].includes(value.readSetPolicy as string) ||
    (value.direction === "reverse"
      ? value.readSetPolicy !== "undo"
      : value.expectedCausalState === "available"
        ? value.readSetPolicy !== "initial"
        : value.readSetPolicy !== "redo") ||
    value.coordinatesLifecycle !== true ||
    !Array.isArray(value.operations)
  ) {
    return null;
  }
  const lifecycle = normalizeLifecycle(value.lifecycle);
  const readSet = lifecycle
    ? conformCombatEffectAtomicReadSet(value.readSet, {
        occurrenceId: lifecycle.occurrenceId,
        programId: lifecycle.programId,
        sourceId: lifecycle.sourceId,
      })
    : null;
  if (
    !lifecycle ||
    !readSet ||
    readSet.bindings.some((binding) => binding.owner.surface !== value.surface) ||
    value.commandId !== commandId(lifecycle)
  ) {
    return null;
  }
  return {
    commandId: value.commandId,
    payloadIdentity: value.payloadIdentity,
    direction: value.direction,
    expectedCausalState:
      value.expectedCausalState as NormalizedBatch["expectedCausalState"],
    nextCausalState: value.nextCausalState as NormalizedBatch["nextCausalState"],
    lifecycle,
  };
}

function talliesMap(
  entries: ReadonlyArray<CombatEffectLifecycleTally>
): Map<string, number> {
  return new Map(entries.map((entry) => [entry.id, entry.value]));
}

function layersMap(
  entries: ReadonlyArray<CombatEffectLifecycleLayerState>
): Map<string, "active" | "destroyed"> {
  return new Map(entries.map((entry) => [entry.id, entry.state]));
}

function sortedTallies(map: ReadonlyMap<string, number>): CombatEffectLifecycleTally[] {
  return [...map]
    .map(([id, value]) => ({ id, value }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function sortedLayers(
  map: ReadonlyMap<string, "active" | "destroyed">
): CombatEffectLifecycleLayerState[] {
  return [...map]
    .map(([id, state]) => ({ id, state }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function validAuthoredTransition(lifecycle: NormalizedLifecycle): boolean {
  const tallies = talliesMap(lifecycle.initialTallies);
  let ended = false;
  for (const consequence of lifecycle.auxiliaryConsequences) {
    if (consequence.kind === "end-program") {
      ended = true;
      continue;
    }
    const key = consequence.stateKey ?? consequence.counterId;
    if (tallies.get(key) !== consequence.before) return false;
    tallies.set(key, consequence.after);
  }
  if (
    ended !== lifecycle.ended ||
    !equal(sortedTallies(tallies), lifecycle.finalTallies)
  ) {
    return false;
  }
  const layers = layersMap(lifecycle.initialLayerStates);
  const areas = new Set(lifecycle.initialAreaStates);
  for (const event of lifecycle.events) {
    if (event.kind === "layer") {
      if (layers.get(event.stateKey) !== event.before) return false;
      layers.set(event.stateKey, event.after);
    } else if (event.kind === "area-state") {
      if (areas.has(event.fact) !== event.before) return false;
      if (event.operation === "apply") areas.add(event.fact);
      else areas.delete(event.fact);
      if (areas.has(event.fact) !== event.after) return false;
    }
  }
  return (
    equal(sortedLayers(layers), lifecycle.finalLayerStates) &&
    equal([...areas].sort(), lifecycle.finalAreaStates)
  );
}

function nextOccurrence(
  phases: ReadonlyArray<CombatEffectLifecyclePhaseCursor>,
  phaseId: string
): number {
  return phases.find((phase) => phase.phaseId === phaseId)?.nextOccurrence ?? 0;
}

function advancePhase(
  phases: ReadonlyArray<CombatEffectLifecyclePhaseCursor>,
  phaseId: string,
  occurrence: number
): CombatEffectLifecyclePhaseCursor[] {
  return [
    ...phases.filter((phase) => phase.phaseId !== phaseId),
    { phaseId, nextOccurrence: occurrence + 1 },
  ].sort((left, right) =>
    left.phaseId < right.phaseId ? -1 : left.phaseId > right.phaseId ? 1 : 0
  );
}

function validCommandTransition(command: CombatEffectLifecycleCommand): boolean {
  if (
    command.before.ended ||
    nextOccurrence(command.before.phases, command.phaseId) !== command.occurrence ||
    !equal(
      command.after.phases,
      advancePhase(command.before.phases, command.phaseId, command.occurrence)
    )
  ) {
    return false;
  }
  const identity: NormalizedLifecycle = {
    occurrenceId: "placeholder",
    programId: "placeholder",
    phaseId: command.phaseId,
    sourceId: "placeholder",
    occurrence: command.occurrence,
    attempt: command.attempt,
    initialTallies: command.before.tallies,
    finalTallies: command.after.tallies,
    initialLayerStates: command.before.layerStates,
    finalLayerStates: command.after.layerStates,
    initialAreaStates: command.before.areaStates,
    finalAreaStates: command.after.areaStates,
    ended: command.after.ended,
    events: command.events,
    auxiliaryConsequences: command.auxiliaryConsequences,
  };
  return validAuthoredTransition(identity);
}

function validCommand(
  value: unknown,
  runtime: Pick<CombatEffectLifecycleRuntime, "occurrenceId" | "programId" | "sourceId">
): value is CombatEffectLifecycleCommand {
  if (
    !record(value) ||
    !exactKeys(value, [
      "schema",
      "commandId",
      "payloadIdentity",
      "phaseId",
      "occurrence",
      "attempt",
      "predecessorCommandId",
      "causalState",
      "before",
      "after",
      "events",
      "auxiliaryConsequences",
    ]) ||
    value.schema !== 1 ||
    !nonEmpty(value.commandId) ||
    !nonEmpty(value.payloadIdentity) ||
    !nonEmpty(value.phaseId) ||
    !incrementableOccurrence(value.occurrence) ||
    !nonNegativeInteger(value.attempt) ||
    (value.predecessorCommandId !== null && !nonEmpty(value.predecessorCommandId)) ||
    (value.causalState !== "committed" && value.causalState !== "undone") ||
    !validCursor(value.before) ||
    !validCursor(value.after) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.auxiliaryConsequences)
  ) {
    return false;
  }
  const identity: NormalizedLifecycle = {
    occurrenceId: runtime.occurrenceId,
    programId: runtime.programId,
    phaseId: value.phaseId,
    sourceId: runtime.sourceId,
    occurrence: value.occurrence,
    attempt: value.attempt,
    initialTallies: value.before.tallies,
    finalTallies: value.after.tallies,
    initialLayerStates: value.before.layerStates,
    finalLayerStates: value.after.layerStates,
    initialAreaStates: value.before.areaStates,
    finalAreaStates: value.after.areaStates,
    ended: value.after.ended,
    events: value.events as ReadonlyArray<LifecycleEvent>,
    auxiliaryConsequences:
      value.auxiliaryConsequences as ReadonlyArray<LifecycleConsequence>,
  };
  return (
    value.commandId === commandId(identity) &&
    identity.events.every((event) => validEvent(event, identity)) &&
    identity.auxiliaryConsequences.every((consequence) =>
      validConsequence(consequence, identity)
    ) &&
    validCommandTransition(value as unknown as CombatEffectLifecycleCommand)
  );
}

function validOwnedEvent(
  value: unknown,
  commands: ReadonlyMap<string, CombatEffectLifecycleCommand>
): value is CombatEffectLifecycleOwnedEvent {
  return (
    record(value) &&
    exactKeys(value, ["commandId", "event"]) &&
    nonEmpty(value.commandId) &&
    commands.has(value.commandId) &&
    plainJson(value.event)
  );
}

function validOwnedConsequence(
  value: unknown,
  commands: ReadonlyMap<string, CombatEffectLifecycleCommand>
): value is CombatEffectLifecycleOwnedConsequence {
  return (
    record(value) &&
    exactKeys(value, ["commandId", "consequence"]) &&
    nonEmpty(value.commandId) &&
    commands.has(value.commandId) &&
    plainJson(value.consequence)
  );
}

function validRuntime(value: unknown): value is CombatEffectLifecycleRuntime {
  if (
    !plainJson(value) ||
    !record(value) ||
    !exactKeys(value, [
      "schema",
      "occurrenceId",
      "programId",
      "sourceId",
      "cursor",
      "headCommandId",
      "commands",
      "events",
      "auxiliaryConsequences",
    ]) ||
    value.schema !== 1 ||
    !nonEmpty(value.occurrenceId) ||
    !nonEmpty(value.programId) ||
    !nonEmpty(value.sourceId) ||
    !validCursor(value.cursor) ||
    (value.headCommandId !== null && !nonEmpty(value.headCommandId)) ||
    !Array.isArray(value.commands) ||
    value.commands.length === 0 ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.auxiliaryConsequences)
  ) {
    return false;
  }
  const identity = {
    occurrenceId: value.occurrenceId,
    programId: value.programId,
    sourceId: value.sourceId,
  };
  if (!value.commands.every((command) => validCommand(command, identity))) return false;
  const commands = value.commands as ReadonlyArray<CombatEffectLifecycleCommand>;
  const byId = new Map<string, CombatEffectLifecycleCommand>();
  const origin = commands[0]?.before;
  if (!origin) return false;
  for (const command of commands) {
    if (byId.has(command.commandId)) return false;
    const predecessor =
      command.predecessorCommandId === null
        ? null
        : byId.get(command.predecessorCommandId);
    if (
      (command.predecessorCommandId === null && !equal(command.before, origin)) ||
      (command.predecessorCommandId !== null &&
        (!predecessor || !equal(command.before, predecessor.after)))
    ) {
      return false;
    }
    byId.set(command.commandId, command);
  }
  if (
    !value.events.every((event) => validOwnedEvent(event, byId)) ||
    !value.auxiliaryConsequences.every((consequence) =>
      validOwnedConsequence(consequence, byId)
    )
  ) {
    return false;
  }
  const active: CombatEffectLifecycleCommand[] = [];
  let head = value.headCommandId === null ? null : byId.get(value.headCommandId);
  if (value.headCommandId !== null && !head) return false;
  const seen = new Set<string>();
  while (head) {
    if (seen.has(head.commandId)) return false;
    seen.add(head.commandId);
    active.push(head);
    head =
      head.predecessorCommandId === null ? null : byId.get(head.predecessorCommandId);
    if (head === undefined) return false;
  }
  active.reverse();
  const activeIds = new Set(active.map((command) => command.commandId));
  if (
    commands.some(
      (command) =>
        (command.causalState === "committed") !== activeIds.has(command.commandId)
    ) ||
    !equal(value.cursor, active.at(-1)?.after ?? origin)
  ) {
    return false;
  }
  const expectedEvents = active.flatMap((command) =>
    command.events.map((event) => ({ commandId: command.commandId, event }))
  );
  const expectedConsequences = active.flatMap((command) =>
    command.auxiliaryConsequences.map((consequence) => ({
      commandId: command.commandId,
      consequence,
    }))
  );
  return (
    equal(value.events, expectedEvents) &&
    equal(value.auxiliaryConsequences, expectedConsequences)
  );
}

/** Strict persisted-input boundary. Invalid or internally inconsistent data is rejected. */
export function conformCombatEffectLifecycle(
  value: unknown
): Readonly<CombatEffectLifecycleRuntime> | null {
  try {
    return validRuntime(value) ? frozen(value) : null;
  } catch {
    return null;
  }
}

/** Stable JSON for storage, hashing and defensive round-trip tests. */
export function serializeCombatEffectLifecycle(value: unknown): string {
  const runtime = conformCombatEffectLifecycle(value);
  if (!runtime) throw new TypeError("Invalid combat-effect lifecycle runtime");
  return JSON.stringify(runtime);
}

function programCursorMatches(
  cursor: CombatEffectLifecycleCursor,
  lifecycle: NormalizedLifecycle,
  side: "initial" | "final"
): boolean {
  return (
    equal(cursor.tallies, lifecycle[`${side}Tallies`]) &&
    equal(cursor.layerStates, lifecycle[`${side}LayerStates`]) &&
    equal(cursor.areaStates, lifecycle[`${side}AreaStates`]) &&
    (side === "initial" ? !cursor.ended : cursor.ended === lifecycle.ended)
  );
}

function lifecycleMatchesCommand(
  lifecycle: NormalizedLifecycle,
  command: CombatEffectLifecycleCommand,
  payloadIdentity: string
): boolean {
  return (
    command.payloadIdentity === payloadIdentity &&
    lifecycle.phaseId === command.phaseId &&
    lifecycle.occurrence === command.occurrence &&
    lifecycle.attempt === command.attempt &&
    programCursorMatches(command.before, lifecycle, "initial") &&
    programCursorMatches(command.after, lifecycle, "final") &&
    equal(command.events, lifecycle.events) &&
    equal(command.auxiliaryConsequences, lifecycle.auxiliaryConsequences)
  );
}

function transition(batch: NormalizedBatch): "commit" | "undo" | "redo" | null {
  if (
    batch.direction === "forward" &&
    batch.expectedCausalState === "available" &&
    batch.nextCausalState === "committed"
  ) {
    return "commit";
  }
  if (
    batch.direction === "reverse" &&
    batch.expectedCausalState === "committed" &&
    batch.nextCausalState === "undone"
  ) {
    return "undo";
  }
  return batch.direction === "forward" &&
    batch.expectedCausalState === "undone" &&
    batch.nextCausalState === "committed"
    ? "redo"
    : null;
}

function withCommandState(
  commands: ReadonlyArray<CombatEffectLifecycleCommand>,
  commandIdValue: string,
  causalState: "committed" | "undone"
): CombatEffectLifecycleCommand[] {
  return commands.map((command) =>
    command.commandId === commandIdValue ? { ...command, causalState } : command
  );
}

/**
 * Apply one coordinator batch to the durable lifecycle. This reducer performs no
 * persistence, mutation, localization, random generation or broad-state restore.
 */
export function reduceCombatEffectLifecycle(
  current: unknown,
  batchValue: Readonly<CombatEffectCommandBatch>
): CombatEffectLifecycleResult {
  const runtime = current === null ? null : conformCombatEffectLifecycle(current);
  if (current !== null && !runtime) {
    return { status: "rejected", reason: "invalid-runtime" };
  }
  try {
    if (!record(batchValue) || !batchValue.coordinatesLifecycle) {
      return { status: "rejected", reason: "not-coordinator" };
    }
  } catch {
    return { status: "rejected", reason: "invalid-batch" };
  }
  let batch: NormalizedBatch | null;
  try {
    batch = normalizeBatch(batchValue);
  } catch {
    batch = null;
  }
  if (!batch) return { status: "rejected", reason: "invalid-batch" };
  const operation = transition(batch);
  if (!operation) return { status: "rejected", reason: "invalid-transition" };
  const lifecycle = batch.lifecycle;
  if (
    runtime &&
    (runtime.occurrenceId !== lifecycle.occurrenceId ||
      runtime.programId !== lifecycle.programId ||
      runtime.sourceId !== lifecycle.sourceId)
  ) {
    return { status: "rejected", reason: "identity-conflict" };
  }
  const existing = runtime?.commands.find(
    (command) => command.commandId === batch.commandId
  );
  if (operation === "commit") {
    if (existing) {
      return {
        status: "rejected",
        reason:
          existing.payloadIdentity === batch.payloadIdentity &&
          existing.causalState === batch.nextCausalState
            ? "duplicate-command"
            : "stale-command",
      };
    }
    if (runtime?.cursor.ended) return { status: "rejected", reason: "ended" };
    const before: CombatEffectLifecycleCursor = runtime?.cursor ?? {
      tallies: lifecycle.initialTallies,
      layerStates: lifecycle.initialLayerStates,
      areaStates: lifecycle.initialAreaStates,
      ended: false,
      phases: [],
    };
    if (nextOccurrence(before.phases, lifecycle.phaseId) !== lifecycle.occurrence) {
      return { status: "rejected", reason: "occurrence-conflict" };
    }
    if (!programCursorMatches(before, lifecycle, "initial")) {
      return { status: "rejected", reason: "cursor-conflict" };
    }
    const after: CombatEffectLifecycleCursor = {
      tallies: lifecycle.finalTallies,
      layerStates: lifecycle.finalLayerStates,
      areaStates: lifecycle.finalAreaStates,
      ended: lifecycle.ended,
      phases: advancePhase(before.phases, lifecycle.phaseId, lifecycle.occurrence),
    };
    const command: CombatEffectLifecycleCommand = {
      schema: 1,
      commandId: batch.commandId,
      payloadIdentity: batch.payloadIdentity,
      phaseId: lifecycle.phaseId,
      occurrence: lifecycle.occurrence,
      attempt: lifecycle.attempt,
      predecessorCommandId: runtime?.headCommandId ?? null,
      causalState: "committed",
      before,
      after,
      events: lifecycle.events,
      auxiliaryConsequences: lifecycle.auxiliaryConsequences,
    };
    const next: CombatEffectLifecycleRuntime = {
      schema: 1,
      occurrenceId: lifecycle.occurrenceId,
      programId: lifecycle.programId,
      sourceId: lifecycle.sourceId,
      cursor: after,
      headCommandId: batch.commandId,
      commands: [...(runtime?.commands ?? []), command],
      events: [
        ...(runtime?.events ?? []),
        ...lifecycle.events.map((event) => ({ commandId: batch.commandId, event })),
      ],
      auxiliaryConsequences: [
        ...(runtime?.auxiliaryConsequences ?? []),
        ...lifecycle.auxiliaryConsequences.map((consequence) => ({
          commandId: batch.commandId,
          consequence,
        })),
      ],
    };
    return { status: "applied", runtime: frozen(next) };
  }
  if (!runtime || !existing) return { status: "rejected", reason: "stale-command" };
  if (existing.causalState === batch.nextCausalState) {
    return { status: "rejected", reason: "duplicate-command" };
  }
  if (
    existing.causalState !== batch.expectedCausalState ||
    !lifecycleMatchesCommand(lifecycle, existing, batch.payloadIdentity)
  ) {
    return { status: "rejected", reason: "stale-command" };
  }
  if (
    (operation === "undo" && runtime.headCommandId !== batch.commandId) ||
    (operation === "redo" && runtime.headCommandId !== existing.predecessorCommandId)
  ) {
    return { status: "rejected", reason: "head-conflict" };
  }
  const expectedCursor = operation === "undo" ? existing.after : existing.before;
  if (!equal(runtime.cursor, expectedCursor)) {
    return { status: "rejected", reason: "cursor-conflict" };
  }
  const next =
    operation === "undo"
      ? {
          ...runtime,
          cursor: existing.before,
          headCommandId: existing.predecessorCommandId,
          commands: withCommandState(runtime.commands, batch.commandId, "undone"),
          events: runtime.events.filter((entry) => entry.commandId !== batch.commandId),
          auxiliaryConsequences: runtime.auxiliaryConsequences.filter(
            (entry) => entry.commandId !== batch.commandId
          ),
        }
      : {
          ...runtime,
          cursor: existing.after,
          headCommandId: batch.commandId,
          commands: withCommandState(runtime.commands, batch.commandId, "committed"),
          events: [
            ...runtime.events,
            ...existing.events.map((event) => ({ commandId: batch.commandId, event })),
          ],
          auxiliaryConsequences: [
            ...runtime.auxiliaryConsequences,
            ...existing.auxiliaryConsequences.map((consequence) => ({
              commandId: batch.commandId,
              consequence,
            })),
          ],
        };
  return { status: "applied", runtime: frozen(next) };
}
