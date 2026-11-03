/**
 * Time passing outside the turn order, as a screen commits it (the engine's
 * `time-passes` contract, sheet-events.ts): when the stretch ends the held
 * Concentration, its teardown runs first, and both share one whole-state undo, so
 * «Annulla» brings the Concentration back too. The stretch is logged for the session.
 */
import { timePassEndsConcentration } from "@/lib/play/time";
import { beginWholeStateUndo, useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";

export function passTimeWithUndo(minutes: number, message: string): void {
  registerUndoableToast(
    { message },
    () => {
      const store = useCharacterStore.getState();
      const doc = store.character;
      if (!doc || store.readonly) return null;
      const seal = beginWholeStateUndo();
      if (timePassEndsConcentration(doc, minutes)) {
        store.setConcentration("", { undoable: false, silent: true });
      }
      store.dispatch({ kind: "time-passes", minutes });
      store.logEvent({ kind: "time-passes", minutes });
      return seal?.() ?? null;
    },
    { turnScoped: false }
  );
}
