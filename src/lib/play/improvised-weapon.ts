/**
 * An improvised weapon (SRD 5.2.1 Improvised Weapons), headless: 1d4 damage of a
 * type the DM picks, thrown at 20/60 ft, and the Proficiency Bonus only with
 * proficiency in improvised weapons. Strength drives it, melee or thrown. An object
 * that resembles a weapon may be treated as that weapon: the DM's call, the
 * weapon's own card.
 */
import { abilityModifier } from "@/lib/ability";
import { weaponAttackBonus, type Exhaustion } from "@/lib/compute";

export interface ImprovisedWeaponAttack {
  attackBonus: number;
  damageDice: "1d4";
  damageBonus: number;
  thrownFt: { normal: 20; long: 60 };
}

export function improvisedWeaponAttack(args: {
  str: number;
  level: number;
  /** Proficiency with improvised weapons (`improvised-weapons`). */
  proficient: boolean;
  exhaustion?: Exhaustion;
  pbOverride?: number | null;
}): ImprovisedWeaponAttack {
  return {
    attackBonus: weaponAttackBonus(
      args.level,
      args.str,
      args.proficient,
      null,
      args.exhaustion ?? 0,
      args.pbOverride
    ),
    damageDice: "1d4",
    damageBonus: abilityModifier(args.str),
    thrownFt: { normal: 20, long: 60 },
  };
}
