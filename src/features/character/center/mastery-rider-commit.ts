/**
 * Declare a Weapon-Mastery rider on an attack: log it as a structured rider-use
 * line and light the seam it feeds (Vex → Advantage on the next attack roll),
 * with a 5 s undo that reverses exactly what it did. Cleave, once per turn, is
 * declared at most once until the turn ends. The attack itself was
 * already committed by its card; a mastery spends no resource. Topple's Prone
 * lands on a target from the damage tray (its condition option), not here.
 */
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { isCharacterAlive } from "@/lib/character-status";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { MasteryRiderVM } from "@/lib/views/mastery-rider-view";

export function applyMasteryRider(
  action: ResolvedAction,
  rider: MasteryRiderVM,
  messages: { applied: string; blocked: string }
): void {
  const live = useCharacterStore.getState().character;
  if (live && !isCharacterAlive(live.status, live.session)) {
    useToastStore.getState().showToast({ message: messages.blocked, duration: 2500 });
    return;
  }
  registerUndoableToast(
    { message: messages.applied },
    () => {
      const restoreTurnUse = rider.oncePerTurn
        ? useCombatStore.getState().markMasteryUsed(rider.id)
        : null;
      if (rider.oncePerTurn && !restoreTurnUse) return null;
      const loggedId = useCharacterStore.getState().logEvent({
        kind: "rider-use",
        action: action.nameLoc,
        rider: rider.nameLoc,
        effect: rider.id === "graze" ? "damage" : "attack",
      });
      if (loggedId === null) {
        restoreTurnUse?.();
        return null;
      }
      const restoreAdvantage =
        rider.apply === "next-attack-advantage"
          ? useCombatStore.getState().grantNextAttackAdvantage()
          : null;
      return () => {
        restoreTurnUse?.();
        restoreAdvantage?.();
        useCharacterStore.getState().removeLogEntry(loggedId);
      };
    },
    { turnScoped: true }
  );
}
