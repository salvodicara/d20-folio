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
import type { DamageSource, DamageType } from "@/data/types";

function scaledFlatAmount(
  amount: number,
  scaling: { baseLevel: number; perLevel: number } | undefined,
  castLevel?: number
): number {
  if (!scaling) return amount;
  const level = castLevel ?? scaling.baseLevel;
  return amount + Math.max(0, level - scaling.baseLevel) * scaling.perLevel;
}

function stackingKey(effect: ActiveCombatEffect): string {
  if (effect.payload.kind === "target-mark") {
    return [
      effect.actor.combatantId,
      effect.source.kind,
      effect.source.id,
      effect.payload.scope,
    ].join("\u0000");
  }
  if (effect.payload.kind === "condition") {
    return [
      effect.target.combatantId,
      effect.target.kind === "monster" ? (effect.target.tokenIndex ?? "") : "",
      effect.actor.combatantId,
      effect.source.kind,
      effect.source.id,
      effect.payload.kind,
      effect.payload.conditionId,
    ].join("\u0000");
  }
  return [
    effect.target.combatantId,
    effect.target.kind === "monster" ? (effect.target.tokenIndex ?? "") : "",
    effect.source.kind,
    effect.source.id,
    effect.payload.kind,
    effect.payload.activeKey,
  ].join("\u0000");
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
  currentHp: number;
  tempHp: number;
  incomingDamage: number;
  /** Raw typed damage from a chained rule. Direct resolver damage is already
   * defense-adjusted and deliberately leaves these absent. */
  damageType?: DamageType;
  damageSource?: DamageSource;
  defenses?: DamageDefenses;
}

export interface PersistentDamageOutcome {
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
  const postResistance = input.defenses
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
  const floor = rules
    .flatMap(({ effect, grants }) =>
      grants.flatMap((grant) =>
        grant.type === "zero-hp-floor"
          ? [{ effect, hitPoints: Math.max(1, Math.round(grant.hitPoints)) }]
          : []
      )
    )
    .sort((a, b) => b.hitPoints - a.hitPoints)[0];
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
  return {
    targetDamage,
    transfers,
    consumedEffectIds: [
      ...(triggersFloor && floor ? [floor.effect.id] : []),
      ...depletedTempHpEffectIds,
    ],
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

/**
 * Fold the append-only log into effective instances. Duplicate operation/effect ids
 * are harmless. Same-source effects do not stack; a newer instance permanently
 * supersedes the previous one, so revoking the replacement never resurrects stale
 * bonuses from an earlier cast.
 */
export function foldCombatEffectOps(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  position?: EncounterPosition
): ActiveCombatEffect[] {
  const seenOps = new Set<string>();
  const seenEffects = new Set<string>();
  const revoked = new Set<string>();
  const live = new Map<string, ActiveCombatEffect>();
  const latestByStackingKey = new Map<string, string>();

  for (const operation of operations ?? []) {
    if (seenOps.has(operation.id)) continue;
    seenOps.add(operation.id);
    if (operation.kind === "revoke") {
      revoked.add(operation.effectId);
      live.delete(operation.effectId);
      continue;
    }
    if (seenEffects.has(operation.effect.id)) continue;
    seenEffects.add(operation.effect.id);
    const key = stackingKey(operation.effect);
    const previousId = latestByStackingKey.get(key);
    if (previousId) live.delete(previousId);
    latestByStackingKey.set(key, operation.effect.id);
    if (!revoked.has(operation.effect.id))
      live.set(operation.effect.id, operation.effect);
  }

  return [...live.values()].filter((effect) =>
    isEffectActiveAtEncounterPosition(effect, position)
  );
}

export function effectsForTarget(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  targetId: string,
  position?: EncounterPosition,
  tokenIndex?: number
): ActiveCombatEffect[] {
  return foldCombatEffectOps(operations, position).filter(
    (effect) =>
      effect.target.combatantId === targetId &&
      (effect.target.kind !== "monster" || effect.target.tokenIndex === tokenIndex)
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
