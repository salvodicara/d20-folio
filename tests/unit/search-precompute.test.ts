/**
 * Search-corpus precompute (PERF) — caching the normalized candidate corpus and the
 * per-monster prose haystack must be TRANSPARENT: identical match/rank results to the
 * un-cached path, in BOTH locales, and stable across repeated calls (the cache never
 * returns a stale or partial answer). A pure-correctness guard for the two caches.
 */
import { describe, it, expect, afterEach } from "vitest";
import { ensureSrdKind } from "@/i18n";
import i18n from "@/i18n";
import { matchesSearch, matchQuality } from "@/lib/search";
// Import the monster spec from its own module (the eager picker index deliberately
// omits it to keep the bestiary corpus lazy — eager-partition.guard).
import { monsterSpec } from "@/features/compendium/picker/specs/monster";
import type { PickerCtx } from "@/features/compendium/picker";
import { MONSTERS } from "@/data/monsters";

await ensureSrdKind("monster");

afterEach(async () => {
  await i18n.changeLanguage("en");
});

const ctx = (locale: "en" | "it"): PickerCtx => ({
  t: i18n.getFixedT(locale),
  locale,
  character: null,
  mode: "browse",
});

describe("normalizeCorpus cache — identical, stable matchesSearch results", () => {
  // Bilingual candidate corpora (IT name · EN name · prose), the real shape the picker
  // joins. Repeating each query proves a cache hit returns the same answer as a miss.
  const CASES: Array<[query: string, cands: string[], expected: boolean]> = [
    ["dash", ["Scatto", "Dash", "restores movement"], true],
    ["furtivita", ["Vantaggio Furtività"], true],
    ["pozione guarigione", ["Pozione di Guarigione", "Potion of Healing"], true],
    ["missing", ["Pozione di Guarigione", "Potion of Healing"], false],
    ["", ["anything"], true],
  ];
  it.each(CASES)("%j → %s (stable across repeat calls)", (q, cands, expected) => {
    expect(matchesSearch(q, ...cands)).toBe(expected);
    // Second call hits the corpus-normalization cache — must be identical.
    expect(matchesSearch(q, ...cands)).toBe(expected);
    // And matchQuality agrees on WHETHER it matched (one filter, one ranker).
    expect(matchQuality(q, ...cands) !== "none").toBe(expected);
  });
});

describe("monsterProse cache — precomputed searchText equals a fresh compute", () => {
  // Take a handful of monsters and assert the (cached) searchText corpus is byte-stable
  // across repeated calls, in EN and IT — i.e. the cache never changes the haystack.
  const SAMPLE = MONSTERS.slice(0, 12);

  it.each(["en", "it"] as const)("searchText is stable + non-empty (%s)", (locale) => {
    const c = ctx(locale);
    for (const m of SAMPLE) {
      const first = monsterSpec.searchText(m, c).join("␟");
      const second = monsterSpec.searchText(m, c).join("␟");
      expect(second).toBe(first); // cache-hit path equals the first compute
      // The corpus always carries at least the name candidates.
      expect(monsterSpec.searchText(m, c).some((s) => !!s && s.length > 0)).toBe(true);
    }
  });

  it("a body-text term still matches through the cached corpus (find-by-what-it-does)", () => {
    // Any monster whose EN prose mentions a common keyword must be findable by it —
    // proving the cached prose is the REAL prose, not an empty placeholder.
    const c = ctx("en");
    const withHit = MONSTERS.find((m) =>
      monsterSpec.searchText(m, c).some((s) => !!s && /\bhit points?\b/i.test(s))
    );
    expect(withHit).toBeDefined();
    if (withHit) {
      expect(matchesSearch("hit points", ...monsterSpec.searchText(withHit, c))).toBe(
        true
      );
    }
  });
});
