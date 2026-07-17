/**
 * Compendium browse-spec coverage — Maneuvers · Metamagic · Invocations.
 *
 * These three SRD content types (maneuvers, Sorcerer metamagic,
 * Warlock Eldritch Invocations) were missing from the Compendium "encyclopedia"
 * (D22). They are added as BROWSE-ONLY specs (no `onAdd`/`existingIds`) so the
 * page surfaces them and the Features-tab re-pickers can reuse their detail view
 * as a single source of truth.
 *
 * This pins: each spec is registered, reads its full SRD list, exposes a
 * non-empty localized name + bilingual search candidates, and renders a row and
 * a detail with a description — in BOTH locales (no IT leak in the row meta).
 */

import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import { render } from "@testing-library/react";
import {
  maneuverSpec,
  metamagicSpec,
  invocationSpec,
  weaponMasterySpec,
  spellSpec,
  magicItemSpec,
  featureSpec,
  COMPENDIUM_SPECS,
  type AnyCompendiumSpec,
  type PickerCtx,
} from "@/features/compendium/picker";
import { classFeatures } from "@/data/classes";
import { spells } from "@/data/spells";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { parseMagicItemCharges, parseMagicItemAcBonus } from "@/lib/magic-item-utils";
import { SRD_METAMAGIC } from "@/data/metamagic";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterDoc } from "@/types/character";

// A translator stub that returns the key (or its interpolated defaultValue) so we
// can assert the spec *resolves* a label without booting i18next.
const t = ((key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? key) as unknown as PickerCtx["t"];

function ctx(locale: "en" | "it"): PickerCtx {
  return { t, locale, character: null, mode: "browse" };
}

const CASES = [
  // The maneuver spec's DATA legs live in the pack companion (all 20 Battle
  // Master maneuvers are pack content; SRD-only composes an empty list):
  // content-pack/tests/unit/compendium-browse-specs.pack.test.tsx. Its
  // registration + spec-level shape stay pinned here.
  { spec: metamagicSpec as AnyCompendiumSpec, data: SRD_METAMAGIC, id: "metamagic" },
  { spec: invocationSpec as AnyCompendiumSpec, data: SRD_INVOCATIONS, id: "invocation" },
  // Item h — the eight 2024 weapon mastery properties as a browse-only facet.
  {
    spec: weaponMasterySpec as AnyCompendiumSpec,
    data: weaponMasterySpec.data,
    id: "weapon-mastery",
  },
] as const;

describe("Compendium browse specs — maneuvers / metamagic / invocations / weapon mastery", () => {
  it("all four are registered in the compendium type registry", () => {
    const ids = COMPENDIUM_SPECS.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(["maneuver", "metamagic", "invocation", "weapon-mastery"])
    );
  });

  it("the weapon-mastery facet lists all eight 2024 properties", () => {
    expect(weaponMasterySpec.data.length).toBe(8);
    const ids = weaponMasterySpec.data.map((e) => weaponMasterySpec.getId(e)).sort();
    expect(ids).toEqual([
      "cleave",
      "graze",
      "nick",
      "push",
      "sap",
      "slow",
      "topple",
      "vex",
    ]);
  });

  for (const { spec, data, id } of CASES) {
    describe(id, () => {
      it("reads its full SRD list and has a non-empty label", () => {
        expect(spec.data).toBe(data);
        expect(spec.data.length).toBeGreaterThan(0);
        expect(spec.label(t)).toBeTruthy();
      });

      it("is browse-only (no add-mode commit seam)", () => {
        expect(spec.onAdd).toBeUndefined();
        expect(spec.existingIds).toBeUndefined();
      });

      it("renders a localized name, bilingual search, and a detail in both locales", () => {
        const entry = spec.data[0];
        expect(spec.getId(entry)).toBeTruthy();

        for (const locale of ["en", "it"] as const) {
          const c = ctx(locale);
          expect(spec.getName(entry, c)).toBeTruthy();

          const candidates = spec.searchText(entry, c).filter(Boolean);
          // bilingual: EN and IT name are both search candidates.
          expect(candidates.length).toBeGreaterThanOrEqual(2);

          const row = spec.row(entry, c);
          expect(row.name).toBeTruthy();

          const detail = spec.detail(entry, c, { added: false });
          // The description is the PLAIN SRD string — the shared
          // CompendiumDetailBody routes it through the one inline-markdown
          // seam (specs never wrap it themselves; owner round 2026-06-12).
          expect(typeof detail.description).toBe("string");
          expect(detail.description).toBeTruthy();
          expect(isValidElement(detail.eyebrow)).toBe(true);
        }
      });
    });
  }
});

