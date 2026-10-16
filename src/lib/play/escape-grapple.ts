/**
 * Escape a grapple (SRD 5.2.1 "Unarmed Strike"): a Grappled creature can use its
 * action to make a Strength (Athletics) or Dexterity (Acrobatics) check against the
 * grapple's escape DC, ending the condition on itself on a success. The player rolls
 * the d20 at the table and enters the face; the DM states the DC. Pure numbers.
 */

/** The base action that offers the check while the character is Grappled. */
export const ESCAPE_GRAPPLE_ACTION_ID = "base-escape-grapple";

/** The two skills the rule names, Athletics first (it wins a tie). */
export const ESCAPE_GRAPPLE_SKILLS = ["athletics", "acrobatics"] as const;

/** The skill a player would roll: the better bonus of the two. */
export function escapeGrappleSkill(bonusFor: (skillId: string) => number): {
  skill: (typeof ESCAPE_GRAPPLE_SKILLS)[number];
  bonus: number;
} {
  const [athletics, acrobatics] = ESCAPE_GRAPPLE_SKILLS;
  const a = bonusFor(athletics);
  const b = bonusFor(acrobatics);
  return b > a ? { skill: acrobatics, bonus: b } : { skill: athletics, bonus: a };
}

/** Judge the entered d20 face: a total that equals or exceeds the DC escapes. */
export function judgeEscapeGrapple(
  face: number,
  bonus: number,
  dc: number
): { total: number; escaped: boolean } {
  const total = face + bonus;
  return { total, escaped: total >= dc };
}
