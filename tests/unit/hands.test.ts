/**
 * Free hands for a spell's components (2024: Somatic needs a free hand; Material
 * needs one to reach the components or focus, which may be the same hand). Hands
 * are derived from play: an equipped Shield, the weapon last attacked with this
 * fight. A table override wins. A warning only: the player can always cast.
 */
import { describe, expect, it } from "vitest";

import {
  castHandsWarning,
  freeHands,
  weaponHands,
  type HandsFacts,
} from "@/lib/play/hands";

const swordAndBoard: HandsFacts = { shield: "plain", heldWeaponHands: 1, inCombat: true };
const VS = { v: true, s: true, m: false };
const VSM = { v: true, s: true, m: true };
const V = { v: true, s: false, m: false };

describe("weaponHands", () => {
  it("a Two-Handed weapon takes both hands, a Versatile one both only when gripped so", () => {
    expect(weaponHands(["Heavy", "Two-Handed"], false)).toBe(2);
    expect(weaponHands(["Versatile (1d10)"], false)).toBe(1);
    expect(weaponHands(["Versatile (1d10)"], true)).toBe(2);
    expect(weaponHands(["Finesse", "Light"], false)).toBe(1);
  });
});

describe("freeHands", () => {
  it("a Shield and a sword leave none", () => {
    expect(freeHands(swordAndBoard)).toBe(0);
  });
  it("a sword alone leaves one; a greatsword none", () => {
    expect(freeHands({ shield: "none", heldWeaponHands: 1, inCombat: true })).toBe(1);
    expect(freeHands({ shield: "none", heldWeaponHands: 2, inCombat: true })).toBe(0);
  });
  it("out of combat both hands count as free", () => {
    expect(freeHands({ ...swordAndBoard, inCombat: false })).toBe(2);
  });
  it("the table's override wins", () => {
    expect(freeHands({ ...swordAndBoard, override: 1 })).toBe(1);
    expect(freeHands({ ...swordAndBoard, inCombat: false, override: 0 })).toBe(0);
  });
});

describe("castHandsWarning", () => {
  it("sword and Shield: a Somatic spell warns, and stowing the sword would free a hand", () => {
    expect(castHandsWarning(VS, swordAndBoard)).toEqual({
      kind: "no-free-hand",
      stow: true,
    });
  });
  it("a Verbal-only spell never warns", () => {
    expect(castHandsWarning(V, swordAndBoard)).toBeNull();
  });
  it("one free hand covers Somatic and Material together", () => {
    expect(castHandsWarning(VSM, { ...swordAndBoard, shield: "none" })).toBeNull();
  });
  it("War Caster performs Somatic components with full hands, not Material ones", () => {
    expect(castHandsWarning(VS, swordAndBoard, { warCaster: true })).toBeNull();
    expect(castHandsWarning(VSM, swordAndBoard, { warCaster: true })).toEqual({
      kind: "no-free-hand",
      stow: true,
    });
  });
  it("a holy symbol on the Shield covers a Material spell, and its Somatic part", () => {
    const cleric: HandsFacts = { ...swordAndBoard, shield: "holy-symbol" };
    expect(castHandsWarning(VSM, cleric)).toBeNull();
    expect(castHandsWarning({ v: true, s: false, m: true }, cleric)).toBeNull();
    expect(castHandsWarning(VS, cleric)).toEqual({ kind: "no-free-hand", stow: true });
  });
  it("with no weapon held there is nothing to stow", () => {
    expect(
      castHandsWarning(VS, {
        shield: "plain",
        heldWeaponHands: 0,
        inCombat: true,
        override: 0,
      })
    ).toEqual({ kind: "no-free-hand", stow: false });
  });
  it("out of combat nothing warns", () => {
    expect(castHandsWarning(VSM, { ...swordAndBoard, inCombat: false })).toBeNull();
  });
});