// ── Regression: the feature-detail mechanics grid rendered the RAW recovery
//    token ("long-rest", CSS-capitalized into "Long-Rest") in BOTH locales, plus
//    a hardcoded English "Pool" literal. No i18n lock could fire: the value never
//    passed through `t()` (no missing key, no sentinel) — it was engine DATA
//    printed verbatim. This pins the seam: every tracker field in the grid is a
//    resolved label (the shared `localizeTrackerRecovery` presenter), never a
//    raw data token. ──────────────────────────────────────────────────────────
describe("featureSpec.detail — mechanics grid localizes the tracker tokens", () => {
  function extrasText(feature: (typeof classFeatures)[number], locale: "en" | "it") {
    const detail = featureSpec.detail(feature, ctx(locale), { added: false });
    const { container } = render(<div>{detail.extras}</div>);
    return container.textContent;
  }

  it("never renders the raw recovery token; resolves the recovery label key", () => {
    const withLongRest = classFeatures.find(
      (f) => f.mechanics?.tracker?.recovery === "long-rest"
    );
    expect(withLongRest).toBeDefined();
    if (!withLongRest) return;
    for (const locale of ["en", "it"] as const) {
      const text = extrasText(withLongRest, locale);
      // The stub `t` returns the key — so a correctly-routed label reads as its
      // key, while the pre-fix leak read as the literal "long-rest" token.
      expect(text).not.toMatch(/\blong-rest\b/);
      expect(text).toContain("features.recoverLongRest");
    }
  });

  it("never renders the hardcoded 'Pool' literal for a pool tracker", () => {
    const withPool = classFeatures.find((f) => f.mechanics?.tracker?.isPool);
    expect(withPool).toBeDefined();
    if (!withPool) return;
    const text = extrasText(withPool, "it");
    expect(text).not.toMatch(/\bPool\b/);
    expect(text).toContain("common.yes");
  });
});

// ── Polish batch — single-source facets drop the redundant verdict badge; the
//    weapon-mastery + maneuver subtitles carry the real differentiator ──────────
describe("Compendium row polish (verdict / subtitle differentiators)", () => {
  const en = ctx("en");
  const itLocale = ctx("it");

  it("single-source facets carry NO verdict badge (it only echoes the tab)", () => {
    expect(weaponMasterySpec.verdict).toBeUndefined();
    expect(invocationSpec.verdict).toBeUndefined();
    expect(metamagicSpec.verdict).toBeUndefined();
  });

  it("maneuver KEEPS its action-economy verdict (a real classifier, not the tab)", () => {
    expect(maneuverSpec.verdict).toBeDefined();
  });

  it("weapon-mastery subtitle is the localized effect summary, not 'Weapon Mastery'", () => {
    for (const c of [en, itLocale]) {
      const summaries = weaponMasterySpec.data.map(
        (e) => weaponMasterySpec.row(e, c).meta
      );
      // Every row has a non-empty summary, none is the old redundant rubric key…
      expect(summaries.every((m) => typeof m === "string" && m.length > 0)).toBe(true);
      expect(summaries).not.toContain("weaponMastery.eyebrow");
      // …and they are DISTINCT per mastery (a genuine differentiator, not a constant).
      expect(new Set(summaries).size).toBe(weaponMasterySpec.data.length);
    }
  });

  // The maneuver-subtitle differentiator (save folded in as a second token)
  // needs maneuver DATA — pack content; see the pack companion file.
});

// ── S6 LEG 3 — the familiar-enhancement callout on Investment of the Chain Master ──
describe("invocationSpec.detail — familiar enhancements callout (Chain warlock)", () => {
  const chainMaster = SRD_INVOCATIONS.find(
    (i) => i.id === "investment-of-the-chain-master"
  );
  const someOther = SRD_INVOCATIONS.find(
    (i) => i.id !== "investment-of-the-chain-master"
  );
  if (!chainMaster || !someOther) {
    throw new Error("SRD invocations missing the chain-master fixtures");
  }

  /** A Warlock 5 (Pact of the Chain) who has taken Investment of the Chain Master. */
  function chainWarlock(): CharacterDoc {
    return makeCharacterDoc({
      classes: [
        {
          classId: "warlock",
          subclassId: "fiend",
          level: 5,
          invocationChoices: ["pact-of-the-chain", "investment-of-the-chain-master"],
        },
      ],
      features: [{ srdId: "warlock-pact-magic" }],
      spellcasting: {
        ability: "CHA",
        preparedCaster: false,
      } as CharacterDoc["character"]["spellcasting"],
    });
  }

  // The spec's t returns the key; for content we render via real i18n below.
  const stubT = ((key: string, opts?: { defaultValue?: string }) =>
    opts?.defaultValue ?? key) as unknown as PickerCtx["t"];

  it("renders the merged buffs (fly/swim 40 ft, attack, damage, save DC) for a Chain warlock", () => {
    const ctxChar: PickerCtx = {
      t: stubT,
      locale: "en",
      character: chainWarlock(),
      mode: "add",
    };
    const detail = invocationSpec.detail(chainMaster, ctxChar, { added: false });
    expect(detail.extras).toBeTruthy();
    const { container } = render(<div>{detail.extras}</div>);
    const text = container.textContent;
    // The speed is the locale-aware 40 ft (display-only, formatSpeed/localeDistance).
    expect(text).toContain("40 ft");
    // The owner's spell save DC line shows a real number (Warlock 5, CHA — reuses
    // the spells-view presenter so it can't drift). DC = 8 + PB(3) + CHA mod.
    expect(/\d{2}/.test(text)).toBe(true);
  });

  it("renders NOTHING for the chain-master invocation in browse mode (no character)", () => {
    const ctxBrowse: PickerCtx = {
      t: stubT,
      locale: "en",
      character: null,
      mode: "browse",
    };
    const detail = invocationSpec.detail(chainMaster, ctxBrowse, { added: false });
    expect(detail.extras).toBeUndefined();
  });

  it("renders NOTHING for a DIFFERENT invocation even with a character (id branch)", () => {
    const ctxChar: PickerCtx = {
      t: stubT,
      locale: "en",
      character: chainWarlock(),
      mode: "add",
    };
    const detail = invocationSpec.detail(someOther, ctxChar, { added: false });
    expect(detail.extras).toBeUndefined();
  });

  it("renders NOTHING when the character lacks the invocation (present=false)", () => {
    const plainWarlock = makeCharacterDoc({
      classes: [{ classId: "warlock", subclassId: "fiend", level: 5 }],
    });
    const ctxChar: PickerCtx = {
      t: stubT,
      locale: "en",
      character: plainWarlock,
      mode: "add",
    };
    const detail = invocationSpec.detail(chainMaster, ctxChar, { added: false });
    expect(detail.extras).toBeUndefined();
  });
});

