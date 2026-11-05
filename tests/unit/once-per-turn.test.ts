/**
 * One use of a once-per-turn feature offered in two places claims the turn (Hand of
 * Harm: the Unarmed Strike's rider and its card).
 */
import { describe, expect, it } from "vitest";

import {
  featureUsedThisTurn,
  oncePerTurnEntry,
  riderClaimedTurnFor,
  riderFeatureKey,
} from "@/lib/play/once-per-turn";

const FEATURE = "monk-mercy-hand-of-harm";

describe("a once-per-turn feature in two places", () => {
  it("the rider's entry, or the feature's card, claims the turn", () => {
    expect(featureUsedThisTurn([oncePerTurnEntry(FEATURE)], FEATURE)).toBe(true);
    expect(featureUsedThisTurn([`${FEATURE}-free`], FEATURE)).toBe(true);
    expect(featureUsedThisTurn(["base-dash"], FEATURE)).toBe(false);
  });

  it("a card is blocked once its feature's rider claimed the turn", () => {
    expect(riderClaimedTurnFor([oncePerTurnEntry(FEATURE)], `${FEATURE}-free`)).toBe(
      true
    );
    expect(riderClaimedTurnFor([oncePerTurnEntry(FEATURE)], "base-dash")).toBe(false);
  });

  it("names the rider's feature from its source", () => {
    expect(
      riderFeatureKey({ srd: { kind: "class-feature", key: FEATURE, field: "name" } })
    ).toBe(FEATURE);
    expect(riderFeatureKey({ custom: "Homebrew" })).toBeUndefined();
  });
});
