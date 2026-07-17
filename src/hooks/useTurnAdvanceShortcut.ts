/**
 * useTurnAdvanceShortcut — keyboard accelerator for stepping the encounter turn
 * (owner-7). The DM steps the live initiative order with the arrow keys without
 * reaching for the on-screen Prev/Next buttons:
 *
 *   - ArrowRight → Next turn (the natural "step forward" mapping)
 *   - ArrowLeft  → Previous turn
 *
 * Modeled EXACTLY on {@link useEditModeShortcut} (the app's one hotkey idiom): a
 * single `window` keydown listener, a typing-target guard so it NEVER fires while the
 * DM is editing a monster name / HP / initiative field, `preventDefault` only on a key
 * it actually handles, and teardown on unmount. It calls the SAME reducers the
 * EncounterTurnControls buttons do (one turn-step seam — golden rule 3), so there is no
 * parallel turn state.
 *
 * Route-scoped: mounted inside the combat layer (which only renders while an encounter
 * runs), so the accelerator is never global. `enabled` is the DM-only gate (mirrors
 * EncounterTurnControls returning null for a player); `empty` makes it inert when there
 * are no combatants (matching the disabled buttons).
 */

import { useEffect } from "react";
import { isTypingTarget } from "@/lib/shortcuts";

/**
 * Arms the ArrowRight / ArrowLeft turn-advance accelerator while the calling
 * component is mounted. Inert unless `enabled` (DM) and non-`empty`.
 */
export function useTurnAdvanceShortcut({
  enabled,
  empty,
  onNext,
  onPrev,
}: {
  enabled: boolean;
  empty: boolean;
  onNext: () => void;
  onPrev: () => void;
}): void {
  useEffect(() => {
    if (!enabled || empty) return;
    function onKey(e: KeyboardEvent): void {
      // Plain arrows only — any modifier (a browser/OS chord) is left alone.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      // Never hijack arrow-key text caret movement / select navigation.
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      if (e.key === "ArrowRight") onNext();
      else onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, empty, onNext, onPrev]);
}
