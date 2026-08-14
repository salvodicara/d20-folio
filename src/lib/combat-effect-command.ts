/**
 * Pure commit boundary for fully reviewed combat-effect plans.
 *
 * The interpreter owns rules and planning. This module only narrows its exact
 * receipts to mutation-owned compare-and-swap operations, routes them to an
 * injected local/shared atomic adapter, and coordinates causal replay. It never
 * rolls, localizes, parses prose, or restores an owner-wide snapshot.
 */

import { ALL_ABILITY_CODES, ALL_DAMAGE_SOURCES, type ConditionId } from "@/data/types";
import { DAMAGE_TYPES as CANONICAL_DAMAGE_TYPES } from "@/types/damage";
import type {
  CombatEffectConsequence,
  CombatEffectDamageComponent,
  CombatEffectDamageDefenseGroup,
  CombatEffectDamageResolution,
  CombatEffectEntityRef,
  CombatEffectGeneratedBy,
  CombatEffectGeneratedSource,
  CombatEffectMutation,
  CombatEffectMutationReceipt,
  CombatEffectOccurrenceChange,
  CombatEffectOccurrenceFingerprint,
  CombatEffectPlan,
  CombatEffectPersistentConsequences,
  CombatEffectProvenance,
} from "@/lib/combat-effect-program";
import {
  atomicOwnerKey,
  conformCombatEffectAtomicReadSet,
  isAtomicOccurrenceRuleIdentity,
  materializeDamageDefenses,
  type AtomicOccurrenceHead,
  type AtomicOwner,
  type AtomicRead,
  type AtomicResourceSnapshot,
  type AtomicZeroHpFloor,
  type CombatEffectAtomicReadSet,
} from "@/lib/combat-effect-atomic";
import { resolveCombatEffectAppliedComponents } from "@/lib/combat-effect-planning-state";
import { reducePcDamage } from "@/lib/combat-transition";
import { resolveCombatEffectGrants } from "@/lib/resolve-grant-sources";
import type { CombatantRef } from "@/types/combat-effect";
import {
  combatEffectOccurrenceChangeMatchesSnapshot,
  combatEffectOccurrenceFingerprint,
  combatEffectOccurrenceInitialHeadId,
  isCombatEffectMutationOwnedState,
  isCombatEffectPersistentConsequences,
  isCombatEffectStateView,
} from "@/lib/combat-effect-program";

type JsonPrimitive = string | number | boolean | null;
export type CombatEffectJson =
  | JsonPrimitive
  | ReadonlyArray<CombatEffectJson>
  | { readonly [key: string]: CombatEffectJson };

export type CombatEffectCommandSurface = "local" | "shared";
export type CombatEffectCausalState = "available" | "committed" | "undone";
export type CombatEffectCommandDirection = "forward" | "reverse";

export interface CombatEffectFieldValue {
  present: boolean;
  value?: CombatEffectJson;
}

/** One field owned by one authored mutation. Resource entries remain per-key. */
export interface CombatEffectOwnedChange {
  path: ReadonlyArray<string>;
  expected: CombatEffectFieldValue;
  next: CombatEffectFieldValue;
}

/** Exact production mutation receipt, without a broad owner-state snapshot. */
export interface CombatEffectCommandMutationReceipt {
  operationId: string;
  sequence: number;
  consequenceIndex: number;
  adapterId: string;
  surface: CombatEffectCommandSurface;
  recipient: CombatEffectEntityRef;
  provenance: CombatEffectProvenance;
  mutation: CombatEffectMutation;
  /** Exact earlier operation and observed rule fact that generated this internal
   * follow-up. Authored operations never carry this field. */
  generatedBy?: CombatEffectCommandGeneratedBy;
  changes: ReadonlyArray<CombatEffectOwnedChange>;
  appliedAmount?: number;
  appliedComponents?: ReadonlyArray<{ stepId: string; appliedAmount: number }>;
  persistentConsequences?: CombatEffectPersistentConsequences;
}

export interface CombatEffectCommandGeneratedBy extends CombatEffectGeneratedBy {
  parentOperationId: string;
}

export interface CombatEffectCommandReceipt {
  schema: 1;
  commandId: string;
  /** Collision-free canonical identity of every reviewed operation and cursor.
   * Stored once in the lifecycle command so undo/redo cannot swap a payload
   * behind the same phase/attempt id. */
  payloadIdentity: string;
  coordinatorAdapterId: string;
  coordinatorSurface: CombatEffectCommandSurface;
  occurrenceId: string;
  programId: string;
  phaseId: string;
  sourceId: string;
  occurrence: number;
  /** Zero-based reviewed attempt for this phase occurrence. Undo may be followed
   * by a corrected higher attempt without weakening duplicate-submit fencing. */
  attempt: number;
  /** Exact logical facts observed while producing this reviewed plan. */
  readSet: CombatEffectAtomicReadSet;
  operations: ReadonlyArray<CombatEffectCommandMutationReceipt>;
  auxiliaryConsequences: ReadonlyArray<
    Exclude<CombatEffectConsequence, CombatEffectMutationReceipt>
  >;
  events?: CombatEffectPlan["events"];
  initialTallies: Readonly<Record<string, number>>;
  finalTallies: Readonly<Record<string, number>>;
  initialLayerStates?: CombatEffectPlan["initialLayerStates"];
  finalLayerStates?: CombatEffectPlan["finalLayerStates"];
  initialAreaStates?: CombatEffectPlan["initialAreaStates"];
  finalAreaStates?: CombatEffectPlan["finalAreaStates"];
  ended: boolean;
}

export interface CombatEffectCommandLifecycleReceipt {
  occurrenceId: string;
  programId: string;
  phaseId: string;
  sourceId: string;
  occurrence: number;
  attempt: number;
  auxiliaryConsequences: CombatEffectCommandReceipt["auxiliaryConsequences"];
  events?: CombatEffectCommandReceipt["events"];
  initialTallies: CombatEffectCommandReceipt["initialTallies"];
  finalTallies: CombatEffectCommandReceipt["finalTallies"];
  initialLayerStates?: CombatEffectCommandReceipt["initialLayerStates"];
  finalLayerStates?: CombatEffectCommandReceipt["finalLayerStates"];
  initialAreaStates?: CombatEffectCommandReceipt["initialAreaStates"];
  finalAreaStates?: CombatEffectCommandReceipt["finalAreaStates"];
  ended: boolean;
}

/**
 * One adapter batch is an atomic CAS boundary. Implementations must compare the
 * causal state and every operation change immediately before writing, then
 * apply the ordered changes and causal transition together or apply nothing.
 */
export interface CombatEffectCommandBatch {
  schema: 1;
  commandId: string;
  payloadIdentity: string;
  adapterId: string;
  surface: CombatEffectCommandSurface;
  direction: CombatEffectCommandDirection;
  expectedCausalState: CombatEffectCausalState;
  nextCausalState: CombatEffectCausalState;
  /** The immutable original planning facts. The policy excludes only facts that
   * this same command necessarily advances while undoing or redoing itself. */
  readSet: CombatEffectAtomicReadSet;
  readSetPolicy: "initial" | "undo" | "redo";
  /** Exactly one adapter owns the durable program cursor and event ledger. */
  coordinatesLifecycle: boolean;
  lifecycle?: CombatEffectCommandLifecycleReceipt;
  operations: ReadonlyArray<CombatEffectCommandMutationReceipt>;
}

export type CombatEffectAdapterApplyResult =
  | { status: "applied"; operationIds: ReadonlyArray<string> }
  | {
      status: "rejected";
      reason: "stale-state" | "causal-conflict" | "failed";
      actualCausalState?: CombatEffectCausalState;
    };

/** Injected production boundary. No store, Firebase, or React dependency leaks in. */
export interface CombatEffectCommandAdapter {
  id: string;
  surface: CombatEffectCommandSurface;
  accepts(recipient: Readonly<CombatEffectEntityRef>): boolean;
  compareAndSwap(
    batch: Readonly<CombatEffectCommandBatch>
  ): CombatEffectAdapterApplyResult | Promise<CombatEffectAdapterApplyResult>;
}

export type CombatEffectCommandPreparation =
  | { status: "prepared"; receipt: CombatEffectCommandReceipt }
  | {
      status: "rejected";
      reason:
        | "invalid-plan"
        | "invalid-adapter"
        | "missing-adapter"
        | "ambiguous-adapter"
        | "split-transaction";
    };

export type CombatEffectCommandResult =
  | { status: "applied"; receipt: CombatEffectCommandReceipt }
  | {
      status: "rejected";
      reason:
        | "invalid-plan"
        | "invalid-receipt"
        | "invalid-adapter"
        | "missing-adapter"
        | "ambiguous-adapter"
        | "split-transaction"
        | "duplicate-command"
        | "stale-command"
        | "stale-state"
        | "adapter-failure";
      adapterId?: string;
    };

const TOP_LEVEL_FIELDS = [
  "hp",
  "tempHp",
  "stable",
  "deathSaves",
  "conditions",
  "conditionLifetimes",
  "standing",
  "standingLifetimes",
] as const;

const ABILITY_CODES = new Set<string>(ALL_ABILITY_CODES);
const DAMAGE_TYPES = new Set<string>(CANONICAL_DAMAGE_TYPES);
const DAMAGE_SOURCES = new Set<string>(ALL_DAMAGE_SOURCES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function safeNonNegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isJsonPlain(
  value: unknown,
  stack = new WeakSet<object>()
): value is CombatEffectJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (stack.has(value)) return false;
  stack.add(value);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    stack.delete(value);
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid = Array.isArray(value)
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
          isJsonPlain(descriptor.value, stack)
      )
    : (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null) &&
      Object.entries(descriptors).every(
        ([key, descriptor]) =>
          key.length > 0 &&
          descriptor.enumerable &&
          "value" in descriptor &&
          isJsonPlain(descriptor.value, stack)
      );
  stack.delete(value);
  return valid;
}

function canonical(value: CombatEffectJson): CombatEffectJson {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const record = value as { readonly [key: string]: CombatEffectJson };
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key] as CombatEffectJson)])
    );
  }
  return value;
}

function frozen<T>(value: T): Readonly<T> {
  if (!isJsonPlain(value))
    throw new TypeError("Combat-effect command data must be JSON-plain");
  const result = canonical(value) as T;
  const deepFreeze = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || Object.isFrozen(entry)) return;
    Object.freeze(entry);
    for (const child of Object.values(entry)) deepFreeze(child);
  };
  deepFreeze(result);
  return result;
}

function equal(left: unknown, right: unknown): boolean {
  return (
    isJsonPlain(left) &&
    isJsonPlain(right) &&
    JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
  );
}

function equalOptional(left: unknown, right: unknown): boolean {
  return left === undefined && right === undefined ? true : equal(left, right);
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

function validTarget(value: unknown): boolean {
  return (
    isRecord(value) && exactKeys(value, ["combatantId"]) && nonEmpty(value.combatantId)
  );
}

function validRecipient(value: unknown): value is CombatEffectEntityRef {
  if (!isRecord(value) || !nonEmpty(value.kind)) return false;
  return value.kind === "source"
    ? exactKeys(value, ["kind", "id"]) && nonEmpty(value.id)
    : value.kind === "target" &&
        exactKeys(value, ["kind", "target"]) &&
        validTarget(value.target);
}

function validProvenance(
  value: unknown,
  plan: Pick<CombatEffectPlan, "occurrenceId" | "programId" | "phaseId" | "occurrence">
): value is CombatEffectProvenance {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "occurrenceId",
      "programId",
      "phaseId",
      "stepId",
      "target",
      "instance",
      "iteration",
    ]) &&
    value.occurrenceId === plan.occurrenceId &&
    value.programId === plan.programId &&
    value.phaseId === plan.phaseId &&
    nonEmpty(value.stepId) &&
    (value.target === null || validTarget(value.target)) &&
    (value.instance === null || safeNonNegative(value.instance)) &&
    value.iteration === plan.occurrence
  );
}

function validSaveDisposition(value: unknown): value is "none" | "half" | "full" {
  return value === "none" || value === "half" || value === "full";
}

