/** Catalogue weapons → Activity: an attack with the weapon, as the Attack action makes it. */
import type { SrdEquipmentData } from "@/data/types";
import { buildWeaponRange } from "@/lib/weapon-range";
import type { Activity, ActivityGap, ActivityTarget, ActivityTranslation } from "./types";

/**
 * One weapon's attack. The attack and damage add the attack ability's modifier
 * (`attack-mod`), which the reader picks from the character (Finesse, ranged).
 * `undefined` for an entry that is not a weapon with damage.
 */
export function translateWeapon(
  weapon: SrdEquipmentData
): ActivityTranslation | undefined {
  const damage = weapon.damage;
  if (weapon.category !== "weapon" || !damage) return undefined;
  const properties = weapon.properties ?? [];
  const ranged = weapon.weaponType === "ranged";
  const range = buildWeaponRange(properties, { isRanged: ranged });
  const target: ActivityTarget =
    range.kind === "ranged"
      ? { rangeFt: { near: range.nearFt, far: range.farFt } }
      : {
          reachFt: range.reachFt,
          ...(range.thrown
            ? { rangeFt: { near: range.thrown.nearFt, far: range.thrown.farFt } }
            : {}),
        };
  const activity: Activity = {
    id: `weapon:${weapon.id}`,
    source: { kind: "weapon", weaponId: weapon.id },
    cost: { economy: "action" },
    target,
    attack: {
      mode: ranged
        ? "ranged"
        : range.kind === "melee" && range.thrown
          ? "melee-or-ranged"
          : "melee",
      bonus: { kind: "weapon", weapon: weapon.id },
    },
    effects: [
      {
        kind: "damage",
        dice: { dice: damage.die, plus: [{ kind: "attack-mod" }] },
        types: [damage.type],
      },
    ],
  };
  const gaps: ActivityGap[] = [];
  if (weapon.mastery) {
    gaps.push({
      field: "mastery",
      reason:
        "a Weapon Mastery property (its effect is a rule the table applies, not an effect here yet)",
    });
  }
  const versatile = properties.find((property) => /\bversatile\b/i.test(property));
  if (versatile) {
    gaps.push({
      field: "properties.versatile",
      reason: "the two-handed die is an alternative damage the Activity cannot hold yet",
    });
  }
  if (weapon.ammunitionId) {
    gaps.push({
      field: "ammunitionId",
      reason:
        "the ammunition each attack uses is spent by the inventory, not declared as a cost yet",
    });
  }
  return { activity, gaps };
}
