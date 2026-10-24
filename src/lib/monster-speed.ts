/**
 * monster-speed — an encounter monster's walking speed: the DM's optional
 * override (`EncounterMonster.speed`, e.g. after the Slow weapon mastery) or else
 * the stat block's printed walking speed. Pure and corpus-free: the caller passes
 * the stat block's `speeds.walk` it already resolved.
 */

/** The largest walking speed (feet) an encounter monster may store. The fastest SRD
 *  walker prints well under this; the cap only bounds a corrupt or mistyped value. */
export const MONSTER_SPEED_MAX_FT = 300;

/** A storable walking speed: a whole, non-negative number of feet up to the cap. */
export function isMonsterSpeedFt(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MONSTER_SPEED_MAX_FT
  );
}

/** A DM-entered speed as a storable value: rounded to whole feet and clamped to
 *  `[0, MONSTER_SPEED_MAX_FT]`; `null` for a non-finite entry. */
export function clampMonsterSpeedFt(feet: number): number | null {
  if (!Number.isFinite(feet)) return null;
  return Math.min(MONSTER_SPEED_MAX_FT, Math.max(0, Math.round(feet)));
}

/** The speed to show: the override when present (0 included), else the stat
 *  block's walking speed, else `null` (a hand-typed monster with no stat block). */
export function monsterWalkingSpeedFt(
  override: number | undefined,
  statBlockWalkFt: number | undefined
): number | null {
  return override ?? statBlockWalkFt ?? null;
}
