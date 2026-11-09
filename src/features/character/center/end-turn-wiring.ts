/**
 * End Turn wired to the app's stores, with no React: the ONE wiring of
 * {@link runEndTurn}'s ports, shared by the classic turn band (TurnEconomyProvider)
 * and the new Play screen's turn model (`@/domains/play/turn-model`), so both end a
 * turn the same way. The caller supplies only what it shows: the maintained-state
 * prompt, the ended-effect notices, the lost readied spell and the undo entry.
 */
import {
  advanceGlobalCombat,
  syncPipToStatus,
} from "@/features/campaigns/combat-reconcile";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { readiedSpellExpires } from "@/lib/play/ready";
import { runEndTurn, type EndTurnPorts } from "@/lib/play/end-turn";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import type { TFunction } from "i18next";

import { MAX_UNDO_DEPTH, registerUndoableToast, useUndoStore } from "@/stores/undoStore";

import { advanceSoloWorldTurn } from "./solo-world-turn";
import { advanceSharedTurn } from "./turn-state";

/** What the caller shows; everything else is the stores. */
export type EndTurnUi = Pick<
  EndTurnPorts,
  "setMaintenancePrompts" | "announce" | "registerUndo"
> & {
  /** A readied spell not released by the next turn's start was lost. */
  readiedSpellLost?: (spell: string) => void;
};

/**
 * The readied spell is lost at the start of your next turn: Concentration on it ends
 * (logged). Returns the lost spell and the exact inverse, or null when nothing was
 * held or due.
 */
export function expireReadiedHold(
  round: number
): { spell: string; restore: () => void } | null {
  const cs = useCharacterStore.getState();
  const doc = cs.character;
  if (!doc || cs.readonly || !readiedSpellExpires(doc.session, round)) return null;
  const spell = doc.session.concentration;
  let restoreConcentration: (() => void) | undefined;
  const logIds = cs.setConcentration("", {
    undoable: false,
    captureUndo: (undo) => {
      restoreConcentration = undo;
    },
  });
  return {
    spell,
    restore: () => {
      restoreConcentration?.();
      const current = useCharacterStore.getState();
      for (const id of logIds) current.removeLogEntry(id);
    },
  };
}

/** {@link runEndTurn}'s ports over the stores, the shared turn and `ui`. */
export function storeEndTurnPorts(ui: EndTurnUi): EndTurnPorts {
  return {
    // Read at CALL time (getState, never a reactive subscription).
    encounter: () => useCombatStatusStore.getState().status,
    soloRound: () => useCombatStore.getState().round,
    selections: () => useCombatStore.getState().selected,
    character: () => useCharacterStore.getState().character,
    expireBoundaries: (position) =>
      useCharacterStore.getState().expireEffectBoundaries(position),
    recoverPerTurnTrackers: () => useCharacterStore.getState().recoverPerTurnTrackers(),
    advanceEffectTimers: (round) =>
      useCharacterStore.getState().advanceEffectTimers(round),
    setMaintenancePrompts: ui.setMaintenancePrompts,
    announce: ui.announce,
    handOffSharedTurn: () => {
      const combatStatusStore = useCombatStatusStore.getState();
      const encounterStatus = combatStatusStore.status;
      if (!encounterStatus) return;
      // Flip the hand-off at once (optimistic): the band goes to `waiting` and the
      // own-turn controls vanish in this tick, not after the shared write's round
      // trip. The in-flight turn is recorded BEFORE it is published, so a lagging
      // listener can never republish the pre-advance "your turn" frame; it clears
      // when the real read lands or the write fails (see combat-reconcile.ts). A
      // rapid second press then reads `isMyTurn === false` and no-ops.
      const optimisticStatus = advanceGlobalCombat(encounterStatus);
      combatStatusStore.setPendingTurn({
        campaignId: encounterStatus.campaignId,
        epoch: encounterStatus.encounter.epoch,
        fromId: encounterStatus.encounter.currentCombatantId ?? encounterStatus.myId,
        fromRound: encounterStatus.round,
      });
      combatStatusStore.set(
        optimisticStatus,
        syncPipToStatus(combatStatusStore.pip, optimisticStatus)
      );
      advanceSharedTurn(
        encounterStatus.campaignId,
        encounterStatus.myId,
        encounterStatus.encounter.currentCombatantId
      );
    },
    advanceSoloTurn: () => {
      const c = useCombatStore.getState();
      // endTurn() replaces these wholesale, so the captured references stay valid
      // for the restore (round, economy, budget, reaction, movement, and the
      // round's damage so the maintained-state check re-evaluates identically).
      const prevTurn = {
        round: c.round,
        selected: c.selected,
        budget: c.budget,
        attacksUsed: c.attacksUsed,
        outcomeReceipts: c.outcomeReceipts,
        outcomeOrdinal: c.outcomeOrdinal,
        attackSwings: c.attackSwings,
        reactionUsed: c.reactionUsed,
        reactionUsedId: c.reactionUsedId,
        reactionOutcomeOccurrenceId: c.reactionOutcomeOccurrenceId,
        movementUsedFt: c.movementUsedFt,
        damageTakenThisRound: c.damageTakenThisRound,
      };
      c.endTurn();
      // The canonical engine turn boundary over the character's own world
      // (fail-closed, one-way); the legacy expiry engines keep running for every
      // state the world does not own yet.
      advanceSoloWorldTurn(prevTurn.round);
      return () => useCombatStore.setState(prevTurn);
    },
    compactTurnUndo: () => {
      // The turn's own entries fold into End Turn's; their stale toasts close.
      // Undoing End Turn re-instates them, each again individually undoable,
      // without clearing `future` (the End Turn entry just moved there).
      const compacted = useUndoStore.getState().past.filter((e) => e.turnScoped);
      useUndoStore.getState().purgeTurnScoped();
      return () =>
        useUndoStore.setState((s) => ({
          past: [...s.past, ...compacted].slice(-MAX_UNDO_DEPTH),
        }));
    },
    expireReadiedSpell: (round) => {
      const lost = expireReadiedHold(round);
      if (!lost) return null;
      ui.readiedSpellLost?.(lost.spell);
      return lost.restore;
    },
    logTurnEnd: (round) =>
      useCharacterStore.getState().logEvent({ kind: "turn-end", round }),
    removeLogEntry: (id) => useCharacterStore.getState().removeLogEntry(id),
    registerUndo: ui.registerUndo,
  };
}

/** End the open character's turn through the shared wiring. */
export function endTurnWithStores(ui: EndTurnUi): void {
  runEndTurn(storeEndTurnPorts(ui));
}

/**
 * «End it» on a maintained state's prompt (Rage not kept going): its toggle goes out,
 * so every while-active grant drops. Undoable; character state, not turn-scoped, so it
 * survives an encounter turn-start purge.
 */
export function endMaintainedState(activeKey: string, t: TFunction): void {
  registerUndoableToast(
    { message: t("combat.maintainedEndedToast") },
    () => {
      const cs = useCharacterStore.getState();
      const wasActive = (cs.character?.session.activeFeatures ?? []).includes(activeKey);
      if (!wasActive) return null;
      cs.setActiveFeature(activeKey, false);
      return () => useCharacterStore.getState().setActiveFeature(activeKey, true);
    },
    { turnScoped: false }
  );
}
