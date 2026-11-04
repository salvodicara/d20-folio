/**
 * Ammunition (SRD 5.2.1 weapon property): after a fight, a minute spent searching
 * the battlefield recovers half the ammunition used, rounded down.
 */
export function recoveredAmmunition(spent: number): number {
  if (!Number.isFinite(spent) || spent <= 0) return 0;
  return Math.floor(spent / 2);
}
