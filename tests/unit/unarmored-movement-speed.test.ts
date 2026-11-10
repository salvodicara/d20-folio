/**
 * Monk Unarmored Movement reaches the walking Speed (SRD 5.2.1 Monk Features table:
 * +10 ft at 2, +15 at 6…), «while you aren't wearing armor or wielding a Shield».
 * The Speed tip names it, and its parts add up to the Speed.
 */
import { describe, expect, it } from "vitest";
import { getEquipment } from "@/data/equipment";
import {
  effectiveWalkingSpeedBreakdown,
  effectiveWalkingSpeedFt,
} from "@/lib/smart-tracker";
import { breakdownTotal } from "@/lib/value-breakdown";
import { makeCharacterDoc } from "./_helpers";

const monk = (level: number, equipment: { srdId: string; equipped: boolean }[] = []) =>
  makeCharacterDoc({
    classes: [{ classId: "monk", level }],
    features: [{ srdId: "monk-unarmored-movement" }],
    equipment,
    speed: "30",
  });

describe("Unarmored Movement on the walking Speed", () => {
  it("+10 ft at Monk 2, +15 at Monk 6", () => {
    expect(effectiveWalkingSpeedFt(monk(2), getEquipment)).toBe(40);
    expect(effectiveWalkingSpeedFt(monk(6), getEquipment)).toBe(45);
  });

  it("nothing with a Shield or armor", () => {
    expect(
      effectiveWalkingSpeedFt(
        monk(2, [{ srdId: "shield", equipped: true }]),
        getEquipment
      )
    ).toBe(30);
    expect(
      effectiveWalkingSpeedFt(
        monk(2, [{ srdId: "leather-armor", equipped: true }]),
        getEquipment
      )
    ).toBe(30);
  });

  it("the tip names it, and adds up", () => {
    const parts = effectiveWalkingSpeedBreakdown(monk(2), getEquipment);
    expect(breakdownTotal(parts)).toBe(40);
    expect(JSON.stringify(parts)).toContain("monk-unarmored-movement");
  });
});
