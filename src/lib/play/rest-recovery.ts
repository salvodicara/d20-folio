/**
 * What a rest gave back, read from the sheet before and after it: the Hit Points it
 * healed, the Hit Dice a short rest spent or a long rest regained, and each class
 * resource whose uses came back. A field is set only when something came back, so the
 * report's rest line never carries an empty clause (walkthrough 2026-11-12, M2).
 */
import type { RestRecovery } from "@/types/combat-log";

interface RestSide {
  hp: { current: number };
  hitDice: { used: number };
  trackers: Readonly<Record<string, { used: number }>>;
}

/**
 * `resources` are the trackers the character has (`resolveTrackers`). A rest that
 * fully resets one of them drops its entry (no entry = 0 used), so a missing entry
 * counts as all uses back; any other entry the rest clears (a legacy item tracker)
 * came back as nothing (walkthrough 2026-11-13: Font of Inspiration went unsaid).
 */
export function restRecovery(
  before: RestSide,
  after: RestSide,
  resources: ReadonlySet<string>
): RestRecovery {
  const hp = after.hp.current - before.hp.current;
  const dice = after.hitDice.used - before.hitDice.used;
  const recovered = Object.entries(before.trackers).flatMap(([resource, state]) => {
    const left =
      after.trackers[resource]?.used ?? (resources.has(resource) ? 0 : state.used);
    const count = state.used - left;
    return count > 0 ? [{ resource, count }] : [];
  });
  return {
    ...(hp > 0 ? { hpRegained: hp } : {}),
    ...(dice > 0 ? { hitDiceSpent: dice } : {}),
    ...(dice < 0 ? { hitDiceRegained: -dice } : {}),
    ...(recovered.length > 0 ? { recovered } : {}),
  };
}

/** The ids of the trackers a character has, for {@link restRecovery}. */
export function restResources(
  trackers: ReadonlyArray<{ id: string }>
): ReadonlySet<string> {
  return new Set(trackers.map((tracker) => tracker.id));
}
