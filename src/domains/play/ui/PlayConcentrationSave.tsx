/**
 * The Concentration save a hit asks for, on the Play screen (the classic
 * ConcentrationSaveBanner's flow, in the new language): the oldest pending save says
 * which spell and the DC, with how many more wait; «Tira il dado» asks the d20 the
 * player rolled at the table (both d20s when the sheet rolls it with Advantage or
 * Disadvantage), plus what they add after the roll (`usePostRollEntry`). Applied through
 * the sheet's one path (`commitPendingConcentrationSave`), with its undo.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocale } from "@/hooks/useLocale";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import {
  concentrationSaveD20Context,
  enteredD20FaceCount,
  resolveCharacterConcentrationSave,
} from "@/lib/character-d20-tests";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { rerollOffers, type RerollOffer } from "@/lib/play/roll-reactions";
import { localizeActions } from "@/lib/views/combat-action-view";
import { concentrationLabel } from "@/lib/views/concentration-label";
import { beginWholeStateUndo, useCharacterStore } from "@/stores/characterStore";
import { registerUndoableResult } from "@/stores/undoStore";
import type { FailedSaveReroll } from "@/lib/character-d20-tests";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";
import { Button, Chip, Dialog } from "@/ui";
import { usePostRollEntry, type PostRollCommit } from "./PostRollEntry";

/** The reroll a picked offer makes of the failed save (as the classic banner reads it). */
function failedSaveReroll(
  offer: RerollOffer<{ id: string }> | null
): FailedSaveReroll | undefined {
  if (!offer) return undefined;
  return {
    sourceId: offer.action.id,
    ...(offer.reaction.bonus ? { bonus: offer.reaction.bonus } : {}),
    ...(offer.reaction.advantage ? { advantage: true as const } : {}),
  };
}

export function PlayConcentrationSave({ doc }: { doc: CharacterDoc }) {
  const pending = useCharacterStore((s) => s.combatPendingConcentrationSaves[0]);
  const queued = useCharacterStore((s) => s.combatPendingConcentrationSaves.length);
  if (!pending) return null;
  return <Prompt key={pending.id} doc={doc} pending={pending} queued={queued} />;
}

