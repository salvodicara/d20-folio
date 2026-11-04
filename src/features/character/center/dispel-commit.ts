/**
 * End the spell a Dispel Magic chose on its target (M17): every effect of that
 * spell on the target, revoked on the encounter in one undoable act; the undo
 * reinstates them (v0.26 rules). The campaign writer loads on first use, so the
 * sheet's provider doesn't pull Firebase in.
 */
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { registerUndoableToast } from "@/stores/undoStore";

export function dispelSpell(
  campaignId: string,
  effectIds: ReadonlyArray<string>,
  message: string
): boolean {
  if (effectIds.length === 0 || !combatEffectsV26On()) return false;
  const io = import("@/features/campaigns/campaign-io");
  return (
    registerUndoableToast(
      { message },
      () => {
        void io
          .then(({ revokePersistentCombatEffect }) =>
            Promise.all(
              effectIds.map((id) => revokePersistentCombatEffect(campaignId, id))
            )
          )
          .catch(() => undefined);
        return () => {
          void io
            .then(({ reinstatePersistentCombatEffect }) =>
              Promise.all(
                effectIds.map((id) => reinstatePersistentCombatEffect(campaignId, id))
              )
            )
            .catch(() => undefined);
        };
      },
      { turnScoped: true }
    ) !== null
  );
}
