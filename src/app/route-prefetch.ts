/**
 * Route prefetch (#59 F22) — warm the chunks a signed-in player most likely opens
 * next, during idle after first paint. `import()` is module-cached, so calling
 * these here makes the first real navigation instant (the lazy route reuses the
 * cached module) instead of a cold fetch behind a Suspense spinner. It also warms
 * the SRD off the critical path (it's no longer in the eager bundle — #59/#78).
 *
 * Standalone module (not `router.tsx`) so `AppShell` can trigger the prefetch
 * without a router⇄shell import cycle; `router.tsx` reuses the same factories for
 * its `lazy()` routes.
 */
export const importCockpit = () => import("@/features/character/CharacterCockpit");
export const importCampaigns = () => import("@/features/campaigns/CampaignsListPage");
export const importCompendium = () => import("@/features/compendium/CompendiumPage");

/** Warm the likely-next route chunks during idle (called once after first paint). */
export function prefetchLikelyRoutes(): void {
  const run = () => {
    void importCockpit();
    void importCampaigns();
    void importCompendium();
  };
  // requestIdleCallback isn't in Safari < 17; fall back to a short timeout so the
  // prefetch never blocks the main thread during the initial render/paint.
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}
