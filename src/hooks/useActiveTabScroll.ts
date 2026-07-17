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
 * The fix reveals the active tab with `scrollIntoView({ block: "nearest", inline:
 * "nearest" })`: `inline: "nearest"` does the horizontal reveal inside the ribbon;
 * `block: "nearest"` is a no-op on the block axis whenever the tab is already
 * vertically in view (it always is, at the ribbon's row), so the page cannot jump.
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
  active.scrollIntoView({ block: "nearest", inline: "nearest" });
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
