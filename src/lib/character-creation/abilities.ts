import { ABILITIES } from "../homebrew/model";
import type { Ability } from "../homebrew/origins";
import type { OriginException } from "../homebrew/origin-build";
export type CreationMethod = "standard" | "points" | "manual";
export type CreationScores = Record<Ability, number | null>;
export const STANDARD_SCORES = [15, 14, 13, 12, 10, 8] as const;
const POINT_COST: Readonly<Record<number, number>> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
export interface AbilityIssue {
  path: string;
  code: string;
  invalid: boolean;
}
/** Base scores only. Origin increases retain their own attributed acquisition facts. */
export function checkCreationAbilities(
  method: CreationMethod,
  scores: CreationScores,
  exceptions: readonly OriginException[],
  ownerUid: string
) {
  const issues: AbilityIssue[] = [],
    applied: OriginException[] = [];
  const check = (ok: boolean, path: string, code: string, invalid = false) => {
    if (ok) return;
    const exception =
      !invalid &&
      exceptions.find(
        (entry) =>
          entry.path === path &&
          entry.code === code &&
          entry.authorUid === ownerUid &&
          entry.reason.trim()
      );
    if (exception) applied.push(exception);
    else issues.push({ path, code, invalid });
  };
  const values = ABILITIES.map((ability) => scores[ability]);
  check(
    ["standard", "points", "manual"].includes(method),
    "abilities",
    "invalid-method",
    true
  );
  for (const ability of ABILITIES) {
    const value = scores[ability];
    check(
      typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 30,
      "abilities/" + ability,
      "invalid-score",
      true
    );
  }
  let spent: number | null = null;
  if (!issues.some((issue) => issue.invalid)) {
    const numbers = values as number[];
    if (method === "standard")
      check(
        [...numbers]
          .sort((a, b) => b - a)
          .every((value, index) => value === STANDARD_SCORES[index]),
        "abilities",
        "standard-array"
      );
    if (method === "points") {
      const inRange = numbers.every((value) => Object.hasOwn(POINT_COST, value));
      check(inRange, "abilities", "point-range");
      if (inRange) {
        spent = numbers.reduce((sum, value) => sum + (POINT_COST[value] ?? 0), 0);
        check(spent <= 27, "abilities", "point-budget");
      }
    }
    if (method === "manual")
      for (const ability of ABILITIES) {
        const value = scores[ability] as number;
        check(value >= 3 && value <= 18, "abilities/" + ability, "manual-range");
      }
  }
  return {
    valid: issues.length === 0,
    issues,
    applied,
    spent,
    remaining: spent === null ? null : 27 - spent,
  };
}
