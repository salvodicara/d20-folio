/**
 * Presenter (rule 5 — `lib/views` is the ONLY layer that localizes) for the
 * Play-tab "Rules reference" panel. Folds the pure inline-BiText reference tables
 * (Cover = M8, Mounted/Underwater = RA-30, Travel Pace = RA-29) into a
 * locale-resolved view-model of plain strings, so `SituationalRules` renders
 * without ever touching BiText.
 *
 * Travel-pace distances stay raw numbers here; the view formats them through the
 * D3 helpers (localeDistance / localeMiles) with the per-min/hr/day UI labels.
 */

import type { Locale } from "@/lib/locale";
import type { BiText } from "@/data/types";
import { COVER_REFERENCE } from "@/data/cover";
import {
  MOUNTED_COMBAT_REFERENCE,
  UNDERWATER_COMBAT_REFERENCE,
} from "@/data/combat-variants";
import { TRAVEL_PACE_REFERENCE } from "@/data/travel-pace";

/** A localized name + one-line summary reference row (cover / mounted / underwater). */
export interface RuleLineVM {
  id: string;
  term: string;
  desc: string;
}

/** A localized travel-pace row; distances stay raw for the view's D3 formatting. */
export interface TravelPaceVM {
  id: string;
  name: string;
  perMinuteFt: number;
  perHourMiles: number;
  perDayMiles: number;
  effect: string | null;
}

export interface SituationalRulesView {
  cover: RuleLineVM[];
  mounted: RuleLineVM[];
  underwater: RuleLineVM[];
  travel: TravelPaceVM[];
}

/** Fold the four inline-BiText reference tables into localized plain strings. */
export function buildSituationalRulesView(locale: Locale): SituationalRulesView {
  const line = (n: { id: string; name: BiText; summary: BiText }): RuleLineVM => ({
    id: n.id,
    term: n.name[locale],
    desc: n.summary[locale],
  });
  return {
    cover: COVER_REFERENCE.map(line),
    mounted: MOUNTED_COMBAT_REFERENCE.map(line),
    underwater: UNDERWATER_COMBAT_REFERENCE.map(line),
    travel: TRAVEL_PACE_REFERENCE.map((p) => ({
      id: p.id,
      name: p.name[locale],
      perMinuteFt: p.perMinuteFt,
      perHourMiles: p.perHourMiles,
      perDayMiles: p.perDayMiles,
      effect: p.effect ? p.effect[locale] : null,
    })),
  };
}
