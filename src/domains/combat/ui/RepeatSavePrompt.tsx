/**
 * A repeat save due at the end of a turn (#710), waiting on the target's card: the
 * DM's Scontro row for a monster, Play for the player's own character. «Riuscito:
 * termina» ends the condition with an undo; «Fallito» keeps it and closes the prompt.
 */
import { useTranslation } from "react-i18next";

import {
  appendPersistentCombatEffect,
  reinstatePersistentCombatEffect,
  revokePersistentCombatEffect,
} from "@/features/campaigns/campaign-io";
import {
  useRepeatSaveStore,
  type PendingRepeatSave,
} from "@/features/campaigns/repeat-save-store";
import { localizeSrd } from "@/i18n/resolver";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import type { Locale } from "@/lib/locale";
import { useToastStore } from "@/stores/toastStore";
import { Button } from "@/ui";

/** The saves waiting for these combatants. */
export function RepeatSavePrompts({
  targetIds,
  locale,
}: {
  targetIds: ReadonlyArray<string>;
  locale: Locale;
}) {
  const saves = useRepeatSaveStore((s) => s.saves);
  const mine = saves.filter((s) => targetIds.includes(s.targetId));
  if (mine.length === 0) return null;
  return (
    <>
      {mine.map((save) => (
        <RepeatSavePrompt key={save.id} save={save} locale={locale} />
      ))}
    </>
  );
}

function RepeatSavePrompt({ save, locale }: { save: PendingRepeatSave; locale: Locale }) {
  const { t } = useTranslation();
  const condition = localizeSrd("condition", save.conditionId, "name", locale);
  const store = () => useRepeatSaveStore.getState();
  const failed = () => store().remove(save.id);
  const saved = () => {
    store().remove(save.id);
    void revokePersistentCombatEffect(save.campaignId, save.id).catch(() => undefined);
    useToastStore.getState().showToast({
      message: t("combat.repeatSaveEnded", { condition, target: save.targetName }),
      duration: 6000,
      // The same occurrence back (v0.26 rules); before that deploy, a copy under a
      // fresh id (re-using the id would be ignored as a replay).
      onUndo: () => {
        if (combatEffectsV26On()) {
          void reinstatePersistentCombatEffect(save.campaignId, save.id).catch(
            () => undefined
          );
          store().add(save);
          return;
        }
        const effect = { ...save.effect, id: `${save.effect.id}~${String(Date.now())}` };
        void appendPersistentCombatEffect(save.campaignId, effect).catch(() => undefined);
        store().add({ ...save, id: effect.id, effect });
      },
    });
  };
  return (
    <div className="f-note f-save-due" data-c="cond" role="group" aria-label={condition}>
      <p>
        {t(save.dc !== undefined ? "combat.repeatSaveDueDc" : "combat.repeatSaveDue", {
          target: save.targetName,
          ability: t(`abilities.${save.ability}`),
          condition,
          ...(save.dc !== undefined ? { dc: save.dc } : {}),
        })}
      </p>
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
}
