/** Pure lifecycle algebra for campaign-scoped persistent combat effects. */

import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
  EncounterPosition,
} from "@/types/combat-effect";
import {
  resolveCombatEffectGrantGroup,
  resolveCombatEffectGrants,
} from "@/lib/resolve-grant-sources";
import type { Grant } from "@/lib/grants";
import { resolveDamageIntake, type DamageDefenses } from "@/lib/damage-intake";
import type { DamageSource } from "@/data/types";
import type { DamageType } from "@/types/damage";
import { conformCombatEffectOp } from "@/lib/combat-effect-io";

function scaledFlatAmount(
  amount: number,
  scaling: { baseLevel: number; perLevel: number } | undefined,
  castLevel?: number
): number {
  if (!scaling) return amount;
  const level = castLevel ?? scaling.baseLevel;
  return amount + Math.max(0, level - scaling.baseLevel) * scaling.perLevel;
}

function combatantStackingKey(ref: CombatantRef): string {
  return ref.kind === "monster"
    ? [ref.kind, ref.combatantId].join("\u0000")
    : [ref.kind, ref.combatantId, ref.memberUid, ref.characterId].join("\u0000");
}

function stackingKey(effect: ActiveCombatEffect): string {
  if (effect.payload.kind === "target-mark") {
    return [
      combatantStackingKey(effect.actor),
      effect.source.kind,
      effect.source.id,
      effect.payload.scope,
    ].join("\u0000");
  }
  if (effect.payload.kind === "condition") {
    return [
      combatantStackingKey(effect.target),
      combatantStackingKey(effect.actor),
      effect.source.kind,
      effect.source.id,
      effect.payload.kind,
      effect.payload.conditionId,
    ].join("\u0000");
  }
  return [
    combatantStackingKey(effect.target),
    effect.source.kind,
    effect.source.id,
    effect.payload.kind,
    effect.payload.activeKey,
  ].join("\u0000");
}

/** Apply the same occurrence stacking rules to a character's local effects that
 * the campaign append-only ledger uses. */
export function mergeActiveCombatEffects(
  current: ReadonlyArray<ActiveCombatEffect>,
  additions: ReadonlyArray<ActiveCombatEffect>
): ActiveCombatEffect[] {
  return foldCombatEffectOps(
    [...current, ...additions].map((effect) => ({
      id: `apply:${effect.id}`,
      kind: "apply" as const,
      effect,
    }))
  );
}

function scaledHpFlatForEffect(
  effect: ActiveCombatEffect,
  include: (grant: Extract<Grant, { type: "hp-flat" }>) => boolean
): number {
  if (effect.payload.kind !== "grant-group" || effect.payload.phase === "aftereffect")
    return 0;
  return resolveCombatEffectGrants(effect).reduce(
    (sum, grant) =>
      grant.type === "hp-flat" && include(grant)
        ? sum +
          scaledFlatAmount(grant.amount, grant.castLevelScaling, effect.source.castLevel)
        : sum,
    0
  );
}

/** Maximum-HP delta projected by this exact effect occurrence. */
export function maxHpDeltaForEffect(effect: ActiveCombatEffect): number {
  return scaledHpFlatForEffect(effect, () => true);
}

/** Expected current-HP delta at application time. IO persists the actually landed
 * value on `effect.applied.currentHpDelta`; revocation uses that stored inverse. */
export function currentHpDeltaForEffect(effect: ActiveCombatEffect): number {
  return scaledHpFlatForEffect(effect, (grant) => grant.adjustsCurrentHp === true);
}

export interface PersistentDamageInput {
  /** Whether `incomingDamage` still needs target defenses or is already the
   * post-defense amount accepted by the resolver. Persistent consequences such
   * as transfer and zero-HP floors run at either stage. */
  intake: "raw" | "resolved";
  currentHp: number;
  tempHp: number;
  incomingDamage: number;
  /** Raw typed damage from a chained rule. Direct resolver damage is already
   * defense-adjusted and deliberately leaves these absent. */
  damageType?: DamageType;
  damageSource?: DamageSource;
  defenses?: DamageDefenses;
  /** Active state-backed floors that have not yet migrated to an occurrence. */
  stateZeroHpFloors?: ReadonlyArray<{ stateKey: string; hitPoints: number }>;
}

