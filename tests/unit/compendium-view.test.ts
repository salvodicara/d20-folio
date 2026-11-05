import { describe, expect, it } from "vitest";

import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_FEATS } from "@/data/feats";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { spells } from "@/data/spells";
import {
  COMP_CATEGORIES,
  compendiumDetail,
  compendiumFilters,
  compendiumRows,
  filterCompRows,
} from "@/domains/compendium/compendium-view";

const LOCALES = ["en", "it"] as const;

describe("compendium rows", () => {
  it("lists every spell, item and feat once, by name", () => {
    expect(compendiumRows("spell", "en")).toHaveLength(spells.length);
    expect(compendiumRows("item", "en")).toHaveLength(
      SRD_EQUIPMENT.length + SRD_MAGIC_ITEMS.length
    );
    expect(compendiumRows("feat", "en")).toHaveLength(SRD_FEATS.length);
    for (const cat of COMP_CATEGORIES) {
      const rows = compendiumRows(cat, "it");
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
      const names = rows.map((r) => r.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it("names every entry and gives it a facts line in both languages", () => {
    for (const locale of LOCALES)
      for (const cat of COMP_CATEGORIES)
        for (const r of compendiumRows(cat, locale)) {
          expect(r.name, r.id).not.toMatch(/^(spell|equipment|magic-item|feat)\./);
          expect(r.facts.length, r.id).toBeGreaterThan(0);
          expect(r.facts.join(""), r.id).not.toMatch(/\{\{|undefined/);
        }
  });

  it("reads a spell as the prototype row: level, school, concentration; time and range aside", () => {
    const bless = compendiumRows("spell", "it").find((r) => r.id === "bless");
    expect(bless?.facts).toEqual(["Livello 1", "Ammaliamento", "concentrazione"]);
    expect(bless?.aside).toEqual(["Azione", "9 m"]);
  });
});

describe("compendium filters", () => {
  const rows = compendiumRows("spell", "en");

  it("ticks inside a group widen, groups narrow", () => {
    const cantrips = filterCompRows(rows, "", { level: ["0"] });
    const oneOrCantrip = filterCompRows(rows, "", { level: ["0", "1"] });
    expect(oneOrCantrip.length).toBeGreaterThan(cantrips.length);
    const cleric = filterCompRows(rows, "", { level: ["0", "1"], class: ["cleric"] });
    expect(cleric.length).toBeLessThan(oneOrCantrip.length);
    expect(cleric.map((r) => r.id)).toContain("bless");
    for (const r of cleric) {
      const s = spells.find((x) => x.id === r.id);
      expect(s?.classes).toContain("cleric");
      expect([0, 1]).toContain(s?.level);
    }
  });

  it("offers Ritual, Concentration and Bonus Action, each keeping only its spells", () => {
    const other = compendiumFilters("spell", rows, "en").find((g) => g.id === "other");
    expect(other?.options.map((o) => o.id)).toEqual(["ritual", "concentration", "bonus"]);
    const bonus = filterCompRows(rows, "", { other: ["bonus"] }).map((r) => r.id);
    expect(bonus).toContain("healing-word");
    expect(bonus).not.toContain("cure-wounds");
  });

  it("an empty group ticks nothing out", () => {
    expect(filterCompRows(rows, "", { level: [] })).toHaveLength(rows.length);
  });

  it("offers only the options some entry carries", () => {
    for (const cat of COMP_CATEGORIES) {
      const all = compendiumRows(cat, "en");
      for (const g of compendiumFilters(cat, all, "en"))
        for (const o of g.options)
          expect(
            filterCompRows(all, "", { [g.id]: [o.id] }).length,
            `${g.id}:${o.id}`
          ).toBeGreaterThan(0);
    }
  });

  it("finds an item by its name first, then by its text", () => {
    const items = compendiumRows("item", "en");
    const hits = filterCompRows(items, "longsword", {});
    expect(hits[0]?.id).toBe("e:longsword");
  });
});

describe("compendium detail", () => {
  it("opens every entry of every category, in both languages", () => {
    for (const locale of LOCALES)
      for (const cat of COMP_CATEGORIES)
        for (const r of compendiumRows(cat, locale)) {
          const d = compendiumDetail(cat, r.id, locale);
          expect(d?.name, r.id).toBe(r.name);
          for (const kv of d?.kv ?? [])
            expect(kv.value, `${r.id} ${kv.label}`).not.toBe("");
        }
  });

  it("reads a spell's casting facts and what it does", () => {
    const d = compendiumDetail("spell", "fireball", "it");
    expect(d?.kv.map((k) => k.label)).toEqual([
      "Tempo di lancio",
      "Gittata",
      "Componenti",
      "Durata",
    ]);
    expect(d?.kv[2]?.value).toBe("V, S, M");
    expect(d?.effect).toBe("8d6\u00a0Fuoco");
    expect(d?.more.map((m) => m.label)).toContain("A Livelli Superiori");
  });

  it("knows nothing of an id outside the category", () => {
    expect(compendiumDetail("item", "fireball", "en")).toBeNull();
    expect(compendiumDetail("spell", "e:longsword", "en")).toBeNull();
  });
});
