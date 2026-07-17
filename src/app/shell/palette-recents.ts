/**
 * Recently-used "Ask the Folio" actions (OWN-33).
 *
 * The palette's empty state is a BOUNDED launcher: it shows a few recents + the
 * (stable, few) sections, and reveals everything else on type — so the entry
 * point stays a fixed size no matter how many actions exist (the scalable
 * pattern owner-picked over "shrink the rows", which just re-overflows).
 *
 * This module persists the keys (the stable `Hit.key`, e.g. `act:new-character`)
 * of the most-recently-activated launcher items, most-recent-first, capped. It's
 * a thin localStorage wrapper — no Firebase, safe to import anywhere incl. tests.
 */

const STORAGE_KEY = "d20-folio-palette-recents";
/** How many recents to keep — small so the launcher stays bounded. */
const CAP = 5;

/** The recent launcher-item keys, most-recent-first (empty if none / unavailable). */
export function getPaletteRecents(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k): k is string => typeof k === "string").slice(0, CAP);
  } catch {
    return [];
  }
}

/** Record that a launcher item was activated — moves its key to the front, capped. */
export function recordPaletteRecent(key: string): void {
  try {
    const next = [key, ...getPaletteRecents().filter((k) => k !== key)].slice(0, CAP);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / SSR) — recents are best-effort.
  }
}

/** Test-only: clear the recents so each test starts cold. */
export function __resetPaletteRecents(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
