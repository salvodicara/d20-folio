/**
 * useSheetExport — the cockpit's "Export PDF" + "Export JSON" actions (E3: they
 * live as labeled items in the hero bar's ⋯ overflow; the standalone button the
 * PDF action used to render was superseded → deleted, golden rule 10).
 *
 * Both lazy-load their facade (pdf-lib / the v2 codec never weigh on the cockpit's
 * initial bundle), read the WHOLE `CharacterDoc` from the store at call time,
 * download, and toast on a dropped portrait / failure (never silent). The SAME
 * `downloadCharacterPdf` / `downloadCharacterJSON` entry points back the roster
 * card — one source each, so a fix propagates to both surfaces at once (the owner
 * asked for parity: JSON export belongs in the sheet's ⋯ menu just like PDF).
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

export function useSheetExport(): {
  exportPdf: () => Promise<void>;
  exportJson: () => Promise<void>;
  exporting: boolean;
} {
  const { t, i18n } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const exportJson = useCallback(async () => {
    const doc = useCharacterStore.getState().character;
    if (!doc || exporting) return;
    setExporting(true);
    const name = doc.character.name;
    try {
      // Lazy-load the v2 codec ONLY on a deliberate export click (the same
      // `downloadCharacterJSON` the roster card uses — one source, golden rule 3).
      const { downloadCharacterJSON } = await import("@/lib/character-io");
      const { portraitDropped } = await downloadCharacterJSON(doc);
      // A dropped portrait is NEVER silent — the file shipped faceless.
      if (portraitDropped)
        useToastStore.getState().showToast({
          message: t("roster.exportPortraitDropped", { name }),
          duration: 4000,
        });
    } catch {
      useToastStore.getState().showToast({
        message: t("roster.exportFailed", { name }),
        duration: 4000,
      });
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);

  const exportPdf = useCallback(async () => {
    const doc = useCharacterStore.getState().character;
    if (!doc || exporting) return;
    setExporting(true);
    const name = doc.character.name;
    try {
      const { downloadCharacterPdf } = await import("@/lib/pdf/character-pdf-export");
      const locale = i18n.language === "it" ? "it" : "en";
      const { portraitDropped } = await downloadCharacterPdf(doc, locale, (key, opts) =>
        t(key, opts)
      );
      if (portraitDropped)
        useToastStore.getState().showToast({
          message: t("roster.exportPortraitDropped", { name }),
          duration: 4000,
        });
    } catch {
      useToastStore.getState().showToast({
        message: t("roster.exportPdfFailed", { name }),
        duration: 4000,
      });
    } finally {
      setExporting(false);
    }
  }, [exporting, i18n.language, t]);

  return { exportPdf, exportJson, exporting };
}
