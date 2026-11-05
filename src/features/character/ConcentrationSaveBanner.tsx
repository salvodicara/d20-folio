/** Durable entered-roll prompt for damage-triggered Concentration saves. */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableResult } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import {
  concentrationSaveD20Context,
  enteredD20FaceCount,
  resolveCharacterConcentrationSave,
  type FailedSaveReroll,
} from "@/lib/character-d20-tests";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { rerollOffers, type RerollOffer } from "@/lib/play/roll-reactions";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { localizeActions } from "@/lib/views/combat-action-view";
import { beginWholeStateUndo } from "@/stores/characterStore";
import { concentrationLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";
import { Button } from "@/components/ui/button";
import { EnteredD20Faces } from "./molecules/EnteredD20Faces";

export function ConcentrationSaveBanner() {
  const character = useCharacterStore((state) => state.character);
  const pending = useCharacterStore((state) => state.combatPendingConcentrationSaves[0]);
  const queueLength = useCharacterStore(
    (state) => state.combatPendingConcentrationSaves.length
  );
  if (!character || !pending) return null;
  return (
    <ConcentrationSavePrompt
      key={pending.id}
      character={character}
      pending={pending}
      queueLength={queueLength}
    />
  );
}

/** The kernel's reroll for a picked offer: its source, its bonus, its Advantage. */
function rerollOf(
  offer: RerollOffer<ResolvedAction> | null
): FailedSaveReroll | undefined {
  if (!offer) return undefined;
  return {
    sourceId: offer.action.id,
    ...(offer.reaction.bonus ? { bonus: offer.reaction.bonus } : {}),
    ...(offer.reaction.advantage ? { advantage: true as const } : {}),
  };
}

function ConcentrationSavePrompt({
  character,
  pending,
  queueLength,
}: {
  character: CharacterDoc;
  pending: PendingConcentrationSave;
  queueLength: number;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [firstFace, setFirstFace] = useState(10);
  const [secondFace, setSecondFace] = useState(10);
  // A failed save taken again (Indomitable, Disciplined Survivor): the use picked,
  // spent only when the new roll is applied, in the same undo.
  const offers = useMemo(
    () =>
      rerollOffers(character, localizeActions(character, locale), {
        roll: "save",
        whose: "self",
      }).filter(({ action }) => (action.summary.uses?.current ?? 1) > 0),
    [character, locale]
  );
  const [rerollWith, setRerollWith] = useState<(typeof offers)[number] | null>(null);
  const reroll = rerollOf(rerollWith);
  const context = useMemo(
    () => concentrationSaveD20Context(character, pending, rerollOf(rerollWith)),
    [character, pending, rerollWith]
  );
  const faceCount = enteredD20FaceCount(context);
  const rollMode =
    context.advantageSourceIds.length > 0 && context.disadvantageSourceIds.length === 0
      ? "advantage"
      : context.disadvantageSourceIds.length > 0 &&
          context.advantageSourceIds.length === 0
        ? "disadvantage"
        : null;

  const faces = faceCount === 2 ? [firstFace, secondFace] : [firstFace];
  // Whether the roll entered now fails: then a reroll the sheet has is offered.
  const failsNow = (() => {
    if (rerollWith || offers.length === 0) return false;
    try {
      return (
        resolveCharacterConcentrationSave(character, pending, faces).reviewedOutcome
          .status === "failure"
      );
    } catch {
      return false;
    }
  })();

  function commitReroll(): void {
    if (!rerollWith || !reroll) return;
    const store = useCharacterStore.getState();
    const spend = bareActionSpend(
      store.character?.character.spellSlots ?? [],
      rerollWith.action
    );
    const seal = beginWholeStateUndo();
    if (spend?.kind === "tracker") {
      store.dispatch({
        kind: "spend-tracker",
        trackerId: spend.trackerId,
        amount: spend.amount,
      });
    }
    const committed = store.commitPendingConcentrationSave(pending, faces, reroll);
    const restore = seal?.() ?? null;
    const undo = () => (restore ? restore() : false);
    if (!committed) {
      undo();
      return;
    }
    const success = committed.result.reviewedOutcome.status === "success";
    const message = t(
      success ? "combat.rerollSuccessToast" : "combat.rerollFailureToast",
      {
        name: rerollWith.action.name,
        total: committed.result.total,
      }
    );
    registerUndoableResult({ message }, undo, commitReroll);
  }

  function commit(): void {
    if (rerollWith) {
      commitReroll();
      return;
    }
    const committed = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, faces);
    if (!committed) return;
    const success = committed.result.reviewedOutcome.status === "success";
    const message = t(
      success
        ? "combat.concentrationSaveSuccessToast"
        : "combat.concentrationSaveFailureToast",
      { total: committed.result.total }
    );
    registerUndoableResult({ message }, committed.undo, commit);
  }

  return (
    <div className="conc-banner conc-banner-prompt" role="status" aria-live="polite">
      <span className="conc-banner-mark" aria-hidden />
      <span className="conc-banner-text">
        {t("combat.concentrationSavePrompt", {
          spell: concentrationLabel(pending.spell, locale),
          dc: pending.difficultyClass,
        })}
        {queueLength > 1 && (
          <span className="ml-2 font-sans text-xs not-italic text-text-secondary">
            {t("combat.concentrationSaveQueue", { count: queueLength })}
          </span>
        )}
      </span>
      <div className="concentration-save-roll flex flex-wrap items-center gap-2">
        {rollMode && (
          <span className="rounded-sm border border-border-subtle px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-text-secondary">
            <GlossaryTip term={rollMode} rubric={t(`combat.rollMode.${rollMode}`)} />
          </span>
        )}
        <EnteredD20Faces
          faceCount={faceCount}
          first={firstFace}
          second={secondFace}
          onFirstChange={setFirstFace}
          onSecondChange={setSecondFace}
          singleAriaLabel={t("combat.concentrationSaveRollAria")}
          firstAriaLabel={t("combat.d20FirstAria")}
          secondAriaLabel={t("combat.d20SecondAria")}
          decrementLabel={t("combat.healRollDec")}
          incrementLabel={t("combat.healRollInc")}
        />
        <Button variant="secondary" size="sm" onClick={commit}>
          {t("combat.apply")}
        </Button>
      </div>
      {failsNow && (
        <div className="conc-reroll-offers flex flex-wrap items-center gap-2">
          {offers.map((offer) => (
            <Button
              key={offer.action.id}
              variant="primary"
              size="sm"
              onClick={() => {
                setRerollWith(offer);
                setFirstFace(10);
                setSecondFace(10);
              }}
            >
              {offer.reaction.bonus
                ? t("combat.rerollOfferBonus", {
                    name: offer.action.name,
                    bonus: offer.reaction.bonus,
                  })
                : t("combat.rerollOffer", { name: offer.action.name })}
            </Button>
          ))}
        </div>
      )}
      {rerollWith && (
        <div className="conc-reroll-active flex flex-wrap items-center gap-2">
          <span className="text-sm text-accent-text">
            {rerollWith.reaction.bonus
              ? t("combat.rerollActiveBonus", {
                  name: rerollWith.action.name,
                  bonus: rerollWith.reaction.bonus,
                })
              : t("combat.rerollActive", { name: rerollWith.action.name })}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setRerollWith(null)}>
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </div>
  );
}
