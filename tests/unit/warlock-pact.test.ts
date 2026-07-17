import { describe, it, expect } from "vitest";
import { getClassTable } from "@/data/classes";

/** Warlock uses Pact Magic: a few slots ALL at one level — not a full-caster table. */
describe("Warlock Pact Magic slots (C1 fix)", () => {
  const warlock = getClassTable("warlock");

  it("never has multi-level slots (only one spell level non-zero at any character level)", () => {
    if (!warlock) throw new Error("no warlock class table");
    for (const lvl of warlock.levels) {
      const nonZero = (lvl.spellSlots ?? []).filter((n) => n > 0);
      expect(nonZero.length).toBeLessThanOrEqual(1);
    }
  });

  it("matches the 2024 progression (count @ pact-slot level)", () => {
    if (!warlock) throw new Error("no warlock class table");
    const at = (level: number) =>
      warlock.levels.find((l) => l.level === level)?.spellSlots ?? [];
    expect(at(1)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]); // 1 slot, 1st level
    expect(at(2)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]); // 2 slots, 1st level
    expect(at(3)).toEqual([0, 2, 0, 0, 0, 0, 0, 0, 0]); // 2 slots, 2nd level
    expect(at(5)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0]); // 2 slots, 3rd level
    expect(at(9)).toEqual([0, 0, 0, 0, 2, 0, 0, 0, 0]); // 2 slots, 5th level
    expect(at(11)).toEqual([0, 0, 0, 0, 3, 0, 0, 0, 0]); // 3 slots, 5th level
    expect(at(17)).toEqual([0, 0, 0, 0, 4, 0, 0, 0, 0]); // 4 slots, 5th level
  });
});
