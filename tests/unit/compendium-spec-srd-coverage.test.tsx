/**
 * SLICE 7 (part 2) — compendium-spec SRD-resolver coverage.
 *
 * Every compendium picker spec now reads its display strings through the THROWING
 * SRD resolver (`localizeSrd`), not inline `entity.name[locale]` BiText. This test
 * drives EVERY spec over its FULL data list in BOTH locales — calling `getName`,
 * `searchText`, `row` and `detail` — and asserts none throws. Because `localizeSrd`
 * throws (in dev/test) on a missing `kind`/`key`/`field`, a passing run is a HARD
 * PROOF that the catalogue covers every entity the compendium can show, in EN and
 * IT, with the exact stable keys the specs compute (`srdKey`). It fails-before /
 * passes-after the catalogue is complete, so a future data add that forgets a
 * string (or a key-scheme drift) regresses loudly here instead of white-screening
 * a live user.
 *
 * Render output (`row`/`detail`) may embed React elements; we exercise the builder
 * (which is where the resolver fires) and only require it returns an object.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
// COMPENDIUM_SPECS lives on the specs barrel (D-2): the picker index re-exports the
// concrete specs from their own modules, not the side-effectful barrel.
import { COMPENDIUM_SPECS } from "@/features/compendium/picker/specs";
import { type PickerCtx } from "@/features/compendium/picker";
import { matchesSearch } from "@/lib/search";
import * as srdEn from "@/i18n/srd-en";

// A translator stub that echoes the key (or its defaultValue) so a spec resolves a
// label without booting i18next — we only care that the SRD resolver doesn't throw.
const t = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as unknown as PickerCtx["t"];

function ctx(locale: "en" | "it"): PickerCtx {
  return { t, locale, character: null, mode: "browse" };
}

const LOCALES = ["en", "it"] as const;

describe("compendium specs resolve every SRD string in both locales (no resolver throw)", () => {
  for (const spec of COMPENDIUM_SPECS) {
    describe(spec.id, () => {
      it(`getName + searchText resolve for all ${spec.data.length} entries (en + it)`, () => {
        for (const locale of LOCALES) {
          const c = ctx(locale);
          for (const entry of spec.data) {
            // getName — the localized leaf the list + detail header read.
            const name = spec.getName(entry, c);
            expect(
              name,
              `${spec.id} getName(${spec.getId(entry)}, ${locale})`
            ).toBeTruthy();
            // searchText — exercises the EN/IT name lookups used for filtering.
            expect(() => spec.searchText(entry, c)).not.toThrow();
          }
        }
      });

      it(`row + detail render-models build for all entries (en + it)`, () => {
        for (const locale of LOCALES) {
          const c = ctx(locale);
          for (const entry of spec.data) {
            const id = spec.getId(entry);
            // The row builder fires the resolver for the row name/meta.
            expect(
              () => spec.row(entry, c),
              `${spec.id} row(${id}, ${locale})`
            ).not.toThrow();
            // The detail builder fires it for description + every meta field +
            // nested-action keys (the deepest catalogue paths).
            expect(
              () => spec.detail(entry, c, { added: false }),
              `${spec.id} detail(${id}, ${locale})`
            ).not.toThrow();
          }
        }
      });
    });
  }
});

/**
 * REGRESSION (SLICE 8 lazy-per-locale i18n): a spec's `searchText` must resolve SRD
 * strings ONLY through (a) its ACTIVE locale and (b) the always-loaded EN facts —
 * NEVER a hardcoded non-active locale. Before this fix, five specs (feature, feat,
 * maneuver, metamagic, invocation) hardcoded both `"en"` and `"it"` for bilingual
 * search; with the async bootstrap an EN user opens ⌘K before the IT shard loads, so
 * `localizeSrd(…, "it")` hit the resolver's missing-string path and THREW — crashing
 * `PaletteBody` into the error boundary (10 e2e failures). This pins the contract by
 * SIMULATING the EN-only-loaded runtime: with the IT catalogue unregistered, every
 * spec's `searchText` (the palette's compendium index seam) must still not throw.
 */
describe("searchText resolves with only the active locale + EN loaded (SLICE 8)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("no spec searchText throws when the non-active (it) catalogue is not loaded", () => {
    // The faithful EN-user runtime: IT is NOT yet in the registry. (The test setup
    // eagerly loads IT for the locale sweep; hide it here so a spec that reaches for
    // the non-active shard fails LOUDLY instead of being masked by the eager load.)
    const real = srdEn.srdCatalogues;
    vi.spyOn(srdEn, "srdCatalogues").mockImplementation((locale) =>
      locale === "it" ? undefined : real(locale)
    );

    const c = ctx("en");
    for (const spec of COMPENDIUM_SPECS) {
      for (const entry of spec.data) {
        expect(
          () => spec.searchText(entry, c),
          `${spec.id} searchText(${spec.getId(entry)}) must not read the unloaded it shard`
        ).not.toThrow();
      }
    }
  });
});

/**
 * Item f — content search corpus: a spec's `searchText` now includes the entity's
 * DESCRIPTION text (active locale + always-loaded EN), so a player finds an entity
 * by what it DOES, not only its name. This pins that (a) the corpus genuinely
 * carries description prose and (b) a description-ONLY term matches via the shared
 * bilingual `matchesSearch` — failing-before / passing-after the corpus extension.
 */
describe("content search includes description text (item f)", () => {
  const spellSpec = COMPENDIUM_SPECS.find((s) => s.id === "spell");

  it("the spell corpus carries description prose (a known description-only term matches)", () => {
    expect(spellSpec).toBeDefined();
    if (!spellSpec) return;
    const fear = spellSpec.data.find((s) => spellSpec.getId(s) === "fear");
    expect(fear, "the Fear spell is in the SRD data").toBeDefined();
    if (!fear) return;
    const corpus = spellSpec.searchText(fear, ctx("en"));
    // "Frightened" lives in Fear's DESCRIPTION, not its name — proof the corpus grew.
    expect(
      matchesSearch("frightened", ...corpus),
      "Fear is found by its description term 'frightened'"
    ).toBe(true);
    // It still matches by name, of course.
    expect(matchesSearch("fear", ...corpus)).toBe(true);
  });

  it("every spec resolves the description corpus in BOTH locales without throwing", () => {
    for (const locale of LOCALES) {
      const c = ctx(locale);
      for (const spec of COMPENDIUM_SPECS) {
        for (const entry of spec.data) {
          // searchText now includes descriptionSearch(); a missing-description entry
          // must be skipped by the hasSrd guard, never throw, in either locale.
          expect(
            () => spec.searchText(entry, c),
            `${spec.id} searchText(${spec.getId(entry)}, ${locale}) with description corpus`
          ).not.toThrow();
        }
      }
    }
  });
});
