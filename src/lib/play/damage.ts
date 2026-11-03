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
import { resolveTrackers } from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState } from "@/types/character";
import { DEATH_FAIL_LIMIT } from "@/lib/character-status";
import { endSummonsOn, withSummonsRecorded } from "./companions";
import { endFormIfDue } from "./forms";
import { zeroHpDropOf } from "./vitals";
import { commitWorldVitals, drainedTemporary } from "./world-commit";

export interface DamageTaken {
  /** The next session: HP, temp, conditions, death saves, consumed effects and states. */
  session: SessionState;
  /** The reduced packet: its log beats and the effects/states it consumed. */
  transition: PcDamageTransitionResult;
  /** Encounter effects the hit consumed (Armor of Agathys' pool, a ward). */
  consumedEffectIds: ReadonlySet<string>;
  /**
   * The damage that reached temporary HP and HP, after the hit's own stages
   * (Uncanny Dodge halving, an Arcane Ward absorbing). A Concentration save is
   * owed only on this, with its DC from it.
   */
  dealt: number;
  /** What the hit spent on the sheet: each pool's absorbed amount, and the states it
   *  ended (a claimed dodge, a Death Ward). A hit from another device records these
   *  in the spends ledger. */
  spent: { pools: Readonly<Record<string, number>>; endedStates: readonly string[] };
}

/** How an entered hit landed: a critical hit, or what kind of hit it was.
 *  `fromPeer`: another device writes the result, and it can't record a state's or a
 *  pool's use (only the combat roots), so Uncanny Dodge and absorbing pools are left
 *  out rather than used for free. */
export type DamageOptions = Pick<PcDamageTransitionInput, "crit" | "hit"> & {
  fromPeer?: boolean;
  /** Damage known not to come from an attack's hit (a fall, a hazard). */
  notAnAttack?: true;
};

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
  // The hit's own stages, in RAW order (edge-case family M4): a claimed Uncanny
  // Dodge halves an attack's damage and is spent, then a pool takes what it can.
  // The Reaction is claimed on an attack's hit, so the next damage entered is that
  // hit unless it is known not to be an attack (a fall).
  // Another device can't record a state or a pool being spent, so it uses neither.
  const scale =
    opts?.notAnAttack || opts?.fromPeer ? undefined : aggregate.incomingDamageScales[0];
  const scaled = scale ? Math.floor(amount / 2) : amount;
  const absorbed = absorbIntoPools(
    doc,
    opts?.fromPeer ? [] : aggregate.damageAbsorbPools,
    scaled
  );
  const dealt = scaled - absorbed.total;
  const transition = reducePcDamage({
    state: {
      hp: { current, temp, max },
      conditions: doc.session.conditions,
      deathSaves: { successes: doc.session.deathSucc, failures: doc.session.deathFail },
    },
    intake: { stage: "resolved", amount: dealt },
    // Adamantine Armor: a Critical Hit against you is a normal hit.
    ...(opts?.crit && !ruleFlag(aggregate.values, "defense:no-critical-hits")
      ? { crit: true }
      : {}),
    ...(opts?.hit ? { hit: opts.hit } : {}),
    persistentEffects,
    stateZeroHpFloors: [...stateFloorByKey.values()],
  });
  if (!transition.changed && !scale && absorbed.total === 0) return null;
  const deathSaves = stabilizedDeathSaves(
    transition.state.hp.current,
    transition.state.deathSaves,
    ruleFlag(aggregate.values, "trait:auto-stabilize")
  );

  const consumedEffectIds = new Set(transition.consumedEffectIds);
  const consumedActiveKeys = new Set([
    ...transition.consumedStateKeys,
    ...(scale ? [scale.activeKey] : []),
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

  const session: SessionState = {
    ...(engine ? engine.session : doc.session),
    hp: {
      ...doc.session.hp,
      current: transition.state.hp.current,
      temp: transition.state.hp.temp,
    },
    conditions: [...transition.state.conditions],
    deathSucc: deathSaves.successes,
    deathFail: deathSaves.failures,
    // The hit that kills starts the death's game clock (Revivify's minute).
    ...(deathSaves.failures >= 3 && doc.session.deathFail < 3
      ? { death: { minutesSince: 0 } }
      : {}),
    ...(absorbed.total > 0 ? { trackers: absorbed.trackers } : {}),
    // The fall records what was on as the character dropped (Relentless Rage).
    ...(transition.crossedZero && !transition.instantDeath
      ? { zeroHpDrop: zeroHpDropOf(doc) }
      : {}),
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
  };
  // A caster who dies takes with them the summons that end at their death (M6).
  const afterDeath =
    deathSaves.failures >= DEATH_FAIL_LIMIT
      ? (endSummonsOn(withSummonsRecorded({ ...doc, session }), "owner-death") ?? session)
      : session;
  return {
    // The hit can end a form: its Temporary HP ran out, or the fall incapacitates.
    session: endFormIfDue(doc, afterDeath),
    transition,
    consumedEffectIds,
    dealt,
    spent: { pools: absorbed.pools, endedStates: [...consumedActiveKeys] },
  };
}

/** Fill the absorbing pools (Arcane Ward) with as much of the hit as they hold. */
function absorbIntoPools(
  doc: CharacterDoc,
  pools: ReadonlyArray<{ trackerId: string }>,
  amount: number
): { total: number; trackers: SessionState["trackers"]; pools: Record<string, number> } {
  let left = amount;
  let trackers = doc.session.trackers;
  const taken: Record<string, number> = {};
  if (pools.length === 0 || amount <= 0) return { total: 0, trackers, pools: taken };
  const resolved = resolveTrackers(doc);
  for (const { trackerId } of pools) {
    const tracker = resolved.find((t) => t.id === trackerId);
    const room = tracker ? tracker.total - tracker.used : 0;
    const take = Math.min(left, Math.max(0, room));
    if (take === 0) continue;
    trackers = {
      ...trackers,
      [trackerId]: { used: (trackers[trackerId]?.used ?? 0) + take },
    };
    taken[trackerId] = take;
    left -= take;
  }
  return { total: amount - left, trackers, pools: taken };
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
