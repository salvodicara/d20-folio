/**
 * The read-only survey counts the Paladins holding the Defense style the old
 * level-up added on its own, and those of them with a second, picked style.
 * Counts only.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyPaladinAutoDefense } from "../../scripts/survey-paladin-auto-defense";
import { makeCharacterDoc } from "./_helpers";

const doc = (path: string, character: CharacterDoc) => ({
  path,
  data: {
    schema: 3,
    build: serializeCharacterEnvelope(character).build,
    state: {},
  } as RawMap,
});

const paladin = (features: string[]) =>
  makeCharacterDoc({
    classId: "paladin",
    level: 2,
    features: features.map((srdId) => ({ srdId })),
  });

describe("surveyPaladinAutoDefense", () => {
  it("counts the auto Defense and the two-style Paladins, and only counts", () => {
    const survey = surveyPaladinAutoDefense([
      doc(
        "users/u1/characters/a",
        paladin(["paladin-fighting-style-defense", "archery"])
      ),
      doc("users/u1/characters/b", paladin(["paladin-fighting-style-defense"])),
      doc("users/u2/characters/c", paladin(["archery"])),
      { path: "users/u3/characters/d", data: { schema: 3, build: { name: 7 } } },
    ]);
    expect(survey).toEqual({
      format: "d20-folio-paladin-auto-defense-survey-v1",
      withAutoDefense: 2,
      withTwoStyles: 1,
      unreadable: { "invalid-envelope": 1 },
    });
  });
});
