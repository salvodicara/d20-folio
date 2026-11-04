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
import { repeatSaveDueCopy } from "@/domains/combat/repeat-save-copy";
import {
  tallyKey,
  tallyOf,
  useSaveTallyStore,
} from "@/features/campaigns/save-tally-store";
import {
  answerTrackedSave,
  failedSaveExhaustion,
  type SaveTally,
} from "@/lib/condition-ends";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { Button } from "@/ui";

const NO_TALLY: SaveTally = { successes: 0, failures: 0 };

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
  // A tracked save (Contagion) counts each answer; only the last one decides.
  const track = save.track;
  const key = tallyKey(save.campaignId, save.id);
  const tally = useSaveTallyStore((s) => s.tallies[key]) ?? NO_TALLY;
  const counted = (passed: boolean): boolean => {
    if (!track) return false;
    const before = tallyOf(save.campaignId, save.id);
    const answer = answerTrackedSave(before, track, passed);
    if (answer.outcome === "ended") {
      useSaveTallyStore.getState().set(key, null);
      return false;
    }
    useSaveTallyStore.getState().set(key, answer.tally);
    store().remove(save.id);
    const values = {
      condition,
      target: save.targetName,
      successes: answer.tally.successes,
      failures: answer.tally.failures,
      needed: track.successes,
      limit: track.failures,
    };
    useToastStore.getState().showToast({
      message: t(
        answer.outcome === "settled"
          ? "combat.repeatSaveSettled"
          : "combat.repeatSaveCounted",
        values
      ),
      duration: 6000,
      onUndo: () => {
        useSaveTallyStore.getState().set(key, before);
        store().add(save);
      },
    });
    return true;
  };
  const failed = () => {
    if (!counted(false)) store().remove(save.id);
    failureEffects();
  };
  // What a failure does (Vision of Elapsing Eons: 1 Exhaustion): on this device's own
  // character, onto its sheet with an undo; on a monster, a note for the DM.
  const failureEffects = () => {
    const levels = failedSaveExhaustion(save);
    if (levels === 0) return;
    const sheet = useCharacterStore.getState();
    const own = sheet.character && sheet.character.id === save.characterId;
    if (!own) {
      useToastStore.getState().showToast({
        message: t("combat.repeatSaveExhaustionMonster", {
          target: save.targetName,
          count: levels,
        }),
        duration: 8000,
      });
      return;
    }
    const before = sheet.character?.session.exhaustion ?? 0;
    sheet.setExhaustion(before + levels);
    useToastStore.getState().showToast({
      message: t("combat.repeatSaveExhaustion", {
        target: save.targetName,
        count: levels,
      }),
      duration: 6000,
      onUndo: () => useCharacterStore.getState().setExhaustion(before),
    });
  };
  const saved = () => {
    if (counted(true)) return;
    store().remove(save.id);
    void revokePersistentCombatEffect(save.campaignId, save.id).catch(() => undefined);
    useToastStore.getState().showToast({
      message: t("combat.repeatSaveEnded", { condition, target: save.targetName }),
      duration: 6000,
      // The same occurrence back (v0.26 rules); before that deploy, a copy under a
      // fresh id (re-using the id would be ignored as a replay).
      onUndo: () => {
        if (track) useSaveTallyStore.getState().set(key, tally);
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
      <p>{t(...repeatSaveDueCopy(save, t(`abilities.${save.ability}`), condition, t))}</p>
      {track && (
        <p>
          {t("combat.repeatSaveTally", {
            successes: tally.successes,
            failures: tally.failures,
            needed: track.successes,
            limit: track.failures,
          })}
        </p>
      )}
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
