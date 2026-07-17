/**
 * Regression: magic item AC bonus is now gated on attunement.
 *
 * RAW 2024 (PHB p.135): items that require attunement only grant their
 * bonuses while the player is attuned. The MagicItemAddModal writes
 * `attuned: false` on items whose SRD entry has `attunement: true`; the
 * field is left undefined for items that don't require attunement (the
 * bonus always applies in that case). Previously computeAC unconditionally
 * stacked `item.acBonus`, so a freshly-added Ring of Protection bumped AC
 * by +1 before the player even attuned to it.
 */
import { describe, expect, it } from "vitest";
import { computeAC } from "@/lib/compute";
import type { CustomEquipment, SrdEquipmentRef } from "@/types/character";

const SCORES = { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 };
const NO_SRD = () => undefined;

function ringOfProtection(opts: { attuned?: boolean }): CustomEquipment {
  return {
    custom: true,
    name: "Ring of Protection",
    notes: "",
    quantity: 1,
    equipped: true,
    acBonus: 1,
    ...(opts.attuned !== undefined ? { attuned: opts.attuned } : {}),
  };
}

describe("computeAC — magic item attunement gating", () => {
  it("acBonus DOES NOT apply when attuned === false (requires-but-not-attuned)", () => {
    const ac = computeAC([ringOfProtection({ attuned: false })], SCORES, NO_SRD);
    // 10 + DEX +2 + 0 (ring not attuned) = 12
    expect(ac).toBe(12);
  });

  it("acBonus DOES apply when attuned === true", () => {
    const ac = computeAC([ringOfProtection({ attuned: true })], SCORES, NO_SRD);
    // 10 + DEX +2 + 1 (ring attuned) = 13
    expect(ac).toBe(13);
  });

  it("acBonus DOES apply when attuned is undefined (item doesn't require attunement)", () => {
    const ac = computeAC([ringOfProtection({})], SCORES, NO_SRD);
    // 10 + DEX +2 + 1 = 13
    expect(ac).toBe(13);
  });

  it("attunement gating also applies to SRD-referenced items via item.acBonus", () => {
    const srdRing: SrdEquipmentRef = {
      srdId: "ring-of-protection",
      quantity: 1,
      equipped: true,
      acBonus: 1,
      attuned: false,
    };
    const ac = computeAC([srdRing], SCORES, NO_SRD);
    expect(ac).toBe(12); // bonus suppressed
    const attunedRing: SrdEquipmentRef = { ...srdRing, attuned: true };
    expect(computeAC([attunedRing], SCORES, NO_SRD)).toBe(13);
  });

  // Issue #37: a hand-written / minimally-stored ref of an attunement-required
  // SRD item (ring-of-protection has `attunement: true`) with `attuned`
  // undefined is NOT attuned — the requirement comes from the SRD data, not the
  // ref shape. Previously the +1 leaked because only `attuned === false` gated.
  it("suppresses acBonus of an attunement-required SRD item when attuned is undefined", () => {
    const srdRing: SrdEquipmentRef = {
      srdId: "ring-of-protection",
      quantity: 1,
      equipped: true,
      acBonus: 1,
      // attuned intentionally omitted (undefined)
    };
    expect(computeAC([srdRing], SCORES, NO_SRD)).toBe(12); // NOT 13
  });

  it("base armor AC is unaffected by attunement (you can still wear +1 plate unattuned)", () => {
    // A magic plate that requires attunement should still give its base
    // 18 AC just from being worn — only the +1 magical bonus is gated.
    const plate: CustomEquipment = {
      custom: true,
      name: "+1 Plate",
      notes: "",
      quantity: 1,
      equipped: true,
      armorCategory: "heavy",
      ac: { base: 18, dexBonus: false },
      acBonus: 1, // the +1
      attuned: false, // requires but not attuned
    };
    // Base 18 + 0 magical (gated) = 18 (NOT 19)
    expect(computeAC([plate], SCORES, NO_SRD)).toBe(18);
  });
});
