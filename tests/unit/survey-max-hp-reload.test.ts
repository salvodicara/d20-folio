/**
 * The read-only survey of characters whose reloaded max HP changes with #1313.
 * Counts only: never a user, a character, a name or free text.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { asRaceId } from "@/data/srd-names";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyMaxHpReload } from "../../scripts/survey-max-hp-reload";
import { makeCharacterDoc } from "./_helpers";

function parent(doc: CharacterDoc, path: string, shared = false) {
  const envelope = serializeCharacterEnvelope(doc);
  return {
    path,
    data: { schema: 3, build: envelope.build, state: {}, revision: 1, shared } as RawMap,
  };
}

const base = { abilityScores: { STR: 10, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 10 } };
const dwarfMonk = makeCharacterDoc({
  ...base,
  name: assertNonEmptyString("Secret Monk"),
  race: asRaceId("dwarf"),
  classes: [{ classId: "monk", level: 3 }],
  features: [],
  hp: { max: 27 },
});
const plainFighter = makeCharacterDoc({
  ...base,
  name: assertNonEmptyString("Plain Fighter"),
  race: asRaceId("human"),
  classes: [{ classId: "fighter", level: 2 }],
  features: [],
  hp: { max: 22 },
});

describe("survey — max HP on reload, before vs after #1313", () => {
  it("counts the Dwarf Monk (+3) and not the plain Fighter, with no names", async () => {
    const survey = await surveyMaxHpReload([
      parent(dwarfMonk, "users/u1/characters/c1", true),
      parent(plainFighter, "users/u1/characters/c2"),
      { path: "users/u1/characters/c3", data: { schema: 3, build: 7 } },
    ]);
    expect(survey).toMatchObject({
      characters: 3,
      shared: 1,
      changed: 1,
      changedShared: 1,
      byChange: { "+3": 1 },
    });
    expect(Object.values(survey.unreadable).reduce((a, b) => a + b, 0)).toBe(1);
    expect(JSON.stringify(survey)).not.toMatch(/Secret|Plain|u1|c1|c2/);
  });
});
