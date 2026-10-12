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
import { concentrationValue, customConcentrationValue } from "@/lib/concentration";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { concentrationStatusKeys } from "@/lib/status";

/** Apply the one shared active-state/cast-level/timer transaction and return its
 * surgical inverse. Feature and spell commit paths differ only in payment. */
export function activateActionState(
  action: ResolvedAction,
  castLevel?: number
): { activated: boolean; restore: () => void } {
  const store = useCharacterStore.getState();
  const key = action.activatesKey;
  if (!key) return { activated: false, restore: () => undefined };
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
  // Scoped to the open sheet: another of the user's heroes in a fight is not this one.
  const status = sheetEncounter(
    useCombatStatusStore.getState().status,
    useCharacterStore.getState().character?.id ?? null
  );
  const relativeBoundary = action.activeTurnBoundary
    ? turnBoundaryAfter(
        status?.myId ?? "self",
        action.activeTurnBoundary.turns,
        action.activeTurnBoundary.phase,
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
      )
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
