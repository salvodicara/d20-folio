/** `aggregateAbilityScores`: the effective scores every surface reads over a grant aggregate. */
import { describe, expect, it } from "vitest";
import { aggregateAbilityScores } from "@/lib/compute";

const base = { STR: 8, DEX: 14, CON: 19, INT: 10, WIS: 12, CHA: 10 };

describe("aggregateAbilityScores", () => {
  it("with nothing granted, the stored scores", () => {
    expect(aggregateAbilityScores(base, { abilityScoreFloors: {} })).toEqual(base);
  });

  it("a set-score item floors the score; an additive item adds up to its cap", () => {
    const scores = aggregateAbilityScores(base, {
      abilityScoreFloors: { STR: 19 },
      itemAbilityScoreBonus: { CON: 2, DEX: 2 },
      itemAbilityScoreCap: { CON: 20, DEX: 20 },
    });
    expect(scores).toMatchObject({ STR: 19, CON: 20, DEX: 16, WIS: 12 });
  });
});
