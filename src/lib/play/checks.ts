/**
 * Search, Study and Influence as check entries (SRD 5.2.1 rules glossary): the
 * player rolls the d20 at the table, picks the skill the DM called for, and the
 * sheet adds the live bonus, judges the optional DC ("If the total equals or exceeds
 * the DC, the ability check succeeds") and logs it with the use.
 */
import type { ResolvedAction } from "@/lib/smart-tracker";

/** The skills each check action's SRD table lists, in the table's order. */
export const ACTION_CHECK_SKILLS = {
  // "Search [Action]": a Wisdom check.
  "base-search": ["insight", "medicine", "perception", "survival"],
  // "Study [Action]": an Intelligence check.
  "base-study": ["arcana", "history", "investigation", "nature", "religion"],
  // "Influence [Action]": Charisma, or Wisdom (Animal Handling) for a Beast or
  // Monstrosity.
  "base-influence": [
    "deception",
    "intimidation",
    "performance",
    "persuasion",
    "animal-handling",
  ],
} as const satisfies Record<string, ReadonlyArray<string>>;

/** The skills a base action's check entry offers, when it has one. */
export function actionCheckSkills(actionId: string): string[] | undefined {
  const skills = (ACTION_CHECK_SKILLS as Record<string, ReadonlyArray<string>>)[actionId];
  return skills ? [...skills] : undefined;
}

/** The SRD "Typical Difficulty Classes", offered as one-tap DC picks. */
export const TYPICAL_DCS = [5, 10, 15, 20, 25, 30] as const;

/** An entered check: the skill, the total (d20 + bonus) and the DC when one was set. */
export interface CheckResult {
  skill: string;
  total: number;
  dc?: number;
}

/** Success when the total meets the DC; no verdict without a DC. */
export function checkSucceeded(check: CheckResult): boolean | undefined {
  return check.dc === undefined ? undefined : check.total >= check.dc;
}

/** The action as used with this check: its log line carries the result. */
export function withCheckResult(
  action: ResolvedAction,
  roll: { skill: string; face: number; bonus: number },
  dc?: number
): ResolvedAction {
  return {
    ...action,
    checkResult: {
      skill: roll.skill,
      total: roll.face + roll.bonus,
      ...(dc !== undefined ? { dc } : {}),
    },
  };
}
