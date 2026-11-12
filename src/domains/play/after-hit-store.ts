/**
 * The weapon attack just made outside a shared fight (no damage tray to ask in): the
 * Play screen offers what a hit can add under the turn strip until the player says
 * «Fatto», attacks again, or the round moves on.
 */
import { create } from "zustand";

interface AfterHitOffer {
  characterId: string;
  actionId: string;
  round: number;
}

interface AfterHitStore {
  offer: AfterHitOffer | null;
  offerFor: (offer: AfterHitOffer) => void;
  clear: () => void;
}

export const useAfterHitStore = create<AfterHitStore>((set) => ({
  offer: null,
  offerFor: (offer) => set({ offer }),
  clear: () => set({ offer: null }),
}));
