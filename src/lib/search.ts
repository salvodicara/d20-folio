/**
 * Shared search matching — case- AND accent-insensitive, bilingual.
 *
 * Every search box in the app filters bilingual SRD content, so a player typing
 * in one language should still find an entry named in the other (e.g. an IT
 * player searching "dash" finds "Scatto", and "furtivita" finds "Furtività").
 * Pass BOTH the localized and the English name as candidates and the query
 * matches if it is a substring of any of them, ignoring case and diacritics.
 */

const DIACRITICS = /[̀-ͯ]/g;

/** Lowercase + strip diacritics so "furtivita" matches "Furtività". */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS, "");
}

/**
 * True if the trimmed `query` is a substring of any candidate (case- and
 * accent-insensitive). An empty query matches everything. `undefined`/`null`
 * candidates are skipped, so it is safe to spread optional names.
 */
export function matchesSearch(
  query: string,
  ...candidates: Array<string | undefined | null>
): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  return candidates.some((c) => c != null && normalizeSearch(c).includes(q));
}

/** Tier-2 (description) matches require at least this many query characters —
 *  a 1–2 char query matching half the descriptions is noise, never help. */
export const DESC_QUERY_MIN = 3;

/** Flatten markdown prose into ONE search corpus line: bold/emphasis markers
 *  become spaces (a phrase must never be broken by a `**` boundary); empty
 *  parts are skipped, so optional locale variants can be spread safely. */
export function proseCorpus(...parts: Array<string | undefined | null>): string {
  return parts
    .filter((p): p is string => p != null && p !== "")
    .join(" ")
    .replace(/\*+/g, " ");
}

/**
 * RANKED two-tier search filter (owner fb4, 2026-06-12 — users must never
 * struggle to find an item, without noise):
 *
 *  - tier 1 — items whose NAME corpus matches, in original pool order;
 *  - tier 2 — items whose DESCRIPTION corpus matches, appended AFTER every
 *    name hit (original order), and only for queries of ≥ {@link DESC_QUERY_MIN}
 *    normalized characters.
 *
 * Both tiers match through {@link matchesSearch} (bilingual +
 * accent-insensitive). An empty query returns the pool untouched.
 */
export function rankedSearch<T>(
  query: string,
  items: ReadonlyArray<T>,
  nameOf: (item: T) => string,
  descOf?: (item: T) => string | undefined
): ReadonlyArray<T> {
  if (!query.trim()) return items;
  const nameHits = items.filter((i) => matchesSearch(query, nameOf(i)));
  if (descOf == null || normalizeSearch(query.trim()).length < DESC_QUERY_MIN) {
    return nameHits;
  }
  const named = new Set(nameHits);
  const descHits = items.filter((i) => !named.has(i) && matchesSearch(query, descOf(i)));
  return descHits.length > 0 ? [...nameHits, ...descHits] : nameHits;
}
