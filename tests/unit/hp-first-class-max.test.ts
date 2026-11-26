/**
 * #1324 — the 2024 rule: the character's FIRST level (the class taken at character
 * level 1, `classes[0]`) takes the hit-die maximum; every later level takes the
 * fixed value. Not the highest-level class.
 * SRD content only, so the pack-free build runs the same cases.
 */
import { describe, it, expect } from "vitest";
import { inferHpContributions, inferHpMax } from "@/lib/character-infer";
import {
  computeCharacterMaxHp,
  computeCharacterMaxHpBreakdown,
} from "@/lib/aggregate-character";
import { breakdownTotal } from "@/lib/value-breakdown";
import { levelUp } from "@/lib/level-up";
import {
  serializeCharacterEnvelope,
  parseCharacterEnvelope,
} from "@/lib/character-codec";
import { makeCharacterDoc } from "./_helpers";
import type { ClassEntry } from "@/types/character";

const CON_10 = 10;

describe("max HP — the first class takes the hit-die maximum", () => {
  it("Fighter 1 then Wizard 3: level 1 is the d10 maximum, 10 + 3 × 4 = 22", () => {
    const classes: ClassEntry[] = [
      { classId: "fighter", level: 1 },
      { classId: "wizard", level: 3 },
    ];
    expect(inferHpMax(classes, CON_10)).toBe(22);
    expect(inferHpContributions(classes, CON_10).map((c) => c.dice)).toEqual([10, 12]);
  });

  it("Wizard 1 then Fighter 3: level 1 is the d6 maximum, 6 + 3 × 6 = 24", () => {
    const classes: ClassEntry[] = [
      { classId: "wizard", level: 1 },
      { classId: "fighter", level: 3 },
    ];
    expect(inferHpMax(classes, CON_10)).toBe(24);
  });

  it("an unknown highest-level class keeps the stored max (the guard is unchanged)", () => {
    const classes: ClassEntry[] = [
      { classId: "fighter", level: 1 },
      { classId: "homebrew-class", level: 3 },
    ];
    expect(inferHpContributions(classes, CON_10)).toEqual([]);
  });

  it("an unknown first class takes the d8 maximum: Homebrew 1 / Fighter 3 = 8 + 3 × 6 = 26", () => {
    const classes: ClassEntry[] = [
      { classId: "homebrew-class", level: 1 },
      { classId: "fighter", level: 3 },
    ];
    expect(inferHpMax(classes, CON_10)).toBe(26);
  });

  // Pins: a tie and a single class read the same under both rules.
  it("a tie keeps the first entry: Fighter 2 / Wizard 2 = 10 + 6 + 4 + 4 = 24", () => {
    const classes: ClassEntry[] = [
      { classId: "fighter", level: 2 },
      { classId: "wizard", level: 2 },
    ];
    expect(inferHpMax(classes, CON_10)).toBe(24);
  });

  it("a single class is unchanged: Fighter 4 = 10 + 3 × 6 = 28", () => {
    expect(inferHpMax([{ classId: "fighter", level: 4 }], CON_10)).toBe(28);
  });

  it("CON counts once per level with the first-level maximum: Fighter 1 / Wizard 3, CON 14 = 30", () => {
    const classes: ClassEntry[] = [
      { classId: "fighter", level: 1 },
      { classId: "wizard", level: 3 },
    ];
    expect(inferHpMax(classes, 14)).toBe(30);
  });

  it("the breakdown rows sum to the computed max for a multiclass character", () => {
    const doc = makeCharacterDoc({
      classes: [
        { classId: "fighter", level: 1 },
        { classId: "wizard", level: 3 },
      ],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      features: [],
      humanOriginFeat: "",
      bgFeat: "",
    });
    const parts = computeCharacterMaxHpBreakdown(doc.character);
    expect(breakdownTotal(parts)).toBe(computeCharacterMaxHp(doc.character));
    expect(computeCharacterMaxHp(doc.character)).toBe(22);
  });
});

describe("max HP — a second class overtaking the first does not move level 1", () => {
  it("Fighter 1 / Wizard 1 → Wizard 2 gains the Wizard fixed value only (+4 at CON 10)", () => {
    const doc = makeCharacterDoc({
      classes: [
        { classId: "fighter", level: 1 },
        { classId: "wizard", level: 1 },
      ],
      abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      features: [],
      humanOriginFeat: "",
      bgFeat: "",
      hp: { max: 14 },
    });
    expect(computeCharacterMaxHp(doc.character)).toBe(14);
    const { updatedCharacter } = levelUp(doc.character, 3, { advanceClassId: "wizard" });
    expect(updatedCharacter.hp.max).toBe(18);
  });
});

describe("the class order is the order the levels were taken", () => {
  it("a level in a new class appends its entry after the first class", () => {
    const doc = makeCharacterDoc({ classes: [{ classId: "fighter", level: 1 }] });
    const { updatedCharacter } = levelUp(doc.character, 2, { advanceClassId: "wizard" });
    expect(updatedCharacter.classes.map((e) => e.classId)).toEqual(["fighter", "wizard"]);
  });

  it("a save and a reload keep the order even when a later class is higher", () => {
    const doc = makeCharacterDoc({
      classes: [
        { classId: "fighter", level: 1 },
        { classId: "wizard", level: 3 },
      ],
    });
    const env = structuredClone(serializeCharacterEnvelope(doc));
    const parsed = parseCharacterEnvelope(env.build, env.state);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.character.classes.map((e) => e.classId)).toEqual(["fighter", "wizard"]);
  });
});
