/**
 * Weapon-Mastery rider presenter (`lib/views`) — turns the masteries a weapon
 * attack row carries (its OWN owned mastery + any feature-granted extra) into the
 * one-tap rider tokens the combat attack card shows beside its on-hit riders.
 *
 * A mastery is not extra damage (so it does not fit `RiderVM`): it is a tactical
 * effect the player declares after the roll — Graze on a miss, Topple / Push /
 * Sap / Slow / Vex on a hit, Cleave's extra swing. The token carries the live
 * number the engine resolved (`masteryDetail`: Graze's on-miss damage, Topple's
 * save DC) so nothing lives in memory; the component composes the localized
 * line. Nick is NOT a rider: it reshapes the off-hand economy (the engine's
 * `type: "free"` off-hand row), so it never yields a token.
 *
 * Pure + framework-free: names resolve through the `weapon-mastery` catalogue.
 */

import type { Locale } from "@/lib/locale";
import type { LocText } from "@/lib/loc-text";
import type { RawActionSummary } from "@/lib/smart-tracker";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import { localeDistance } from "@/lib/utils";

/** Push's shove and Slow's Speed cut are both 10 feet (SRD 5.2.1). */
const MASTERY_DISTANCE_FT = 10;

/** The masteries that ride an attack as a declarable effect, in display order. */
export const MASTERY_RIDER_IDS = [
  "graze",
  "topple",
  "push",
  "sap",
  "slow",
  "vex",
  "cleave",
] as const;

export type MasteryRiderId = (typeof MASTERY_RIDER_IDS)[number];

/** One render-ready Weapon-Mastery rider token. */
export interface MasteryRiderVM {
  id: MasteryRiderId;
  /** Localized mastery name from the SRD catalogue ("Rovesciamento"). */
  name: string;
  /** The same name as a LocText — stored in the rider-use log event. */
  nameLoc: LocText;
  /** Localized rule text (the token's tooltip). */
  description: string;
  /** Graze: the on-miss damage (the attack ability modifier, min 0). */
  amount?: number;
  /** Topple: the Constitution save DC (8 + attack modifier + PB). */
  dc?: number;
  /** Push / Slow: the locale distance ("10 ft", "3 m"). */
  distance?: string;
  /**
   * The seam a tap lights beyond the log line: Vex grants Advantage on the
   * character's next attack roll. Absent → the tap only logs the declaration.
   */
  apply?: "next-attack-advantage";
  /** Cleave: "no more than once per turn" (SRD 5.2.1); the others ride every hit. */
  oncePerTurn?: true;
}

function isRiderId(id: string): id is MasteryRiderId {
  return (MASTERY_RIDER_IDS as ReadonlyArray<string>).includes(id);
}

/**
 * Build the mastery rider tokens for a weapon attack summary. Owned mastery and
 * feature extras are merged and de-duplicated; order follows
 * {@link MASTERY_RIDER_IDS}. No mastery → empty list (no strip renders).
 */
export function buildMasteryRiders(
  summary: Pick<RawActionSummary, "weaponMastery" | "extraMasteries" | "masteryDetail">,
  locale: Locale
): MasteryRiderVM[] {
  const owned = new Set(
    [
      ...(summary.weaponMastery ? [summary.weaponMastery] : []),
      ...(summary.extraMasteries ?? []),
    ].map((m) => m.toLowerCase())
  );
  const detail = summary.masteryDetail;
  return MASTERY_RIDER_IDS.filter((id) => owned.has(id))
    .filter((id) => isRiderId(id) && hasSrd("weapon-mastery", id, "name", locale))
    .map((id) => ({
      id,
      name: localizeSrd("weapon-mastery", id, "name", locale),
      nameLoc: { srd: { kind: "weapon-mastery", key: id, field: "name" } },
      description: localizeSrd("weapon-mastery", id, "description", locale),
      ...(id === "graze" && detail?.grazeDamage !== undefined
        ? { amount: detail.grazeDamage }
        : {}),
      ...(id === "topple" && detail?.toppleDc !== undefined
        ? { dc: detail.toppleDc }
        : {}),
      ...(id === "push" || id === "slow"
        ? { distance: localeDistance(MASTERY_DISTANCE_FT, locale) }
        : {}),
      ...(id === "vex" ? { apply: "next-attack-advantage" as const } : {}),
      ...(id === "cleave" ? { oncePerTurn: true as const } : {}),
    }));
}

/** The rider's at-a-glance line with its live number ("Rovesciamento: TS COS CD
 *  14 → Prono"), through the injected app translator (`combat.masteryRider.*`). */
export function masteryRiderLine(
  rider: MasteryRiderVM,
  t: (key: string, options: Record<string, string | number>) => string
): string {
  return t(`combat.masteryRider.${rider.id}`, {
    name: rider.name,
    amount: rider.amount ?? 0,
    dc: rider.dc ?? "",
    distance: rider.distance ?? "",
  });
}
