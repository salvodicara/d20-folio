/**
 * The qualitative HP BAND a player sees for an enemy whose exact HP the DM keeps
 * concealed (CARD-5). Coarser than the card's exact-HP tiers (`hpState`) so the number is
 * never inferable: `bloodied` is the official 2024 keyword (at or below HALF max);
 * `nearDeath` is the dire band (≤ a quarter). Down = no HP left. Derived from
 * current/max — there is NO stored band.
 */
export type HpBandValue = "healthy" | "bloodied" | "nearDeath" | "down";

export function hpBand(current: number, max: number): HpBandValue {
  if (current <= 0) return "down";
  const pct = max > 0 ? current / max : 0;
  if (pct <= 0.25) return "nearDeath";
  // The one Bloodied rule (at or below half, above 0), shared with the sheet.
  if (bloodiedFromHp(current, max)) return "bloodied";
  return "healthy";
}

/**
 * The ONE Bloodied arithmetic (rule 6 — single source of truth): a character is
 * Bloodied iff `0 < currentHp ≤ ⌊effectiveMax / 2⌋` (2024 RAW). HP only — NOT
 * temporary HP. A degenerate `effectiveMax ≤ 0` is never Bloodied (the `> 0` band
 * test fails), and a character at 0 HP is DYING/unconscious — NOT Bloodied (the
 * dying surface owns the ≤ 0 band). BOTH the engine predicate `isBloodied`
 * (smart-tracker.ts) and the UI hook's `bloodied` mark (use-hp-controls.ts) call
 * THIS function over the EFFECTIVE max they already have in scope, so the two
 * derivations can never drift. Pure arithmetic — pass the already-resolved
 * effective max (via {@link effectiveMaxHp}) so callers share one max source too.
 */
export function bloodiedFromHp(currentHp: number, effectiveMax: number): boolean {
  return currentHp > 0 && currentHp <= Math.floor(effectiveMax / 2);
}
