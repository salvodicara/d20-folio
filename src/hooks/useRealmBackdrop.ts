/**
 * useRealmBackdrop — swap the app-wide backdrop for a realm's own scene plate.
 *
 * `--app-bg-art` is the ONE backdrop seam (DESIGN.md §13 "Per-route backdrop
 * override"): the global `body::after` painter reads it, so a routed realm swaps
 * the art by setting the variable on the document root while it is mounted and
 * clearing it on unmount — no second painter, no extra DOM layer. Callers pass a
 * CSS var REFERENCE (e.g. `"var(--asset-compendium-scene)"`), never a URL, so
 * the per-theme cascade keeps resolving the right sibling plate (dark/light) and
 * each theme still downloads only its own file.
 *
 * The campaign hub does NOT use this hook: its `useCampaignBackdrop` also
 * handles DM custom banners + crop focal/zoom + the light-theme custom-art veil.
 */

import { useEffect } from "react";

/** Point `--app-bg-art` at `art` while mounted; restore the default on unmount. */
export function useRealmBackdrop(art: string): void {
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--app-bg-art", art);
    return () => {
      root.removeProperty("--app-bg-art");
    };
  }, [art]);
}
