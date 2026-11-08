/**
 * The classic ⌘K palette now reads the shared search layer (`@/domains/search`). This
 * proves the move changed nothing a reader sees: the palette's own ranking and filters,
 * copied verbatim from before the move as an oracle, give the same results as the
 * shared module, query by query, in both languages.
 */
import { describe, expect, it } from "vitest";

import { searchEntries } from "@/domains/search/global-search";
import {
  destinationEntries,
  loadCompendiumEntries,
} from "@/domains/search/search-sources";
import type { PickerCtx } from "@/features/compendium/picker";
import { COMPENDIUM_SPECS } from "@/features/compendium/picker/specs";
import i18n from "@/i18n";
import { matchesSearch, matchQuality, MATCH_QUALITY_RANK } from "@/lib/search";
import type { Locale } from "@/lib/locale";

const QUERIES = [
  "fire",
  "bolt",
  "axe",
  "sword",
  "cover",
  "heal",
  "cura",
  "palla",
  "fuoco",
  "goblin",
  "drago",
  "dragon",
  "shield",
  "scudo",
  "a",
  "ma",
  "xyzzy",
];

/** The palette's compendium ranking as it was (CommandPalette.tsx before the move). */
function classicCompendium(q: string, locale: Locale): string[] {
  const t = i18n.getFixedT(locale);
  const ctx = { t, locale, character: null, mode: "browse" } as PickerCtx;
  const index = COMPENDIUM_SPECS.flatMap((spec) =>
    spec.data.map((entry) => ({
      key: `${spec.id}:${spec.getId(entry)}`,
      name: spec.getName(entry, ctx),
      cands: spec.searchText(entry, ctx),
    }))
  );
  const bands: (typeof index)[] = [[], [], [], []];
  const infix: typeof index = [];
  for (const e of index) {
    const name = matchQuality(q, e.name);
    if (name === "prefix") bands[0]?.push(e);
    else if (name === "word") bands[1]?.push(e);
    else if (name === "suffix") bands[2]?.push(e);
    else if (
      bands[3] != null &&
      bands[3].length < 3 &&
      MATCH_QUALITY_RANK[matchQuality(q, ...e.cands)] >= MATCH_QUALITY_RANK.word
    )
      bands[3].push(e);
    else if (name === "infix") infix.push(e);
  }
  const ranked = bands.flat();
  return (ranked.length > 0 ? ranked : infix).slice(0, 8).map((e) => e.key);
}

/** The palette's sections filter as it was. */
function classicSections(q: string, locale: Locale, isAdmin: boolean): string[] {
  const t = i18n.getFixedT(locale);
  const base = [
    { to: "/characters", label: t("nav.characters"), labelEn: "Characters" },
    { to: "/campaigns", label: t("nav.campaigns"), labelEn: "Campaigns" },
    { to: "/compendium", label: t("nav.compendium"), labelEn: "Compendium" },
    { to: "/settings", label: t("nav.settings"), labelEn: "Settings" },
    { to: "/legal", label: t("legal.title"), labelEn: "Legal & Attribution" },
    ...(isAdmin ? [{ to: "/admin", label: t("nav.admin"), labelEn: "Admin" }] : []),
  ];
  return base
    .filter((s) => matchesSearch(q, s.label, s.labelEn))
    .map((s) => `sec:${s.to}`);
}

describe.each(["en", "it"] as const)(
  "the palette on the shared search (%s)",
  (locale) => {
    const t = i18n.getFixedT(locale);

    it("ranks the compendium exactly as before", async () => {
      const entries = await loadCompendiumEntries(t, locale);
      for (const q of QUERIES) {
        const shared = searchEntries(entries, q, { limit: 8 }).map((e) =>
          e.id.slice("cmp:".length)
        );
        expect(shared, q).toEqual(classicCompendium(q, locale));
      }
    });

    it("finds the same screens as before", () => {
      for (const isAdmin of [false, true]) {
        for (const q of [
          "char",
          "perso",
          "camp",
          "comp",
          "set",
          "imposta",
          "legal",
          "note",
          "admin",
          "a",
        ]) {
          const shared = destinationEntries(t, { isAdmin })
            .filter((e) => matchesSearch(q, ...e.names))
            .map((e) => e.id);
          expect(shared, `${q} admin=${isAdmin}`).toEqual(
            classicSections(q, locale, isAdmin)
          );
        }
      }
    });
  }
);
