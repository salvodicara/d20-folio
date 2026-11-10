/**
 * An improvised weapon (SRD 5.2.1 Improvised Weapons): 1d4 damage of a type the DM
 * picks, thrown at 20/60 ft, and no Proficiency Bonus unless the character has
 * proficiency with improvised weapons. Strength drives it, melee or thrown.
 */
import { describe, expect, it } from "vitest";
import { improvisedWeaponAttack } from "@/lib/play/improvised-weapon";

describe("improvisedWeaponAttack", () => {
  it("STR 16 at level 5, not proficient: +3 to hit, 1d4 + 3", () => {
    expect(improvisedWeaponAttack({ str: 16, level: 5, proficient: false })).toEqual({
      attackBonus: 3,
      damageDice: "1d4",
      damageBonus: 3,
      thrownFt: { normal: 20, long: 60 },
    });
  });

  it("proficient with improvised weapons adds the Proficiency Bonus", () => {
    expect(
      improvisedWeaponAttack({ str: 16, level: 5, proficient: true }).attackBonus
    ).toBe(6);
  });

  it("Exhaustion lowers the attack roll", () => {
    expect(
      improvisedWeaponAttack({ str: 10, level: 1, proficient: false, exhaustion: 2 })
        .attackBonus
    ).toBe(-4);
  });
});
