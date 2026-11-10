/**
 * The weapon masteries that leave a state on the creature hit (SRD 5.2.1), as combat
 * effects on the target: Vex (Advantage on the attacker's next attack against it,
 * before the end of the attacker's next turn), Sap (Disadvantage on its next attack
 * roll, before the start of the attacker's next turn) and Slow (Speed −10 ft until
 * the start of the attacker's next turn). Each names its state in
 * `RULE_TARGET_STATES`. Topple, Push, Graze, Cleave and Nick leave none.
 */
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

const MASTERY_STATES = [
  { mastery: "vex", activeKey: "vexed", phase: "turn-end" },
  { mastery: "sap", activeKey: "sapped", phase: "turn-start" },
  { mastery: "slow", activeKey: "slowed", phase: "turn-start" },
] as const;

export function masteryHitEffects(hit: {
  /** The weapon's masteries (its own and any granted), lower case. */
  masteries: ReadonlyArray<string>;
  actionId: string;
  actor: CombatantRef;
  target: CombatantRef;
  /** The round the hit lands in. */
  round: number;
  effectId: () => string;
}): ActiveCombatEffect[] {
  const owned = new Set(hit.masteries.map((m) => m.toLowerCase()));
  return MASTERY_STATES.filter((state) => owned.has(state.mastery)).map((state) => ({
    id: hit.effectId(),
    actor: hit.actor,
    target: hit.target,
    source: { kind: "feature", id: `mastery-${state.mastery}`, actionId: hit.actionId },
    payload: { kind: "grant-group", activeKey: state.activeKey },
    // "Your next turn": the attacker's turn edge in the next round.
    duration: {
      kind: "turn-boundary",
      combatantId: hit.actor.combatantId,
      round: hit.round + 1,
      phase: state.phase,
    },
  }));
}
