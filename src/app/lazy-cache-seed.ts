/**
 * The first visit's lazy data, into the offline cache. `assets/lazy/` (one
 * language's text, the bestiary) is cached by the service worker on use, not
 * precached. But on a first visit the worker is not yet in control while the
 * startup shards load, so those fetches bypass it. Once it takes control (it claims
 * the page on activation), every lazy file this visit already loaded is fetched
 * again through it: an Italian player's first visit leaves the Italian text cached
 * for offline. Later visits load under its control already; the re-fetch is then a
 * cache hit.
 */
const LAZY = /\/assets\/lazy\/[^?#]+\.js$/;

function idle(run: () => void): void {
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 1500);
}

/** Re-fetch, through the worker, every lazy file this page has loaded so far. */
export function seedLazyDataCache(): void {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) return;
  if (!navigator.onLine) return;
  const urls = new Set(
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => LAZY.test(new URL(name).pathname))
  );
  for (const url of urls) void fetch(url).catch(() => undefined);
}

/** Install at boot: seed once the worker controls the page. */
export function installLazyDataSeed(): void {
  if (!("serviceWorker" in navigator)) return;
  // The default buffer (250) would drop entries on a first visit's long load.
  performance.setResourceTimingBufferSize(2000);
  if (navigator.serviceWorker.controller) {
    idle(seedLazyDataCache);
    return;
  }
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => idle(seedLazyDataCache),
    {
      once: true,
    }
  );
}
