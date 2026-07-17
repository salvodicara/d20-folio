/**
 * Tracker-unit render-boundary localization (golden rule 7).
 *
 * The engine + SRD data speak ONLY the stable `TrackerUnit` TOKEN ("hp",
 * "points", …); the localized display string ("HP"/"PF", "pts"/"punti", …) is
 * resolved ONLY at the render boundary by `localizeTrackerUnit` from
 * `src/i18n/**`. This guard pins that EVERY token resolves in BOTH locales and
 * that the IT differs from EN (i.e. the leak is actually fixed — an IT player
 * sees "PF", never "HP"). The string-literal union makes a raw display string a
 * COMPILE error; this test pins the runtime resolution.
 *
 * Fast-lane: pure, no DOM. The real i18next `getFixedT(locale)` is loaded by
 * `setup.fast.ts` (EN + IT eagerly), so the resolution is the real one.
 */
import { describe, it, expect } from "vitest";
import i18n from "@/i18n";
import { TRACKER_UNITS, type TrackerUnit } from "@/data/types";
import { localizeTrackerUnit } from "@/lib/views/tracker-view";
import type { Locale } from "@/lib/locale";

const tFor = (locale: Locale) => i18n.getFixedT(locale);

/** The expected display strings per the GR9 cascade (official D&D-2024 IT terms;
 *  "treats" is a homebrew tracker AI-translated to "bocconcini"). */
const EXPECTED: Record<TrackerUnit, { en: string; it: string }> = {
  hp: { en: "HP", it: "PF" },
  points: { en: "pts", it: "punti" },
  use: { en: "use", it: "uso" },
  uses: { en: "uses", it: "usi" },
  dice: { en: "dice", it: "dadi" },
  treats: { en: "treats", it: "bocconcini" },
};

describe("localizeTrackerUnit — render-boundary tracker-unit i18n", () => {
  it("covers every TrackerUnit token (no token missing from the table)", () => {
    expect([...TRACKER_UNITS].sort()).toEqual(
      (Object.keys(EXPECTED) as TrackerUnit[]).sort()
    );
  });

  for (const unit of TRACKER_UNITS) {
    it(`resolves "${unit}" in EN and IT (never the raw token)`, () => {
      const en = localizeTrackerUnit(unit, tFor("en"));
      const it = localizeTrackerUnit(unit, tFor("it"));
      expect(en).toBe(EXPECTED[unit].en);
      expect(it).toBe(EXPECTED[unit].it);
      // A localized value can never be the raw ⟦…⟧ missing-key sentinel.
      expect(en).not.toMatch(/⟦/);
      expect(it).not.toMatch(/⟦/);
    });
  }

  it("the IT differs from EN for the leak-prone tokens", () => {
    // hp/points/use/uses/dice are the tracker units that leaked English before
    // this fix — their IT MUST diverge from EN (the actual leak-eradication).
    for (const unit of ["hp", "points", "use", "uses", "dice"] as const) {
      const en = localizeTrackerUnit(unit, tFor("en"));
      const it = localizeTrackerUnit(unit, tFor("it"));
      expect(it, `IT "${unit}" must differ from EN "${en}"`).not.toBe(en);
    }
  });

  it("hp resolves to the official abbreviations (HP / PF)", () => {
    expect(localizeTrackerUnit("hp", tFor("en"))).toBe("HP");
    expect(localizeTrackerUnit("hp", tFor("it"))).toBe("PF");
  });

  it("an undefined unit resolves to '' so each caller keeps its own default", () => {
    expect(localizeTrackerUnit(undefined, tFor("en"))).toBe("");
    expect(localizeTrackerUnit(undefined, tFor("it"))).toBe("");
  });
});
