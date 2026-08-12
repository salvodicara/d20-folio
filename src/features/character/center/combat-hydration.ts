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
 * - **Fresh character** (the store's bound id changed): RESET the store, bind it to the
 *   new character, then seed round + initiative from the hydrated subdoc values (a switch
 *   must not inherit A's turn). The binding lives in the store, not a provider ref, so
 *   navigating sheet → campaign → same sheet does not reset an unfinished turn merely
 *   because the provider remounted. Returns `true` so the caller can finalize the prior
 *   character's transient toasts.
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
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";

export type TurnContextSync = "turn-start" | "encounter-ended" | null;

export function syncCombatFromSession(
  characterId: string,
  combatRound: number,
  sessionInit: string
): boolean {
  const store = useCombatStore.getState();
  if (store.hydratedCharacterId === characterId) {
    // Reconcile both from the authoritative `combat/state` subdoc (their sole home).
    if (store.initiative !== sessionInit) store.setInitiative(sessionInit);
    if (store.round !== combatRound) store.setRound(combatRound);
    return false;
  }
  // Fresh character — reset then seed (a switch must not inherit A's round/roll).
  store.endCombat();
  useCombatStore.setState({
    hydratedCharacterId: characterId,
    encounterKey: null,
    ownTurnKey: null,
    awaitingOwnTurn: false,
  });
  if (combatRound > 1) store.setRound(combatRound);
  if (sessionInit !== "") store.setInitiative(sessionInit);
  return true;
}

/**
 * Reconcile the transient ledger with the open character's shared encounter identity.
 * Unlike a component-local transition ref, these keys survive route unmounts: returning
 * during the SAME turn preserves spent slots, while a missed turn cycle / encounter end
 * is detected immediately on remount.
 */
export function syncCombatTurnContext(status: GlobalCombat | null): TurnContextSync {
  const store = useCombatStore.getState();
  if (!status) {
    if (store.encounterKey === null) return null;
    store.endCombat();
    useCombatStore.setState({
      encounterKey: null,
      ownTurnKey: null,
      awaitingOwnTurn: false,
    });
    return "encounter-ended";
  }

  const encounterKey = `${status.campaignId}:${status.encounter.epoch}`;
  const ownTurnKey = status.isMyTurn ? `${status.campaignId}:${status.round}` : null;
  const encounterChanged = store.encounterKey !== encounterKey;
  const ownTurnChanged =
    ownTurnKey !== null &&
    (store.awaitingOwnTurn ||
      (store.ownTurnKey !== null && store.ownTurnKey !== ownTurnKey));

  if (encounterChanged || ownTurnChanged) store.resetTurn();
  useCombatStore.setState({
    encounterKey,
    awaitingOwnTurn: !status.isMyTurn,
    ...(ownTurnKey !== null ? { ownTurnKey } : {}),
  });
  return encounterChanged || ownTurnChanged ? "turn-start" : null;
}
