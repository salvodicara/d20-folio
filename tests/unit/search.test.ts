import { describe, it, expect } from "vitest";
import {
  matchesSearch,
  normalizeSearch,
  proseCorpus,
  rankedSearch,
  DESC_QUERY_MIN,
} from "@/lib/search";

describe("normalizeSearch", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeSearch("Furtività")).toBe("furtivita");
    expect(normalizeSearch("Récupéra")).toBe("recupera");
  });
});

describe("matchesSearch", () => {
  it("empty query matches everything", () => {
    expect(matchesSearch("", "anything")).toBe(true);
    expect(matchesSearch("   ", "anything")).toBe(true);
  });

  it("is case-insensitive and substring-based", () => {
    expect(matchesSearch("ARC", "Arcana")).toBe(true);
    expect(matchesSearch("can", "Arcana")).toBe(true);
    expect(matchesSearch("xyz", "Arcana")).toBe(false);
  });

  it("matches across multiple candidates (bilingual names)", () => {
    // IT player typing the English term still finds the IT entry, and vice versa.
    expect(matchesSearch("dash", "Scatto", "Dash")).toBe(true);
    expect(matchesSearch("scat", "Scatto", "Dash")).toBe(true);
  });

  it("is accent-insensitive on both query and candidate", () => {
    expect(matchesSearch("furtivita", "Furtività")).toBe(true);
    expect(matchesSearch("Furtività", "furtivita")).toBe(true);
  });

  it("skips null/undefined candidates safely", () => {
    expect(matchesSearch("dash", undefined, null, "Dash")).toBe(true);
    expect(matchesSearch("dash", undefined, null)).toBe(false);
  });
});

describe("matchesSearch — tokenized (order-independent, interstitial-word tolerant)", () => {
  // Each candidate corpus mirrors a real bilingual entry: [IT name, EN name, description?].
  const POTION = ["Pozione di Guarigione", "Potion of Healing", "restores hit points"];

  const CASES: Array<{
    query: string;
    candidates: Array<string | undefined | null>;
    expected: boolean;
    why: string;
  }> = [
    // Headline IT case: the interstitial "di" no longer breaks the contiguous substring.
    {
      query: "pozione guarigione",
      candidates: POTION,
      expected: true,
      why: "IT tokens skip the interstitial 'di'",
    },
    {
      query: "guarigione pozione",
      candidates: POTION,
      expected: true,
      why: "token order is irrelevant",
    },
    {
      query: "guar poz",
      candidates: POTION,
      expected: true,
      why: "partial tokens still match (prefix of each word)",
    },
    // Accents: a diacritic in the query normalizes the same as one in the candidate.
    {
      query: "furtività vantaggio",
      candidates: ["Vantaggio Furtività"],
      expected: true,
      why: "accents preserved on both sides",
    },
    // Tokens spread across name + EN name + description (candidates are joined into one haystack).
    {
      query: "pozione healing restores",
      candidates: POTION,
      expected: true,
      why: "one token per candidate field, all present",
    },
    {
      query: "pozione healing missing",
      candidates: POTION,
      expected: false,
      why: "a token absent everywhere fails the AND",
    },
    { query: "", candidates: POTION, expected: true, why: "empty query matches all" },
    {
      query: "   ",
      candidates: POTION,
      expected: true,
      why: "whitespace-only query matches all",
    },
    // EN parity of the headline case.
    {
      query: "healing potion",
      candidates: POTION,
      expected: true,
      why: "EN tokens skip the interstitial 'of'",
    },
  ];
  it.each(CASES)("$query → $expected ($why)", ({ query, candidates, expected }) => {
    expect(matchesSearch(query, ...candidates)).toBe(expected);
  });
});

describe("proseCorpus", () => {
  it("joins parts and flattens markdown emphasis into spaces (a phrase never breaks on a ** boundary)", () => {
    expect(proseCorpus("**Heavy Armor.** While wearing", "Mentre indossi")).toBe(
      " Heavy Armor.  While wearing Mentre indossi"
    );
  });

  it("skips empty/undefined parts (optional EN twin)", () => {
    expect(proseCorpus("solo", undefined, "")).toBe("solo");
  });
});

describe("rankedSearch — the two-tier wizard-picker filter (owner fb4)", () => {
  interface Opt {
    id: string;
    name: string;
    desc?: string;
  }
  const POOL: Opt[] = [
    { id: "a", name: "Aura Shield", desc: "wards allies" },
    { id: "b", name: "Blade Ward", desc: "you gain an aura of resistance" },
    { id: "c", name: "Counterspell", desc: "interrupt a caster" },
    { id: "d", name: "Dawn", desc: "an aura of searing light" },
  ];
  const nameOf = (o: Opt) => o.name;
  const descOf = (o: Opt) => o.desc;

  const ids = (q: string) => rankedSearch(q, POOL, nameOf, descOf).map((o) => o.id);

  // Table-driven: query → expected ranked ids.
  const CASES: Array<[query: string, expected: string[], why: string]> = [
    ["", ["a", "b", "c", "d"], "empty query returns the pool untouched"],
    ["aura", ["a", "b", "d"], "name hit FIRST, then description hits in pool order"],
    ["ward", ["b", "a"], "name hit (Blade Ward) outranks the description hit (wards)"],
    ["au", ["a"], "a 2-char query never reaches tier 2 (noise control)"],
    ["counters", ["c"], "plain tier-1 behaviour unchanged"],
    ["searing", ["d"], "description-only hits still surface on their own"],
    ["zzz", [], "no hit in either tier"],
  ];
  it.each(CASES)("%j → %j (%s)", (q, expected) => {
    expect(ids(q)).toEqual(expected);
  });

  it("is bilingual + accent-insensitive in BOTH tiers (an IT query hits an EN description)", () => {
    const pool: Opt[] = [
      { id: "x", name: "Alert Allerta", desc: "You add your proficiency to initiative" },
      { id: "y", name: "Furtività", desc: "vantaggio su iniziativa già pronta" },
    ];
    // Accent-insensitive tier-1 + tier-2 ordering: name hit (y) above desc hit.
    expect(rankedSearch("furtivita", pool, nameOf, descOf).map((o) => o.id)).toEqual([
      "y",
    ]);
    expect(rankedSearch("iniziativa", pool, nameOf, descOf).map((o) => o.id)).toEqual([
      "y",
    ]);
    expect(rankedSearch("initiative", pool, nameOf, descOf).map((o) => o.id)).toEqual([
      "x",
    ]);
  });

  it("a multi-word query ranks a NAME hit above a DESCRIPTION-only hit (tokenized)", () => {
    const pool: Opt[] = [
      // both tokens land in the NAME (interstitial "di" ignored) → tier 1
      { id: "p", name: "Pozione di Guarigione", desc: "recuperi punti ferita" },
      // both tokens land only in the DESCRIPTION → tier 2, appended after every name hit
      { id: "q", name: "Antidoto", desc: "una pozione per la guarigione" },
    ];
    expect(
      rankedSearch("pozione guarigione", pool, nameOf, descOf).map((o) => o.id)
    ).toEqual(["p", "q"]);
  });

  it("without a desc accessor it is exactly the tier-1 filter", () => {
    expect(rankedSearch("aura", POOL, nameOf).map((o) => o.id)).toEqual(["a"]);
  });

  it("DESC_QUERY_MIN is the documented 3-char gate", () => {
    expect(DESC_QUERY_MIN).toBe(3);
  });
});
