/**
 * The read-only owed-class-picks survey counts what the sheet will ask, from the
 * documents exactly as the app persists them, and reports counts only. Counts
 * from the 2024 class tables (Warlock Eldritch Invocations 5 at L5; Fighter
 * Weapon Mastery 3 at L1).
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyOwedClassPicks } from "../../scripts/survey-owed-class-picks";
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

const CANTRIPS = [
  { srdId: "eldritch-blast" },
  { srdId: "chill-touch" },
  { srdId: "minor-illusion" },
];

describe("surveyOwedClassPicks", () => {
  it("counts owed picks per class and kind, and only counts", () => {
    const owing = makeCharacterDoc({
      classes: [{ classId: "warlock", level: 5, invocationChoices: ["agonizing-blast"] }],
      spells: CANTRIPS,
    });
    const done = makeCharacterDoc({
      classes: [
        {
          classId: "fighter",
          level: 1,
          weaponMasteries: ["longsword", "greatsword", "longbow"],
        },
      ],
    });
    const survey = surveyOwedClassPicks([
      ...family(owing, "users/u1/characters/a"),
      ...family(done, "users/u2/characters/b"),
      { path: "users/u3/characters/c", data: { schema: 3, build: { name: 7 } } },
    ]);
    expect(survey).toEqual({
      format: "d20-folio-owed-class-picks-survey-v1",
      characters: 2,
      owingAny: 1,
      byClass: { warlock: { invocations: { characters: 1, picks: 4 } } },
      unreadable: { "invalid-envelope": 1 },
    });
    expect(JSON.stringify(survey)).not.toMatch(/u1|u2|u3|characters\/a/);
  });
});
