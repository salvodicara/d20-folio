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

  it("Normal = 300 ft/min · 3 mph · 24 mi/day", () => {
    const p = TRAVEL_PACE_REFERENCE.find((x) => x.id === "normal");
    expect(p?.perMinuteFt).toBe(300);
    expect(p?.perHourMiles).toBe(3);
    expect(p?.perDayMiles).toBe(24);
  });

  it("Slow = 200 ft/min · 2 mph · 18 mi/day", () => {
    const p = TRAVEL_PACE_REFERENCE.find((x) => x.id === "slow");
    expect(p?.perMinuteFt).toBe(200);
    expect(p?.perHourMiles).toBe(2);
    expect(p?.perDayMiles).toBe(18);
  });

  // 2024: each pace changes a roll (SRD 5.2.1 Travel Pace), not the 2014 "−5 passive
  // Perception" / "can move stealthily".
  it("each pace's effect is the 2024 roll", () => {
    expect(paceText("fast", "effect", "en")).toBe(
      "Disadvantage on Wisdom (Perception or Survival) checks."
    );
    expect(paceText("normal", "effect", "en")).toBe(
      "Disadvantage on Dexterity (Stealth) checks."
    );
    expect(paceText("slow", "effect", "en")).toBe(
      "Advantage on Wisdom (Perception or Survival) checks."
    );
    expect(paceText("normal", "effect", "it")).toBe(
      "Svantaggio alle prove di Destrezza (Furtività)."
    );
  });

  it.each(LOCALES)("every pace has its name and its effect in %s", (locale) => {
    for (const p of TRAVEL_PACE_REFERENCE) {
      expect(paceText(p.id, "name", locale), p.id).toBeTruthy();
      expect(paceText(p.id, "effect", locale), p.id).toBeTruthy();
    }
  });
});
