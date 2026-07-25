/**
 * encounter-difficulty — the 2024-DMG XP-budget encounter difficulty calculator
 * (SRD 5.2.1 "Combat Encounter Difficulty", CC-BY-4.0).
 *
 * The 2024 procedure, verbatim: (Step 1) pick a difficulty — Low / Moderate /
 * High; (Step 2) cross-reference each character's level with the difficulty in the
 * XP Budget per Character table, and Σ over the party for the encounter budget;
 * (Step 3) spend the budget — deduct each creature's statblock XP, staying under
 * budget. There are NO encounter multipliers (the whole 2014→2024 delta: monster
 * cost is the PLAIN sum of statblock XP) and only THREE grades. Pinned by
 * `tests/unit/encounter-difficulty.test.ts` — all 60 table cells + the SRD's own
 * three worked examples.
 *
 * PURE: no React/store/Firebase/corpus/i18n (rides `pure-modules-guard`). Imports
 * nothing — types are declared inline. Localization of the verdict/labels happens
 * at the React edge via `t()` on the id-shaped verdict (no engine-side strings).
 */

/** The three 2024 encounter difficulty grades (SRD 5.2.1 "Combat Encounter Difficulty"). */
export type EncounterDifficulty = "low" | "moderate" | "high";

/** A party's XP budget at each difficulty (SRD Step 2). */
export interface XpBudget {
  low: number;
  moderate: number;
  high: number;
}

/** The verdict for a built encounter: the cheapest difficulty whose budget covers the
 *  monster XP sum, or "over" when it exceeds even the High budget (not an SRD grade —
 *  the honest out-of-table state). */
export type BudgetVerdict = EncounterDifficulty | "over";

/**
 * SRD 5.2.1 "XP Budget per Character" — index by character level 1–20. The values
 * ARE the SRD extract (§A.2, EN lines 20142–20166); the test file carries its own
 * literal transcription so the table cannot drift silently (mutation-proof).
 */
const XP_BUDGET_PER_CHARACTER: Readonly<Record<number, XpBudget>> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11700 },
  18: { low: 5000, moderate: 8700, high: 14200 },
  19: { low: 5500, moderate: 10700, high: 17200 },
  20: { low: 6400, moderate: 13200, high: 22000 },
};

/**
 * One character's budget row. Throws outside integer levels 1–20 (the `xpForCr`
 * posture: a level the schema can't produce is a bug, never a silent 0 — golden
 * rule 2, no unjustified fallback).
 */
export function xpBudgetForLevel(level: number): XpBudget {
  const row = Number.isInteger(level) ? XP_BUDGET_PER_CHARACTER[level] : undefined;
  if (row === undefined)
    throw new Error(`[encounter-difficulty] no XP budget for level ${level}`);
  return row;
}

/**
 * The party's XP budget (SRD Step 2), summed PER CHARACTER at each character's OWN
 * level — the generalization every 2024 tool uses for mixed-level parties (§A.5): a
 * uniform party degenerates to the SRD's `table[level][difficulty] × count`.
 * Returns `null` for an empty party (no characters → no budget, never a zero budget).
 */
export function partyXpBudget(levels: ReadonlyArray<number>): XpBudget | null {
  if (levels.length === 0) return null;
  const total: XpBudget = { low: 0, moderate: 0, high: 0 };
  for (const level of levels) {
    const row = xpBudgetForLevel(level);
    total.low += row.low;
    total.moderate += row.moderate;
    total.high += row.high;
  }
  return total;
}

/**
 * SRD Step 3 over the encounter's monster groups: Σ (xp × count) for groups that
 * carry an XP value, plus the count of groups that don't (un-costed — a custom
 * monster with no CR, a pre-picker doc). Membership is EXISTENCE-based, never
 * truthy: a genuine harmless "XP 0" monster (seahorse, shrieker fungus) IS costed
 * (it contributes 0), never mis-counted as un-costed.
 */
export function encounterXpCost(groups: ReadonlyArray<{ xp?: number; count: number }>): {
  costedXp: number;
  uncostedGroups: number;
} {
  let costedXp = 0;
  let uncostedGroups = 0;
  for (const g of groups) {
    if (g.xp != null && Number.isFinite(g.xp)) costedXp += g.xp * g.count;
    else uncostedGroups += 1;
  }
  return { costedXp, uncostedGroups };
}

/**
 * The verdict: the cheapest budget grade that still COVERS the cost —
 * costedXp ≤ low → "low"; ≤ moderate → "moderate"; ≤ high → "high"; else "over".
 * (SRD: an encounter "spends up to" a budget without going over, so a sum is graded
 * by the cheapest budget that still covers it; the SRD has no below-Low grade — a
 * lone weak monster IS a Low encounter. Spending the whole budget EXACTLY is that
 * difficulty.)
 */
export function budgetVerdict(costedXp: number, budget: XpBudget): BudgetVerdict {
  if (costedXp <= budget.low) return "low";
  if (costedXp <= budget.moderate) return "moderate";
  if (costedXp <= budget.high) return "high";
  return "over";
}
