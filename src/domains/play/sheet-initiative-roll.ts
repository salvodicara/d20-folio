/**
 * «Tira l'iniziativa» from the Play screen: the roll goes to the campaign's fight, and
 * the fight's first roll regains the trackers that top up on it (Bard Superior
 * Inspiration, Persistent Rage), with the standard undo, as the classic turn band does
 * (`applyFirstRollTopUps`). The sheet only offers the roll before this player has
 * rolled in the fight (`playRollOffer`), so every roll it sends is their first.
 */
import type { TFunction } from "i18next";
import { applyFirstRollTopUps } from "@/features/character/center/initiative-top-up";
import { postRollSources } from "@/lib/character-d20-tests";
import type { Locale } from "@/lib/locale";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

export function rollInitiativeFromSheet(args: {
  /** Sends the roll to the fight (the campaign move, with its own undo). */
  send: () => void;
  t: TFunction;
  locale: Locale;
}): void {
  args.send();
  applyFirstRollTopUps(args.t, args.locale);
}

/**
 * The paid Advantage the sheet holds for its initiative roll (a Luck Point: «Spend 1
 * Luck Point to give yourself Advantage on the roll»), as the save entries offer it:
 * each use with uses left, and the payment (the tracker spent, with its undo) on
 * confirm. `undefined` when the sheet holds none.
 */
export function initiativePaidAdvantage(
  doc: CharacterDoc,
  locale: Locale,
  t: TFunction
):
  | { options: ReadonlyArray<{ id: string; name: string }>; onPay: (id: string) => void }
  | undefined {
  const actions = localizeActions(doc, locale);
  const optIns = postRollSources(doc, actions, "initiative").advantageOptIns;
  const held = actions.filter(
    (a) => optIns.includes(a.id) && (a.summary.uses?.current ?? 1) > 0
  );
  if (held.length === 0) return undefined;
  return {
    options: held.map((a) => ({ id: a.id, name: a.name })),
    onPay: (id) => {
      const action = held.find((a) => a.id === id);
      const spend = action ? bareActionSpend(doc.character.spellSlots, action) : null;
      if (!action || spend?.kind !== "tracker") return;
      registerUndoableToast(
        { message: t("play.roll.paidAdvantage", { name: action.name }) },
        () => {
          const store = useCharacterStore.getState();
          if (
            !store.dispatch({
              kind: "spend-tracker",
              trackerId: spend.trackerId,
              amount: spend.amount,
            })
          ) {
            return null;
          }
          return () =>
            useCharacterStore.getState().dispatch({
              kind: "restore-tracker",
              trackerId: spend.trackerId,
              amount: spend.amount,
            });
        },
        { turnScoped: false }
      );
    },
  };
}
