/**
 * The ability score bonus CHOICE — the 2024 background increase ("+2 to one
 * and +1 to another, or +1 to all three"), and the cap that keeps any increase
 * from lifting a score past 20. The creation draft reads it today; level-up can
 * reuse the same pieces.
 *
 * Pure module — no React, no locale reads.
 */
import type { AbilityCode } from "@/data/types";

/** The two ways to spend the background increase. */
export type AbilityScoreBonusMode = "+2/+1" | "+1/+1/+1";

/** The chosen bonus per ability (absent = no bonus). */
export type AbilityScoreBonuses = Partial<Record<AbilityCode, number>>;

/** The highest a score can be raised to by an increase (the 2024 cap). */
export const ABILITY_SCORE_INCREASE_CAP = 20;

/** Is the bonus choice complete and legal for its mode? */
export function abilityScoreBonusChoiceIsValid(
  mode: AbilityScoreBonusMode,
  choices: AbilityScoreBonuses
): boolean {
  const entries = Object.entries(choices).filter(([, v]) => v && v > 0);
  if (mode === "+2/+1") {
    return (
      entries.length === 2 &&
      entries.some(([, v]) => v === 2) &&
      entries.some(([, v]) => v === 1)
    );
  }
  return entries.length === 3 && entries.every(([, v]) => v === 1);
}

/**
 * Toggle one ability in the bonus choice. In "+2/+1" the first pick takes the
 * +2 and the next the +1; a picked ability is removed; a full choice ignores a
 * third pick. In "+1/+1/+1" up to three abilities take +1. Returns `choices`
 * itself when nothing changes.
 */
export function toggleAbilityScoreBonus(
  mode: AbilityScoreBonusMode,
  choices: AbilityScoreBonuses,
  code: AbilityCode
): AbilityScoreBonuses {
  const current = choices[code];
  const withoutCode: AbilityScoreBonuses = Object.fromEntries(
    Object.entries(choices).filter(([k]) => k !== code)
  );
  if (mode === "+2/+1") {
    if (current != null) return withoutCode;
    const hasTwo = Object.values(choices).some((v) => v === 2);
    const hasOne = Object.values(choices).some((v) => v === 1);
    if (!hasTwo) return { ...choices, [code]: 2 };
    if (!hasOne) return { ...choices, [code]: 1 };
    return choices;
  }
  if (current === 1) return withoutCode;
  if (Object.keys(choices).length >= 3) return choices;
  return { ...choices, [code]: 1 };
}

/**
 * Base scores plus the bonuses. An increase can raise a score TO 20 but never
 * past it (a base 19 receiving +2 lands on 20, not 21).
 */
export function effectiveAbilityScores(
  base: Record<AbilityCode, number>,
  bonuses: AbilityScoreBonuses
): Record<AbilityCode, number> {
  const result = { ...base };
  for (const [code, bonus] of Object.entries(bonuses)) {
    if (bonus)
      result[code as AbilityCode] = Math.min(
        ABILITY_SCORE_INCREASE_CAP,
        result[code as AbilityCode] + bonus
      );
  }
  return result;
}
