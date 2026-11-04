/**
 * The tray's state writers for a used action: what each target that made its save
 * still gets (Stunning Strike), and what a hit puts on its target (Guiding Bolt), as
 * persistent combat effects in the live fight. Absent outside a fight or when the
 * action has none.
 */
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { combatEffectsV26On } from "@/lib/deployed-rules";
import { outcomeEffects } from "@/lib/play/outcome-effects";
import type { ActionSummary } from "@/lib/smart-tracker";
import { useAuthStore } from "@/stores/authStore";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";

type StateSummary = Pick<
  ActionSummary,
  "saveSuccessEffects" | "hitEffects" | "targetStateSource"
>;

/** What a target's successful save still gets (Stunning Strike). */
export function saveSuccessWriter(
  action: { id: string; summary: StateSummary },
  characterId: string
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  return stateWriter(action, characterId, "save-success");
}

/** What a hit puts on its target (Guiding Bolt). */
export function hitStateWriter(
  action: { id: string; summary: StateSummary },
  characterId: string
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  return stateWriter(action, characterId, "hit");
}

function stateWriter(
  action: { id: string; summary: StateSummary },
  characterId: string,
  outcome: "hit" | "save-success"
): ((targetId: string) => ActiveCombatEffect[]) | undefined {
  const effects =
    outcome === "hit" ? action.summary.hitEffects : action.summary.saveSuccessEffects;
  const source = action.summary.targetStateSource;
  const status = useCombatStatusStore.getState().status;
  // A feature's state on its target needs the v0.26.0 rules (deployed-rules); a
  // spell's is accepted today.
  if (!effects?.length || !source || !status) return undefined;
  if (source.kind === "feature" && !combatEffectsV26On()) return undefined;
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
      source: { kind: source.kind, id: source.id, actionId: action.id },
      effects,
      outcome,
      actor,
      target,
      round: status.round,
      effectId: () => crypto.randomUUID(),
    });
  };
}
