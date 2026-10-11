/**
 * The follow-up line offered under the last used card (owner 2026-10-11, "B"). One
 * offer at a time: a later use with something to say replaces it, undoing the use it
 * came from withdraws it, and each filled row drops out. Ignoring it changes nothing.
 */
import { create } from "zustand";

import type { LocText } from "@/lib/loc-text";
import type { CastFollowUp } from "@/lib/play/cast-follow-ups";

export interface CastFollowUpOffer {
  characterId: string;
  actionId: string;
  /** The used action, for the log line's source. */
  source: LocText;
  /** The use's own log line: its undo withdraws the offer. */
  castLogId: string | null;
  items: CastFollowUp[];
}

interface CastFollowUpStore {
  offer: CastFollowUpOffer | null;
  show: (offer: CastFollowUpOffer) => void;
  withdraw: (castLogId: string | null) => void;
  /** A row was filled: drop it (the offer goes once every row is done). */
  done: (item: CastFollowUp) => void;
}

export const useCastFollowUpStore = create<CastFollowUpStore>((set, get) => ({
  offer: null,
  show: (offer) => {
    if (offer.items.length > 0) set({ offer });
  },
  withdraw: (castLogId) => {
    if (castLogId !== null && get().offer?.castLogId === castLogId) set({ offer: null });
  },
  done: (item) => {
    const offer = get().offer;
    if (!offer) return;
    const items = offer.items.filter((other) => other !== item);
    set({ offer: items.length > 0 ? { ...offer, items } : null });
  },
}));
