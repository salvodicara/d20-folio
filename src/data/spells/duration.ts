import type { CombatConditionLifetime } from "../types";

type CastLevelDurationTier = Readonly<{
  minLevel: number;
  minutes: number;
}>;

type ConditionCastLevelDurationTier = Readonly<
  CastLevelDurationTier | { minLevel: number; indefinite: true }
>;

/** Keep printed spell minutes and the combat-round ceiling impossible to drift. */
export function timedSpellDuration(
  minutes: number,
  byCastLevel?: ReadonlyArray<CastLevelDurationTier>
) {
  return {
    kind: "timed" as const,
    minutes,
    maxRounds: minutes * 10,
    ...(byCastLevel
      ? {
          byCastLevel: byCastLevel.map((tier) => ({
            ...tier,
            maxRounds: tier.minutes * 10,
          })),
        }
      : {}),
  };
}

/** The fixed maximum lifetime of a condition inflicted by a spell. Kept
 * separate from the caster's active-state duration because some conditions
 * end earlier through a repeat save or table-observed event. */
export function timedConditionLifetime(
  minutes: number,
  byCastLevel?: ReadonlyArray<ConditionCastLevelDurationTier>
) {
  return {
    kind: "timed" as const,
    minutes,
    maxRounds: minutes * 10,
    ...(byCastLevel
      ? {
          byCastLevel: byCastLevel.map((tier) => ({
            ...tier,
            ...("minutes" in tier ? { maxRounds: tier.minutes * 10 } : {}),
          })),
        }
      : {}),
  };
}

/** Resolve a condition's maximum duration from the slot actually spent. */
export function conditionLifetimeAtCastLevel(
  lifetime: CombatConditionLifetime | undefined,
  castLevel: number
): CombatConditionLifetime | undefined {
  if (lifetime?.kind !== "timed") return lifetime;
  const tier = lifetime.byCastLevel?.reduce<
    NonNullable<typeof lifetime.byCastLevel>[number] | undefined
  >(
    (best, candidate) =>
      candidate.minLevel <= castLevel &&
      (best === undefined || candidate.minLevel > best.minLevel)
        ? candidate
        : best,
    undefined
  );
  if (!tier) return lifetime;
  if (tier.indefinite) return { kind: "manual" };
  return tier.minutes !== undefined && tier.maxRounds !== undefined
    ? { ...lifetime, minutes: tier.minutes, maxRounds: tier.maxRounds }
    : lifetime;
}
