/**
 * useScrollMemory — the ONE scroll-comfort mechanism for an inner scroll
 * container that unmounts and remounts while its owner stays mounted (the
 * compendium codex list and the add-modal picker lists, which swap to a detail
 * leaf and back):
 *
 *  - **Save.** `save()` snapshots the reading position SYNCHRONOUSLY at the
 *    moment the reader leaves the list (the row click, before React commits the
 *    swap). With an `anchorSelector` the position is sealed as "row #N tops the
 *    viewport at offset d" — the only representation that survives
 *    `content-visibility` re-estimation (a raw `scrollTop` maps to a DIFFERENT
 *    visual position once row-height estimates settle). Listening to scroll
 *    events is deliberately NOT used: the browser can fire a native scroll-to-0
 *    on the still-connected container mid-commit, clobbering the real position.
 *  - **Restore.** `attach` (a callback ref) re-expresses the kept anchor the
 *    moment the container remounts — plus one rAF correction pass after the
 *    browser realizes the destination row window — so "open an entry → Back"
 *    lands EXACTLY on the rows the reader left.
 *  - **Reset.** When `resetKey` changes (a new result set — the search query or
 *    a facet changed), the position resets to the top: stale depth into a
 *    different list is never kept.
 *
 * The memory is a stable mutable store (NOT a ref): its methods run only in
 * commit/event contexts and nothing renders from it, so it stays invisible to
 * render — and verifiably so for the Rules-of-React linter.
 */

import { useLayoutEffect, useRef, useState } from "react";

export interface ScrollMemory {
  /** Callback ref for the scroll container — restores the kept position on mount. */
  attach: (el: HTMLElement | null) => void;
  /** Snapshot the current position (call right before the container unmounts). */
  save: () => void;
}

class ScrollMemoryStore implements ScrollMemory {
  private pos = 0;
  private anchorIdx = -1;
  private anchorDelta = 0;
  private el: HTMLElement | null = null;
  private raf = 0;
  /** The scrollTop WE last wrote/confirmed — a mismatch means the user scrolled. */
  private lastSet = 0;

  private readonly anchorSelector?: string;

  constructor(anchorSelector?: string) {
    this.anchorSelector = anchorSelector;
  }

  readonly attach = (node: HTMLElement | null): void => {
    cancelAnimationFrame(this.raf);
    this.el = node;
    if (!node) return;
    this.apply();
    // Settle: re-express the anchor each frame while the freshly mounted list
    // finds its final geometry (commit-time layout can differ — rows wrap in a
    // transient width, `content-visibility` realization trickles in, more under
    // load). Stop after three calm frames or the time cap. If the scroll moved
    // since OUR last write, the USER is scrolling — stand down immediately.
    const started = performance.now();
    let calm = 0;
    const settle = (): void => {
      const el = this.el;
      if (!el) return;
      const moved = Math.abs(el.scrollTop - this.lastSet);
      // A large external move is the USER scrolling — stand down. A small one
      // is the browser's own scroll anchoring compensating a late realization
      // shift (friendly) — adopt it and keep watching.
      if (moved > 24) return;
      const corrected = this.apply();
      calm = corrected ? 0 : calm + 1;
      if (calm < 5 && performance.now() - started < 1200) {
        this.raf = requestAnimationFrame(settle);
      }
    };
    this.raf = requestAnimationFrame(settle);
  };

  readonly save = (): void => {
    const el = this.el;
    if (!el) return;
    this.pos = el.scrollTop;
    this.anchorIdx = -1;
    if (!this.anchorSelector) return;
    const top = el.getBoundingClientRect().top;
    let i = 0;
    for (const row of el.querySelectorAll(this.anchorSelector)) {
      const r = row.getBoundingClientRect();
      if (r.bottom > top + 1) {
        this.anchorIdx = i;
        this.anchorDelta = r.top - top;
        break;
      }
      i += 1;
    }
  };

  readonly reset = (): void => {
    cancelAnimationFrame(this.raf);
    this.pos = 0;
    this.anchorIdx = -1;
    if (this.el) this.el.scrollTop = 0;
  };

  /** Re-express the kept position; returns whether a correction was applied. */
  private apply(): boolean {
    const el = this.el;
    if (!el) return false;
    if (this.anchorSelector && this.anchorIdx >= 0) {
      const row = el.querySelectorAll(this.anchorSelector)[this.anchorIdx];
      if (row) {
        const drift =
          row.getBoundingClientRect().top -
          el.getBoundingClientRect().top -
          this.anchorDelta;
        if (Math.abs(drift) < 1) {
          this.lastSet = el.scrollTop;
          return false;
        }
        el.scrollTop += drift;
        this.lastSet = el.scrollTop;
        return true;
      }
    }
    if (el.scrollTop !== this.pos) el.scrollTop = this.pos;
    this.lastSet = el.scrollTop;
    return false;
  }
}

export function useScrollMemory(
  resetKey?: unknown,
  anchorSelector?: string
): ScrollMemory {
  const [store] = useState(() => new ScrollMemoryStore(anchorSelector));

  // A NEW result set starts at the top (skip the mount run — that's a restore).
  const firstRun = useRef(true);
  useLayoutEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    store.reset();
  }, [resetKey, store]);

  return store;
}
