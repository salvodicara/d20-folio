import { describe, it, expect } from "vitest";
import {
  ABILITY_BUDGET_DEFAULT,
  inferBgFeat,
  inferHitDie,
  inferHpMax,
  inferSavingThrows,
  inferSpeed,
  inferSpellcasting,
  inferSpellSlots,
  resolveClassId,
  retroactiveConHpMax,
  speciesGrantsVersatileFeat,
} from "@/lib/character-infer";
import { classTableIndex } from "@/data/classes";
import type { AbilityCode } from "@/data/types";

describe("character-infer — base Speed (species-fixed)", () => {
  it("most species are 30 ft (stored as a plain number string)", () => {
    expect(inferSpeed({ race: "Human" })).toBe("30");
    expect(inferSpeed({ race: "elf" })).toBe("30");
  });
  it("returns '' for an unknown species (minimizer keeps the stored value)", () => {
    expect(inferSpeed({ race: "Eldrazi" })).toBe("");
    expect(inferSpeed({ race: "" })).toBe("");
  });
});

describe("character-infer — spellcasting block (class-fixed)", () => {
  it("returns null for a non-caster (its stored block is already null)", () => {
    expect(inferSpellcasting({ classId: "barbarian", level: 5 })).toBeNull();
  });
  it("derives ability + preparedCaster + preparedMax from the class table", () => {
    const sc = inferSpellcasting({ classId: "cleric", level: 5 });
    const table = classTableIndex.get("cleric");
    expect(sc).toEqual({
      ability: "WIS",
      preparedCaster: true,
      preparedMax: table?.levels.find((l) => l.level === 5)?.spellsKnown ?? 0,
      saveDCOverride: null,
      attackBonusOverride: null,
    });
  });
  it("preparedMax tracks the class table's per-level spellsKnown (the level-up source)", () => {
    const at = (lvl: number) =>
      inferSpellcasting({ classId: "wizard", level: lvl })?.preparedMax;
    const tbl = classTableIndex.get("wizard");
    expect(at(1)).toBe(tbl?.levels[0]?.spellsKnown);
    expect(at(20)).toBe(tbl?.levels[19]?.spellsKnown);
  });
});

describe("character-infer — saving throws (fixed per class in 2024)", () => {
  const cases: Array<[string, string[]]> = [
    ["bard", ["CHA", "DEX"]],
    ["wizard", ["INT", "WIS"]],
    ["monk", ["DEX", "STR"]],
    ["rogue", ["DEX", "INT"]],
    ["paladin", ["CHA", "WIS"]],
    ["barbarian", ["CON", "STR"]],
  ];
  for (const [classId, saves] of cases) {
    it(`${classId} → ${saves.join("/")}`, () => {
      expect([...inferSavingThrows({ classId, level: 1 })].sort()).toEqual(
        [...saves].sort()
      );
    });
  }
});

describe("character-infer — hit die (fixed per class)", () => {
  const cases: Array<[string, number]> = [
    ["barbarian", 12],
    ["paladin", 10],
    ["bard", 8],
    ["monk", 8],
    ["rogue", 8],
    ["wizard", 6],
  ];
  for (const [classId, die] of cases) {
    it(`${classId} → d${die}`, () => {
      expect(inferHitDie({ classId, level: 1 })).toBe(die);
    });
  }
});

describe("character-infer — spell slots from the class table", () => {
  it("wizard L3 → 4×1st, 2×2nd", () => {
    expect(inferSpellSlots({ classId: "wizard", level: 3 })).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 2 },
    ]);
  });
  it("bard L9 → 4/3/3/3/1", () => {
    expect(inferSpellSlots({ classId: "bard", level: 9 })).toEqual([
      { level: 1, total: 4 },
      { level: 2, total: 3 },
      { level: 3, total: 3 },
      { level: 4, total: 3 },
      { level: 5, total: 1 },
    ]);
  });
  it("non-caster (fighter L3) → no slots", () => {
    expect(inferSpellSlots({ classId: "fighter", level: 3 })).toEqual([]);
  });
});