function validDamageResolution(value: unknown): value is CombatEffectDamageResolution {
  if (!isRecord(value) || !isJsonPlain(value)) return false;
  if (value.kind === "unconditional") {
    return (
      exactKeys(value, ["kind", "disposition", "criticalHit"]) &&
      value.disposition === "full" &&
      value.criticalHit === false
    );
  }
  if (
    value.kind !== "gate" ||
    !exactKeys(
      value,
      ["kind", "gateId", "gateKind", "result", "disposition", "criticalHit"],
      ["ability", "baselineSave"]
    ) ||
    !nonEmpty(value.gateId) ||
    (value.disposition !== "full" && value.disposition !== "half") ||
    typeof value.criticalHit !== "boolean"
  ) {
    return false;
  }
  const gateKind = value.gateKind;
  const validResult =
    gateKind === "attack"
      ? value.result === "hit" ||
        value.result === "miss" ||
        value.result === "critical-hit"
      : (gateKind === "save" || gateKind === "check") &&
        (value.result === "success" || value.result === "failure");
  if (!validResult || value.criticalHit !== (value.result === "critical-hit")) {
    return false;
  }
  const hasAbility = Object.hasOwn(value, "ability");
  if (
    hasAbility !== (gateKind === "save" || gateKind === "check") ||
    (hasAbility && !ABILITY_CODES.has(value.ability as string))
  ) {
    return false;
  }
  const hasBaseline = Object.hasOwn(value, "baselineSave");
  if (hasBaseline !== (gateKind === "save")) return false;
  if (hasBaseline) {
    if (
      !isRecord(value.baselineSave) ||
      !exactKeys(value.baselineSave, ["success", "failure"]) ||
      !validSaveDisposition(value.baselineSave.success) ||
      !validSaveDisposition(value.baselineSave.failure)
    ) {
      return false;
    }
    const outcome = value.result as "success" | "failure";
    if (value.baselineSave[outcome] !== value.disposition) return false;
  }
  return true;
}

function validDamageComponent(value: unknown): value is CombatEffectDamageComponent {
  return (
    isRecord(value) &&
    isJsonPlain(value) &&
    exactKeys(
      value,
      ["stepId", "amount", "damageType", "resolution"],
      ["damageSource"]
    ) &&
    nonEmpty(value.stepId) &&
    safeNonNegative(value.amount) &&
    DAMAGE_TYPES.has(value.damageType as string) &&
    (value.damageSource === undefined ||
      DAMAGE_SOURCES.has(value.damageSource as string)) &&
    validDamageResolution(value.resolution)
  );
}

function validDamagePacket(value: Record<string, unknown>): boolean {
  if (
    !exactKeys(
      value,
      ["kind", "packetId", "components", "defenseGroups", "provenance", "recipient"],
      ["damageSource"]
    ) ||
    !nonEmpty(value.packetId) ||
    (value.damageSource !== undefined &&
      !DAMAGE_SOURCES.has(value.damageSource as string)) ||
    !Array.isArray(value.components) ||
    value.components.length === 0 ||
    !value.components.every(validDamageComponent) ||
    !Array.isArray(value.defenseGroups)
  ) {
    return false;
  }
  const components = value.components as ReadonlyArray<CombatEffectDamageComponent>;
  const stepIds = new Set<string>();
  const expectedGroups = new Map<string, CombatEffectDamageDefenseGroup>();
  for (const component of components) {
    if (stepIds.has(component.stepId)) return false;
    if (component.damageSource !== value.damageSource) return false;
    stepIds.add(component.stepId);
    const prior = expectedGroups.get(component.damageType);
    expectedGroups.set(
      component.damageType,
      prior
        ? {
            ...prior,
            amount: prior.amount + component.amount,
            componentStepIds: [...prior.componentStepIds, component.stepId],
          }
        : {
            damageType: component.damageType,
            amount: component.amount,
            componentStepIds: [component.stepId],
          }
    );
  }
  return equal(value.defenseGroups, [...expectedGroups.values()]);
}

function validStateView(value: unknown): value is CombatEffectMutationReceipt["before"] {
  return isCombatEffectStateView(value);
}

function validTallies(value: unknown): value is Readonly<Record<string, number>> {
  return (
    isRecord(value) &&
    Object.entries(value).every(([id, tally]) => nonEmpty(id) && safeNonNegative(tally))
  );
}

function validLayerStates(
  value: unknown
): value is NonNullable<CombatEffectPlan["initialLayerStates"]> {
  return (
    isRecord(value) &&
    Object.entries(value).every(
      ([id, state]) => nonEmpty(id) && (state === "active" || state === "destroyed")
    )
  );
}

function validAreaStates(
  value: unknown
): value is NonNullable<CombatEffectPlan["initialAreaStates"]> {
  return (
    Array.isArray(value) && value.every(nonEmpty) && new Set(value).size === value.length
  );
}

function sameRecordKeys(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return equal(leftKeys, rightKeys);
}

function validCursorPair(
  initial: unknown,
  final: unknown,
  validator: (candidate: unknown) => boolean
): boolean {
  if (initial === undefined || final === undefined) {
    return initial === undefined && final === undefined;
  }
  return validator(initial) && validator(final);
}

function validEvent(
  value: unknown,
  plan: Pick<CombatEffectPlan, "occurrenceId" | "programId" | "phaseId" | "occurrence">
): boolean {
  if (!isRecord(value) || !validProvenance(value.provenance, plan)) return false;
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
      nonEmpty(value.fact) &&
      typeof value.before === "boolean" &&
      typeof value.after === "boolean" &&
      (value.lifetime === undefined || isJsonPlain(value.lifetime))
    );
  }
  if (value.kind !== "relocation-event") return false;
  return (
    exactKeys(value, ["kind", "provenance", "recipient", "mode", "destination"]) &&
    validRecipient(value.recipient) &&
    (value.mode === "teleport" || value.mode === "plane-transfer") &&
    isRecord(value.destination) &&
    ((value.destination.kind === "manual" && exactKeys(value.destination, ["kind"])) ||
      (value.destination.kind === "table" &&
        exactKeys(value.destination, ["kind", "inputId", "roll"]) &&
        nonEmpty(value.destination.inputId) &&
        isJsonPlain(value.destination.roll)))
  );
}

function validLifecycleTransition(value: {
  auxiliaryConsequences: ReadonlyArray<
    Exclude<CombatEffectConsequence, CombatEffectMutationReceipt>
  >;
  events?: CombatEffectPlan["events"];
  initialTallies: Readonly<Record<string, number>>;
  finalTallies: Readonly<Record<string, number>>;
  initialLayerStates?: CombatEffectPlan["initialLayerStates"];
  finalLayerStates?: CombatEffectPlan["finalLayerStates"];
  initialAreaStates?: CombatEffectPlan["initialAreaStates"];
  finalAreaStates?: CombatEffectPlan["finalAreaStates"];
  ended: boolean;
}): boolean {
  const tallies: Record<string, number> = { ...value.initialTallies };
  let ended = false;
  for (const consequence of value.auxiliaryConsequences) {
    if (consequence.kind === "end-program") {
      ended = true;
      continue;
    }
    const key = consequence.stateKey ?? consequence.counterId;
    if (!Object.hasOwn(tallies, key) || tallies[key] !== consequence.before) {
      return false;
    }
    tallies[key] = consequence.after;
  }
  if (ended !== value.ended || !equal(tallies, value.finalTallies)) return false;

  const layers =
    value.initialLayerStates === undefined ? undefined : { ...value.initialLayerStates };
  const areas =
    value.initialAreaStates === undefined ? undefined : new Set(value.initialAreaStates);
  for (const event of value.events ?? []) {
    if (event.kind === "layer") {
      if (!layers || layers[event.stateKey] !== event.before) return false;
      layers[event.stateKey] = event.after;
    } else if (event.kind === "area-state") {
      if (!areas || areas.has(event.fact) !== event.before) return false;
      if (event.operation === "apply") areas.add(event.fact);
      else areas.delete(event.fact);
      if (areas.has(event.fact) !== event.after) return false;
    }
  }
  if (layers !== undefined && !equal(layers, value.finalLayerStates)) {
    return false;
  }
  return (
    areas === undefined ||
    equal([...areas].sort(), [...(value.finalAreaStates ?? [])].sort())
  );
}

function validMutationReceipt(
  value: unknown,
  plan: Pick<CombatEffectPlan, "occurrenceId" | "programId" | "phaseId" | "occurrence">
): value is CombatEffectMutationReceipt {
  if (
    !isRecord(value) ||
    !isJsonPlain(value) ||
    !nonEmpty(value.kind) ||
    !validProvenance(value.provenance, plan) ||
    !validRecipient(value.recipient) ||
    !Object.hasOwn(value, "before") ||
    !Object.hasOwn(value, "after") ||
    !validStateView(value.before) ||
    !validStateView(value.after) ||
    value.before.maxHp !== value.after.maxHp
  ) {
    return false;
  }
  const mutation = mutationOnly(value as unknown as CombatEffectMutationReceipt);
  if (
    !validCommandMutation(mutation, plan) ||
    !isCombatEffectMutationOwnedState(mutation, value.before, value.after) ||
    !validCanonicalMutationTransition(
      value as unknown as Readonly<CombatEffectMutationReceipt>
    )
  ) {
    return false;
  }
  const hasPersistentConsequences = Object.hasOwn(value, "persistentConsequences");
  if (
    ((value.kind === "condition" || value.kind === "standing") &&
      !hasPersistentConsequences) ||
    (value.persistentConsequences !== undefined &&
      !isCombatEffectPersistentConsequences(value.persistentConsequences, mutation))
  ) {
    return false;
  }
  const numeric =
    ["damage", "heal", "temp-hp", "resource", "damage-reduction"].includes(value.kind) ||
    value.kind === "resolved-damage";
  if (numeric !== safeNonNegative(value.appliedAmount)) return false;
  const appliedAmount = value.appliedAmount as number;
  const stateDelta =
    value.before.hp + value.before.tempHp - value.after.hp - value.after.tempHp;
  const resourceDelta =
    mutation.kind === "resource"
      ? Math.abs(
          (value.after.resources[mutation.resourceId] ?? 0) -
            (value.before.resources[mutation.resourceId] ?? 0)
        )
      : 0;
  switch (value.kind) {
    case "damage":
      return (
        nonEmpty(value.packetId) &&
        Array.isArray(value.components) &&
        value.components.length > 0 &&
        Array.isArray(value.defenseGroups) &&
        Array.isArray(value.appliedComponents) &&
        value.appliedComponents.length === value.components.length &&
        value.appliedComponents.every(
          (entry, index) =>
            isRecord(entry) &&
            exactKeys(entry, ["stepId", "appliedAmount"]) &&
            entry.stepId ===
              (value.components as ReadonlyArray<{ stepId?: unknown }>)[index]?.stepId &&
            safeNonNegative(entry.appliedAmount)
        ) &&
        (value.appliedComponents as ReadonlyArray<{ appliedAmount: number }>).reduce(
          (sum, entry) => sum + entry.appliedAmount,
          0
        ) === appliedAmount &&
        stateDelta >= 0 &&
        stateDelta <= appliedAmount &&
        isJsonPlain(value)
      );
    case "resolved-damage":
      return (
        safeNonNegative(value.amount) &&
        nonEmpty(value.sourceEffectId) &&
        Array.isArray(value.transferPath) &&
        value.transferPath.length > 0 &&
        value.transferPath.every(nonEmpty) &&
        new Set(value.transferPath).size === value.transferPath.length &&
        value.transferPath.at(-1) === value.sourceEffectId &&
        appliedAmount === value.amount &&
        stateDelta >= 0 &&
        stateDelta <= appliedAmount &&
        !Object.hasOwn(value, "appliedComponents")
      );
    case "heal":
      return (
        safeNonNegative(value.amount) &&
        appliedAmount <= value.amount &&
        value.after.hp - value.before.hp === appliedAmount &&
        !Object.hasOwn(value, "appliedComponents")
      );
    case "temp-hp":
      return (
        safeNonNegative(value.amount) &&
        appliedAmount <= value.amount &&
        Math.max(0, value.after.tempHp - value.before.tempHp) === appliedAmount &&
        !Object.hasOwn(value, "appliedComponents")
      );
    case "condition":
      return (
        (value.operation === "apply" || value.operation === "remove") &&
        nonEmpty(value.condition) &&
        !Object.hasOwn(value, "appliedAmount")
      );
    case "standing":
      return (
        (value.operation === "start" || value.operation === "end") &&
        nonEmpty(value.effectId) &&
        !Object.hasOwn(value, "appliedAmount")
      );
    case "resource":
      return (
        (value.operation === "spend" || value.operation === "gain") &&
        nonEmpty(value.resourceId) &&
        safeNonNegative(value.amount) &&
        appliedAmount <= value.amount &&
        resourceDelta === appliedAmount &&
        !Object.hasOwn(value, "appliedComponents")
      );
    case "damage-reduction":
      return (
        safeNonNegative(value.amount) &&
        isRecord(value.triggeringDamage) &&
        safeNonNegative(value.triggeringDamage.amount) &&
        nonEmpty(value.triggeringDamage.sourceId) &&
        (value.damageTypes === undefined ||
          (Array.isArray(value.damageTypes) && value.damageTypes.every(nonEmpty))) &&
        appliedAmount <= value.amount &&
        appliedAmount <= value.triggeringDamage.amount &&
        !Object.hasOwn(value, "appliedComponents")
      );
    case "stabilize":
      return !Object.hasOwn(value, "appliedAmount");
    case "state-flag":
      return (
        value.operation === "deactivate" &&
        nonEmpty(value.stateKey) &&
        !Object.hasOwn(value, "appliedAmount") &&
        !Object.hasOwn(value, "appliedComponents")
      );
    default:
      return false;
  }
}

