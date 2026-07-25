/**
 * encounter-difficulty — the 2024-DMG XP-budget engine (SRD 5.2.1 "Combat
 * Encounter Difficulty").
 *
 * The table below is an INDEPENDENT literal transcription of the SRD extract
 * (§A.2, EN lines 20142–20166): all 60 cells are asserted against the module's
 * copy, so a silent drift in either fails the build (mutation-proof — the guard's
 * subjects come from a second-source transcription, not the module under test).
 * The party/cost/verdict functions are pinned by the SRD's OWN three worked
 * examples (§A.3) plus the boundary cases.
 */
import { describe, it, expect } from "vitest";
import {
  budgetVerdict,
  encounterXpCost,
  partyXpBudget,
  xpBudgetForLevel,
  type XpBudget,
} from "@/lib/encounter-difficulty";

// The SRD "XP Budget per Character" table, transcribed independently as
// [level, low, moderate, high]. This IS the source authority the module is pinned
// against — edit ONLY from the SRD.
const SRD_TABLE: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 50, 75, 100],
  [2, 100, 150, 200],
  [3, 150, 225, 400],
  [4, 250, 375, 500],
  [5, 500, 750, 1100],
  [6, 600, 1000, 1400],
  [7, 750, 1300, 1700],
  [8, 1000, 1700, 2100],
  [9, 1300, 2000, 2600],
  [10, 1600, 2300, 3100],
  [11, 1900, 2900, 4100],
  [12, 2200, 3700, 4700],
  [13, 2600, 4200, 5400],
  [14, 2900, 4900, 6200],
  [15, 3300, 5400, 7800],
  [16, 3800, 6100, 9800],
  [17, 4500, 7200, 11700],
  [18, 5000, 8700, 14200],
  [19, 5500, 10700, 17200],
  [20, 6400, 13200, 22000],
];

describe("xpBudgetForLevel — all 60 SRD cells", () => {
  for (const [level, low, moderate, high] of SRD_TABLE) {
    it(`L${level} = { low: ${low}, moderate: ${moderate}, high: ${high} }`, () => {
      expect(xpBudgetForLevel(level)).toEqual({ low, moderate, high });
    });
  }

  it("throws on a level outside 1–20 or a non-integer (never a silent 0)", () => {
    expect(() => xpBudgetForLevel(0)).toThrow();
    expect(() => xpBudgetForLevel(21)).toThrow();
    expect(() => xpBudgetForLevel(1.5)).toThrow();
  });
});

describe("partyXpBudget — SRD Step 2, per-character sum (§A.5)", () => {
  it("SRD example 1: Low, 4 × L1 → 200", () => {
    expect(partyXpBudget([1, 1, 1, 1])?.low).toBe(200);
  });

  it("SRD example 2: Moderate, 5 × L3 → 1,125", () => {
    expect(partyXpBudget([3, 3, 3, 3, 3])?.moderate).toBe(1125);
  });

  it("SRD example 3: High, 6 × L15 → 46,800", () => {
    expect(partyXpBudget([15, 15, 15, 15, 15, 15])?.high).toBe(46800);
  });

  it("mixed levels sum per character (L1 + L3 low = 50 + 150 = 200)", () => {
    expect(partyXpBudget([1, 3])).toEqual({
      low: 50 + 150,
      moderate: 75 + 225,
      high: 100 + 400,
    });
  });

  it("empty party → null (no characters, no budget — never a zero budget)", () => {
    expect(partyXpBudget([])).toBeNull();
  });
});

describe("encounterXpCost — SRD Step 3, plain sum, no multipliers", () => {
  it("Σ xp × count over costed groups", () => {
    expect(
      encounterXpCost([
        { xp: 50, count: 3 },
        { xp: 200, count: 1 },
      ])
    ).toEqual({
      costedXp: 350,
      uncostedGroups: 0,
    });
  });

  it("groups without xp are counted separately, never guessed", () => {
    expect(encounterXpCost([{ xp: 100, count: 2 }, { count: 1 }, { count: 4 }])).toEqual({
      costedXp: 200,
      uncostedGroups: 2,
    });
  });

  it("a harmless xp:0 group IS costed (existence-based, never truthy)", () => {
    expect(encounterXpCost([{ xp: 0, count: 2 }])).toEqual({
      costedXp: 0,
      uncostedGroups: 0,
    });
  });

  it("SRD example 1 monsters all fit the Low budget (200): 200 / 2×100 / 6×25", () => {
    // Bugbear Warrior alone (200), 2 Giant Wasps (100 each), 6 Giant Rats (25 each).
    expect(encounterXpCost([{ xp: 200, count: 1 }]).costedXp).toBe(200);
    expect(encounterXpCost([{ xp: 100, count: 2 }]).costedXp).toBe(200);
    expect(encounterXpCost([{ xp: 25, count: 6 }]).costedXp).toBe(150);
  });
});

describe("budgetVerdict — cheapest covering grade + boundaries", () => {
  const budget: XpBudget = { low: 100, moderate: 200, high: 400 };

  it("exactly-low → low (spending the whole Low budget is a Low encounter)", () => {
    expect(budgetVerdict(100, budget)).toBe("low");
  });

  it("a lone weak monster (below Low) is still a Low encounter", () => {
    expect(budgetVerdict(10, budget)).toBe("low");
  });

  it("low+1 → moderate", () => {
    expect(budgetVerdict(101, budget)).toBe("moderate");
  });

  it("exactly-moderate → moderate; exactly-high → high", () => {
    expect(budgetVerdict(200, budget)).toBe("moderate");
    expect(budgetVerdict(400, budget)).toBe("high");
  });

  it("high+1 → over (out of the SRD table — the honest state)", () => {
    expect(budgetVerdict(401, budget)).toBe("over");
  });
});
