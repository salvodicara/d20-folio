/**
 * useOverflowFade — track which edges of a HORIZONTAL scroller still hide content,
 * so a strip can paint an "more this way" edge-fade cue keyed by `data-fade`.
 *
 * The shared seam behind the cockpit `TabStrip` and the Compendium type ribbon:
 * both scroll sideways when they hold more tabs than fit, and a tab clipped past
 * the edge with no signal is a discoverability hole. This returns the current fade
 * string ("" | "l" | "r" | "lr"), kept current on scroll AND on any width change
 * (a rail drop, a phone rotation, a locale switch changing label widths).
 */

import { useEffect, useState, type RefObject } from "react";

/** Which edges of a horizontal scroller still hide content: "" · "l" · "r" · "lr". */
export function overflowEdges(el: HTMLElement): string {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) return "";
  const x = el.scrollLeft;
  return `${x > 1 ? "l" : ""}${x < max - 1 ? "r" : ""}`;
}

function useEdgeFade(
  ref: RefObject<HTMLElement | null>,
  edges: (el: HTMLElement) => string
): string {
  const [fade, setFade] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setFade(edges(el));
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [ref, edges]);
  return fade;
}

export function useOverflowFade(ref: RefObject<HTMLElement | null>): string {
  return useEdgeFade(ref, overflowEdges);
}

/** Which edges of a VERTICAL scroller still hide content: "" · "t" · "b" · "tb".
 *  The same cue for a bounded vertical valve (the compendium facet ledger). */
export function overflowEdgesY(el: HTMLElement): string {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) return "";
  const y = el.scrollTop;
  return `${y > 1 ? "t" : ""}${y < max - 1 ? "b" : ""}`;
}

export function useOverflowFadeY(ref: RefObject<HTMLElement | null>): string {
  return useEdgeFade(ref, overflowEdgesY);
}