function ownerForRecipient(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  recipient: Readonly<CombatEffectEntityRef>
): AtomicOwner | null {
  const binding = readSet.bindings.find((candidate) => equal(candidate.ref, recipient));
  return binding?.owner ?? null;
}

function combatantMatchesOwner(
  combatant: Readonly<CombatantRef>,
  owner: Readonly<AtomicOwner>
): boolean {
  if (owner.kind === "monster") {
    return combatant.kind === "monster" && combatant.combatantId === owner.combatantId;
  }
  return (
    combatant.kind === "pc" &&
    combatant.combatantId === owner.combatantId &&
    combatant.memberUid === (owner.surface === "local" ? owner.uid : owner.memberUid) &&
    combatant.characterId === owner.characterId
  );
}

function occurrenceMaterializationsAreBound(
  plan: Readonly<CombatEffectPlan>,
  readSet: Readonly<CombatEffectAtomicReadSet>
): boolean {
  const sourceOwner = ownerForRecipient(readSet, {
    kind: "source",
    id: plan.sourceId,
  });
  if (!sourceOwner) return false;
  return plan.consequences.every((consequence) => {
    if (consequence.kind === "counter" || consequence.kind === "end-program") {
      return true;
    }
    return (consequence.persistentConsequences?.occurrenceChanges ?? []).every(
      (change) => {
        if (change.expectedHeadOpId !== null) {
          return change.materializedEffect === undefined;
        }
        const targetOwner = ownerForRecipient(readSet, change.recipient);
        const effect = change.materializedEffect;
        return (
          targetOwner !== null &&
          effect !== undefined &&
          isAtomicOccurrenceRuleIdentity(effect) &&
          combatantMatchesOwner(effect.actor, sourceOwner) &&
          combatantMatchesOwner(effect.target, targetOwner)
        );
      }
    );
  });
}