// ── P9 §2.5 discovery facets — the constitutional example questions are one tap ──
describe("spellSpec discovery facets (school · concentration · ritual)", () => {
  const c = ctx("en");
  const all = {};

  it("exposes the level · class · school · cast facet groups", () => {
    expect(spellSpec.filters.map((g) => g.id)).toEqual([
      "level",
      "class",
      "school",
      "cast",
    ]);
  });

  it("the school facet narrows to exactly that school", () => {
    const g = spellSpec.filters.find((f) => f.id === "school");
    expect(g).toBeDefined();
    if (!g) return;
    const kept = spells.filter((s) => g.predicate(s, "necromancy", c, all));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((s) => s.school === "necromancy")).toBe(true);
    // null = All (the reset chip)
    expect(spells.every((s) => g.predicate(s, null, c, all))).toBe(true);
  });

  it("the cast facet answers 'which spells require concentration?' (and ritual)", () => {
    const g = spellSpec.filters.find((f) => f.id === "cast");
    expect(g).toBeDefined();
    if (!g) return;
    const conc = spells.filter((s) =>
      g.predicate(s, { conc: true, ritual: false }, c, all)
    );
    expect(conc.length).toBeGreaterThan(0);
    expect(conc.every((s) => s.concentration)).toBe(true);

    const rituals = spells.filter((s) =>
      g.predicate(s, { conc: false, ritual: true }, c, all)
    );
    expect(rituals.length).toBeGreaterThan(0);
    expect(rituals.every((s) => s.ritual)).toBe(true);

    // Both toggles off = the untouched pool.
    expect(
      spells.every((s) => g.predicate(s, { conc: false, ritual: false }, c, all))
    ).toBe(true);
  });
});

describe("magicItemSpec discovery facets + typed-document meta", () => {
  const c = ctx("en");
  const all = {};
  const attuneGroup = magicItemSpec.filters.find((f) => f.id === "attunement");

  it("the attunement facet answers 'which magic items need attunement?' both ways", () => {
    expect(attuneGroup).toBeDefined();
    if (!attuneGroup) return;
    const required = SRD_MAGIC_ITEMS.filter((i) =>
      attuneGroup.predicate(i, true, c, all)
    );
    expect(required.length).toBeGreaterThan(0);
    expect(required.every((i) => i.attunement)).toBe(true);

    const free = SRD_MAGIC_ITEMS.filter((i) => attuneGroup.predicate(i, false, c, all));
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((i) => !i.attunement)).toBe(true);

    // The two halves partition the catalogue; All keeps everything.
    expect(required.length + free.length).toBe(SRD_MAGIC_ITEMS.length);
    expect(SRD_MAGIC_ITEMS.every((i) => attuneGroup.predicate(i, null, c, all))).toBe(
      true
    );
  });

  it("a charged item's detail pins its parsed charge pool as a meta row", () => {
    const charged = SRD_MAGIC_ITEMS.find((i) => parseMagicItemCharges(i) !== undefined);
    expect(charged).toBeDefined();
    if (!charged) return;
    const detail = magicItemSpec.detail(charged, c, { added: false });
    const row = detail.meta?.find((m) => m.label === "equipment.charges");
    expect(row?.value).toBe(String(parseMagicItemCharges(charged)));
  });

  it("a chargeless, bonus-less item's detail keeps NO meta grid (eyebrow only)", () => {
    const plain = SRD_MAGIC_ITEMS.find(
      (i) =>
        parseMagicItemCharges(i) === undefined && parseMagicItemAcBonus(i) === undefined
    );
    expect(plain).toBeDefined();
    if (!plain) return;
    const detail = magicItemSpec.detail(plain, c, { added: false });
    expect(detail.meta).toBeUndefined();
  });
});
