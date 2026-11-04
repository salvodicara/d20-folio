/**
 * My zone's turn-change questions under its row in «Zone in campo» (M9): «Goblin
 * finisce il turno: è dentro Guardiani Spirituali?». «Dentro: tira» opens the zone's
 * tray on that creature; «Fuori» lets the question go.
 */
import { useTranslation } from "react-i18next";

import { useZoneHitStore } from "@/features/campaigns/zone-hit-store";
import { openZoneTray } from "@/features/character/center/zone-tray";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { useToastStore } from "@/stores/toastStore";
import { Button } from "@/ui";

export function PlayZoneHits({ zoneId, locale }: { zoneId: string; locale: Locale }) {
  const { t } = useTranslation();
  const hits = useZoneHitStore((s) => s.hits).filter((h) => h.zone.id === zoneId);
  if (hits.length === 0) return null;
  const remove = (key: string) => useZoneHitStore.getState().remove(key);
  return (
    <>
      {hits.map((hit) => (
        <div
          key={hit.key}
          className="f-note f-save-due"
          data-c="res"
          role="group"
          aria-label={hit.creatureName}
        >
          <p>
            {t(
              hit.kind === "end-turn"
                ? "combat.zoneEndTurnInside"
                : "combat.zoneStartTurnInside",
              {
                target: hit.creatureName,
                zone: localizeSrd("spell", hit.zone.spellId, "name", locale),
              }
            )}
          </p>
          <div className="f-acts">
            <Button
              kind="primary"
              onClick={() => {
                remove(hit.key);
                if (!openZoneTray(hit.zone, hit.creatureId, locale)) {
                  useToastStore.getState().showToast({
                    message: t("combat.declareApplyFailed"),
                    duration: 6000,
                  });
                }
              }}
            >
              {t("combat.zoneInside")}
            </Button>
            <Button kind="ghost" onClick={() => remove(hit.key)}>
              {t("combat.zoneOutside")}
            </Button>
          </div>
        </div>
      ))}
    </>
  );
}
