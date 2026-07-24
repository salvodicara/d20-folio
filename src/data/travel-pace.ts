/**
 * RA-29 — Travel Pace quick-reference (D&D 2024 SRD 5.2.1, "Exploration").
 *
 * Travel pace has no per-character mechanic (nothing to compute, no Grant), so
 * this is a pure reference table the UI can render anywhere a rules-reference
 * surface exists — exactly like cover.ts / COVER_REFERENCE. Values are
 * authoritative and shouldn't drift — see tests/unit/travel-pace.test.ts.
 *
 * Distances are the canonical SRD numbers (feet per minute, miles per hour,
 * miles per day; the per-day figures assume an 8-hour travel day). A render
 * consumer localizes them via the D3 helpers (feet through localeDistance);
 * this data stays unit-canonical.
 *
 * Source: SRD 5.2.1 (CC-BY-4.0), "Travel Pace" table — concise functional
 * restatements, not verbatim prose.
 */

import type { BiText } from "@/data/types";

export type TravelPaceId = "fast" | "normal" | "slow";

export interface TravelPace {
  /** Stable id (kebab-case). */
  id: TravelPaceId;
  /** Bilingual pace name. */
  name: BiText;
  /** Feet covered per minute at this pace. */
  perMinuteFt: number;
  /** Miles covered per hour at this pace. */
  perHourMiles: number;
  /** Miles covered per (8-hour) day at this pace. */
  perDayMiles: number;
  /** Bilingual one-line special effect, or null when the pace has none. */
  effect: BiText | null;
}

export const TRAVEL_PACE_REFERENCE: ReadonlyArray<TravelPace> = [
  {
    id: "fast",
    name: { en: "Fast", it: "Veloce" },
    perMinuteFt: 400,
    perHourMiles: 4,
    perDayMiles: 30,
    effect: {
      en: "-5 penalty to passive Perception.",
      it: "-5 alla Percezione passiva.",
    },
  },
  {
    id: "normal",
    name: { en: "Normal", it: "Normale" },
    perMinuteFt: 300,
    perHourMiles: 3,
    perDayMiles: 24,
    effect: null,
  },
  {
    id: "slow",
    name: { en: "Slow", it: "Lenta" },
    perMinuteFt: 200,
    perHourMiles: 2,
    perDayMiles: 18,
    effect: { en: "Can move stealthily.", it: "Può muoversi furtivamente." },
  },
];
