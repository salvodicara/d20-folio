import { useEffect, type RefObject } from "react";

/** Marks a sideways-scrolling row with `data-more` while part of it is cut off, so it
 *  fades at its right edge and the cut item reads as "more". */
export function useScrollMore(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      el.dataset.more = String(
        el.scrollWidth > el.clientWidth + 4 &&
          el.scrollLeft + el.clientWidth < el.scrollWidth - 4
      );
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
