/**
 * Concentration and the effect rows on the new Play screen (headless): the classic
 * status ledge's facts (the held spell, its countdown, the condition that breaks it)
 * and its actions, from the same functions and store actions. No UI yet.
 */
import { effectiveConditions } from "@/lib/aggregate-character";
import { vitalConcentration } from "@/lib/character-vitals";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { conditionFactsFor, type ConditionEncounter } from "@/lib/condition-sources";
import type { Locale } from "@/lib/locale";
import { concentrationRoundsLeft, deriveStatuses } from "@/lib/status";
import { concentrationLabel } from "@/lib/views/concentration-label";
import { conditionLabel } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { PlayEffectRow } from "./play-effects-view";

export interface ConcentrationModel {
  /** The held spell; null when not concentrating. */
  spell: { id: string; name: string } | null;
  /** Rounds left on what it holds; null when nothing counts down. */
  roundsLeft: number | null;
  /** The first active condition that breaks Concentration (Incapacitated). */
  blockedBy: { id: string; name: string } | null;
}

export function concentrationModel(
  doc: CharacterDoc,
  locale: Locale,
  encounter?: ConditionEncounter
): ConcentrationModel {
  const held = vitalConcentration(doc.session);
  if (!held) return { spell: null, roundsLeft: null, blockedBy: null };
  const conditions = effectiveConditions(doc);
  const facts = conditionFactsFor(doc, encounter);
  const blocking = resolveConditionEffects(conditions, facts).breaksConcentration
    ? conditions.find((id) => resolveConditionEffects([id], facts).breaksConcentration)
    : undefined;
  return {
    spell: { id: held, name: concentrationLabel(held, locale) },
    roundsLeft: concentrationRoundsLeft(deriveStatuses(doc)) ?? null,
    blockedBy: blocking ? { id: blocking, name: conditionLabel(blocking, locale) } : null,
  };
}

/** End Concentration on the open sheet; the store toasts it with its undo. */
export function dropConcentration(): void {
  useCharacterStore.getState().setConcentration("");
}

export type EffectRowAction = { kind: "end"; key: string };

/** What a row's tap can do: the character ends its own buff; an ally's effect is
 *  ended by its caster, so it offers nothing here. */
export function effectRowAction(row: PlayEffectRow): EffectRowAction | null {
  return row.from === null ? { kind: "end", key: row.id } : null;
}

export function runEffectRowAction(action: EffectRowAction): void {
  useCharacterStore.getState().setActiveFeature(action.key, false);
}
