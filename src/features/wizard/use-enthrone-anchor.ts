/**
 * The shared NO-JUMP enthrone anchor — wizard F's scroll-pinning machinery
 * (round 3/4 design-lab lineage, re-created in production).
 *
 * When an in-list selection change reflows the page (collapse the old row /
 * unfold the new one), the spot the user clicked must never visually move.
 * `remember(id)` is called in the click handler BEFORE the state change,
 * capturing the viewport top of that entity's element (rows carry `data-fid`).
 * The dep-free `useLayoutEffect` runs after the commit but BEFORE paint,
 * re-measures the same entity's new element and counter-scrolls the window by
 * the delta. Pair the scrolling list with `overflow-anchor: none` (the
 * `.wiz-list` recipe) so the browser's native anchoring never fights it.
 */
import { useLayoutEffect, useRef, type RefObject } from "react";

/** Viewport-relative LAYOUT top via the offset chain — deliberately blind to
 *  transforms, so a hover lift (translateY) can't skew the anchor. */
function layoutTop(start: Element): number {
  let top = 0;
  let node: HTMLElement | null = start as HTMLElement;
  while (node) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top - window.scrollY;
}

export function useEnthroneAnchor(
  scopeRef: RefObject<HTMLElement | null>
): (id: string) => void {
  const anchorRef = useRef<{ id: string; top: number } | null>(null);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    const el = scopeRef.current?.querySelector(`[data-fid="${CSS.escape(anchor.id)}"]`);
    if (!el) return;
    window.scrollBy(0, layoutTop(el) - anchor.top);
    // Fallback ONLY when the entity ended up FULLY off-screen (a very tall
    // reading body collapsed into a compact row): nudge it back into view.
    // A partially visible row is correct — the spot you clicked held still.
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      el.scrollIntoView({ block: "nearest" });
    }
  });
  return function remember(id: string) {
    const el = scopeRef.current?.querySelector(`[data-fid="${CSS.escape(id)}"]`);
    if (el) anchorRef.current = { id, top: layoutTop(el) };
  };
}
