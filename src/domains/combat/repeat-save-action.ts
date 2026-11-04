/**
 * «Ripeti il tiro salvezza» on Play (#748: a condition whose repeat save is taken
 * with the creature's action, Otto's Irresistible Dance): one undoable act that
 * takes the character's Action, writes the attempt and its result in the log, and on
 * a success ends the condition. Its undo reverses all three.
 */
import {
  reinstatePersistentCombatEffect,
  revokePersistentCombatEffect,
} from "@/features/campaigns/campaign-io";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { AbilityCode } from "@/types/ability";

/** The save attempted: the condition's combat effect, and the save's ability. */
export interface RepeatSaveAttempt {
  id: string;
  conditionId: string;
  ability: AbilityCode;
}

/** The Action slot entry an attempt takes, so a second attempt waits a turn. */
export function repeatSaveActionId(saveId: string): string {
  return `repeat-save:${saveId}`;
}

/**
 * Take the Action and record the attempt; a success ends the condition on the
 * encounter. `label` is the toast. Nothing happens when the Action is already spent.
 * A success before the v0.26 rules deploy is restored on undo by the caller's path
 * of old (re-appending a copy); this act only reinstates on v0.26.
 */
export function takeRepeatSaveAction(input: {
  campaignId: string;
  save: RepeatSaveAttempt;
  passed: boolean;
  label: string;
  /** The action's name in the turn tracker. */
  name?: string;
  /** Before v0.26: put the ended condition back another way. */
  restoreLegacy?: () => void;
}): void {
  const { campaignId, save, passed } = input;
  const actionId = repeatSaveActionId(save.id);
  registerUndoableToast(
    { message: input.label },
    () => {
      const combat = useCombatStore.getState();
      if (
        !combat.selectAction({
          id: actionId,
          name: input.name ?? input.label,
          slot: "action",
        })
      ) {
        return null;
      }
      const logId = useCharacterStore.getState().logEvent({
        kind: "repeat-save",
        conditionId: save.conditionId,
        ability: save.ability,
        passed,
      });
      if (passed) {
        void revokePersistentCombatEffect(campaignId, save.id).catch(() => undefined);
      }
      return () => {
        if (passed) {
          if (combatEffectsV26On()) {
            void reinstatePersistentCombatEffect(campaignId, save.id).catch(
              () => undefined
            );
          } else {
            input.restoreLegacy?.();
          }
        }
        if (logId) useCharacterStore.getState().removeLogEntry(logId);
        useCombatStore.getState().deselectAction(actionId);
      };
    },
    { turnScoped: true }
  );
}
