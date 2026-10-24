/**
 * The state half of a use: light the action's while-active state (cast level,
 * round timer, turn boundary) and hold its Concentration, each with its surgical
 * inverse. Feature and spell commit paths share it; they differ only in payment.
 */
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { sheetEncounter } from "@/features/character/center/turn-state";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { turnBoundaryAfter } from "@/lib/combat-effects";
import {
  concentrationValue,
  customConcentrationValue,
  customSpellConcentrationValue,
} from "@/lib/concentration";
import {
  COVER_STATES,
  coverStateKey,
  litCoverLevel,
  type CoverStateLevel,
} from "@/lib/cover-states";
import type { LightLevel } from "@/lib/light-states";
import { litLightLevel } from "@/lib/light-states";
import {
  situationKey,
  situationalState,
  type SituationId,
} from "@/lib/situational-states";
import { castStateChoiceKeys } from "@/lib/play/states";
import { castLitStates } from "@/lib/play/on-cast";
import { spellDataOf, spellKeyOf } from "@/lib/play/spell-identity";
import { castWeaponBinding, type WeaponBindingCast } from "@/lib/weapon-binding";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { concentrationStatusKeys } from "@/lib/status";

/**
 * The open sheet's owner-turn edge `turns` turns from now: in the DM-run fight the
 * sheet is in, else on the solo turn engine. Null when the owner has no turn there.
 */
export function ownTurnBoundary(
  turns: number,
  phase: "turn-start" | "turn-end"
): { round: number; phase: "turn-start" | "turn-end" } | null {
  // Scoped to the open sheet: another of the user's heroes in a fight is not this one.
  const status = sheetEncounter(
    useCombatStatusStore.getState().status,
    useCharacterStore.getState().character?.id ?? null
  );
  const boundary = turnBoundaryAfter(
    status?.myId ?? "self",
    turns,
    phase,
    status
      ? {
          round: status.round,
          currentCombatantId: status.encounter.currentCombatantId,
          phase: "turn-start",
          order: status.encounter.order ?? status.view.turnOrderIds,
        }
      : {
          round: useCombatStore.getState().round,
          currentCombatantId: "self",
          phase: "turn-start",
          order: ["self"],
        }
  );
  return boundary ? { round: boundary.round, phase: boundary.phase } : null;
}

/** Apply the one shared active-state/cast-level/timer transaction and return its
 * surgical inverse. Feature and spell commit paths differ only in payment. */
