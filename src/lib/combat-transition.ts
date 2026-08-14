/** Pure PC damage-state transitions shared by solo and encounter adapters. */

import type { DamageSource } from "@/data/types";
import type { DamageType } from "@/types/damage";
import { resolvePersistentDamage, resolvePersistentHit } from "@/lib/combat-effects";
import { applyDamage } from "@/lib/combat-hp";
import {
  deathSaveFailuresFromDamage,
  isInstantDeathAtZero,
  isMassiveDamageDeath,
  type DamageDefenses,
} from "@/lib/damage-intake";
import { DEATH_FAIL_LIMIT } from "@/lib/character-status";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

const UNCONSCIOUS = "unconscious";

export interface PcDamageState {
  hp: { current: number; temp: number; max: number };
  conditions: ReadonlyArray<string>;
  deathSaves: { successes: number; failures: number };
}

export type PcDamageIntake =
  | { stage: "resolved"; amount: number }
  | {
      stage: "raw";
      amount: number;
      damageType?: DamageType;
      damageSource?: DamageSource;
      defenses?: DamageDefenses;
    };

export type PcDamageTransitionEvent =
  | {
      kind: "hp-damage";
      /** Post-defense damage before a zero-HP floor or HP floor caps it. */
      incoming: number;
      /** Current + Temporary HP actually removed by this transition. */
      applied: number;
      current: number;
      max: number;
      tempAbsorbed?: number;
    }
  | { kind: "down" }
  | { kind: "condition-gain" | "condition-loss"; conditionId: string }
  | {
      kind: "death-save";
      outcome: "failure";
      successes: number;
      failures: number;
    };

export interface PcDamageTransitionInput {
  state: PcDamageState;
  intake: PcDamageIntake;
  crit?: boolean;
  persistentEffects?: ReadonlyArray<ActiveCombatEffect>;
  /** Transitional state-backed floors that do not yet have an occurrence id. */
  stateZeroHpFloors?: ReadonlyArray<{
    stateKey: string;
    hitPoints: number;
  }>;
  hit?: {
    attacker: CombatantRef | null;
    attackMode?: "melee" | "ranged";
  };
}

export interface PcDamageTransitionResult {
  state: PcDamageState;
  resolvedDamage: number;
  targetDamage: number;
  crossedZero: boolean;
  instantDeath: boolean;
  events: ReadonlyArray<PcDamageTransitionEvent>;
  transfers: ReturnType<typeof resolvePersistentDamage>["transfers"];
  retaliations: ReturnType<typeof resolvePersistentHit>;
  consumedEffectIds: ReadonlyArray<string>;
  consumedStateKeys: ReadonlyArray<string>;
  changed: boolean;
}

