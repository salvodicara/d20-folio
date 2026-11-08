/**
 * The global ⌘K search's ranker: one pure function over entries from every source
 * (`search-sources.ts`: the user's characters and campaigns, the compendium, the rules
 * glossary, the app's screens). Each entry is already labelled in the reader's
 * language; its other names (the other language's) are matched too.
 *
 * The ranking is the classic palette's, now shared: bands, each kept in source order so
 * the result is deterministic —
 *   1. a name prefix   ("fire"  → Fire Bolt)
 *   2. a name word     ("bolt"  → Fire Bolt)
 *   3. a name suffix   ("axe"   → Handaxe)
 *   4. the entry's text, whole words only, capped (a hint, never the answer)
 * and an infix ("cover" inside Recovery) only when nothing better matched at all.
 * Matching is accent- and case-insensitive (`@/lib/search`). An empty query shows the
 * recents, newest first.
 */
import type { CompendiumArt } from "@/domains/compendium/compendium-art";
import { matchQuality, MATCH_QUALITY_RANK, type MatchQuality } from "@/lib/search";

export type SearchKind = "destination" | "character" | "campaign" | "rule" | "compendium";

/** What choosing a result does. */
export type SearchAction =
  /** Open this route. */
  | { kind: "navigate"; route: string }
  /** Show the entry's gist in place (a condition, a skill: no page of their own). */
  | { kind: "explain" }
  /** Open the open sheet's rules reference (the cockpit's Play tab). */
  | { kind: "play-reference"; section: "rules" | "playbook" };

export interface SearchEntry {
  kind: SearchKind;
  /** Stable key, also the recents key (`char:<id>`, `cmp:<type>:<id>`, `sec:<route>`). */
  id: string;
  /** The name in the reader's language (rendered through i18n, never stored text). */
  label: string;
  /** A short context line: the compendium type, a character's class and level. */
  sub?: string;
  /** The «In breve» one-liner, when the catalogue has one. */
  gist?: string | null;
  /** The painted icon to show (`<Art>` / `<SpellArt>`), when the entry has one. */
  art?: CompendiumArt | null;
  action: SearchAction;
  /** Every name the entry answers to: the label first, then the other language's. */
  names: ReadonlyArray<string>;
  /** The entry's text, matched as a capped hint band (whole words only). */
  text?: ReadonlyArray<string | null | undefined>;
}

/** How many results the entries' text alone may earn (no match in any name). */
export const TEXT_HIT_CAP = 3;

/** The best tier any single name reaches (a name can only be a prefix on its own). */
function nameQuality(query: string, names: ReadonlyArray<string>): MatchQuality {
  let best: MatchQuality = "none";
  for (const name of names) {
    const quality = matchQuality(query, name);
    if (MATCH_QUALITY_RANK[quality] > MATCH_QUALITY_RANK[best]) best = quality;
  }
  return best;
}

/**
 * The entries a query finds, ranked; with an empty query, the `recents` (entry ids,
 * newest first) that still exist. `limit` caps the whole list.
 */
export function searchEntries(
  entries: ReadonlyArray<SearchEntry>,
  query: string,
  opts: { recents?: ReadonlyArray<string>; limit?: number } = {}
): SearchEntry[] {
  const q = query.trim();
  const limit = opts.limit ?? 30;
  if (!q) {
    const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
    return (opts.recents ?? [])
      .flatMap((id) => {
        const entry = byId.get(id);
        return entry ? [entry] : [];
      })
      .slice(0, limit);
  }
  const bands: SearchEntry[][] = [[], [], [], []];
  const infix: SearchEntry[] = [];
  for (const entry of entries) {
    const quality = nameQuality(q, entry.names);
    if (quality === "prefix") bands[0]?.push(entry);
    else if (quality === "word") bands[1]?.push(entry);
    else if (quality === "suffix") bands[2]?.push(entry);
    else if (
      entry.text &&
      (bands[3]?.length ?? 0) < TEXT_HIT_CAP &&
      MATCH_QUALITY_RANK[matchQuality(q, ...entry.text)] >= MATCH_QUALITY_RANK.word
    )
      bands[3]?.push(entry);
    else if (quality === "infix") infix.push(entry);
  }
  const ranked = bands.flat();
  return (ranked.length > 0 ? ranked : infix).slice(0, limit);
}
