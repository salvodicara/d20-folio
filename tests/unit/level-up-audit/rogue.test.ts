/**
 * Level-up audit — Rogue 1 → 20 against SRD 5.2.1 (srd.txt "Rogue Features" table,
 * lines 3700-3721, and the class text at lines 3683-3800; Thief at 3802-3846).
 * Every expected value below is read from that text, never from src/data.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { sheetNumbers } from "@/lib/views/sheet-numbers";

import {
  asksAsi,
  epicBoonChecks,
  hasFeature,
  maxHp,
  pb,
  row,
  SRD_PB,
  tracker,
  walk,
  type Step,
} from "./_walk-rswz";

// "Rogue Features" table (srd.txt 3700-3721): Class Features + Sneak Attack columns.
const FEATURES: Record<number, string[]> = {
  1: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"],
  2: ["Cunning Action"],
  3: ["Steady Aim"],
  5: ["Cunning Strike", "Uncanny Dodge"],
  6: ["Expertise"],
  7: ["Evasion", "Reliable Talent"],
  11: ["Improved Cunning Strike"],
  14: ["Devious Strikes"],
  15: ["Slippery Mind"],
  18: ["Elusive"],
  19: ["Epic Boon"],
  20: ["Stroke of Luck"],
};
// Thief (srd.txt 3802-3846): Fast Hands 3, Second-Story Work 3, Supreme Sneak 9,
// Use Magic Device 13, Thief's Reflexes 17.
const THIEF: Record<number, string[]> = {
  3: ["Fast Hands", "Second-Story Work"],
  9: ["Supreme Sneak"],
  13: ["Use Magic Device"],
  17: ["Thief's Reflexes"],
};
const SNEAK = [
  "1d6",
  "1d6",
  "2d6",
  "2d6",
  "3d6",
  "3d6",
  "4d6",
  "4d6",
  "5d6",
  "5d6",
  "6d6",
  "6d6",
  "7d6",
  "7d6",
  "8d6",
  "8d6",
  "9d6",
  "9d6",
  "10d6",
  "10d6",
];
// "Level 4: Ability Score Improvement ... again at Rogue levels 8, 10, 12, and 16"
// (srd.txt 3755-3758); "Level 19: Epic Boon" (3793).
const ASI_LEVELS = [4, 8, 10, 12, 16];
// Hit Point Die D8 (srd.txt 3637); CON 14 → +2. Level 1 = 8 + 2; then 5 + 2 a level.
const CON = 2;
const expectedHp = (level: number) => 8 + CON + (level - 1) * (5 + CON);

let steps: Step[] = [];
beforeAll(() => {
  steps = walk({
    classId: "rogue",
    subclassId: "thief",
    primary: "DEX",
    boon: "boon-of-the-night-spirit",
    level1: {
      abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 12, WIS: 12, CHA: 10 },
      // Four Rogue skills (Core Rogue Traits) + the background's; Expertise in two (L1).
      skills: {
        stealth: "expertise",
        "sleight-of-hand": "expertise",
        acrobatics: "proficient",
        perception: "proficient",
        athletics: "proficient",
        intimidation: "proficient",
        insight: "proficient",
      },
      classes: [{ classId: "rogue", level: 1, weaponMasteries: ["dagger", "shortbow"] }],
    },
  });
});

describe("Rogue level-up audit (SRD 5.2.1)", () => {
  for (let level = 1; level <= 20; level++) {
    it(`level ${level}`, () => {
      const step = steps[level - 1];
      if (!step) throw new Error("walk did not reach this level");
      const { doc, asks } = step;
      const at = `Rogue ${level}`;

      expect.soft(pb(doc), `${at} proficiency bonus`).toBe(SRD_PB[level - 1]);
      expect.soft(maxHp(doc), `${at} max HP`).toBe(expectedHp(level));

      for (let l = 1; l <= level; l++) {
        for (const name of FEATURES[l] ?? [])
          expect.soft(hasFeature(doc, name), `${at} has ${name} (L${l})`).toBe(true);
        for (const name of l >= 3 ? (THIEF[l] ?? []) : [])
          expect
            .soft(hasFeature(doc, name), `${at} has Thief ${name} (L${l})`)
            .toBe(true);
      }

      expect
        .soft(tracker(doc, "rogue-sneak-attack")?.die, `${at} Sneak Attack dice`)
        .toBe(SNEAK[level - 1]);

      if (level === 1) return;
      expect.soft(asks?.complete, `${at} every question can be answered`).toBe(true);
      expect
        .soft(row(asks, "subclass") !== undefined, `${at} asks the subclass`)
        .toBe(level === 3);
      if (level === 3)
        expect
          .soft(doc.character.classes[0]?.subclassId, `${at} subclass saved`)
          .toBe("thief");
      expect
        .soft(asksAsi(asks), `${at} asks an ASI or feat`)
        .toBe(ASI_LEVELS.includes(level));
      if (level === 19) {
        // "Level 19: Epic Boon — You gain an Epic Boon feat (see "Feats") or another
        // feat of your choice for which you qualify" (srd.txt 3793-3796).
        const prev = steps[level - 2]?.doc;
        if (prev)
          epicBoonChecks(at, prev, step, "rogue", "boon-of-the-night-spirit", (v, m) =>
            expect.soft(v, m)
          );
      }
      // "At Rogue level 6, you gain Expertise in two more of your skill proficiencies"
      // (srd.txt 3688-3689).
      expect
        .soft(row(asks, "expertise")?.count ?? 0, `${at} Expertise picks`)
        .toBe(level === 6 ? 2 : 0);
      if (level === 6) {
        const experts = Object.values(doc.character.skills).filter(
          (t) => t === "expertise"
        );
        expect.soft(experts.length, `${at} skills with Expertise`).toBe(4);
      }
      // Weapon Mastery: two kinds of weapons, no column that grows (srd.txt 3727-3731).
      expect
        .soft(row(asks, "weaponMasteries"), `${at} asks no new mastery`)
        .toBeUndefined();
      // A Rogue has no spells, metamagic or invocations.
      expect.soft(row(asks, "newSpells"), `${at} asks no spells`).toBeUndefined();
      expect.soft(row(asks, "newCantrips"), `${at} asks no cantrips`).toBeUndefined();
      // Slippery Mind: "You gain proficiency in Wisdom and Charisma saving throws"
      // (srd.txt 3778-3780): from 15 those saves add the Proficiency Bonus.
      const saves = sheetNumbers(doc).saves;
      for (const ab of ["WIS", "CHA"] as const) {
        const score = doc.character.abilityScores[ab];
        const mod = Math.floor((score - 10) / 2);
        expect
          .soft(saves.find((s) => s.ability === ab)?.total, `${at} ${ab} save`)
          .toBe(mod + (level >= 15 ? (SRD_PB[level - 1] ?? 0) : 0));
      }
    });
  }
});
