/**
 * Taking damage, as a pure play transition: the character and the entered hit in,
 * the next session plus what the store still reacts to (log beats, consumed effects)
 * out. The packet rule itself is `reducePcDamage`; this composes it with the zero-HP
 * floors, the consumed standing states and the world commit.
 */
import { aggregateCharacterGrants, effectiveMaxHp } from "@/lib/aggregate-character";
import {
  reducePcDamage,
  type PcDamageTransitionInput,
  type PcDamageTransitionResult,
} from "@/lib/combat-transition";
import { zeroTrackFor } from "@/lib/mechanics-world-store";
import { ruleFlag } from "@/lib/rules";
import type { CharacterDoc, SessionState } from "@/types/character";
import { commitWorldVitals, drainedTemporary } from "./world-commit";

export interface DamageTaken {
  /** The next session: HP, temp, conditions, death saves, consumed effects and states. */
  session: SessionState;
  /** The reduced packet: its log beats and the effects/states it consumed. */
  transition: PcDamageTransitionResult;
  /** Encounter effects the hit consumed (Armor of Agathys' pool, a ward). */
  consumedEffectIds: ReadonlySet<string>;
}

/** How an entered hit landed: a critical hit, or what kind of hit it was. */
export type DamageOptions = Pick<PcDamageTransitionInput, "crit" | "hit">;

/** One entered hit on the character, or null when it changes nothing. */
export function takeDamage(
  doc: CharacterDoc,
  amount: number,
  opts?: DamageOptions
): DamageTaken | null {
  const { current, temp } = doc.session.hp;
  const max = effectiveMaxHp(doc.character, doc.session);
  const aggregate = aggregateCharacterGrants(doc.character, doc.session);
  const persistentEffects = doc.session.encounterEffects ?? [];
  const stateFloorByKey = new Map(
    aggregate.zeroHpFloors.map((floor) => [
      floor.activeKey,
      { stateKey: floor.activeKey, hitPoints: floor.hitPoints },
    ])
  );
  const transition = reducePcDamage({
    state: {
      hp: { current, temp, max },
      conditions: doc.session.conditions,
      deathSaves: { successes: doc.session.deathSucc, failures: doc.session.deathFail },
    },
    intake: { stage: "resolved", amount },
    // Adamantine Armor: a Critical Hit against you is a normal hit.
    ...(opts?.crit && !ruleFlag(aggregate.values, "defense:no-critical-hits")
      ? { crit: true }
      : {}),
    ...(opts?.hit ? { hit: opts.hit } : {}),
    persistentEffects,
    stateZeroHpFloors: [...stateFloorByKey.values()],
  });
  if (!transition.changed) return null;
  const deathSaves = stabilizedDeathSaves(
    transition.state.hp.current,
    transition.state.deathSaves,
    ruleFlag(aggregate.values, "trait:auto-stabilize")
  );

  const consumedEffectIds = new Set(transition.consumedEffectIds);
  const consumedActiveKeys = new Set([
    ...transition.consumedStateKeys,
    ...persistentEffects.flatMap((effect) =>
      consumedEffectIds.has(effect.id) &&
      (effect.payload.kind === "grant-group" || effect.payload.kind === "target-mark")
        ? [effect.payload.activeKey]
        : []
    ),
  ]);

  // WORLD-FIRST: hp, temp and the zero-HP track move in one journal action whose
  // mirror writes the same legacy fields re-asserted below (identical values by
  // construction). Conditions and consumed effects/states stay legacy overlays.
  const engine = commitWorldVitals(doc, "damage-entry", (state) => {
    state.vitals = {
      hitPoints: {
        current: transition.state.hp.current,
        temporary: drainedTemporary(
          state.vitals.hitPoints.temporary,
          transition.state.hp.temp
        ),
      },
      zeroHitPoints:
        transition.state.hp.current > 0
          ? null
          : zeroTrackFor(deathSaves.successes, deathSaves.failures),
    };
    return state;
  });

  return {
    session: {
      ...(engine ? engine.session : doc.session),
      hp: {
        ...doc.session.hp,
        current: transition.state.hp.current,
        temp: transition.state.hp.temp,
      },
      conditions: [...transition.state.conditions],
      deathSucc: deathSaves.successes,
      deathFail: deathSaves.failures,
      ...(consumedEffectIds.size > 0
        ? {
            encounterEffects: persistentEffects.filter(
              (effect) => !consumedEffectIds.has(effect.id)
            ),
          }
        : {}),
      ...(consumedActiveKeys.size > 0
        ? {
            activeFeatures: (doc.session.activeFeatures ?? []).filter(
              (key) => !consumedActiveKeys.has(key)
            ),
          }
        : {}),
    },
    transition,
    consumedEffectIds,
  };
}

/**
 * The death saves after a hit: a character who stabilizes on its own (Periapt of
 * Wound Closure) is Stable (three successes, no failures) the moment the hit leaves
 * it dying. Dead stays dead; above 0 HP nothing changes.
 */
export function stabilizedDeathSaves(
  hpAfter: number,
  deathSaves: { successes: number; failures: number },
  autoStabilize: boolean
): { successes: number; failures: number } {
  if (!autoStabilize || hpAfter > 0 || deathSaves.failures >= 3) return deathSaves;
  return { successes: 3, failures: 0 };
}
