/**
 * An object as a target (SRD 5.2.1 "Object"; edge-case M1, «Objects in the area»):
 * immune to Poison and Psychic damage, failing every save, HP from the DM, never
 * below 0. Engine-ready: the conformance case stays pending until the damage tray can
 * name an object (owner-gated control).
 */
import { describe, expect, it } from "vitest";

import { objectAfterDamage, objectSaveOutcome, objectTarget } from "@/lib/object-targets";

const door = () => objectTarget({ name: "Wooden door", armorClass: 15, maxHp: 18 });

describe("an object as a target", () => {
  it("takes Fire in full and nothing from Poison or Psychic", () => {
    const { target, intake } = objectAfterDamage(door(), [
      { amount: 10, type: "fire" },
      { amount: 7, type: "poison" },
      { amount: 4, type: "psychic" },
    ]);
    expect(intake.netTotal).toBe(10);
    expect(target.hp.current).toBe(8);
  });

  it("fails every saving throw, so an area's save-for-half never halves it", () => {
    expect(objectSaveOutcome()).toBe("failed-save");
  });

  it("its HP stop at 0", () => {
    const { target } = objectAfterDamage(door(), [{ amount: 40, type: "bludgeoning" }]);
    expect(target.hp.current).toBe(0);
  });

  it("the material's resistance, as the DM rules it, halves that type", () => {
    const stone = objectTarget({
      name: "Stone wall",
      armorClass: 17,
      maxHp: 27,
      resistances: ["slashing"],
    });
    expect(
      objectAfterDamage(stone, [{ amount: 9, type: "slashing" }]).intake.netTotal
    ).toBe(4);
  });

  it("current HP the DM enters stay within 0 and the maximum", () => {
    expect(
      objectTarget({ name: "Chest", armorClass: 15, maxHp: 10, currentHp: 25 }).hp
    ).toEqual({
      current: 10,
      max: 10,
    });
  });
});
