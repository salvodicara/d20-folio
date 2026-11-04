/**
 * Free hands for a spell's components (2024: Somatic needs a free hand; Material
 * needs one to reach the components or focus, which may be the same hand). Hands
 * are a standing fact derived from play: an equipped Shield, the weapon last
 * attacked with (until a rest, time passing, or an object interaction). A table
 * override wins. A warning only: the player can always cast.
 */
import { describe, expect, it } from "vitest";

import {
  castHandsWarning,
  freeHands,
  heldWeapon,
  weaponHands,
  type HandsFacts,
} from "@/lib/play/hands";
import { srdText } from "@/lib/loc-text";
import type { CombatEvent } from "@/types/combat-log";
import type { LogEntry } from "@/types/character";

const swordAndBoard: HandsFacts = { shield: true, focus: "none", heldWeaponHands: 1 };
const VS = { v: true, s: true, m: false };
const VSM = { v: true, s: true, m: true };
const VM = { v: true, s: false, m: true };
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
    expect(freeHands({ ...swordAndBoard, shield: false })).toBe(1);
    expect(freeHands({ shield: false, focus: "none", heldWeaponHands: 2 })).toBe(0);
  });
  it("the table's override wins", () => {
    expect(freeHands({ ...swordAndBoard, override: 1 })).toBe(1);
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
    expect(castHandsWarning(VSM, { ...swordAndBoard, shield: false })).toBeNull();
  });
  it("War Caster performs Somatic components with full hands, not Material ones", () => {
    expect(castHandsWarning(VS, swordAndBoard, { warCaster: true })).toBeNull();
    expect(castHandsWarning(VSM, swordAndBoard, { warCaster: true })).toEqual({
      kind: "no-free-hand",
      stow: true,
    });
  });
  it("a holy symbol on the Shield covers a Material spell, and its Somatic part", () => {
    const paladin: HandsFacts = { ...swordAndBoard, focus: "shield" };
    expect(castHandsWarning(VSM, paladin)).toBeNull();
    expect(castHandsWarning(VM, paladin)).toBeNull();
    expect(castHandsWarning(VS, paladin)).toEqual({ kind: "no-free-hand", stow: true });
  });
  it("a holy symbol worn visibly covers the Material component, never the Somatic one", () => {
    const worn: HandsFacts = { shield: false, focus: "worn", heldWeaponHands: 2 };
    expect(castHandsWarning(VM, worn)).toBeNull();
    expect(castHandsWarning(VSM, worn)).toEqual({ kind: "no-free-hand", stow: true });
    expect(castHandsWarning(VSM, worn, { warCaster: true })).toBeNull();
  });
  it("with no weapon held there is nothing to stow", () => {
    expect(
      castHandsWarning(VS, {
        shield: true,
        focus: "none",
        heldWeaponHands: 0,
        override: 0,
      })
    ).toEqual({ kind: "no-free-hand", stow: false });
  });
});

describe("heldWeapon", () => {
  let n = 0;
  const entry = (event: CombatEvent): LogEntry => ({
    event,
    ts: ++n,
    id: `e${String(n)}`,
  });
  const swing = (key: string) =>
    entry({
      kind: "action-use",
      action: srdText("equipment", key, "name"),
      effect: "attack",
      slot: "action",
    });

  it("is the weapon last attacked with", () => {
    expect(heldWeapon([swing("longsword"), swing("greatsword")])).toEqual({
      weaponId: "greatsword",
      hands: 2,
    });
  });
  it("is nothing after a rest, time passing, or an object interaction", () => {
    expect(
      heldWeapon([swing("longsword"), entry({ kind: "rest", restKind: "short" })])
    ).toBeNull();
    expect(
      heldWeapon([swing("longsword"), entry({ kind: "time-passes", minutes: 10 })])
    ).toBeNull();
    const stow = entry({
      kind: "action-use",
      action: srdText("rule", "action.object-interaction", "name"),
      effect: "generic",
      slot: "free",
    });
    expect(heldWeapon([swing("longsword"), stow])).toBeNull();
  });
  it("ignores what is not a weapon", () => {
    const potion = entry({
      kind: "action-use",
      action: srdText("equipment", "potion-of-healing", "name"),
      effect: "heal",
      slot: "bonus",
    });
    expect(heldWeapon([swing("dagger"), potion])).toEqual({
      weaponId: "dagger",
      hands: 1,
    });
    expect(heldWeapon([])).toBeNull();
  });
});
