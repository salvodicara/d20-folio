/** Pure disposable combat-effect planning state shared by local and encounter adapters. */

import type { CombatEffectLifetime, ConditionId, DamageSource } from "@/data/types";
import type { DamageType } from "@/types/damage";
import {
  atomicAddressKey,
  atomicDocumentForOwner,
  atomicDocumentKey,
  atomicEntityBindingKey,
  atomicLedgerForOwner,
  atomicOwnerKey,
  canonicalizeDamageDefenses,
  conformAtomicOccurrenceRuleIdentity,
  conformCombatEffectAtomicReadSet,
  type AtomicLifecycleHead,
  type AtomicOccurrenceHead,
  type AtomicDocumentRef,
  type AtomicOwner,
  type AtomicRead,
  type AtomicResourceSnapshot,
  type AtomicStateFlagBinding,
  type CombatEffectAtomicReadSet,
  type CombatEffectAtomicReadSetHeader,
} from "@/lib/combat-effect-atomic";
import {
  combatEffectOccurrenceId,
  combatEffectOccurrenceInitialHeadId,
  combatEffectOccurrenceFingerprint,
  type CombatEffectDamageComponent,
  type CombatEffectDisposableDraft,
  type CombatEffectDraftMutationResult,
  type CombatEffectEntityRef,
  type CombatEffectGeneratedMutationIntent,
  type CombatEffectMutation,
  type CombatEffectOccurrenceChange,
  type CombatEffectOccurrenceFingerprint,
  type CombatEffectPersistentConsequences,
  type CombatEffectPlanningState,
  type CombatEffectProvenance,
  type CombatEffectStateView,
} from "@/lib/combat-effect-program";
import { damageDefensesByEffects } from "@/lib/combat-effects";
import { isActiveCombatEffect } from "@/lib/combat-effect-io";
import { resolveCombatEffectGrants } from "@/lib/resolve-grant-sources";
import { reducePcDamage } from "@/lib/combat-transition";
import {
  resolveDamageIntake,
  type DamageDefenses,
  type ResolvedDamagePart,
} from "@/lib/damage-intake";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

export interface CombatEffectPlanningEntitySeed {
  /** Exact physical compare-and-swap owner; storage paths stay outside the rules core. */
  owner: AtomicOwner;
  /** Exact revisions of every physical document this owner reads or writes. */
  documentRevisions: ReadonlyArray<{
    document: AtomicDocumentRef;
    revision: number;
  }>;
  /** Every logical alias for this same physical draft state. */
  refs: ReadonlyArray<CombatEffectEntityRef>;
  /** Durable state only. Projected condition/standing occurrences belong in
   * `persistentEffects`, even when they share a semantic id with a base chip. */
  baseState: CombatEffectStateView;
  defenses: DamageDefenses;
  /** Complete logical resource bindings, including explicit `{ present: false }` reads. */
  resourceSnapshots: Readonly<Record<string, AtomicResourceSnapshot>>;
  /** Exact physical binding for every state flag exposed by `baseState`. */
  stateFlagBindings: Readonly<Record<string, AtomicStateFlagBinding>>;
  /** Full folded ledger snapshot, including inactive and terminal occurrences. */
  occurrenceHeads: ReadonlyArray<AtomicOccurrenceHead>;
  /** Exact lifecycle observations this owner can supply to a reviewed plan. */
  lifecycleHeads: ReadonlyArray<{
    header: CombatEffectAtomicReadSetHeader;
    expected: AtomicLifecycleHead;
  }>;
  /** Transitional one-shot floors that have not yet migrated to occurrences. */
  stateZeroHpFloors?: ReadonlyArray<{ stateKey: string; hitPoints: number }>;
}

interface PlanningEntity {
  owner: AtomicOwner;
  refs: ReadonlyArray<CombatEffectEntityRef>;
  state: CombatEffectStateView;
  defenses: DamageDefenses;
  resourceSnapshots: Readonly<Record<string, AtomicResourceSnapshot>>;
  resourceCapacities: Readonly<Record<string, number>>;
  stateFlagBindings: Readonly<Record<string, AtomicStateFlagBinding>>;
  occurrenceHeads: ReadonlyArray<AtomicOccurrenceHead>;
  lifecycleHeads: ReadonlyMap<string, AtomicLifecycleHead>;
  persistentEffects: PlanningPersistentEffect[];
  stateZeroHpFloors: ReadonlyArray<{ stateKey: string; hitPoints: number }>;
  virtualOccurrences: PlanningProgramOccurrence[];
}

interface PlanningProgramOccurrence {
  effectId: string;
  provenance: CombatEffectProvenance;
  recipient: CombatEffectEntityRef;
  descriptor:
    | {
        kind: "condition";
        condition: ConditionId;
        lifetime?: CombatEffectLifetime;
      }
    | {
        kind: "standing";
        effectId: string;
        lifetime?: CombatEffectLifetime;
      };
  headOpId: string;
  fingerprint: CombatEffectOccurrenceFingerprint;
  active: boolean;
}

interface PlanningPersistentEffect {
  effect: ActiveCombatEffect;
  headOpId: string;
  fingerprint: CombatEffectOccurrenceFingerprint;
}

interface PreparedDamageComponent {
  component: CombatEffectDamageComponent;
  amount: number;
  source?: DamageSource;
  delivery: "attack" | "save" | "automatic";
}

interface DamageGroup {
  components: PreparedDamageComponent[];
  amount: number;
  type: DamageType;
  source?: DamageSource;
  delivery: PreparedDamageComponent["delivery"];
}

function safeNonNegative(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function cloneRef(ref: CombatEffectEntityRef): CombatEffectEntityRef {
  if (ref.kind === "source") {
    if (typeof ref.id !== "string" || ref.id.length === 0) {
      throw new TypeError("Combat-effect source reference requires an id");
    }
    return { kind: "source", id: ref.id };
  }
  const { combatantId } = ref.target;
  if (typeof combatantId !== "string" || combatantId.length === 0) {
    throw new TypeError("Combat-effect target reference requires a combatant id");
  }
  return {
    kind: "target",
    target: { combatantId },
  };
}

function refKey(ref: CombatEffectEntityRef): string {
  return ref.kind === "source"
    ? JSON.stringify(["source", ref.id])
    : JSON.stringify(["target", ref.target.combatantId]);
}

function lifecycleHeaderKey(header: CombatEffectAtomicReadSetHeader): string {
  return JSON.stringify([header.occurrenceId, header.programId, header.sourceId]);
}

function snapshotCapacities(
  snapshots: Readonly<Record<string, AtomicResourceSnapshot>>
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(snapshots)
        .filter(
          (
            entry
          ): entry is [string, Extract<AtomicResourceSnapshot, { present: true }>] =>
            entry[1].present
        )
        .map(([resourceId, snapshot]) => [resourceId, snapshot.capacity])
    )
  );
}

