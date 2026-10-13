/**
 * The damage tray offered right after a committed use (owner 2026-10-12). One tray at
 * a time: a later use replaces it, undoing the use it came from closes it, Apply or
 * Skip closes it. Skipping leaves the use logged exactly as it was.
 */
import { create } from "zustand";

import type { LocText } from "@/lib/loc-text";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";

export interface DamageTrayOffer {
  characterId: string;
  /** The used action's display name and its stable reference for the log source. */
  actionName: string;
  source: LocText;
  /** The use's own log line: its undo withdraws the tray; Apply writes the
   *  attack's shared result onto it. */
  castLogId: string | null;
  /** The used action's id and its turn occurrence, which the attack's outcome
   *  receipts bind to (absent when the use sits outside the turn's economy). */
  actionId: string;
  occurrenceId?: string;
  plan: DamageTrayPlan;
}

interface DamageTrayStore {
  offer: DamageTrayOffer | null;
  show: (offer: DamageTrayOffer) => void;
  /** The use was undone: close its tray if it is still open. */
  withdraw: (castLogId: string | null) => void;
  close: () => void;
}

export const useDamageTrayStore = create<DamageTrayStore>((set, get) => ({
  offer: null,
  show: (offer) => set({ offer }),
  withdraw: (castLogId) => {
    if (castLogId !== null && get().offer?.castLogId === castLogId) set({ offer: null });
  },
  close: () => set({ offer: null }),
}));
