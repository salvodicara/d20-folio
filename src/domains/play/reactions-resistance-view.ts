/**
 * The new Play screen's reaction extras and choice-resistance picks (headless), from
 * the classic sheet's rules: the readied spell released with the Reaction, the
 * off-list reaction («Mark used»), and a re-selectable resistance (Fiendish
 * Resilience). The actions are the classic ones: `releaseReadiedSpell` and
 * `executeAction(offListReactionAction(t))` from `useTurnEconomy`, and the pick below.
 */
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { nextChoiceResistancePicks } from "@/lib/choice-resistance-pick";
import type { LocText } from "@/lib/loc-text";
import type { Locale } from "@/lib/locale";
import { OFF_LIST_REACTION_ID } from "@/lib/views/off-list-reaction";
import { READIED_SPELL_REACTION_ID } from "@/lib/play/ready";
import { concentrationLabel } from "@/lib/views/concentration-label";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { DamageType } from "@/types/damage";

export interface ReactionExtrasView {
  /** The spell held by Ready; null when nothing is readied. */
  readied: { name: string; disabled: boolean; committed: boolean } | null;
  offList: { disabled: boolean; committed: boolean };
}

export function reactionExtrasView(
  doc: CharacterDoc,
  turn: { reactionUsed: boolean; reactionUsedId: string | null },
  locale: Locale
): ReactionExtrasView {
  const { readiedSpell, concentration } = doc.session;
  return {
    readied:
      readiedSpell && concentration
        ? {
            name: concentrationLabel(concentration, locale),
            disabled: turn.reactionUsed,
            committed: turn.reactionUsedId === READIED_SPELL_REACTION_ID,
          }
        : null,
    offList: {
      disabled: turn.reactionUsed,
      committed: turn.reactionUsedId === OFF_LIST_REACTION_ID,
    },
  };
}

export interface ChoiceResistanceSlot {
  choiceKey: string;
  /** The granting feature, for its name. */
  sourceId: string;
  label: LocText;
  amount: number;
  options: ReadonlyArray<DamageType>;
  picked: ReadonlyArray<DamageType>;
  /** When the pick may change (the feature's rule); absent when not recorded. */
  choiceFrequency?: "short-or-long-rest" | "long-rest" | "cast";
}

export function choiceResistanceView(doc: CharacterDoc): ChoiceResistanceSlot[] {
  return aggregateCharacterGrants(doc.character, doc.session).choiceResistances.map(
    (slot) => ({
      choiceKey: slot.choiceKey,
      sourceId: slot.sourceId,
      label: slot.label,
      amount: slot.amount,
      options: slot.options,
      picked: slot.selected,
      ...(slot.choiceFrequency ? { choiceFrequency: slot.choiceFrequency } : {}),
    })
  );
}

/** Toggle one option on the open sheet (the classic picker's write). */
export function pickChoiceResistance(slot: ChoiceResistanceSlot, type: DamageType): void {
  const next = nextChoiceResistancePicks(slot.picked, slot.amount, type);
  if (next)
    useCharacterStore.getState().setGrantBundleChoice(slot.choiceKey, next.join(","));
}
