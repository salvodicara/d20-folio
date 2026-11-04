/**
 * What a summoned companion's attack does on a hit beyond its damage (edge-case M6):
 * Web Bolt's "the target's Speed is 0 until the start of the insect's next turn". The
 * effect is a state of the summoning spell's own catalogue (`while-active`, entered
 * only by this attack: `activatedByAction`), put on the target as a persistent
 * combat effect that ends at the actor's next turn start (`outcomeEffects`). The
 * damage tray applies these on a hit, as it applies an action's.
 */
import type { CompanionAttack } from "@/data/types";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";
import { outcomeEffects } from "./outcome-effects";

/** The persistent combat effects one hit of `attack` puts on `target`. */
export function companionAttackEffects(hit: {
  /** The summoning spell (Giant Insect), whose catalogue holds the states. */
  spellId: string;
  attack: CompanionAttack;
  actor: CombatantRef;
  target: CombatantRef;
  /** The round the hit lands in (the actor's turn). */
  round: number;
  /** A fresh id per effect, for each one this hit makes. */
  effectId: (index: number) => string;
}): ActiveCombatEffect[] {
  return outcomeEffects({
    source: { kind: "spell", id: hit.spellId, actionId: hit.attack.id },
    effects: hit.attack.effects ?? [],
    outcome: "hit",
    actor: hit.actor,
    target: hit.target,
    round: hit.round,
    effectId: hit.effectId,
  });
}
