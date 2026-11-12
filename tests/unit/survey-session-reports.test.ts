/**
 * The session-report survey counts what the automatic report is built from, read-only
 * and anonymous: lines by kind, fights opened and closed, lines that land outside any
 * fight, damage still waiting for its attacker, actions on targets with no outcome, and
 * how many lines each writer recorded. Cases follow the stored shape: a session head
 * with its `log` array, plus per-event `items`.
 */
import { describe, expect, it } from "vitest";

import { surveySessionReports } from "../../scripts/survey-session-reports";

const event = (by: string, e: Record<string, unknown>, extra: object = {}) => ({
  id: `${by}-${String(e.kind)}-${Math.random()}`,
  by,
  at: 1,
  type: "event",
  event: e,
  ...extra,
});

const head = (log: unknown[], id = "camp1/sessionLogs/2026-11-11") => ({
  path: `campaigns/${id}`,
  data: { schema: 1, lastAt: 1, log },
});

describe("the session-report survey", () => {
  it("counts a closed fight, a fight left open and the lines around them", () => {
    const survey = surveySessionReports([
      head([
        event("ana", { kind: "action", actor: "pc-ana", targets: ["monster-1"] }),
        event("dm", { kind: "encounter-start", encounterId: "1" }),
        event("dm", { kind: "round-start", round: 1 }),
        event("ana", { kind: "damage", amount: 5, target: "pc-ana" }),
        event("ana", { kind: "damage", amount: 3, target: "pc-ana", unattributed: true }),
        event("ana", {
          kind: "action",
          actor: "pc-ana",
          targets: ["monster-1"],
          outcome: "hit",
        }),
        event("dm", { kind: "encounter-end", encounterId: "1" }),
        event("bo", { kind: "heal", amount: 4 }),
        event("dm", { kind: "encounter-start", encounterId: "2" }),
        event("bo", { kind: "heal", amount: 2 }),
        {
          id: "c1",
          by: "dm",
          at: 2,
          type: "correct",
          target: "x",
          event: { kind: "heal" },
        },
      ]),
    ]);

    expect(survey.sessions).toBe(1);
    expect(survey.fights).toBe(2);
    expect(survey.fightsNeverClosed).toBe(1);
    expect(survey.eventsOutsideFight).toBe(2); // the first action, Bo's first heal
    expect(survey.damageWithoutAttacker).toBe(1); // "no one" is an answer
    expect(survey.actionsWithoutOutcome).toBe(1);
    expect(survey.byKind).toMatchObject({
      damage: 2,
      heal: 2,
      correct: 1,
      "encounter-start": 2,
    });
    expect(survey.perSession[0]).toMatchObject({
      writers: 3,
      fewestLinesByAWriter: 2,
      mostLinesByAWriter: 5, // the DM: three markers, a start, a correction
      rounds: 1,
    });
  });

  it("a line stamped with the fight it saw counts inside it, wherever it lands", () => {
    const survey = surveySessionReports([
      head([
        event(
          "ana",
          { kind: "damage", amount: 2 },
          { seen: { encounterId: "7", round: 2 } }
        ),
      ]),
    ]);
    expect(survey.eventsOutsideFight).toBe(0);
    expect(survey.sessionsWithoutMarkers).toBe(1);
  });

  it("reads the per-event items after the head, in server order", () => {
    const at = (ms: number) => ({ toMillis: () => ms });
    const survey = surveySessionReports([
      head([event("dm", { kind: "encounter-start", encounterId: "1" })]),
      {
        path: "campaigns/camp1/sessionLogs/2026-11-11/items/b",
        data: {
          ...event("dm", { kind: "encounter-end", encounterId: "1" }),
          serverAt: at(20),
        },
      },
      {
        path: "campaigns/camp1/sessionLogs/2026-11-11/items/a",
        data: { ...event("ana", { kind: "heal", amount: 1 }), serverAt: at(10) },
      },
    ]);
    expect(survey.perSession[0]).toMatchObject({ eventsInFight: 1, fightsClosed: 1 });
  });

  it("never prints an id, a name or any text", () => {
    const survey = surveySessionReports([
      head(
        [event("secret-uid", { kind: "note", text: "secret words" })],
        "secret-camp/sessionLogs/s"
      ),
    ]);
    expect(JSON.stringify(survey)).not.toMatch(/secret/);
  });

  it("counts a malformed line as unreadable", () => {
    expect(surveySessionReports([head([{ nope: true }])]).unreadable).toBe(1);
  });
});
