/**
 * H9 — Arcane Recovery (Wizard L1) cap formula.
 *
 * Verified against the official IT SRD 5.2.1 (page 60, the authoritative
 * source per domain rule D2) and cross-checked against
 * http://dnd2024.wikidot.com/wizard:main#Arcane-Recovery. Both sources agree:
 *
 *   "When you finish a Short Rest, you can choose expended spell slots to
 *   recover. The slots can have a combined level equal to no more than half
 *   your wizard level (rounded UP), and none of the slots can be 6th level
 *   or higher. … Once you use this feature, you can't do so again until you
 *   finish a Long Rest."
 *
 * The official IT example (page 60) — "se il mago è di 4º livello, può
 * recuperare un massimo di due livelli di slot" — pins the rounding direction
 * for L4 (⌈4/2⌉ = 2) and confirms slot-levels add up (one 2nd OR two 1sts).
 *
 * Pure formula helpers — no auto-restoration; the UI presents the cap and
 * lets the player pick which slots to refill (golden rule 21 — the app never auto-decides).
 */

/** Maximum combined slot levels the wizard can recover (⌈level / 2⌉). */
export function arcaneRecoveryCap(wizardLevel: number): number {
  if (wizardLevel < 1) return 0;
  return Math.ceil(wizardLevel / 2);
}

/** Highest single-slot level eligible for Arcane Recovery. RAW: 5. */
export const ARCANE_RECOVERY_MAX_SLOT_LEVEL = 5;

/**
 * Check whether a candidate restoration plan (a list of slot-levels the
 * player wants to recover) is RAW-legal:
 *  - every slot level ≤ 5
 *  - sum of slot levels ≤ ⌈wizard level / 2⌉
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }` so the UI can render a
 * helpful "you can recover X more slot-levels" hint.
 */
export function validateArcaneRecoveryPlan(
  wizardLevel: number,
  slotLevels: ReadonlyArray<number>
): { ok: true; usedLevels: number; cap: number } | { ok: false; reason: string } {
  const cap = arcaneRecoveryCap(wizardLevel);
  for (const lv of slotLevels) {
    if (lv < 1) return { ok: false, reason: `Slot level must be ≥ 1 (got ${lv})` };
    if (lv > ARCANE_RECOVERY_MAX_SLOT_LEVEL)
      return {
        ok: false,
        reason: `Slot level ${lv} is above the Arcane Recovery cap of ${ARCANE_RECOVERY_MAX_SLOT_LEVEL}`,
      };
  }
  const sum = slotLevels.reduce((a, b) => a + b, 0);
  if (sum > cap)
    return {
      ok: false,
      reason: `Total slot-levels ${sum} exceeds the cap of ${cap}`,
    };
  return { ok: true, usedLevels: sum, cap };
}
