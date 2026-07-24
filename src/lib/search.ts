/**
 * Shared search matching — case- AND accent-insensitive, bilingual, tokenized.
 *
 * Every search box in the app filters bilingual SRD content, so a player typing
 * in one language should still find an entry named in the other (e.g. an IT
 * player searching "dash" finds "Scatto", and "furtivita" finds "Furtività").
 * Pass BOTH the localized and the English name as candidates; the candidates are
 * joined into ONE normalized haystack and the query is split into whitespace
 * tokens — the query matches iff EVERY token is a substring of that haystack,
 * ignoring case and diacritics. Tokenizing makes matching order-independent and
 * tolerant of interstitial words the query omits: "pozione guarigione" finds
 * "Pozione di Guarigione" (the "di" simply isn't a query token, so it can't
 * break the match), while partial tokens ("guar") still match.
 */

const DIACRITICS = /[̀-ͯ]/g;

/** Lowercase + strip diacritics so "furtivita" matches "Furtività". */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(DIACRITICS, "");
}

/**
 * True if EVERY whitespace token of `query` is a substring of the combined
 * candidate corpus (case- and accent-insensitive). Candidates are normalized and
 * joined into one haystack, so a query can spread its tokens across several names
 * (localized + English + description). An empty/whitespace query matches
 * everything. `undefined`/`null` candidates are skipped, so it is safe to spread
 * optional names.
 */
export function matchesSearch(
  query: string,
  ...candidates: Array<string | undefined | null>
): boolean {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = candidates
    .filter((c): c is string => c != null)
    .map(normalizeSearch)
    .join(" ");
  return tokens.every((tok) => haystack.includes(tok));
}

/**
 * How WELL a query matched — the relevance tier a ranked surface sorts on. Higher
 * is better; `none` means it did not match at all. The tiers exist because plain
 * substring matching (what {@link matchesSearch} filters on) mixes two very
 * different things: real compound names and pure noise.
 *
 *  - `prefix` — the query opens the candidate ("cover" → "Cover", "fire" → "Fire Bolt");
 *  - `word`   — every token starts SOME word ("bolt" → "Fire Bolt");
 *  - `suffix` — a token ENDS a word ("axe" → "Handaxe", "sword" → "Greatsword") —
 *               the D&D compound case, genuinely useful, just less relevant;
 *  - `infix`  — a token sits INSIDE a word, touching neither edge ("cover" →
 *               "Arcane Re**cover**y", "dis**cover**ies"). This is the noise tier:
 *               a hit no reader can see, which a ranked surface should demote or
 *               drop rather than show as an unexplained row.
 */
export type MatchQuality = "none" | "infix" | "suffix" | "word" | "prefix";

/** Ordering for {@link MatchQuality} — higher sorts first. */
export const MATCH_QUALITY_RANK: Record<MatchQuality, number> = {
  none: 0,
  infix: 1,
  suffix: 2,
  word: 3,
  prefix: 4,
};

/**
 * Rank a query against a candidate corpus (same normalization + tokenization as
 * {@link matchesSearch}, so a surface can filter with one and ORDER with the other
 * and never disagree). Returns the WEAKEST tier across the query's tokens — one
 * infix token makes the whole match an `infix` match — and `none` when
 * {@link matchesSearch} would not have matched at all.
 */
export function matchQuality(
  query: string,
  ...candidates: Array<string | undefined | null>
): MatchQuality {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "prefix";
  const haystack = candidates
    .filter((c): c is string => c != null)
    .map(normalizeSearch)
    .join(" ");
  let worst = MATCH_QUALITY_RANK.prefix;
  tokens.forEach((tok, i) => {
    // Only the FIRST token can OPEN the corpus, so a later token tops out at
    // `word` — "fire bolt" is a word match, not a prefix match.
    const tier = tokenTier(haystack, tok);
    worst = Math.min(worst, i === 0 ? tier : Math.min(tier, MATCH_QUALITY_RANK.word));
  });
  return QUALITY_BY_RANK[worst] ?? "none";
}

const QUALITY_BY_RANK: MatchQuality[] = ["none", "infix", "suffix", "word", "prefix"];

/** The BEST tier one token reaches anywhere in the corpus (see {@link MatchQuality}). */
function tokenTier(haystack: string, token: string): number {
  const isAlnum = (c: string) => c !== "" && /[\p{L}\p{N}]/u.test(c);
  let best = MATCH_QUALITY_RANK.none;
  for (let at = haystack.indexOf(token); at >= 0; at = haystack.indexOf(token, at + 1)) {
    if (at === 0) return MATCH_QUALITY_RANK.prefix;
    const startsWord = !isAlnum(haystack.charAt(at - 1));
    const endsWord = !isAlnum(haystack.charAt(at + token.length));
    best = Math.max(
      best,
      startsWord
        ? MATCH_QUALITY_RANK.word
        : endsWord
          ? MATCH_QUALITY_RANK.suffix
          : MATCH_QUALITY_RANK.infix
    );
  }
  return best;
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
