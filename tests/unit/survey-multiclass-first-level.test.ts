/**
 * The read-only survey for #1324 (die maximum on the first class). Counts only.
 */
import { describe, expect, it } from "vitest";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import {
  firstLevelDelta,
  surveyMulticlassFirstLevel,
} from "../../scripts/survey-multiclass-first-level";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string) {
  const envelope = serializeCharacterEnvelope(doc);
  return {
    path,
    data: { schema: 3, build: envelope.build, state: {}, revision: 1 } as RawMap,
  };
}

describe("firstLevelDelta", () => {
  it("Fighter 1 / Wizard 3: the d10 maximum moves from Wizard's d6: +4 − 2 = +2", () => {
    // d10: 10 − 6 = 4 over the fixed value; d6: 6 − 4 = 2.
    expect(
      firstLevelDelta([
        { classId: "fighter", level: 1 },
        { classId: "wizard", level: 3 },
      ])
    ).toBe(2);
  });
  it("single class or first = highest: 0", () => {
    expect(firstLevelDelta([{ classId: "fighter", level: 5 }])).toBe(0);
    expect(
      firstLevelDelta([
        { classId: "wizard", level: 4 },
        { classId: "fighter", level: 1 },
      ])
    ).toBe(0);
  });
});

describe("survey — multiclass first level", () => {
  it("counts without names", async () => {
    const multi = makeCharacterDoc({
      name: assertNonEmptyString("Secret Mage"),
      classes: [
        { classId: "fighter", level: 1 },
        { classId: "wizard", level: 3 },
      ],
    });
    const single = makeCharacterDoc({
      name: assertNonEmptyString("Plain Rogue"),
      classes: [{ classId: "rogue", level: 2 }],
    });
    const survey = await surveyMulticlassFirstLevel([
      parent(multi, "users/u1/characters/c1"),
      parent(single, "users/u1/characters/c2"),
    ]);
    expect(survey).toMatchObject({
      characters: 2,
      multiclass: 1,
      primaryNotFirst: 1,
      byChange: { "+2": 1 },
      unreadable: {},
    });
    expect(JSON.stringify(survey)).not.toMatch(/Secret|Plain|u1|c1|c2/);
  });
});
