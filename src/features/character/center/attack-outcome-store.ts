/**
 * The attack waiting for its result: the sheet's latest use of an attack with no
 * target in Folio. Its row shows Hit · Miss · Crit (`AttackOutcomeChips`); the next
 * use replaces it, the end of the turn or an answer clears it.
 */
import { create } from "zustand";

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
