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
 * The fix combines two parts in one layout frame: keep the edited row at the same
 * viewport position, then FLIP-slide every other row from its old position into the new
 * initiative order. The list communicates what changed without teleporting content.
 */

import { useLayoutEffect, useRef, type RefObject } from "react";

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
  /** Each row id → its viewport top (px) as of the last measured frame. */
  tops: Map<string, number>;
  /** Each row id → its initiative as of the last measured frame. */
  inits: Map<string, number | null>;
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
 * Preserve the user's VISUAL position across a gathering re-sort. On every frame while
 * `enabled`, measure the current row tops (the list renders one child per `rowIds`
 * entry, in order), and when a row's initiative changed since the previous frame, shift
 * the window so that row lands back at its pre-sort viewport position. A no-op the first
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
    if (children.length !== rowIds.length) {
      prevRef.current = null;
      return;
    }
    const tops = new Map<string, number>();
    for (let i = 0; i < rowIds.length; i++) {
      const el = children[i];
      const id = rowIds[i];
      if (el && id !== undefined) tops.set(id, el.getBoundingClientRect().top);
    }
    const prev = prevRef.current;
    prevRef.current = { tops, inits: new Map(initByRowId) };
    if (!prev) return; // first measured frame — nothing to compensate against
    const anchor = initiativeChangeAnchor(prev.inits, initByRowId);
    if (anchor === null) return; // no committed initiative → no re-sort to follow
    const prevTop = prev.tops.get(anchor);
    const newTop = tops.get(anchor);
    if (prevTop === undefined || newTop === undefined) return;
    const delta = newTop - prevTop;
    if (Math.abs(delta) < 1) return; // the anchor didn't actually move
    window.scrollBy(0, delta);
    // The document may be against its top/bottom scroll boundary, so the browser might
    // apply only PART of the requested compensation. Re-measure what actually happened;
    // the residual becomes a FLIP transform instead of a visible teleport.
    for (let i = 0; i < rowIds.length; i++) {
      const el = children[i];
      const id = rowIds[i];
      if (el && id !== undefined) tops.set(id, el.getBoundingClientRect().top);
    }

    if (reducedMotion()) return;
    // The scroll compensation keeps the edited card fixed. Every other card begins at
    // its previous visual top and glides to its newly-sorted slot (FLIP). Inline styles
    // are transient and removed after the motion, so normal card CSS remains the owner.
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
}
