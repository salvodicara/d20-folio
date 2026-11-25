/**
 * The reactions a hit offers, on the Play screen (#1330): a note under the Hit Points,
 * beside the Concentration save it may answer, drawn like the readied spell's reaction
 * note (`ReadiedNote`). Pattern source: the Play screen's own Concentration save note,
 * and midi-qol's reaction prompt on a hit. Non-blocking: «Nessuna reazione» (or
 * «Colpisce lo stesso» after Shield) closes it, and a new hit replaces it.
 */
import { useTranslation } from "react-i18next";

import { useHitReactionOffer } from "@/features/character/use-hit-reaction-offer";
import { Button } from "@/ui";

export function PlayHitReaction() {
  const { t } = useTranslation();
  const view = useHitReactionOffer();
  if (!view) return null;
  return (
    <div
      className="f-note f-save-due"
      data-c="res"
      role="group"
      aria-label={t("combat.hitReaction.label")}
    >
      <p role="status">{view.prompt}</p>
      <div className="f-acts">
        {view.offer.shield ? (
          <>
            <Button kind="primary" onClick={view.attackMisses}>
              {t("combat.hitReaction.misses")}
            </Button>
            <Button onClick={view.close}>{t("combat.hitReaction.stillHits")}</Button>
          </>
        ) : (
          <>
            {view.choices.map((choice) => (
              <Button
                key={choice.actionId}
                kind="primary"
                onClick={() => view.react(choice.actionId)}
              >
                {`${choice.label} · ${choice.hint}`}
              </Button>
            ))}
            <Button onClick={view.close}>{t("combat.hitReaction.none")}</Button>
          </>
        )}
      </div>
    </div>
  );
}
