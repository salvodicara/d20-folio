/**
 * useActiveTabScroll — keep the ACTIVE tab of a horizontal `role=tablist` ribbon
 * revealed inside its OWN scroller, never by moving the page.
 *
 * THE DISEASE IT CURES (owner, 2026-07-04 — "tapping a type that sits off-screen
 * jumps the page"): a horizontal tab ribbon (the compendium type ribbon, the
 * cockpit `TabStrip`) scrolls sideways when it has more tabs than fit. Selecting a
 * tab that sits past the edge left the tab CLIPPED — and on a touch browser the
 * native tap→focus→scroll-into-view then scrolled the whole DOCUMENT vertically to
 * "reveal" the focused button (even though it was already vertically in view),
 * reading as a page jump.
 *
 * The fix reveals the active tab by scrolling the RIBBON ITSELF (`scrollBy` on
 * the container, horizontal only, minimal nearest-edge delta) — never
 * `scrollIntoView`, which may move any scrollable ancestor including the page.
 * The keyboard path pairs this with `focus({ preventScroll: true })`, so the shared
 * ribbon primitives are jump-proof by construction. The reveal gap is CSS
 * (`scroll-padding-inline` on the scroller).
 */

import { useEffect, type RefObject } from "react";

/** Reveal the active `[aria-selected="true"]` tab inside `container` (horizontal,
 *  page-safe). No-op when there is no container or nothing selected, OR when the
 *  active tab is already fully visible in the scroller — a spurious reveal of an
 *  in-view tab combined with the strip's `scroll-padding-inline` gap left the first
 *  tab mid-scroll on the member sheet, clipping its start to "…bat" (owner). We
 *  only nudge a tab that is genuinely CLIPPED past an edge. Exported for the unit. */
export function revealActiveTab(container: HTMLElement | null): void {
  const active = container?.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!container || !active) return;
  const c = container.getBoundingClientRect();
  const a = active.getBoundingClientRect();
  // A 1px epsilon absorbs sub-pixel layout; already fully in view ⇒ leave it put.
  if (a.left >= c.left - 1 && a.right <= c.right + 1) return;
  // CONTAINER-ONLY horizontal nudge (owner-grilled standard, 2026-07-31): the
  // minimal nearest-edge delta, applied to the strip's own scrollLeft — never
  // scrollIntoView, which may scroll ANY scrollable ancestor (the page's
  // vertical axis included) and whose cross-browser behaviour is exactly the
  // unpredictability the owner reported. Smooth unless motion is reduced.
  const delta = a.left < c.left ? a.left - c.left : a.right - c.right;
  const reduced =
    document.documentElement.getAttribute("data-motion") === "reduced" ||
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  container.scrollBy({ left: delta, behavior: reduced ? "auto" : "smooth" });
}

/**
 * Reveal the active tab inside `containerRef` whenever `activeKey` changes (mount
 * included). `activeKey` is the id of the selected tab — the ONE input that means
 * "the selection moved", so the reveal fires exactly when a new tab could sit off
 * the edge (a fresh type in the compendium, a switched cockpit tab).
 */
export function useActiveTabScroll(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string
): void {
  useEffect(() => {
    revealActiveTab(containerRef.current);
  }, [containerRef, activeKey]);
}