export interface PersistentDamageOutcome {
  /** Damage after defenses, before a zero-HP floor changes the HP reduction. */
  resolvedDamage: number;
  /** Damage delivered to the ordinary temp-HP/current-HP reducer. */
  targetDamage: number;
  /** Remote source-side damage caused by target effects such as Warding Bond. */
  transfers: ReadonlyArray<{
    target: CombatantRef;
    amount: number;
    effectId: string;
  }>;
  /** Exact one-shot instances to revoke atomically with the damage. */
  consumedEffectIds: ReadonlyArray<string>;
  /** Exact state-backed floors to switch off atomically with the damage. */
  consumedStateKeys: ReadonlyArray<string>;
}

export interface PersistentHitInput {
  attacker: CombatantRef | null;
  attackMode?: "melee" | "ranged";
  tempHp: number;
}

export interface ActiveRollDieAdjustment {
  effect: ActiveCombatEffect;
  sourceId: string;
  rollType: "check" | "save" | "attack";
  operation: "add" | "subtract";
  dice: string;
  consume: "next" | "each";
}

export interface ActiveRollModeAdjustment {
  effect: ActiveCombatEffect;
  sourceId: string;
  rollType: "save" | "check" | "attack" | "initiative";
  mode: "advantage" | "disadvantage";
  consume: "next" | "each";
}

export interface ActiveIncomingAttackModeAdjustment {
  effect: ActiveCombatEffect;
  sourceId: string;
  mode: "advantage" | "disadvantage";
}

/** Physical roll adjustments projected by live target effects. */
export function activeRollDieAdjustments(
  effects: ReadonlyArray<ActiveCombatEffect>,
  rollType?: ActiveRollDieAdjustment["rollType"]
): ActiveRollDieAdjustment[] {
  return effects.flatMap((effect) =>
    resolveCombatEffectGrants(effect).flatMap((grant) =>
      grant.type === "roll-die-adjustment" &&
      (rollType === undefined || grant.rollType === rollType)
        ? [{ effect, sourceId: effect.source.id, ...grant }]
        : []
    )
  );
}

/** Advantage/disadvantage projected by live target effects. Passive character
 * clauses keep using the aggregate; this occurrence-aware view exists so a
 * `next` rule can be retired and restored atomically with the roll it affected. */
export function activeRollModeAdjustments(
  effects: ReadonlyArray<ActiveCombatEffect>,
  rollType?: ActiveRollModeAdjustment["rollType"]
): ActiveRollModeAdjustment[] {
  return effects.flatMap((effect) =>
    resolveCombatEffectGrants(effect).flatMap((grant) => {
      if (
        (grant.type !== "advantage-on" && grant.type !== "disadvantage-on") ||
        (rollType !== undefined && grant.rollType !== rollType)
      ) {
        return [];
      }
      return [
        {
          effect,
          sourceId: effect.source.id,
          rollType: grant.rollType,
          mode:
            grant.type === "advantage-on"
              ? ("advantage" as const)
              : ("disadvantage" as const),
          consume: grant.type === "disadvantage-on" ? (grant.consume ?? "each") : "each",
        },
      ];
    })
  );
}

/** Attack-roll mode imposed by effects on the selected target. Kept separate
 * from the actor's own roll clauses so Reckless/Faerie Fire can never invert. */
export function activeIncomingAttackModeAdjustments(
  effects: ReadonlyArray<ActiveCombatEffect>
): ActiveIncomingAttackModeAdjustment[] {
  return effects.flatMap((effect) =>
    resolveCombatEffectGrants(effect).flatMap((grant) =>
      grant.type === "incoming-attack-advantage" ||
      grant.type === "incoming-attack-disadvantage"
        ? [
            {
              effect,
              sourceId: effect.source.id,
              mode:
                grant.type === "incoming-attack-advantage"
                  ? ("advantage" as const)
                  : ("disadvantage" as const),
            },
          ]
        : []
    )
  );
}

