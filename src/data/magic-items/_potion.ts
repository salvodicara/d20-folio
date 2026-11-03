import type { Grant, WhileActiveAfterEffect } from "@/lib/grants";

/**
 * A drunk potion's standing effect: a `while-active` keyed `potion:<itemId>` (the
 * key its countdown runs under), lasting `minutes`. Drinking lights it; the
 * countdown's expiry ends it (`lib/potion-states.ts`). The item's
 * `durationRounds` must equal `minutes × 10` (test-enforced). `endsEarlyOn` names
 * the acts that end it sooner (Invisibility: an attack roll, damage, a spell). An
 * `afterEffect` (Speed's Haste lethargy) is lit for its turns when the countdown runs out.
 */
export function POTION_STATE(
  itemId: string,
  minutes: number,
  grants: ReadonlyArray<Grant>,
  endsEarlyOn?: ReadonlyArray<string>,
  afterEffect?: WhileActiveAfterEffect
): Grant {
  return {
    type: "while-active",
    activeKey: `potion:${itemId}`,
    duration: {
      kind: "timed",
      minutes,
      maxRounds: minutes * 10,
      ...(endsEarlyOn ? { endsEarlyOn: [...endsEarlyOn] } : {}),
    },
    grants: [...grants],
    ...(afterEffect ? { afterEffect } : {}),
  };
}
