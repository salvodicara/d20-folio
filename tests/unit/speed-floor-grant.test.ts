/**
 * `speed-floor` grant — the MAX counterpart of the flat-additive `speed` grant.
 * Boots of Striding and Springing: "your Speed becomes 30 feet unless your Speed
 * is higher" → `{ minFt: 30 }`.
 *
 * Proves end-to-end:
 *   1. AGGREGATE — a `speed-floor` grant routes into `AggregatedGrants.speedFloorFt`;
 *      default is 0; MAX floor wins (floors never stack).
 *   2. DATA — Boots of Striding and Springing declares a 30-ft floor (NOT a flat
 *      +30 ft add, which would wrongly stack a 30-ft base to 60).
 *   3. CONSUMER — `effectiveWalkingSpeedFt` raises a ≤30-ft base to 30 (floored)
 *      and leaves a >30-ft base untouched; an exhausted Speed still floors to 30.
 *   4. GATING — the floor only applies when the grant is present (no boots ⇒
 *      unchanged Speed).
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import { getEquipment } from "@/data/equipment";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { makeCharacterDoc } from "./_helpers";

/** Wrap loose grants in a single source for `evaluateGrants`. */
function aggregateOf(grants: ReadonlyArray<Grant>) {
  const source: GrantSource = { id: "test", name: { en: "Test", it: "Test" }, grants };
  return evaluateGrants([source]);
}

describe("speed-floor grant — aggregate routing", () => {
  it("default speedFloorFt is 0 (no floor) when no source grants one", () => {
    expect(aggregateOf([]).speedFloorFt).toBe(0);
    expect(aggregateOf([{ type: "speed", amount: 10 }]).speedFloorFt).toBe(0);
  });

  it("a `speed-floor` grant routes its minFt into speedFloorFt", () => {
    expect(aggregateOf([{ type: "speed-floor", minFt: 30 }]).speedFloorFt).toBe(30);
  });

  it("MAX floor wins — floors never stack (two 30-ft floors ≠ 60)", () => {
    const agg = aggregateOf([
      { type: "speed-floor", minFt: 30 },
      { type: "speed-floor", minFt: 30 },
    ]);
    expect(agg.speedFloorFt).toBe(30);
  });

  it("the largest floor among different floors wins", () => {
    const agg = aggregateOf([
      { type: "speed-floor", minFt: 30 },
      { type: "speed-floor", minFt: 40 },
    ]);
    expect(agg.speedFloorFt).toBe(40);
  });

  it("the floor is orthogonal to the additive speedBonusFt bucket", () => {
    const agg = aggregateOf([
      { type: "speed", amount: 10 },
      { type: "speed-floor", minFt: 30 },
    ]);
    expect(agg.speedBonusFt).toBe(10);
    expect(agg.speedFloorFt).toBe(30);
  });
});

describe("speed-floor grant — Boots of Striding and Springing data wiring", () => {
  it("the boots declare a 30-ft speed-floor (NOT a flat +30 ft add)", () => {
    const item = SRD_MAGIC_ITEMS.find((m) => m.id === "boots-of-striding-and-springing");
    const grants: ReadonlyArray<Grant> = item?.grants ?? [];
    expect(grants.some((g) => g.type === "speed-floor" && g.minFt === 30)).toBe(true);
    // Never the additive `speed` grant (which would wrongly stack to 60).
    expect(grants.some((g) => g.type === "speed")).toBe(false);
  });
});

describe("effectiveWalkingSpeedFt — applies the Boots-of-Striding speed-floor", () => {
  /** A character wearing equipped, ATTUNED Boots of Striding and Springing
   *  (the boots require attunement — inert until attuned, issue #37). */
  function bootsChar(speed: string) {
    return makeCharacterDoc({
      speed,
      equipment: [
        { srdId: "boots-of-striding-and-springing", equipped: true, attuned: true },
      ],
    });
  }
  /** Same base Speed with no boots — the floor must NOT apply. */
  function plainChar(speed: string) {
    return makeCharacterDoc({ speed });
  }

  it("FAIL-BEFORE: a 25-ft base with the boots floors UP to 30", () => {
    expect(effectiveWalkingSpeedFt(bootsChar("25 ft"), getEquipment)).toBe(30);
  });

  it("a 30-ft base with the boots stays 30 (floor matches, no stacking)", () => {
    expect(effectiveWalkingSpeedFt(bootsChar("30 ft"), getEquipment)).toBe(30);
  });

  it("a 40-ft base with the boots stays 40 — the floor never LOWERS Speed", () => {
    expect(effectiveWalkingSpeedFt(bootsChar("40 ft"), getEquipment)).toBe(40);
  });

  it("an exhausted, below-floor Speed still floors back up to 30", () => {
    const char = bootsChar("30 ft");
    char.session.exhaustion = 2; // −10 ft ⇒ 20, then floored to 30
    expect(effectiveWalkingSpeedFt(char, getEquipment)).toBe(30);
  });

  it("GATED: with NO boots, the floor does not apply (25 stays 25, 40 stays 40)", () => {
    expect(effectiveWalkingSpeedFt(plainChar("25 ft"), getEquipment)).toBe(25);
    expect(effectiveWalkingSpeedFt(plainChar("40 ft"), getEquipment)).toBe(40);
  });
});