export function activateActionState(
  action: ResolvedAction,
  castLevel?: number,
  /** The weapon a weapon-binding cast names (Magic Weapon, Shillelagh): bound when
   *  the spell can take it. Absent (no picker yet): the state lights, nothing binds. */
  binding?: Omit<WeaponBindingCast, "spell">
): { activated: boolean; restore: () => void } {
  const store = useCharacterStore.getState();
  // States the cast lights by itself ("Whenever you cast Divine Smite"), even for a
  // spell with no state of its own; undone with the cast.
  const castKey = action.source === "spell" ? spellKeyOf(action) : null;
  const restoreCastLit = castKey ? lightStatesActivatedByCast(castKey) : () => undefined;
  const key = action.activatesKey;
  if (!key) return { activated: false, restore: restoreCastLit };
  const previousLevel = store.character?.session.activeSpellCastLevels?.[key];
  const previousConcentration = store.character?.session.concentration ?? "";
  const previousConcentrationCastLevel = store.character?.session.concentrationCastLevel;
  const previousConcentrationKeys = concentrationStatusKeys(previousConcentration);
  const previousConcentrationKeyLevels = Object.fromEntries(
    previousConcentrationKeys.flatMap((activeKey) => {
      const level = store.character?.session.activeSpellCastLevels?.[activeKey];
      return level === undefined ? [] : [[activeKey, level] as const];
    })
  );
  const activated = !(store.character?.session.activeFeatures ?? []).includes(key);
  if (activated) store.setActiveFeature(key, true);
  const restoreActivationTrackers = activated
    ? store.refreshTrackersOnActivation(key)
    : null;
  if (action.source === "spell") store.setActiveSpellCastLevel(key, castLevel);
  // Each cast picks its option anew (Enlarge or Reduce): a new cast, even over a
  // still-lit state, clears the remembered choice so the rail asks again. The same
  // cast keeps its pick across re-renders and reloads; undo puts the prior one back.
  const choiceKeys =
    action.source === "spell" ? castStateChoiceKeys(spellDataOf(action), key) : [];
  const priorChoices = Object.fromEntries(
    choiceKeys.map((bundleKey) => [
      bundleKey,
      store.character?.session.grantBundleChoices?.[bundleKey] ?? null,
    ])
  );
  const spell = action.source === "spell" ? spellDataOf(action) : undefined;
  const bound =
    binding && spell && store.character
      ? castWeaponBinding({ spell, ...binding }, store.character)
      : null;
  if (choiceKeys.length > 0) {
    store.dispatch({
      kind: "set-bundle-choices",
      choices: {
        ...Object.fromEntries(choiceKeys.map((bundleKey) => [bundleKey, null])),
        // The named weapon's picks; their keys are among `choiceKeys`, so the
        // restore below puts the prior picks back.
        ...(bound?.ok ? bound.choices : {}),
      },
    });
  }
  // An activated state can declaratively forbid Concentration (2024 Rage).
  // End the held spell through the ONE concentration seam so its standing chips
  // retract and the combat log remains truthful. The surrounding action undo
  // restores the whole prior concentration state atomically.
  const activatedCharacter = useCharacterStore.getState().character;
  const concentrationLogIds =
    activated &&
    previousConcentration &&
    activatedCharacter &&
    aggregateCharacterGrants(activatedCharacter.character, activatedCharacter.session)
      .concentrationBlocked
      ? useCharacterStore.getState().setConcentration("", { undoable: false })
      : [];
  const restoreTimer = action.activeDurationRounds
    ? store.armEffectTimer(key, action.activeDurationRounds)
    : null;
  const relativeBoundary = action.activeTurnBoundary
    ? ownTurnBoundary(action.activeTurnBoundary.turns, action.activeTurnBoundary.phase)
    : null;
  const restoreBoundary = relativeBoundary
    ? store.armEffectBoundary(key, {
        round: relativeBoundary.round,
        phase: relativeBoundary.phase,
      })
    : null;
  return {
    activated,
    restore: () => {
      restoreCastLit();
      const current = useCharacterStore.getState();
      const canRestoreConcentration =
        concentrationLogIds.length > 0 &&
        current.character?.session.concentration === "" &&
        (current.character.session.activeFeatures ?? []).includes(key);
      // Timers first: lighting the state armed its own default countdown, which
      // `restoreTimer` would otherwise re-plant after the deactivation drops it.
      restoreTimer?.();
      restoreBoundary?.();
      if (activated) current.setActiveFeature(key, false);
      if (action.source === "spell") current.setActiveSpellCastLevel(key, previousLevel);
      if (choiceKeys.length > 0) {
        current.dispatch({ kind: "set-bundle-choices", choices: priorChoices });
      }
      restoreActivationTrackers?.();
      if (canRestoreConcentration) {
        current.setConcentration(previousConcentration, {
          castLevel: previousConcentrationCastLevel,
          undoable: false,
          silent: true,
        });
        for (const activeKey of previousConcentrationKeys) {
          current.setActiveFeature(activeKey, true);
          current.setActiveSpellCastLevel(
            activeKey,
            previousConcentrationKeyLevels[activeKey]
          );
        }
      }
      for (const id of concentrationLogIds) current.removeLogEntry(id);
    },
  };
}

/**
 * Light every state a cast of `spellId` activates (Smite of Protection on Divine
 * Smite) with its declared end; a still-lit one is re-armed. Returns the inverse:
 * each end goes back to what it was, and a state this cast lit goes dark again.
 */
