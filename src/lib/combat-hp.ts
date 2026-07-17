/**
 * Combat HP math — the ONE home for hit-point arithmetic.
 *
 * Pure, zero-IO functions that mirror the HP rules exactly (temp-HP absorbs
 * first, damage floors at 0, healing/absolute-set clamp to the effective max).
 * Both the cockpit sheet (`characterStore`) AND the in-hub encounter row resolve
 * their HP changes through THESE functions, so a hit point can never clamp one
 * way in one surface and another way in another (single source of truth).
 *
 * These functions do the ARITHMETIC only — the side effects that wrap an HP
 * change (concentration save, death-save reset, log events, undo) stay in the
 * store/feature layer. Callers pass already-resolved integers (incoming amount,
 * current/temp HP, and the effective max from `effectiveMaxHp`).
 */

export interface HpAfterDamage {
  readonly current: number;
  readonly temp: number;
}

/**
 * Apply `amount` damage. Temporary HP absorbs first; any remainder reduces
 * current HP, which floors at 0 (a reduction can never push current above its
 * existing value, so no upper clamp is needed here).
 */
export function applyDamage(
  current: number,
  temp: number,
  amount: number
): HpAfterDamage {
  const newTemp = Math.max(0, temp - amount);
  const remainder = Math.max(0, amount - temp);
  const newCurrent = Math.max(0, current - remainder);
  return { current: newCurrent, temp: newTemp };
}

/** Heal `amount`, clamping the result up to (never past) `max`. */
export function applyHealing(current: number, amount: number, max: number): number {
  return Math.min(max, current + Math.max(0, amount));
}

/** Clamp an ABSOLUTE hit-point value into `[0, max]` (used by a direct set). */
export function clampHp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/** Clamp a temporary-HP value to a non-negative floor of 0. */
export function clampTemp(value: number): number {
  return Math.max(0, value);
}
