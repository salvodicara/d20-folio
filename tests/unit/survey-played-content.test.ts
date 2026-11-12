/**
 * The read-only "what do the groups play" survey: counts of classes at their levels,
 * subclasses, species, the catalogue features on the sheets, and the class features
 * each character gains in its next two levels. Catalogue ids and counts only: never a
 * user, a character, a name or any free text.
 */
import { describe, expect, it } from "vitest";

import { asRaceId } from "@/data/srd-names";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyPlayedContent } from "../../scripts/survey-played-content";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string) {
  const envelope = serializeCharacterEnvelope(doc);
  return { path, data: { schema: 3, build: envelope.build, state: {} } as RawMap };
}

const barbarian = makeCharacterDoc({
  name: assertNonEmptyString("Secret Hero Name"),
  race: asRaceId("dwarf"),
  classes: [{ classId: "barbarian", subclassId: "berserker", level: 7 }],
  features: [
    { srdId: "alert", notes: "private player note" },
    {
      custom: true,
      title: "My homebrew thing",
      emoji: "*",
      source: "Homebrew",
      tags: [],
      contentBlocks: [],
      instanceId: "inst-1",
    } as never,
  ],
});
const wizard = makeCharacterDoc({
  name: assertNonEmptyString("Another Name"),
  race: asRaceId("elf"),
  classes: [{ classId: "wizard", level: 1 }],
});

describe("surveyPlayedContent", () => {
  const survey = surveyPlayedContent([
    parent(barbarian, "users/uid-alpha/characters/char-one"),
    parent(wizard, "users/uid-beta/characters/char-two"),
  ]);

  it("counts classes at their levels, subclasses, species and catalogue features", () => {
    expect(survey.characters).toBe(2);
    expect(survey.classLevels).toEqual({ "barbarian:7": 1, "wizard:1": 1 });
    expect(survey.subclasses).toEqual({ "barbarian:berserker": 1 });
    expect(survey.species).toEqual({ dwarf: 1, elf: 1 });
    expect(survey.features.alert).toBe(1);
    expect(survey.customFeatures).toBe(1);
  });

  it("names the class features each character gains in its next two levels", () => {
    // Barbarian 8 brings no new feature id of its own; Barbarian 9 brings Brutal
    // Strike. A Wizard gains its level-2 subclass at 3, so it is not listed by id.
    expect(survey.upcoming["barbarian-brutal-strike"]).toBe(1);
    expect(Object.keys(survey.upcoming).every((id) => !id.includes(" "))).toBe(true);
  });

  it("carries no user, character, name or free text", () => {
    const out = JSON.stringify(survey);
    for (const leak of [
      "uid-alpha",
      "uid-beta",
      "char-one",
      "char-two",
      "Secret Hero Name",
      "Another Name",
      "private player note",
      "My homebrew thing",
      "inst-1",
    ]) {
      expect(out).not.toContain(leak);
    }
  });
});
