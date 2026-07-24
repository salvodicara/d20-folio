import { describe, it, expect } from "vitest";
import { TRAVEL_PACE_REFERENCE } from "@/data/travel-pace";

/** RA-29 — Authoritative-values guard for the Travel Pace reference data. */
describe("TRAVEL_PACE_REFERENCE (RA-29)", () => {
  it("lists exactly the three 2024 travel paces in order", () => {
    expect(TRAVEL_PACE_REFERENCE.map((p) => p.id)).toEqual(["fast", "normal", "slow"]);
  });

  it("Fast = 400 ft/min · 4 mph · 30 mi/day", () => {
    const p = TRAVEL_PACE_REFERENCE.find((x) => x.id === "fast");
    expect(p?.perMinuteFt).toBe(400);
    expect(p?.perHourMiles).toBe(4);
    expect(p?.perDayMiles).toBe(30);
  });

  it("Normal = 300 ft/min · 3 mph · 24 mi/day, no special effect", () => {
    const p = TRAVEL_PACE_REFERENCE.find((x) => x.id === "normal");
    expect(p?.perMinuteFt).toBe(300);
    expect(p?.perHourMiles).toBe(3);
    expect(p?.perDayMiles).toBe(24);
    expect(p?.effect).toBeNull();
  });

  it("Slow = 200 ft/min · 2 mph · 18 mi/day", () => {
    const p = TRAVEL_PACE_REFERENCE.find((x) => x.id === "slow");
    expect(p?.perMinuteFt).toBe(200);
    expect(p?.perHourMiles).toBe(2);
    expect(p?.perDayMiles).toBe(18);
  });

  it("every entry has a bilingual name; every effect (when present) is bilingual", () => {
    for (const p of TRAVEL_PACE_REFERENCE) {
      expect(p.name.en).toBeTruthy();
      expect(p.name.it).toBeTruthy();
      if (p.effect) {
        expect(p.effect.en).toBeTruthy();
        expect(p.effect.it).toBeTruthy();
      }
    }
  });
});
