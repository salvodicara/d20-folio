/**
 * After the reload (#1320): «Unsaved changes from <date> were kept on this device —
 * Apply / Discard», on the owner's open sheet. Apply goes through the whole-sheet
 * ceremony with a snapshot first (`rescue-apply`); a copy this version cannot bring
 * forward offers Discard only and says why. Pattern source: Google Docs' «recover
 * unsaved changes» bar and the browser's restore-session bar, drawn as our own
 * «new version» strip (`pwa-dock` + `accent-alert`, PWABanner).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  applyRescueCopy,
  discardRescueCopy,
  upgradeRescueCopy,
} from "@/features/character/rescue-apply";
import { useLocale } from "@/hooks/useLocale";
import { readRescueCopy, type RescueCopy } from "@/lib/local-draft";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

export function RescueBanner() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const sheet = useCharacterStore((s) => s.character);
  const readonly = useCharacterStore((s) => s.readonly);
  if (!uid || !sheet || readonly) return null;
  // Keyed by account and sheet: opening another sheet reads its own copy afresh.
  return <RescueOffer key={`${uid}/${sheet.id}`} uid={uid} sheet={sheet} />;
}

function RescueOffer({ uid, sheet }: { uid: string; sheet: CharacterDoc }) {
  const { t } = useTranslation();
  const { language } = useLocale();
  const [copy, setCopy] = useState<RescueCopy | null>(() =>
    readRescueCopy(uid, sheet.id, Date.now())
  );
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!copy) return null;
  const date = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(copy.savedAt);
  const applicable = upgradeRescueCopy(copy) !== null;

  const apply = async (): Promise<void> => {
    setBusy(true);
    try {
      const outcome = await applyRescueCopy(uid, sheet, copy);
      if (outcome === "applied") setCopy(null);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const discard = (): void => {
    discardRescueCopy(uid, sheet.id);
    setCopy(null);
  };

  return (
    <div className="pwa-dock">
      <section
        aria-label={t("pwa.rescue.label")}
        className="accent-alert pointer-events-auto justify-between gap-3 md:mx-auto md:mb-3 md:w-full md:max-w-2xl"
      >
        <span className="min-w-0 flex-1 text-xs font-medium text-text-primary">
          {failed
            ? t("pwa.rescue.failed")
            : t(applicable ? "pwa.rescue.kept" : "pwa.rescue.cannotApply", { date })}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {applicable && (
            <Button size="sm" onClick={() => void apply()} disabled={busy}>
              {t("combat.apply")}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={discard} disabled={busy}>
            {t("pwa.rescue.discard")}
          </Button>
        </div>
      </section>
    </div>
  );
}
