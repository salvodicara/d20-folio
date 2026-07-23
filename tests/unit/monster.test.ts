/**
 * `src/lib/monster.ts` — the DERIVED-NOT-STORED helpers (D-4). Table-driven pins
 * of the CR→XP/PB tables + `diceMean`, and fixture-driven checks of the
 * save/skill/passive/initiative derivations (mod + PB × proficiency).
 */
import { describe, it, expect } from "vitest";
import type { MonsterStatBlock } from "@/data/types";
import {
  diceMean,
  monsterInitiative,
  monsterPassivePerception,
  monsterSaveBonus,
  monsterSkillBonus,
  pbForCr,
  xpForCr,
} from "@/lib/monster";

// A synthetic statblock (CR 5 → PB 3). STR 18 (+4) DEX 14 (+2) CON 16 (+3)
// INT 10 (+0) WIS 12 (+1) CHA 8 (-1).
const base: MonsterStatBlock = {
  id: "test-brute",
  cr: 5,
  sizes: ["Medium"],
  type: "humanoid",
  alignment: "neutral",
  ac: 15,
  hp: { average: 45, formula: "6d8+18" },
  speeds: { walk: 30 },
  abilityScores: { STR: 18, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 8 },
  actions: [],
  source: "SRD",
};

describe("pbForCr — 2024 proficiency bonus by CR", () => {
  it.each([
    [0, 2],
    [0.125, 2],
    [0.25, 2],
    [0.5, 2],
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
    [21, 7],
    [24, 7],
    [25, 8],
    [28, 8],
    [29, 9],
    [30, 9],
  ])("CR %s → PB %s", (cr, pb) => {
    expect(pbForCr(cr)).toBe(pb);
  });
});

describe("xpForCr — the fixed 2024 XP table", () => {
  it.each([
    [0, 10],
    [0.125, 25],
    [0.25, 50],
    [0.5, 100],
    [1, 200],
    [2, 450],
    [3, 700],
    [4, 1100],
    [5, 1800],
    [6, 2300],
    [7, 2900],
    [8, 3900],
    [9, 5000],
    [10, 5900],
    [11, 7200],
    [12, 8400],
    [13, 10000],
    [14, 11500],
    [15, 13000],
    [16, 15000],
    [17, 18000],
    [18, 20000],
    [19, 22000],
    [20, 25000],
    [21, 33000],
    [22, 41000],
    [23, 50000],
    [24, 62000],
    [25, 75000],
    [26, 90000],
    [27, 105000],
    [28, 120000],
    [29, 135000],
    [30, 155000],
  ])("CR %s → XP %s", (cr, xp) => {
    expect(xpForCr(cr)).toBe(xp);
  });

  it("throws on a CR outside the table", () => {
    expect(() => xpForCr(7.5)).toThrow(/no XP for CR/);
  });
});

describe("diceMean", () => {
  it.each([
    ["1d6+2", 5.5],
    ["2d10", 11],
    ["1", 1],
    ["1d8", 4.5],
    ["2d6-1", 6],
    ["9d8+18", 58.5],
    ["18", 18],
  ])("%s → %s", (expr, mean) => {
    expect(diceMean(expr)).toBe(mean);
  });

  it("throws on a malformed expression", () => {
    expect(() => diceMean("d6")).toThrow(/malformed dice/);
    expect(() => diceMean("1d")).toThrow(/malformed dice/);
  });
});

describe("monsterInitiative", () => {
  it("derives the DEX modifier when no override is stored", () => {
    expect(monsterInitiative(base)).toBe(2);
  });
  it("uses the stored deviation when present", () => {
    expect(monsterInitiative({ ...base, initiative: 6 })).toBe(6);
  });
});

describe("monsterSaveBonus", () => {
  it("is the bare ability modifier for a non-proficient save", () => {
    expect(monsterSaveBonus(base, "STR")).toBe(4);
  });
  it("adds PB for a proficient save", () => {
    expect(monsterSaveBonus({ ...base, saveProficiencies: ["CON"] }, "CON")).toBe(6);
  });
  it("uses a stored override verbatim", () => {
    expect(monsterSaveBonus({ ...base, saveOverrides: { STR: 9 } }, "STR")).toBe(9);
  });
});

describe("monsterSkillBonus", () => {
  it("is mod + PB for a proficient skill", () => {
    expect(monsterSkillBonus(base, { skill: "athletics" })).toBe(7); // STR +4 + PB 3
  });
  it("is mod + 2·PB with expertise", () => {
    expect(monsterSkillBonus(base, { skill: "stealth", expertise: true })).toBe(8); // DEX +2 + 6
  });
  it("uses a stored override verbatim", () => {
    expect(monsterSkillBonus(base, { skill: "perception", bonus: 5 })).toBe(5);
  });
  it("throws on an unknown skill id", () => {
    expect(() => monsterSkillBonus(base, { skill: "not-a-skill" })).toThrow(
      /unknown skill/
    );
  });
});

describe("monsterPassivePerception", () => {
  it("is 10 + the bare WIS modifier with no Perception skill row", () => {
    expect(monsterPassivePerception(base)).toBe(11); // 10 + WIS +1
  });
  it("adds the proficient Perception bonus", () => {
    expect(monsterPassivePerception({ ...base, skills: [{ skill: "perception" }] })).toBe(
      14
    ); // 10 + (WIS +1 + PB 3)
  });
  it("uses a stored override verbatim", () => {
    expect(monsterPassivePerception({ ...base, passivePerceptionOverride: 17 })).toBe(17);
  });
});
