/**
 * Unit tests for Weapon Mastery picker helpers (M1).
 */

import { describe, it, expect } from "vitest";
import {
  isWeaponMasteryPlaceholder,
  weaponMasteryCountForClass,
  weaponMasteryCount,
  featMasterySlots,
  listMasterableWeapons,
} from "@/lib/weapon-mastery-pick";
import type { CharacterData } from "@/types/character";

/** A minimal CharacterData carrying just the `features[]` the helpers read. */
function charWithFeatures(featIds: string[]): CharacterData {
  return { features: featIds.map((srdId) => ({ srdId })) } as unknown as CharacterData;
}

describe("isWeaponMasteryPlaceholder", () => {
  it("recognises every martial class's weapon-mastery placeholder", () => {
    expect(isWeaponMasteryPlaceholder("fighter-weapon-mastery")).toBe(true);
    expect(isWeaponMasteryPlaceholder("barbarian-weapon-mastery")).toBe(true);
    expect(isWeaponMasteryPlaceholder("paladin-weapon-mastery")).toBe(true);
    expect(isWeaponMasteryPlaceholder("ranger-weapon-mastery")).toBe(true);
    expect(isWeaponMasteryPlaceholder("rogue-weapon-mastery")).toBe(true);
  });

  it("recognises the Weapon Master FEAT as a mastery placeholder (2024 Mastery Property)", () => {
    expect(isWeaponMasteryPlaceholder("weapon-master")).toBe(true);
  });

  it("rejects non-mastery ids and casters' ids", () => {
    expect(isWeaponMasteryPlaceholder("wizard-spellcasting")).toBe(false);
    expect(isWeaponMasteryPlaceholder("longsword")).toBe(false);
    expect(isWeaponMasteryPlaceholder("")).toBe(false);
  });
});

describe("Weapon Master feat — grants ONE mastery slot through the existing picker", () => {
  // 2024 RAW (feat:weapon-master): the feat grants the Mastery property of ONE kind
  // of weapon (swappable each Long Rest). The slot feeds the SAME picker the class
  // masteries use — no parallel picker — so the count function reflects it.
  it("featMasterySlots is 1 with the feat, 0 without", () => {
    expect(featMasterySlots(charWithFeatures(["weapon-master"]))).toBe(1);
    expect(featMasterySlots(charWithFeatures([]))).toBe(0);
    expect(featMasterySlots(charWithFeatures(["great-weapon-master"]))).toBe(0);
  });

  it("the feat adds +1 to a NON-mastery class's mastery picker (Wizard 4 → 1)", () => {
    // A Wizard's class column is 0; the feat alone yields exactly one slot through
    // the shared resolver, so the picker surfaces (max 1) and the pick rides
    // `classes[].weaponMasteries` like a class mastery.
    const wiz = charWithFeatures(["weapon-master"]);
    expect(weaponMasteryCountForClass("wizard", 4)).toBe(0);
    expect(weaponMasteryCount(wiz, "wizard", 4)).toBe(1);
  });

  it("stacks on a martial class's level-scaled column (Fighter 5 → 4, +1 feat = 5)", () => {
    const fighter = charWithFeatures(["fighter-weapon-mastery", "weapon-master"]);
    expect(weaponMasteryCountForClass("fighter", 5)).toBe(4);
    expect(weaponMasteryCount(fighter, "fighter", 5)).toBe(5);
  });

  it("the feat slot folds ONLY onto the primary entry (isPrimary:false omits it)", () => {
    const multi = charWithFeatures(["weapon-master"]);
    expect(weaponMasteryCount(multi, "rogue", 3, { isPrimary: true })).toBe(3); // 2 + 1
    expect(weaponMasteryCount(multi, "rogue", 3, { isPrimary: false })).toBe(2); // class only
  });

  it("no feat → count equals the class column on every entry (no phantom slot)", () => {
    const none = charWithFeatures(["barbarian-weapon-mastery"]);
    expect(weaponMasteryCount(none, "barbarian", 4)).toBe(3);
    expect(weaponMasteryCount(none, "barbarian", 4, { isPrimary: false })).toBe(3);
  });
});

