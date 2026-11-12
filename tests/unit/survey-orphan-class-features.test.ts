/**
 * The read-only survey of class features held with no level in their class (walk M9):
 * the feature id, the total level and the counter's uses left / maximum as computed
 * today. Catalogue ids and numbers only: never a user, a character, a name or free text.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyOrphanClassFeatures } from "../../scripts/survey-orphan-class-features";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string) {
  const envelope = serializeCharacterEnvelope(doc);
  return {
    path,
    data: { schema: 3, build: envelope.build, state: envelope.state } as RawMap,
  };
}

const bard = makeCharacterDoc(
  {
    name: assertNonEmptyString("Secret Bard"),
    classes: [{ classId: "bard", level: 10 }],
    features: [
      { srdId: "fighter-second-wind", notes: "granted by the DM" },
      { srdId: "rogue-uncanny-dodge" },
      { srdId: "bard-bardic-inspiration" },
    ],
  },
  { trackers: { "fighter-second-wind": { used: 1 } } }
);
const fighter = makeCharacterDoc({
  name: assertNonEmptyString("Plain Fighter"),
  classes: [{ classId: "fighter", level: 5 }],
  features: [{ srdId: "fighter-second-wind" }],
});

describe("surveyOrphanClassFeatures", () => {
  const survey = surveyOrphanClassFeatures([
    parent(bard, "users/uid-alpha/characters/char-one"),
    parent(fighter, "users/uid-beta/characters/char-two"),
  ]);

  it("lists only the features held without their class, with today's uses", () => {
    expect(survey.characters).toBe(2);
    expect(survey.charactersWithOrphans).toBe(1);
    expect(survey.holdings).toEqual([
      // Today a Bard 10 gets Second Wind's level-10 count (4), one spent.
      { feature: "fighter-second-wind", totalLevel: 10, uses: { current: 3, max: 4 } },
      { feature: "rogue-uncanny-dodge", totalLevel: 10 },
    ]);
  });

  it("carries no user, character, name or free text", () => {
    const out = JSON.stringify(survey);
    for (const leak of [
      "uid-alpha",
      "uid-beta",
      "char-one",
      "char-two",
      "Secret Bard",
      "Plain Fighter",
      "granted by the DM",
    ])
      expect(out).not.toContain(leak);
  });
});
