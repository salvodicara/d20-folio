/** Admin-only smoke-test utility: seed the canonical example into this account. */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { createCharacter } from "@/lib/firestore";
import { MOCK_CHARACTER } from "@/lib/mock";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";

const TOAST_MS = 4000;

function notify(message: string): void {
  useToastStore.getState().showToast({ message, duration: TOAST_MS });
}

export function useLoadExample(): () => Promise<void> {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);

  return useCallback(async () => {
    if (!uid) return;
    if (DEV_BYPASS_AUTH) {
      notify(t("admin.examplePreviewBlocked"));
      return;
    }

    try {
      await createCharacter(uid, {
        character: { ...MOCK_CHARACTER.character },
        session: MOCK_CHARACTER.session,
        status: "active",
        portraitUrl: null,
      });
      notify(t("admin.exampleLoaded"));
    } catch {
      notify(t("admin.exampleFailed"));
    }
  }, [uid, t]);
}
