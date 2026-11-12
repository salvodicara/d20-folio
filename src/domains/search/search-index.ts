/**
 * The new UI's ⌘K search index: built once over the entries of every source
 * (`search-sources.ts`), then queried per keystroke. Pure, no UI.
 *
 * Every name an entry answers to counts: the reader's language, the other language's,
 * and its aliases. A hit says how it matched, best first:
 *   1. exact   the whole name          ("shield"      → Shield)
 *   2. prefix  the name opens with it   ("fire"        → Fire Bolt)
 *   3. word    a word of the name       ("bolt"        → Fire Bolt)
 *   4. suffix  a word ends with it      ("axe"         → Handaxe)
 *   5. fuzzy   a typo away              ("fierball"    → Fireball), the first letter
 *              kept: «palla» is not «dalla» or «alla», «arco» not «Orco» (Lucene's
 *              fuzzy `prefix_length`; a first letter is rarely the typo)
 *   6. text    the entry's text, whole words, at most {@link TEXT_HIT_CAP} results
 *   7. fuzzy   a typo of a word's opening only ("prono" ~ «proto» in Protoplasma): a
 *              half-typed word may still find it, after every whole word found
 * and `infix` (inside a word: "cover" in Recovery) only when nothing better matched.
 * Within a band the user's own things lead (characters, campaigns), then screens,
 * rules and the compendium; then the fewer typos, the shorter name, the label.
 * Matching ignores case and accents (`@/lib/search`).
 */
import {
  matchQuality,
  MATCH_QUALITY_RANK,
  normalizeSearch,
  type MatchQuality,
} from "@/lib/search";

import { TEXT_HIT_CAP, type SearchEntry, type SearchKind } from "./global-search";

export type SearchMatch =
  | "exact"
  | "prefix"
  | "word"
  | "suffix"
  | "fuzzy"
  | "text"
  | "infix"
  | "recent";

export interface SearchHit {
  entry: SearchEntry;
  match: SearchMatch;
  /** The name (or alias) that matched, as written; empty for a text or recent hit. */
  matched: string;
}

export interface SearchQueryOptions {
  /** Cap on the results (default 30). */
  limit?: number;
  /** Only these kinds. */
  kinds?: ReadonlyArray<SearchKind>;
  /** Entry ids, newest first: what an empty query shows. */
  recents?: ReadonlyArray<string>;
}

export interface SearchIndex {
  /** The indexed entries, in source order. */
  readonly entries: ReadonlyArray<SearchEntry>;
  query(query: string, options?: SearchQueryOptions): SearchHit[];
}

const BAND: Record<Exclude<SearchMatch, "recent">, number> = {
  exact: 0,
  prefix: 1,
  word: 2,
  suffix: 3,
  fuzzy: 4,
  text: 5,
  infix: 7,
};
/** A typo of a word's opening only, after the text hits (read as `fuzzy`). */
const PARTIAL_FUZZY_BAND = 6;

const KIND_ORDER: Record<SearchKind, number> = {
  character: 0,
  campaign: 1,
  destination: 2,
  rule: 3,
  compendium: 4,
};

interface IndexedName {
  raw: string;
  norm: string;
  words: string[];
}

interface Indexed {
  entry: SearchEntry;
  order: number;
  names: IndexedName[];
  text: ReadonlyArray<string | null | undefined>;
}

interface Scored {
  item: Indexed;
  band: number;
  distance: number;
  matched: string;
}

const squash = (s: string) => normalizeSearch(s).replace(/\s+/g, " ").trim();
const wordsOf = (norm: string) => norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Typos a query word of this length may carry: none under 4 letters, then 1, then 2. */
function allowedTypos(length: number): number {
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

/** Edit distance with swapped neighbours as one edit (optimal string alignment), over
 *  one flat table: cell (i, j) lives at i * width + j. */
function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const width = b.length + 1;
  const d = new Int32Array((a.length + 1) * width);
  const at = (i: number, j: number) => d[i * width + j] ?? 0;
  for (let j = 0; j <= b.length; j++) d[j] = j;
  for (let i = 1; i <= a.length; i++) {
    d[i * width] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, at(i - 2, j - 2) + 1);
      d[i * width + j] = best;
    }
  }
  return at(a.length, b.length);
}

/**
 * Typos between the query and a name: every query word must sit within its allowance
 * of some word of the name that starts with the same letter, whole or as its opening
 * (so "fierba" still finds Fireball while it is being typed). `distance` is `Infinity` when a word does not; `partial`
 * when a word only matched an opening with a typo, a weaker guess than a whole word.
 */