function ownerRead<AddressKind extends AtomicRead["address"]["kind"]>(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  owner: Readonly<AtomicOwner>,
  kind: AddressKind
): Extract<AtomicRead, { address: { kind: AddressKind } }> | null {
  const ownerId = atomicOwnerKey(owner);
  const matches = readSet.reads.filter(
    (read): read is Extract<AtomicRead, { address: { kind: AddressKind } }> =>
      atomicOwnerKey(read.owner) === ownerId && read.address.kind === kind
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function initialStateForOwner(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  owner: Readonly<AtomicOwner>
): CombatEffectMutationReceipt["before"] | null {
  const baseRead = ownerRead(readSet, owner, "base-state");
  const maxHpRead = ownerRead(readSet, owner, "max-hp");
  if (!baseRead || !maxHpRead) return null;
  const base = baseRead.expected;
  const resources = Object.fromEntries(
    Object.entries(base.resources).filter(
      (entry): entry is [string, number] => entry[1] !== null
    )
  );
  return {
    hp: base.hp,
    maxHp: maxHpRead.expected,
    tempHp: base.tempHp,
    stable: base.stable,
    deathSaves: base.deathSaves,
    conditions: base.conditions,
    conditionLifetimes: base.conditionLifetimes,
    standing: base.standing,
    standingLifetimes: base.standingLifetimes,
    resources,
    stateFlags: base.stateFlags,
  };
}

function initialLifecycleMatchesPlan(
  plan: Readonly<CombatEffectPlan>,
  readSet: Readonly<CombatEffectAtomicReadSet>
): boolean {
  const sourceOwner = ownerForRecipient(readSet, {
    kind: "source",
    id: plan.sourceId,
  });
  if (!sourceOwner) return false;
  const lifecycleReads = readSet.reads.filter(
    (read): read is Extract<AtomicRead, { address: { kind: "lifecycle-head" } }> =>
      atomicOwnerKey(read.owner) === atomicOwnerKey(sourceOwner) &&
      read.address.kind === "lifecycle-head" &&
      read.address.occurrenceId === plan.occurrenceId &&
      read.address.programId === plan.programId &&
      read.address.sourceId === plan.sourceId
  );
  if (lifecycleReads.length !== 1 || !lifecycleReads[0]) return false;
  const expected = lifecycleReads[0].expected;
  if (!expected.present) return plan.occurrence === 0;
  const cursor = expected.cursor;
  const tallies = Object.entries(plan.initialTallies)
    .map(([id, value]) => ({ id, value }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const layerStates = Object.entries(plan.initialLayerStates ?? {})
    .map(([id, state]) => ({ id, state }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const areaStates = [...(plan.initialAreaStates ?? [])].sort();
  const nextOccurrence =
    cursor.phases.find(({ phaseId }) => phaseId === plan.phaseId)?.nextOccurrence ?? 0;
  return (
    !cursor.ended &&
    nextOccurrence === plan.occurrence &&
    equal(cursor.tallies, tallies) &&
    equal(cursor.layerStates, layerStates) &&
    equal(cursor.areaStates, areaStates)
  );
}

function planReferencesAreBound(
  plan: Readonly<CombatEffectPlan>,
  readSet: Readonly<CombatEffectAtomicReadSet>
): boolean {
  const bound = (recipient: Readonly<CombatEffectEntityRef>): boolean =>
    ownerForRecipient(readSet, recipient) !== null;
  if (!bound({ kind: "source", id: plan.sourceId })) return false;
  for (const consequence of plan.consequences) {
    if (consequence.kind !== "counter" && consequence.kind !== "end-program") {
      if (!bound(consequence.recipient)) return false;
    }
    if (
      consequence.provenance.target !== null &&
      !bound({ kind: "target", target: consequence.provenance.target })
    ) {
      return false;
    }
  }
  return (
    occurrenceMaterializationsAreBound(plan, readSet) &&
    (plan.events ?? []).every((event) => {
      if (
        event.provenance.target !== null &&
        !bound({ kind: "target", target: event.provenance.target })
      ) {
        return false;
      }
      return event.kind !== "relocation-event" || bound(event.recipient);
    })
  );
}

function receiptReferencesAreBound(
  receipt: Readonly<CombatEffectCommandReceipt>,
  readSet: Readonly<CombatEffectAtomicReadSet>
): boolean {
  const bound = (recipient: Readonly<CombatEffectEntityRef>): boolean =>
    ownerForRecipient(readSet, recipient) !== null;
  const provenanceBound = (provenance: Readonly<CombatEffectProvenance>): boolean =>
    provenance.target === null || bound({ kind: "target", target: provenance.target });
  const sourceOwner = ownerForRecipient(readSet, {
    kind: "source",
    id: receipt.sourceId,
  });
  return (
    sourceOwner !== null &&
    receipt.operations.every((operation) => {
      const targetOwner = ownerForRecipient(readSet, operation.recipient);
      return (
        targetOwner !== null &&
        provenanceBound(operation.provenance) &&
        (operation.persistentConsequences?.occurrenceChanges ?? []).every((change) => {
          if (change.expectedHeadOpId !== null) {
            return change.materializedEffect === undefined;
          }
          const effect = change.materializedEffect;
          return (
            effect !== undefined &&
            isAtomicOccurrenceRuleIdentity(effect) &&
            combatantMatchesOwner(effect.actor, sourceOwner) &&
            combatantMatchesOwner(effect.target, targetOwner)
          );
        })
      );
    }) &&
    receipt.auxiliaryConsequences.every((consequence) =>
      provenanceBound(consequence.provenance)
    ) &&
    (receipt.events ?? []).every(
      (event) =>
        provenanceBound(event.provenance) &&
        (event.kind !== "relocation-event" || bound(event.recipient))
    )
  );
}

function resourceSnapshotForMutation(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  owner: Readonly<AtomicOwner>,
  resourceId: string
): AtomicResourceSnapshot | null {
  const ownerId = atomicOwnerKey(owner);
  const matches = readSet.reads.filter(
    (read): read is Extract<AtomicRead, { address: { kind: "resource" } }> =>
      atomicOwnerKey(read.owner) === ownerId &&
      read.address.kind === "resource" &&
      read.address.programResourceId === resourceId
  );
  return matches.length === 1 ? (matches[0]?.expected ?? null) : null;
}

function zeroHpFloorsForOwner(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  owner: Readonly<AtomicOwner>
): ReadonlyArray<AtomicZeroHpFloor> | null {
  const read = ownerRead(readSet, owner, "zero-hp-floors");
  return read?.expected ?? null;
}

function occurrenceHeadsForOwner(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  owner: Readonly<AtomicOwner>
): ReadonlyArray<AtomicOccurrenceHead> | null {
  const read = ownerRead(readSet, owner, "occurrence-heads");
  return read?.expected ?? null;
}

interface CommandOccurrenceState {
  effectId: string;
  headOpId: string;
  active: boolean;
  terminal: boolean;
  fingerprint: CombatEffectOccurrenceFingerprint;
  effect: AtomicOccurrenceHead["effect"] | null;
}

type CommandOccurrenceStates = Map<string, Map<string, CommandOccurrenceState>>;

function initialOccurrenceStates(
  readSet: Readonly<CombatEffectAtomicReadSet>
): CommandOccurrenceStates {
  const result: CommandOccurrenceStates = new Map();
  for (const binding of readSet.bindings) {
    const ownerId = atomicOwnerKey(binding.owner);
    if (result.has(ownerId)) continue;
    const heads = occurrenceHeadsForOwner(readSet, binding.owner) ?? [];
    result.set(
      ownerId,
      new Map(
        heads.map((head) => [
          head.effectId,
          {
            effectId: head.effectId,
            headOpId: head.headOpId,
            active: head.active,
            terminal: head.terminal,
            fingerprint: combatEffectOccurrenceFingerprint(head.effect),
            effect: head.effect,
          },
        ])
      )
    );
  }
  return result;
}

function createdOccurrenceFingerprint(
  change: Readonly<CombatEffectOccurrenceChange>
): CombatEffectOccurrenceFingerprint | null {
  if (change.expectedHeadOpId !== null || !change.descriptor) return null;
  const operationId = combatEffectOccurrenceInitialHeadId(change.effectId);
  return {
    programOwner: {
      occurrenceId: change.provenance.occurrenceId,
      programId: change.provenance.programId,
      phaseId: change.provenance.phaseId,
      stepId: change.provenance.stepId,
      operationId,
      instance: change.provenance.instance,
      iteration: change.provenance.iteration,
    },
    payload:
      change.descriptor.kind === "condition"
        ? { kind: "condition", conditionId: change.descriptor.condition }
        : { kind: "program-standing", effectId: change.descriptor.effectId },
  };
}

function validateAndApplyOccurrenceChanges(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  states: CommandOccurrenceStates,
  recipient: Readonly<CombatEffectEntityRef>,
  persistent: Readonly<CombatEffectPersistentConsequences> | undefined
): boolean {
  if (!persistent) return true;
  const operationOwner = ownerForRecipient(readSet, recipient);
  if (!operationOwner) return false;
  const operationOwnerId = atomicOwnerKey(operationOwner);
  for (const change of persistent.occurrenceChanges) {
    const changeOwner = ownerForRecipient(readSet, change.recipient);
    if (!changeOwner || atomicOwnerKey(changeOwner) !== operationOwnerId) return false;
    const byId = states.get(operationOwnerId);
    if (!byId) return false;
    const current = byId.get(change.effectId) ?? null;
    if (
      current?.terminal ||
      !combatEffectOccurrenceChangeMatchesSnapshot(
        change,
        current === null
          ? null
          : {
              effectId: current.effectId,
              headOpId: current.headOpId,
              active: current.active,
              terminal: current.terminal,
              fingerprint: current.fingerprint,
            }
      )
    ) {
      return false;
    }
    if (current === null) {
      const fingerprint = createdOccurrenceFingerprint(change);
      if (!fingerprint) return false;
      byId.set(change.effectId, {
        effectId: change.effectId,
        headOpId: combatEffectOccurrenceInitialHeadId(change.effectId),
        active: true,
        terminal: false,
        fingerprint,
        effect: null,
      });
      continue;
    }
    byId.set(change.effectId, {
      ...current,
      // A following change cannot legitimately predict this adapter-authored
      // append head from the reviewed plan, so make reuse fail closed.
      headOpId: `advanced:${change.effectId}`,
      active: change.active,
      // Program-authored deactivation is a reversible set-active append. A
      // terminal revoke snapshot is rejected above.
      terminal: false,
    });
  }
  return true;
}

function damageReceiptMatchesReadSet(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  states: Readonly<CommandOccurrenceStates>,
  receipt: Readonly<CombatEffectMutationReceipt>
): boolean {
  if (receipt.kind !== "damage") return true;
  const owner = ownerForRecipient(readSet, receipt.recipient);
  if (!owner) return false;
  const defenseRead = ownerRead(readSet, owner, "damage-defenses");
  if (!defenseRead) return false;
  const persistentEffects = [
    ...(states.get(atomicOwnerKey(owner))?.values() ?? []),
  ].flatMap((state) =>
    state.active && !state.terminal && state.effect !== null ? [state.effect] : []
  );
  try {
    const defenses = materializeDamageDefenses(defenseRead.expected);
    if (!defenses) return false;
    const appliedComponents = resolveCombatEffectAppliedComponents(
      receipt,
      defenses,
      persistentEffects
    );
    return (
      equal(appliedComponents, receipt.appliedComponents) &&
      appliedComponents.reduce((sum, component) => sum + component.appliedAmount, 0) ===
        receipt.appliedAmount
    );
  } catch {
    return false;
  }
}

interface CanonicalDamageExpectation {
  /** Exact pre-parent facts that authorize each deterministic follow-up. */
  generated: ReadonlyMap<string, CombatEffectGeneratedSource>;
}

function generatedExpectationKey(source: Readonly<CombatEffectGeneratedSource>): string {
  return source.kind === "state-flag"
    ? `state:${source.stateKey}`
    : `effect:${source.effect.id}`;
}

function canonicalDamageExpectation(
  readSet: Readonly<CombatEffectAtomicReadSet>,
  states: Readonly<CommandOccurrenceStates>,
  receipt: Readonly<CombatEffectMutationReceipt>
): CanonicalDamageExpectation | null {
  try {
    if (receipt.kind !== "damage" && receipt.kind !== "resolved-damage") return null;
    if (!safeNonNegative(receipt.appliedAmount)) return null;
    if (!damageReceiptMatchesReadSet(readSet, states, receipt)) return null;
    const owner = ownerForRecipient(readSet, receipt.recipient);
    if (!owner) return null;
    const occurrenceStates = [...(states.get(atomicOwnerKey(owner))?.values() ?? [])];
    const activeEffects = occurrenceStates.flatMap((state) =>
      state.active && !state.terminal && state.effect !== null ? [state.effect] : []
    );
    const floors = zeroHpFloorsForOwner(readSet, owner);
    if (!floors) return null;
    const transition = reducePcDamage({
      state: {
        hp: {
          current: receipt.before.hp,
          temp: receipt.before.tempHp,
          max: receipt.before.maxHp,
        },
        conditions: receipt.before.conditions,
        deathSaves: receipt.before.deathSaves,
      },
      intake: { stage: "resolved", amount: receipt.appliedAmount },
      ...(damageIsCritical(receipt) ? { crit: true } : {}),
      persistentEffects: activeEffects,
      stateZeroHpFloors: floors.filter(
        ({ stateKey }) => receipt.before.stateFlags[stateKey] === true
      ),
    });
    const conditions = transition.state.conditions.map(
      (condition) => condition as ConditionId
    );
    const conditionLifetimes = Object.fromEntries(
      conditions.map((condition) => [
        condition,
        receipt.before.conditionLifetimes[condition] ?? null,
      ])
    );
    const expectedAfter: CombatEffectMutationReceipt["after"] = {
      ...receipt.before,
      hp: transition.state.hp.current,
      tempHp: transition.state.hp.temp,
      stable:
        receipt.appliedAmount > 0 &&
        (receipt.before.hp === 0 || transition.crossedZero || transition.instantDeath)
          ? false
          : receipt.before.stable,
      deathSaves: transition.state.deathSaves,
      conditions,
      conditionLifetimes,
    };
    if (!equal(receipt.after, expectedAfter)) return null;
    const consumed = [...transition.consumedEffectIds].sort();
    const supplied = [...(receipt.persistentConsequences?.occurrenceChanges ?? [])]
      .map(({ effectId }) => effectId)
      .sort();
    if (
      !equal(consumed, supplied) ||
      (consumed.length === 0) !== (receipt.persistentConsequences === undefined)
    ) {
      return null;
    }

    const generated = new Map<string, CombatEffectGeneratedSource>();
    for (const stateKey of transition.consumedStateKeys) {
      const floor = floors.find((candidate) => candidate.stateKey === stateKey);
      if (!floor || receipt.before.stateFlags[stateKey] !== true) return null;
      const source: CombatEffectGeneratedSource = {
        kind: "state-flag",
        recipient: receipt.recipient,
        stateKey,
        expectedActive: true,
        hitPoints: floor.hitPoints,
      };
      const key = generatedExpectationKey(source);
      if (generated.has(key)) return null;
      generated.set(key, source);
    }
    const transferPath = receipt.kind === "resolved-damage" ? receipt.transferPath : [];
    for (const transfer of transition.transfers) {
      if (transferPath.includes(transfer.effectId)) continue;
      const occurrence = occurrenceStates.find(
        (candidate) => candidate.effectId === transfer.effectId
      );
      if (
        !occurrence ||
        !occurrence.active ||
        occurrence.terminal ||
        occurrence.effect === null
      ) {
        return null;
      }
      const source: CombatEffectGeneratedSource = {
        kind: "effect-occurrence",
        recipient: receipt.recipient,
        effect: occurrence.effect,
        expectedHeadOpId: occurrence.headOpId,
        expectedActive: true,
      };
      const key = generatedExpectationKey(source);
      if (generated.has(key)) return null;
      generated.set(key, source);
    }
    return { generated };
  } catch {
    return null;
  }
}

function conditionDelta(
  before: ReadonlyArray<string>,
  after: ReadonlyArray<string>
): { added: ReadonlyArray<string>; removed: ReadonlyArray<string> } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((condition) => !beforeSet.has(condition)),
    removed: before.filter((condition) => !afterSet.has(condition)),
  };
}

function combatantMatchesRecipient(
  combatant: Readonly<
    Extract<CombatEffectGeneratedSource, { kind: "effect-occurrence" }>["effect"][
      | "actor"
      | "target"]
  >,
  recipient: Readonly<CombatEffectEntityRef>
): boolean {
  const combatantId =
    recipient.kind === "source" ? recipient.id : recipient.target.combatantId;
  return combatant.combatantId === combatantId;
}

function validGeneratedSource(value: unknown): value is CombatEffectGeneratedSource {
  if (!isRecord(value) || !isJsonPlain(value) || !nonEmpty(value.kind)) return false;
  if (value.kind === "state-flag") {
    return (
      exactKeys(value, [
        "kind",
        "recipient",
        "stateKey",
        "expectedActive",
        "hitPoints",
      ]) &&
      validRecipient(value.recipient) &&
      nonEmpty(value.stateKey) &&
      value.expectedActive === true &&
      safeNonNegative(value.hitPoints) &&
      value.hitPoints > 0
    );
  }
  return (
    value.kind === "effect-occurrence" &&
    exactKeys(value, [
      "kind",
      "recipient",
      "effect",
      "expectedHeadOpId",
      "expectedActive",
    ]) &&
    validRecipient(value.recipient) &&
    isAtomicOccurrenceRuleIdentity(value.effect) &&
    nonEmpty(value.expectedHeadOpId) &&
    value.expectedActive === true
  );
}

function generatedMutation(value: Readonly<CombatEffectMutationReceipt>): boolean {
  return value.kind === "state-flag" || value.kind === "resolved-damage";
}

function parentDamageReceipt(
  value: CombatEffectMutationReceipt | undefined
): value is Extract<CombatEffectMutationReceipt, { kind: "damage" | "resolved-damage" }> {
  return value?.kind === "damage" || value?.kind === "resolved-damage";
}

function validPlanGeneratedLineage(
  consequence: Readonly<CombatEffectMutationReceipt>,
  consequenceIndex: number,
  priorByIndex: ReadonlyMap<number, CombatEffectMutationReceipt>,
  readSet: Readonly<CombatEffectAtomicReadSet>
): boolean {
  if (!generatedMutation(consequence)) {
    return !Object.hasOwn(consequence, "generatedBy");
  }
  const lineage = consequence.generatedBy;
  if (
    !isRecord(lineage) ||
    !exactKeys(lineage, ["parentConsequenceIndex", "source"]) ||
    !safeNonNegative(lineage.parentConsequenceIndex) ||
    lineage.parentConsequenceIndex >= consequenceIndex ||
    !validGeneratedSource(lineage.source)
  ) {
    return false;
  }
  const parent = priorByIndex.get(lineage.parentConsequenceIndex);
  if (!parentDamageReceipt(parent) || !equal(parent.provenance, consequence.provenance)) {
    return false;
  }
  const source = lineage.source;
  if (consequence.kind === "state-flag") {
    const sourceOwner = ownerForRecipient(readSet, source.recipient);
    const floor =
      source.kind === "state-flag" && sourceOwner
        ? zeroHpFloorsForOwner(readSet, sourceOwner)?.find(
            (candidate) => candidate.stateKey === source.stateKey
          )
        : undefined;
    return (
      source.kind === "state-flag" &&
      floor?.hitPoints === source.hitPoints &&
      consequence.operation === "deactivate" &&
      source.stateKey === consequence.stateKey &&
      equal(source.recipient, parent.recipient) &&
      equal(source.recipient, consequence.recipient) &&
      parent.after.stateFlags[source.stateKey] === true &&
      parent.after.hp === source.hitPoints &&
      consequence.before.stateFlags[source.stateKey] === true &&
      consequence.after.stateFlags[source.stateKey] === false
    );
  }
  if (consequence.kind !== "resolved-damage") return false;
  if (source.kind !== "effect-occurrence") return false;
  let transfersDamage: boolean;
  try {
    transfersDamage = resolveCombatEffectGrants(source.effect).some(
      (grant) => grant.type === "damage-transfer"
    );
  } catch {
    return false;
  }
  const transferPath: ReadonlyArray<string> = consequence.transferPath;
  const prefix: ReadonlyArray<string> =
    parent.kind === "resolved-damage" ? parent.transferPath : [];
  return (
    transfersDamage &&
    equal(source.recipient, parent.recipient) &&
    combatantMatchesRecipient(source.effect.target, source.recipient) &&
    combatantMatchesRecipient(source.effect.actor, consequence.recipient) &&
    source.effect.id === consequence.sourceEffectId &&
    consequence.amount === parent.appliedAmount &&
    transferPath.length === prefix.length + 1 &&
    prefix.every((effectId, pathIndex) => transferPath[pathIndex] === effectId) &&
    transferPath.at(-1) === source.effect.id
  );
}

function withoutRecordKey(
  value: Readonly<Record<string, unknown>>,
  key: string
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value).filter(([id]) => id !== key));
}

function nonUnconsciousStateMatches(
  before: CombatEffectMutationReceipt["before"],
  after: CombatEffectMutationReceipt["after"]
): boolean {
  return equal(
    withoutRecordKey(before.conditionLifetimes, "unconscious"),
    withoutRecordKey(after.conditionLifetimes, "unconscious")
  );
}

function validDamageConditionTransition(
  before: CombatEffectMutationReceipt["before"],
  after: CombatEffectMutationReceipt["after"]
): boolean {
  const delta = conditionDelta(before.conditions, after.conditions);
  return (
    delta.added.every((condition) => condition === "unconscious") &&
    delta.removed.every((condition) => condition === "unconscious") &&
    nonUnconsciousStateMatches(before, after) &&
    (after.conditions.includes("unconscious")
      ? after.conditionLifetimes.unconscious === null
      : !Object.hasOwn(after.conditionLifetimes, "unconscious"))
  );
}

function damageIsCritical(
  receipt: Readonly<
    Extract<CombatEffectMutationReceipt, { kind: "damage" | "resolved-damage" }>
  >
): boolean {
  if (receipt.kind === "resolved-damage") return false;
  return receipt.components.some(
    (component, index) =>
      component.resolution.criticalHit &&
      (receipt.appliedComponents?.[index]?.appliedAmount ?? 0) > 0
  );
}

function validCanonicalDamageTransition(
  receipt: Readonly<
    Extract<CombatEffectMutationReceipt, { kind: "damage" | "resolved-damage" }>
  >
): boolean {
  const { before, after } = receipt;
  const appliedAmount = receipt.appliedAmount;
  if (!safeNonNegative(appliedAmount)) return false;
  if (!validDamageConditionTransition(before, after)) return false;

  const removed = before.hp + before.tempHp - after.hp - after.tempHp;
  if (removed < 0 || removed > appliedAmount) return false;
  const expectedTempHp = Math.max(0, before.tempHp - removed);
  const expectedHp = Math.max(0, before.hp - Math.max(0, removed - before.tempHp));
  if (after.tempHp !== expectedTempHp || after.hp !== expectedHp) return false;

  if (before.deathSaves.failures >= 3 || appliedAmount === 0) {
    return (
      equal(after.deathSaves, before.deathSaves) &&
      after.stable === (appliedAmount > 0 && before.hp === 0 ? false : before.stable) &&
      equal(after.conditions, before.conditions) &&
      equal(after.conditionLifetimes, before.conditionLifetimes)
    );
  }
  if (before.hp === 0) {
    const failures =
      appliedAmount >= before.maxHp
        ? 3
        : Math.min(3, before.deathSaves.failures + (damageIsCritical(receipt) ? 2 : 1));
    const expectedConditions =
      failures >= 3
        ? before.conditions.filter((condition) => condition !== "unconscious")
        : before.conditions;
    return (
      !after.stable &&
      equal(after.deathSaves, { successes: 0, failures }) &&
      equal(after.conditions, expectedConditions)
    );
  }
  if (after.hp === 0) {
    const instantDeath = appliedAmount - before.tempHp - before.hp >= before.maxHp;
    const expectedConditions = instantDeath
      ? before.conditions.filter((condition) => condition !== "unconscious")
      : before.conditions.includes("unconscious")
        ? before.conditions
        : [...before.conditions, "unconscious"];
    return (
      !after.stable &&
      equal(after.deathSaves, { successes: 0, failures: instantDeath ? 3 : 0 }) &&
      equal(after.conditions, expectedConditions)
    );
  }
  return (
    after.stable === before.stable &&
    equal(after.deathSaves, before.deathSaves) &&
    equal(after.conditions, before.conditions) &&
    equal(after.conditionLifetimes, before.conditionLifetimes)
  );
}

function validCanonicalMutationTransition(
  receipt: Readonly<CombatEffectMutationReceipt>
): boolean {
  const { before, after } = receipt;
  switch (receipt.kind) {
    case "damage":
    case "resolved-damage":
      return validCanonicalDamageTransition(receipt);
    case "heal": {
      const expectedHp =
        before.deathSaves.failures >= 3
          ? before.hp
          : Math.min(before.maxHp, before.hp + receipt.amount);
      if (after.hp !== expectedHp) return false;
      const revived = before.hp === 0 && expectedHp > 0;
      return revived
        ? !after.stable &&
            equal(after.deathSaves, { successes: 0, failures: 0 }) &&
            equal(
              after.conditions,
              before.conditions.filter((condition) => condition !== "unconscious")
            ) &&
            nonUnconsciousStateMatches(before, after) &&
            !Object.hasOwn(after.conditionLifetimes, "unconscious")
        : equal(after.stable, before.stable) &&
            equal(after.deathSaves, before.deathSaves) &&
            equal(after.conditions, before.conditions) &&
            equal(after.conditionLifetimes, before.conditionLifetimes);
    }
    case "temp-hp":
      return after.tempHp === Math.max(before.tempHp, receipt.amount);
    case "stabilize": {
      const eligible = before.hp === 0 && before.deathSaves.failures < 3;
      return eligible
        ? after.stable && equal(after.deathSaves, { successes: 3, failures: 0 })
        : equal(after.stable, before.stable) &&
            equal(after.deathSaves, before.deathSaves);
    }
    default:
      return true;
  }
}

function validMutationSequence(
  consequences: ReadonlyArray<CombatEffectConsequence>,
  readSet: Readonly<CombatEffectAtomicReadSet>
): boolean {
  const priorStates = new Map<string, CombatEffectMutationReceipt["after"]>();
  const priorByIndex = new Map<number, CombatEffectMutationReceipt>();
  const occurrenceStates = initialOccurrenceStates(readSet);
  const expectedGenerated = new Map<
    number,
    ReadonlyMap<string, CombatEffectGeneratedSource>
  >();
  const seenGenerated = new Map<number, string[]>();
  for (const [consequenceIndex, consequence] of consequences.entries()) {
    if (consequence.kind === "counter" || consequence.kind === "end-program") continue;
    const owner = ownerForRecipient(readSet, consequence.recipient);
    if (!owner) return false;
    const key = atomicOwnerKey(owner);
    const prior = priorStates.get(key) ?? initialStateForOwner(readSet, owner);
    if (!prior || !equal(prior, consequence.before)) return false;
    if (consequence.kind === "resource") {
      const snapshot = resourceSnapshotForMutation(
        readSet,
        owner,
        consequence.resourceId
      );
      if (
        !snapshot?.present ||
        !snapshot.enabled ||
        consequence.after.resources[consequence.resourceId] === undefined ||
        (consequence.after.resources[consequence.resourceId] as number) >
          snapshot.capacity
      ) {
        return false;
      }
    }
    const damageExpectation = canonicalDamageExpectation(
      readSet,
      occurrenceStates,
      consequence
    );
    if (
      (consequence.kind === "damage" || consequence.kind === "resolved-damage") &&
      !damageExpectation
    ) {
      return false;
    }
    if (damageExpectation) {
      expectedGenerated.set(consequenceIndex, damageExpectation.generated);
    }
    if (!validPlanGeneratedLineage(consequence, consequenceIndex, priorByIndex, readSet))
      return false;
    if (generatedMutation(consequence)) {
      const generatedBy = consequence.generatedBy;
      if (!generatedBy) return false;
      const parentIndex = generatedBy.parentConsequenceIndex;
      const key = generatedExpectationKey(generatedBy.source);
      const expected = expectedGenerated.get(parentIndex);
      const seen = seenGenerated.get(parentIndex) ?? [];
      const nextExpected = expected ? [...expected.entries()][seen.length] : undefined;
      if (
        !nextExpected ||
        nextExpected[0] !== key ||
        !equal(nextExpected[1], generatedBy.source)
      ) {
        return false;
      }
      seen.push(key);
      seenGenerated.set(parentIndex, seen);
    }
    if (
      !validateAndApplyOccurrenceChanges(
        readSet,
        occurrenceStates,
        consequence.recipient,
        consequence.persistentConsequences
      )
    ) {
      return false;
    }
    priorByIndex.set(consequenceIndex, consequence);
    priorStates.set(key, consequence.after);
  }
  return [...expectedGenerated].every(([index, expected]) => {
    const seen = seenGenerated.get(index) ?? [];
    return equal([...expected.keys()], seen);
  });
}

function validAuxiliaryConsequence(
  value: unknown,
  plan: Pick<CombatEffectPlan, "occurrenceId" | "programId" | "phaseId" | "occurrence">
): boolean {
  if (!isRecord(value) || !validProvenance(value.provenance, plan)) return false;
  if (value.kind === "counter") {
    return (
      exactKeys(
        value,
        ["kind", "provenance", "counterId", "before", "after"],
        ["stateKey"]
      ) &&
      nonEmpty(value.counterId) &&
      (value.stateKey === undefined || nonEmpty(value.stateKey)) &&
      safeNonNegative(value.before) &&
      safeNonNegative(value.after)
    );
  }
  return value.kind === "end-program" && exactKeys(value, ["kind", "provenance"]);
}

function validPlan(value: unknown): value is CombatEffectPlan {
  if (
    !isRecord(value) ||
    !isJsonPlain(value) ||
    !exactKeys(
      value,
      [
        "schema",
        "occurrenceId",
        "programId",
        "phaseId",
        "sourceId",
        "occurrence",
        "readSet",
        "consequences",
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
    value.schema !== 1 ||
    !nonEmpty(value.occurrenceId) ||
    !nonEmpty(value.programId) ||
    !nonEmpty(value.phaseId) ||
    !nonEmpty(value.sourceId) ||
    !safeNonNegative(value.occurrence) ||
    !Array.isArray(value.consequences) ||
    !validTallies(value.initialTallies) ||
    !validTallies(value.finalTallies) ||
    !sameRecordKeys(value.initialTallies, value.finalTallies) ||
    !validCursorPair(
      value.initialLayerStates,
      value.finalLayerStates,
      validLayerStates
    ) ||
    !validCursorPair(value.initialAreaStates, value.finalAreaStates, validAreaStates) ||
    (isRecord(value.initialLayerStates) &&
      isRecord(value.finalLayerStates) &&
      !sameRecordKeys(value.initialLayerStates, value.finalLayerStates)) ||
    (value.events !== undefined && !Array.isArray(value.events)) ||
    typeof value.ended !== "boolean"
  ) {
    return false;
  }
  const header = {
    occurrenceId: value.occurrenceId,
    programId: value.programId,
    phaseId: value.phaseId,
    occurrence: value.occurrence,
  };
  const readSet = conformCombatEffectAtomicReadSet(value.readSet, {
    occurrenceId: value.occurrenceId,
    programId: value.programId,
    sourceId: value.sourceId,
  });
  if (!readSet) return false;
  const candidatePlan = value as unknown as CombatEffectPlan;
  const consequences = value.consequences as unknown as CombatEffectPlan["consequences"];
  const events = value.events as CombatEffectPlan["events"];
  const validConsequences = consequences.every((consequence) =>
    isRecord(consequence) && ["counter", "end-program"].includes(consequence.kind)
      ? validAuxiliaryConsequence(consequence, header)
      : validMutationReceipt(consequence, header)
  );
  const auxiliaryConsequences = consequences.filter(
    (
      consequence
    ): consequence is Exclude<CombatEffectConsequence, CombatEffectMutationReceipt> =>
      consequence.kind === "counter" || consequence.kind === "end-program"
  );
  return (
    validConsequences &&
    planReferencesAreBound(candidatePlan, readSet) &&
    initialLifecycleMatchesPlan(candidatePlan, readSet) &&
    validMutationSequence(consequences, readSet) &&
    (events ?? []).every((event) => validEvent(event, header)) &&
    validLifecycleTransition({
      auxiliaryConsequences,
      events,
      initialTallies: value.initialTallies,
      finalTallies: value.finalTallies,
      ...(value.initialLayerStates === undefined
        ? {}
        : {
            initialLayerStates:
              value.initialLayerStates as CombatEffectPlan["initialLayerStates"],
          }),
      ...(value.finalLayerStates === undefined
        ? {}
        : {
            finalLayerStates:
              value.finalLayerStates as CombatEffectPlan["finalLayerStates"],
          }),
      ...(value.initialAreaStates === undefined
        ? {}
        : {
            initialAreaStates:
              value.initialAreaStates as CombatEffectPlan["initialAreaStates"],
          }),
      ...(value.finalAreaStates === undefined
        ? {}
        : {
            finalAreaStates: value.finalAreaStates as CombatEffectPlan["finalAreaStates"],
          }),
      ended: value.ended,
    })
  );
}

function fieldValue(value: CombatEffectJson, present = true): CombatEffectFieldValue {
  return present ? { present: true, value } : { present: false };
}

function ownedChanges(receipt: CombatEffectMutationReceipt): CombatEffectOwnedChange[] {
  const changes: CombatEffectOwnedChange[] = [];
  const fields =
    receipt.kind === "condition" || receipt.kind === "standing"
      ? TOP_LEVEL_FIELDS.filter(
          (field) =>
            field !== "conditions" &&
            field !== "conditionLifetimes" &&
            field !== "standing" &&
            field !== "standingLifetimes"
        )
      : TOP_LEVEL_FIELDS;
  for (const field of fields) {
    const before = receipt.before[field] as CombatEffectJson;
    const after = receipt.after[field] as CombatEffectJson;
    if (!equal(before, after)) {
      changes.push({
        path: [field],
        expected: fieldValue(before),
        next: fieldValue(after),
      });
    }
  }
  const resourceIds = new Set([
    ...Object.keys(receipt.before.resources),
    ...Object.keys(receipt.after.resources),
  ]);
  for (const resourceId of [...resourceIds].sort()) {
    const beforePresent = Object.hasOwn(receipt.before.resources, resourceId);
    const afterPresent = Object.hasOwn(receipt.after.resources, resourceId);
    const before = receipt.before.resources[resourceId];
    const after = receipt.after.resources[resourceId];
    if (beforePresent !== afterPresent || before !== after) {
      changes.push({
        path: ["resources", resourceId],
        expected: fieldValue(before ?? 0, beforePresent),
        next: fieldValue(after ?? 0, afterPresent),
      });
    }
  }
  const stateFlagIds = new Set([
    ...Object.keys(receipt.before.stateFlags),
    ...Object.keys(receipt.after.stateFlags),
  ]);
  for (const stateKey of [...stateFlagIds].sort()) {
    const beforePresent = Object.hasOwn(receipt.before.stateFlags, stateKey);
    const afterPresent = Object.hasOwn(receipt.after.stateFlags, stateKey);
    const before = receipt.before.stateFlags[stateKey];
    const after = receipt.after.stateFlags[stateKey];
    if (beforePresent !== afterPresent || before !== after) {
      changes.push({
        path: ["stateFlags", stateKey],
        expected: fieldValue(before ?? false, beforePresent),
        next: fieldValue(after ?? false, afterPresent),
      });
    }
  }
  return changes;
}

function mutationOnly(receipt: CombatEffectMutationReceipt): CombatEffectMutation {
  const copy = { ...receipt } as Record<string, unknown>;
  delete copy.before;
  delete copy.after;
  delete copy.appliedAmount;
  delete copy.appliedComponents;
  delete copy.persistentConsequences;
  delete copy.generatedBy;
  return copy as unknown as CombatEffectMutation;
}

function commandId(
  plan: Pick<
    CombatEffectPlan,
    "occurrenceId" | "programId" | "phaseId" | "sourceId" | "occurrence"
  > & { attempt: number }
): string {
  return [
    plan.occurrenceId,
    plan.programId,
    plan.phaseId,
    plan.sourceId,
    String(plan.occurrence),
    String(plan.attempt),
  ]
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function commandPayloadIdentity(value: unknown): string {
  if (!isRecord(value) || !isJsonPlain(value)) {
    throw new TypeError("Combat-effect command payload must be JSON-plain");
  }
  const payload = { ...value };
  delete payload.payloadIdentity;
  return JSON.stringify(canonical(payload));
}

function adaptersAreValid(adapters: ReadonlyArray<CombatEffectCommandAdapter>): boolean {
  const ids = new Set<string>();
  return adapters.every((adapter) => {
    const candidate: unknown = adapter;
    if (
      !isRecord(candidate) ||
      !nonEmpty(candidate.id) ||
      ids.has(candidate.id) ||
      (candidate.surface !== "local" && candidate.surface !== "shared") ||
      typeof candidate.accepts !== "function" ||
      typeof candidate.compareAndSwap !== "function"
    ) {
      return false;
    }
    ids.add(candidate.id);
    return true;
  });
}

/** Narrow and route one reviewed plan without mutating live state. */
export function prepareCombatEffectCommand(
  plan: unknown,
  adapters: ReadonlyArray<CombatEffectCommandAdapter>,
  attempt = 0
): CombatEffectCommandPreparation {
  if (!validPlan(plan)) return { status: "rejected", reason: "invalid-plan" };
  if (!safeNonNegative(attempt)) return { status: "rejected", reason: "invalid-plan" };
  if (!adaptersAreValid(adapters)) {
    return { status: "rejected", reason: "invalid-adapter" };
  }
  const id = commandId({ ...plan, attempt });
  const coordinatorRef: CombatEffectEntityRef = {
    kind: "source",
    id: plan.sourceId,
  };
  let coordinators: CombatEffectCommandAdapter[];
  try {
    coordinators = adapters.filter((adapter) => adapter.accepts(coordinatorRef));
  } catch {
    return { status: "rejected", reason: "invalid-adapter" };
  }
  if (coordinators.length === 0) {
    return { status: "rejected", reason: "missing-adapter" };
  }
  if (coordinators.length !== 1) {
    return { status: "rejected", reason: "ambiguous-adapter" };
  }
  const coordinator = coordinators[0];
  if (!coordinator) return { status: "rejected", reason: "missing-adapter" };
  for (const binding of plan.readSet.bindings) {
    let matching: CombatEffectCommandAdapter[];
    try {
      matching = adapters.filter((adapter) => adapter.accepts(binding.ref));
    } catch {
      return { status: "rejected", reason: "invalid-adapter" };
    }
    if (matching.length === 0) return { status: "rejected", reason: "missing-adapter" };
    if (matching.length !== 1) {
      return { status: "rejected", reason: "ambiguous-adapter" };
    }
    if (
      matching[0]?.id !== coordinator.id ||
      binding.owner.surface !== coordinator.surface
    ) {
      return { status: "rejected", reason: "split-transaction" };
    }
  }
  const operations: CombatEffectCommandMutationReceipt[] = [];
  const auxiliaryConsequences: Array<
    Exclude<CombatEffectConsequence, CombatEffectMutationReceipt>
  > = [];
  const operationIdsByConsequence = new Map<number, string>();
  let sequence = 0;
  for (const [consequenceIndex, consequence] of plan.consequences.entries()) {
    if (consequence.kind === "counter" || consequence.kind === "end-program") {
      auxiliaryConsequences.push(consequence);
      continue;
    }
    let matching: CombatEffectCommandAdapter[];
    try {
      matching = adapters.filter((adapter) => adapter.accepts(consequence.recipient));
    } catch {
      return { status: "rejected", reason: "invalid-adapter" };
    }
    if (matching.length === 0) return { status: "rejected", reason: "missing-adapter" };
    if (matching.length !== 1) {
      return { status: "rejected", reason: "ambiguous-adapter" };
    }
    const adapter = matching[0];
    if (!adapter) return { status: "rejected", reason: "missing-adapter" };
    const operationId = `${id}#${sequence}`;
    const lineage =
      consequence.kind === "state-flag" || consequence.kind === "resolved-damage"
        ? consequence.generatedBy
        : undefined;
    const parentOperationId =
      lineage === undefined
        ? undefined
        : operationIdsByConsequence.get(lineage.parentConsequenceIndex);
    if (lineage !== undefined && parentOperationId === undefined) {
      return { status: "rejected", reason: "invalid-plan" };
    }
    operations.push({
      operationId,
      sequence,
      consequenceIndex,
      adapterId: adapter.id,
      surface: adapter.surface,
      recipient: consequence.recipient,
      provenance: consequence.provenance,
      mutation: mutationOnly(consequence),
      ...(lineage === undefined || parentOperationId === undefined
        ? {}
        : { generatedBy: { ...lineage, parentOperationId } }),
      changes: ownedChanges(consequence),
      ...(consequence.appliedAmount === undefined
        ? {}
        : { appliedAmount: consequence.appliedAmount }),
      ...(consequence.appliedComponents === undefined
        ? {}
        : { appliedComponents: consequence.appliedComponents }),
      ...(consequence.persistentConsequences === undefined
        ? {}
        : { persistentConsequences: consequence.persistentConsequences }),
    });
    operationIdsByConsequence.set(consequenceIndex, operationId);
    sequence += 1;
  }
  if (operations.some((operation) => operation.adapterId !== coordinator.id)) {
    return { status: "rejected", reason: "split-transaction" };
  }
  const cursorChanged =
    !equal(plan.initialTallies, plan.finalTallies) ||
    !equalOptional(plan.initialLayerStates, plan.finalLayerStates) ||
    !equalOptional(plan.initialAreaStates, plan.finalAreaStates);
  if (
    operations.length === 0 &&
    auxiliaryConsequences.length === 0 &&
    (plan.events?.length ?? 0) === 0 &&
    !cursorChanged &&
    !plan.ended
  ) {
    return { status: "rejected", reason: "invalid-plan" };
  }
  const receiptWithoutIdentity = {
    schema: 1,
    commandId: id,
    coordinatorAdapterId: coordinator.id,
    coordinatorSurface: coordinator.surface,
    occurrenceId: plan.occurrenceId,
    programId: plan.programId,
    phaseId: plan.phaseId,
    sourceId: plan.sourceId,
    occurrence: plan.occurrence,
    attempt,
    readSet: plan.readSet,
    operations,
    auxiliaryConsequences,
    ...(plan.events === undefined ? {} : { events: plan.events }),
    initialTallies: plan.initialTallies,
    finalTallies: plan.finalTallies,
    ...(plan.initialLayerStates === undefined
      ? {}
      : { initialLayerStates: plan.initialLayerStates }),
    ...(plan.finalLayerStates === undefined
      ? {}
      : { finalLayerStates: plan.finalLayerStates }),
    ...(plan.initialAreaStates === undefined
      ? {}
      : { initialAreaStates: plan.initialAreaStates }),
    ...(plan.finalAreaStates === undefined
      ? {}
      : { finalAreaStates: plan.finalAreaStates }),
    ended: plan.ended,
  } satisfies Omit<CombatEffectCommandReceipt, "payloadIdentity">;
  return {
    status: "prepared",
    receipt: frozen({
      ...receiptWithoutIdentity,
      payloadIdentity: commandPayloadIdentity(receiptWithoutIdentity),
    }),
  };
}

function stateFieldValue(
  state: CombatEffectMutationReceipt["before"],
  path: ReadonlyArray<string>
): CombatEffectFieldValue | null {
  const root = path[0];
  if (!root) return null;
  if (path.length === 1) {
    const value = (state as unknown as Record<string, CombatEffectJson>)[root];
    return value === undefined ? null : fieldValue(value);
  }
  const child = path[1];
  if (!child || path.length !== 2 || (root !== "resources" && root !== "stateFlags")) {
    return null;
  }
  const recordValue = state[root] as Readonly<Record<string, CombatEffectJson>>;
  return Object.hasOwn(recordValue, child)
    ? fieldValue(recordValue[child] as CombatEffectJson)
    : fieldValue(null, false);
}

function reconstructMutationReceipt(
  operation: Readonly<CombatEffectCommandMutationReceipt>,
  before: Readonly<CombatEffectMutationReceipt["before"]>,
  plan: Pick<CombatEffectPlan, "occurrenceId" | "programId" | "phaseId" | "occurrence">
): CombatEffectMutationReceipt | null {
  const after = structuredClone(before) as CombatEffectMutationReceipt["after"];
  for (const change of operation.changes) {
    const current = stateFieldValue(after, change.path);
    if (!current || !equal(current, change.expected)) return null;
    const root = change.path[0];
    if (!root) return null;
    if (change.path.length === 1) {
      if (!change.next.present) return null;
      (after as unknown as Record<string, CombatEffectJson>)[root] = change.next
        .value as CombatEffectJson;
      continue;
    }
    const child = change.path[1];
    if (!child || (root !== "resources" && root !== "stateFlags")) {
      return null;
    }
    const nested = after[root] as Record<string, CombatEffectJson>;
    if (!change.next.present) return null;
    nested[child] = change.next.value as CombatEffectJson;
  }
  if (!validStateView(after)) return null;
  const candidate = {
    ...operation.mutation,
    before,
    after,
    ...(operation.appliedAmount === undefined
      ? {}
      : { appliedAmount: operation.appliedAmount }),
    ...(operation.appliedComponents === undefined
      ? {}
      : { appliedComponents: operation.appliedComponents }),
    ...(operation.persistentConsequences === undefined
      ? {}
      : { persistentConsequences: operation.persistentConsequences }),
  } as CombatEffectMutationReceipt;
  return validMutationReceipt(candidate, plan) ? candidate : null;
}

function validReceipt(value: unknown): value is CombatEffectCommandReceipt {
  if (
    !isRecord(value) ||
    !isJsonPlain(value) ||
    !exactKeys(
      value,
      [
        "schema",
        "commandId",
        "payloadIdentity",
        "coordinatorAdapterId",
        "coordinatorSurface",
        "occurrenceId",
        "programId",
        "phaseId",
        "sourceId",
        "occurrence",
        "attempt",
        "readSet",
        "operations",
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
    value.schema !== 1 ||
    !nonEmpty(value.commandId) ||
    !nonEmpty(value.payloadIdentity) ||
    !nonEmpty(value.coordinatorAdapterId) ||
    (value.coordinatorSurface !== "local" && value.coordinatorSurface !== "shared") ||
    !nonEmpty(value.occurrenceId) ||
    !nonEmpty(value.programId) ||
    !nonEmpty(value.phaseId) ||
    !nonEmpty(value.sourceId) ||
    !safeNonNegative(value.occurrence) ||
    !safeNonNegative(value.attempt) ||
    !Array.isArray(value.operations) ||
    !Array.isArray(value.auxiliaryConsequences) ||
    !validTallies(value.initialTallies) ||
    !validTallies(value.finalTallies) ||
    !sameRecordKeys(value.initialTallies, value.finalTallies) ||
    !validCursorPair(
      value.initialLayerStates,
      value.finalLayerStates,
      validLayerStates
    ) ||
    !validCursorPair(value.initialAreaStates, value.finalAreaStates, validAreaStates) ||
    (isRecord(value.initialLayerStates) &&
      isRecord(value.finalLayerStates) &&
      !sameRecordKeys(value.initialLayerStates, value.finalLayerStates)) ||
    (value.events !== undefined && !Array.isArray(value.events)) ||
    typeof value.ended !== "boolean"
  ) {
    return false;
  }
  const header = {
    occurrenceId: value.occurrenceId,
    programId: value.programId,
    phaseId: value.phaseId,
    sourceId: value.sourceId,
    occurrence: value.occurrence,
    attempt: value.attempt,
  };
  const readSet = conformCombatEffectAtomicReadSet(value.readSet, {
    occurrenceId: value.occurrenceId,
    programId: value.programId,
    sourceId: value.sourceId,
  });
  if (!readSet) return false;
  if (
    readSet.bindings.some((binding) => binding.owner.surface !== value.coordinatorSurface)
  ) {
    return false;
  }
  const receiptCommandId: string = value.commandId;
  if (
    receiptCommandId !== commandId(header) ||
    value.payloadIdentity !== commandPayloadIdentity(value)
  ) {
    return false;
  }
  if (
    !value.auxiliaryConsequences.every((consequence) =>
      validAuxiliaryConsequence(consequence, header)
    ) ||
    !(value.events ?? []).every((event) => validEvent(event, header)) ||
    !validLifecycleTransition({
      auxiliaryConsequences: value.auxiliaryConsequences,
      ...(value.events === undefined ? {} : { events: value.events }),
      initialTallies: value.initialTallies,
      finalTallies: value.finalTallies,
      ...(value.initialLayerStates === undefined
        ? {}
        : {
            initialLayerStates:
              value.initialLayerStates as CombatEffectPlan["initialLayerStates"],
          }),
      ...(value.finalLayerStates === undefined
        ? {}
        : {
            finalLayerStates:
              value.finalLayerStates as CombatEffectPlan["finalLayerStates"],
          }),
      ...(value.initialAreaStates === undefined
        ? {}
        : {
            initialAreaStates:
              value.initialAreaStates as CombatEffectPlan["initialAreaStates"],
          }),
      ...(value.finalAreaStates === undefined
        ? {}
        : {
            finalAreaStates: value.finalAreaStates as CombatEffectPlan["finalAreaStates"],
          }),
      ended: value.ended,
    })
  ) {
    return false;
  }
  const cursorChanged =
    !equal(value.initialTallies, value.finalTallies) ||
    !equalOptional(value.initialLayerStates, value.finalLayerStates) ||
    !equalOptional(value.initialAreaStates, value.finalAreaStates);
  if (
    value.operations.length === 0 &&
    value.auxiliaryConsequences.length === 0 &&
    (value.events?.length ?? 0) === 0 &&
    !cursorChanged &&
    !value.ended
  ) {
    return false;
  }
  if (
    !initialLifecycleMatchesPlan(
      value as unknown as Readonly<CombatEffectPlan>,
      readSet
    ) ||
    !receiptReferencesAreBound(
      value as unknown as Readonly<CombatEffectCommandReceipt>,
      readSet
    )
  ) {
    return false;
  }
  let priorConsequenceIndex = -1;
  const priorOperationsById = new Map<string, CombatEffectCommandMutationReceipt>();
  const priorOperationsByConsequence = new Map<
    number,
    CombatEffectCommandMutationReceipt
  >();
  const stateByOwner = new Map<string, CombatEffectMutationReceipt["after"]>();
  const occurrenceStates = initialOccurrenceStates(readSet);
  const expectedGenerated = new Map<
    number,
    ReadonlyMap<string, CombatEffectGeneratedSource>
  >();
  const seenGenerated = new Map<number, string[]>();
  const operationsValid = value.operations.every((operation, index) => {
    if (
      !isRecord(operation) ||
      !exactKeys(
        operation,
        [
          "operationId",
          "sequence",
          "consequenceIndex",
          "adapterId",
          "surface",
          "recipient",
          "provenance",
          "mutation",
          "changes",
        ],
        ["generatedBy", "appliedAmount", "appliedComponents", "persistentConsequences"]
      ) ||
      operation.operationId !== `${receiptCommandId}#${index}` ||
      operation.sequence !== index ||
      !safeNonNegative(operation.consequenceIndex) ||
      operation.consequenceIndex <= priorConsequenceIndex ||
      !nonEmpty(operation.adapterId) ||
      operation.adapterId !== value.coordinatorAdapterId ||
      (operation.surface !== "local" && operation.surface !== "shared") ||
      operation.surface !== value.coordinatorSurface ||
      !validRecipient(operation.recipient) ||
      !validProvenance(operation.provenance, header) ||
      !validCommandMutation(operation.mutation, header) ||
      !equal(operation.recipient, operation.mutation.recipient) ||
      !equal(operation.provenance, operation.mutation.provenance) ||
      !Array.isArray(operation.changes)
    ) {
      return false;
    }
    priorConsequenceIndex = operation.consequenceIndex;
    const mutation = operation.mutation;
    const appliedAmount = operation.appliedAmount as number;
    const changes = operation.changes as ReadonlyArray<CombatEffectOwnedChange>;
    const numeric = [
      "damage",
      "resolved-damage",
      "heal",
      "temp-hp",
      "resource",
      "damage-reduction",
    ].includes(mutation.kind);
    if (numeric !== safeNonNegative(operation.appliedAmount)) return false;
    if (mutation.kind === "resolved-damage" && appliedAmount !== mutation.amount) {
      return false;
    }
    if (
      (mutation.kind === "heal" ||
        mutation.kind === "temp-hp" ||
        mutation.kind === "resource") &&
      appliedAmount > mutation.amount
    ) {
      return false;
    }
    if (
      mutation.kind === "damage-reduction" &&
      (appliedAmount > mutation.amount ||
        appliedAmount > mutation.triggeringDamage.amount)
    ) {
      return false;
    }
    if (
      mutation.kind === "damage"
        ? !Array.isArray(operation.appliedComponents) ||
          operation.appliedComponents.length !== mutation.components.length
        : Object.hasOwn(operation, "appliedComponents")
    ) {
      return false;
    }
    const hasPersistentConsequences = Object.hasOwn(operation, "persistentConsequences");
    if (
      ((mutation.kind === "condition" || mutation.kind === "standing") &&
        !hasPersistentConsequences) ||
      (operation.persistentConsequences !== undefined &&
        !isCombatEffectPersistentConsequences(operation.persistentConsequences, mutation))
    ) {
      return false;
    }
    const paths = new Set<string>();
    const validChanges =
      exactGeneratedStateFlagChange(mutation, changes) &&
      changes.every((change) => {
        if (!validOwnedChange(change)) return false;
        if (!mutationOwnsChange(mutation, change)) return false;
        const key = change.path.join("\u0000");
        if (paths.has(key)) return false;
        paths.add(key);
        return true;
      });
    if (!validChanges) return false;
    const candidate = operation as unknown as CombatEffectCommandMutationReceipt;
    const owner = ownerForRecipient(readSet, candidate.recipient);
    if (!owner) return false;
    const ownerId = atomicOwnerKey(owner);
    const before = stateByOwner.get(ownerId) ?? initialStateForOwner(readSet, owner);
    if (!before) return false;
    const reconstructed = reconstructMutationReceipt(candidate, before, header);
    if (!reconstructed || !equal(ownedChanges(reconstructed), candidate.changes)) {
      return false;
    }
    const damageExpectation = canonicalDamageExpectation(
      readSet,
      occurrenceStates,
      reconstructed
    );
    if (
      (candidate.mutation.kind === "damage" ||
        candidate.mutation.kind === "resolved-damage") &&
      !damageExpectation
    ) {
      return false;
    }
    if (damageExpectation) {
      expectedGenerated.set(candidate.consequenceIndex, damageExpectation.generated);
    }
    if (candidate.mutation.kind === "resource") {
      const snapshot = resourceSnapshotForMutation(
        readSet,
        owner,
        candidate.mutation.resourceId
      );
      const afterAmount = reconstructed.after.resources[candidate.mutation.resourceId];
      if (
        !snapshot?.present ||
        !snapshot.enabled ||
        afterAmount === undefined ||
        afterAmount > snapshot.capacity
      ) {
        return false;
      }
    }
    if (
      !validCommandGeneratedLineage(
        candidate,
        priorOperationsById,
        priorOperationsByConsequence,
        readSet
      )
    ) {
      return false;
    }
    if (
      candidate.mutation.kind === "state-flag" ||
      candidate.mutation.kind === "resolved-damage"
    ) {
      const generatedBy = candidate.generatedBy;
      if (!generatedBy) return false;
      const parentIndex = generatedBy.parentConsequenceIndex;
      const key = generatedExpectationKey(generatedBy.source);
      const expected = expectedGenerated.get(parentIndex);
      const seen = seenGenerated.get(parentIndex) ?? [];
      const nextExpected = expected ? [...expected.entries()][seen.length] : undefined;
      if (
        !nextExpected ||
        nextExpected[0] !== key ||
        !equal(nextExpected[1], generatedBy.source)
      ) {
        return false;
      }
      seen.push(key);
      seenGenerated.set(parentIndex, seen);
    }
    if (
      !validateAndApplyOccurrenceChanges(
        readSet,
        occurrenceStates,
        candidate.recipient,
        candidate.persistentConsequences
      )
    ) {
      return false;
    }
    priorOperationsById.set(candidate.operationId, candidate);
    priorOperationsByConsequence.set(candidate.consequenceIndex, candidate);
    stateByOwner.set(ownerId, reconstructed.after);
    return true;
  });
  return (
    operationsValid &&
    [...expectedGenerated].every(([index, expected]) => {
      const seen = seenGenerated.get(index) ?? [];
      return equal([...expected.keys()], seen);
    })
  );
}

function validCommandMutation(
  value: unknown,
  plan: Pick<CombatEffectPlan, "occurrenceId" | "programId" | "phaseId" | "occurrence">
): value is CombatEffectMutation {
  if (
    !isRecord(value) ||
    !isJsonPlain(value) ||
    Object.hasOwn(value, "before") ||
    Object.hasOwn(value, "after") ||
    !validProvenance(value.provenance, plan) ||
    !validRecipient(value.recipient)
  ) {
    return false;
  }
  switch (value.kind) {
    case "damage":
      return validDamagePacket(value);
    case "resolved-damage":
      return (
        exactKeys(value, [
          "kind",
          "amount",
          "sourceEffectId",
          "transferPath",
          "provenance",
          "recipient",
        ]) &&
        safeNonNegative(value.amount) &&
        nonEmpty(value.sourceEffectId) &&
        Array.isArray(value.transferPath) &&
        value.transferPath.length > 0 &&
        value.transferPath.every(nonEmpty) &&
        new Set(value.transferPath).size === value.transferPath.length &&
        value.transferPath.at(-1) === value.sourceEffectId
      );
    case "heal":
    case "temp-hp":
      return (
        exactKeys(value, ["kind", "amount", "provenance", "recipient"]) &&
        safeNonNegative(value.amount)
      );
    case "condition":
      return (
        exactKeys(
          value,
          ["kind", "operation", "condition", "provenance", "recipient"],
          ["lifetime"]
        ) &&
        (value.operation === "apply" || value.operation === "remove") &&
        nonEmpty(value.condition)
      );
    case "standing":
      return (
        exactKeys(
          value,
          ["kind", "operation", "effectId", "provenance", "recipient"],
          ["lifetime"]
        ) &&
        (value.operation === "start" || value.operation === "end") &&
        nonEmpty(value.effectId)
      );
    case "resource":
      return (
        exactKeys(value, [
          "kind",
          "operation",
          "resourceId",
          "amount",
          "provenance",
          "recipient",
        ]) &&
        (value.operation === "spend" || value.operation === "gain") &&
        nonEmpty(value.resourceId) &&
        safeNonNegative(value.amount)
      );
    case "damage-reduction":
      return (
        exactKeys(
          value,
          ["kind", "amount", "triggeringDamage", "provenance", "recipient"],
          ["damageTypes"]
        ) &&
        safeNonNegative(value.amount) &&
        isRecord(value.triggeringDamage) &&
        safeNonNegative(value.triggeringDamage.amount) &&
        nonEmpty(value.triggeringDamage.sourceId) &&
        (value.damageTypes === undefined ||
          (Array.isArray(value.damageTypes) && value.damageTypes.every(nonEmpty)))
      );
    case "stabilize":
      return exactKeys(value, ["kind", "provenance", "recipient"]);
    case "state-flag":
      return (
        exactKeys(value, ["kind", "operation", "stateKey", "provenance", "recipient"]) &&
        (value.operation === "activate" || value.operation === "deactivate") &&
        nonEmpty(value.stateKey)
      );
    default:
      return false;
  }
}

function validFieldValue(value: unknown): value is CombatEffectFieldValue {
  return (
    isRecord(value) &&
    typeof value.present === "boolean" &&
    (value.present
      ? exactKeys(value, ["present", "value"]) && isJsonPlain(value.value)
      : exactKeys(value, ["present"]))
  );
}

function validOwnedChange(value: unknown): value is CombatEffectOwnedChange {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["path", "expected", "next"]) ||
    !Array.isArray(value.path) ||
    !validFieldValue(value.expected) ||
    !validFieldValue(value.next)
  ) {
    return false;
  }
  const path = value.path as unknown[];
  if (!path.every(nonEmpty)) return false;
  if (value.path.length === 1) {
    const field = path[0];
    if (!nonEmpty(field)) return false;
    const valid =
      TOP_LEVEL_FIELDS.includes(field as (typeof TOP_LEVEL_FIELDS)[number]) &&
      value.expected.present &&
      value.next.present;
    if (!valid) return false;
    const candidates = [value.expected.value, value.next.value];
    if (field === "hp" || field === "tempHp") {
      return candidates.every(safeNonNegative);
    }
    if (field === "stable")
      return candidates.every((entry) => typeof entry === "boolean");
    if (field === "deathSaves") {
      return candidates.every(
        (entry) =>
          isRecord(entry) &&
          exactKeys(entry, ["successes", "failures"]) &&
          safeNonNegative(entry.successes) &&
          entry.successes <= 3 &&
          safeNonNegative(entry.failures) &&
          entry.failures <= 3
      );
    }
    if (field === "conditions" || field === "standing") {
      return candidates.every((entry) => Array.isArray(entry) && entry.every(nonEmpty));
    }
    return candidates.every((entry) => isRecord(entry));
  }
  const valid =
    value.path.length === 2 &&
    (value.path[0] === "resources" || value.path[0] === "stateFlags") &&
    nonEmpty(value.path[1]);
  if (!valid) return false;
  const candidates = [value.expected, value.next].filter((entry) => entry.present);
  return value.path[0] === "resources"
    ? candidates.every((entry) => safeNonNegative(entry.value))
    : candidates.every((entry) => typeof entry.value === "boolean");
}

function mutationOwnsChange(
  mutation: Readonly<CombatEffectMutation>,
  change: Readonly<CombatEffectOwnedChange>
): boolean {
  const root = change.path[0];
  if (mutation.kind === "damage" || mutation.kind === "resolved-damage") {
    return [
      "hp",
      "tempHp",
      "stable",
      "deathSaves",
      "conditions",
      "conditionLifetimes",
    ].includes(root ?? "");
  }
  if (mutation.kind === "heal") {
    return ["hp", "stable", "deathSaves", "conditions", "conditionLifetimes"].includes(
      root ?? ""
    );
  }
  if (mutation.kind === "temp-hp") return root === "tempHp";
  if (mutation.kind === "resource") {
    return root === "resources" && change.path[1] === mutation.resourceId;
  }
  if (mutation.kind === "stabilize") {
    return root === "stable" || root === "deathSaves";
  }
  if (mutation.kind === "state-flag") {
    return root === "stateFlags" && change.path[1] === mutation.stateKey;
  }
  return false;
}

function exactGeneratedStateFlagChange(
  mutation: Readonly<CombatEffectMutation>,
  changes: ReadonlyArray<CombatEffectOwnedChange>
): boolean {
  if (mutation.kind !== "state-flag") return true;
  return (
    mutation.operation === "deactivate" &&
    changes.length === 1 &&
    equal(changes[0]?.expected, { present: true, value: true }) &&
    equal(changes[0]?.next, { present: true, value: false })
  );
}

function validCommandGeneratedLineage(
  operation: Readonly<CombatEffectCommandMutationReceipt>,
  priorById: ReadonlyMap<string, CombatEffectCommandMutationReceipt>,
  priorByConsequence: ReadonlyMap<number, CombatEffectCommandMutationReceipt>,
  readSet: Readonly<CombatEffectAtomicReadSet>
): boolean {
  const mutation = operation.mutation;
  const isGenerated =
    mutation.kind === "state-flag" || mutation.kind === "resolved-damage";
  if (!isGenerated) return !Object.hasOwn(operation, "generatedBy");
  const lineage = operation.generatedBy;
  if (
    !isRecord(lineage) ||
    !exactKeys(lineage, ["parentConsequenceIndex", "parentOperationId", "source"]) ||
    !safeNonNegative(lineage.parentConsequenceIndex) ||
    lineage.parentConsequenceIndex >= operation.consequenceIndex ||
    !nonEmpty(lineage.parentOperationId) ||
    !validGeneratedSource(lineage.source)
  ) {
    return false;
  }
  const parentById = priorById.get(lineage.parentOperationId);
  const parentByConsequence = priorByConsequence.get(lineage.parentConsequenceIndex);
  if (
    !parentById ||
    parentById !== parentByConsequence ||
    parentById.sequence >= operation.sequence ||
    (parentById.mutation.kind !== "damage" &&
      parentById.mutation.kind !== "resolved-damage") ||
    !equal(parentById.provenance, operation.provenance)
  ) {
    return false;
  }
  const parent = parentById;
  const source = lineage.source;
  if (mutation.kind === "state-flag") {
    const sourceOwner = ownerForRecipient(readSet, source.recipient);
    const floor =
      source.kind === "state-flag" && sourceOwner
        ? zeroHpFloorsForOwner(readSet, sourceOwner)?.find(
            (candidate) => candidate.stateKey === source.stateKey
          )
        : undefined;
    if (
      source.kind !== "state-flag" ||
      floor?.hitPoints !== source.hitPoints ||
      mutation.operation !== "deactivate" ||
      source.stateKey !== mutation.stateKey ||
      !equal(source.recipient, parent.recipient) ||
      !equal(source.recipient, operation.recipient)
    ) {
      return false;
    }
    const parentHp = parent.changes.find(
      (change) => change.path.length === 1 && change.path[0] === "hp"
    );
    return (
      (parentHp === undefined ||
        (parentHp.next.present && parentHp.next.value === source.hitPoints)) &&
      exactGeneratedStateFlagChange(mutation, operation.changes)
    );
  }
  if (source.kind !== "effect-occurrence") return false;
  let transfersDamage: boolean;
  try {
    transfersDamage = resolveCombatEffectGrants(source.effect).some(
      (grant) => grant.type === "damage-transfer"
    );
  } catch {
    return false;
  }
  const prefix =
    parent.mutation.kind === "resolved-damage" ? parent.mutation.transferPath : [];
  return (
    transfersDamage &&
    equal(source.recipient, parent.recipient) &&
    combatantMatchesRecipient(source.effect.target, source.recipient) &&
    combatantMatchesRecipient(source.effect.actor, operation.recipient) &&
    source.effect.id === mutation.sourceEffectId &&
    mutation.amount === parent.appliedAmount &&
    mutation.transferPath.length === prefix.length + 1 &&
    prefix.every((effectId, index) => mutation.transferPath[index] === effectId) &&
    mutation.transferPath.at(-1) === source.effect.id
  );
}

function adapterMap(
  adapters: ReadonlyArray<CombatEffectCommandAdapter>
): Map<string, CombatEffectCommandAdapter> | null {
  if (!adaptersAreValid(adapters)) return null;
  return new Map(adapters.map((adapter) => [adapter.id, adapter]));
}

function batchGroups(
  receipt: CombatEffectCommandReceipt,
  direction: CombatEffectCommandDirection,
  expectedCausalState: CombatEffectCausalState,
  nextCausalState: CombatEffectCausalState
): CombatEffectCommandBatch[] {
  const ordered =
    direction === "forward" ? receipt.operations : [...receipt.operations].reverse();
  return [
    {
      schema: 1,
      commandId: receipt.commandId,
      payloadIdentity: receipt.payloadIdentity,
      adapterId: receipt.coordinatorAdapterId,
      surface: receipt.coordinatorSurface,
      direction,
      expectedCausalState,
      nextCausalState,
      readSet: receipt.readSet,
      readSetPolicy:
        direction === "reverse"
          ? "undo"
          : expectedCausalState === "available"
            ? "initial"
            : "redo",
      coordinatesLifecycle: true,
      lifecycle: {
        occurrenceId: receipt.occurrenceId,
        programId: receipt.programId,
        phaseId: receipt.phaseId,
        sourceId: receipt.sourceId,
        occurrence: receipt.occurrence,
        attempt: receipt.attempt,
        auxiliaryConsequences: receipt.auxiliaryConsequences,
        ...(receipt.events === undefined ? {} : { events: receipt.events }),
        initialTallies: receipt.initialTallies,
        finalTallies: receipt.finalTallies,
        ...(receipt.initialLayerStates === undefined
          ? {}
          : { initialLayerStates: receipt.initialLayerStates }),
        ...(receipt.finalLayerStates === undefined
          ? {}
          : { finalLayerStates: receipt.finalLayerStates }),
        ...(receipt.initialAreaStates === undefined
          ? {}
          : { initialAreaStates: receipt.initialAreaStates }),
        ...(receipt.finalAreaStates === undefined
          ? {}
          : { finalAreaStates: receipt.finalAreaStates }),
        ended: receipt.ended,
      },
      operations: ordered,
    },
  ];
}

export type CombatEffectCommandBatchPolicy = "initial" | "undo" | "redo";

export type CombatEffectCommandBatchPreparation =
  | { status: "prepared"; batch: Readonly<CombatEffectCommandBatch> }
  | { status: "rejected"; reason: "invalid-receipt" };

/**
 * Materialize the opaque child transition for a larger atomic action command.
 * This performs the full receipt proof but never looks up an adapter and never
 * mutates. The outer coordinator must stage this batch inside its own single CAS;
 * calling the child command executor would split one logical action in two.
 */
export function materializeCombatEffectCommandBatch(
  receipt: unknown,
  policy: CombatEffectCommandBatchPolicy
): CombatEffectCommandBatchPreparation {
  if (!validReceipt(receipt)) {
    return { status: "rejected", reason: "invalid-receipt" };
  }
  const transition =
    policy === "initial"
      ? (["forward", "available", "committed"] as const)
      : policy === "undo"
        ? (["reverse", "committed", "undone"] as const)
        : (["forward", "undone", "committed"] as const);
  const [batch] = batchGroups(receipt, transition[0], transition[1], transition[2]);
  return batch
    ? { status: "prepared", batch: frozen(batch) }
    : { status: "rejected", reason: "invalid-receipt" };
}

function appliedIdsMatch(
  result: Extract<CombatEffectAdapterApplyResult, { status: "applied" }>,
  batch: CombatEffectCommandBatch
): boolean {
  return (
    result.operationIds.length === batch.operations.length &&
    result.operationIds.every(
      (operationId, index) => operationId === batch.operations[index]?.operationId
    )
  );
}

function validApplyResult(value: unknown): value is CombatEffectAdapterApplyResult {
  if (!isRecord(value) || !nonEmpty(value.status)) return false;
  if (value.status === "applied") {
    return (
      exactKeys(value, ["status", "operationIds"]) &&
      Array.isArray(value.operationIds) &&
      value.operationIds.every(nonEmpty)
    );
  }
  if (value.status !== "rejected") return false;
  return (
    exactKeys(value, ["status", "reason"], ["actualCausalState"]) &&
    new Set(["stale-state", "causal-conflict", "failed"]).has(value.reason as string) &&
    (value.actualCausalState === undefined ||
      new Set(["available", "committed", "undone"]).has(
        value.actualCausalState as string
      ))
  );
}

async function executeReceipt(
  receipt: CombatEffectCommandReceipt,
  adapters: ReadonlyArray<CombatEffectCommandAdapter>,
  direction: CombatEffectCommandDirection,
  expectedCausalState: CombatEffectCausalState,
  nextCausalState: CombatEffectCausalState
): Promise<CombatEffectCommandResult> {
  const byId = adapterMap(adapters);
  if (!byId) return { status: "rejected", reason: "invalid-adapter" };
  const [batch] = batchGroups(receipt, direction, expectedCausalState, nextCausalState);
  if (!batch) return { status: "rejected", reason: "invalid-receipt" };
  const adapter = byId.get(batch.adapterId);
  if (!adapter || adapter.surface !== batch.surface) {
    return {
      status: "rejected",
      reason: "missing-adapter",
      adapterId: batch.adapterId,
    };
  }
  let result: CombatEffectAdapterApplyResult;
  try {
    result = await adapter.compareAndSwap(frozen(batch));
  } catch {
    result = { status: "rejected", reason: "failed" };
  }
  if (!validApplyResult(result)) result = { status: "rejected", reason: "failed" };
  if (result.status === "applied" && appliedIdsMatch(result, batch)) {
    return { status: "applied", receipt };
  }
  const reason =
    result.status === "applied" || result.reason === "failed"
      ? "adapter-failure"
      : result.reason === "stale-state"
        ? "stale-state"
        : direction === "forward" &&
            expectedCausalState === "available" &&
            result.actualCausalState === "committed"
          ? "duplicate-command"
          : "stale-command";
  return { status: "rejected", reason, adapterId: batch.adapterId };
}

/** Commit one fully reviewed plan. Every adapter batch is atomic. */
export async function commitCombatEffectPlan(
  plan: unknown,
  adapters: ReadonlyArray<CombatEffectCommandAdapter>,
  attempt = 0
): Promise<CombatEffectCommandResult> {
  const prepared = prepareCombatEffectCommand(plan, adapters, attempt);
  if (prepared.status === "rejected") return prepared;
  return executeReceipt(prepared.receipt, adapters, "forward", "available", "committed");
}

/** Exact causal inverse. Any intervening owned-field or command-state change rejects. */
export async function undoCombatEffectCommand(
  receipt: unknown,
  adapters: ReadonlyArray<CombatEffectCommandAdapter>
): Promise<CombatEffectCommandResult> {
  if (!validReceipt(receipt)) return { status: "rejected", reason: "invalid-receipt" };
  return executeReceipt(receipt, adapters, "reverse", "committed", "undone");
}

/** Reapply the same reviewed facts; no dice or choices are recomputed. */
export async function redoCombatEffectCommand(
  receipt: unknown,
  adapters: ReadonlyArray<CombatEffectCommandAdapter>
): Promise<CombatEffectCommandResult> {
  if (!validReceipt(receipt)) return { status: "rejected", reason: "invalid-receipt" };
  return executeReceipt(receipt, adapters, "forward", "undone", "committed");
}

export function serializeCombatEffectCommandReceipt(receipt: unknown): string {
  if (!validReceipt(receipt))
    throw new TypeError("Invalid combat-effect command receipt");
  return JSON.stringify(canonical(receipt as unknown as CombatEffectJson));
}