/** Whether any live target-bound rule prevents Hit Point recovery. */
export function healingBlockedByEffects(
  effects: ReadonlyArray<ActiveCombatEffect>
): boolean {
  return effects.some((effect) =>
    resolveCombatEffectGrants(effect).some((grant) => grant.type === "healing-blocked")
  );
}

/** Fold context-free defensive grants into an existing defense view. Numeric,
 * unconditional flat reductions are safe here; PB- or equipment-gated
 * reductions still require character context and stay with the character
 * aggregate. */
export function mergeDamageDefenseGrants(
  base: DamageDefenses,
  grants: ReadonlyArray<Grant>
): DamageDefenses {
  let allDamageResistance = base.allDamageResistance;
  const resistances = new Set(base.resistances);
  const immunities = new Set(base.immunities);
  const vulnerabilities = new Set(base.vulnerabilities);
  const sourceResistances = new Set(base.sourceResistances);
  const flatReductions = [...base.flatReductions];
  const saveDamageRules = [...base.saveDamageRules];

  for (const grant of grants) {
    switch (grant.type) {
      case "all-damage-resistance":
        allDamageResistance = true;
        break;
      case "damage-resistance":
        resistances.add(grant.damageType);
        break;
      case "damage-immunity":
        immunities.add(grant.damageType);
        break;
      case "damage-vulnerability":
        vulnerabilities.add(grant.damageType);
        break;
      case "damage-resistance-source":
        sourceResistances.add(grant.source);
        break;
      case "flat-damage-reduction":
        if (
          grant.condition === undefined &&
          typeof grant.amount === "number" &&
          Number.isFinite(grant.amount) &&
          grant.amount > 0
        ) {
          flatReductions.push({
            id: `effect-flat-${flatReductions.length}`,
            damageTypes: grant.damageTypes,
            amount: grant.amount,
            trigger: grant.trigger,
          });
        }
        break;
      case "save-damage-rule":
        if (!grant.suppressedByConditions?.length) {
          saveDamageRules.push({
            id: `effect-save-${saveDamageRules.length}`,
            ability: grant.ability,
            requiresDamageOnSuccess: grant.requiresDamageOnSuccess,
            onSuccess: grant.onSuccess,
            onFailure: grant.onFailure,
          });
        }
        break;
    }
  }

  return {
    allDamageResistance,
    resistances,
    immunities,
    vulnerabilities,
    sourceResistances,
    flatReductions,
    saveDamageRules,
  };
}

/** Merge defenses projected by exact live effect occurrences into a target's
 * durable defenses without knowing any spell or feature ids. */
export function damageDefensesByEffects(
  base: DamageDefenses,
  effects: ReadonlyArray<ActiveCombatEffect>
): DamageDefenses {
  return mergeDamageDefenseGrants(
    base,
    effects.flatMap((effect) => resolveCombatEffectGrants(effect))
  );
}

/** Net temporary walking-speed delta projected by live target effects. */
export function speedAdjustmentByEffects(
  effects: ReadonlyArray<ActiveCombatEffect>
): number {
  return effects.reduce(
    (total, effect) =>
      total +
      resolveCombatEffectGrants(effect).reduce(
        (sum, grant) => sum + (grant.type === "speed" ? grant.amount : 0),
        0
      ),
    0
  );
}

type PersistentRetaliation = {
  actor: CombatantRef;
  target: CombatantRef;
  amount: number;
  damageType: Extract<Grant, { type: "damage-retaliation" }>["damageType"];
  effectId: string;
  sourceId: string;
};

/** Active effect occurrences whose rule explicitly depends on their Temporary HP
 * pool. A stronger replacement pool ends these occurrences. */
export function tempHpBoundEffectIds(
  effects: ReadonlyArray<ActiveCombatEffect>
): string[] {
  return effects.flatMap((effect) =>
    resolveCombatEffectGrants(effect).some((grant) => grant.type === "damage-retaliation")
      ? [effect.id]
      : []
  );
}

