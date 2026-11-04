/**
 * The read-only clock survey counts the campaign characters' game clocks and live
 * round timers from the documents exactly as the app persists them, and reports
 * counts only.
 */
import { describe, expect, it } from "vitest";

import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyCharacterClocks } from "../../scripts/survey-character-clocks";
import { makeCharacterDoc } from "./_helpers";

function family(path: string, session: Partial<SessionState>) {
  const doc: CharacterDoc = makeCharacterDoc({}, session);
  const envelope = serializeCharacterEnvelope(doc);
  return [
    { path, data: { schema: 3, build: envelope.build, state: {} } as RawMap },
    {
      path: `${path}/combat/state`,
      data: { playState: sessionToPlayStateV1(doc.session), round: 1 } as RawMap,
    },
  ];
}

function campaign(path: string, members: Record<string, string | null>) {
  const memberDetails = Object.fromEntries(
    Object.entries(members).map(([uid, characterId]) => [
      uid,
      { displayName: "x", role: "player", characterId },
    ])
  );
  return { path, data: { memberDetails } as RawMap };
}

describe("surveyCharacterClocks", () => {
  it("counts set clocks, live timers and disagreeing campaigns, and only counts", () => {
    const survey = surveyCharacterClocks([
      // Campaign A: one sheet at 08:00 with two live timers, one at 20:00 → disagree.
      campaign("campaigns/A", { u1: "a", u2: "b", dm: null }),
      ...family("users/u1/characters/a", {
        timeOfDay: 480,
        effectTimers: {
          "spell-bless": { roundsLeft: 7 },
          "spell-shield-of-faith": { roundsLeft: 90 },
        },
      }),
      ...family("users/u2/characters/b", { timeOfDay: 1200 }),
      // Campaign B: a sheet with no clock beside u1's 08:00 → they disagree too; one
      // pointer to a deleted sheet; u1's sheet is in both campaigns, counted once.
      campaign("campaigns/B", { u3: "c", u4: "gone", u1: "a" }),
      ...family("users/u3/characters/c", {}),
      // A solo character: not in any campaign, not surveyed.
      ...family("users/u5/characters/solo", { timeOfDay: 600 }),
    ]);
    expect(survey).toEqual({
      format: "d20-folio-character-clocks-survey-v1",
      campaigns: 2,
      characters: 3,
      withTimeOfDay: 2,
      withEffectTimers: 1,
      effectTimers: 2,
      effectTimersByKey: { "spell-bless": 1, "spell-shield-of-faith": 1 },
      campaignsWhereClocksDisagree: 2,
      perCampaign: [
        { attached: 2, found: 2, withTimeOfDay: 2, distinctTimes: 2, liveTimers: 2 },
        { attached: 3, found: 2, withTimeOfDay: 1, distinctTimes: 2, liveTimers: 2 },
      ],
      unreadable: {},
    });
    expect(JSON.stringify(survey)).not.toMatch(/u1|u2|characters\/|campaigns\/|"A"|"B"/);
  });

  it("finds no disagreement when every member's clock is the same", () => {
    const survey = surveyCharacterClocks([
      campaign("campaigns/A", { u1: "a", u2: "b" }),
      ...family("users/u1/characters/a", { timeOfDay: 480 }),
      ...family("users/u2/characters/b", { timeOfDay: 480 }),
    ]);
    expect(survey.campaignsWhereClocksDisagree).toBe(0);
    expect(survey.perCampaign).toEqual([
      { attached: 2, found: 2, withTimeOfDay: 2, distinctTimes: 1, liveTimers: 0 },
    ]);
  });
});