function cloneState(state: CombatEffectStateView): CombatEffectStateView {
  const hp = safeNonNegative(state.hp, "Hit points");
  const maxHp = safeNonNegative(state.maxHp, "Maximum hit points");
  if (hp > maxHp) throw new RangeError("Hit points exceed the supplied maximum");
  const tempHp = safeNonNegative(state.tempHp, "Temporary hit points");
  const successes = safeNonNegative(state.deathSaves.successes, "Death-save successes");
  const failures = safeNonNegative(state.deathSaves.failures, "Death-save failures");
  if (successes > 3 || failures > 3) {
    throw new RangeError("Death saves exceed their limit");
  }
  if (typeof state.stable !== "boolean") {
    throw new TypeError("Stable state must be boolean");
  }
  const conditions = [...state.conditions].sort();
  const standing = [...state.standing].sort();
  if (new Set(conditions).size !== conditions.length) {
    throw new TypeError("Combat-effect state contains duplicate conditions");
  }
  if (
    standing.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(standing).size !== standing.length
  ) {
    throw new TypeError("Combat-effect state contains invalid standing effects");
  }
  if (
    Object.keys(state.conditionLifetimes).length !== conditions.length ||
    conditions.some((condition) => !Object.hasOwn(state.conditionLifetimes, condition))
  ) {
    throw new TypeError("Condition lifetimes must exactly match active conditions");
  }
  if (
    Object.keys(state.standingLifetimes).length !== standing.length ||
    standing.some((id) => !Object.hasOwn(state.standingLifetimes, id))
  ) {
    throw new TypeError("Standing lifetimes must exactly match active effects");
  }
  const conditionLifetimes = Object.fromEntries(
    conditions.map((condition) => [
      condition,
      structuredClone(state.conditionLifetimes[condition]),
    ])
  ) as Record<string, CombatEffectLifetime | null>;
  const standingLifetimes = Object.fromEntries(
    standing.map((id) => [id, structuredClone(state.standingLifetimes[id])])
  ) as Record<string, CombatEffectLifetime | null>;
  const resources = Object.fromEntries(
    Object.entries(state.resources).map(([id, amount]) => {
      if (id.length === 0) throw new TypeError("Resource ids cannot be empty");
      return [id, safeNonNegative(amount, `Resource ${id}`)];
    })
  );
  const stateFlags = Object.fromEntries(
    Object.entries(state.stateFlags).map(([id, active]) => {
      if (id.length === 0 || typeof active !== "boolean") {
        throw new TypeError("State flags require non-empty ids and boolean values");
      }
      return [id, active];
    })
  );
  return {
    hp,
    maxHp,
    tempHp,
    stable: state.stable,
    deathSaves: { successes, failures },
    conditions,
    conditionLifetimes,
    standing,
    standingLifetimes,
    resources,
    stateFlags,
  };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function immutableState(state: CombatEffectStateView): CombatEffectStateView {
  return deepFreeze(cloneState(state));
}

function cloneDefenses(defenses: DamageDefenses): DamageDefenses {
  if (typeof defenses.allDamageResistance !== "boolean") {
    throw new TypeError("All-damage resistance must be boolean");
  }
  return {
    allDamageResistance: defenses.allDamageResistance,
    resistances: new Set(defenses.resistances),
    immunities: new Set(defenses.immunities),
    vulnerabilities: new Set(defenses.vulnerabilities),
    sourceResistances: new Set(defenses.sourceResistances),
    flatReductions: defenses.flatReductions.map((reduction) => ({
      id: reduction.id,
      damageTypes: [...reduction.damageTypes],
      amount: safeNonNegative(reduction.amount, `Flat reduction ${reduction.id}`),
      trigger: reduction.trigger,
    })),
    saveDamageRules: defenses.saveDamageRules.map((rule) => ({ ...rule })),
  };
}

function effectTargetsRef(
  effect: ActiveCombatEffect,
  ref: CombatEffectEntityRef
): boolean {
  if (
    effect.target.combatantId !==
    (ref.kind === "source" ? ref.id : ref.target.combatantId)
  ) {
    return false;
  }
  return true;
}

function ownerProvenance(
  effect: ActiveCombatEffect,
  ref: CombatEffectEntityRef
): CombatEffectProvenance | null {
  const owner = effect.programOwner;
  if (!owner) return null;
  return {
    occurrenceId: owner.occurrenceId,
    programId: owner.programId,
    phaseId: owner.phaseId,
    stepId: owner.stepId,
    target: ref.kind === "target" ? { ...ref.target } : null,
    instance: owner.instance,
    iteration: owner.iteration,
  };
}

function expectedProgramEffectId(
  effect: ActiveCombatEffect,
  ref: CombatEffectEntityRef
): string | null {
  const provenance = ownerProvenance(effect, ref);
  if (!provenance) return null;
  if (effect.payload.kind === "condition") {
    return combatEffectOccurrenceId({
      kind: "condition",
      operation: "apply",
      condition: effect.payload.conditionId as ConditionId,
      provenance,
      recipient: ref,
    });
  }
  if (effect.payload.kind === "program-standing") {
    return combatEffectOccurrenceId({
      kind: "standing",
      operation: "start",
      effectId: effect.payload.effectId,
      provenance,
      recipient: ref,
    });
  }
  return null;
}

function activePersistentEffects(entity: PlanningEntity): ActiveCombatEffect[] {
  return entity.persistentEffects.map(({ effect }) => effect);
}

function cloneOccurrenceHeads(
  heads: CombatEffectPlanningEntitySeed["occurrenceHeads"],
  refs: ReadonlyArray<CombatEffectEntityRef>
): {
  heads: ReadonlyArray<AtomicOccurrenceHead>;
  active: PlanningPersistentEffect[];
} {
  const effectIds = new Set<string>();
  const headOpIds = new Set<string>();
  const clonedHeads = [...heads]
    .map((head, index) => {
      if (
        typeof head.effectId !== "string" ||
        head.effectId.length === 0 ||
        typeof head.headOpId !== "string" ||
        head.headOpId.length === 0 ||
        typeof head.active !== "boolean" ||
        typeof head.terminal !== "boolean" ||
        (head.terminal && head.active) ||
        effectIds.has(head.effectId) ||
        headOpIds.has(head.headOpId)
      ) {
        throw new TypeError(`Persistent combat effect ${index} has an invalid head`);
      }
      const effect = conformAtomicOccurrenceRuleIdentity(head.effect);
      if (!effect || !isActiveCombatEffect(effect) || effect.id !== head.effectId) {
        throw new TypeError(`Persistent combat effect ${index} is malformed`);
      }
      const matchingRefs = refs.filter((ref) => effectTargetsRef(effect, ref));
      if (matchingRefs.length === 0) {
        throw new TypeError(
          `Persistent combat effect ${effect.id} targets another entity`
        );
      }
      if (
        effect.programOwner &&
        (effect.payload.kind === "condition" ||
          effect.payload.kind === "program-standing") &&
        !matchingRefs.some((ref) => expectedProgramEffectId(effect, ref) === effect.id)
      ) {
        throw new TypeError(`Program combat effect ${effect.id} has stale ownership`);
      }
      if (
        effect.programOwner &&
        effect.payload.kind !== "condition" &&
        effect.payload.kind !== "program-standing"
      ) {
        throw new TypeError(`Program combat effect ${effect.id} has an invalid payload`);
      }
      effectIds.add(effect.id);
      headOpIds.add(head.headOpId);
      return {
        effectId: effect.id,
        headOpId: head.headOpId,
        active: head.active,
        terminal: head.terminal,
        effect,
      } satisfies AtomicOccurrenceHead;
    })
    .sort((left, right) => left.effectId.localeCompare(right.effectId));
  return {
    heads: Object.freeze(clonedHeads),
    active: clonedHeads
      .filter((head) => head.active)
      .map(({ effect, headOpId }) => ({
        effect: structuredClone(effect),
        headOpId,
        fingerprint: combatEffectOccurrenceFingerprint(effect),
      })),
  };
}

function cloneStateZeroHpFloors(
  floors: CombatEffectPlanningEntitySeed["stateZeroHpFloors"]
): ReadonlyArray<{ stateKey: string; hitPoints: number }> {
  const seen = new Set<string>();
  return Object.freeze(
    (floors ?? []).map((floor, index) => {
      if (
        typeof floor.stateKey !== "string" ||
        floor.stateKey.length === 0 ||
        seen.has(floor.stateKey)
      ) {
        throw new TypeError(`State zero-HP floor ${index} has an invalid key`);
      }
      seen.add(floor.stateKey);
      const hitPoints = safeNonNegative(
        floor.hitPoints,
        `State zero-HP floor ${floor.stateKey}`
      );
      if (hitPoints === 0) {
        throw new RangeError(`State zero-HP floor ${floor.stateKey} must be positive`);
      }
      return Object.freeze({ stateKey: floor.stateKey, hitPoints });
    })
  );
}

function cloneEntity(entity: PlanningEntity): PlanningEntity {
  return {
    owner: structuredClone(entity.owner),
    refs: entity.refs.map(cloneRef),
    state: cloneState(entity.state),
    defenses: entity.defenses,
    resourceSnapshots: structuredClone(entity.resourceSnapshots),
    resourceCapacities: entity.resourceCapacities,
    stateFlagBindings: structuredClone(entity.stateFlagBindings),
    occurrenceHeads: structuredClone(entity.occurrenceHeads),
    lifecycleHeads: new Map(
      [...entity.lifecycleHeads].map(([key, head]) => [key, structuredClone(head)])
    ),
    persistentEffects: entity.persistentEffects.map((effect) => structuredClone(effect)),
    stateZeroHpFloors: entity.stateZeroHpFloors,
    virtualOccurrences: entity.virtualOccurrences.map((occurrence) =>
      structuredClone(occurrence)
    ),
  };
}

function withoutKey<T>(
  record: Readonly<Record<string, T>>,
  key: string
): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== key));
}