function fuzzyDistance(
  tokens: ReadonlyArray<string>,
  name: IndexedName
): { distance: number; partial: boolean } {
  let total = 0;
  let partial = false;
  for (const token of tokens) {
    const cap = allowedTypos(token.length);
    if (cap === 0) {
      if (!name.words.some((word) => word.startsWith(token)))
        return { distance: Infinity, partial };
      continue;
    }
    let whole = cap + 1;
    let opening = cap + 1;
    for (const word of name.words) {
      if (word[0] !== token[0]) continue;
      whole = Math.min(whole, editDistance(token, word, cap));
      opening = Math.min(opening, editDistance(token, word.slice(0, token.length), cap));
      if (whole === 0) break;
    }
    const best = Math.min(whole, opening);
    if (best > cap) return { distance: Infinity, partial };
    if (whole > best && best > 0) partial = true;
    total += best;
  }
  return { distance: total, partial };
}

const QUALITY_BAND: Partial<Record<MatchQuality, number>> = {
  prefix: BAND.prefix,
  word: BAND.word,
  suffix: BAND.suffix,
  infix: BAND.infix,
};

function score(
  item: Indexed,
  query: string,
  squashed: string,
  tokens: string[]
): Scored | null {
  const candidates: Scored[] = [];
  for (const name of item.names) {
    if (name.norm === squashed) {
      candidates.push({ item, band: BAND.exact, distance: 0, matched: name.raw });
      continue;
    }
    const band = QUALITY_BAND[matchQuality(query, name.raw)];
    if (band !== undefined && band !== BAND.infix) {
      candidates.push({ item, band, distance: 0, matched: name.raw });
      continue;
    }
    const { distance, partial } = fuzzyDistance(tokens, name);
    if (distance > 0 && distance !== Infinity)
      candidates.push({
        item,
        band: partial ? PARTIAL_FUZZY_BAND : BAND.fuzzy,
        distance,
        matched: name.raw,
      });
    else if (band === BAND.infix)
      candidates.push({ item, band: BAND.infix, distance: 0, matched: name.raw });
  }
  const best = candidates.sort((x, y) => x.band - y.band || x.distance - y.distance)[0];
  if (best && best.band <= BAND.fuzzy) return best;
  if (
    item.text.length > 0 &&
    MATCH_QUALITY_RANK[matchQuality(query, ...item.text)] >= MATCH_QUALITY_RANK.word
  )
    return { item, band: BAND.text, distance: 0, matched: "" };
  return best ?? null;
}

function compare(a: Scored, b: Scored): number {
  return (
    a.band - b.band ||
    KIND_ORDER[a.item.entry.kind] - KIND_ORDER[b.item.entry.kind] ||
    a.distance - b.distance ||
    a.matched.length - b.matched.length ||
    a.item.entry.label.localeCompare(b.item.entry.label) ||
    a.item.order - b.item.order
  );
}

const MATCH_OF_BAND = Object.fromEntries([
  ...Object.entries(BAND).map(([match, band]) => [band, match]),
  [PARTIAL_FUZZY_BAND, "fuzzy"],
]) as Record<number, Exclude<SearchMatch, "recent">>;

export function createSearchIndex(entries: ReadonlyArray<SearchEntry>): SearchIndex {
  const indexed: Indexed[] = entries.map((entry, order) => ({
    entry,
    order,
    names: [...new Set([...entry.names, ...(entry.aliases ?? [])])].map((raw) => {
      const norm = squash(raw);
      return { raw, norm, words: wordsOf(norm) };
    }),
    text: entry.text ?? [],
  }));
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));

  return {
    entries,
    query(query, options = {}) {
      const limit = options.limit ?? 30;
      const kinds = options.kinds ? new Set(options.kinds) : null;
      const allowed = (entry: SearchEntry) => !kinds || kinds.has(entry.kind);
      const squashed = squash(query);
      if (!squashed) {
        return (options.recents ?? [])
          .flatMap((id) => {
            const entry = byId.get(id);
            return entry && allowed(entry)
              ? [{ entry, match: "recent" as const, matched: "" }]
              : [];
          })
          .slice(0, limit);
      }
      const tokens = squashed.split(" ");
      const scored: Scored[] = [];
      for (const item of indexed) {
        if (!allowed(item.entry)) continue;
        const hit = score(item, query, squashed, tokens);
        if (hit) scored.push(hit);
      }
      scored.sort(compare);
      const better = scored.filter((hit) => hit.band < BAND.infix);
      const kept = better.length > 0 ? better : scored;
      let texts = 0;
      return kept
        .filter((hit) => hit.band !== BAND.text || ++texts <= TEXT_HIT_CAP)
        .slice(0, limit)
        .map((hit) => ({
          entry: hit.item.entry,
          match: MATCH_OF_BAND[hit.band] ?? "infix",
          matched: hit.matched,
        }));
    },
  };
}
