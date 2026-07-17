/**
 * Toast Store
 *
 * Manages the toast system: undo SNACKBARS (the ephemeral announcement of the
 * last undoable act, with an Undo button) and NOTICES (messages with no undo).
 *
 * THE ONE-SNACKBAR RULE (the reversal contract, owner-ratified 2026-07-11): at
 * most ONE undo-bearing toast is visible at a time — a new undoable act's
 * announcement REPLACES the live one in place (same DOM element, content
 * swapped, countdown reset). Nothing is lost: every act stays individually
 * undoable on the session undo stack (the standing Undo/Redo control + ⌘Z);
 * the snackbar is only the announcement of the LAST act. This also gives the
 * per-swing Extra-Attack feedback its one evolving toast for free. Notices
 * (no `onUndo`) are messages, not reversal affordances — they keep their own
 * lane and may briefly stack (they are rare and short).
 */

import { create } from "zustand";
import type { ToastIntent } from "@/types/toast";

export interface UndoToast {
  id: string;
  /**
   * Pre-localized display message — used by UI-layer callers that already hold a
   * `t`. Engine/store callers MUST NOT localize: they pass `intent` instead and
   * the `UndoToasts` component localizes at render (toasts-as-data, §3.2).
   * Exactly one of `message` / `intent` is set.
   */
  message?: string;
  /**
   * Structured toast intent emitted by the store (no localization) — a `kind`
   * discriminant + raw args (ids/numbers). Localized at render by `useToasts`.
   */
  intent?: ToastIntent;
  /**
   * Function to call if user clicks "Undo" (if omitted, no undo button shown).
   * An undo-bearing toast occupies THE single snackbar slot (one-snackbar rule).
   */
  onUndo?: () => void;
  /** Timestamp when toast was created */
  createdAt: number;
  /** Duration in ms (default 5000) */
  duration: number;
  /**
   * True while the exit animation is playing (set ~160 ms before the toast
   * is removed). The component sets `data-leaving="true"` when this is true
   * so the CSS keyframe can run before the element is unmounted.
   */
  leaving?: boolean;
}

interface ToastState {
  /** Active toasts (usually just 1, but can stack) */
  toasts: UndoToast[];
  /** Timer IDs for auto-dismiss */
  timers: Record<string, ReturnType<typeof setTimeout>>;

  // Actions
  showToast: (toast: Omit<UndoToast, "id" | "createdAt">) => string;
  dismissToast: (id: string) => void;
  undoToast: (id: string) => void;
  clearAll: () => void;
}

let nextId = 0;

/** Duration of the toast-out exit keyframe (matches --m-fast = 160ms). */
export const TOAST_EXIT_MS = 160;

/** Mark a toast as leaving and schedule its actual removal after the exit animation. */
function scheduleRemoval(
  id: string,
  set: (fn: (s: ToastState) => Partial<ToastState>) => void
) {
  // Step 1: flip leaving flag so the CSS keyframe fires
  set((state) => ({
    toasts: state.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
  }));
  // Step 2: after exit animation completes, purge from the list
  setTimeout(() => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
      timers: Object.fromEntries(Object.entries(state.timers).filter(([k]) => k !== id)),
    }));
  }, TOAST_EXIT_MS);
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  timers: {},

  showToast: (toast) => {
    const duration = toast.duration;

    // Arm the auto-dismiss timer for a toast id: start the exit animation, then
    // remove. Shared by the fresh-toast and the replace-in-place paths so the 5s
    // countdown behaves identically (and RESTARTS when an evolving toast updates).
    const armAutoDismiss = (id: string) =>
      setTimeout(() => {
        const { timers } = get();
        if (timers[id]) clearTimeout(timers[id]);
        set((state) => ({
          timers: Object.fromEntries(
            Object.entries(state.timers).filter(([k]) => k !== id)
          ),
        }));
        scheduleRemoval(id, set);
      }, duration);

    // THE ONE-SNACKBAR RULE — an undo-bearing toast claims the single snackbar
    // slot: when a LIVE undo toast exists, swap its content in place and reset
    // its countdown (same DOM element — the evolving-toast feel) instead of
    // stacking a second. The superseded act stays undoable on the undo stack
    // (`undoStore.setToastId` clears the old entry's toast pointer when the new
    // one claims this id, so a later contextual dismiss can't kill the wrong
    // announcement). A leaving toast is skipped so a fresh act starts cleanly.
    if (toast.onUndo) {
      const existing = get().toasts.find((t) => t.onUndo && !t.leaving);
      if (existing) {
        const { timers } = get();
        if (timers[existing.id]) clearTimeout(timers[existing.id]);
        const timer = armAutoDismiss(existing.id);
        set((state) => ({
          toasts: state.toasts.map((t) =>
            t.id === existing.id
              ? // Built FRESH from the incoming toast (never spread over the old
                // one): message vs intent are exclusive, and a stale leftover
                // from the superseded act would corrupt the announcement.
                { ...toast, id: existing.id, createdAt: Date.now(), leaving: false }
              : t
          ),
          timers: { ...state.timers, [existing.id]: timer },
        }));
        return existing.id;
      }
    }

    const id = `toast-${++nextId}`;
    const newToast: UndoToast = {
      ...toast,
      id,
      createdAt: Date.now(),
      duration,
      leaving: false,
    };
    const timer = armAutoDismiss(id);

    set((state) => ({
      toasts: [...state.toasts, newToast],
      timers: { ...state.timers, [id]: timer },
    }));

    return id;
  },

  dismissToast: (id) => {
    const { timers } = get();
    if (timers[id]) {
      clearTimeout(timers[id]);
    }
    set((state) => ({
      timers: Object.fromEntries(Object.entries(state.timers).filter(([k]) => k !== id)),
    }));
    scheduleRemoval(id, set);
  },

  undoToast: (id) => {
    const { toasts, timers } = get();
    const toast = toasts.find((t) => t.id === id);
    if (toast?.onUndo) {
      toast.onUndo();
    }
    if (timers[id]) {
      clearTimeout(timers[id]);
    }
    set((state) => ({
      timers: Object.fromEntries(Object.entries(state.timers).filter(([k]) => k !== id)),
    }));
    scheduleRemoval(id, set);
  },

  clearAll: () => {
    const { timers } = get();
    Object.values(timers).forEach(clearTimeout);
    set({ toasts: [], timers: {} });
  },
}));