function reconcileConditionLifetimes(
  state: CombatEffectStateView,
  conditions: ReadonlyArray<ConditionId>
): Record<string, CombatEffectStateView["conditionLifetimes"][string]> {
  return Object.fromEntries(
    conditions.map((condition) => {
      if (!Object.hasOwn(state.conditionLifetimes, condition)) {
        return [condition, null];
      }
      const lifetime = state.conditionLifetimes[condition];
      if (lifetime === undefined) {
        throw new TypeError("Active condition has no lifetime metadata");
      }
      return [condition, structuredClone(lifetime)];
    })
  );
}

function preparedAmount(
  component: CombatEffectDamageComponent,
  defenses: DamageDefenses
): number {
  const amount = safeNonNegative(
    component.amount,
    `Damage component ${component.stepId}`
  );
  const resolution = component.resolution;
  if (resolution.kind !== "gate" || resolution.gateKind !== "save") return amount;
  if (
    resolution.ability === undefined ||
    resolution.baselineSave === undefined ||
    (resolution.result !== "success" && resolution.result !== "failure")
  ) {
    throw new TypeError("Save damage requires typed ability, outcome, and baseline");
  }
  const baselineSave = resolution.baselineSave;
  const rule = defenses.saveDamageRules.find(
    (candidate) =>
      candidate.ability === resolution.ability &&
      baselineSave.success === candidate.requiresDamageOnSuccess
  );
  if (!rule) return amount;
  return resolution.result === "success" ? 0 : Math.floor(amount / 2);
}

function deliveryFor(
  component: CombatEffectDamageComponent
): PreparedDamageComponent["delivery"] {
  const resolution = component.resolution;
  if (resolution.kind === "unconditional") return "automatic";
  if (resolution.gateKind === "attack") {
    return resolution.result === "miss" ? "automatic" : "attack";
  }
  if (resolution.gateKind === "save") return "save";
  return "automatic";
}

function prepareDamageComponents(
  mutation: Extract<CombatEffectMutation, { kind: "damage" }>,
  defenses: DamageDefenses
): PreparedDamageComponent[] {
  if (mutation.components.length === 0) {
    throw new TypeError("Damage packets require at least one component");
  }
  const seen = new Set<string>();
  return mutation.components.map((component) => {
    if (component.stepId.length === 0 || seen.has(component.stepId)) {
      throw new TypeError("Damage component ids must be non-empty and unique");
    }
    seen.add(component.stepId);
    return {
      component,
      amount: preparedAmount(component, defenses),
      ...(component.damageSource === undefined && mutation.damageSource === undefined
        ? {}
        : { source: component.damageSource ?? mutation.damageSource }),
      delivery: deliveryFor(component),
    };
  });
}

function groupDamage(components: PreparedDamageComponent[]): DamageGroup[] {
  const groups = new Map<string, DamageGroup>();
  for (const component of components) {
    const key = JSON.stringify([
      component.component.damageType,
      component.source ?? null,
      component.delivery,
    ]);
    const prior = groups.get(key);
    if (prior) {
      prior.amount += component.amount;
      prior.components.push(component);
    } else {
      groups.set(key, {
        components: [component],
        amount: component.amount,
        type: component.component.damageType,
        ...(component.source === undefined ? {} : { source: component.source }),
        delivery: component.delivery,
      });
    }
  }
  return [...groups.values()];
}

