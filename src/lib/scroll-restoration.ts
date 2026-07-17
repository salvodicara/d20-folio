/**
 * scroll-restoration — the pure target logic behind the ScrollRestorer.
 *
 * Split out from the component so it's unit-testable and so the component file
 * stays a clean single-export (react-refresh).
 */

export type NavType = "POP" | "PUSH" | "REPLACE";

/**
 * Where to land on a navigation. `null` = don't touch scroll or focus (REPLACE,
 * an in-place `?tab`/`?type` rewrite). POP (back/forward) restores the entry's
 * saved offset; EVERY fresh PUSH starts at the top — including the three realm
 * indexes (owner, 2026-07-10: a realm switch must be rock-solid — the masthead
 * always lands in the same place; the old per-realm "tab-stack" restore made the
 * page visibly jump to a remembered offset after mount).
 */
export function scrollTarget(navType: NavType, saved: number | undefined): number | null {
  if (navType === "REPLACE") return null;
  if (navType === "POP") return saved ?? 0;
  return 0;
}
