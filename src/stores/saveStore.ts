/**
 * Save Status Store
 *
 * Tracks the state of auto-save operations and online/offline status.
 * Used by the SaveIndicator component in the sheet layout.
 */

import { create } from "zustand";
import { subscribeToOnlineStatus } from "@/lib/online-status";
import { saveStatusCallbacks } from "@/lib/firestore";

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "offline";

interface SaveState {
  /** Current save status */
  status: SaveStatus;
  /** Whether the browser is online */
  online: boolean;
  /** Last successful save timestamp */
  lastSavedAt: number | null;
  /** Error message if save failed */
  errorMessage: string | null;

  // Actions
  setStatus: (status: SaveStatus) => void;
  setOnline: (online: boolean) => void;
  markSaved: () => void;
  markPending: () => void;
  markSaving: () => void;
  markError: (message: string) => void;
}

export const useSaveStore = create<SaveState>()((set, get) => ({
  status: "saved",
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  lastSavedAt: null,
  errorMessage: null,

  setStatus: (status) => set({ status }),
  setOnline: (online) => {
    set({ online });
    // If we go offline, update status; if we come back online and pending, stay pending
    if (!online && get().status === "saved") {
      set({ status: "offline" });
    } else if (online && get().status === "offline") {
      set({ status: "saved" });
    }
  },
  markSaved: () => set({ status: "saved", lastSavedAt: Date.now(), errorMessage: null }),
  markPending: () => {
    if (!get().online) {
      set({ status: "offline" });
    } else {
      set({ status: "pending" });
    }
  },
  markSaving: () => {
    // B14 — the debounced write timer fires unconditionally (offline or not). If
    // the device is offline when it fires, stay "offline" instead of flipping to
    // "saving": the write can't resolve until we're back online, so a "saving"
    // status would spin forever and read as a hung/lost save rather than the
    // honest offline-first signal.
    if (!get().online) {
      set({ status: "offline" });
    } else {
      set({ status: "saving" });
    }
  },
  markError: (message) => set({ status: "error", errorMessage: message }),
}));

// Connect save status callbacks from firestore module
saveStatusCallbacks.onPending = () => useSaveStore.getState().markPending();
saveStatusCallbacks.onSaving = () => useSaveStore.getState().markSaving();
saveStatusCallbacks.onSaved = () => useSaveStore.getState().markSaved();
saveStatusCallbacks.onError = (msg: string) => useSaveStore.getState().markError(msg);

// Subscribe to online/offline status changes
if (typeof window !== "undefined") {
  subscribeToOnlineStatus((online) => {
    useSaveStore.getState().setOnline(online);
  });
}