/** Resolve deterministic consequences of a successful attack hit. Damage itself is
 * reduced separately: retaliation can trigger even when the hit ultimately lands 0. */
export function resolvePersistentHit(
  effects: ReadonlyArray<ActiveCombatEffect>,
  input: PersistentHitInput
): ReadonlyArray<PersistentRetaliation> {
  if (!input.attacker || input.attackMode !== "melee" || input.tempHp <= 0) {
    return [];
  }
  const attacker = input.attacker;
  return effects.flatMap((effect) =>
    resolveCombatEffectGrants(effect).flatMap((grant) =>
      grant.type === "damage-retaliation"
        ? [
            {
              actor: effect.target,
              target: attacker,
              amount: scaledFlatAmount(
                grant.amount,
                grant.castLevelScaling,
                effect.source.castLevel
              ),
              damageType: grant.damageType,
              effectId: effect.id,
              sourceId: effect.source.id,
            },
          ]
        : []
    )
  );
}

/** Apply persistent incoming-damage rules without knowing any spell ids. */
export function resolvePersistentDamage(
  effects: ReadonlyArray<ActiveCombatEffect>,
  input: PersistentDamageInput
): PersistentDamageOutcome {
  const incomingDamage = Math.max(0, Math.round(input.incomingDamage));
  const currentHp = Math.max(0, Math.round(input.currentHp));
  const tempHp = Math.max(0, Math.round(input.tempHp));
  const rules = effects.map((effect) => ({
    effect,
    grants: resolveCombatEffectGrants(effect),
  }));
  const resistsAll = rules.some(({ grants }) =>
    grants.some((grant) => grant.type === "all-damage-resistance")
  );
  const postResistance =
    input.intake === "resolved"
      ? incomingDamage
      : input.defenses
        ? resolveDamageIntake(
            [
              {
                amount: incomingDamage,
                ...(input.damageType ? { type: input.damageType } : {}),
                ...(input.damageSource ? { source: input.damageSource } : {}),
              },
            ],
            {
              ...input.defenses,
              allDamageResistance: input.defenses.allDamageResistance || resistsAll,
            }
          ).netTotal
        : resistsAll
          ? Math.floor(incomingDamage / 2)
          : incomingDamage;
  const transfers = rules.flatMap(({ effect, grants }) =>
    postResistance > 0 && grants.some((grant) => grant.type === "damage-transfer")
      ? [{ target: effect.actor, amount: postResistance, effectId: effect.id }]
      : []
  );
  const effectFloors = rules.flatMap(({ effect, grants }) =>
    grants.flatMap((grant) =>
      grant.type === "zero-hp-floor"
        ? [
            {
              kind: "effect" as const,
              id: effect.id,
              activeKey:
                effect.payload.kind === "grant-group"
                  ? effect.payload.activeKey
                  : undefined,
              hitPoints: Math.max(1, Math.round(grant.hitPoints)),
            },
          ]
        : []
    )
  );
  const floor = [
    ...effectFloors,
    ...(input.stateZeroHpFloors ?? []).map((entry) => ({
      kind: "state" as const,
      id: entry.stateKey,
      activeKey: entry.stateKey,
      hitPoints: Math.max(1, Math.round(entry.hitPoints)),
    })),
  ].sort((a, b) => b.hitPoints - a.hitPoints)[0];
  const triggersFloor = Boolean(
    floor &&
    currentHp > 0 &&
    postResistance > tempHp &&
    postResistance - tempHp >= currentHp
  );
  const targetDamage =
    triggersFloor && floor
      ? tempHp + Math.max(0, currentHp - floor.hitPoints)
      : postResistance;
  const tempHpDepleted = tempHp > 0 && targetDamage >= tempHp;
  const depletedTempHpEffectIds = tempHpDepleted ? tempHpBoundEffectIds(effects) : [];
  // A local active-key and its campaign projection can briefly describe the SAME
  // ward. Consume both authorities when that shared key wins; consuming only one
  // lets the duplicate fire again on the next local reduction.
  const mirroredStateKey =
    triggersFloor && floor
      ? (input.stateZeroHpFloors ?? []).find(
          (entry) => entry.stateKey === floor.activeKey
        )?.stateKey
      : undefined;
  const mirroredEffectId =
    triggersFloor && floor
      ? effectFloors.find((entry) => entry.activeKey === floor.activeKey)?.id
      : undefined;
  return {
    resolvedDamage: postResistance,
    targetDamage,
    transfers,
    consumedEffectIds: [
      ...(triggersFloor && floor?.kind === "effect"
        ? [floor.id]
        : mirroredEffectId
          ? [mirroredEffectId]
          : []),
      ...depletedTempHpEffectIds,
    ].filter((id, index, ids) => ids.indexOf(id) === index),
    consumedStateKeys:
      triggersFloor && floor
        ? floor.kind === "state"
          ? [floor.id]
          : mirroredStateKey
            ? [mirroredStateKey]
            : []
        : [],
  };
}

