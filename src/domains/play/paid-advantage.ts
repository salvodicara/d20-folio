/**
 * A paid Advantage the sheet holds for a d20 roll it takes in (a Luck Point: «Spend 1
 * Luck Point to give yourself Advantage on the roll»), as the save entries offer it:
 * each use with uses left, and the payment (the tracker spent, with its undo). The
 * entry asks the second d20 and keeps the higher (`keptFace`).
 */
import type { TFunction } from "i18next";
import type { ReactableRoll } from "@/data/types";
import { postRollSources } from "@/lib/character-d20-tests";
import type { Locale } from "@/lib/locale";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

export interface PaidAdvantageOffer {
  options: ReadonlyArray<{ id: string; name: string }>;
  onPay: (id: string) => void;
}

/** The face that stands: with the Advantage paid, the higher of the two. */
export function keptFace(first: number, second: number, paid: boolean): number {
  return paid ? Math.max(first, second) : first;
}

/** The sheet's paid Advantage on `roll`, or `undefined` when it holds none. The toast
 *  (`messageKey`, with `name`) says what was paid. */
export function paidAdvantageFor(
  doc: CharacterDoc,
  locale: Locale,
  t: TFunction,
  roll: ReactableRoll,
  messageKey: string
): PaidAdvantageOffer | undefined {
  const actions = localizeActions(doc, locale);
  const optIns = postRollSources(doc, actions, roll).advantageOptIns;
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
        { message: t(messageKey, { name: action.name }) },
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
