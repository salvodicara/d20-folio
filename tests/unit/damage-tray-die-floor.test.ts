/**
 * Damage dice entered by hand, with a floor on low faces (edge-case family M4):
 * Great Weapon Fighting treats a 1 or a 2 on a damage die as a 3 (two-handed melee),
 * Elemental Adept a 1 as a 2. The engine never rolls; it totals the faces typed.
 *
 * Corpus: Physical dice entered by hand (SAC #61).
 */
import { describe, expect, it } from "vitest";

import { applyDieFaceFloor, damageTrayPlan } from "@/lib/play/damage-tray";
import { localizeActions } from "@/lib/views/combat-action-view";

import { makeCharacterDoc } from "./_helpers";

const GWF = { floorBelow: 2, floorTo: 3 };

describe("faces with a floor", () => {
  it("Great Weapon Fighting: [1, 2] on 2d6 is 3 + 3", () => {
    expect(applyDieFaceFloor([1, 2], GWF)).toBe(6);
  });

  it("faces above the floor count as rolled", () => {
    expect(applyDieFaceFloor([4, 6, 2], GWF)).toBe(13);
  });

  it("without a floor the faces just add up", () => {
    expect(applyDieFaceFloor([1, 2])).toBe(3);
  });

  it("a face outside a die is not trusted: it counts as nothing", () => {
    expect(applyDieFaceFloor([0, -2, 5], GWF)).toBe(5);
  });
});

describe("the tray knows a weapon's floor", () => {
  it("a greatsword with Great Weapon Fighting carries it", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 3,
      weapons: [{ srdId: "greatsword", quantity: 1 }],
      features: [{ srdId: "great-weapon-fighting" }],
    });
    const sword = localizeActions(doc, "en").find((a) => a.id === "weapon-greatsword");
    if (!sword) throw new Error("no greatsword row");
    // The weapon's dice and flat bonus ride along, so a screen can split a typed
    // total: 2d6 + STR (+3 at 16).
    expect(damageTrayPlan(sword, ["monster-1"], "pc-me")?.dieFloor).toEqual({
      ...GWF,
      dice: "2d6",
      bonus: sword.summary.weaponParts?.damageMod,
    });
    expect(sword.summary.weaponParts?.damageMod).toBeTypeOf("number");
  });
});