function transformedPrefix(amount: number, resolved: ResolvedDamagePart): number {
  if (resolved.immune) return 0;
  const resisted = resolved.resisted ? Math.floor(amount / 2) : amount;
  return resolved.doubled ? resisted * 2 : resisted;
}

function distributeResolvedGroup(
  group: DamageGroup,
  resolved: ResolvedDamagePart
): Map<string, number> {
  let reduction = resolved.flatReduction;
  let prefix = 0;
  let priorNet = 0;
  const applied = new Map<string, number>();
  for (const { component, amount } of group.components) {
    const reduced = Math.min(amount, reduction);
    reduction -= reduced;
    prefix += amount - reduced;
    const net = transformedPrefix(prefix, resolved);
    applied.set(component.stepId, net - priorNet);
    priorNet = net;
  }
  if (priorNet !== resolved.net) {
    throw new TypeError("Resolved damage group could not preserve component totals");
  }
  return applied;
}

/** Canonical defense/effect reduction for one already-reviewed damage packet. */
export function resolveCombatEffectAppliedComponents(
  mutation: Extract<CombatEffectMutation, { kind: "damage" }>,
  defenses: DamageDefenses,
  persistentEffects: ReadonlyArray<ActiveCombatEffect> = []
): ReadonlyArray<{ stepId: string; appliedAmount: number }> {
  const effectiveDefenses = damageDefensesByEffects(defenses, persistentEffects);
  const prepared = prepareDamageComponents(mutation, effectiveDefenses);
  const groups = groupDamage(prepared);
  const activeGroups = groups.filter((group) => group.amount > 0);
  const resolved = resolveDamageIntake(
    activeGroups.map((group) => ({
      amount: group.amount,
      type: group.type,
      ...(group.source === undefined ? {} : { source: group.source }),
      delivery: group.delivery,
    })),
    effectiveDefenses
  );
  if (resolved.parts.length !== activeGroups.length) {
    throw new TypeError("Damage intake did not preserve packet groups");
  }
  const byStep = new Map(prepared.map(({ component }) => [component.stepId, 0]));
  activeGroups.forEach((group, index) => {
    const part = resolved.parts[index];
    if (!part) throw new TypeError("Damage intake omitted a packet group");
    for (const [stepId, amount] of distributeResolvedGroup(group, part)) {
      byStep.set(stepId, amount);
    }
  });
  return prepared.map(({ component }) => {
    const appliedAmount = byStep.get(component.stepId);
    if (appliedAmount === undefined) {
      throw new TypeError("Damage receipt omitted a component total");
    }
    return { stepId: component.stepId, appliedAmount };
  });
}

function typedConditions(
  prior: ReadonlyArray<ConditionId>,
  next: ReadonlyArray<string>
): ConditionId[] {
  return next.map((condition) => {
    const known = prior.find((candidate) => candidate === condition);
    if (known) return known;
    if (condition === "unconscious") return condition;
    throw new TypeError("Damage transition returned an unknown condition");
  });
}

function requiredResourceValue(
  values: Readonly<Record<string, number>>,
  resourceId: string,
  label: string
): number {
  const value = values[resourceId];
  if (value === undefined) throw new RangeError(`Resource ${resourceId} has no ${label}`);
  return value;
}

function sameProgramOccurrence(
  owner: Pick<CombatEffectProvenance, "occurrenceId" | "programId">,
  mutation: Readonly<CombatEffectMutation>
): boolean {
  return (
    owner.occurrenceId === mutation.provenance.occurrenceId &&
    owner.programId === mutation.provenance.programId
  );
}

function conditionPresent(entity: PlanningEntity, condition: ConditionId): boolean {
  return (
    entity.state.conditions.includes(condition) ||
    entity.persistentEffects.some(
      ({ effect }) =>
        effect.payload.kind === "condition" && effect.payload.conditionId === condition
    ) ||
    entity.virtualOccurrences.some(
      (occurrence) =>
        occurrence.active &&
        occurrence.descriptor.kind === "condition" &&
        occurrence.descriptor.condition === condition
    )
  );
}

function standingPresent(entity: PlanningEntity, effectId: string): boolean {
  return (
    entity.state.standing.includes(effectId) ||
    entity.persistentEffects.some(
      ({ effect }) =>
        effect.payload.kind === "program-standing" && effect.payload.effectId === effectId
    ) ||
    entity.virtualOccurrences.some(
      (occurrence) =>
        occurrence.active &&
        occurrence.descriptor.kind === "standing" &&
        occurrence.descriptor.effectId === effectId
    )
  );
}

function emptyPersistentConsequences(
  occurrenceChanges: ReadonlyArray<CombatEffectOccurrenceChange> = []
): CombatEffectPersistentConsequences {
  return { occurrenceChanges };
}

function createProgramOccurrence(
  entity: PlanningEntity,
  mutation: Extract<CombatEffectMutation, { kind: "condition" | "standing" }>
): CombatEffectPersistentConsequences {
  const effectId = combatEffectOccurrenceId(mutation);
  if (
    entity.occurrenceHeads.some((head) => head.effectId === effectId) ||
    entity.persistentEffects.some(({ effect }) => effect.id === effectId) ||
    entity.virtualOccurrences.some((occurrence) => occurrence.effectId === effectId)
  ) {
    throw new TypeError(`Program combat effect ${effectId} already exists`);
  }
  const headOpId = combatEffectOccurrenceInitialHeadId(effectId);
  const descriptor =
    mutation.kind === "condition"
      ? {
          kind: "condition" as const,
          condition: mutation.condition,
          ...(mutation.lifetime === undefined
            ? {}
            : { lifetime: structuredClone(mutation.lifetime) }),
        }
      : {
          kind: "standing" as const,
          effectId: mutation.effectId,
          ...(mutation.lifetime === undefined
            ? {}
            : { lifetime: structuredClone(mutation.lifetime) }),
        };
  entity.virtualOccurrences.push({
    effectId,
    provenance: structuredClone(mutation.provenance),
    recipient: cloneRef(mutation.recipient),
    descriptor,
    headOpId,
    fingerprint: {
      programOwner: {
        occurrenceId: mutation.provenance.occurrenceId,
        programId: mutation.provenance.programId,
        phaseId: mutation.provenance.phaseId,
        stepId: mutation.provenance.stepId,
        operationId: headOpId,
        instance: mutation.provenance.instance,
        iteration: mutation.provenance.iteration,
      },
      payload:
        mutation.kind === "condition"
          ? { kind: "condition", conditionId: mutation.condition }
          : { kind: "program-standing", effectId: mutation.effectId },
    },
    active: true,
  });
  return emptyPersistentConsequences([
    {
      effectId,
      provenance: structuredClone(mutation.provenance),
      recipient: cloneRef(mutation.recipient),
      expectedHeadOpId: null,
      expectedActive: false,
      active: true,
      reason: mutation.kind === "condition" ? "program-apply" : "program-start",
      descriptor: structuredClone(descriptor),
    },
  ]);
}

