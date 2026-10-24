/**
 * Every number explained (re-foundation phase 2): the Proficiency Bonus is one line,
 * "by character level", whose tap explains the table in plain words (it grows by 1
 * every four levels, +2 at level 1 to +6 at level 17). A hand-set Proficiency Bonus
 * keeps that line and adds the manual adjustment, summing to the bonus set.
 */

import { describe, expect, it } from "vitest";

import { effectiveProficiencyBonus, proficiencyBonusBreakdown } from "@/lib/compute";
import { breakdownTotal } from "@/lib/value-breakdown";

describe("Proficiency Bonus breakdown", () => {
  it("is one line by character level, summing to the bonus at every level", () => {
    for (let level = 1; level <= 20; level++) {
      const parts = proficiencyBonusBreakdown(level);
      expect(parts).toHaveLength(1);
      expect(breakdownTotal(parts)).toBe(effectiveProficiencyBonus(level));
    }
  });

  it("explains the table on tap, with the level and the bonus", () => {
    const [part] = proficiencyBonusBreakdown(9);
    expect(part).toMatchObject({
      label: { term: "breakdown.proficiency.byLevel" },
      value: 4,
      why: { term: "breakdown.why.proficiencyByLevel", params: { level: 9, bonus: 4 } },
    });
  });

  it("adds the manual adjustment when the bonus is set by hand", () => {
    const parts = proficiencyBonusBreakdown(5, 4);
    expect(parts.map((p) => ["value" in p ? p.value : 0, p.label])).toEqual([
      [3, { term: "breakdown.proficiency.byLevel" }],
      [1, { term: "breakdown.override" }],
    ]);
    expect(breakdownTotal(parts)).toBe(4);
  });
});
