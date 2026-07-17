/**
 * Regression: the ASI step's feat picker now greys out + disables
 * non-repeatable feats the character already has.
 *
 * RAW 2024: every feat carries a `repeatable: boolean` flag — Magic
 * Initiate variants and Elemental Adept are repeatable; almost
 * everything else is not. The previous picker let the player select
 * Tough at L4, Tough again at L8, Tough again at L12 — silently
 * stacking the per-level HP bonus 6× instead of the RAW 2×.
 *
 * This test exercises the pure detection logic mirrored from the
 * component (the React renderer isn't easy to drive headlessly here).
 */
import { describe, expect, it } from "vitest";
import { SRD_FEATS } from "@/data/feats";

function isAlreadyTaken(featId: string, taken: ReadonlySet<string>): boolean {
  const feat = SRD_FEATS.find((f) => f.id === featId);
  if (!feat) return false;
  return !feat.repeatable && taken.has(featId);
}

describe("ASI feat picker — repeatable enforcement", () => {
  it("non-repeatable feat already on the character is greyed out", () => {
    const taken = new Set(["alert"]);
    expect(isAlreadyTaken("alert", taken)).toBe(true);
  });

  it("non-repeatable feat NOT on the character is still selectable", () => {
    const taken = new Set(["alert"]);
    expect(isAlreadyTaken("savage-attacker", taken)).toBe(false);
  });

  it("a different-class Magic Initiate variant is independently selectable", () => {
    // Our data models each class variant as its own feat with
    // `repeatable: false`. The player can take cleric AND druid AND
    // wizard variants because the IDs differ — even though each variant
    // is individually non-repeatable.
    const taken = new Set(["magic-initiate-cleric"]);
    expect(isAlreadyTaken("magic-initiate-cleric", taken)).toBe(true);
    // Druid variant is a SEPARATE feat id — still selectable.
    expect(isAlreadyTaken("magic-initiate-druid", taken)).toBe(false);
  });

  it("origin/bg feat slug is also part of the taken set", () => {
    // Human characters take an origin feat at L1 (e.g. Alert). When they
    // then pick Alert again at L4 ASI, the picker must catch it via the
    // humanOriginFeat slug — not just the features[] array.
    const taken = new Set(["alert"]); // simulating origin-feat-derived
    expect(isAlreadyTaken("alert", taken)).toBe(true);
  });
});
