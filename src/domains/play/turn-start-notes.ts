/**
 * The turn's start, for the new Play screen (headless: direction renders it). What the
 * classic turn band shows as turn notes, from the same resolvers:
 *
 * - a start-of-turn heal or Temporary Hit Points the player may apply in one tap
 *   (Champion Heroic Rally: «5 + CON while Bloodied»; Heroism: the spellcasting
 *   modifier as Temporary Hit Points). Never applied by itself: the player chooses.
 * - in round 1 only, the Assassin's Death Strike reminder with its save DC (the app
 *   never doubles the damage; the target's save is the table's).
 *
 * `applyTurnStartOffer` applies one offer through the store's healing / Temporary Hit
 * Point seams, on the session undo stack with the classic toast.
 */
import type { TFunction } from "i18next";

import { isCharacterAlive } from "@/lib/character-status";
import { burningTurnStart } from "@/lib/play/environment";
import { resolveRound1DamageDoubles, resolveStartOfTurnRegen } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableResult } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

/** A start-of-turn heal (or Temporary Hit Points) the player may apply. */
export interface TurnStartOffer {
  readonly kind: "heal" | "temp-hp";
  readonly id: string;
  readonly sourceId: string;
  readonly amount: number;
}

/** The round-1 Death Strike reminder: the target's save and its DC. */
export interface TurnStartReminder {
  readonly kind: "death-strike";
  readonly id: string;
  readonly sourceId: string;
  readonly saveAbility: string;
  readonly saveDC: number;
}

/** Burning (SRD 5.2.1): its Fire damage at the start of each turn, until put out. The
 *  app never rolls: the player enters what the dice say in «Danni e cure». */
export interface TurnStartBurning {
  readonly kind: "burning";
  readonly id: string;
  readonly sourceId: string;
  readonly dice: string;
}

export type TurnStartNote = TurnStartOffer | TurnStartReminder | TurnStartBurning;

/** The notes for the start of this character's turn in `round`. */
export function turnStartNotes(
  doc: CharacterDoc & { status?: Parameters<typeof isCharacterAlive>[0] },
  context: { round: number }
): TurnStartNote[] {
  const offers: TurnStartNote[] = isCharacterAlive(doc.status, doc.session)
    ? resolveStartOfTurnRegen(doc)
        .filter((r) => r.active && r.amount > 0)
        .map((r) => ({
          kind: r.asTempHp ? ("temp-hp" as const) : ("heal" as const),
          id: `turn-start:${r.sourceId}`,
          sourceId: r.sourceId,
          amount: r.amount,
        }))
    : [];
  const reminders: TurnStartNote[] =
    context.round === 1
      ? resolveRound1DamageDoubles(doc).map((r) => ({
          kind: "death-strike" as const,
          id: `round-1:${r.sourceId}`,
          sourceId: r.sourceId,
          saveAbility: r.saveAbility,
          saveDC: r.saveDC,
        }))
      : [];
  const fire = burningTurnStart(doc);
  const burning: TurnStartNote[] = fire
    ? [{ kind: "burning", id: "burning", sourceId: "burning", dice: fire.dice }]
    : [];
  return [...burning, ...offers, ...reminders];
}

/**
 * Apply one start-of-turn offer to the open sheet, undoable. False when nothing changed
 * (already at full HP; Temporary Hit Points already as high: they don't stack).
 */
export function applyTurnStartOffer(offer: TurnStartOffer, t: TFunction): boolean {
  const store = useCharacterStore.getState();
  if (offer.kind === "heal") {
    const prev = store.character?.session.hp.current ?? 0;
    const undo = store.applyHealing(offer.amount);
    if (!undo) return false;
    const next = useCharacterStore.getState().character?.session.hp.current ?? prev;
    registerUndoableResult(
      { message: t("combat.hpHealToast", { val: offer.amount, prev, next }) },
      undo,
      () => {
        applyTurnStartOffer(offer, t);
      }
    );
    return true;
  }
  const undo = store.gainTempHp(offer.amount);
  if (!undo) return false;
  const temp = useCharacterStore.getState().character?.session.hp.temp ?? offer.amount;
  registerUndoableResult(
    { message: t("combat.tempHpToast", { val: temp }) },
    undo,
    () => {
      applyTurnStartOffer(offer, t);
    }
  );
  return true;
}
