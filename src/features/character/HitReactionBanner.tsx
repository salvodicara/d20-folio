/**
 * The reactions a hit offers, on the sheet (#1330): a non-blocking strip under the
 * header, drawn like the Concentration save prompt beside it. Pattern source: the
 * sheet's own ConcentrationSaveBanner, and midi-qol's reaction prompt on a hit.
 * «No reaction» (or «It still hits» after Shield) closes it; a new hit replaces it.
 */
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useHitReactionOffer } from "./use-hit-reaction-offer";

export function HitReactionBanner() {
  const { t } = useTranslation();
  const view = useHitReactionOffer();
  if (!view) return null;
  return (
    <div
      className="conc-banner conc-banner-prompt conc-banner-grounded"
      role="group"
      aria-label={t("combat.hitReaction.label")}
    >
      <span className="conc-banner-mark" aria-hidden />
      <span className="conc-banner-text" role="status">
        {view.prompt}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {view.offer.shield ? (
          <>
            <Button variant="primary" size="sm" onClick={view.attackMisses}>
              {t("combat.hitReaction.misses")}
            </Button>
            <Button variant="secondary" size="sm" onClick={view.close}>
              {t("combat.hitReaction.stillHits")}
            </Button>
          </>
        ) : (
          <>
            {view.choices.map((choice) => (
              <Button
                key={choice.actionId}
                variant="primary"
                size="sm"
                onClick={() => view.react(choice.actionId)}
              >
                {choice.label}
                <span className="font-normal opacity-80">· {choice.hint}</span>
              </Button>
            ))}
            <Button variant="secondary" size="sm" onClick={view.close}>
              {t("combat.hitReaction.none")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
