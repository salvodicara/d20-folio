/**
 * The lifted combat status of this user (their own PC's live fight), in a module with
 * no heavy imports: the new UI's frame shows the fight pip from it on every screen,
 * while `global-combat-context.ts` (which also wires the character store) and the
 * producer (`GlobalCombatMount`) load lazily.
 */
import { create } from "zustand";

import type {
  GlobalCombat,
  PendingTurn,
  PipModel,
} from "@/features/campaigns/global-combat-context";

interface CombatStatusStore {
  status: GlobalCombat | null;
  pip: PipModel | null;
  /** The player's own End-Turn hand-off that is still in flight (or `null`). Set by the
   *  sheet's End Turn; read by the producer's reconcile so a lagging listener can't
   *  regress the optimistic advance. See `PendingTurn`. */
  pendingTurn: PendingTurn | null;
  set: (status: GlobalCombat | null, pip: PipModel | null) => void;
  setPendingTurn: (pending: PendingTurn) => void;
  clearPendingTurn: () => void;
}

/** The lifted combat status. The lazy `GlobalCombatMount` is the sole writer of
 *  `status`/`pip`; the pip + sheet region read it through `useGlobalCombat` /
 *  `usePipCombat`. `pendingTurn` is written by the sheet's End Turn and cleared by
 *  the producer once the advance lands. */
export const useCombatStatusStore = create<CombatStatusStore>((set) => ({
  status: null,
  pip: null,
  pendingTurn: null,
  set: (status, pip) => set({ status, pip }),
  setPendingTurn: (pending) => set({ pendingTurn: pending }),
  clearPendingTurn: () => set({ pendingTurn: null }),
}));
