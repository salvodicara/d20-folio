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

import { useCombatStore, type SelectedAction } from "@/stores/combatStore";
import type { CombatState, PersistedTurnAction } from "@/types/combat-state";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { localizeText } from "@/lib/views/srd-i18n";

type Locale = "en" | "it";

/** Exact identity of the turn whose economy may be restored. Encounter snapshots bind
 * to the shared pointer; solo snapshots bind to character + round. A stale spent Action
 * therefore cannot leak into the next creature's turn or the next solo round. */
export function turnEconomyKey(
  status: GlobalCombat | null,
  characterId: string,
  soloRound: number
): string {
  return status && status.characterId === characterId
    ? `encounter:${status.campaignId}:${status.encounter.epoch}:${status.round}:${status.encounter.currentCombatantId ?? "gathering"}`
    : `solo:${characterId}:${soloRound}`;
}

function persistedAction(action: SelectedAction): PersistedTurnAction {
  return {
    id: action.id,
    name: action.nameLoc ?? { custom: action.name },
    slot: action.slot,
    ...(action.isAttackGroup ? { isAttackGroup: true } : {}),
    ...(action.economyCategory ? { economyCategory: action.economyCategory } : {}),
    ...(action.triggerEvents?.length ? { triggerEvents: action.triggerEvents } : {}),
  };
}

/** Project only durable turn facts. Derived budgets and undo closures deliberately stay
 * out of persistence; after navigation the exact spent slots remain visible/correctable,
 * while live grants re-derive what is available. */
export function snapshotTurnEconomy(
  state: ReturnType<typeof useCombatStore.getState>,
  key: string
): NonNullable<CombatState["turnEconomy"]> {
  return {
    key,
    selected: {
      action: state.selected.action.map(persistedAction),
      bonus: state.selected.bonus.map(persistedAction),
      free: state.selected.free.map(persistedAction),
    },
    attacksUsed: state.attacksUsed,
    attackSwingIds: state.attackSwingIds,
    reactionUsed: state.reactionUsed,
    reactionUsedId: state.reactionUsedId,
    movementUsedFt: state.movementUsedFt,
    dashesThisTurn: state.dashesThisTurn,
    spellSlotCastsThisTurn: state.spellSlotCastsThisTurn,
    damageTakenThisRound: state.damageTakenThisRound,
  };
}

function selectedAction(action: PersistedTurnAction, locale: Locale): SelectedAction {
  return {
    id: action.id,
    name: localizeText(action.name, locale),
    nameLoc: action.name,
    slot: action.slot,
    ...(action.isAttackGroup ? { isAttackGroup: true } : {}),
    ...(action.economyCategory ? { economyCategory: action.economyCategory } : {}),
    ...(action.triggerEvents?.length ? { triggerEvents: action.triggerEvents } : {}),
  };
}

function restoreTurnEconomy(
  snapshot: NonNullable<CombatState["turnEconomy"]>,
  locale: Locale
): void {
  useCombatStore.setState({
    selected: {
      action: snapshot.selected.action.map((action) => selectedAction(action, locale)),
      bonus: snapshot.selected.bonus.map((action) => selectedAction(action, locale)),
      free: snapshot.selected.free.map((action) => selectedAction(action, locale)),
    },
    attacksUsed: snapshot.attacksUsed,
    attackSwingIds: snapshot.attackSwingIds,
    reactionUsed: snapshot.reactionUsed,
    reactionUsedId: snapshot.reactionUsedId,
    movementUsedFt: snapshot.movementUsedFt,
    dashesThisTurn: snapshot.dashesThisTurn,
    spellSlotCastsThisTurn: snapshot.spellSlotCastsThisTurn,
    damageTakenThisRound: snapshot.damageTakenThisRound,
  });
}

function turnIsBaseline(): boolean {
  const state = useCombatStore.getState();
  return (
    state.selected.action.length === 0 &&
    state.selected.bonus.length === 0 &&
    state.selected.free.length === 0 &&
    state.attacksUsed === 0 &&
    !state.reactionUsed &&
    state.movementUsedFt === 0 &&
    state.dashesThisTurn === 0 &&
    state.spellSlotCastsThisTurn === 0 &&
    !state.damageTakenThisRound
  );
}

export function syncCombatFromSession(
  characterId: string,
  combatRound: number,
  sessionInit: string,
  previouslyHydratedId: string | null,
  turnEconomy?: CombatState["turnEconomy"],
  currentTurnKey?: string,
  locale: Locale = "en"
): boolean {
  const store = useCombatStore.getState();
  if (previouslyHydratedId === characterId) {
    // Reconcile both from the authoritative `combat/state` subdoc (their sole home).
    if (store.initiative !== sessionInit) store.setInitiative(sessionInit);
    if (store.round !== combatRound) store.setRound(combatRound);
    // Covers the char-doc-first / combat-subdoc-second load ordering without ever
    // overwriting a newer local commit: a late snapshot hydrates only a baseline turn.
    if (currentTurnKey && turnEconomy?.key === currentTurnKey && turnIsBaseline()) {
      restoreTurnEconomy(turnEconomy, locale);
    }
    return false;
  }
  // Fresh character — reset then seed (a switch must not inherit A's round/roll).
  store.endCombat();
  if (combatRound > 1) store.setRound(combatRound);
  if (sessionInit !== "") store.setInitiative(sessionInit);
  if (currentTurnKey && turnEconomy?.key === currentTurnKey) {
    restoreTurnEconomy(turnEconomy, locale);
  }
  return true;
}