function removeProgramOccurrences(
  entity: PlanningEntity,
  mutation: Extract<CombatEffectMutation, { kind: "condition" | "standing" }>
): CombatEffectPersistentConsequences {
  const occurrences = new Map<
    string,
    { headOpId: string; fingerprint: CombatEffectOccurrenceFingerprint }
  >();
  for (const persistent of entity.persistentEffects) {
    const { effect } = persistent;
    const owner = effect.programOwner;
    if (!owner || !sameProgramOccurrence(owner, mutation)) continue;
    if (
      mutation.kind === "condition"
        ? effect.payload.kind === "condition" &&
          effect.payload.conditionId === mutation.condition
        : effect.payload.kind === "program-standing" &&
          effect.payload.effectId === mutation.effectId
    ) {
      occurrences.set(effect.id, {
        headOpId: persistent.headOpId,
        fingerprint: persistent.fingerprint,
      });
    }
  }
  for (const occurrence of entity.virtualOccurrences) {
    if (!occurrence.active || !sameProgramOccurrence(occurrence.provenance, mutation)) {
      continue;
    }
    if (
      mutation.kind === "condition"
        ? occurrence.descriptor.kind === "condition" &&
          occurrence.descriptor.condition === mutation.condition
        : occurrence.descriptor.kind === "standing" &&
          occurrence.descriptor.effectId === mutation.effectId
    ) {
      occurrences.set(occurrence.effectId, {
        headOpId: occurrence.headOpId,
        fingerprint: occurrence.fingerprint,
      });
      occurrence.active = false;
    }
  }
  entity.persistentEffects = entity.persistentEffects.filter(
    ({ effect }) => !occurrences.has(effect.id)
  );
  return emptyPersistentConsequences(
    [...occurrences]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([effectId, occurrence]) => ({
        effectId,
        provenance: structuredClone(mutation.provenance),
        recipient: cloneRef(mutation.recipient),
        expectedHeadOpId: occurrence.headOpId,
        expectedEffect: structuredClone(occurrence.fingerprint),
        expectedActive: true,
        active: false,
        reason: mutation.kind === "condition" ? "program-remove" : "program-end",
      }))
  );
}

class DisposableDraft implements CombatEffectDisposableDraft {
  private readonly entities: Map<string, PlanningEntity>;
  private readonly documentRevisions: ReadonlyMap<
    string,
    { document: AtomicDocumentRef; revision: number }
  >;

  constructor(
    entities: ReadonlyMap<string, PlanningEntity>,
    documentRevisions: ReadonlyMap<
      string,
      { document: AtomicDocumentRef; revision: number }
    >
  ) {
    const clones = new Map<string, PlanningEntity>();
    this.entities = new Map(
      [...entities].map(([key, entity]) => {
        const owner = atomicOwnerKey(entity.owner);
        const clone = clones.get(owner) ?? cloneEntity(entity);
        clones.set(owner, clone);
        return [key, clone] as const;
      })
    );
    this.documentRevisions = new Map(
      [...documentRevisions].map(([key, value]) => [
        key,
        { document: structuredClone(value.document), revision: value.revision },
      ])
    );
  }

  private uniqueEntities(): PlanningEntity[] {
    return [
      ...new Map(
        [...this.entities.values()].map((entity) => [
          atomicOwnerKey(entity.owner),
          entity,
        ])
      ).values(),
    ];
  }

  private entity(ref: CombatEffectEntityRef): PlanningEntity {
    const exact = cloneRef(ref);
    const entity = this.entities.get(refKey(exact));
    if (!entity)
      throw new RangeError("Combat-effect entity reference is missing or stale");
    return entity;
  }

  atomicReadSet(
    header: CombatEffectAtomicReadSetHeader
  ): Readonly<CombatEffectAtomicReadSet> {
    const uniqueEntities = this.uniqueEntities();
    const sourceEntity = uniqueEntities.find((entity) =>
      entity.refs.some((ref) => ref.kind === "source" && ref.id === header.sourceId)
    );
    if (!sourceEntity) {
      throw new RangeError("Combat-effect source has no atomic owner binding");
    }
    const lifecycle = sourceEntity.lifecycleHeads.get(lifecycleHeaderKey(header));
    if (!lifecycle) {
      throw new RangeError("Combat-effect lifecycle head is missing from the snapshot");
    }
    const bindings = uniqueEntities
      .flatMap((entity) =>
        entity.refs.map((ref) => ({ ref: cloneRef(ref), owner: entity.owner }))
      )
      .sort((left, right) =>
        atomicEntityBindingKey(left).localeCompare(atomicEntityBindingKey(right))
      );
    const reads: AtomicRead[] = [];
    const owners = [...uniqueEntities].sort((left, right) =>
      atomicOwnerKey(left.owner).localeCompare(atomicOwnerKey(right.owner))
    );
    for (const [documentKey, { document, revision }] of this.documentRevisions) {
      const entity = owners.find((candidate) =>
        [
          atomicDocumentForOwner(candidate.owner),
          atomicLedgerForOwner(candidate.owner),
        ].some(
          (candidateDocument) => atomicDocumentKey(candidateDocument) === documentKey
        )
      );
      if (!entity) {
        throw new TypeError("Combat-effect document has no bound owner");
      }
      reads.push({
        owner: entity.owner,
        address: { kind: "document-revision", document },
        expected: revision,
      });
    }
    for (const entity of uniqueEntities) {
      const baseState = cloneState(entity.state);
      reads.push(
        {
          owner: entity.owner,
          address: { kind: "base-state" },
          expected: {
            hp: baseState.hp,
            tempHp: baseState.tempHp,
            stable: baseState.stable,
            deathSaves: baseState.deathSaves,
            conditions: [...baseState.conditions].sort(),
            conditionLifetimes: baseState.conditionLifetimes,
            standing: [...baseState.standing].sort(),
            standingLifetimes: baseState.standingLifetimes,
            resources: Object.fromEntries(
              Object.keys(entity.resourceSnapshots)
                .sort()
                .map((resourceId) => [
                  resourceId,
                  entity.resourceSnapshots[resourceId]?.present
                    ? entity.resourceSnapshots[resourceId].current
                    : null,
                ])
            ),
            stateFlags: baseState.stateFlags,
          },
        },
        {
          owner: entity.owner,
          address: { kind: "max-hp" },
          expected: baseState.maxHp,
        },
        {
          owner: entity.owner,
          address: { kind: "damage-defenses" },
          expected: canonicalizeDamageDefenses(entity.defenses),
        },
        {
          owner: entity.owner,
          address: { kind: "zero-hp-floors" },
          expected: entity.stateZeroHpFloors,
        },
        {
          owner: entity.owner,
          address: { kind: "occurrence-heads" },
          expected: entity.occurrenceHeads,
        }
      );
      for (const [resourceId, expected] of Object.entries(entity.resourceSnapshots)) {
        reads.push({
          owner: entity.owner,
          address: { kind: "resource", programResourceId: resourceId },
          expected,
        });
      }
      for (const [stateKey, active] of Object.entries(baseState.stateFlags)) {
        const binding = entity.stateFlagBindings[stateKey];
        if (!binding) {
          throw new TypeError(`State flag ${stateKey} has no physical binding`);
        }
        reads.push({
          owner: entity.owner,
          address: { kind: "state-flag", stateKey },
          expected: { binding, active },
        });
      }
    }
    reads.push({
      owner: sourceEntity.owner,
      address: { kind: "lifecycle-head", ...header },
      expected: lifecycle,
    });
    reads.sort((left, right) =>
      atomicAddressKey(left.owner, left.address).localeCompare(
        atomicAddressKey(right.owner, right.address)
      )
    );
    const conformed = conformCombatEffectAtomicReadSet(
      { schema: 1, bindings, reads },
      header
    );
    if (!conformed) {
      throw new TypeError("Combat-effect seed could not build an atomic read set");
    }
    return conformed;
  }

