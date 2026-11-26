/**
 * The read-only level-up dry-run survey: how many stored characters sit at each
 * class / subclass / level combination, so every live combination gets a level-up
 * test before the 2026-12-07 session. Catalogue ids and counts only: never a user, a
 * character id, a name or any free text.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyLevelUpCombos } from "../../scripts/survey-level-up-combos";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string) {
  const envelope = serializeCharacterEnvelope(doc);
  return { path, data: { schema: 3, build: envelope.build, state: {} } as RawMap };
}

const fighter = makeCharacterDoc({
  name: assertNonEmptyString("Secret Hero Name"),
  classes: [{ classId: "fighter", subclassId: "champion", level: 5 }],
});
const fighter2 = makeCharacterDoc({
  name: assertNonEmptyString("Another Secret"),
  classes: [{ classId: "fighter", subclassId: "champion", level: 5 }],
});
const multiclass = makeCharacterDoc({
  classes: [
    { classId: "wizard", level: 1 },
    { classId: "fighter", subclassId: "champion", level: 3 },
  ],
});
const low = makeCharacterDoc({ classes: [{ classId: "cleric", level: 2 }] });

const sources = [
  parent(fighter, "users/u1/characters/c1"),
  parent(fighter2, "users/u2/characters/c2"),
  parent(multiclass, "users/u1/characters/c3"),
  parent(low, "users/u3/characters/c4"),
  { path: "users/u1/characters/c1/public/sheet", data: {} as RawMap },
  { path: "users/u9/characters/bad", data: { build: "nope" } as unknown as RawMap },
];

describe("the level-up combinations survey", () => {
  const survey = surveyLevelUpCombos(sources);

  it("counts each whole build: classes in order, with subclass and level", () => {
    expect(survey.combos).toEqual({
      "fighter/champion:5": 2,
      "wizard:1 + fighter/champion:3": 1,
      "cleric:2": 1,
    });
  });

  it("counts the characters it read, and the unreadable ones by reason only", () => {
    expect(survey.characters).toBe(4);
    expect(Object.values(survey.unreadable).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("never prints a name, a user or a character id", () => {
    const text = JSON.stringify(survey);
    for (const secret of ["Secret", "Another", "u1", "u2", "u3", "c1", "c2", "c3", "c4"])
      expect(text).not.toContain(secret);
  });
});
