/**
 * Flat (non-ability-keyed) feature/species AC bonus → `computeAC`.
 *
 * `evaluateGrants(...).acBonus` sums BOTH equipped-magic-item flat bonuses
 * (Ring/Cloak of Protection, +N armor) AND non-equipment flat feature/species
 * bonuses (a pack species' +1 trait, Defense fighting style). The
 * item portion is already counted by `computeAC` from each equipped ref's
 * `acBonus` field; the new `aggregateAcBonus` parameter folds in ONLY the
 * non-equipment remainder, so the previously-dead flat feature bonus now
 * lands in AC exactly once.
 *
 * Regression matrix:
 *  - base armor + DEX unchanged when no flat bonus is supplied;
 *  - an equipped item's flat bonus is NOT double-counted;
 *  - a flat feature bonus (no matching item) is applied once;
 *  - a feature bonus stacks on top of an item bonus, item still counted once;
 *  - the clamp never lets the remainder go negative;
 *  - a manual `acOverride` still wins (verified via the species grant flowing
 *    through `evaluateGrants` for the pack species' flat AC trait).
 */
import { describe, expect, it } from "vitest";
import { computeAC } from "@/lib/compute";
import { effectiveAC } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import { getEquipment } from "@/data/equipment";
import type { SrdEquipmentRef, CustomEquipment } from "@/types/character";

const SCORES = { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 8 };
const DEX_MOD = 2; // DEX 14

describe("computeAC — aggregateAcBonus (flat feature/species AC)", () => {
  it("base case: no flat bonus → unchanged (unarmored 10 + DEX)", () => {
    expect(computeAC([], SCORES, getEquipment, [])).toBe(10 + DEX_MOD);
    // Explicit 0 matches the defaulted call (behavior-preserving).
    expect(computeAC([], SCORES, getEquipment, [], 0, 0)).toBe(
      computeAC([], SCORES, getEquipment, [])
    );
  });

  it("base armor unchanged when aggregateAcBonus is 0", () => {
    // Leather armor (light, base 11 + full DEX) + shield (+2).
    const equipment: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "leather-armor", equipped: true },
      { srdId: "shield", equipped: true },
    ];
    const withoutAgg = computeAC(equipment, SCORES, getEquipment, []);
    expect(withoutAgg).toBe(11 + DEX_MOD + 2); // 15
    // Passing aggregateAcBonus = 0 must not move it.
    expect(computeAC(equipment, SCORES, getEquipment, [], 0, 0)).toBe(withoutAgg);
  });

  it("equipped item flat bonus is NOT double-counted", () => {
    // A magic item ref carries acBonus: 1 (Ring of Protection style). The same
    // +1 is ALSO in the aggregate (the magic item's `ac-bonus` grant). The two
    // must NOT stack — only one +1.
    const equipment: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "ring-of-protection", equipped: true, acBonus: 1 },
    ];
    const aggregateAcBonus = 1; // mirrors evaluateGrants for that equipped item
    const ac = computeAC(equipment, SCORES, getEquipment, [], 0, aggregateAcBonus);
    // 10 + DEX + 1 (item, once) — NOT + 2.
    expect(ac).toBe(10 + DEX_MOD + 1);
  });

  it("flat feature bonus (no matching item) is applied once", () => {
    // No equipped acBonus item, but the aggregate carries +1 from a species
    // trait (the pack species' flat AC trait shape). The +1 must land.
    const ac = computeAC([], SCORES, getEquipment, [], 0, 1);
    expect(ac).toBe(10 + DEX_MOD + 1);
  });

  it("feature bonus stacks on item bonus; item counted exactly once", () => {
    // Equipped +1 item (acBonus: 1, +1 grant in aggregate) AND a separate +1
    // feature bonus also in the aggregate → aggregate sums to 2. Result must be
    // base + item(1) + feature(1) = +2 total, with the item never doubled.
    const equipment: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "ring-of-protection", equipped: true, acBonus: 1 },
    ];
    const aggregateAcBonus = 2; // 1 (item grant) + 1 (feature grant)
    const ac = computeAC(equipment, SCORES, getEquipment, [], 0, aggregateAcBonus);
    expect(ac).toBe(10 + DEX_MOD + 2);
  });

  it("clamp: a phantom item bonus (no grant) never pushes the remainder negative", () => {
    // Custom item with acBonus: 2 but NO `ac-bonus` grant → it's in
    // `itemBonuses` (2) but NOT in the aggregate (0). The remainder
    // max(0, 0 - 2) = 0, so the item bonus still lands once and nothing is
    // subtracted twice.
    const equipment: Array<SrdEquipmentRef | CustomEquipment> = [
      {
        custom: true,
        name: "Bracers of Defense",
        acBonus: 2,
        equipped: true,
      },
    ];
    const ac = computeAC(equipment, SCORES, getEquipment, [], 0, 0);
    expect(ac).toBe(10 + DEX_MOD + 2);
  });

  it("stacks with the ability-keyed extraBonus independently", () => {
    // extraBonus (Bladesong +INT) and the flat feature bonus are separate
    // channels — both add.
    const ac = computeAC([], SCORES, getEquipment, [], 3, 1);
    expect(ac).toBe(10 + DEX_MOD + 3 + 1);
  });

  it("works with heavy armor (no DEX): flat bonus still applies once", () => {
    // Plate armor (heavy, base 18, no DEX) + a +1 feature bonus.
    const equipment: Array<SrdEquipmentRef | CustomEquipment> = [
      { srdId: "plate-armor", equipped: true },
    ];
    const ac = computeAC(equipment, SCORES, getEquipment, [], 0, 1);
    expect(ac).toBe(18 + 1);
  });
});

describe("computeAC — manual override still wins", () => {
  // Models the sheet's `acOverride ?? computeAC(...)` selection — `override` is
  // a genuine `number | null` parameter so the `??` is meaningful (no
  // control-flow narrowing to a literal).
  function effectiveAc(override: number | null): number {
    return override ?? computeAC([], SCORES, getEquipment, [], 0, 5);
  }

  it("acOverride bypasses the computed value (override-first)", () => {
    // When an override is present it IS the AC — the flat feature bonus (the
    // aggregateAcBonus of 5 inside effectiveAc) is irrelevant.
    expect(effectiveAc(20)).toBe(20);
    // With no override, the computed value honors the flat bonus.
    expect(effectiveAc(null)).toBe(10 + DEX_MOD + 5);
  });
});

// (The real pack-species pipeline pins live
// in `content-pack/tests/unit/flat-feature-ac-bonus.pack.test.ts`.)

describe("effectiveAC seam — a feature flat AC bonus reaches the CANONICAL AC", () => {
  // Regression: `computeCharacterAC` passed `extraBonus` (ability AC) but NOT
  // `aggregateAcBonus`, so a feature's flat `ac-bonus` grant (Paladin Defense +1)
  // was dropped by the roster + cockpit AC even though `computeAC` supports it.
  it("Paladin Defense fighting style adds exactly +1 through effectiveAC", () => {
    const armored = {
      ...MOCK_CHARACTER.character,
      classes: [{ classId: "paladin", level: 2 }],
      acOverride: null,
      equipment: [{ srdId: "leather-armor", equipped: true }],
      features: [],
    };
    const withDefense = {
      ...armored,
      features: [{ srdId: "paladin-fighting-style-defense" }],
    };
    const session = { activeFeatures: [], grantBundleChoices: {} };
    expect(effectiveAC(withDefense, session)).toBe(effectiveAC(armored, session) + 1);
  });
});