  private recipientForCombatant(combatant: CombatantRef): CombatEffectEntityRef {
    const entities = this.uniqueEntities();
    const sourceMatches = entities.filter((entity) =>
      entity.refs.some((ref) => ref.kind === "source" && ref.id === combatant.combatantId)
    );
    const targetMatches = entities.filter((entity) => {
      return entity.refs.some(
        (ref) => ref.kind === "target" && ref.target.combatantId === combatant.combatantId
      );
    });
    const matches = [
      ...new Map(
        [...sourceMatches, ...targetMatches].map((entity) => [
          atomicOwnerKey(entity.owner),
          entity,
        ])
      ).values(),
    ];
    if (matches.length !== 1 || !matches[0]) {
      throw new RangeError(
        `Persistent damage target ${combatant.combatantId} is missing or ambiguous`
      );
    }
    const matchingRef = matches[0].refs.find((ref) =>
      ref.kind === "source"
        ? ref.id === combatant.combatantId
        : ref.target.combatantId === combatant.combatantId
    );
    if (!matchingRef) throw new TypeError("Persistent target alias vanished");
    return cloneRef(matchingRef);
  }

  read(ref: CombatEffectEntityRef): CombatEffectStateView {
    return immutableState(this.entity(ref).state);
  }

  resourceValue(ref: CombatEffectEntityRef, resourceId: string): number {
    const entity = this.entity(ref);
    const snapshot = entity.resourceSnapshots[resourceId];
    if (!snapshot) {
      throw new RangeError(`Resource ${resourceId} has no explicit atomic snapshot`);
    }
    return snapshot.present ? snapshot.current : 0;
  }

  conditionPresent(ref: CombatEffectEntityRef, condition: ConditionId): boolean {
    return conditionPresent(this.entity(ref), condition);
  }

  standingPresent(ref: CombatEffectEntityRef, effectId: string): boolean {
    if (typeof effectId !== "string" || effectId.length === 0) {
      throw new TypeError("Standing effect id must be non-empty");
    }
    return standingPresent(this.entity(ref), effectId);
  }

