/**
 * Sync the in-memory `combatStore` from a character's persisted combat state on every
 * snapshot — the ONE policy `TurnEconomyProvider` runs each time the character doc
 * updates (the effect keys on `[character]`, so it fires on every Firestore resync).
 *
 * Both the SOLO `round` and the initiative ROLL now live in the `combat/state` subdoc
 * (round moved there as its sole persisted home; the session no longer carries it). They
 * therefore share ONE policy, keyed off the values hydrated from that subdoc
 * (`characterStore.combatRound` + the reconciled `session.initiative`):
 *
 * - **Fresh character** (the id changed): RESET the store, then seed round + initiative
 *   from the hydrated subdoc values (a switch must not inherit A's round/roll). Returns
 *   `true` so the caller can finalize the prior character's transient toasts.
 * - **Same character, a LATER snapshot**: RECONCILE both from the subdoc. The subdoc is
 *   the single persisted home (D9); a remote edit (the DM rolling for a player) or the
 *   subdoc landing AFTER the char doc must re-sync onto the open sheet instead of showing
 *   a stale value until reload (issue #41, golden rules 6 + 24). Reconciling round here —
 *   rather than the old parent-doc hydrate-once — is also what fixes the load ordering:
 *   when the subdoc arrives after the first char-doc render, its round lands on the next
 *   snapshot. Solo play is single-device, so the subdoc always carries the player's own
 *   latest round (every whole-object combat write includes it), so a reconcile never
 *   clobbers a live advance. Any IN-PROGRESS local roll is owned by the `InitVital` tile
 *   (seeded only on open), so this reconciles the DISPLAY without clobbering the edit.
 *
 * No new listener: this reuses the character subscription the app already holds
 * (golden rule 24 — free-tier listener discipline). Pure of Firebase.
 */

import { useCombatStore } from "@/stores/combatStore";

export function syncCombatFromSession(
  characterId: string,
  combatRound: number,
  sessionInit: string,
  previouslyHydratedId: string | null
): boolean {
  const store = useCombatStore.getState();
  if (previouslyHydratedId === characterId) {
    // Reconcile both from the authoritative `combat/state` subdoc (their sole home).
    if (store.initiative !== sessionInit) store.setInitiative(sessionInit);
    if (store.round !== combatRound) store.setRound(combatRound);
    return false;
  }
  // Fresh character — reset then seed (a switch must not inherit A's round/roll).
  store.endCombat();
  if (combatRound > 1) store.setRound(combatRound);
  if (sessionInit !== "") store.setInitiative(sessionInit);
  return true;
}
