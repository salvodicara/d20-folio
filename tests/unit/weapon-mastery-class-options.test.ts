/**
 * Weapon Mastery offers only the weapons the class's own text allows (SRD 5.2.1):
 * - Barbarian: «two kinds of Simple or Martial Melee weapons of your choice»;
 * - Rogue, Paladin, Ranger: «two kinds of weapons of your choice with which you
 *   have proficiency» (a Rogue: Simple weapons, and Martial weapons with Finesse or
 *   Light);
 * - Fighter: «three kinds of Simple or Martial weapons».
 * The same list feeds creation, the level-up asks and the owed-pick catch-up.
 */
import { describe, expect, it } from "vitest";

import { classChoiceOptions } from "@/lib/creation/class-choices";
import { weaponMasteryOptions } from "@/lib/views/level-up-view";
import { listMasterableWeapons } from "@/lib/weapon-mastery-pick";

const ids = (classId: string) => listMasterableWeapons(classId).map((w) => w.id);

describe("the masterable weapons each class may pick", () => {
  it("Barbarian: melee weapons only", () => {
    const barbarian = ids("barbarian");
    expect(barbarian).toEqual(expect.arrayContaining(["greataxe", "handaxe", "maul"]));
    for (const ranged of ["dart", "blowgun", "longbow", "shortbow", "light-crossbow"]) {
      expect(barbarian).not.toContain(ranged);
    }
  });

  it("Rogue: Simple weapons and Martial weapons with Finesse or Light", () => {
    const rogue = ids("rogue");
    expect(rogue).toEqual(
      expect.arrayContaining(["dagger", "rapier", "shortsword", "shortbow", "scimitar"])
    );
    for (const heavy of ["greatsword", "greataxe", "longbow", "halberd", "maul"]) {
      expect(rogue).not.toContain(heavy);
    }
  });

  it("Fighter: every Simple or Martial masterable weapon", () => {
    expect(ids("fighter")).toEqual(listMasterableWeapons().map((w) => w.id));
  });

  it("creation and level-up offer the class's list", () => {
    expect(classChoiceOptions("barbarian", 1, []).weaponMasteries).not.toContain(
      "longbow"
    );
    expect(weaponMasteryOptions("en", "barbarian").map((o) => o.id)).not.toContain(
      "dart"
    );
    expect(weaponMasteryOptions("en", "rogue").map((o) => o.id)).not.toContain(
      "greatsword"
    );
  });
});
