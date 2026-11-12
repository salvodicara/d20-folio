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

export function restRecovery(before: RestSide, after: RestSide): RestRecovery {
  const hp = after.hp.current - before.hp.current;
  const dice = after.hitDice.used - before.hitDice.used;
  const recovered = Object.entries(before.trackers).flatMap(([resource, state]) => {
    const count = state.used - (after.trackers[resource]?.used ?? state.used);
    return count > 0 ? [{ resource, count }] : [];
  });
  return {
    ...(hp > 0 ? { hpRegained: hp } : {}),
    ...(dice > 0 ? { hitDiceSpent: dice } : {}),
    ...(dice < 0 ? { hitDiceRegained: -dice } : {}),
    ...(recovered.length > 0 ? { recovered } : {}),
  };
}
