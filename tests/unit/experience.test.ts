/**
 * `xpProgress` against the SRD 5.2.1 "Character Advancement" table. The cases are
 * the table itself, transcribed row by row (level → XP needed to reach it), not
 * the module's own constant — every level boundary is checked on both sides.
 */
import { describe, expect, it } from "vitest";
import { xpProgress } from "@/lib/experience";

/** SRD 5.2.1, Character Advancement: [level, experience points]. */
const SRD_ADVANCEMENT: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [2, 300],
  [3, 900],
  [4, 2700],
  [5, 6500],
  [6, 14000],
  [7, 23000],
  [8, 34000],
  [9, 48000],
  [10, 64000],
  [11, 85000],
  [12, 100000],
  [13, 120000],
  [14, 140000],
  [15, 165000],
  [16, 195000],
  [17, 225000],
  [18, 265000],
  [19, 305000],
  [20, 355000],
];

describe("xpProgress — SRD Character Advancement", () => {
  for (const [level, floor] of SRD_ADVANCEMENT) {
    const next = SRD_ADVANCEMENT.find(([l]) => l === level + 1)?.[1] ?? null;
    it(`level ${level}: starts at ${floor} XP, next at ${next ?? "—"}`, () => {
      const atFloor = xpProgress(floor, level);
      expect(atFloor.floor).toBe(floor);
      expect(atFloor.next).toBe(next);
      if (next === null) {
        expect(atFloor.canLevelUp).toBe(false);
        expect(atFloor.fraction).toBe(1);
        return;
      }
      expect(atFloor.fraction).toBe(0);
      expect(atFloor.canLevelUp).toBe(false);
      const justShort = xpProgress(next - 1, level);
      expect(justShort.canLevelUp).toBe(false);
      expect(justShort.fraction).toBeCloseTo((next - 1 - floor) / (next - floor));
      const reached = xpProgress(next, level);
      expect(reached.canLevelUp).toBe(true);
      expect(reached.fraction).toBe(1);
    });
  }

  it("a sheet behind on XP (levelled by milestone) reads an empty bar, never negative", () => {
    const p = xpProgress(100, 5);
    expect(p.fraction).toBe(0);
    expect(p.canLevelUp).toBe(false);
  });

  it("XP far past the next threshold is still one level-up, bar full", () => {
    const p = xpProgress(50000, 3);
    expect(p.next).toBe(2700);
    expect(p.canLevelUp).toBe(true);
    expect(p.fraction).toBe(1);
  });
});
