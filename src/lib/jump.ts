/**
 * Jump distances as derived numbers (SRD 5.2.1 rules glossary "Long Jump", "High
 * Jump"). With at least a 10-ft running start a Long Jump covers feet equal to your
 * Strength score and a High Jump 3 + your Strength modifier feet (minimum 0); from a
 * standstill, half. A `jump-ability` grant lets another ability stand in (Second-Story
 * Work: Dexterity, when it is the better one); a `jump-leap` grant is the separate
 * once-per-turn leap (Jump, Boots of Striding and Springing: 30 ft for 10 ft of
 * movement). Every number is the sum of its breakdown parts.
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
  agg: Pick<AggregatedGrants, "values" | "ruleOrigins">
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

  const longParts = [abilityPart(ability, score, undefined, why)];
  const highParts = [
    termPart("breakdown.base", 3),
    abilityPart(ability, modifier(score), undefined, why),
  ];
  const raw = breakdownTotal(highParts);
  if (raw < 0) highParts.push(termPart("breakdown.speed.minimum", -raw));

  const long = breakdownTotal(longParts);
  const high = breakdownTotal(highParts);

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
    longParts,
    highParts,
    standingLong: long / 2,
    standingHigh: high / 2,
    leap,
  };
}
