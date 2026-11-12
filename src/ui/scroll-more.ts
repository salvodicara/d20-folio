import { useEffect, type RefObject } from "react";

/** Which edges of a sideways-scrolling row have content cut off. */
export function edgesCut(el: {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}): { start: boolean; end: boolean } {
  const scrolls = el.scrollWidth > el.clientWidth + 4;
  return {
    start: scrolls && el.scrollLeft > 4,
    end: scrolls && el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
  };
}

/** The scroll offset that shows `item` whole, clear of a `fade` at either edge. */
export function scrollLeftToShow(
  view: { scrollLeft: number; clientWidth: number },
  item: { offsetLeft: number; offsetWidth: number },
  fade: number
): number {
  const left = item.offsetLeft - fade;
  const right = item.offsetLeft + item.offsetWidth + fade;
  if (left < view.scrollLeft) return Math.max(0, left);
  if (right > view.scrollLeft + view.clientWidth) return right - view.clientWidth;
  return view.scrollLeft;
}

/** Marks a sideways-scrolling row with `data-more` (its end is cut) and
 *  `data-more-start` (its start is cut), so each cut edge fades and reads as "more". */
export function useScrollMore(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      const cut = edgesCut(el);
      el.dataset.more = String(cut.end);
      el.dataset.moreStart = String(cut.start);
    };
    mark();
    const ro = new ResizeObserver(mark);
    ro.observe(el);
    el.addEventListener("scroll", mark, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", mark);
    };
  }, [ref]);
}
