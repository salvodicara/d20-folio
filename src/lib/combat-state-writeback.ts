/**
 * The bridge from the folded encounter back to the LEGACY personal `combat/state` document —
 * stage 6 design §5, under decision D1.
 *
 * **Named fate: this module dies at item 8.** D1 keeps `users/{uid}/characters/{id}/combat/state`
 * a `CombatState` for this stage, because that document carries the character's whole play
 * session (`playState`: slots, trackers, item resources, currency, pinned actions) and the old
 * sheet is still the character screen. When item 8 rebuilds the sheet, the personal aggregate
 * becomes an `Encounter` and this projection — together with `PersonalWriteBack`'s `document`
 * variant in `combat-lease.ts` — is deleted rather than migrated.
 *
 * Until then, leaving a table must show the fight's outcome on the sheet and must NOT cost the
 * player anything else the document holds. So the projection is exactly the combat trio the two
 * models share — HP current and temp, the conditions, the death saves — written over the
 * previous document, with every other field preserved verbatim.
 *
 * Pure: no clock, no Firebase, no locale. The caller (`leaveTable`) writes the result.
 */
import type { ConditionId, Effect, Entity } from "./combat/types";
import type { CombatState } from "@/types/combat-state";

/**
 * The stable condition ids `effects` puts on `entity`, sorted and deduplicated.
 *
 * Sorted because `CombatState.conditions` is an array the sheet renders in order and the
 * document is compared for equality by the persistence layer; deduplicated because two sources
 * (a spell and a monster's attack) may impose the same condition, which the engine models as two
 * effects and the sheet as one badge.
 */
function conditionsOf(entity: Entity, effects: readonly Effect[]): ConditionId[] {
  const ids = effects.flatMap((effect) =>
    effect.target === entity.id && effect.payload.kind === "condition"
      ? [effect.payload.condition]
      : []
  );
  return [...new Set(ids)].sort();
}

/**
 * The previous document with the combat trio replaced by the entity's folded facts.
 *
 * `effects` is the fold's whole effect set (`Object.values(state.effects)`); the projection
 * selects the ones aimed at this entity itself, so the caller never has to pre-filter and can
 * never pre-filter differently from the sheet.
 */
export function projectCombatState(
  previous: CombatState,
  entity: Entity,
  effects: readonly Effect[]
): CombatState {
  return {
    ...previous,
    hp: { current: entity.vitals.hp, temp: entity.vitals.tempHp?.amount ?? 0 },
    conditions: conditionsOf(entity, effects),
    deathSaves: {
      successes: entity.vitals.deathSaves.successes,
      failures: entity.vitals.deathSaves.failures,
    },
  };
}
