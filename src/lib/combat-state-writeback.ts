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
 * It also hosts {@link combatStateWriteData}, the document's ONE sanctioned encoder, moved here
 * from `combat-state-io.ts` (which re-exports it unchanged for its existing callers). The move
 * is what lets the encoder be reached from the lease seam and from the emulator lane:
 * `combat-state-io.ts` binds the app's `db` singleton at module scope, and neither
 * `combat-lease.ts` nor a rules test may import `@/lib/firebase`. This module's only Firebase
 * dependency is `serverTimestamp` — a sentinel value, no app instance, no configuration — which
 * keeps it importable from both.
 *
 * No clock, no locale, no `@/lib/firebase`. The caller (`leaveTable`) writes the result.
 */
import { serverTimestamp } from "firebase/firestore";
import { parsePersistedPlayStateV1 } from "@/lib/session-state-codec";
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

/**
 * A payload produced by {@link combatStateWriteData} and by nothing else.
 *
 * The brand is the point: `combat/state` has ONE sanctioned encoder, which refuses a state
 * without a valid v1 `playState` rather than persisting a document `parseCombatState` would
 * then refuse forever (the character could not be opened again). A write seam typed
 * `Record<string, unknown>` invites a caller to hand-roll the object and walk straight past that
 * guard, so the seam is typed as something only the encoder can make.
 */
declare const LEGACY_COMBAT_STATE_WRITE: unique symbol;
export type LegacyCombatStateWrite = Record<string, unknown> & {
  readonly [LEGACY_COMBAT_STATE_WRITE]: true;
};

/** The COMPLETE persisted shape, stamped server-side. One source so every write path — the
 *  cockpit's, the parent-document snapshot's and the table lease's — emits the same document.
 *
 *  The write seam is as CLOSED as the read seam: the child is the sole play owner, so a payload
 *  without a valid v1 `playState` is refused HERE rather than persisted into a document
 *  {@link parseCombatState} would then refuse forever. Seed a fresh child from
 *  `defaultCombatState`, which carries the empty v1 owner. */
export function combatStateWriteData(state: CombatState): LegacyCombatStateWrite {
  if (state.playState === undefined) {
    throw new TypeError("Invalid combat play state: missing");
  }
  const playState = parsePersistedPlayStateV1(state.playState);
  if (!playState.ok) {
    throw new TypeError(`Invalid combat play state: ${playState.reason}`);
  }
  // The one place the brand is minted; this function is its sole source.
  const data: Record<string, unknown> = {
    hp: { current: state.hp.current, temp: state.hp.temp },
    conditions: state.conditions,
    bardicInspirationDie: state.bardicInspirationDie ?? "",
    ...(state.heroicInspiration !== undefined
      ? { heroicInspiration: state.heroicInspiration }
      : {}),
    initiativeRoll: state.initiativeRoll,
    deathSaves: {
      successes: state.deathSaves.successes,
      failures: state.deathSaves.failures,
    },
    round: state.round,
    recentActions: state.recentActions,
    ...(state.activeEffects?.length ? { activeEffects: state.activeEffects } : {}),
    ...(state.appliedEncounterEffects
      ? { appliedEncounterEffects: state.appliedEncounterEffects }
      : {}),
    ...(state.turnEconomy ? { turnEconomy: state.turnEconomy } : {}),
    ...(state.pendingConcentrationSaves?.length
      ? { pendingConcentrationSaves: state.pendingConcentrationSaves }
      : {}),
    playState: playState.value,
    updatedAt: serverTimestamp(),
  };
  return data as LegacyCombatStateWrite;
}

/**
 * The whole lease write-back in one call: project the fight's outcome onto `previous`, then
 * encode it the one sanctioned way. This is the ONLY thing `PersonalWriteBack`'s `document`
 * variant accepts (`combat-lease.ts`).
 *
 * `previous` MUST be a fresh parse of the live document. The write is a whole-document
 * overwrite — the established contract of `combat/state`, whose payload is always complete —
 * so anything the character changed after `previous` was read is lost, not merged.
 */
export function encodeLegacyWriteBack(
  previous: CombatState,
  entity: Entity,
  effects: readonly Effect[]
): LegacyCombatStateWrite {
  return combatStateWriteData(projectCombatState(previous, entity, effects));
}
