/**
 * R6+R3 SLICE 7b guard — `raceTraitCatKey` (the id-derived i18n-catalogue key for a
 * race trait) MUST resolve to a real catalogue entry for EVERY trait, in BOTH
 * locales, with NO `name.en` read. This is what lets the Features tab localize a
 * race trait via `localizeSrd("race", raceTraitCatKey(entry), …)` instead of the
 * soon-to-be-stripped `trait.name.en`/`description[locale]` BiText.
 */
import { describe, it, expect } from "vitest";
import { raceFeatureEntries, raceTraitCatKey } from "@/data/races";
import { hasSrd, localizeSrd } from "@/i18n/resolver";

describe("raceTraitCatKey resolves every trait in the SRD catalogue", () => {
  it("every race trait has a name + description in EN and IT via its derived key", () => {
    const misses: string[] = [];
    for (const entry of raceFeatureEntries) {
      const key = raceTraitCatKey(entry);
      for (const locale of ["en", "it"] as const) {
        for (const field of ["name", "description"] as const) {
          if (!hasSrd("race", key, field, locale)) {
            misses.push(`${entry.id} -> race:${key}.${field}#${locale}`);
          }
        }
      }
    }
    expect(misses).toEqual([]);
  });

  it("the derived key recovers the trait's localized name (no throw)", () => {
    const orc = raceFeatureEntries.find((e) => e.id === "orc-adrenaline-rush");
    expect(orc).toBeDefined();
    if (!orc) return;
    const key = raceTraitCatKey(orc);
    expect(localizeSrd("race", key, "name", "en")).toBeTruthy();
    expect(localizeSrd("race", key, "name", "it")).toBeTruthy();
  });
});
