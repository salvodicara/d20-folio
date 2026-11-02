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

export interface ArcaneRecoveryPick {
  cap: number;
  /** Slot levels still free to recover after the picks. */
  remaining: number;
  /** Each expended slot level up to 5th, lowest first, with how many may be picked. */
  rows: { level: number; expended: number; count: number; max: number }[];
  /** The picks flattened (one 2nd + one 1st = [1, 2]). */
  slotLevels: number[];
}

/**
 * The Arcane Recovery picker: which expended slots can be recovered and how many of
 * each still fit the ⌈level/2⌉ budget given the counts already picked.
 */
export function arcaneRecoveryPicker(
  wizardLevel: number,
  expended: ReadonlyArray<{ level: number; expended: number }>,
  counts: Readonly<Record<number, number>>
): ArcaneRecoveryPick {
  const cap = arcaneRecoveryCap(wizardLevel);
  const eligible = expended
    .filter((e) => e.expended > 0 && e.level <= ARCANE_RECOVERY_MAX_SLOT_LEVEL)
    .sort((a, b) => a.level - b.level);
  const used = eligible.reduce((sum, e) => sum + e.level * (counts[e.level] ?? 0), 0);
  const remaining = cap - used;
  const rows = eligible.map((e) => {
    const count = counts[e.level] ?? 0;
    const fits = Math.floor(remaining / e.level) + count;
    return { ...e, count, max: Math.max(count, Math.min(e.expended, fits)) };
  });
  return {
    cap,
    remaining,
    rows,
    slotLevels: rows.flatMap((r) => Array.from({ length: r.count }, () => r.level)),
  };
}
