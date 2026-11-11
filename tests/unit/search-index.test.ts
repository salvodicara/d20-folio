/**
 * The new UI's ⌘K search index: built once over every source, then queried per
 * keystroke. Each name counts in both languages, a typo still finds the entry, the
 * user's own characters and campaigns lead their band, and every hit says how it
 * matched, so the palette can explain it. The classic palette keeps its own ranker
 * (`global-search.ts`, pinned by `palette-search-parity.test.ts`).
 */
import { packSpells } from "@pack";
import { beforeAll, describe, expect, it } from "vitest";

import type { SearchEntry } from "@/domains/search/global-search";
import { createSearchIndex, type SearchIndex } from "@/domains/search/search-index";
import {
  campaignEntries,
  characterEntries,
  destinationEntries,
  loadCompendiumEntries,
  originEntries,
  ruleEntries,
} from "@/domains/search/search-sources";
import i18n from "@/i18n";
import type { Locale } from "@/lib/locale";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { makeCharacterDoc } from "./_helpers";

const lyra = {
  ...makeCharacterDoc({ name: assertNonEmptyString("Lyra Voss"), classId: "wizard" }),
  id: "c-lyra",
};

async function everything(locale: Locale): Promise<SearchEntry[]> {
  const t = i18n.getFixedT(locale);
  return [
    ...characterEntries([lyra], locale),
    ...campaignEntries([{ id: "camp1", name: "Fireside Tales" }]),
    ...destinationEntries(t, { isAdmin: false }),
    ...ruleEntries(t, locale),
    ...originEntries(locale),
    ...(await loadCompendiumEntries(t, locale, { names: "all" })),
  ];
}

let en: SearchIndex;
let it_: SearchIndex;

beforeAll(async () => {
  en = createSearchIndex(await everything("en"));
  it_ = createSearchIndex(await everything("it"));
});

const labels = (index: SearchIndex, query: string, limit = 5) =>
  index.query(query, { limit }).map((hit) => hit.entry.label);

describe("the ⌘K search index", () => {
  it("finds a spell by its name in either language, at the top", () => {
    expect(labels(it_, "fireball")[0]).toBe("Palla di Fuoco");
    expect(labels(en, "palla di fuoco")[0]).toBe("Fireball");
    expect(it_.query("fireball")[0]?.match).toBe("exact");
  });

  it("forgives a typo in a long enough word", () => {
    expect(labels(en, "firebal")[0]).toBe("Fireball");
    expect(labels(it_, "palla di fucoo")[0]).toBe("Palla di Fuoco");
    expect(en.query("fierball")[0]).toMatchObject({
      match: "fuzzy",
      entry: { label: "Fireball" },
    });
  });

  it("never guesses on a short word: 'axe' finds axes, not 'ace'", () => {
    const hits = en.query("axe", { limit: 50 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.match !== "fuzzy")).toBe(true);
  });

  it("puts the exact name first, then the names it opens", () => {
    const hits = en.query("shield", { limit: 10 });
    expect(hits[0]).toMatchObject({ match: "exact", entry: { label: "Shield" } });
    expect(hits.map((hit) => hit.entry.label)).toContain("Shield of Faith");
  });

  it("finds classes, species and backgrounds in both languages", () => {
    // The user's own wizard (Lyra) answers to her class too, and leads; the class next.
    expect(it_.query("wizard", { limit: 2 }).map((hit) => hit.entry.id)).toEqual([
      "char:c-lyra",
      "class:wizard",
    ]);
    expect(it_.query("wizard", { kinds: ["compendium"] })[0]?.entry.label).toBe("Mago");
    expect(en.query("nano")[0]?.entry).toMatchObject({
      id: "species:dwarf",
      label: "Dwarf",
    });
    expect(en.query("acolyte")[0]?.entry.id).toBe("background:acolyte");
  });

  it("lists the user's own character first within its band, with where it goes", () => {
    const [first] = en.query("lyra");
    expect(first?.entry).toMatchObject({
      kind: "character",
      action: { kind: "navigate", route: "/characters/c-lyra" },
    });
    expect(en.query("fire")[0]?.entry.kind).toBe("campaign");
  });

  it("filters by kind and caps the list", () => {
    const hits = en.query("fire", { kinds: ["compendium"], limit: 4 });
    expect(hits).toHaveLength(4);
    expect(hits.every((hit) => hit.entry.kind === "compendium")).toBe(true);
  });

  it("shows the recents for an empty query, newest first, skipping gone ones", () => {
    const hits = en.query("  ", { recents: ["camp:camp1", "char:gone", "char:c-lyra"] });
    expect(hits.map((hit) => hit.entry.id)).toEqual(["camp:camp1", "char:c-lyra"]);
    expect(hits.every((hit) => hit.match === "recent")).toBe(true);
  });

  it("matches an alias the entry declares", () => {
    const index = createSearchIndex([
      {
        kind: "rule",
        id: "rule:ac",
        label: "Armor Class",
        names: ["Armor Class", "Classe Armatura"],
        aliases: ["AC", "CA"],
        action: { kind: "explain" },
      },
    ]);
    expect(index.query("ca")[0]).toMatchObject({ match: "exact", matched: "CA" });
  });

  it("gives an infix only when nothing better matched", () => {
    const index = createSearchIndex([
      {
        kind: "rule",
        id: "a",
        label: "Arcane Recovery",
        names: ["Arcane Recovery"],
        action: { kind: "explain" },
      },
      {
        kind: "rule",
        id: "b",
        label: "Cover",
        names: ["Cover"],
        action: { kind: "explain" },
      },
    ]);
    expect(index.query("cover").map((hit) => hit.entry.id)).toEqual(["b"]);
    expect(index.query("cove").map((hit) => hit.entry.id)).toEqual(["b"]);
    expect(index.query("cover", { kinds: ["rule"] }).map((h) => h.match)).toEqual([
      "exact",
    ]);
  });

  it("indexes exactly the spells the build composes: SRD only when the pack is off", () => {
    const spellIds = en.entries
      .map((entry) => entry.id)
      .filter((id) => id.startsWith("cmp:spell:"));
    expect(spellIds.length).toBeGreaterThan(0);
    const packIds = new Set(packSpells.map((spell) => `cmp:spell:${spell.id}`));
    if (packSpells.length === 0)
      expect(spellIds.some((id) => packIds.has(id))).toBe(false);
    else expect(spellIds.some((id) => packIds.has(id))).toBe(true);
  });
});