  apply(mutation: Readonly<CombatEffectMutation>): CombatEffectDraftMutationResult {
    const entity = this.entity(mutation.recipient);
    const before = immutableState(entity.state);
    let appliedAmount: number | undefined;
    let appliedComponents:
      | ReadonlyArray<{ stepId: string; appliedAmount: number }>
      | undefined;
    let persistentConsequences: CombatEffectPersistentConsequences | undefined;
    let generatedMutations: CombatEffectGeneratedMutationIntent[] | undefined;

    if (mutation.kind === "damage" || mutation.kind === "resolved-damage") {
      let critical = false;
      let transferPath: ReadonlyArray<string> = [];
      if (mutation.kind === "damage") {
        const resolved = resolveCombatEffectAppliedComponents(
          mutation,
          entity.defenses,
          activePersistentEffects(entity)
        );
        appliedComponents = resolved;
        appliedAmount = resolved.reduce(
          (sum, component) => sum + component.appliedAmount,
          0
        );
        critical = mutation.components.some((component, index) => {
          const applied = resolved[index];
          if (!applied) {
            throw new TypeError("Damage receipt omitted a component");
          }
          return component.resolution.criticalHit && applied.appliedAmount > 0;
        });
      } else {
        appliedAmount = safeNonNegative(mutation.amount, "Resolved damage amount");
        if (
          mutation.sourceEffectId.length === 0 ||
          mutation.transferPath.length === 0 ||
          mutation.transferPath.at(-1) !== mutation.sourceEffectId ||
          new Set(mutation.transferPath).size !== mutation.transferPath.length
        ) {
          throw new TypeError("Resolved damage requires an exact acyclic transfer path");
        }
        transferPath = mutation.transferPath;
      }
      const transition = reducePcDamage({
        state: {
          hp: {
            current: entity.state.hp,
            temp: entity.state.tempHp,
            max: entity.state.maxHp,
          },
          conditions: entity.state.conditions,
          deathSaves: entity.state.deathSaves,
        },
        intake: { stage: "resolved", amount: appliedAmount },
        ...(critical ? { crit: true } : {}),
        persistentEffects: activePersistentEffects(entity),
        stateZeroHpFloors: entity.stateZeroHpFloors.filter(
          (floor) => entity.state.stateFlags[floor.stateKey] === true
        ),
      });
      const activeOccurrences = new Map(
        entity.persistentEffects.map((occurrence) => [occurrence.effect.id, occurrence])
      );
      for (const effectId of transition.consumedEffectIds) {
        if (!activeOccurrences.has(effectId)) {
          throw new TypeError(`Damage consumed unknown combat effect ${effectId}`);
        }
      }
      entity.persistentEffects = entity.persistentEffects.filter(
        ({ effect }) => !transition.consumedEffectIds.includes(effect.id)
      );
      const occurrenceChanges: CombatEffectOccurrenceChange[] = [
        ...transition.consumedEffectIds,
      ]
        .sort()
        .map((effectId) => {
          const occurrence = activeOccurrences.get(effectId);
          if (!occurrence) {
            throw new TypeError(`Damage consumed unknown combat effect ${effectId}`);
          }
          return {
            effectId,
            provenance: structuredClone(mutation.provenance),
            recipient: cloneRef(mutation.recipient),
            expectedHeadOpId: occurrence.headOpId,
            expectedEffect: structuredClone(occurrence.fingerprint),
            expectedActive: true,
            active: false,
            reason: "damage-consume" as const,
          };
        });
      if (occurrenceChanges.length > 0) {
        persistentConsequences = emptyPersistentConsequences(occurrenceChanges);
      }
      generatedMutations = [
        ...transition.consumedStateKeys.map((stateKey) => {
          const floor = entity.stateZeroHpFloors.find(
            (candidate) => candidate.stateKey === stateKey
          );
          if (!floor || entity.state.stateFlags[stateKey] !== true) {
            throw new TypeError(`Damage consumed unknown state floor ${stateKey}`);
          }
          const recipient = cloneRef(mutation.recipient);
          return {
            mutation: {
              kind: "state-flag" as const,
              operation: "deactivate" as const,
              stateKey,
              provenance: structuredClone(mutation.provenance),
              recipient,
            },
            source: {
              kind: "state-flag" as const,
              recipient: cloneRef(mutation.recipient),
              stateKey,
              expectedActive: true as const,
              hitPoints: floor.hitPoints,
            },
          };
        }),
        ...transition.transfers.flatMap(
          (transfer): CombatEffectGeneratedMutationIntent[] => {
            if (transferPath.includes(transfer.effectId)) return [];
            const occurrence = activeOccurrences.get(transfer.effectId);
            if (!occurrence) {
              throw new TypeError(
                `Damage transfer read unknown combat effect ${transfer.effectId}`
              );
            }
            return [
              {
                mutation: {
                  kind: "resolved-damage",
                  amount: transfer.amount,
                  sourceEffectId: transfer.effectId,
                  transferPath: [...transferPath, transfer.effectId],
                  provenance: structuredClone(mutation.provenance),
                  recipient: this.recipientForCombatant(transfer.target),
                },
                source: {
                  kind: "effect-occurrence",
                  recipient: cloneRef(mutation.recipient),
                  effect: structuredClone(occurrence.effect),
                  expectedHeadOpId: occurrence.headOpId,
                  expectedActive: true,
                },
              },
            ];
          }
        ),
      ];
      const conditions = typedConditions(
        entity.state.conditions,
        transition.state.conditions
      );
      entity.state = {
        ...entity.state,
        hp: transition.state.hp.current,
        tempHp: transition.state.hp.temp,
        stable:
          appliedAmount > 0 &&
          (entity.state.hp === 0 || transition.crossedZero || transition.instantDeath)
            ? false
            : entity.state.stable,
        deathSaves: { ...transition.state.deathSaves },
        conditions,
        conditionLifetimes: reconcileConditionLifetimes(entity.state, conditions),
      };
    } else if (mutation.kind === "heal") {
      const amount = safeNonNegative(mutation.amount, "Healing amount");
      const prior = entity.state.hp;
      const next =
        entity.state.deathSaves.failures >= 3
          ? prior
          : Math.min(entity.state.maxHp, prior + amount);
      entity.state = {
        ...entity.state,
        hp: next,
        ...(prior === 0 && next > 0
          ? {
              stable: false,
              deathSaves: { successes: 0, failures: 0 },
              conditions: entity.state.conditions.filter(
                (condition) => condition !== "unconscious"
              ),
              conditionLifetimes: withoutKey(
                entity.state.conditionLifetimes,
                "unconscious"
              ),
            }
          : {}),
      };
      appliedAmount = next - prior;
    } else if (mutation.kind === "temp-hp") {
      const amount = safeNonNegative(mutation.amount, "Temporary hit-point amount");
      const prior = entity.state.tempHp;
      entity.state = { ...entity.state, tempHp: Math.max(prior, amount) };
      appliedAmount = entity.state.tempHp - prior;
    } else if (mutation.kind === "resource") {
      const amount = safeNonNegative(mutation.amount, "Resource amount");
      if (!Object.hasOwn(entity.state.resources, mutation.resourceId)) {
        throw new RangeError(`Resource ${mutation.resourceId} has no current state`);
      }
      if (!Object.hasOwn(entity.resourceCapacities, mutation.resourceId)) {
        throw new RangeError(`Resource ${mutation.resourceId} has no capacity metadata`);
      }
      const prior = requiredResourceValue(
        entity.state.resources,
        mutation.resourceId,
        "current state"
      );
      const capacity = requiredResourceValue(
        entity.resourceCapacities,
        mutation.resourceId,
        "capacity metadata"
      );
      if (prior > capacity) {
        throw new RangeError(`Resource ${mutation.resourceId} exceeds its capacity`);
      }
      if (mutation.operation === "spend" && amount > prior) {
        throw new RangeError(`Resource ${mutation.resourceId} is insufficient`);
      }
      appliedAmount =
        mutation.operation === "spend" ? amount : Math.min(amount, capacity - prior);
      entity.state = {
        ...entity.state,
        resources: {
          ...entity.state.resources,
          [mutation.resourceId]:
            mutation.operation === "spend"
              ? prior - appliedAmount
              : prior + appliedAmount,
        },
      };
    } else if (mutation.kind === "damage-reduction") {
      appliedAmount = Math.min(
        safeNonNegative(mutation.amount, "Damage-reduction amount"),
        safeNonNegative(mutation.triggeringDamage.amount, "Triggering damage")
      );
    } else if (mutation.kind === "condition" || mutation.kind === "standing") {
      persistentConsequences =
        mutation.operation === "apply" || mutation.operation === "start"
          ? createProgramOccurrence(entity, mutation)
          : removeProgramOccurrences(entity, mutation);
    } else if (mutation.kind === "state-flag") {
      if (!Object.hasOwn(entity.state.stateFlags, mutation.stateKey)) {
        throw new RangeError(`State flag ${mutation.stateKey} has no current state`);
      }
      const prior = entity.state.stateFlags[mutation.stateKey];
      const next = mutation.operation === "activate";
      if (prior === next) {
        throw new RangeError(
          `State flag ${mutation.stateKey} is already ${String(next)}`
        );
      }
      entity.state = {
        ...entity.state,
        stateFlags: { ...entity.state.stateFlags, [mutation.stateKey]: next },
      };
    } else if (entity.state.hp === 0 && entity.state.deathSaves.failures < 3) {
      entity.state = {
        ...entity.state,
        stable: true,
        deathSaves: { successes: 3, failures: 0 },
      };
    }

    const result = {
      before,
      after: immutableState(entity.state),
      ...(appliedAmount === undefined ? {} : { appliedAmount }),
      ...(appliedComponents === undefined ? {} : { appliedComponents }),
      ...(persistentConsequences === undefined ? {} : { persistentConsequences }),
      ...(generatedMutations?.length ? { generatedMutations } : {}),
    };
    return deepFreeze(result);
  }
}

