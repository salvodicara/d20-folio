/**
 * useMediaQuery — subscribe a component to a CSS media query, the React-19 way
 * (`useSyncExternalStore` over `matchMedia`, so the value is read-consistent
 * during render and updates exactly when the media state flips).
 *
 * For LAYOUT FORKS that must change the RENDER TREE (mount/unmount a pane),
 * where a pure CSS media query cannot do the job — e.g. the Compendium's
 * two-leaf spread, whose reading pane must not exist in the mobile DOM at all
 * (a `display: none` pane would break the list's scroll-memory remount seam).
 * For anything visual-only, use a CSS `@media` rule instead.
 */

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
