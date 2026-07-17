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
 * Plus Escape-to-close, and zero listeners while `active` is false. The latest
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
      if (el && !el.contains(e.target as Node)) onDismissRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismissRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, ref]);
}
