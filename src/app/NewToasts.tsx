/**
 * The toasts of the toast store (an act's «Annulla», a follow-up offer, a notice)
 * drawn in the new UI. While the new shell is on screen it hosts them, and the old
 * toast region stays empty, so one toast never shows twice.
 */
import { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

import { useToasts } from "@/hooks/useToasts";
import { useToastStore } from "@/stores/toastStore";
import { Toast } from "@/ui";

export function NewToasts() {
  const { t } = useTranslation();
  const { toastMessage } = useToasts();
  const toasts = useToastStore((s) => s.toasts);
  const undoToast = useToastStore((s) => s.undoToast);
  const dismissToast = useToastStore((s) => s.dismissToast);
  const setHost = useToastStore((s) => s.setNewUiHost);
  useLayoutEffect(() => {
    setHost(true);
    return () => setHost(false);
  }, [setHost]);
  // One snackbar at a time: the newest one still showing.
  const toast = toasts.filter((x) => !x.leaving).at(-1);
  if (!toast) return null;
  const { onUndo, action } = toast;
  return (
    <Toast
      {...(onUndo
        ? { action: t("common.undo"), onAction: () => undoToast(toast.id) }
        : action
          ? {
              action: action.label,
              onAction: () => {
                action.run();
                dismissToast(toast.id);
              },
            }
          : {})}
    >
      {toastMessage(toast)}
    </Toast>
  );
}
