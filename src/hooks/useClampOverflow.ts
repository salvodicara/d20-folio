/**
 * useClampOverflow — is a CSS-clamped element actually hiding content?
 *
 * The ONE recipe for gating an expand/collapse toggle on REAL overflow: a
 * "Show more" that reveals nothing is pure friction (owner, 2026-07-11 — a
 * feature card whose prose already fit still offered "Mostra tutto"). Attach the
 * returned `ref` to the element that carries the clamp (`line-clamp-*`,
 * `max-height`, …); the hook measures `scrollHeight` vs `clientHeight` and reports
 * whether the content overflows its clamped box, re-checking on resize
 * (ResizeObserver) and whenever `deps` change (a locale swap / font load / edited
 * text), so the verdict can never drift from what's actually rendered.
 *
 * `active` pauses measurement while the element is EXPANDED (an unclamped element
 * never overflows, so its last collapsed verdict is retained to keep the "Show
 * less" affordance mounted) — pass `!expanded`. Mirrors the {@link NoteClamp}
 * measure-only-while-collapsed discipline for the line-clamp case.
 */

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useClampOverflow<T extends HTMLElement>(
  active: boolean,
  deps: unknown
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    // A 1px tolerance absorbs sub-pixel rounding so a byte-exact fit never
    // flickers the toggle on.
    const measure = () => setOverflowing(el.scrollHeight - el.clientHeight > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, deps]);

  return [ref, overflowing];
}
