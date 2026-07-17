/**
 * `useToasts` — the UI-layer seam that LOCALIZES toast intents (toasts-as-data,
 * docs/ARCHITECTURE.md). The store emits structured `ToastIntent`s (ids +
 * numbers, no localization); this hook resolves a toast's display message at
 * render: pre-localized `message` toasts pass through, while `intent` toasts are
 * localized through `localizeToastIntent` — picking the i18n template and
 * resolving any id arg (a condition id → its localized name) here, in the UI,
 * where `t` + the active locale live. Pure presentation: all localization stays
 * out of the store.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { localizeToastIntent } from "@/lib/views/toast-intent";
import type { UndoToast } from "@/stores/toastStore";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { concentrationLabel } from "@/lib/views/tracker-view";
import { useLocale } from "@/hooks/useLocale";

export function useToasts() {
  const { t } = useTranslation();
  const { language } = useLocale();

  /** Resolve a toast to its render-ready message (intent localized, or message verbatim). */
  const toastMessage = useCallback(
    (toast: Pick<UndoToast, "message" | "intent">): string => {
      if (toast.intent) {
        return localizeToastIntent(
          toast.intent,
          t,
          (conditionId) =>
            hasSrd("condition", conditionId, "name", language)
              ? localizeSrd("condition", conditionId, "name", language)
              : conditionId,
          // Concentration is stored as a spell id (golden rule 7) → localize it.
          (value) => concentrationLabel(value, language)
        );
      }
      return toast.message ?? "";
    },
    [t, language]
  );

  return { toastMessage };
}
