/**
 * The Concentration save a hit asks for, on the Play screen (the classic
 * ConcentrationSaveBanner's flow, in the new language): the oldest pending save says
 * which spell and the DC, with how many more wait; «Tira il dado» asks the d20 the
 * player rolled at the table (both d20s when the sheet rolls it with Advantage or
 * Disadvantage), plus what they add after the roll (`usePostRollEntry`). Applied through
 * the sheet's one path (`commitPendingConcentrationSave`), with its undo. A failed roll
 * offers the sheet's reroll, and, while the Reaction is free, a Reaction spell that
 * turns the failed d20 into a 20 (`failedD20Savers`, the classic banner's offer).
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
import { homebrewText } from "@/lib/views/homebrew-text-view";
import type { Locale } from "@/lib/locale";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { failedD20Savers, type FailedD20Saver } from "@/lib/play/failed-d20";
import {
  HEROIC_INSPIRATION_REROLL_ID,
  heroicInspirationReroll,
  rerollOffers,
  type RerollOffer,
} from "@/lib/play/roll-reactions";
import { localizeActions } from "@/lib/views/combat-action-view";
import { concentrationLabel } from "@/lib/views/concentration-label";
import { beginWholeStateUndo, useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { registerUndoableResult } from "@/stores/undoStore";
import { useToastStore } from "@/stores/toastStore";
import type { FailedSaveReroll } from "@/lib/character-d20-tests";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";
import { Button, Dialog } from "@/ui";
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

/** The saver spell's name: a homebrew spell's own, a catalogue spell's localized. */
function saverName(saver: FailedD20Saver, locale: Locale): string {
  return saver.customName
    ? homebrewText(saver.customName, locale)
    : concentrationLabel(saver.spellId, locale);
}

/** The save is answered: the toast that announced it («Concentrazione su …: TS COS CD
 *  10») has done its job and leaves, so it never sits over the result or the sheet. */
function dismissSavePrompt() {
  const toasts = useToastStore.getState();
  for (const toast of toasts.toasts)
    if (toast.intent?.kind === "concentration-save") toasts.dismissToast(toast.id);
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
  // Heroic Inspiration rerolls a die just rolled too: offered with the uses above.
  const heroic = heroicInspirationReroll(doc, t("character.heroicInspiration"));
  const choices: Array<RerollOffer<{ id: string; name: string }>> = heroic
    ? [...offers, heroic]
    : offers;
  const [rerollWith, setRerollWith] = useState<(typeof choices)[number] | null>(null);
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
  // The roll entered, when it fails: then the sheet's reroll is offered, and the
  // Reaction spell that turns the d20 into a face while the Reaction is free.
  const failed = (() => {
    if (rerollWith || !roll.valid) return null;
    try {
      const e = roll.entry();
      return resolveCharacterConcentrationSave(
        doc,
        pending,
        e.faces,
        [],
        undefined,
        e.use
      ).reviewedOutcome.status === "failure"
        ? e
        : null;
    } catch {
      return null;
    }
  })();
  const failsNow = failed !== null && choices.length > 0;
  const reactionFree = useCombatStore((s) => !s.reactionUsed);
  const saver = failed && reactionFree ? (failedD20Savers(doc)[0] ?? null) : null;
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
    // A recorded d20 used as the roll (Portent) is spent with it, in the same undo.
    const unspend = entry.foretold
      ? useCharacterStore
          .getState()
          .spendTrackerRoll(entry.foretold.trackerId, entry.foretold.index)
      : null;
    const message = t(
      committed.result.reviewedOutcome.status === "success"
        ? "combat.concentrationSaveSuccessToast"
        : "combat.concentrationSaveFailureToast",
      { total: committed.result.total }
    );
    dismissSavePrompt();
    registerUndoableResult(
      { message },
      () => {
        unspend?.();
        return committed.undo();
      },
      () => apply(entry)
    );
  };
  /** Cast the saver as a Reaction: its slot and the Reaction are spent, the d20 counts
   *  as its face, and one undo takes all of it back (the classic banner). */
  const castSaver = (as: FailedD20Saver, faces: number[]) => {
    const store = useCharacterStore.getState();
    const seal = beginWholeStateUndo();
    store.dispatch({ kind: "spend-slot", level: as.slotLevel, pactMagic: false });
    const reacted = useCombatStore.getState().useReaction(`spell-${as.spellId}`);
    const committed = store.commitPendingConcentrationSave(
      pending,
      faces.map(() => as.face)
    );
    const restore = seal?.() ?? null;
    const undo = () => {
      const ok = restore ? restore() : false;
      if (reacted) useCombatStore.getState().resetReaction();
      return ok;
    };
    if (!committed) {
      undo();
      return;
    }
    const message = t("combat.failedD20UsedToast", {
      spell: saverName(as, locale),
      total: committed.result.total,
    });
    dismissSavePrompt();
    registerUndoableResult({ message }, undo, () => castSaver(as, faces));
  };
  // The reroll's use is spent with the save it decides, in one undo (the classic banner).
  const applyReroll = (
    entry: PostRollCommit,
    offer: NonNullable<typeof rerollWith>,
    as: NonNullable<typeof reroll>
  ) => {
    const store = useCharacterStore.getState();
    const used = offers.find((o) => o.action.id === offer.action.id)?.action;
    const spend = used
      ? bareActionSpend(store.character?.character.spellSlots ?? [], used)
      : null;
    const seal = beginWholeStateUndo();
    if (offer.action.id === HEROIC_INSPIRATION_REROLL_ID)
      store.setHeroicInspiration(false);
    else if (spend?.kind === "tracker")
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
    dismissSavePrompt();
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
                // a failed roll with a reroll at hand: the reroll is the lit button (BG3)
                kind={failsNow ? "ghost" : "primary"}
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
          {saver && failed && (
            <div className="f-acts">
              <Button
                kind="primary"
                onClick={() => {
                  castSaver(saver, failed.faces);
                  close();
                }}
              >
                {t("combat.failedD20Use", {
                  spell: saverName(saver, locale),
                  face: saver.face,
                })}
              </Button>
            </div>
          )}
          {failsNow && (
            <div
              className="f-acts f-reroll"
              role="group"
              aria-label={t("combat.rerollOffers")}
            >
              {choices.map((offer) => (
                <Button
                  key={offer.action.id}
                  kind="primary"
                  wide
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
                </Button>
              ))}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
