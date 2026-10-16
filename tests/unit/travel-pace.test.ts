import { describe, it, expect } from "vitest";
import {
  TRAVEL_PACE_REFERENCE,
  travelPaceKey,
  type TravelPaceId,
} from "@/data/travel-pace";
import { LOCALES, type Locale } from "@/lib/locale";
import { srd } from "@tests/_harness/loc";

/** A pace's catalogue field in a locale (`""` when it has none). */
function paceText(id: TravelPaceId, field: "name" | "effect", locale: Locale): string {
  return srd("rule", travelPaceKey(id), field, locale);
}

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
    for (const locale of LOCALES) expect(paceText("normal", "effect", locale)).toBe("");
  });

  it("Slow = 200 ft/min · 2 mph · 18 mi/day", () => {
    const p = TRAVEL_PACE_REFERENCE.find((x) => x.id === "slow");
    expect(p?.perMinuteFt).toBe(200);
    expect(p?.perHourMiles).toBe(2);
    expect(p?.perDayMiles).toBe(18);
  });

  // REGRESSION (post-sweep h3) — the Fast pace's penalty shipped with an ASCII
  // hyphen ("-5") where every other number on the sheet uses the true minus sign.
  it.each(LOCALES)(
    "writes its penalty with the app's true minus sign in %s",
    (locale) => {
      expect(paceText("fast", "effect", locale)).toContain("−5");
      for (const p of TRAVEL_PACE_REFERENCE) {
        expect(paceText(p.id, "effect", locale)).not.toMatch(/-\d/);
      }
    }
  );

  it.each(LOCALES)(
    "every pace has its name in %s; Fast and Slow their effect",
    (locale) => {
      for (const p of TRAVEL_PACE_REFERENCE) {
        expect(paceText(p.id, "name", locale), p.id).toBeTruthy();
      }
      expect(paceText("fast", "effect", locale)).toBeTruthy();
      expect(paceText("slow", "effect", locale)).toBeTruthy();
    }
  );
});
