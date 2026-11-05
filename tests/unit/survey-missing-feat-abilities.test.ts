/**
 * The read-only feat-abilities survey counts what the sheet will ask, from the
 * documents exactly as the app persists them, and reports counts only. (The pack
 * leg, with a feat whose answer something reads, is
 * content-pack/tests/unit/survey-missing-feat-abilities.pack.test.ts.)
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyFeatAbilities } from "../../scripts/survey-missing-feat-abilities";
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

describe("surveyFeatAbilities", () => {
  it("a feat whose +1 is all there is owes nothing; an unreadable document is counted", () => {
    // Grappler lets you choose STR or DEX, and nothing else reads the choice.
    const grappler = makeCharacterDoc({ features: [{ srdId: "grappler" }] });
    const survey = surveyFeatAbilities([
      ...family(grappler, "users/u1/characters/a"),
      {
        path: "users/u2/characters/b",
        data: { schema: 3, build: { name: 7 } },
      },
    ]);
    expect(survey).toEqual({
      format: "d20-folio-feat-abilities-survey-v1",
      characters: 1,
      owingAny: 0,
      byFeat: {},
      unreadable: { "invalid-envelope": 1 },
    });
    expect(JSON.stringify(survey)).not.toMatch(/u1|u2|characters\/a/);
  });
});
