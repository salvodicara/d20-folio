/**
 * «Usa l'azione: ripeti il TS» on the target's card (#748: Otto's Irresistible Dance and
 * other `repeat-save at: target-action` conditions): on its own turn the creature may
 * spend its action to repeat the save. «Riuscito: termina» ends the condition (undo
 * reinstates it); «Fallito: resta» keeps it. On Play the attempt spends the action.
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
    (save) => !(spendAction && attempted.includes(`repeat-save:${save.id}`))
  );
  if (saves.length === 0) return null;
  const toast = (message: string, onUndo: () => void) =>
    useToastStore.getState().showToast({ message, duration: 6000, onUndo });
  /** The action taken (Play); its undo, or a no-op. */
  const takeAction = (id: string, name: string): (() => void) => {
    if (!spendAction) return () => undefined;
    const store = useCombatStore.getState();
    const actionId = `repeat-save:${id}`;
    return store.selectAction({ id: actionId, name, slot: "action" })
      ? () => useCombatStore.getState().deselectAction(actionId)
      : () => undefined;
  };
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
        const saved = () => {
          const undoAction = takeAction(save.id, line);
          const effect = foldCombatEffectOps(effectOps).find((e) => e.id === save.id);
          void revokePersistentCombatEffect(campaignId, save.id).catch(() => undefined);
          toast(t("combat.actionRepeatSaveEnded", { condition }), () => {
            undoAction();
            if (combatEffectsV26On()) {
              void reinstatePersistentCombatEffect(campaignId, save.id).catch(
                () => undefined
              );
            } else if (effect) {
              const copy = { ...effect, id: `${effect.id}~${String(Date.now())}` };
              void appendPersistentCombatEffect(campaignId, copy).catch(() => undefined);
            }
          });
        };
        const failed = () => {
          const undoAction = takeAction(save.id, line);
          if (spendAction) toast(t("combat.actionRepeatSaveSpent"), undoAction);
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