/** Snapshot exact entity inputs once; every interpretation receives a fresh draft. */
export function createCombatEffectPlanningState(
  seeds: ReadonlyArray<CombatEffectPlanningEntitySeed>
): CombatEffectPlanningState {
  const entities = new Map<string, PlanningEntity>();
  const owners = new Map<string, PlanningEntity>();
  const documentRevisions = new Map<
    string,
    { document: AtomicDocumentRef; revision: number }
  >();
  const persistentEffectIds = new Set<string>();
  for (const seed of seeds) {
    const owner = structuredClone(seed.owner);
    const ownerId = atomicOwnerKey(owner);
    if (!Array.isArray(seed.documentRevisions)) {
      throw new TypeError("Combat-effect document revisions must be an array");
    }
    const suppliedDocumentRevisions: CombatEffectPlanningEntitySeed["documentRevisions"] =
      seed.documentRevisions;
    const requiredDocuments = new Map(
      [atomicDocumentForOwner(owner), atomicLedgerForOwner(owner)].map((document) => [
        atomicDocumentKey(document),
        document,
      ])
    );
    const suppliedDocuments = new Set<string>();
    for (const entry of suppliedDocumentRevisions) {
      const key = atomicDocumentKey(entry.document);
      if (suppliedDocuments.has(key)) {
        throw new TypeError("Duplicate combat-effect document revision");
      }
      suppliedDocuments.add(key);
      if (!requiredDocuments.has(key)) {
        throw new TypeError("Combat-effect seed supplied an unrelated document revision");
      }
      if (!Number.isSafeInteger(entry.revision) || entry.revision < 0) {
        throw new TypeError("Combat-effect document revision must be non-negative");
      }
      const prior = documentRevisions.get(key);
      if (prior && prior.revision !== entry.revision) {
        throw new TypeError("Conflicting combat-effect document revisions");
      }
      documentRevisions.set(key, {
        document: structuredClone(entry.document),
        revision: entry.revision,
      });
    }
    if (
      suppliedDocuments.size !== requiredDocuments.size ||
      [...requiredDocuments.keys()].some((key) => !suppliedDocuments.has(key))
    ) {
      throw new TypeError("Combat-effect seed is missing a required document revision");
    }
    if (!Array.isArray(seed.refs) || seed.refs.length === 0) {
      throw new TypeError("Combat-effect entity requires at least one reference");
    }
    const refs = seed.refs.map(cloneRef);
    if (new Set(refs.map(refKey)).size !== refs.length) {
      throw new TypeError("Duplicate combat-effect entity reference");
    }
    for (const ref of refs) {
      atomicEntityBindingKey({ ref, owner });
      if (entities.has(refKey(ref))) {
        throw new TypeError("Duplicate combat-effect entity reference");
      }
    }
    if (owners.has(ownerId)) {
      throw new TypeError("Duplicate combat-effect physical owner");
    }
    const occurrenceSnapshot = cloneOccurrenceHeads(seed.occurrenceHeads, refs);
    const persistentEffects = occurrenceSnapshot.active;
    for (const head of occurrenceSnapshot.heads) {
      if (persistentEffectIds.has(head.effectId)) {
        throw new TypeError(`Duplicate persistent combat effect ${head.effectId}`);
      }
      persistentEffectIds.add(head.effectId);
    }
    const resourceSnapshots = structuredClone(seed.resourceSnapshots);
    const resourceCapacities = snapshotCapacities(resourceSnapshots);
    const baseState = cloneState(seed.baseState);
    const resourceIds = Object.keys(resourceSnapshots).sort();
    for (const resourceId of resourceIds) {
      const snapshot = resourceSnapshots[resourceId];
      const current = baseState.resources[resourceId];
      if (
        !snapshot ||
        (snapshot.present
          ? current === undefined ||
            snapshot.current !== current ||
            snapshot.current > snapshot.capacity
          : current !== undefined)
      ) {
        throw new TypeError(`Resource ${resourceId} has inconsistent snapshot facts`);
      }
    }
    if (
      Object.keys(baseState.resources).some(
        (resourceId) => !Object.hasOwn(resourceSnapshots, resourceId)
      )
    ) {
      throw new TypeError("Resource snapshots must cover every exposed resource");
    }
    const flagKeys = Object.keys(baseState.stateFlags).sort();
    if (Object.keys(seed.stateFlagBindings).sort().join("\0") !== flagKeys.join("\0")) {
      throw new TypeError("State-flag bindings must exactly cover exposed flags");
    }
    for (const stateKey of flagKeys) {
      if (seed.stateFlagBindings[stateKey]?.activeKey !== stateKey) {
        throw new TypeError(`State flag ${stateKey} has a relabeled binding`);
      }
    }
    const lifecycleHeads = new Map<string, AtomicLifecycleHead>();
    for (const lifecycle of seed.lifecycleHeads) {
      const key = lifecycleHeaderKey(lifecycle.header);
      if (lifecycleHeads.has(key)) {
        throw new TypeError("Duplicate combat-effect lifecycle observation");
      }
      lifecycleHeads.set(key, structuredClone(lifecycle.expected));
    }
    const entity: PlanningEntity = {
      owner,
      refs,
      state: baseState,
      defenses: cloneDefenses(seed.defenses),
      resourceSnapshots,
      resourceCapacities,
      stateFlagBindings: structuredClone(seed.stateFlagBindings),
      occurrenceHeads: occurrenceSnapshot.heads,
      lifecycleHeads,
      persistentEffects,
      stateZeroHpFloors: cloneStateZeroHpFloors(seed.stateZeroHpFloors),
      virtualOccurrences: [],
    };
    for (const floor of entity.stateZeroHpFloors) {
      if (entity.state.stateFlags[floor.stateKey] !== true) {
        throw new TypeError(
          `State zero-HP floor ${floor.stateKey} requires an active state flag`
        );
      }
      for (const { effect } of entity.persistentEffects) {
        if (
          effect.payload.kind !== "grant-group" ||
          effect.payload.activeKey !== floor.stateKey
        ) {
          continue;
        }
        for (const grant of resolveCombatEffectGrants(effect)) {
          if (
            grant.type === "zero-hp-floor" &&
            Math.max(1, Math.round(grant.hitPoints)) !== floor.hitPoints
          ) {
            throw new TypeError(
              `Mirrored zero-HP floor ${floor.stateKey} disagrees with its occurrence`
            );
          }
        }
      }
    }
    for (const [resourceId, current] of Object.entries(entity.state.resources)) {
      const capacity = entity.resourceCapacities[resourceId];
      if (capacity !== undefined && current > capacity) {
        throw new RangeError(`Resource ${resourceId} exceeds its capacity`);
      }
    }
    owners.set(ownerId, entity);
    for (const ref of refs) entities.set(refKey(ref), entity);
  }
  return Object.freeze({
    createDisposableDraft: () => new DisposableDraft(entities, documentRevisions),
  });
}