function Prompt({
  doc,
  pending,
  queued,
}: {
  doc: CharacterDoc;
  pending: PendingConcentrationSave;
  queued: number;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const readonly = useSheetReadonly();
  const [rolling, setRolling] = useState(false);
  // A failed save taken again (Indomitable, Disciplined Survivor): offered once the
  // roll entered fails; the use is spent only when the new roll is applied.
  const offers = useMemo(
    () =>
      rerollOffers(doc, localizeActions(doc, locale), {
        roll: "save",
        whose: "self",
      }).filter(({ action }) => (action.summary.uses?.current ?? 1) > 0),
    [doc, locale]
  );
  const [rerollWith, setRerollWith] = useState<(typeof offers)[number] | null>(null);
  const reroll = failedSaveReroll(rerollWith);
  const context = useMemo(
    () => concentrationSaveD20Context(doc, pending, reroll),
    [doc, pending, reroll]
  );
  const sheetFaces = enteredD20FaceCount(context) === 2 ? 2 : 1;
  const mode =
    context.advantageSourceIds.length > 0 && context.disadvantageSourceIds.length === 0
      ? "advantage"
      : context.disadvantageSourceIds.length > 0 &&
          context.advantageSourceIds.length === 0
        ? "disadvantage"
        : null;
  const roll = usePostRollEntry(
    doc,
    sheetFaces,
    { face: t("play.down.face") },
    (faces, use) =>
      resolveCharacterConcentrationSave(doc, pending, faces, [], reroll, use)
  );
  // Whether the roll entered now fails: then the sheet's reroll is offered.
  const failsNow = (() => {
    if (rerollWith || offers.length === 0 || !roll.valid) return false;
    try {
      const e = roll.entry();
      return (
        resolveCharacterConcentrationSave(doc, pending, e.faces, [], undefined, e.use)
          .reviewedOutcome.status === "failure"
      );
    } catch {
      return false;
    }
  })();
  const spell = concentrationLabel(pending.spell, locale);
  const close = () => {
    roll.reset();
    setRerollWith(null);
    setRolling(false);
  };
  const apply = (entry: PostRollCommit) => {
    if (rerollWith && reroll) {
      applyReroll(entry, rerollWith, reroll);
      return;
    }
    const committed = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(
        pending,
        entry.faces,
        undefined,
        entry.use,
        entry.spend
      );
    if (!committed) return;
    const message = t(
      committed.result.reviewedOutcome.status === "success"
        ? "combat.concentrationSaveSuccessToast"
        : "combat.concentrationSaveFailureToast",
      { total: committed.result.total }
    );
    registerUndoableResult({ message }, committed.undo, () => apply(entry));
  };
  // The reroll's use is spent with the save it decides, in one undo (the classic banner).
  const applyReroll = (
    entry: PostRollCommit,
    offer: NonNullable<typeof rerollWith>,
    as: NonNullable<typeof reroll>
  ) => {
    const store = useCharacterStore.getState();
    const spend = bareActionSpend(
      store.character?.character.spellSlots ?? [],
      offer.action
    );
    const seal = beginWholeStateUndo();
    if (spend?.kind === "tracker")
      store.dispatch({
        kind: "spend-tracker",
        trackerId: spend.trackerId,
        amount: spend.amount,
      });
    const committed = store.commitPendingConcentrationSave(
      pending,
      entry.faces,
      as,
      entry.use,
      entry.spend
    );
    const restore = seal?.() ?? null;
    const undo = () => (restore ? restore() : false);
    if (!committed) {
      undo();
      return;
    }
    const message = t(
      committed.result.reviewedOutcome.status === "success"
        ? "combat.rerollSuccessToast"
        : "combat.rerollFailureToast",
      { name: offer.action.name, total: committed.result.total }
    );
    registerUndoableResult({ message }, undo, () => applyReroll(entry, offer, as));
  };
  return (
    <div className="f-note f-save-due" data-c="conc" role="group" aria-label={spell}>
      <p>
        {t("combat.concentrationSavePrompt", { spell, dc: pending.difficultyClass })}
        {queued > 1 && ` · ${t("combat.concentrationSaveQueue", { count: queued })}`}
      </p>
      {!readonly && (
        <div className="f-acts">
          <Button kind="primary" aria-haspopup="dialog" onClick={() => setRolling(true)}>
            {t("play.down.roll")}
          </Button>
        </div>
      )}
      {rolling && (
        <Dialog
          open
          onClose={close}
          color="res"
          title={t("combat.concentrationSavePrompt", {
            spell,
            dc: pending.difficultyClass,
          })}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button kind="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                kind="primary"
                disabled={!roll.valid}
                onClick={() => {
                  apply(roll.entry());
                  close();
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        >
          {rerollWith && (
            <p className="f-note" data-c="res" role="status">
              {rerollWith.reaction.bonus
                ? t("combat.rerollActiveBonus", {
                    name: rerollWith.action.name,
                    bonus: rerollWith.reaction.bonus,
                  })
                : t("combat.rerollActive", { name: rerollWith.action.name })}
            </p>
          )}
          {mode && <p className="f-quiet">{t(`combat.rollMode.${mode}`)}</p>}
          {roll.fields}
          {failsNow && (
            <div className="f-chips" role="group" aria-label={t("combat.rerollOffers")}>
              {offers.map((offer) => (
                <Chip
                  key={offer.action.id}
                  onClick={() => {
                    roll.reset();
                    setRerollWith(offer);
                  }}
                >
                  {offer.reaction.bonus
                    ? t("combat.rerollOfferBonus", {
                        name: offer.action.name,
                        bonus: offer.reaction.bonus,
                      })
                    : t("combat.rerollOffer", { name: offer.action.name })}
                </Chip>
              ))}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
