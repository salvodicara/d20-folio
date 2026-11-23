/**
 * The «Try the new interface» switch (#1233), shared by both Settings screens: which
 * interface this page shows, and the action that saves the player's choice and reloads
 * into it. Offline or refused, the player is told and the page stays as it is.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useNewUi } from "@/app/new-ui-choice";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { saveNewUi } from "./new-ui-switch";

export function useNewUiSwitch(): {
  /** The interface this page shows. */
  active: boolean;
  /** The player's saved choice (a `?ui=` override can make the page differ from it). */
  optedIn: boolean;
  saving: boolean;
  choose: (on: boolean) => void;
} {
  const { t } = useTranslation();
  const active = useNewUi();
  const uid = useAuthStore((s) => s.user?.uid);
  const optedIn = useAuthStore((s) => s.profile?.newUi === true);
  const showToast = useToastStore((s) => s.showToast);
  const [saving, setSaving] = useState(false);
  const choose = (on: boolean): void => {
    if (!uid || saving || (on === optedIn && on === active)) return;
    setSaving(true);
    void saveNewUi(uid, on).then((result) => {
      if (result === "saved") return;
      setSaving(false);
      showToast({
        message: t(
          result === "offline" ? "settings.newUiOffline" : "settings.newUiFailed"
        ),
        duration: 6000,
      });
    });
  };
  return { active, optedIn, saving, choose };
}
