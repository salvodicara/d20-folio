/**
 * Chunk-preload recovery — the boot half of the 2026-07-09 "Clear site data" incident.
 *
 * After the service worker's precache is wiped mid-session, a lazy route chunk
 * `import()` can 404 (its hashed file is gone from the cache and the running page still
 * references the old hash), which Vite surfaces as a `vite:preloadError` event. The
 * recovery is a single reload — the fresh page fetches the current index.html + chunk
 * manifest and re-primes the SW.
 *
 * A one-shot flag (in sessionStorage) prevents an infinite reload loop when a chunk is
 * GENUINELY missing (e.g. a rolled-back deploy); it is cleared a beat AFTER a
 * successful boot (`main.tsx`, delayed past the first lazy route loads — clearing at
 * first paint would re-arm a reload for an immediately-refailing chunk and loop).
 * Each healthy load thus restores the recovery budget for a later update. Kept a
 * pure, injected-dependency function so it is testable without a real
 * `window`/`sessionStorage`.
 *
 * Returns whether a recovery reload was issued — `false` means the latch was already
 * armed (this session already tried), and the caller must let the error propagate
 * (Vite's default rethrow → the ErrorBoundary crash screen) rather than swallow it
 * into a silently-dead route.
 */
export const CHUNK_RELOAD_FLAG = "d20-chunk-reload";

export function recoverFromChunkPreloadError(
  reload: () => void,
  store: Pick<Storage, "getItem" | "setItem">,
  flag: string = CHUNK_RELOAD_FLAG
): boolean {
  if (store.getItem(flag)) return false; // already tried this session — don't loop
  store.setItem(flag, "1");
  reload();
  return true;
}
