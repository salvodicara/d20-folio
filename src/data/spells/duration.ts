type CastLevelDurationTier = Readonly<{
  minLevel: number;
  minutes: number;
}>;

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
