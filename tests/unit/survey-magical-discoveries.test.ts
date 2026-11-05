/**
 * The read-only Magical Discoveries survey counts, from the documents exactly as the
 * app persists them, the College of Lore Bards (6+) whose picks are above their
 * highest spell slot, and reports counts only.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyMagicalDiscoveries } from "../../scripts/survey-magical-discoveries";
import { makeCharacterDoc } from "./_helpers";

const parent = (doc: CharacterDoc, path: string) => ({
  path,
  data: { schema: 3, build: serializeCharacterEnvelope(doc).build, state: {} } as RawMap,
});

const lore = (level: number, picks: string[]) =>
  makeCharacterDoc({
    classes: [{ classId: "bard", subclassId: "college-of-lore", level }],
    spells: picks.map((srdId) => ({ srdId, prepared: true, alwaysPrepared: true })),
  });

describe("surveyMagicalDiscoveries", () => {
  it("counts the picks above the Bard's highest slot, and nothing that names anyone", () => {
    const survey = surveyMagicalDiscoveries([
      // Bard 6: slots up to level 3. Wish (9) is over; Fireball (3) is not.
      parent(lore(6, ["wish", "fireball"]), "users/u1/characters/a"),
      parent(lore(9, ["fireball"]), "users/u2/characters/b"),
      // Below 6: no Magical Discoveries yet, not counted.
      parent(lore(5, ["wish"]), "users/u3/characters/c"),
      { path: "users/u4/characters/d", data: { schema: 3, build: { name: 7 } } },
    ]);
    expect(survey).toEqual({
      format: "d20-folio-magical-discoveries-survey-v1",
      loreBardsWithDiscoveries: 2,
      overCastable: 1,
      overCastablePicks: 1,
      unreadable: { "invalid-envelope": 1 },
    });
    expect(JSON.stringify(survey)).not.toMatch(/u1|u2|characters\//);
  });
});
