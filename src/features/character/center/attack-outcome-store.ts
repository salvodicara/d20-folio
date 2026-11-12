/**
 * The attack waiting for its result: the sheet's latest use of an attack with no
 * target in Folio. Its row shows Hit · Miss · Crit (`AttackOutcomeChips`); the next
 * use replaces it, the end of the turn or an answer clears it.
 */
import { create } from "zustand";

import { useCharacterStore } from "@/stores/characterStore";
import type { AttackOutcome } from "@/types/combat-log";

export interface PendingAttack {
  /** The use's own log line, where the result and the damage are written. */
  logId: string;
  /** The action row that shows the chips. */
  actionId: string;
}

interface AttackOutcomeStore {
  pending: PendingAttack | null;
  offer: (pending: PendingAttack) => void;
  clear: () => void;
}

export const useAttackOutcomeStore = create<AttackOutcomeStore>((set) => ({
  pending: null,
  offer: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));

/** Rewrite the use's own log line with this result and damage (absent = cleared). */
export function rewriteAttackLine(
  logId: string,
  outcome?: AttackOutcome,
  amount?: number
): void {
  const store = useCharacterStore.getState();
  const entry = store.character?.session.logEntries.find((e) => e.id === logId);
  if (entry?.event.kind !== "action-use") return;
  const { outcome: _outcome, amount: _amount, ...rest } = entry.event;
  void _outcome;
  void _amount;
  store.amendLogEntry(entry.id, {
    ...rest,
    ...(outcome ? { outcome } : {}),
    ...(outcome && outcome !== "miss" && amount !== undefined ? { amount } : {}),
  });
}

/** Something a hit adds was chosen (the «Did it hit?» panel): the attack waiting on
 *  this row hit, unless a result is already chosen. */
export function hitIfUnanswered(actionId: string): void {
  const pending = useAttackOutcomeStore.getState().pending;
  if (pending?.actionId !== actionId) return;
  const line = useCharacterStore
    .getState()
    .character?.session.logEntries.find((e) => e.id === pending.logId)?.event;
  if (line?.kind === "action-use" && !line.outcome)
    rewriteAttackLine(pending.logId, "hit");
}
