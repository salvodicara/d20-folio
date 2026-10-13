/**
 * The SOLO extra turn (Thief's Reflexes' second turn, each Time Stop turn): the solo
 * End Turn's turn-boundary work WITHOUT the round advance. It ends this turn (its
 * end-of-turn boundaries, the once-per-turn trackers) and starts a fresh one in the
 * same round — Action, Bonus Action, Reaction and movement refreshed by
 * `combatStore.extraTurn` — while the round timers (`advanceEffectTimers`) and the
 * engine's round boundary stay untouched, so round-based durations do not tick.
 *
 * One line on the play log (a `turn-end` with `extraTurn`) and one undo entry that
 * restores the previous turn exactly, folding this turn's per-slot undos the way the
 * End Turn entry does.
 */
import type { TFunction } from "i18next";

import type { ExtraTurnOffer } from "@/lib/play/extra-turns";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import type { Locale } from "@/lib/locale";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { MAX_UNDO_DEPTH, registerUndoableResult, useUndoStore } from "@/stores/undoStore";

export function takeSoloExtraTurn(
  offer: ExtraTurnOffer,
  t: TFunction,
  locale: Locale
): void {
  const c = useCombatStore.getState();
  const charStore = useCharacterStore.getState();
  if (charStore.readonly || !charStore.character) return;
  const prevTurn = {
    selected: c.selected,
    budget: c.budget,
    attackBudget: c.attackBudget,
    attacksUsed: c.attacksUsed,
    attackSwings: c.attackSwings,
    outcomeReceipts: c.outcomeReceipts,
    outcomeOrdinal: c.outcomeOrdinal,
    reactionUsed: c.reactionUsed,
    reactionUsedId: c.reactionUsedId,
    reactionOutcomeOccurrenceId: c.reactionOutcomeOccurrenceId,
    movementUsedFt: c.movementUsedFt,
    dashesThisTurn: c.dashesThisTurn,
    spellSlotCastsThisTurn: c.spellSlotCastsThisTurn,
    spellSlotCastTurnKey: c.spellSlotCastTurnKey,
    nextAttackAdvantage: c.nextAttackAdvantage,
    movementLocked: c.movementLocked,
    reflexesTaken: c.reflexesTaken,
    timeStopTurns: c.timeStopTurns,
  };
  // This turn ends: its end-of-turn boundaries expire and once-per-turn trackers
  // (Sneak Attack) come back. No round timer ticks — the round goes on.
  const boundaryAtEnd = charStore.expireEffectBoundaries({
    round: c.round,
    phase: "turn-end",
  });
  const restorePerTurn = charStore.recoverPerTurnTrackers();
  // The previous turn's per-slot undos fold into this one entry (as End Turn does),
  // so a stale "X used — Undo" toast can never fire into the new turn.
  const compacted = useUndoStore.getState().past.filter((e) => e.turnScoped);
  useUndoStore.getState().purgeTurnScoped();
  useCombatStore.getState().extraTurn(offer.source);
  const logId = useCharacterStore.getState().logEvent({
    kind: "turn-end",
    round: c.round,
    extraTurn: { source: offer.source, n: offer.n, of: offer.of },
  });
  for (const e of boundaryAtEnd.expired) {
    useToastStore.getState().showToast({
      message: t("combatLog.effectExpired", {
        name: grantSourceLabel(e.sourceId, locale),
      }),
      duration: 4000,
    });
  }
  registerUndoableResult(
    {
      message: t("combat.extraTurnToast", {
        source: grantSourceLabel(offer.source, locale),
        n: offer.n,
        of: offer.of,
        round: c.round,
      }),
    },
    () => {
      useCombatStore.setState(prevTurn);
      useCharacterStore.getState().removeLogEntry(logId);
      restorePerTurn?.();
      boundaryAtEnd.restore();
      useUndoStore.setState((s) => ({
        past: [...s.past, ...compacted].slice(-MAX_UNDO_DEPTH),
      }));
    },
    () => takeSoloExtraTurn(offer, t, locale),
    { turnScoped: true }
  );
}
