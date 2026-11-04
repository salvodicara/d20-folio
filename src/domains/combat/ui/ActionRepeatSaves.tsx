/**
 * «Usa l'azione: ripeti il TS» on the target's card (#748: Otto's Irresistible Dance and
 * other `repeat-save at: target-action` conditions): on its own turn the creature may
 * spend its action to repeat the save. «Riuscito: termina» ends the condition (undo
 * reinstates it); «Fallito: resta» keeps it. On Play the attempt is the character's
 * Action, logged with its result, all under one undo (`repeat-save-action`).
 */
import { useTranslation } from "react-i18next";

import {
  appendPersistentCombatEffect,
  reinstatePersistentCombatEffect,
  revokePersistentCombatEffect,
} from "@/features/campaigns/campaign-io";
import { localizeSrd } from "@/i18n/resolver";
import { foldCombatEffectOps } from "@/lib/combat-effects";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import type { Locale } from "@/lib/locale";
import { fightActionRepeatSaves } from "@/lib/play/fight-condition-ends";
import {
  repeatSaveActionId,
  takeRepeatSaveAction,
} from "@/domains/combat/repeat-save-action";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import type { CombatEffectOp } from "@/types/combat-effect";
import { Button } from "@/ui";

export function ActionRepeatSaves({
  campaignId,
  effectOps,
  targetId,
  locale,
  spendAction,
}: {
  campaignId: string;
  effectOps: ReadonlyArray<CombatEffectOp> | undefined;
  targetId: string;
  locale: Locale;
  /** Play: the attempt takes the character's action. */
  spendAction?: boolean;
}) {
  const { t } = useTranslation();
  // On Play, an attempt this turn has taken the action: the row waits for next turn.
  // (select the store's own array, never a fresh one: a new array per read loops)
  const taken = useCombatStore((st) => st.selected.action);
  const attempted = taken.map((a) => a.id);
  const saves = fightActionRepeatSaves(effectOps, targetId).filter(
    (save) => !(spendAction && attempted.includes(repeatSaveActionId(save.id)))
  );
  if (saves.length === 0) return null;
  const toast = (message: string, onUndo: () => void) =>
    useToastStore.getState().showToast({ message, duration: 6000, onUndo });
  return (
    <>
      {saves.map((save) => {
        const condition = localizeSrd("condition", save.conditionId, "name", locale);
        const line = t(
          save.dc !== undefined ? "combat.actionRepeatSaveDc" : "combat.actionRepeatSave",
          {
            ability: t(`abilities.${save.ability}`),
            condition,
            ...(save.dc !== undefined ? { dc: save.dc } : {}),
          }
        );
        // On Play the attempt is the character's own action: one undoable act.
        const restoreLegacy = () => {
          const effect = foldCombatEffectOps(effectOps).find((e) => e.id === save.id);
          if (!effect) return;
          const copy = { ...effect, id: `${effect.id}~${String(Date.now())}` };
          void appendPersistentCombatEffect(campaignId, copy).catch(() => undefined);
        };
        const attempt = (passed: boolean) =>
          takeRepeatSaveAction({
            campaignId,
            save,
            passed,
            name: line,
            label: passed
              ? t("combat.actionRepeatSaveEnded", { condition })
              : t("combat.actionRepeatSaveSpent"),
            restoreLegacy,
          });
        const saved = () => {
          if (spendAction) return attempt(true);
          void revokePersistentCombatEffect(campaignId, save.id).catch(() => undefined);
          toast(t("combat.actionRepeatSaveEnded", { condition }), () => {
            if (combatEffectsV26On()) {
              void reinstatePersistentCombatEffect(campaignId, save.id).catch(
                () => undefined
              );
            } else restoreLegacy();
          });
        };
        const failed = () => {
          if (spendAction) attempt(false);
        };
        return (
          <div
            key={save.id}
            className="f-note f-save-due"
            data-c="cond"
            role="group"
            aria-label={condition}
          >
            <p>{line}</p>
            <div className="f-acts">
              <Button kind="primary" onClick={saved}>
                {t("combat.repeatSaveSucceeded")}
              </Button>
              <Button kind="ghost" onClick={failed}>
                {t("combat.repeatSaveFailed")}
              </Button>
            </div>
          </div>
        );
      })}
    </>
  );
}
