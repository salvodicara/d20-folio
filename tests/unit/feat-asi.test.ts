/**
 * Unit tests for the (reshaped, A4 Phase 8) featAsi / applyFeatAsi helpers.
 * The legacy regex parser is gone; featAsi now reads from the declarative
 * `feat.grants[]` field.
 */

import { describe, it, expect } from "vitest";
import { featAsi, applyFeatAsi } from "@/lib/feat-asi";
import type { Grant } from "@/lib/grants";

/** Build a feat-shaped object with only a `grants` field. */
const withGrants = (grants: Grant[]) => ({ grants });

describe("featAsi — reads declarative grants", () => {
  it("returns the single ability when feat has `ability-score` grant", () => {
    expect(
      featAsi(withGrants([{ type: "ability-score", ability: "CHA", amount: 1, cap: 20 }]))
    ).toEqual({ abilities: ["CHA"], amount: 1, cap: 20 });
  });

  it("returns the choice list when feat has `choice-ability-score`", () => {
    expect(
      featAsi(
        withGrants([
          {
            type: "choice-ability-score",
            abilities: ["STR", "CON"],
            amount: 1,
            cap: 20,
          },
        ])
      )
    ).toEqual({ abilities: ["STR", "CON"], amount: 1, cap: 20 });
  });

  it("returns the six-ability list for an 'any of your choice' grant", () => {
    expect(
      featAsi(
        withGrants([
          {
            type: "choice-ability-score",
            abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
            amount: 1,
            cap: 20,
          },
        ])
      )
    ).toEqual({
      abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
      amount: 1,
      cap: 20,
    });
  });

  it("returns null when feat has no ASI grant", () => {
    expect(featAsi(withGrants([]))).toBeNull();
    expect(featAsi(withGrants([{ type: "hp-per-level", amount: 2 }]))).toBeNull();
    expect(featAsi({})).toBeNull();
  });

  it("returns the FIRST ASI grant when both kinds are present (defensive)", () => {
    // Realistically only one ASI grant per feat, but the helper should
    // pick the first deterministically.
    expect(
      featAsi(
        withGrants([
          { type: "ability-score", ability: "STR", amount: 1, cap: 20 },
          {
            type: "choice-ability-score",
            abilities: ["DEX", "CON"],
            amount: 1,
          },
        ])
      )
    ).toEqual({ abilities: ["STR"], amount: 1, cap: 20 });
  });

  it("preserves non-+1 amount + cap when declared (Epic Boon style)", () => {
    expect(
      featAsi(withGrants([{ type: "ability-score", ability: "WIS", amount: 2, cap: 30 }]))
    ).toEqual({ abilities: ["WIS"], amount: 2, cap: 30 });
  });

  it("defaults cap to 20 when the grant doesn't declare one", () => {
    // The cap field is optional on the grant; consumers should see the
    // RAW default of 20 when nothing is declared.
    expect(
      featAsi(withGrants([{ type: "ability-score", ability: "DEX", amount: 1 }]))
    ).toEqual({ abilities: ["DEX"], amount: 1, cap: 20 });
  });
});

describe("applyFeatAsi", () => {
  const base: Record<"STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA", number> = {
    STR: 10,
    DEX: 14,
    CON: 13,
    INT: 12,
    WIS: 8,
    CHA: 16,
  };

  it("adds N to the chosen ability", () => {
    expect(applyFeatAsi(base, "CHA", 1)).toEqual({ ...base, CHA: 17 });
  });

  it("does not exceed the cap (default 20)", () => {
    expect(applyFeatAsi({ ...base, CHA: 20 }, "CHA", 1)).toEqual({
      ...base,
      CHA: 20,
    });
    expect(applyFeatAsi({ ...base, CHA: 19 }, "CHA", 2)).toEqual({
      ...base,
      CHA: 20,
    });
  });

  it("allows a custom cap (Epic Boon → 30)", () => {
    expect(applyFeatAsi({ ...base, CHA: 20 }, "CHA", 1, 30)).toEqual({
      ...base,
      CHA: 21,
    });
  });

  it("does not mutate the input object", () => {
    const snapshot = { ...base };
    applyFeatAsi(base, "STR", 1);
    expect(base).toEqual(snapshot);
  });
});