/**
 * Whether an effect has not yet reached its deterministic turn boundary.
 * Concentration and encounter lifetimes end through explicit revoke/clear.
 */
export function isEffectActiveAtEncounterPosition(
  effect: ActiveCombatEffect,
  position?: EncounterPosition
): boolean {
  if (!position || effect.duration.kind !== "turn-boundary") return true;
  const boundaryIndex = position.order.indexOf(effect.duration.combatantId);
  const currentIndex = position.currentCombatantId
    ? position.order.indexOf(position.currentCombatantId)
    : -1;
  if (boundaryIndex < 0 || currentIndex < 0) return true;

  if (position.round !== effect.duration.round) {
    return position.round < effect.duration.round;
  }
  if (currentIndex !== boundaryIndex) return currentIndex < boundaryIndex;
  const phaseIndex = position.phase === "turn-start" ? 0 : 1;
  const boundaryPhaseIndex = effect.duration.phase === "turn-start" ? 0 : 1;
  return phaseIndex < boundaryPhaseIndex;
}

export interface CombatEffectOccurrenceState {
  /** Immutable occurrence payload established by its first accepted apply. */
  readonly effect: ActiveCombatEffect;
  /** Current compare-and-swap head, including a terminal legacy revoke. */
  readonly headOpId: string;
  readonly active: boolean;
  /** Legacy revoke is intentionally one-way; authored set-active cannot follow it. */
  readonly terminal: boolean;
}

function operationOwnsOccurrence(
  operation: Exclude<CombatEffectOp, { kind: "apply" }>,
  occurrence: CombatEffectOccurrenceState
): boolean {
  return (
    operation.effectId === occurrence.effect.id &&
    operation.actorId === occurrence.effect.actor.combatantId &&
    operation.targetId === occurrence.effect.target.combatantId
  );
}

/**
 * Fold every accepted occurrence without applying stacking or clock projection.
 * Duplicate apply retries, stale heads, mismatched ownership, and operations after
 * a terminal legacy revoke are ignored at this tolerant read boundary.
 */
export function foldCombatEffectOccurrences(
  operations: ReadonlyArray<CombatEffectOp> | undefined
): CombatEffectOccurrenceState[] {
  const seenOps = new Set<string>();
  const occurrences = new Map<string, CombatEffectOccurrenceState>();

  for (const operation of operations ?? []) {
    if (seenOps.has(operation.id)) continue;
    if (operation.kind === "apply") {
      if (occurrences.has(operation.effect.id)) continue;
      seenOps.add(operation.id);
      occurrences.set(operation.effect.id, {
        effect: operation.effect,
        headOpId: operation.id,
        active: true,
        terminal: false,
      });
      continue;
    }

    const current = occurrences.get(operation.effectId);
    if (!current || current.terminal || !operationOwnsOccurrence(operation, current)) {
      continue;
    }
    if (operation.kind === "revoke") {
      seenOps.add(operation.id);
      occurrences.set(operation.effectId, {
        ...current,
        headOpId: operation.id,
        active: false,
        terminal: true,
      });
      continue;
    }
    if (
      operation.expectedHeadOpId !== current.headOpId ||
      operation.active === current.active
    ) {
      continue;
    }
    seenOps.add(operation.id);
    occurrences.set(operation.effectId, {
      ...current,
      headOpId: operation.id,
      active: operation.active,
    });
  }

  return [...occurrences.values()];
}

