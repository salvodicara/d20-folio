/**
 * Falling (SRD 5.2.1 Rules Glossary): "A creature that falls takes 1d6 Bludgeoning
 * damage at the end of the fall for every 10 feet it fell, to a maximum of 20d6.
 * When the creature lands, it has the Prone condition, unless it avoids taking
 * damage from the fall." The Italian SRD counts 3 metres per 10 feet.
 */
import { describe, expect, it } from "vitest";
import { FALL_DAMAGE_TYPE, fallDamageDice, fallLandsProne } from "@/lib/play/fall";

describe("fall damage", () => {
  it("is 1d6 per full 10 ft fallen, at most 20d6", () => {
    for (const [ft, dice] of [
      [0, 0],
      [5, 0],
      [10, 1],
      [25, 2],
      [60, 6],
      [200, 20],
      [500, 20],
    ] as const) {
      expect(fallDamageDice(ft, "ft")).toBe(dice);
    }
  });

  it("counts 3 m for every 10 ft in metres", () => {
    for (const [m, dice] of [
      [1.5, 0],
      [3, 1],
      [9, 3],
      [18, 6],
      [60, 20],
      [150, 20],
    ] as const) {
      expect(fallDamageDice(m, "m")).toBe(dice);
    }
  });

  it("is Bludgeoning damage", () => {
    expect(FALL_DAMAGE_TYPE).toBe("bludgeoning");
  });

  it("lands you Prone unless you took no damage from it", () => {
    expect(fallLandsProne(7)).toBe(true);
    expect(fallLandsProne(0)).toBe(false);
  });
});
