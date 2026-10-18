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
  if (pct <= 0.5) return "bloodied";
  return "healthy";
}
