/**
 * Presenter (rule 5 — `lib/views` is the ONLY layer that localizes) for the
 * Play-tab "Rules Reference" panel. Folds the reference tables (Cover = M8,
 * Mounted/Underwater = RA-30, Travel Pace = RA-29), whose rows are ids, into a
 * locale-resolved view-model of plain strings read from the `rule` SRD
 * catalogue, so `SituationalRules` renders strings only.
 *
 * Travel-pace distances stay raw numbers here; the view formats them through the
 * D3 helpers (localeDistance / localeMiles) with the per-min/hr/day UI labels.
 */

import type { Locale } from "@/lib/locale";
import { COVER_REFERENCE, coverKey } from "@/data/cover";
import {
  MOUNTED_COMBAT_REFERENCE,
  UNDERWATER_COMBAT_REFERENCE,
  type CombatVariantNote,
} from "@/data/combat-variants";
import { TRAVEL_PACE_REFERENCE, travelPaceKey } from "@/data/travel-pace";
import { hasSrd, localizeSrd } from "@/i18n/resolver";

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

/** Fold the four reference tables into localized plain strings. */
export function buildSituationalRulesView(locale: Locale): SituationalRulesView {
  const rule = (key: string, field: string): string =>
    localizeSrd("rule", key, field, locale);
  const line = ({ id, key }: CombatVariantNote): RuleLineVM => ({
    id,
    term: rule(key, "name"),
    desc: rule(key, "summary"),
  });
  return {
    cover: COVER_REFERENCE.map((c) => line({ id: c.id, key: coverKey(c.id) })),
    mounted: MOUNTED_COMBAT_REFERENCE.map(line),
    underwater: UNDERWATER_COMBAT_REFERENCE.map(line),
    travel: TRAVEL_PACE_REFERENCE.map((p) => {
      const key = travelPaceKey(p.id);
      return {
        id: p.id,
        name: rule(key, "name"),
        perMinuteFt: p.perMinuteFt,
        perHourMiles: p.perHourMiles,
        perDayMiles: p.perDayMiles,
        effect: hasSrd("rule", key, "effect", locale) ? rule(key, "effect") : null,
      };
    }),
  };
}
