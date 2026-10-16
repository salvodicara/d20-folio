/**
 * Every number explained (re-foundation phase 2): the save DC a class feature
 * forces (Stunning Strike, Breath Weapon, Cunning Strike, a Grapple or Shove) reads
 * "8 + Proficiency Bonus + the ability", the same lines the spell save DC uses.
 * A Battle Master's maneuver DC uses the better of Strength and Dexterity, and the
 * tap says so. The guard sweeps every level, score and PB override, so the lines
 * always sum to the DC the sheet shows.
 */

import { describe, expect, it } from "vitest";

import {
  featureSaveDc,
  featureSaveDcBreakdown,
  maneuverSaveDc,
  maneuverSaveDcBreakdown,
} from "@/lib/compute";
import { breakdownTotal, type RawBreakdownPart } from "@/lib/value-breakdown";

function labelOf(part: RawBreakdownPart): string {
  if ("term" in part.label) return `term:${part.label.term}`;
  if ("ability" in part.label) return `ability:${part.label.ability}`;
  return "loc";
}
const rows = (parts: RawBreakdownPart[]) =>
  parts.map((p) => [labelOf(p), "value" in p ? p.value : 0]);

describe("feature save DC breakdown", () => {
  it("reads 8 + Proficiency Bonus + the feature's ability", () => {
    expect(rows(featureSaveDcBreakdown(5, "WIS", 16))).toEqual([
      ["term:breakdown.base", 8],
      ["term:character.proficiencyBonus", 3],
      ["ability:WIS", 3],
    ]);
  });

  it("uses the better of Strength and Dexterity for a maneuver, and says why", () => {
    const parts = maneuverSaveDcBreakdown(12, 18, 5);
    expect(rows(parts)).toEqual([
      ["term:breakdown.base", 8],
      ["term:character.proficiencyBonus", 3],
      ["ability:DEX", 4],
    ]);
    expect(parts[2]).toMatchObject({
      why: { term: "breakdown.why.maneuverBestAbility" },
    });
  });

  it("sums to the shown DC at every level, score and PB override", () => {
    for (let level = 1; level <= 20; level++) {
      for (const pb of [undefined, null, 7]) {
        for (let score = 1; score <= 30; score++) {
          expect(breakdownTotal(featureSaveDcBreakdown(level, "CON", score, pb))).toBe(
            featureSaveDc(level, score, pb)
          );
          expect(
            breakdownTotal(maneuverSaveDcBreakdown(score, 31 - score, level, pb))
          ).toBe(maneuverSaveDc(score, 31 - score, level, pb));
        }
      }
    }
  });
});
