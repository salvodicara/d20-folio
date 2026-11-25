/** The read-only survey for #1320 (shape numbers the fence compares). Counts only. */
import { describe, expect, it } from "vitest";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyShapeNumbers } from "../../scripts/survey-shape-numbers";

const src = (path: string, data: Record<string, unknown>) => ({
  path,
  data: data as RawMap,
});

describe("survey — shape numbers", () => {
  it("counts characters by schema and play documents by playState.version, with none", () => {
    const survey = surveyShapeNumbers([
      src("users/u1/characters/c1", { schema: 3, build: { name: "Secret" } }),
      src("users/u1/characters/c2", { build: {} }),
      src("users/u1/characters/c1/combat/state", { playState: { version: 1 } }),
      src("users/u1/characters/c2/combat/state", { hp: {} }),
      src("campaigns/k1", { schema: 9 }),
    ]);
    expect(survey).toEqual({
      format: "d20-folio-shape-numbers-survey-v1",
      characterSchema: { "3": 1, none: 1 },
      playStateVersion: { "1": 1, none: 1 },
    });
    expect(JSON.stringify(survey)).not.toMatch(/Secret|u1|c1|c2|k1/);
  });
});
