import { useEffect, useRef, type RefObject } from "react";

/**
 * useDismissOnOutside — the single, robust outside-dismiss primitive for every
 * transient popover / dropdown / menu / picker in the app (the override + condition
 * pickers, the HP drawer, the portrait menus, the settings dropdown, the tag
 * picker…). Replaces eight near-identical hand-rolled `document` listeners so a fix
 * propagates everywhere (consistency by design).
 *
 * Robust by design — two deliberate choices over the naive version it replaces:
 *  - **Capture phase.** The old copies used a bubble-phase `mousedown` listener, so
 *    any child that calls `stopPropagation` (a Radix portal, a native `<select>`,
 *    a nested menu) could swallow the event and leave the popover stuck open. A
 *    capture-phase listener on `document` always fires first, so dismissal can't be
 *    suppressed from below.
 *  - **`pointerdown`.** Covers mouse + touch + pen in one listener (the old
 *    `mousedown` missed touch).
 *
 * Plus Escape-to-close (which CLAIMS the key — see below), and zero listeners
 * while `active` is false. The latest
 * `onDismiss` is read through a ref so callers may pass an inline closure without
 * re-subscribing the listeners every render.
 *
 * @param active    Whether the popover is open (no listeners attached when false).
 * @param ref       The popover's outer element; a pointer inside it is NOT outside.
 * @param onDismiss Called on an outside pointerdown or Escape.
 */
export function useDismissOnOutside(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void
): void {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;
      // A Radix overlay PORTALS its surface to <body>, so a pointer inside a menu
      // this popover OWNS lands physically OUTSIDE `ref` — and dismissing here
      // unmounts that menu between pointerdown and click, so the item never fires.
      // That is exactly why every ⋯ overflow item inside the mobile Signet's chain
      // was dead (History · Export JSON · Export PDF · Share link): the tap
      // collapsed the chain instead of acting. A portaled surface manages its own
      // dismissal (Radix's DismissableLayer), so a pointer inside one counts as
      // inside.
      // BLIND SPOT: this recognises POPPER surfaces (popover / dropdown / tooltip
      // content). A Radix Dialog portal carries no popper wrapper — none is nested
      // in a dismissable region today, and a modal scrim swallows the pointer anyway.
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest("[data-radix-popper-content-wrapper]")
      ) {
        return;
      }
      onDismissRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // CLAIM the key for this layer — Esc belongs to the topmost layer, so a
      // listener BELOW (the sheet's Esc-to-leave-edit-mode) must stand down
      // instead of also firing on the same press. Radix's DismissableLayer marks
      // its own dismissals the same way; `defaultPrevented` is the one signal
      // every layer speaks.
      // ponytail: this hook CLAIMS Esc but does not CHECK `defaultPrevented`, so
      // two stacked popovers both dismiss on one press (outer + inner) instead of
      // peeling one tier. Left as-is deliberately: honoring the flag would make
      // the OUTER (first-registered) listener win and strand the inner popover
      // open — the wrong tier — so a real fix needs a LIFO layer stack, not a
      // one-line guard. No stacked pair ships today.
      e.preventDefault();
      onDismissRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, ref]);
}
