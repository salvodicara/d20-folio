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

import { useCombatStore, type SelectedAction } from "@/stores/combatStore";
import type { CombatState, PersistedTurnAction } from "@/types/combat-state";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { canonicalJson } from "@/lib/canonical-fingerprint";
import { localizeText } from "@/lib/views/srd-i18n";

type Locale = "en" | "it";

export type TurnContextSync = "turn-start" | "encounter-ended" | null;

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
    ...(action.outcomeOccurrenceId
      ? { outcomeOccurrenceId: action.outcomeOccurrenceId }
      : {}),
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
    attackSwings: state.attackSwings,
    outcomeReceipts: state.outcomeReceipts,
    outcomeOrdinal: state.outcomeOrdinal,
    reactionUsed: state.reactionUsed,
    reactionUsedId: state.reactionUsedId,
    reactionOutcomeOccurrenceId: state.reactionOutcomeOccurrenceId,
    movementUsedFt: state.movementUsedFt,
    dashesThisTurn: state.dashesThisTurn,
    spellSlotCastsThisTurn: state.spellSlotCastsThisTurn,
    spellSlotCastTurnKey: state.spellSlotCastTurnKey,
    damageTakenThisRound: state.damageTakenThisRound,
    nextAttackAdvantage: state.nextAttackAdvantage,
    movementLocked: state.movementLocked,
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
    ...(action.outcomeOccurrenceId
      ? { outcomeOccurrenceId: action.outcomeOccurrenceId }
      : {}),
  };
}

function restoreTurnEconomy(
  snapshot: NonNullable<CombatState["turnEconomy"]>,
  locale: Locale
): void {
  const normalizedSnapshot = {
    ...snapshot,
    spellSlotCastTurnKey:
      snapshot.spellSlotCastsThisTurn > 0
        ? (snapshot.spellSlotCastTurnKey ?? snapshot.key)
        : null,
    nextAttackAdvantage: snapshot.nextAttackAdvantage ?? false,
    movementLocked: snapshot.movementLocked ?? false,
  };
  if (
    canonicalJson(snapshotTurnEconomy(useCombatStore.getState(), snapshot.key)) ===
    canonicalJson(normalizedSnapshot)
  ) {
    return;
  }
  useCombatStore.setState({
    selected: {
      action: snapshot.selected.action.map((action) => selectedAction(action, locale)),
      bonus: snapshot.selected.bonus.map((action) => selectedAction(action, locale)),
      free: snapshot.selected.free.map((action) => selectedAction(action, locale)),
    },
    attacksUsed: snapshot.attacksUsed,
    attackSwings: snapshot.attackSwings,
    outcomeReceipts: snapshot.outcomeReceipts,
    outcomeOrdinal: snapshot.outcomeOrdinal,
    reactionUsed: snapshot.reactionUsed,
    reactionUsedId: snapshot.reactionUsedId,
    reactionOutcomeOccurrenceId: snapshot.reactionOutcomeOccurrenceId,
    movementUsedFt: snapshot.movementUsedFt,
    dashesThisTurn: snapshot.dashesThisTurn,
    spellSlotCastsThisTurn: snapshot.spellSlotCastsThisTurn,
    spellSlotCastTurnKey:
      snapshot.spellSlotCastsThisTurn > 0
        ? (snapshot.spellSlotCastTurnKey ?? snapshot.key)
        : null,
    damageTakenThisRound: snapshot.damageTakenThisRound,
    nextAttackAdvantage: snapshot.nextAttackAdvantage ?? false,
    movementLocked: snapshot.movementLocked ?? false,
  });
}

function turnIsBaseline(): boolean {
  const state = useCombatStore.getState();
  return (
    state.selected.action.length === 0 &&
    state.selected.bonus.length === 0 &&
    state.selected.free.length === 0 &&
    state.attacksUsed === 0 &&
    state.outcomeReceipts.length === 0 &&
    !state.reactionUsed &&
    state.movementUsedFt === 0 &&
    state.dashesThisTurn === 0 &&
    state.spellSlotCastsThisTurn === 0 &&
    state.spellSlotCastTurnKey === null &&
    !state.damageTakenThisRound &&
    !state.nextAttackAdvantage &&
    !state.movementLocked
  );
}

export function syncCombatFromSession(
  characterId: string,
  combatRound: number,
  sessionInit: string,
  turnEconomy?: CombatState["turnEconomy"],
  currentTurnKey?: string,
  locale: Locale = "en"
): boolean {
  const store = useCombatStore.getState();
  if (store.hydratedCharacterId === characterId) {
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
  useCombatStore.setState({
    hydratedCharacterId: characterId,
    encounterKey: null,
    ownTurnKey: null,
    awaitingOwnTurn: false,
  });
  if (combatRound > 1) store.setRound(combatRound);
  if (sessionInit !== "") store.setInitiative(sessionInit);
  if (currentTurnKey && turnEconomy?.key === currentTurnKey) {
    restoreTurnEconomy(turnEconomy, locale);
  }
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
