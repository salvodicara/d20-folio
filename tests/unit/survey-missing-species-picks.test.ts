/**
 * The read-only species-picks survey counts what the sheet will flag, from the
 * documents exactly as the app persists them, and reports counts only.
 */
import { describe, expect, it } from "vitest";

import { asRaceId } from "@/data/srd-names";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveySpeciesPicks } from "../../scripts/survey-missing-species-picks";
import { makeCharacterDoc } from "./_helpers";

function family(doc: CharacterDoc, path: string) {
  const envelope = serializeCharacterEnvelope(doc);
  return [
    { path, data: { schema: 3, build: envelope.build, state: {} } as RawMap },
    {
      path: `${path}/combat/state`,
      data: { playState: sessionToPlayStateV1(doc.session), round: 1 } as RawMap,
    },
  ];
}

describe("surveySpeciesPicks", () => {
  it("counts the missing picks per species, and only counts", () => {
    const bare = makeCharacterDoc({ race: asRaceId("elf"), skills: {} });
    const done = makeCharacterDoc(
      {
        race: asRaceId("elf"),
        skills: { perception: "proficient" },
        speciesSpellAbility: "WIS",
      },
      { grantBundleChoices: { "elf-lineage": "wood-elf" } }
    );
    const survey = surveySpeciesPicks([
      ...family(bare, "users/u1/characters/a"),
      ...family(done, "users/u2/characters/b"),
    ]);
    expect(survey).toEqual({
      format: "d20-folio-species-picks-survey-v1",
      characters: 2,
      missingAny: 1,
      bySpecies: {
        elf: {
          characters: 2,
          missing: {
            "skill:keen-senses": 1,
            "bundle:elf-lineage": 1,
            "species-spell-ability": 1,
          },
        },
      },
      unreadable: {},
    });
    expect(JSON.stringify(survey)).not.toMatch(/u1|u2|characters\/a/);
  });
});
