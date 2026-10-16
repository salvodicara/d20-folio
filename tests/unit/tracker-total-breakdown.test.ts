/**
 * Every number explained (re-foundation phase 2): how many uses a resource has.
 * A tracker's total is a small formula ("CHA", "PB", "level*5", "level*2+INT"); its
 * breakdown names each term: an ability modifier (raised to the minimum of 1 the
 * rule grants, with the reason on tap), the Proficiency Bonus, the level, a fixed
 * count, and a multiplier explained on tap. The guard runs every formula the
 * catalogue uses (and the forms the evaluator supports) over every dev scenario,
 * so the explanation always sums to the total the sheet shows.
 */

import { describe, expect, it } from "vitest";

import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import { resolveTrackerTotal, trackerTotalBreakdown } from "@/lib/smart-tracker";
import { breakdownTotal, type RawBreakdownPart } from "@/lib/value-breakdown";
import { makeCharacterDoc } from "./_helpers";

const FORMULAS = [
  "0",
  "1",
  "3",
  "10",
  "PB",
  "WIS",
  "INT",
  "CHA",
  "DEX",
  "level",
  "level*5",
  "PB*2",
  "INT*2",
  "level*2+INT",
  "1+level",
  "ceil(level/2)",
  "floor(level/2)",
  "max(WIS,CHA)",
  "level+max(WIS,CHA)",
];

function labelOf(part: RawBreakdownPart): string {
  if ("term" in part.label) return `term:${part.label.term}`;
  if ("ability" in part.label) return `ability:${part.label.ability}`;
  return "loc";
}

const rows = (parts: RawBreakdownPart[]) =>
  parts.map((p) => [labelOf(p), "value" in p ? p.value : 0]);

function bard(cha: number) {
  const doc = makeCharacterDoc({ classId: "bard", level: 5 });
  doc.character.abilityScores = { ...doc.character.abilityScores, CHA: cha };
  return doc;
}

describe("tracker total breakdown", () => {
  it("names the ability modifier behind a CHA-based pool", () => {
    expect(rows(trackerTotalBreakdown("CHA", bard(16)))).toEqual([["ability:CHA", 3]]);
  });

  it("raises a low modifier to the minimum of 1 and says why", () => {
    const [part] = trackerTotalBreakdown("CHA", bard(8));
    expect(part).toMatchObject({
      label: { ability: "CHA" },
      value: 1,
      why: { term: "breakdown.why.trackerMinimumOne" },
    });
  });

  it("splits a sum into its terms and explains a multiplier", () => {
    const doc = makeCharacterDoc({ classId: "wizard", level: 6 });
    doc.character.abilityScores = { ...doc.character.abilityScores, INT: 18 };
    const parts = trackerTotalBreakdown("level*2+INT", doc);
    expect(rows(parts)).toEqual([
      ["term:common.level", 12],
      ["ability:INT", 4],
    ]);
    expect(parts[0]).toMatchObject({
      why: { term: "breakdown.why.trackerTimes", params: { value: 6, factor: 2 } },
    });
  });

  it("labels the Proficiency Bonus and a fixed count", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 5 });
    expect(rows(trackerTotalBreakdown("PB", doc))).toEqual([
      ["term:character.proficiencyBonus", 3],
    ]);
    expect(rows(trackerTotalBreakdown("2", doc))).toEqual([
      ["term:breakdown.tracker.fixed", 2],
    ]);
  });

  it("sums to the resolved total for every formula over every dev scenario", () => {
    for (const id of Object.keys(DEV_SCENARIOS)) {
      const doc = buildDevScenario(id);
      if (!doc) continue;
      for (const formula of FORMULAS) {
        for (const scalingLevel of [undefined, 3]) {
          expect(
            breakdownTotal(trackerTotalBreakdown(formula, doc, scalingLevel)),
            `${id} ${formula} @${scalingLevel ?? "total"}`
          ).toBe(resolveTrackerTotal(formula, doc, scalingLevel));
        }
      }
    }
  });
});
