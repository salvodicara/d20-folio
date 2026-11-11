/**
 * Whether a fight is on for the OPEN sheet, read at the moment of a gesture (not a
 * hook): a campaign encounter the character is in, or a solo fight started with
 * «Start combat», by rolling Initiative or by advancing a round ({@link encounterRunning}).
 */
import { useCombatStore } from "@/stores/combatStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { encounterRunning } from "@/lib/play/cast-execution";
import { sheetEncounter } from "./turn-state";

export function sheetInEncounter(): boolean {
  const combat = useCombatStore.getState();
  return encounterRunning({
    sharedEncounter:
      sheetEncounter(
        useCombatStatusStore.getState().status,
        useCharacterStore.getState().character?.id ?? null
      ) !== null,
    soloRound: combat.round,
    soloFightStarted: combat.fightStarted,
    soloInitiative: combat.initiative,
  });
}
