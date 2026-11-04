/**
 * The tray's save-success writer for a used action (Stunning Strike): what each
 * target that made its save still gets, as persistent combat effects in the live
 * fight. Absent outside a fight or when the action has none.
 */
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { outcomeEffects } from "@/lib/play/outcome-effects";
import type { ActionSummary } from "@/lib/smart-tracker";
import { useAuthStore } from "@/stores/authStore";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

export function saveSuccessWriter(
  action: {
    id: string;
    summary: Pick<ActionSummary, "saveSuccessEffects" | "saveSuccessSourceId">;
  },
  characterId: string
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  const effects = action.summary.saveSuccessEffects;
  const sourceId = action.summary.saveSuccessSourceId;
  const status = useCombatStatusStore.getState().status;
  if (!effects?.length || !sourceId || !status) return undefined;
  const uid = useAuthStore.getState().user?.uid ?? "";
  const actor: CombatantRef = {
    kind: "pc",
    combatantId: status.myId,
    memberUid: uid,
    characterId,
  };
  return (targetId) => {
    const row = status.view.rows.find((r) => r.id === targetId);
    const target: CombatantRef =
      row?.kind === "pc" && row.memberUid && row.characterId
        ? {
            kind: "pc",
            combatantId: row.id,
            memberUid: row.memberUid,
            characterId: row.characterId,
          }
        : { kind: "monster", combatantId: targetId };
    return outcomeEffects({
      source: { kind: "feature", id: sourceId, actionId: action.id },
      effects,
      outcome: "save-success",
      actor,
      target,
      round: status.round,
      effectId: () => crypto.randomUUID(),
    });
  };
}
