/**
 * A repeat save due at the end of a turn (#710), waiting on the target's card: the
 * DM's Scontro row for a monster, Play for the player's own character. «Riuscito:
 * termina» ends the condition with an undo; «Fallito» keeps it and closes the prompt.
 */
import { useTranslation } from "react-i18next";

import {
  useRepeatSaveStore,
  type PendingRepeatSave,
} from "@/features/campaigns/repeat-save-store";
import { localizeSrd } from "@/i18n/resolver";
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
    void import("@/features/campaigns/campaign-io").then(
      ({ revokePersistentCombatEffect }) =>
        revokePersistentCombatEffect(save.campaignId, save.id)
    );
    useToastStore.getState().showToast({
      message: t("combat.repeatSaveEnded", { condition, target: save.targetName }),
      duration: 6000,
      // The engine has no un-revoke: the same effect comes back under a fresh id.
      onUndo: () => {
        const effect = { ...save.effect, id: `${save.effect.id}~${String(Date.now())}` };
        void import("@/features/campaigns/campaign-io").then(
          ({ appendPersistentCombatEffect }) =>
            appendPersistentCombatEffect(save.campaignId, effect)
        );
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