/** Current causal state for one exact occurrence, independent of stacking/expiry. */
export function combatEffectOccurrenceState(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  effectId: string
): CombatEffectOccurrenceState | null {
  return (
    foldCombatEffectOccurrences(operations).find(
      (occurrence) => occurrence.effect.id === effectId
    ) ?? null
  );
}

/**
 * Strict authored compare-and-swap append. Unlike tolerant reads, a duplicate,
 * stale, mismatched, terminal, or no-op status request is rejected as `null`.
 */
export function appendCombatEffectStatusOp(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  operation: Extract<CombatEffectOp, { kind: "set-active" }>
): CombatEffectOp[] | null {
  const current = operations ?? [];
  if (
    !operation.id ||
    !operation.effectId ||
    !operation.actorId ||
    !operation.targetId ||
    !operation.expectedHeadOpId ||
    current.some((candidate) => candidate.id === operation.id)
  ) {
    return null;
  }
  const occurrence = combatEffectOccurrenceState(current, operation.effectId);
  if (
    !occurrence ||
    occurrence.terminal ||
    occurrence.headOpId !== operation.expectedHeadOpId ||
    occurrence.active === operation.active ||
    !operationOwnsOccurrence(operation, occurrence)
  ) {
    return null;
  }
  return [...current, operation];
}

/** Tolerant untrusted ledger boundary. Structurally invalid, duplicate, stale,
 * mismatched, or no-op entries are omitted instead of entering engine consumers. */
export function conformCombatEffectOps(value: unknown): CombatEffectOp[] {
  if (!Array.isArray(value)) return [];
  let valid: CombatEffectOp[] = [];
  for (const candidate of value) {
    let operation: CombatEffectOp | null;
    try {
      operation = conformCombatEffectOp(candidate);
    } catch {
      continue;
    }
    if (!operation) continue;
    if (operation.kind === "apply") {
      if (
        valid.some(({ id }) => id === operation.id) ||
        combatEffectOccurrenceState(valid, operation.effect.id)
      ) {
        continue;
      }
      valid.push(operation);
      continue;
    }
    if (operation.kind === "set-active") {
      const appended = appendCombatEffectStatusOp(valid, operation);
      if (appended) valid = appended;
      continue;
    }
    if (valid.some(({ id }) => id === operation.id)) continue;
    const occurrence = combatEffectOccurrenceState(valid, operation.effectId);
    if (
      !occurrence ||
      occurrence.terminal ||
      !operationOwnsOccurrence(operation, occurrence)
    ) {
      continue;
    }
    valid.push(operation);
  }
  return valid;
}

/**
 * Fold the append-only log into effective instances. Same-source effects keep the
 * existing non-stacking rule: the newest occurrence permanently supersedes the
 * older one even while inactive or expired, so stale bonuses never resurrect.
 */
export function foldCombatEffectOps(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  position?: EncounterPosition
): ActiveCombatEffect[] {
  const occurrences = foldCombatEffectOccurrences(operations);
  const latestByStackingKey = new Map<string, string>();
  for (const { effect } of occurrences) {
    latestByStackingKey.set(stackingKey(effect), effect.id);
  }
  return occurrences.flatMap(({ effect, active }) =>
    active &&
    latestByStackingKey.get(stackingKey(effect)) === effect.id &&
    isEffectActiveAtEncounterPosition(effect, position)
      ? [effect]
      : []
  );
}

export function effectsForTarget(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  targetId: string,
  position?: EncounterPosition
): ActiveCombatEffect[] {
  return foldCombatEffectOps(operations, position).filter(
    (effect) => effect.target.combatantId === targetId
  );
}

export function effectsByActorSource(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  actorId: string,
  sourceId: string
): ActiveCombatEffect[] {
  return foldCombatEffectOps(operations).filter(
    (effect) => effect.actor.combatantId === actorId && effect.source.id === sourceId
  );
}