function lightStatesActivatedByCast(spellId: string): () => void {
  const store = useCharacterStore.getState();
  const doc = store.character;
  if (!doc) return () => undefined;
  const restores = castLitStates(doc, spellId).map(({ key, turnBoundary, rounds }) => {
    const wasLit = (
      useCharacterStore.getState().character?.session.activeFeatures ?? []
    ).includes(key);
    if (!wasLit) store.setActiveFeature(key, true);
    const boundary = turnBoundary
      ? ownTurnBoundary(turnBoundary.turns, turnBoundary.phase)
      : null;
    const restoreBoundary = boundary ? store.armEffectBoundary(key, boundary) : null;
    const restoreTimer = rounds ? store.armEffectTimer(key, rounds) : null;
    return () => {
      restoreTimer?.();
      restoreBoundary?.();
      if (!wasLit) useCharacterStore.getState().setActiveFeature(key, false);
    };
  });
  return () => {
    for (const restore of restores.reverse()) restore();
  };
}

/** Hold the action's Concentration and return its surgical inverse. */
export function applyActionConcentration(
  action: ResolvedAction,
  castLevel: number | undefined
): (activated: boolean) => void {
  const store = useCharacterStore.getState();
  let restoreStoredConcentration: (() => void) | undefined;
  const loggedIds = action.concentration
    ? store.setConcentration(
        action.spellId
          ? concentrationValue(action.spellId)
          : action.customSpellInstanceId
            ? customSpellConcentrationValue({
                instanceId: action.customSpellInstanceId,
                name: action.name,
              })
            : customConcentrationValue(action.name),
        {
          castLevel,
          captureUndo: (undo) => {
            restoreStoredConcentration = undo;
          },
        }
      )
    : [];
  return () => {
    const current = useCharacterStore.getState();
    if (action.concentration) {
      restoreStoredConcentration?.();
    }
    for (const id of loggedIds) current.removeLogEntry(id);
  };
}

/**
 * Light one cover level (or clear it, with null) on the open sheet until its
 * declared turn edge (the start of the owner's next turn); returns the inverse, or
 * null when nothing changed.
 */
export function commitCover(level: CoverStateLevel | null): (() => void) | null {
  const duration = COVER_STATES.find((state) => state.level === level)?.grant.duration;
  const until =
    duration?.kind === "turn-boundary"
      ? (ownTurnBoundary(duration.turns, duration.phase) ?? undefined)
      : undefined;
  const store = useCharacterStore.getState();
  const session = store.character?.session;
  const prior = session ? litCoverLevel(session) : null;
  const priorUntil = prior
    ? session?.effectBoundaries?.[coverStateKey(prior)]
    : undefined;
  if (!store.dispatch({ kind: "set-cover", level, until })) return null;
  // The inverse re-runs the prior level with its own edge, so an undo later in the
  // turn leaves every other change in place.
  return () => {
    useCharacterStore.getState().dispatch({
      kind: "set-cover",
      level: prior,
      until: priorUntil,
    });
  };
}

/**
 * Light (or clear) one situational attack state on the open sheet until its
 * declared turn edge (the end of the owner's turn); returns the inverse, or null
 * when nothing changed.
 */
export function commitSituation(id: SituationId, lit: boolean): (() => void) | null {
  const duration = situationalState(id)?.grant.duration;
  const until =
    lit && duration?.kind === "turn-boundary"
      ? (ownTurnBoundary(duration.turns, duration.phase) ?? undefined)
      : undefined;
  const store = useCharacterStore.getState();
  const priorUntil = store.character?.session.effectBoundaries?.[situationKey(id)];
  if (!store.dispatch({ kind: "set-situation", situation: id, lit, until })) return null;
  return () => {
    useCharacterStore.getState().dispatch({
      kind: "set-situation",
      situation: id,
      lit: !lit,
      until: priorUntil,
    });
  };
}

/** Set the light level on the open sheet (null clears it); returns the inverse, or
 * null when nothing changed. */
export function commitLight(level: LightLevel | null): (() => void) | null {
  const store = useCharacterStore.getState();
  const session = store.character?.session;
  const prior = session ? litLightLevel(session) : null;
  if (!store.dispatch({ kind: "set-light", level })) return null;
  return () => {
    useCharacterStore.getState().dispatch({ kind: "set-light", level: prior });
  };
}
