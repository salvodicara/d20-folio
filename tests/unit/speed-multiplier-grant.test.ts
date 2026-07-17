/**
 * `speed-multiplier` grant — the factor counterpart of the flat-additive
 * `speed` grant. Boots of Speed: "the boots double your Speed" → `{ factor: 2 }`.
 *
 * Proves end-to-end:
 *   1. AGGREGATE — a `speed-multiplier` grant routes into
 *      `AggregatedGrants.speedMultiplier`; default is 1; MAX factor wins
 *      (multipliers never stack in RAW).
 *   2. WHILE-ACTIVE — the multiplier only counts while its toggle is on (the
 *      heel-click is a Bonus-Action toggle).
 *   3. DATA — Boots of Speed declares a ×2 multiplier (NOT the old flat +30 ft
 *      hack); verified vs the wiki scrape ("the boots double your Speed").
 *   4. CONSUMER — `effectiveWalkingSpeedFt` applies the multiplier to
 *      `(base + additive)` and only THEN subtracts the flat penalties (armor,
 *      exhaustion), correctly doubling a Speed of any base — incl. non-30.
 *   5. OVERRIDE-FIRST — with no multiplier (factor 1) the resolver is the
 *      identity for the base+bonus; the displayed Speed stays overridable.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import { getEquipment } from "@/data/equipment";
import { resolveAllGrantSources } from "@/lib/resolve-grant-sources";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type { SrdEquipmentRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

/** Wrap loose grants in a single source for `evaluateGrants`. */
function aggregateOf(grants: ReadonlyArray<Grant>, activeKeys?: ReadonlySet<string>) {
  const source: GrantSource = { id: "test", name: { en: "Test", it: "Test" }, grants };
  return evaluateGrants([source], activeKeys);
}

describe("speed-multiplier grant — aggregate routing", () => {
  it("default speedMultiplier is 1 (no multiplier) when no source grants one", () => {
    expect(aggregateOf([]).speedMultiplier).toBe(1);
    expect(aggregateOf([{ type: "speed", amount: 10 }]).speedMultiplier).toBe(1);
  });

  it("a `speed-multiplier` grant routes its factor into speedMultiplier", () => {
    expect(aggregateOf([{ type: "speed-multiplier", factor: 2 }]).speedMultiplier).toBe(
      2
    );
  });

  it("MAX factor wins — multipliers never stack (two ×2 ≠ ×4)", () => {
    const agg = aggregateOf([
      { type: "speed-multiplier", factor: 2 },
      { type: "speed-multiplier", factor: 2 },
    ]);
    expect(agg.speedMultiplier).toBe(2);
  });

  it("the largest factor among different multipliers wins", () => {
    const agg = aggregateOf([
      { type: "speed-multiplier", factor: 2 },
      { type: "speed-multiplier", factor: 3 },
    ]);
    expect(agg.speedMultiplier).toBe(3);
  });

  it("the multiplier is orthogonal to the additive speedBonusFt bucket", () => {
    const agg = aggregateOf([
      { type: "speed", amount: 10 },
      { type: "speed-multiplier", factor: 2 },
    ]);
    expect(agg.speedBonusFt).toBe(10);
    expect(agg.speedMultiplier).toBe(2);
  });
});

describe("speed-multiplier grant — while-active gating", () => {
  const bootsLike: GrantSource = {
    id: "src",
    name: { en: "Src", it: "Src" },
    grants: [
      {
        type: "while-active",
        activeKey: "boots",
        label: { en: "Boots", it: "Stivali" },
        grants: [{ type: "speed-multiplier", factor: 2 }],
      },
    ],
  };

  it("contributes no multiplier while its toggle is OFF (default 1)", () => {
    expect(evaluateGrants([bootsLike]).speedMultiplier).toBe(1);
  });

  it("contributes the ×2 multiplier ONLY while its toggle is ON", () => {
    expect(evaluateGrants([bootsLike], new Set(["boots"])).speedMultiplier).toBe(2);
  });
});

