/**
 * Confirm Store
 *
 * A promise-based confirmation dialog driver. Callers `await` a boolean instead
 * of threading callback props through the tree:
 *
 *   const ok = await useConfirmStore.getState().confirm({
 *     title: "Delete character?",
 *     message: "This can't be undone.",
 *     tone: "danger",
 *   });
 *   if (ok) doDelete();
 *
 * A single mounted <ConfirmDialog /> renders the open state and calls `respond`.
 * CI-pure: no Firebase imports.
 */

import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  message: string;
  /**
   * Optional itemized consequences rendered as a bulleted list under the
   * message — used by destructive build edits (Bio-tab level-down) to LIST
   * exactly what will be discarded instead of a vague warning.
   */
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "warning" | "danger" | "default";
}

interface ConfirmState {
  /** Whether the dialog is currently shown. */
  open: boolean;
  /** Options for the active prompt (null when closed). */
  options: ConfirmOptions | null;
  /** Resolver for the in-flight confirm() promise (null when none pending). */
  _resolve: ((v: boolean) => void) | null;

  /** Open the dialog and resolve true (confirm) / false (cancel/dismiss). */
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** Settle the active prompt with the user's choice and reset state. */
  respond: (v: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  open: false,
  options: null,
  _resolve: null,

  confirm: (o) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, options: o, _resolve: resolve });
    }),

  respond: (v) => {
    const { _resolve } = get();
    _resolve?.(v);
    set({ open: false, options: null, _resolve: null });
  },
}));