describe("weaponMasteryCountForClass — READ from the class table column (#30)", () => {
  // The count is the class's Weapon Mastery table column at that class level,
  // verified verbatim against http://dnd2024.wikidot.com/<class>:main. The bug
  // (#30) was a hardcoded flat-2 that ignored the Barbarian scaling column — so
  // a Barbarian 4 was offered only 2 masteries instead of 3. These cases pin the
  // FULL per-level progression so a hand-written number can never drift again.
  const SCALING: Record<string, Array<[level: number, count: number]>> = {
    // Fighter: 3 / 4 (L4) / 5 (L10) / 6 (L16).
    fighter: [
      [1, 3],
      [3, 3],
      [4, 4],
      [9, 4],
      [10, 5],
      [15, 5],
      [16, 6],
      [20, 6],
    ],
    // Barbarian: 2 / 3 (L4) / 4 (L10) — the #30 regression.
    barbarian: [
      [1, 2],
      [3, 2],
      [4, 3],
      [9, 3],
      [10, 4],
      [20, 4],
    ],
    // Paladin / Ranger / Rogue: a flat 2 (no scaling column in RAW).
    paladin: [
      [1, 2],
      [4, 2],
      [20, 2],
    ],
    ranger: [
      [1, 2],
      [4, 2],
      [20, 2],
    ],
    rogue: [
      [1, 2],
      [4, 2],
      [20, 2],
    ],
  };

  for (const [classId, rows] of Object.entries(SCALING)) {
    it(`${classId}: ${rows.map(([l, c]) => `L${l}→${c}`).join(", ")}`, () => {
      for (const [level, count] of rows) {
        expect(weaponMasteryCountForClass(classId, level)).toBe(count);
      }
    });
  }

  it("defaults to the L1 count when no level is given", () => {
    expect(weaponMasteryCountForClass("fighter")).toBe(3);
    expect(weaponMasteryCountForClass("barbarian")).toBe(2);
  });

  it("clamps an out-of-range level into the [1,20] table range", () => {
    expect(weaponMasteryCountForClass("barbarian", 0)).toBe(2); // → L1
    expect(weaponMasteryCountForClass("barbarian", 99)).toBe(4); // → L20
    expect(weaponMasteryCountForClass("fighter", 4.7)).toBe(4); // floor → L4
  });

  it("Returns 0 for classes that don't grant the feature (no table column)", () => {
    expect(weaponMasteryCountForClass("wizard")).toBe(0);
    expect(weaponMasteryCountForClass("cleric")).toBe(0);
    expect(weaponMasteryCountForClass("bard")).toBe(0);
    expect(weaponMasteryCountForClass("")).toBe(0);
  });
});

describe("listMasterableWeapons", () => {
  const list = listMasterableWeapons();

  it("returns at least the 38 SRD weapons that carry a mastery property", () => {
    // 38 weapons in src/data/weapons.ts have a `mastery:` field. The list
    // is just a snapshot guard; if the SRD data adds more this can be raised.
    expect(list.length).toBeGreaterThanOrEqual(38);
  });

  it("every returned weapon has a mastery field set", () => {
    for (const w of list) {
      expect(typeof w.mastery).toBe("string");
    }
  });

  it("is sorted by SRD id ascending", () => {
    const ids = list.map((w) => w.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it("includes a few well-known 2024 mastery weapons", () => {
    const ids = list.map((w) => w.id);
    expect(ids).toContain("longsword"); // Sap
    expect(ids).toContain("greataxe"); // Cleave
    expect(ids).toContain("shortsword"); // Vex
    expect(ids).toContain("rapier"); // Vex
  });
});
