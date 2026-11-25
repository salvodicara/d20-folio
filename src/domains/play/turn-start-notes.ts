/**
 * The turn's start (headless): the notes the classic turn band and Play's turn strip
 * both show «at the start of each of your turns», from one source:
 *
 * - a start-of-turn heal or Temporary Hit Points the player may apply in one tap
 *   (Champion Heroic Rally: «5 + CON while Bloodied»; Heroism: the spellcasting
 *   modifier as Temporary Hit Points). Never applied by itself: the player chooses.
 * - in round 1 only, the Assassin's Death Strike reminder with its save DC (the app
 *   never doubles the damage; the target's save is the table's).
 *
 * `applyTurnStartOffer` applies one offer through the store's healing / Temporary Hit
 * Point seams, once per turn (the mark lives in the combat store's turn), as one undo
 * step with the classic toast. Both surfaces read `useTurnStartNotes`.
 */
import type { TFunction } from "i18next";

import { isCharacterAlive } from "@/lib/character-status";
import { burningTurnStart } from "@/lib/play/environment";
import { resolveRound1DamageDoubles, resolveStartOfTurnRegen } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
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
 * The notes still open at the start of this turn, for the classic turn band and Play
 * alike: an offer applied this turn leaves until the next turn starts (or its undo).
 */
export function useTurnStartNotes(
  doc: Parameters<typeof turnStartNotes>[0] | null,
  round: number
): TurnStartNote[] {
  const applied = useCombatStore((s) => s.turnStartApplied.ids);
  if (!doc) return [];
  return turnStartNotes(doc, { round }).filter((n) => !applied.includes(n.id));
}

/**
 * Apply one start-of-turn offer to the open sheet, once per turn, as one undo step: the
 * undo takes back the Hit Points and offers the note again. False when nothing changed
 * (applied already this turn; already at full HP; Temporary Hit Points already as high:
 * they don't stack).
 */
export function applyTurnStartOffer(offer: TurnStartOffer, t: TFunction): boolean {
  if (useCombatStore.getState().turnStartApplied.ids.includes(offer.id)) return false;
  const store = useCharacterStore.getState();
  const heal = offer.kind === "heal";
  const prev = store.character?.session.hp.current ?? 0;
  const undoHp = heal ? store.applyHealing(offer.amount) : store.gainTempHp(offer.amount);
  if (!undoHp) return false;
  const unmark = useCombatStore.getState().markTurnStartApplied(offer.id);
  const hp = useCharacterStore.getState().character?.session.hp;
  registerUndoableResult(
    {
      message: heal
        ? t("combat.hpHealToast", { val: offer.amount, prev, next: hp?.current ?? prev })
        : t("combat.tempHpToast", { val: hp?.temp ?? offer.amount }),
    },
    () => {
      undoHp();
      unmark?.();
    },
    () => {
      applyTurnStartOffer(offer, t);
    }
  );
  return true;
}