/** Live concentration-owned occurrences that must end when their actor becomes
 * incapacitated. The effect payload is deliberately irrelevant: one lifecycle
 * rule covers grants, marks, conditions, and future payload kinds. */
export function concentrationEffectIdsOwnedBy(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  actorId: string
): string[] {
  return foldCombatEffectOps(operations).flatMap((effect) =>
    effect.actor.combatantId === actorId && effect.duration.kind === "concentration"
      ? [effect.id]
      : []
  );
}

/** Revoke every live occurrence projecting one condition onto a target. This is
 * the pure DM-override/cure twin of the transactional IO path: manual/base state
 * is handled by its own reducer, while exact source occurrences get inverse ops. */
export function revokeConditionEffectOps(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  targetId: string,
  conditionId: string
): CombatEffectOp[] {
  const current = operations ?? [];
  const inverses = foldCombatEffectOps(current).flatMap((effect) =>
    effect.target.combatantId === targetId &&
    effect.payload.kind === "condition" &&
    effect.payload.conditionId === conditionId
      ? [
          {
            id: `revoke:${effect.id}`,
            kind: "revoke" as const,
            effectId: effect.id,
            actorId: effect.actor.combatantId,
            targetId: effect.target.combatantId,
          },
        ]
      : []
  );
  return inverses.length > 0 ? [...current, ...inverses] : [...current];
}

/** Live instances that crossed a deterministic turn boundary at this position. */
export function expiredCombatEffects(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  position: EncounterPosition
): ActiveCombatEffect[] {
  return foldCombatEffectOps(operations).filter(
    (effect) => !isEffectActiveAtEncounterPosition(effect, position)
  );
}

/** Exact selected creature for an actor's live marked/cursed rider. */
export function markedTargetForActor(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  actorId: string,
  scope: "marked" | "cursed" | "vowed",
  position?: EncounterPosition
): CombatantRef | null {
  const effect = foldCombatEffectOps(operations, position).find(
    (candidate) =>
      candidate.actor.combatantId === actorId &&
      candidate.payload.kind === "target-mark" &&
      candidate.payload.scope === scope
  );
  return effect?.target ?? null;
}

export function turnBoundaryAfter(
  targetId: string,
  turns: number,
  phase: "turn-start" | "turn-end",
  position: EncounterPosition
): Extract<ActiveCombatEffect["duration"], { kind: "turn-boundary" }> | null {
  const targetIndex = position.order.indexOf(targetId);
  const currentIndex = position.currentCombatantId
    ? position.order.indexOf(position.currentCombatantId)
    : -1;
  if (targetIndex < 0 || currentIndex < 0 || turns < 1) return null;
  const phaseIndex = phase === "turn-start" ? 0 : 1;
  const currentPhaseIndex = position.phase === "turn-start" ? 0 : 1;
  const stillAhead =
    targetIndex > currentIndex ||
    (targetIndex === currentIndex && phaseIndex > currentPhaseIndex);
  return {
    kind: "turn-boundary",
    combatantId: targetId,
    round: position.round + (stillAhead ? 0 : 1) + turns - 1,
    phase,
  };
}

/** Data-declared successor created when an active effect ends (for example Haste's
 * one-turn lethargy). Returns null when the source has no aftereffect or the target
 * is absent from the encounter order. */
export function endedEffectSuccessor(
  effect: ActiveCombatEffect,
  position: EncounterPosition
): ActiveCombatEffect | null {
  if (effect.payload.kind !== "grant-group" || effect.payload.phase === "aftereffect")
    return null;
  const group = resolveCombatEffectGrantGroup(effect);
  const after = group?.afterEffect;
  if (!after) return null;
  const duration = turnBoundaryAfter(
    effect.target.combatantId,
    after.duration.turns,
    after.duration.phase,
    position
  );
  if (!duration) return null;
  return {
    id: `${effect.id}:aftereffect`,
    actor: effect.actor,
    target: effect.target,
    source: effect.source,
    payload: { ...effect.payload, phase: "aftereffect" },
    ...(effect.bindings ? { bindings: effect.bindings } : {}),
    duration,
  };
}
