/**
 * The read-only Weapon Mastery survey (#1241) counts the stored masteries a class may
 * not pick (SRD 5.2.1: a Barbarian's are Melee weapons; a Rogue's are weapons it is
 * proficient with), from the documents as the app persists them, counts only.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyWeaponMasteryPicks } from "../../scripts/survey-weapon-mastery-picks";
import { makeCharacterDoc } from "./_helpers";

const doc = (path: string, character: CharacterDoc) => ({
  path,
  data: {
    schema: 3,
    build: serializeCharacterEnvelope(character).build,
    state: {},
  } as RawMap,
});

describe("surveyWeaponMasteryPicks", () => {
  it("counts masteries outside the class's list, per class, and only counts", () => {
    const barbarian = makeCharacterDoc({
      classes: [
        { classId: "barbarian", level: 4, weaponMasteries: ["greataxe", "dart"] },
      ],
    });
    const rogue = makeCharacterDoc({
      classes: [
        { classId: "rogue", level: 6, weaponMasteries: ["rapier", "greatsword"] },
      ],
    });
    const fighter = makeCharacterDoc({
      classes: [
        {
          classId: "fighter",
          level: 1,
          weaponMasteries: ["longsword", "greatsword", "longbow"],
        },
      ],
    });
    const survey = surveyWeaponMasteryPicks([
      doc("users/u1/characters/a", barbarian),
      doc("users/u2/characters/b", rogue),
      doc("users/u3/characters/c", fighter),
      { path: "users/u4/characters/d", data: { schema: 3, build: { name: 7 } } },
    ]);
    expect(survey).toEqual({
      format: "d20-folio-weapon-mastery-survey-v1",
      characters: 3,
      outsideAny: 2,
      byClass: {
        barbarian: { entries: 1, outside: 1, weapons: { dart: 1 } },
        rogue: { entries: 1, outside: 1, weapons: { greatsword: 1 } },
        fighter: { entries: 1, outside: 0, weapons: {} },
      },
      unreadable: { "invalid-envelope": 1 },
    });
  });
});
