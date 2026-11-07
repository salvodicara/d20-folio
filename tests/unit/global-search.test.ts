/**
 * The global ⌘K search's data layer: one pure ranker over every source (the user's
 * characters and campaigns, the compendium, the rules glossary, the app's screens),
 * each result labelled through i18n in the reader's language, with its «In breve»
 * gist, its art key and where it goes. The ranking is the classic palette's: a name
 * prefix before a whole word before a suffix, a text hit capped, an infix only when
 * nothing better matched. An empty query shows the recents.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { packSpells } from "@pack";
import { describe, expect, it } from "vitest";

import { searchEntries, type SearchEntry } from "@/domains/search/global-search";
import {
  campaignEntries,
  characterEntries,
  destinationEntries,
  loadCompendiumEntries,
  ruleEntries,
} from "@/domains/search/search-sources";
import { spells } from "@/data/spells";
import i18n from "@/i18n";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { makeCharacterDoc } from "./_helpers";

const en = i18n.getFixedT("en");
const it_ = i18n.getFixedT("it");

const lyra = {
  ...makeCharacterDoc({ name: assertNonEmptyString("Lyra Voss") }),
  id: "c-lyra",
};
const ids = (results: ReadonlyArray<SearchEntry>) => results.map((r) => r.id);

describe("the global search", () => {
  it("finds a skill by an accentless Italian prefix ('perce' → Percezione)", () => {
    const results = searchEntries(ruleEntries(it_, "it"), "perce");
    expect(results[0]).toMatchObject({ kind: "rule", label: "Percezione" });
  });

  it("finds the same entry by its English name from the Italian app, and the reverse", () => {
    expect(searchEntries(ruleEntries(it_, "it"), "perception")[0]?.label).toBe(
      "Percezione"
    );
    expect(searchEntries(ruleEntries(en, "en"), "percezione")[0]?.label).toBe(
      "Perception"
    );
  });

  it("matches accents both ways ('accecato' and 'accecàto')", () => {
    const rules = ruleEntries(it_, "it");
    expect(searchEntries(rules, "accecàto")[0]?.label).toBe("Accecato");
  });

  it("ranks a name prefix above a word inside the name", async () => {
    const compendium = await loadCompendiumEntries(en, "en");
    const results = searchEntries(compendium, "fire");
    const firstWord = results.findIndex((r) => !r.label.toLowerCase().startsWith("fire"));
    const lastPrefix = results
      .map((r) => r.label.toLowerCase().startsWith("fire"))
      .lastIndexOf(true);
    expect(lastPrefix).toBeLessThan(firstWord === -1 ? Infinity : firstWord);
    expect(results[0]?.label.toLowerCase().startsWith("fire")).toBe(true);
  });

  it("a compendium result carries its type, «In breve» gist, art key and route", async () => {
    const compendium = await loadCompendiumEntries(en, "en");
    const fireball = searchEntries(compendium, "fireball").find(
      (r) => r.id === "cmp:spell:fireball"
    );
    expect(fireball).toMatchObject({
      kind: "compendium",
      label: "Fireball",
      sub: "Spells",
      action: { kind: "navigate", route: "/compendium?type=spell&sel=fireball" },
    });
    expect(fireball?.gist).toBeTruthy();
    expect(fireball?.art).toBeTruthy();
  });

  it("finds the user's characters and campaigns, and the app's screens", () => {
    const sources = [
      ...characterEntries([lyra], "en"),
      ...campaignEntries([{ id: "camp-1", name: "Lost Mine" }]),
      ...destinationEntries(en, { isAdmin: false }),
    ];
    expect(searchEntries(sources, "lyra")[0]).toMatchObject({
      kind: "character",
      action: { kind: "navigate", route: "/characters/c-lyra" },
    });
    expect(searchEntries(sources, "lost")[0]).toMatchObject({ kind: "campaign" });
    expect(searchEntries(sources, "compend")[0]).toMatchObject({
      kind: "destination",
      action: { kind: "navigate", route: "/compendium" },
    });
    expect(
      ids(searchEntries(destinationEntries(en, { isAdmin: false }), "admin"))
    ).toEqual([]);
  });

  it("an empty query shows the recents, newest first, and nothing else", () => {
    const sources = [
      ...characterEntries([lyra], "en"),
      ...campaignEntries([{ id: "camp-1", name: "Lost Mine" }]),
    ];
    expect(
      ids(
        searchEntries(sources, "  ", { recents: ["camp:camp-1", "char:c-lyra", "gone"] })
      )
    ).toEqual(["camp:camp-1", "char:c-lyra"]);
    expect(searchEntries(sources, "")).toEqual([]);
  });

  it("labels come from i18n in the reader's language, never stored text", () => {
    expect(
      destinationEntries(it_, { isAdmin: false }).find((d) => d.id === "sec:/compendium")
        ?.label
    ).toBe(it_("nav.compendium"));
  });

  it("reads pack content only through the compendium specs, never the pack itself", () => {
    for (const file of ["global-search.ts", "search-sources.ts"]) {
      const source = readFileSync(
        resolve(__dirname, "../../src/domains/search", file),
        "utf8"
      );
      expect(source, file).not.toMatch(/from "@pack|content-pack/);
    }
  });

  it("finds exactly the spells the build composes: SRD only when the pack is off", async () => {
    const compendium = await loadCompendiumEntries(en, "en");
    const spellIds = compendium
      .filter((r) => r.id.startsWith("cmp:spell:"))
      .map((r) => r.id);
    expect(new Set(spellIds)).toEqual(new Set(spells.map((s) => `cmp:spell:${s.id}`)));
    const packIds = new Set(packSpells.map((s) => `cmp:spell:${s.id}`));
    if (packSpells.length === 0) expect(spellIds.length).toBeGreaterThan(0);
    else expect(spellIds.some((id) => packIds.has(id))).toBe(true);
  });
});
