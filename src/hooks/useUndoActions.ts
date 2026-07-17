/**
 * useUndoActions — the ONE place that pairs a stack undo/redo with its confirmation
 * beat (golden rule 6). Both the ⌘Z/⌘⇧Z keyboard hook and the topbar Undo/Redo
 * control call these, so the two affordances can never drift.
 *
 * Each action operates on the TOP of the stack (the always-safe LIFO path — the
 * toast buttons own the contextual mid-stack path), fires the localized "Undone /
 * Redone / can't-redo" toast, and returns whether it acted (so the keyboard hook
 * can decide `preventDefault`). The stack's own `undo`/`redo` dismiss any linked
 * per-action toast; these only add the confirmation announcement.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import { useToasts } from "@/hooks/useToasts";

export function useUndoActions() {
  const { t } = useTranslation();
  const { toastMessage } = useToasts();
  const showToast = useToastStore((s) => s.showToast);

  /** Undo the stack top; shows the Undone beat. Returns false on an empty stack. */
  const triggerUndo = useCallback((): boolean => {
    const store = useUndoStore.getState();
    const top = store.past[store.past.length - 1];
    if (!top) return false;
    const action = toastMessage(top.label);
    store.undo();
    showToast({ message: t("combat.undoneToast", { action }), duration: 4000 });
    return true;
  }, [t, toastMessage, showToast]);

  /** Redo the stack top; shows Redone, or the can't-redo notice on a legal bail. */
  const triggerRedo = useCallback((): boolean => {
    const store = useUndoStore.getState();
    if (store.future.length === 0) return false;
    if (store.redo()) {
      // The re-applied entry is the new stack top (re-registered by its execute).
      const top = useUndoStore.getState().past.at(-1);
      const action = top ? toastMessage(top.label) : "";
      showToast({ message: t("combat.redoneToast", { action }), duration: 4000 });
    } else {
      // A legal bail: the resources changed since (redo re-validated the guard).
      showToast({ message: t("combat.redoUnavailable"), duration: 4000 });
    }
    return true;
  }, [t, toastMessage, showToast]);

  return { triggerUndo, triggerRedo };
}
