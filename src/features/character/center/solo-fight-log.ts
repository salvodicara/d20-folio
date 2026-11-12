/**
 * A solo fight's bounds in the sheet log, so the sheet's own report reads the fight
 * (`sheetSessionEntries`): «Start combat» or the first Initiative roll writes its start,
 * «End combat» its end. Each writes only when the fight's state really changes; a
 * campaign fight is the DM's and writes neither.
 */
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useCharacterStore } from "@/stores/characterStore";

import { sheetInEncounter } from "./sheet-in-encounter";
import { sheetEncounter } from "./turn-state";

function solo(): boolean {
  const id = useCharacterStore.getState().character?.id ?? null;
  return sheetEncounter(useCombatStatusStore.getState().status, id) === null;
}

/** Call before the gesture that starts the fight. */
export function logSoloFightStart(): void {
  if (solo() && !sheetInEncounter())
    useCharacterStore.getState().logEvent({ kind: "fight-start" });
}

/** Call before the gesture that ends the fight. */
export function logSoloFightEnd(): void {
  if (solo() && sheetInEncounter())
    useCharacterStore.getState().logEvent({ kind: "fight-end" });
}
