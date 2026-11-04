/**
 * The live fight as the condition facts read it (lib/condition-sources): each
 * combatant's conditions, so a known Frightened source that is Invisible counts as
 * out of sight. Only for the viewer's own PC in the primary encounter.
 */
import { useMemo } from "react";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import type { ConditionEncounter } from "@/lib/condition-sources";

type Status = ReturnType<typeof useCombatStatusStore.getState>["status"];

function encounterOf(status: Status, characterId: string | undefined) {
  return status && characterId && status.characterId === characterId
    ? status.view.rows
    : null;
}

/** The fight around `characterId`'s sheet right now (event handlers). */
export function liveConditionEncounter(
  characterId: string | undefined
): ConditionEncounter | undefined {
  const rows = encounterOf(useCombatStatusStore.getState().status, characterId);
  return rows ? { rows } : undefined;
}

/** The fight around `characterId`'s sheet, re-read when its rows change. */
export function useConditionEncounter(
  characterId: string | undefined
): ConditionEncounter | undefined {
  const rows = useCombatStatusStore((s) => encounterOf(s.status, characterId));
  return useMemo(() => (rows ? { rows } : undefined), [rows]);
}

/** The same fight with each combatant's name (a condition's source, «Da chi?»). */
export function useNamedConditionEncounter(
  characterId: string | undefined
):
  | { rows: ReadonlyArray<{ id: string; name: string; conditions: string[] }> }
  | undefined {
  const rows = useCombatStatusStore((s) => encounterOf(s.status, characterId));
  return useMemo(() => (rows ? { rows } : undefined), [rows]);
}
