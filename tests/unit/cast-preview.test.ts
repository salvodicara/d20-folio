/**
 * The cast dialog's preview (Play list row 18, approved): for each level the spell
 * can be cast at, how many slots are left and what the spell does there (its scaled
 * dice, its darts, its targets; a spent level greyed); the lowest level with a slot left chosen by
 * default; the turn it takes; and, for a Concentration spell, how long it lasts and
 * which spell it would end. Cases from the SRD 5.2.1 text: Magic Missile (3 darts,
 * one more per slot level above 1st), Fireball (8d6, +1d6 per slot level above 3rd),
 * Web (Concentration, up to 1 hour) cast while concentrating on Detect Magic, Bless
 * (three creatures, one more per slot level above 1st), Cure Wounds (2d8, +2d8).
 */
import { describe, expect, it } from "vitest";

import { concentrationValue } from "@/lib/concentration";
import { castPreview } from "@/lib/views/cast-preview";
import { MOCK_CHARACTER } from "@/lib/mock";
import { makeCharacterDoc } from "./_helpers";

const wizard = (session = {}) =>
  makeCharacterDoc(
    {
      classId: "wizard",
      level: 7,
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 3 },
        { level: 4, total: 1 },
      ],
      spells: [
        { srdId: "magic-missile", prepared: true },
        { srdId: "fireball", prepared: true },
        { srdId: "web", prepared: true },
        { srdId: "detect-magic", prepared: true },
      ],
    },
    { spellSlots: { "1": { used: 4 } }, ...session }
  );

describe("castPreview", () => {
  it("each level with its slots left, a spent one greyed; the lowest available by default", () => {
    const preview = castPreview(wizard(), "magic-missile");
    expect(preview?.levels.map((l) => [l.level, l.remaining, l.available])).toEqual([
      [1, 0, false],
      [2, 3, true],
      [3, 3, true],
      [4, 1, true],
    ]);
    expect(preview?.defaultLevel).toBe(2);
  });

  it("Bless's targets and Cure Wounds' healing grow with the slot", () => {
    const cleric = makeCharacterDoc(
      {
        classId: "cleric",
        level: 5,
        spellSlots: [
          { level: 1, total: 4 },
          { level: 2, total: 3 },
          { level: 3, total: 2 },
        ],
        spells: [
          { srdId: "bless", prepared: true },
          { srdId: "cure-wounds", prepared: true },
        ],
      },
      { spellSlots: {} }
    );
    expect(castPreview(cleric, "bless")?.levels.map((l) => l.targets)).toEqual([3, 4, 5]);
    expect(castPreview(cleric, "cure-wounds")?.levels.map((l) => l.healDice)).toEqual([
      "2d8",
      "4d8",
      "6d8",
    ]);
  });

  it("what the spell does at each level: Magic Missile's darts", () => {
    const preview = castPreview(wizard({ spellSlots: {} }), "magic-missile");
    expect(preview?.levels.map((l) => l.instances)).toEqual([3, 4, 5, 6]);
    expect(preview?.defaultLevel).toBe(1);
    expect(preview?.economy).toBe("action");
    expect(preview?.concentration).toBeNull();
  });

  it("Fireball's dice grow with the slot", () => {
    const preview = castPreview(wizard(), "fireball");
    expect(preview?.levels.map((l) => [l.level, l.damageDice])).toEqual([
      [3, "8d6"],
      [4, "9d6"],
    ]);
  });

  it("a Concentration spell says how long it lasts and which spell it would end", () => {
    const preview = castPreview(
      wizard({ concentration: concentrationValue("detect-magic") }),
      "web"
    );
    expect(preview?.concentration).toEqual({
      duration: { kind: "hours", amount: 1 },
      ends: "detect-magic",
    });
  });

  it("with nothing held, it ends nothing; a spell the character doesn't know has no preview", () => {
    expect(castPreview(wizard(), "web")?.concentration).toEqual({
      duration: { kind: "hours", amount: 1 },
      ends: null,
    });
    expect(castPreview(wizard(), "wish")).toBeNull();
  });

  it("a spell granted at will, not on the list, still has its preview (Armor of Shadows)", () => {
    const warlock = structuredClone(MOCK_CHARACTER);
    warlock.character.features = [];
    warlock.character.equipment = [];
    warlock.character.spells = [];
    warlock.character.classes = warlock.character.classes.map((e, i) =>
      i === 0 ? { ...e, maneuverChoices: [], invocationChoices: ["armor-of-shadows"] } : e
    );
    const preview = castPreview(warlock, "mage-armor");
    expect(preview?.levels).toContainEqual(
      expect.objectContaining({ level: 1, remaining: Infinity, available: true })
    );
    expect(preview?.defaultLevel).toBe(1);
  });
});
