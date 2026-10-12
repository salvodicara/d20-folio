/**
 * Experience points (SRD 5.2.1, "Character Advancement"). XP is optional: a table
 * that levels by milestone never sets it, and nothing reads it as a gate — it only
 * tells the player when the next level is due. Pure and Firebase-free.
 */

/** XP needed to reach each level; index 0 is level 1. */
const XP_TO_REACH_LEVEL: readonly number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000,
  140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export interface XpProgress {
  /** XP at which the current level starts. */
  readonly floor: number;
  /** XP that reaches the next level; `null` at level 20. */
  readonly next: number | null;
  /** How far from `floor` to `next`, clamped to [0, 1]; 1 at level 20. */
  readonly fraction: number;
  /** The next level's threshold is reached. Never levels anything by itself. */
  readonly canLevelUp: boolean;
}

/** Where `xp` stands within `level` (the character's total level, 1–20). */
export function xpProgress(xp: number, level: number): XpProgress {
  const index = Math.min(Math.max(Math.trunc(level), 1), 20) - 1;
  const floor = XP_TO_REACH_LEVEL[index] ?? 0;
  const next = XP_TO_REACH_LEVEL[index + 1] ?? null;
  if (next === null) return { floor, next, fraction: 1, canLevelUp: false };
  const fraction = Math.min(Math.max((xp - floor) / (next - floor), 0), 1);
  return { floor, next, fraction, canLevelUp: xp >= next };
}

/** A storable XP total: a whole, non-negative number. */
export function isExperiencePoints(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
