/**
 * Helped by an ally (SRD 5.2.1 Help, ability check): while the effect lasts, the
 * helped character's sheet says it has Advantage on its next ability check, and
 * «Usato» spends it once the check is rolled at the table (the effect is revoked,
 * with an undo that reinstates it).
 */
import { useTranslation } from "react-i18next";

import {
  reinstatePersistentCombatEffect,
  revokePersistentCombatEffect,
} from "@/features/campaigns/campaign-io";
import { effectIdsConsumedByRoll } from "@/lib/combat-effects";
import { useToastStore } from "@/stores/toastStore";
import type { CombatEffectOp } from "@/types/combat-effect";
import { Button } from "@/ui";

export function HelpedCheck({
  campaignId,
  effectOps,
  targetId,
}: {
  campaignId: string;
  effectOps: ReadonlyArray<CombatEffectOp> | undefined;
  targetId: string;
}) {
  const { t } = useTranslation();
  const ids = effectIdsConsumedByRoll(effectOps, targetId, "check");
  if (ids.length === 0) return null;
  const use = () => {
    for (const id of ids) void revokePersistentCombatEffect(campaignId, id);
    useToastStore.getState().showToast({
      message: t("play.help.usedToast"),
      duration: 6000,
      onUndo: () => {
        for (const id of ids) void reinstatePersistentCombatEffect(campaignId, id);
      },
    });
  };
  return (
    <div
      className="f-note f-suggest"
      data-c="buff"
      role="group"
      aria-label={t("play.help.title")}
    >
      <p>{t("play.help.helpedCheck")}</p>
      <Button onClick={use}>{t("play.help.used")}</Button>
    </div>
  );
}
