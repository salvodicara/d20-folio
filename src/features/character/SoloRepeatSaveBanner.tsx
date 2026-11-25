/**
 * The classic sheet's repeat-save strips (#1333): the same strips and answers as the
 * Play screen (`useSoloRepeatSaveStrips`), in the classic banner the Concentration
 * save uses, above the tab grid so they are reachable on every tab.
 */
import { useTranslation } from "react-i18next";

import { useSoloRepeatSaveStrips } from "@/domains/combat/ui/use-solo-repeat-save-strips";
import { Button } from "@/components/ui/button";

export function SoloRepeatSaveBanner() {
  const { t } = useTranslation();
  const strips = useSoloRepeatSaveStrips();
  if (strips.length === 0) return null;
  return (
    <>
      {strips.map((strip) => (
        <div
          key={strip.id}
          className="conc-banner conc-banner-prompt"
          role="group"
          aria-label={strip.condition}
        >
          <span className="conc-banner-mark" aria-hidden />
          <span className="conc-banner-text">{strip.text}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={strip.saved}>
              {t("combat.repeatSaveSucceeded")}
            </Button>
            <Button variant="secondary" size="sm" onClick={strip.failed}>
              {t("combat.repeatSaveFailed")}
            </Button>
          </div>
        </div>
      ))}
    </>
  );
}
