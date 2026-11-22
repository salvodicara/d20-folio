/**
 * The read-only "what do the groups play" survey: counts of classes at their levels,
 * subclasses, species, the catalogue features on the sheets, and the class features
 * each character gains in its next four levels. Catalogue ids and counts only: never a
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
import { customInstanceId } from "./__helpers__/custom-items";

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
  spells: [
    { srdId: "fire-bolt", prepared: true },
    { srdId: "magic-missile", prepared: true },
    { srdId: "shield", prepared: false },
    {
      custom: true,
      name: "My secret spell",
      level: 1,
      school: "evocation",
      castingTime: "action",
      range: "Self",
      components: { v: true, s: false, m: false },
      duration: "Instantaneous",
      concentration: false,
      description: "",
      prepared: true,
      instanceId: customInstanceId("My secret spell"),
    } as never,
  ],
  weapons: [{ srdId: "dagger", quantity: 2 }],
  equipment: [
    { srdId: "potion-of-healing", quantity: 1 },
    { srdId: "leather-armor", quantity: 1, equipped: true },
    {
      custom: true,
      name: "Granny's locket",
      quantity: 1,
      instanceId: customInstanceId("Granny's locket"),
    } as never,
  ],
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

  it("counts the spells on the sheets: characters, and how many prepare each", () => {
    expect(survey.spells["magic-missile"]).toEqual({ characters: 1, prepared: 1 });
    expect(survey.spells.shield).toEqual({ characters: 1, prepared: 0 });
    expect(survey.spells["fire-bolt"]).toEqual({ characters: 1, prepared: 1 });
    expect(survey.customSpells).toBe(1);
  });

  it("counts the catalogue items they carry, by kind", () => {
    expect(survey.items.dagger).toEqual({ characters: 1, kind: "weapon" });
    expect(survey.items["leather-armor"]).toEqual({ characters: 1, kind: "armor" });
    expect(survey.items["potion-of-healing"]?.characters).toBe(1);
    expect(survey.customItems).toBe(1);
  });

  it("names the class features each character gains in its next four levels", () => {
    // Barbarian 8 brings no new feature id of its own; Barbarian 9 brings Brutal
    // Strike, Barbarian 11 Relentless Rage (four levels ahead: the group levels every
    // few sessions). A Wizard gains its level-2 subclass at 3, so it is not listed by id.
    expect(survey.upcoming["barbarian-brutal-strike"]).toBe(1);
    expect(survey.upcoming["barbarian-relentless-rage"]).toBe(1);
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
      "My secret spell",
      "Granny's locket",
    ]) {
      expect(out).not.toContain(leak);
    }
  });
});
