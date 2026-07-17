/**
 * useCoarsePointer — the ONE seam that answers "is this a coarse-pointer (touch)
 * device?" for keyboard-affordance chrome (rule 6). A single source of truth for the
 * `(pointer: coarse)` query, so the ⌘K hint chip and every `?` shortcuts entry point
 * gate identically and can't drift.
 *
 * WHY it gates: on a touch phone there's no keyboard, so UI that ADVERTISES keys (the
 * ⌘K chip, the palette's "? Shortcuts" chip + action) is noise — it promises keys the
 * user doesn't have. The global key listeners stay armed regardless (harmless without
 * a keyboard, and a tablet with a hardware keyboard still fires them) — only the
 * advertisement hides. aria-keyshortcuts attributes stay too (AT-facing, not visual).
 *
 * `useCoarsePointer()` is the reactive hook (re-renders when the pointer flips, e.g. a
 * tablet docking a keyboard); `isCoarsePointer()` is a one-shot imperative read for
 * event handlers where a hook can't run.
 */

import { useMediaQuery } from "@/hooks/useMediaQuery";

const COARSE_POINTER = "(pointer: coarse)";

/** Reactive: true on a coarse-pointer (touch) device. */
export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER);
}

/** Imperative one-shot read (for event callbacks, where hooks can't run). */
export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia(COARSE_POINTER).matches;
}
