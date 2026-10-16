/**
 * Falling (SRD 5.2.1 Rules Glossary): 1d6 Bludgeoning damage for every 10 feet
 * fallen, to a maximum of 20d6, and the creature lands Prone unless it avoids
 * taking damage from the fall. The app never rolls: it names the dice, the player
 * enters the rolled total. Italian sheets measure in metres (3 m per 10 ft, the
 * same scale as `localeDistance`).
 */
import type { DamageType } from "@/types/damage";

export const FALL_DAMAGE_TYPE: DamageType = "bludgeoning";
const MAX_FALL_DICE = 20;
const FEET_PER_DIE = 10;
const METRES_PER_DIE = 3;

/** The number of d6 a fall of `distance` (in feet or metres) deals. */
export function fallDamageDice(distance: number, unit: "ft" | "m"): number {
  const perDie = unit === "ft" ? FEET_PER_DIE : METRES_PER_DIE;
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return Math.min(MAX_FALL_DICE, Math.floor(distance / perDie + 1e-9));
}

/** Landing Prone follows from taking damage from the fall. */
export function fallLandsProne(damageTaken: number): boolean {
  return damageTaken > 0;
}
