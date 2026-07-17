/**
 * In-memory cache of portrait URLs that have already painted this session.
 *
 * ── Why this exists (the "portraits reload on navigation" fix) ────────────────
 * React Router unmounts the roster route on navigation and remounts it on the
 * way back, recreating every `<img>`. Even when the bytes are warm in the disk
 * / service-worker cache, a fresh `<img>` element can show its parent's
 * fallback (initials seal) for a frame before the cached image paints — read by
 * the owner as "the portraits reload every time".
 *
 * This grow-only set records each portrait URL once it has successfully painted
 * ({@link markPortraitLoaded}). A remounted `PortraitImg` whose URL is already
 * {@link isPortraitLoaded} renders the image synchronously with no lazy defer,
 * so the warm image paints immediately with no placeholder flash.
 *
 * It lives in its OWN module (not inside the component) so:
 *   - the component file keeps exporting only a component (fast-refresh clean),
 *   - the cache survives route unmount/remount (module scope),
 *   - it can be reset deterministically in unit tests.
 *
 * It is intentionally NOT persisted: it only needs to outlive a single SPA
 * session to kill the remount flash. The durable cross-session cache is the
 * browser disk cache + the PWA runtime cache, both backed by the immutable
 * Cache-Control header on the upload. Immutable URLs mean an entry never goes
 * stale — a changed portrait gets a NEW url (rotated `?token=`), so the set is
 * grow-only and self-pruning by relevance.
 *
 * Pure module (no Firebase) — safe to import from anywhere, incl. unit tests.
 */

const loadedPortraitUrls = new Set<string>();

/** True if this URL has successfully painted at least once this session. */
export function isPortraitLoaded(url: string): boolean {
  return loadedPortraitUrls.has(url);
}

/** Record that this URL has painted (called from the `<img onLoad>` handler). */
export function markPortraitLoaded(url: string): void {
  loadedPortraitUrls.add(url);
}

/** Test-only: reset the cache so each test starts from a cold cache. */
export function __resetPortraitCache(): void {
  loadedPortraitUrls.clear();
}