describe("speed-multiplier grant — Boots of Speed data wiring", () => {
  function aggForBoots(active: boolean) {
    // Boots of Speed require attunement — inert until attuned (issue #37).
    const ref: SrdEquipmentRef = {
      srdId: "boots-of-speed",
      equipped: true,
      attuned: true,
    };
    return evaluateGrants(
      resolveAllGrantSources({ features: [], equipment: [ref] }),
      active ? new Set(["boots-of-speed"]) : new Set(),
      new Map()
    );
  }

  it("Boots of Speed declare a ×2 speed-multiplier (NOT a flat +30 ft hack)", () => {
    const item = SRD_MAGIC_ITEMS.find((m) => m.id === "boots-of-speed");
    const whileActive = item?.grants?.find((g) => g.type === "while-active");
    const inner: ReadonlyArray<Grant> =
      whileActive?.type === "while-active" ? whileActive.grants : [];
    // The inner grant is a multiplier, never the old additive +30.
    expect(inner.some((g) => g.type === "speed-multiplier" && g.factor === 2)).toBe(true);
    expect(inner.some((g) => g.type === "speed")).toBe(false);
  });

  it("Boots of Speed: ×2 only while active, never an additive speedBonusFt", () => {
    const off = aggForBoots(false);
    expect(off.speedMultiplier).toBe(1);
    expect(off.speedBonusFt).toBe(0);

    const on = aggForBoots(true);
    expect(on.speedMultiplier).toBe(2);
    expect(on.speedBonusFt).toBe(0);
  });
});

describe("effectiveWalkingSpeedFt — applies the Boots-of-Speed ×2 multiplier (S13/G12)", () => {
  /** A character wearing equipped, ATTUNED Boots of Speed (attunement-required —
   *  issue #37), with `boots-of-speed` optionally lit. */
  function bootsChar(active: boolean, speed = "30 ft") {
    return makeCharacterDoc(
      {
        speed,
        equipment: [{ srdId: "boots-of-speed", equipped: true, attuned: true }],
      },
      { activeFeatures: active ? ["boots-of-speed"] : [] }
    );
  }

  it("FAIL-BEFORE GUARD: with the boots OFF, Speed is the plain base (×1)", () => {
    expect(effectiveWalkingSpeedFt(bootsChar(false), getEquipment)).toBe(30);
  });

  it("the lit Boots DOUBLE the effective walking Speed (30 → 60) — dropped before S13", () => {
    // Before S13 the multiplier was read only by the DEAD compute twin; the live
    // consumer ignored it, so the boots had zero effect on the displayed Speed.
    expect(effectiveWalkingSpeedFt(bootsChar(true), getEquipment)).toBe(60);
  });

  it("×2 doubles a NON-30 base correctly (25 → 50) — the +30 hack could not", () => {
    expect(effectiveWalkingSpeedFt(bootsChar(true, "25 ft"), getEquipment)).toBe(50);
    expect(effectiveWalkingSpeedFt(bootsChar(true, "40 ft"), getEquipment)).toBe(80);
  });

  it("applies the multiplier BEFORE the flat exhaustion reduction (×2 then −/level)", () => {
    const char = bootsChar(true); // 30 base
    char.session.exhaustion = 2; // −10 ft, applied AFTER the ×2
    // (30 × 2) − 10 = 50, NOT (30 − 10) × 2 = 40.
    expect(effectiveWalkingSpeedFt(char, getEquipment)).toBe(50);
  });

  it("the data still declares the boots as a ×2 multiplier (no flat +30 hack)", () => {
    const item = SRD_MAGIC_ITEMS.find((m) => m.id === "boots-of-speed");
    const whileActive = item?.grants?.find((g) => g.type === "while-active");
    const inner: ReadonlyArray<Grant> =
      whileActive?.type === "while-active" ? whileActive.grants : [];
    expect(inner.some((g) => g.type === "speed-multiplier" && g.factor === 2)).toBe(true);
    expect(inner.some((g) => g.type === "speed")).toBe(false);
  });
});