/** Reduce one entered hit without IO, localization, source-id branches, or dice. */
export function reducePcDamage(input: PcDamageTransitionInput): PcDamageTransitionResult {
  const max = Math.max(0, Math.round(input.state.hp.max));
  const current = Math.max(0, Math.min(max, Math.round(input.state.hp.current)));
  const temp = Math.max(0, Math.round(input.state.hp.temp));
  const deathSaves = {
    successes: Math.max(
      0,
      Math.min(DEATH_FAIL_LIMIT, Math.round(input.state.deathSaves.successes))
    ),
    failures: Math.max(
      0,
      Math.min(DEATH_FAIL_LIMIT, Math.round(input.state.deathSaves.failures))
    ),
  };
  const baseState: PcDamageState = {
    hp: { current, temp, max },
    conditions: [...input.state.conditions],
    deathSaves,
  };
  const empty = (
    overrides: Partial<PcDamageTransitionResult> = {}
  ): PcDamageTransitionResult => ({
    state: baseState,
    resolvedDamage: 0,
    targetDamage: 0,
    crossedZero: false,
    instantDeath: false,
    events: [],
    transfers: [],
    retaliations: [],
    consumedEffectIds: [],
    consumedStateKeys: [],
    changed: false,
    ...overrides,
  });

  if (deathSaves.failures >= DEATH_FAIL_LIMIT) return empty();

  const persistentEffects = input.persistentEffects ?? [];
  const retaliations = input.hit
    ? resolvePersistentHit(persistentEffects, {
        ...input.hit,
        tempHp: temp,
      })
    : [];
  const persistent = resolvePersistentDamage(persistentEffects, {
    intake: input.intake.stage,
    currentHp: current,
    tempHp: temp,
    incomingDamage: input.intake.amount,
    ...(input.intake.stage === "raw"
      ? {
          ...(input.intake.damageType ? { damageType: input.intake.damageType } : {}),
          ...(input.intake.damageSource
            ? { damageSource: input.intake.damageSource }
            : {}),
          ...(input.intake.defenses ? { defenses: input.intake.defenses } : {}),
        }
      : {}),
    stateZeroHpFloors: input.stateZeroHpFloors,
  });

  if (persistent.resolvedDamage <= 0) {
    return empty({
      retaliations,
      transfers: persistent.transfers,
      consumedEffectIds: persistent.consumedEffectIds,
      consumedStateKeys: persistent.consumedStateKeys,
      changed:
        retaliations.length > 0 ||
        persistent.transfers.length > 0 ||
        persistent.consumedEffectIds.length > 0 ||
        persistent.consumedStateKeys.length > 0,
    });
  }

  const afterHp = applyDamage(current, temp, persistent.targetDamage);
  const tempAbsorbed = temp - afterHp.temp;
  const applied = tempAbsorbed + current - afterHp.current;
  let nextConditions = [...input.state.conditions];
  let nextDeathSaves = deathSaves;
  let crossedZero = false;
  let instantDeath = false;
  const events: PcDamageTransitionEvent[] = [
    {
      kind: "hp-damage",
      incoming: persistent.resolvedDamage,
      applied,
      current: afterHp.current,
      max,
      ...(tempAbsorbed > 0 ? { tempAbsorbed } : {}),
    },
  ];

  if (current === 0) {
    instantDeath = isInstantDeathAtZero(persistent.resolvedDamage, max);
    nextDeathSaves = {
      successes: 0,
      failures: instantDeath
        ? DEATH_FAIL_LIMIT
        : Math.min(
            DEATH_FAIL_LIMIT,
            deathSaves.failures + deathSaveFailuresFromDamage(input.crit === true)
          ),
    };
    if (
      nextDeathSaves.failures >= DEATH_FAIL_LIMIT &&
      nextConditions.includes(UNCONSCIOUS)
    ) {
      nextConditions = nextConditions.filter((condition) => condition !== UNCONSCIOUS);
      events.push({ kind: "condition-loss", conditionId: UNCONSCIOUS });
    }
    events.push({ kind: "death-save", outcome: "failure", ...nextDeathSaves });
  } else if (afterHp.current === 0) {
    crossedZero = true;
    instantDeath = isMassiveDamageDeath(persistent.targetDamage, current, temp, max);
    nextDeathSaves = {
      successes: 0,
      failures: instantDeath ? DEATH_FAIL_LIMIT : 0,
    };
    const hadUnconscious = nextConditions.includes(UNCONSCIOUS);
    if (instantDeath) {
      if (hadUnconscious) {
        nextConditions = nextConditions.filter((condition) => condition !== UNCONSCIOUS);
        events.push({ kind: "condition-loss", conditionId: UNCONSCIOUS });
      }
      events.push({ kind: "death-save", outcome: "failure", ...nextDeathSaves });
    } else if (!hadUnconscious) {
      nextConditions.push(UNCONSCIOUS);
      events.push({ kind: "condition-gain", conditionId: UNCONSCIOUS });
    }
    events.push({ kind: "down" });
  }

  const state: PcDamageState = {
    hp: { current: afterHp.current, temp: afterHp.temp, max },
    conditions: nextConditions,
    deathSaves: nextDeathSaves,
  };
  return {
    state,
    resolvedDamage: persistent.resolvedDamage,
    targetDamage: persistent.targetDamage,
    crossedZero,
    instantDeath,
    events,
    transfers: persistent.transfers,
    retaliations,
    consumedEffectIds: persistent.consumedEffectIds,
    consumedStateKeys: persistent.consumedStateKeys,
    changed:
      state.hp.current !== input.state.hp.current ||
      state.hp.temp !== input.state.hp.temp ||
      state.conditions.join("\u0000") !== input.state.conditions.join("\u0000") ||
      state.deathSaves.successes !== input.state.deathSaves.successes ||
      state.deathSaves.failures !== input.state.deathSaves.failures ||
      persistent.transfers.length > 0 ||
      retaliations.length > 0 ||
      persistent.consumedEffectIds.length > 0 ||
      persistent.consumedStateKeys.length > 0,
  };
}
