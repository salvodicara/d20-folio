import { describe, expect, it } from "vitest";
import { classTables } from "@/data/classes";
import { hitDicePool, hitDiceTotalRange } from "@/lib/play/hit-dice";

/**
 * A multiclass character's Hit Point Dice are one die per level of each class,
 * at that class's size (2024 multiclassing). Cases come from the class tables:
 * every pair of SRD classes, one level each.
 */
const pairs = classTables.flatMap((a, i) =>
  classTables.slice(i + 1).map((b) => [a, b] as const)
);

describe("Hit Point Dice pool", () => {
  it("covers every class pair", () => {
    expect(pairs.length).toBe((classTables.length * (classTables.length - 1)) / 2);
  });

  it.each(pairs.map(([a, b]) => [`${a.id}/${b.id}`, a, b]))(
    "%s spends each class's own die",
    (_name, a, b) => {
      const character = {
        classes: [
          { classId: a.id, level: 1 },
          { classId: b.id, level: 1 },
        ],
        // The last class advanced: the legacy single die.
        hitDieType: b.hitDie,
      };
      const pool = hitDicePool(character);
      expect(pool.reduce((sum, entry) => sum + entry.count, 0)).toBe(2);
      expect(hitDiceTotalRange(pool, 2)).toEqual({ min: 2, max: a.hitDie + b.hitDie });
      expect(hitDiceTotalRange(pool, 1)).toEqual({
        min: 1,
        max: Math.max(a.hitDie, b.hitDie),
      });
    }
  );

  it("a single class spends its own die per level", () => {
    const pool = hitDicePool({
      classes: [{ classId: "fighter", level: 5 }],
      hitDieType: 10,
    });
    expect(pool).toEqual([{ die: 10, count: 5 }]);
    expect(hitDiceTotalRange(pool, 3)).toEqual({ min: 3, max: 30 });
  });

  it("an unknown class and a total override fall back to the stored die", () => {
    expect(
      hitDicePool({ classes: [{ classId: "homebrew-x", level: 3 }], hitDieType: 8 })
    ).toEqual([{ die: 8, count: 3 }]);
    expect(
      hitDicePool({
        classes: [
          { classId: "fighter", level: 5 },
          { classId: "wizard", level: 1 },
        ],
        hitDieType: 6,
        hitDiceTotalOverride: 4,
      })
    ).toEqual([{ die: 6, count: 4 }]);
  });
});
