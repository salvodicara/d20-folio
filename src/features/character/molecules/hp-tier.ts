/**
 * HP tier — the single-source HP-state threshold, pure + dependency-free.
 *
 * Extracted from `use-hp-controls` (which imports the character store → the whole
 * SRD engine) so the roster card can colour its HP bar WITHOUT dragging the store
 * + engine onto the eager landing bundle (#59/#78). `use-hp-controls` re-exports
 * it, so existing imports are unaffected — one source.
 */
export type HpStateValue = "healthy" | "wounded" | "critical" | "down";

/** HP state thresholds — shared with the §22/§24 bar recipe. */
export function hpState(current: number, max: number): HpStateValue {
  if (current <= 0) return "down";
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.6) return "healthy";
  if (pct > 0.25) return "wounded";
  return "critical";
}

/**
 * The qualitative HP BAND a player sees for an enemy whose exact HP the DM keeps
 * concealed (CARD-5). Distinct, coarser tiers than {@link hpState} so the number is
 * never inferable: `bloodied` is the official 2024 keyword (at or below HALF max);
 * `nearDeath` is the dire band (≤ a quarter). Down = no HP left. Derived from
 * current/max — there is NO stored band.
 */
export type HpBandValue = "healthy" | "bloodied" | "nearDeath" | "down";

export function hpBand(current: number, max: number): HpBandValue {
  if (current <= 0) return "down";
  const pct = max > 0 ? current / max : 0;
  if (pct <= 0.25) return "nearDeath";
  if (pct <= 0.5) return "bloodied";
  return "healthy";
}

/** Map a concealed band to the §22/§24 bar `data-state` so the band bar reuses the
 *  exact-HP bar colours (one bar recipe, no parallel palette). */
export function bandHpState(band: HpBandValue): HpStateValue {
  switch (band) {
    case "healthy":
      return "healthy";
    case "bloodied":
      return "wounded";
    case "nearDeath":
      return "critical";
    case "down":
      return "down";
  }
}

/** The bar fill % a concealed band SNAPS to — the band's upper bound, never the exact
 *  ratio (so the number stays hidden). */
export function bandFillPct(band: HpBandValue): number {
  switch (band) {
    case "healthy":
      return 100;
    case "bloodied":
      return 50;
    case "nearDeath":
      return 25;
    case "down":
      return 0;
  }
}
