/**
 * gathering-scroll-anchor — keep the just-committed initiative card under the user's
 * eye when the GATHERING roster live-re-sorts (B23, owner-reported "jumps to a weird
 * place").
 *
 * During the gathering phase the party combat list renders in live `sortByInitiative`
 * order (no frozen order yet), so committing an initiative (a monster chip the DM
 * types, or a PC roll that streams in) moves that card's DOM node — a blank sorts last,
 * a high roll jumps toward the top. The page is WINDOW-scrolled (`ScrollRestorer` holds
 * `window.scrollY`), and browser scroll-anchoring fails here because the moved node was
 * itself the anchor, so the viewport lands on different content.
 *
 * The fix snapshots the old row positions and FLIP-slides every moved row into the new
 * initiative order. The document scroll position stays untouched: moving the viewport
 * as well as the cards creates an over-correction when the page is near a scroll boundary.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The row whose initiative CHANGED between two snapshots — the just-committed card the
 * viewport should follow across the re-sort. `null` when nothing changed (no re-sort to
 * compensate) or the changed row is absent from the other snapshot (nothing stable to
 * anchor). The FIRST changed id wins — deterministic, and sufficient when a batched
 * snapshot moves several at once. Pure.
 */
export function initiativeChangeAnchor(
  prev: ReadonlyMap<string, number | null>,
  next: ReadonlyMap<string, number | null>
): string | null {
  for (const [id, init] of next) {
    if (prev.has(id) && prev.get(id) !== init) return id;
  }
  return null;
}

interface Snapshot {
  /** Each row id → its document top (px), re-measured whenever a row changes size. */
  tops: Map<string, number>;
  /** Each row id → its initiative as of the last measured frame. */
  inits: Map<string, number | null>;
}

/** Each row's document top, in `rowIds` order; null when the DOM and model disagree. */
function measureTops(
  listEl: HTMLElement,
  rowIds: readonly string[]
): Map<string, number> | null {
  const children = listEl.children;
  if (children.length !== rowIds.length) return null;
  const tops = new Map<string, number>();
  for (let i = 0; i < rowIds.length; i++) {
    const el = children[i];
    const id = rowIds[i];
    // Document coordinates make the FLIP baseline immune to the user scrolling
    // between the initial render and the initiative commit.
    if (el && id !== undefined)
      tops.set(id, el.getBoundingClientRect().top + window.scrollY);
  }
  return tops;
}

const REORDER_MS = 220;
const REORDER_EASE = "cubic-bezier(.2, .8, .2, 1)";

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Preserve visual continuity across a gathering re-sort. On every frame while
 * `enabled`, measure the current document-space row tops (the list renders one child per `rowIds`
 * entry, in order), and when a row's initiative changed since the previous frame, animate
 * every moved row from its pre-sort viewport position. A no-op the first
 * frame, when disabled (turns begun → the order is frozen, no live re-sort), or when the
 * DOM and model row counts disagree (a defensively-nulled row → don't compensate on a
 * bad map).
 */
export function useGatheringScrollAnchor<E extends HTMLElement>({
  enabled,
  rowIds,
  initByRowId,
  listRef,
}: {
  enabled: boolean;
  rowIds: readonly string[];
  initByRowId: ReadonlyMap<string, number | null>;
  listRef: RefObject<E | null>;
}): void {
  const prevRef = useRef<Snapshot | null>(null);
  useLayoutEffect(() => {
    const listEl = listRef.current;
    if (!enabled || !listEl) {
      prevRef.current = null;
      return;
    }
    const children = listEl.children;
    // One child per row, in `rowIds` order — bail (drop the baseline) if they disagree
    // rather than compensate on a misaligned map.
    const tops = measureTops(listEl, rowIds);
    if (!tops) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    prevRef.current = { tops, inits: new Map(initByRowId) };
    if (!prev) return; // first measured frame — nothing to compensate against
    const anchor = initiativeChangeAnchor(prev.inits, initByRowId);
    if (anchor === null) return; // no committed initiative → no re-sort to follow
    const prevTop = prev.tops.get(anchor);
    const newTop = tops.get(anchor);
    if (prevTop === undefined || newTop === undefined) return;
    if (Math.abs(newTop - prevTop) < 1) return; // the anchor didn't actually move

    if (reducedMotion()) return;
    // Every moved card begins at its previous visual top and glides to its newly-sorted
    // slot (FLIP). The viewport never moves, so the pointer/cursor remains stable. Inline
    // styles are transient and removed after the motion, so normal card CSS remains owner.
    for (let i = 0; i < rowIds.length; i++) {
      const id = rowIds[i];
      const el = children[i] as HTMLElement | undefined;
      if (!id || !el) continue;
      const oldTop = prev.tops.get(id);
      const correctedTop = tops.get(id);
      if (oldTop === undefined || correctedTop === undefined) continue;
      const dy = oldTop - correctedTop;
      if (Math.abs(dy) < 1) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight;
      el.style.transition = `transform ${REORDER_MS}ms ${REORDER_EASE}`;
      el.style.transform = "";
      window.setTimeout(() => {
        el.style.transition = "";
        el.style.transform = "";
      }, REORDER_MS + 30);
    }
  }, [enabled, rowIds, initByRowId, listRef]);

  // Keep the baseline true between renders. A row can change size without this hook
  // re-running (a monster card fills in its speed and attacks when its bestiary entry
  // loads, +76 px), which moves every row below it; a baseline measured before that
  // would start their glide from a stale top, so the cards visibly jump at the next
  // commit. Re-measure the tops (the initiatives are unchanged) on every row resize.
  useEffect(() => {
    const listEl = listRef.current;
    if (!enabled || !listEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const prev = prevRef.current;
      const tops = measureTops(listEl, rowIds);
      if (prev && tops) prevRef.current = { ...prev, tops };
    });
    for (const child of listEl.children) observer.observe(child);
    return () => observer.disconnect();
  }, [enabled, rowIds, listRef]);
}
