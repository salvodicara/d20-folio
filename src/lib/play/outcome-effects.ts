/**
 * What a use puts on its target beyond damage, as persistent combat effects
 * (edge-case families M6, M12): a hit's rider (Web Bolt's Speed 0) or a successful
 * save's (Stunning Strike: Speed halved, and attacks against it have Advantage, until
 * the user's next turn). Each effect names the catalogue state that holds it
 * (`activeKey`): a spell's `while-active`, or a feature's `targetStates`. It ends at
 * the turn boundary its `until` names, in the next round.
 */
import type { CatalogueEffect } from "@/lib/catalogue-effects";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

/** Which outcome applies: a hit (no save involved), or the target's successful save. */
export type UseOutcome = "hit" | "save-success";

const STATE_KINDS = new Set([
  "speed-zero",
  "speed-halved",
  "next-attack-advantage",
  "damage-roll-penalty",
]);

/** The effects among `effects` that this outcome applies and that name a state. */
export function stateEffectsFor(
  effects: ReadonlyArray<CatalogueEffect>,
  outcome: UseOutcome
): Array<CatalogueEffect & { activeKey: string }> {
  return effects.flatMap((effect) => {
    if (!STATE_KINDS.has(effect.kind)) return [];
    const activeKey = "activeKey" in effect ? effect.activeKey : undefined;
    if (!activeKey) return [];
    const onSuccess = effect.saveOutcome === "success";
    if (onSuccess !== (outcome === "save-success")) return [];
    return [{ ...effect, activeKey }];
  });
}

/** The persistent combat effects this outcome of one use puts on `target`. */
export function outcomeEffects(use: {
  source: ActiveCombatEffect["source"];
  effects: ReadonlyArray<CatalogueEffect>;
  outcome: UseOutcome;
  actor: CombatantRef;
  target: CombatantRef;
  /** The round the use lands in. */
  round: number;
  /** A fresh id per effect this use makes. */
  effectId: (index: number) => string;
}): ActiveCombatEffect[] {
  return stateEffectsFor(use.effects, use.outcome).map((effect, index) => {
    const until =
      "until" in effect && effect.until
        ? effect.until
        : ({ phase: "turn-start", anchor: "actor" } as const);
    const anchor = until.anchor === "actor" ? use.actor : use.target;
    return {
      id: use.effectId(index),
      actor: use.actor,
      target: use.target,
      source: use.source,
      payload: { kind: "grant-group", activeKey: effect.activeKey },
      // "Until the start of your next turn": the next round's boundary.
      duration: {
        kind: "turn-boundary",
        combatantId: anchor.combatantId,
        round: use.round + 1,
        phase: until.phase,
      },
    };
  });
}
