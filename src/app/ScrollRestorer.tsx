/**
 * ScrollRestorer — native-feeling cross-page scroll + focus for the lazy-route SPA.
 *
 * React Router's own `<ScrollRestoration>` restores in a layout effect the instant
 * navigation "completes" — but our heavy routes are `React.lazy` + Suspense, so at
 * that instant the page is still the empty FolioLoader with no height, and the
 * restore clamps to 0 ("Back dumps you at the top"). This owns restoration itself:
 * for a POP it waits (rAF) until the freshly-mounted route is TALL ENOUGH to hold
 * the saved position before scrolling, so it never restores into the empty loader
 * window.
 *
 * Rules (see DESIGN.md → "Navigation feel"):
 *  - EVERY fresh PUSH lands at the top — including the three realm indexes
 *    (owner, 2026-07-10: a realm switch must be rock-solid; the old per-realm
 *    scroll memory made the page visibly jump to a remembered offset after mount,
 *    and the masthead never landed in the same place twice). The scroll-to-top
 *    runs SYNCHRONOUSLY in the layout effect — before the committed route's first
 *    paint — so the destination can never flash at the source page's offset.
 *  - Back / forward (POP) restores the exact saved position (per history entry).
 *  - REPLACE (in-place `?tab` / `?type` rewrites) leaves scroll AND focus alone.
 *  - Focus (a11y): a PUSH moves focus to the page's `#main` region with
 *    `preventScroll` (no scroll side effect); a POP never steals focus.
 *
 * One instance lives in the always-mounted AppShell.
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router";
import { recordRealmVisit } from "@/lib/realm-memory";
import { type NavType, scrollTarget } from "@/lib/scroll-restoration";

/** App-lifetime memory of window scroll per history entry key. */
const positions = new Map<string, number>();

export function ScrollRestorer(): null {
  const location = useLocation();
  const navType = useNavigationType() as NavType;
  const currentKey = useRef(location.key);

  // Own restoration app-wide — the browser's native 'auto' fights the lazy-route
  // wait-then-restore below (it clamps against the empty loader height).
  useEffect(() => {
    const prev = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = prev;
    };
  }, []);

  // Continuously remember the scroll offset of the CURRENT history entry.
  useEffect(() => {
    const onScroll = () => positions.set(currentKey.current, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    currentKey.current = location.key;
    // Remember each realm index's query so its tab returns to your category.
    recordRealmVisit(location.pathname, location.search);
    const target = scrollTarget(navType, positions.get(location.key));
    if (target === null) return; // REPLACE — preserve scroll + focus

    const focusOnPush = navType === "PUSH";
    // Land at the top BEFORE the committed route's first paint — a layout effect
    // runs pre-paint, so the new page can never flash at the old page's offset. A
    // POP with a saved offset (`target > 0`) falls to the rAF loop below (wait for the
    // lazy route to be tall enough); every PUSH targets 0 and lands synchronously here.
    let scrolled = target <= 0;
    if (scrolled) window.scrollTo(0, 0);
    // Suspense may keep the SOURCE route painted after the URL has changed, then
    // briefly show a loader before data creates the destination main. Observe that
    // bounded settle instead of focusing the stale node once and losing focus when
    // it unmounts. The identity check means mutations inside the same page never
    // steal focus back from the user.
    let focusedMain: HTMLElement | null = null;
    let focusObserver: MutationObserver | null = null;
    let focusTimer = 0;
    const focusCurrentMain = () => {
      const main = document.getElementById("main");
      if (!main || main === focusedMain) return;
      if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
      focusedMain = main;
    };
    if (focusOnPush) {
      focusCurrentMain();
      focusObserver = new MutationObserver(focusCurrentMain);
      focusObserver.observe(document.body, { childList: true, subtree: true });
      focusTimer = window.setTimeout(() => focusObserver?.disconnect(), 10_000);
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (!scrolled) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        // Only restore once the page can HOLD the offset (lazy content mounted),
        // or the time cap trips — never scroll into the empty loader window.
        if (max >= target || elapsed > 1000) {
          window.scrollTo(0, Math.min(target, Math.max(0, max)));
          scrolled = true;
        }
      }
      if (!scrolled && elapsed < 1000) {
        raf = requestAnimationFrame(tick);
      }
    };
    if (!scrolled) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      focusObserver?.disconnect();
      window.clearTimeout(focusTimer);
    };
    // location.key is unique per history entry (and per REPLACE), so this fires
    // exactly once per navigation.
  }, [location.key, location.pathname, location.search, navType]);

  return null;
}
