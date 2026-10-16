/**
 * RA-29 — Travel Pace quick-reference (D&D 2024 SRD 5.2.1, "Exploration").
 *
 * Travel pace has no per-character mechanic (nothing to compute, no Grant), so
 * this is a pure reference table — exactly like cover.ts / COVER_REFERENCE. It
 * renders in the Play tab's "Rules Reference" panel (`SituationalRules`). Values
 * are authoritative and shouldn't drift — see tests/unit/travel-pace.test.ts.
 *
 * Distances are the canonical SRD numbers (feet per minute, miles per hour,
 * miles per day; the per-day figures assume an 8-hour travel day). The render
 * consumer localizes them via the D3 helpers (feet through localeDistance, miles
 * through localeMiles); this data stays unit-canonical.
 *
 * Each pace's name and its special effect (when it has one) live in the `rule`
 * SRD catalogue (`src/i18n/<locale>/srd/rules.json`) under {@link travelPaceKey}.
 *
 * Source: SRD 5.2.1 (CC-BY-4.0), "Travel Pace" table — concise functional
 * restatements, not verbatim prose.
 */

export type TravelPaceId = "fast" | "normal" | "slow";

export interface TravelPace {
  /** Stable id (kebab-case). */
  id: TravelPaceId;
  /** Feet covered per minute at this pace. */
  perMinuteFt: number;
  /** Miles covered per hour at this pace. */
  perHourMiles: number;
  /** Miles covered per (8-hour) day at this pace. */
  perDayMiles: number;
}

/** The `rule` catalogue key of a pace (`travel-pace.fast`): `name`, and `effect` if any. */
export function travelPaceKey(id: TravelPaceId): string {
  return `travel-pace.${id}`;
}

export const TRAVEL_PACE_REFERENCE: ReadonlyArray<TravelPace> = [
  { id: "fast", perMinuteFt: 400, perHourMiles: 4, perDayMiles: 30 },
  { id: "normal", perMinuteFt: 300, perHourMiles: 3, perDayMiles: 24 },
  { id: "slow", perMinuteFt: 200, perHourMiles: 2, perDayMiles: 18 },
];
