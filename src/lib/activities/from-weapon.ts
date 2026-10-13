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
  // "Versatile (1d10)": the die when the weapon is held in two hands.
  const versatile = properties.find((property) => /\bversatile\b/i.test(property));
  const twoHandedDie = versatile
    ? /Versatile\s*\(([^)]+)\)/i.exec(versatile)?.[1]
    : undefined;
  const activity: Activity = {
    id: `weapon:${weapon.id}`,
    source: { kind: "weapon", weaponId: weapon.id },
    cost: {
      economy: "action",
      ...(weapon.ammunitionId ? { ammunition: weapon.ammunitionId } : {}),
    },
    target,
    attack: {
      mode: ranged
        ? "ranged"
        : range.kind === "melee" && range.thrown
          ? "melee-or-ranged"
          : "melee",
      bonus: { kind: "weapon", weapon: weapon.id },
      ...(weapon.mastery ? { mastery: weapon.mastery } : {}),
    },
    effects: [
      {
        kind: "damage",
        dice: { dice: damage.die, plus: [{ kind: "attack-mod" }] },
        types: [damage.type],
        ...(twoHandedDie
          ? { twoHanded: { dice: twoHandedDie, plus: [{ kind: "attack-mod" as const }] } }
          : {}),
      },
    ],
  };
  const gaps: ActivityGap[] = [];
  if (versatile && !twoHandedDie) {
    gaps.push({
      field: "properties.versatile",
      reason: "a Versatile property without a printed two-handed die",
    });
  }
  return { activity, gaps };
}
