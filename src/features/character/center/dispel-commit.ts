/**
 * End the spell a Dispel Magic chose on its target (M17): every effect of that
 * spell on the target, revoked on the encounter in one undoable act; the undo
 * reinstates them (v0.26 rules).
 */
import {
  reinstatePersistentCombatEffect,
  revokePersistentCombatEffect,
} from "@/features/campaigns/campaign-io";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { registerUndoableToast } from "@/stores/undoStore";

export function dispelSpell(
  campaignId: string,
  effectIds: ReadonlyArray<string>,
  message: string
): boolean {
  if (effectIds.length === 0 || !combatEffectsV26On()) return false;
  return (
    registerUndoableToast(
      { message },
      () => {
        for (const id of effectIds) {
          void revokePersistentCombatEffect(campaignId, id).catch(() => undefined);
        }
        return () => {
          for (const id of effectIds) {
            void reinstatePersistentCombatEffect(campaignId, id).catch(() => undefined);
          }
        };
      },
      { turnScoped: true }
    ) !== null
  );
}
