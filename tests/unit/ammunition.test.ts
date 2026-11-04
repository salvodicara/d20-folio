/** Recovering ammunition after a fight: half of what was spent, rounded down. */
import { describe, expect, it } from "vitest";
import { recoveredAmmunition } from "@/lib/play/ammunition";

describe("recoveredAmmunition", () => {
  it("recovers half the spent ammunition, rounded down", () => {
    expect(recoveredAmmunition(7)).toBe(3);
    expect(recoveredAmmunition(20)).toBe(10);
    expect(recoveredAmmunition(1)).toBe(0);
  });

  it("recovers nothing from nothing", () => {
    expect(recoveredAmmunition(0)).toBe(0);
    expect(recoveredAmmunition(-3)).toBe(0);
  });
});
