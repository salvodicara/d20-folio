/**
 * useUndoRedoShortcut — ⌘Z / ⌘⇧Z (macOS) · Ctrl+Z / Ctrl+Shift+Z (Windows/Linux)
 * drive the session undo/redo stack (`undoStore`).
 *
 * Cloned from the shipped `useEditModeShortcut` pattern: mounted ROUTE-SCOPED in
 * `CockpitView` (never global), inert on a read-only sheet, and it only ever
 * operates on the TOP of the stack — the always-safe LIFO path (the topbar control
 * and each toast's Undo button own the contextual mid-stack path).
 *
 * These bindings are the second sanctioned exception to the registry's "nothing
 * that mutates game state gets a global/single-key binding" law (see `shortcuts.ts`
 * → THE LIMITS): they are chorded, route-scoped, and strictly REVERSAL — a stray
 * press can only un-commit toward a prior state, never spend a resource; redo can
 * only re-apply what an undo just reversed and re-validates every execute-side guard.
 *
 * Guards, in order:
 *   1. `isTypingTarget` — the browser's native text-undo always wins while typing.
 *   2. `inDialog` — an open modal owns its own keys.
 *   3. `readonly` — the hook isn't armed at all (parameterized like the edit hook).
 *   4. Empty stack for the requested direction — return WITHOUT `preventDefault`
 *      (never swallow a key we didn't handle — registry doctrine).
 * On a handled press: `preventDefault`, run `undo()`/`redo()` (which dismisses any
 * linked toast), then fire the confirmation beat (Undone / Redone / can't-redo).
 *
 * Touch: the listener mounts regardless of pointer (hardware keyboards on tablets
 * work); the discreet topbar control carries the affordance for coarse pointers.
 */

import { useEffect } from "react";
import { useUndoActions } from "@/hooks/useUndoActions";
import { isTypingTarget, inDialog } from "@/lib/shortcuts";

/** Arms ⌘Z / ⌘⇧Z for as long as the calling component is mounted. */
export function useUndoRedoShortcut(readonly: boolean): void {
  const { triggerUndo, triggerRedo } = useUndoActions();

  useEffect(() => {
    if (readonly) return;
    function onKey(e: KeyboardEvent): void {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || e.altKey || e.key.toLowerCase() !== "z") return;
      // Native text-undo wins while typing; an open dialog owns its own keys.
      if (isTypingTarget(e.target) || inDialog(e.target)) return;
      // The triggers return false on an empty stack (a legal redo-bail returns
      // true) — so we `preventDefault` iff we actually acted, never swallowing a
      // key we didn't handle (registry doctrine).
      if (e.shiftKey ? triggerRedo() : triggerUndo()) e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readonly, triggerUndo, triggerRedo]);
}