describe("character-infer — background Origin feat (fixed per background)", () => {
  const cases: Array<[string, string]> = [
    ["acolyte", "magic-initiate-cleric"],
    ["sage", "magic-initiate-wizard"],
    ["criminal", "alert"],
    ["soldier", "savage-attacker"],
  ];
  for (const [background, feat] of cases) {
    it(`${background} → ${feat}`, () => {
      expect(inferBgFeat({ background })).toBe(feat);
    });
  }
  it("empty background → empty string", () => {
    expect(inferBgFeat({ background: "" })).toBe("");
  });
});

describe("character-infer — misc", () => {
  it("ABILITY_BUDGET_DEFAULT is the 2024 point-buy budget", () => {
    expect(ABILITY_BUDGET_DEFAULT).toBe(27);
  });
  it("resolveClassId returns the primary class entry's id", () => {
    expect(resolveClassId({ classes: [{ classId: "bard", level: 1 }] })).toBe("bard");
    expect(resolveClassId({ classes: [{ classId: "wizard", level: 1 }] })).toBe("wizard");
  });
});

describe("character-infer — species Versatile feat (2024 Human)", () => {
  it("Human grants a second Origin feat", () => {
    expect(speciesGrantsVersatileFeat("Human")).toBe(true);
    expect(speciesGrantsVersatileFeat("human")).toBe(true);
  });
  it("non-Human species do not", () => {
    for (const r of ["Elf", "Gnome", "Tiefling", "Orc", "Dwarf"]) {
      expect(speciesGrantsVersatileFeat(r)).toBe(false);
    }
  });
  it("empty/unknown species is false", () => {
    expect(speciesGrantsVersatileFeat("")).toBe(false);
    expect(speciesGrantsVersatileFeat("Nonexistent")).toBe(false);
  });
});

describe("character-infer — retroactive CON max-HP rebake (RA-22)", () => {
  const scores = (con: number): Record<AbilityCode, number> => ({
    STR: 10,
    DEX: 10,
    CON: con,
    INT: 10,
    WIS: 10,
    CHA: 10,
  });
  // Mirrors MOCK (Bard 9, stored hp.max 62); inferHpMax(bard L9) = 66@CON14,
  // 75@CON16, 57@CON12 — hand-verified against the per-level min-1 arithmetic.
  const bard9 = (con: number, max = 62) => ({
    classes: [{ classId: "bard", subclassId: "college-of-lore", level: 9 }],
    abilityScores: scores(con),
    hp: { max },
  });

  it("a CON rise (14→16, mod +2→+3) adds the CON-mod delta across every level", () => {
    expect(retroactiveConHpMax(bard9(14), 16)).toBe(71); // +9 = +1 mod × 9 levels
  });

  it("a CON decrease (14→12, mod +2→+1) subtracts it — the RAW gap this closes", () => {
    expect(retroactiveConHpMax(bard9(14), 12)).toBe(53); // −9
  });

  it("an even→odd bump with no mod change (14→15) leaves max HP untouched", () => {
    expect(retroactiveConHpMax(bard9(14), 15)).toBe(62); // delta 0 — HP tracks the MODIFIER
  });

  it("preserves a deviation from the average (shifts a pinned/rolled max, never resets)", () => {
    // Stored 62 already deviates from the computed 66 average; a rise shifts it by
    // the delta to 71, NOT to the 75 average.
    const bumped = retroactiveConHpMax(bard9(14), 16);
    expect(bumped).toBe(71);
    expect(bumped).not.toBe(
      inferHpMax([{ classId: "bard", subclassId: "college-of-lore", level: 9 }], 16)
    );
  });

  it("floors the stored max at 1 on a huge CON drop", () => {
    expect(
      retroactiveConHpMax({ ...bard9(20), hp: { max: 1 } }, 3)
    ).toBeGreaterThanOrEqual(1);
  });

  it("leaves a husk (unknown primary class) unchanged — delta 0 both terms", () => {
    expect(
      retroactiveConHpMax(
        {
          classes: [{ classId: "not-a-class", level: 5 }],
          abilityScores: scores(14),
          hp: { max: 40 },
        },
        8
      )
    ).toBe(40);
  });
});
