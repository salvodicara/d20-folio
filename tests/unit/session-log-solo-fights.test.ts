/**
 * Members' solo fights in a campaign session (the DM runs no fight in the app): each
 * player may tap «Start combat» on their own sheet within the same minutes. The campaign
 * report reads them as ONE fight, from the earliest start to the latest end, and the
 * lines of members who never tapped start but acted inside that span join it. A solo
 * start is a strong signal for the inference, not a section of its own. A real
 * encounter always wins.
 */
import { describe, expect, it } from "vitest";

import { foldSession, sessionReportSections } from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";
import { combatEventToPlayEvent } from "@/lib/session-log/character-events";

const DM = "dm-uid";
const MIN = 60_000;

const line = (id: string, by: string, atMin: number, event: PlayEvent): LogItem => ({
  type: "event",
  id,
  by,
  at: atMin * MIN,
  event,
});
const start = (id: string, by: string, atMin: number) =>
  line(id, by, atMin, { kind: "solo-fight", started: true, actor: `pc-${by}` });
const end = (id: string, by: string, atMin: number) =>
  line(id, by, atMin, { kind: "solo-fight", started: false, actor: `pc-${by}` });
const hit = (id: string, by: string, atMin: number) =>
  line(id, by, atMin, {
    kind: "action",
    actor: `pc-${by}`,
    targets: ["monster-1"],
    outcome: "hit",
  });
const talk = (id: string, by: string, atMin: number) =>
  line(id, by, atMin, { kind: "note", text: "…", actor: `pc-${by}` });

/** The report's shape: each section with its line ids (markers are not lines). */
const report = (items: LogItem[]) =>
  sessionReportSections(foldSession(items, { dmUid: DM })).map((section) =>
    section.kind === "encounter"
      ? `fight:${section.rounds.flatMap((r) => r.entries.map((e) => e.id)).join(",")}`
      : `outside:${section.entries.map((e) => e.id).join(",")}`
  );

describe("members' solo fights in the campaign report", () => {
  it("three members start two minutes apart and end at different times: one fight", () => {
    expect(
      report([
        talk("walk", "ana", 0),
        start("sa", "ana", 10),
        start("sb", "ben", 12),
        hit("a1", "ana", 13),
        start("sc", "cleo", 14),
        hit("d1", "dario", 15),
        end("ea", "ana", 20),
        talk("mid", "ben", 21),
        end("eb", "ben", 22),
        end("ec", "cleo", 25),
        talk("after", "ana", 26),
        // Everyone ended: a lone blow after it is not this fight.
        hit("late", "ben", 27),
      ])
    ).toEqual(["outside:walk", "fight:a1,d1,mid", "outside:after,late"]);
  });

  it("one member forgets to end: the fight closes after the idle gap", () => {
    expect(
      report([
        start("sa", "ana", 0),
        start("sb", "ben", 1),
        hit("a1", "ana", 2),
        end("eb", "ben", 5),
        talk("later", "ben", 60),
      ])
    ).toEqual(["fight:a1", "outside:later"]);
  });

  it("one solo start alone is a fight, with no blow threshold", () => {
    expect(
      report([start("sa", "ana", 0), hit("a1", "ana", 1), end("ea", "ana", 2)])
    ).toEqual(["fight:a1"]);
  });

  it("a start and an end with nothing between leave no empty fight", () => {
    expect(
      report([talk("walk", "ana", 0), start("sa", "ana", 1), end("ea", "ana", 2)])
    ).toEqual(["outside:walk"]);
  });

  it("the sheet's start and end lines reach the campaign log as the signal", () => {
    expect(combatEventToPlayEvent({ kind: "fight-start" }, "pc-ana")).toEqual({
      kind: "solo-fight",
      started: true,
      actor: "pc-ana",
    });
    expect(combatEventToPlayEvent({ kind: "fight-end" }, "pc-ana")).toMatchObject({
      started: false,
    });
  });

  it("a real encounter overlapping the solo fights wins", () => {
    const sections = sessionReportSections(
      foldSession(
        [
          start("sa", "ana", 0),
          line("s", DM, 1, { kind: "encounter-start", encounterId: "goblins" }),
          start("sb", "ben", 2),
          hit("a1", "ana", 3),
          end("ea", "ana", 4),
          line("e", DM, 5, { kind: "encounter-end", encounterId: "goblins" }),
        ],
        { dmUid: DM }
      )
    );
    expect(
      sections.map((s) => (s.kind === "encounter" ? s.encounterId : "outside"))
    ).toEqual(["goblins"]);
  });
});
