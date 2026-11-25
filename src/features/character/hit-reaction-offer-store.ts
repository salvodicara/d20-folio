/**
 * The open offer after a hit (#1330): the reactions the rules allow now, and how to
 * take the hit back or enter it again. The damage entry (`commitDamage`) publishes it;
 * a banner on the sheet and on the Play screen draws it; the turn engine
 * (`TurnEconomyProvider`, mounted on both screens) registers how a choice is settled,
 * because a reaction is paid and lit through its one reaction path.
 *
 * One offer at a time: a new hit replaces it, and it goes away at the next turn start
 * (or when the fight changes). Never persisted: a reload drops it, as a toast's undo.
 */
import { create } from "zustand";

import type { HitReactionChoice } from "@/lib/play/hit-reaction-offer";
import { useCombatStore } from "@/stores/combatStore";

export interface HitReactionOffer {
  id: string;
  characterId: string;
  /** The hit's damage, after the character's own defenses. */
  amount: number;
  choices: readonly HitReactionChoice[];
  /** Put the sheet back as it was just before the hit (the hit's own undo). */
  undoHit: () => boolean;
  /** Enter the same hit again, with no undo entry of its own: its undo, or null. */
  replayHit: () => (() => boolean) | null;
  /** Shield is up: the AC now, and the question whether the attack still hits. */
  shield?: { ac: number; name: string };
}

/** How the turn engine settles a choice (registered while it is mounted). */
export interface HitReactionSettle {
  react: (actionId: string) => void;
  attackMisses: () => void;
}

interface HitReactionOfferState {
  offer: HitReactionOffer | null;
  settle: HitReactionSettle | null;
}

export const useHitReactionOfferStore = create<HitReactionOfferState>()(() => ({
  offer: null,
  settle: null,
}));

/** Open (or, with null, close) the offer; a new hit's offer replaces the old one. */
export function setHitReactionOffer(offer: HitReactionOffer | null): void {
  useHitReactionOfferStore.setState({ offer });
}

/** Close the offer, only when it is still the one named. */
export function closeHitReactionOffer(id: string): void {
  if (useHitReactionOfferStore.getState().offer?.id === id) setHitReactionOffer(null);
}

// The next turn start (the solo round advances; a fight's own turn or the fight
// itself changes) ends the offer: the Reaction it spoke of is a new one.
useCombatStore.subscribe((next, prev) => {
  if (
    next.round !== prev.round ||
    next.ownTurnKey !== prev.ownTurnKey ||
    next.encounterKey !== prev.encounterKey
  )
    setHitReactionOffer(null);
});
