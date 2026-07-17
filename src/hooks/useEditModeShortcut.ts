/**
 * useEditModeShortcut — ⌘E (macOS) / Ctrl+E (Windows/Linux) toggles the cockpit's
 * EDIT mode (#101).
 *
 * The cockpit's edit ↔ play state is the ONE global signal on `uiStore.sheetMode`
 * (the same flag the fob family's ✎ coin — BinderFob / MobileSignet — and every
 * tab's inline editor read); this hook is a keyboard accelerator for that single
 * toggle, NOT a parallel edit state (golden rule 3 — it calls `toggleSheetMode`,
 * the action the ✎ coin already uses).
 *
 * Binding: ⌘E / Ctrl+E. "E" for Edit (mnemonic), mirroring the app's existing
 * ⌘K / Ctrl+K palette shortcut. The combo is unassigned in Chrome/Edge/Firefox;
 * Safari only maps ⌘E to "Use Selection for Find" while text is selected — which
 * this hook already steps out of the way of (it no-ops while focus is in a text
 * field / contenteditable, and only `preventDefault`s when it actually handles the
 * key). So no critical browser shortcut is hijacked.
 *
 * Mount it ONLY on the cockpit route (it is wired inside `CockpitView`, which only
 * renders there) so the accelerator is route-scoped, not global. Safety:
 *   - NO-OP while typing in an <input>/<textarea>/contenteditable (never hijacks
 *     text editing).
 *   - NO-OP when the sheet is read-only (a DM viewing a member's sheet — the
 *     keyboard must never enter edit on someone else's sheet); the `readonly` flag
 *     is passed in by the caller (which reads it via `useSheetReadonly`).
 *   - `preventDefault` only on a handled press; never swallows the key otherwise.
 *   - The listener is torn down on unmount (no leak).
 *
 * React-Compiler-safe: reads nothing from refs during render; the effect closes
 * over the latest `readonly` and re-subscribes when it flips (cheap — one listener).
 */

import { useEffect } from "react";
import { useUIStore } from "@/stores/uiStore";
import { isTypingTarget } from "@/lib/shortcuts";

/**
 * Arms the ⌘E / Ctrl+E edit-mode toggle for as long as the calling component is
 * mounted. Pass the sheet's read-only flag so the accelerator is inert on a
 * member-sheet viewer.
 */
export function useEditModeShortcut(readonly: boolean): void {
  const toggleSheetMode = useUIStore((s) => s.toggleSheetMode);

  useEffect(() => {
    if (readonly) return;
    function onKey(e: KeyboardEvent): void {
      // The exact combo: the platform command modifier + "E", with no other
      // modifier in play (Shift/Alt-augmented chords are left for the browser).
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "e") return;
      // Never hijack text editing (incl. Safari's selection-scoped ⌘E find).
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      toggleSheetMode();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readonly, toggleSheetMode]);
}
