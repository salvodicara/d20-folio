/**
 * DamageReactionBanner — the incoming-damage REACTION prompt (solo play).
 *
 * When an entered hit is parked by the damage-entry seam (an eligible
 * answer-free damage reaction exists — Uncanny Dodge, Interpose Shield), this
 * banner surfaces the decision the RAW gives the player at that instant: fire
 * one reaction (the hit and its exact reduction commit as ONE kernel causal
 * action, the round's Reaction is claimed) or take the full damage (the plain
 * entry path applies unchanged). The parked hit has NOT been applied while
 * the banner shows, and the copy says so; picking an option AFFIRMS its
 * trigger fact ("an attack hits you"), exactly like the legacy card's click.
 *
 * Rides the `.conc-banner` action-prompt register (one prompt grammar) and
 * the ConcentrationSaveBanner mount so it is reachable on every cockpit
 * surface. A commit rejection degrades to the plain damage path — never a
 * dead end, never a silently swallowed hit.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/useLocale";
import {
  characterDamageReactionOptions,
  type DamageReactionOption,
  type PendingDamageReactionPrompt,
} from "@/lib/damage-reaction";
import { featureNameLoc } from "@/lib/srd-feature-lookup";
import { localizeText } from "@/lib/views/srd-i18n";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableResult } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { useHpControls } from "./molecules/use-hp-controls";

export function DamageReactionBanner() {
  const character = useCharacterStore((state) => state.character);
  const prompt = useCharacterStore((state) => state.combatPendingDamageReaction);
  if (!character || !prompt || prompt.characterId !== character.id) return null;
  return <DamageReactionPrompt key={prompt.id} character={character} prompt={prompt} />;
}

function DamageReactionPrompt({
  character,
  prompt,
}: {
  character: CharacterDoc;
  prompt: PendingDamageReactionPrompt;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const uid = useAuthStore((state) => state.user?.uid);
  const { handleApplyDamage } = useHpControls();

  // Resolve the offered options from the LIVE doc (the same scan that parked
  // the prompt), filtered to the parked roster — names/triggers stay truth.
  const options = useMemo(
    () =>
      characterDamageReactionOptions(character).filter((option) =>
        prompt.optionRowIds.includes(option.rowId)
      ),
    [character, prompt.optionRowIds]
  );

  /** The plain path: drop the prompt and apply the exact entered hit. */
  function skip(): void {
    useCharacterStore.getState().clearDamageReactionPrompt();
    handleApplyDamage(prompt.parts, {
      bypassReactionPrompt: true,
      crit: prompt.crit,
    });
  }

  /** Commit the parked hit WITH one picked reaction; register the exact undo.
   *  `requeue` re-parks the same hit first (the redo replay path). */
  function pick(option: DamageReactionOption, requeue: boolean): void {
    if (uid === undefined) {
      skip();
      return;
    }
    const store = useCharacterStore.getState();
    if (requeue) store.queueDamageReactionPrompt(prompt);
    const commit = store.commitDamageReactionEntry(uid, option.rowId);
    if (!commit) {
      // Fail-closed: the reaction could not commit (economy, kernel, world) —
      // the hit still lands through the ordinary path, never a dead end.
      skip();
      return;
    }
    const name = localizeText(featureNameLoc(option.featureId), locale);
    // Turn-scoped: the pick claims the round's Reaction (an economy commit),
    // so the entry compacts into End Turn / purges at encounter boundaries
    // exactly like every other reaction commit.
    registerUndoableResult(
      {
        message: t("combat.damageReactionToast", {
          full: commit.fullDamage,
          reaction: name,
          taken: commit.takenDamage,
        }),
      },
      commit.undo,
      () => pick(option, true),
      { turnScoped: true }
    );
  }

  return (
    <div className="conc-banner conc-banner-prompt" role="status" aria-live="polite">
      <span className="conc-banner-mark" aria-hidden />
      <span className="conc-banner-text">
        {t("combat.damageReactionPrompt", { n: prompt.netTotal })}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <Button
            key={option.rowId}
            variant="secondary"
            size="sm"
            onClick={() => pick(option, false)}
            title={
              option.trigger !== undefined
                ? t("combat.damageReactionTrigger", {
                    trigger: t(`combat.reactionTrigger_${option.trigger}`),
                  })
                : undefined
            }
          >
            {localizeText(featureNameLoc(option.featureId), locale)}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={skip}>
          {t("combat.damageReactionSkip", { n: prompt.netTotal })}
        </Button>
      </div>
    </div>
  );
}
