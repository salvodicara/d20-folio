/**
 * rosterToast — the single source of truth for the roster's feedback toasts.
 *
 * Callable outside React render (the roster actions/orchestrators fire it from async
 * callbacks), so it reads the store imperatively. Shared by `useRosterActions`,
 * `useRosterBulkActions`, and `useLoadExample` so the toast lifetime never drifts.
 */

import { useToastStore } from "@/stores/toastStore";

/** Lifetime of the roster feedback toasts (ms). Matches the tracker toasts. */
export const TOAST_MS = 4000;

/** Fire a roster feedback toast. */
export function rosterToast(message: string): void {
  useToastStore.getState().showToast({ message, duration: TOAST_MS });
}
