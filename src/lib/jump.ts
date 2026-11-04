/**
 * Jump distances as derived numbers (SRD 5.2.1 rules glossary "Long Jump", "High
 * Jump"). With at least a 10-ft running start a Long Jump covers feet equal to your
 * Strength score and a High Jump 3 + your Strength modifier feet (minimum 0); from a
 * standstill, half. A `jump-ability` grant lets another ability stand in (Second-Story
 * Work: Dexterity, when it is the better one); a `jump-leap` grant is the separate
 * once-per-turn leap (Jump, Boots of Striding and Springing: 30 ft for 10 ft of
 * movement). `jump-bonus` adds feet (to the running start only, or to every jump),
 * and `jump-multiplier` multiplies the whole (Step of the Wind). Every number is the
 * sum of its breakdown parts.
 */
import type { AbilityCode } from "@/data/types";
import type { AggregatedGrants } from "@/lib/grants";
import type { SrdKind } from "@/i18n/srd-en";
import { srdText } from "@/lib/loc-text";
import { ruleFlag, ruleParts, ruleValue, type RuleOrigin } from "@/lib/rules";
import {
  abilityPart,
  breakdownTotal,
  locPart,
  termPart,
  withOverride,
  type BreakdownWhy,
  type RawBreakdownPart,
} from "@/lib/value-breakdown";

export interface JumpLeap {
  distanceFt: number;
  movementCostFt: number;
  parts: RawBreakdownPart[];
}

export interface JumpView {
  /** Running-start distances, in feet. */
  long: number;
  high: number;
  longParts: RawBreakdownPart[];
  highParts: RawBreakdownPart[];
  /** From a standstill: half. */
  standingLong: number;
  standingHigh: number;
  /** The once-per-turn leap a grant gives, or null. */
  leap: JumpLeap | null;
}

const modifier = (score: number): number => Math.floor((score - 10) / 2);

const STANDING_WHY: BreakdownWhy = { term: "breakdown.why.jumpStanding" };

function sourceOf(
  origins: ReadonlyArray<RuleOrigin>,
  target: Parameters<typeof ruleParts>[1]
): { kind: string; key: string } | undefined {
  return origins.find((origin) => origin.rule.target === target)?.source;
}

export function deriveJumps(
  scores: Readonly<Record<AbilityCode, number>>,
  agg: Pick<AggregatedGrants, "values" | "ruleOrigins">,
  /** Hand-set distances (the character's `jumpOverrides`): each replaces its own. */
  pins?: { long?: number; high?: number }
): JumpView {
  const byDex = ruleFlag(agg.values, "jump:ability:DEX") && scores.DEX > scores.STR;
  const ability: AbilityCode = byDex ? "DEX" : "STR";
  const score = scores[ability];
  const dexSource = byDex ? sourceOf(agg.ruleOrigins, "jump:ability:DEX") : undefined;
  const why: BreakdownWhy = dexSource
    ? {
        ...STANDING_WHY,
        rule: { loc: srdText(dexSource.kind as SrdKind, dexSource.key, "name") },
      }
    : STANDING_WHY;

  const computedLong = [abilityPart(ability, score, undefined, why)];
  const computedHigh = [
    termPart("breakdown.base", 3),
    abilityPart(ability, modifier(score), undefined, why),
  ];
  const raw = breakdownTotal(computedHigh);
  if (raw < 0) computedHigh.push(termPart("breakdown.jump.minimum", -raw));
  const longParts =
    pins?.long !== undefined ? withOverride(computedLong, pins.long) : computedLong;
  const highParts =
    pins?.high !== undefined ? withOverride(computedHigh, pins.high) : computedHigh;

  // Bonuses (every jump, or the running start's only) and a multiplier on the whole.
  const bonusParts = (target: Parameters<typeof ruleParts>[1]): RawBreakdownPart[] =>
    ruleParts(agg.ruleOrigins, target).map(({ source, value }) =>
      source
        ? locPart(srdText(source.kind as SrdKind, source.key, "name"), value)
        : termPart("breakdown.featureBonus", value)
    );
  const factor = Math.max(1, ruleValue(agg.values, "jump:multiplier") ?? 1);
  const factorSource = ruleParts(agg.ruleOrigins, "jump:multiplier")[0]?.source;
  const multiplied = (parts: RawBreakdownPart[]): RawBreakdownPart[] => {
    const extra = breakdownTotal(parts) * (factor - 1);
    if (extra === 0) return parts;
    return [
      ...parts,
      factorSource
        ? locPart(srdText(factorSource.kind as SrdKind, factorSource.key, "name"), extra)
        : termPart("breakdown.featureBonus", extra),
    ];
  };
  const longAll = bonusParts("jump:long");
  const highAll = bonusParts("jump:high");
  const runningLong =
    pins?.long !== undefined
      ? longParts
      : multiplied([...longParts, ...longAll, ...bonusParts("jump:run-long")]);
  const runningHigh =
    pins?.high !== undefined
      ? highParts
      : multiplied([...highParts, ...highAll, ...bonusParts("jump:run-high")]);
  const long = breakdownTotal(runningLong);
  const high = breakdownTotal(runningHigh);
  // From a standstill: half the plain distance, plus the bonuses that are not the
  // running start's, all multiplied.
  const standing = (
    pinned: boolean,
    plain: RawBreakdownPart[],
    all: RawBreakdownPart[],
    run: number
  ) => (pinned ? run / 2 : (breakdownTotal(plain) / 2 + breakdownTotal(all)) * factor);

  const distanceFt = ruleValue(agg.values, "jump:leap");
  const leapSource = ruleParts(agg.ruleOrigins, "jump:leap")[0]?.source;
  const leap: JumpLeap | null =
    distanceFt === null
      ? null
      : {
          distanceFt,
          movementCostFt: ruleValue(agg.values, "jump:leap-cost") ?? 0,
          parts: [
            leapSource
              ? locPart(
                  srdText(leapSource.kind as SrdKind, leapSource.key, "name"),
                  distanceFt
                )
              : termPart("breakdown.featureBonus", distanceFt),
          ],
        };

  return {
    long,
    high,
    longParts: runningLong,
    highParts: runningHigh,
    standingLong: standing(pins?.long !== undefined, longParts, longAll, long),
    standingHigh: standing(pins?.high !== undefined, highParts, highAll, high),
    leap,
  };
}
