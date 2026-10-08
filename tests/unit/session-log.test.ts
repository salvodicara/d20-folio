import { describe, expect, it } from "vitest";

import { buildReport, foldSession } from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";

const DM = "dm-uid";

let clock = 0;
function event(id: string, by: string, ev: PlayEvent): LogItem {
  return { type: "event", id, by, at: ++clock, event: ev };
}

/** A short evening: a manual hit before the fight, one encounter with two rounds,
 *  then a rest. Players record without knowing the round; the log position tells. */
const evening: LogItem[] = [
  event("a1", "ana", { kind: "damage", amount: 3 }),
  event("d1", DM, { kind: "encounter-start", encounterId: "goblins" }),
  event("d2", DM, { kind: "round-start", round: 1 }),
  event("a2", "ana", {
    kind: "action",
    actor: "pc-ana",
    source: { custom: "Longsword" },
    targets: ["monster-1"],
    outcome: "hit",
  }),
  event("a3", "ana", { kind: "damage", amount: 9, actor: "pc-ana", target: "monster-1" }),
  event("d3", DM, { kind: "down", target: "monster-1" }),
  event("d4", DM, { kind: "round-start", round: 2 }),
  event("b1", "ben", { kind: "heal", amount: 7, target: "pc-ana" }),
  event("d5", DM, { kind: "encounter-end", encounterId: "goblins", outcome: "victory" }),
  event("a4", "ana", { kind: "rest", rest: "short", actor: "pc-ana" }),
];

describe("foldSession", () => {
  it("places each event in its encounter and round by log position alone", () => {
    const entries = foldSession(evening, { dmUid: DM });
    const where = Object.fromEntries(
      entries.map((e) => [e.id, [e.encounterId ?? null, e.round ?? null]])
    );
    expect(where).toEqual({
      a1: [null, null],
      d1: ["goblins", null],
      d2: ["goblins", 1],
      a2: ["goblins", 1],
      a3: ["goblins", 1],
      d3: ["goblins", 1],
      d4: ["goblins", 2],
      b1: ["goblins", 2],
      d5: ["goblins", 2],
      a4: [null, null],
    });
  });

  it("lets an author correct their own line and the DM correct anyone's", () => {
    const log: LogItem[] = [
      ...evening,
      {
        type: "correct",
        id: "c1",
        by: "ana",
        at: ++clock,
        target: "a3",
        event: { kind: "damage", amount: 11, actor: "pc-ana", target: "monster-1" },
      },
      {
        type: "correct",
        id: "c2",
        by: DM,
        at: ++clock,
        target: "b1",
        event: { kind: "heal", amount: 8, target: "pc-ana" },
      },
    ];
    const byId = new Map(foldSession(log, { dmUid: DM }).map((e) => [e.id, e]));
    expect(byId.get("a3")).toMatchObject({ corrected: true, event: { amount: 11 } });
    expect(byId.get("b1")).toMatchObject({ corrected: true, event: { amount: 8 } });
  });

  it("ignores a correction or retraction of someone else's line by a player", () => {
    const log: LogItem[] = [
      ...evening,
      {
        type: "correct",
        id: "c1",
        by: "ben",
        at: ++clock,
        target: "a3",
        event: { kind: "damage", amount: 1 },
      },
      { type: "retract", id: "r1", by: "ben", at: ++clock, target: "a2" },
    ];
    expect(foldSession(log, { dmUid: DM })).toEqual(foldSession(evening, { dmUid: DM }));
  });

  it("drops a retracted line and re-derives positions when a marker is retracted", () => {
    const log: LogItem[] = [
      ...evening,
      { type: "retract", id: "r1", by: DM, at: ++clock, target: "d4" },
    ];
    const entries = foldSession(log, { dmUid: DM });
    expect(entries.map((e) => e.id)).not.toContain("d4");
    expect(entries.find((e) => e.id === "b1")?.round).toBe(1);
  });

  it("keeps the first of two items that share an id and ignores unknown targets", () => {
    const log: LogItem[] = [
      ...evening,
      event("a1", "ana", { kind: "damage", amount: 99 }),
      { type: "retract", id: "r1", by: DM, at: ++clock, target: "missing" },
    ];
    expect(foldSession(log, { dmUid: DM })).toEqual(foldSession(evening, { dmUid: DM }));
  });
});

describe("buildReport", () => {
  it("groups the evening into outside play and the encounter's rounds", () => {
    const report = buildReport(foldSession(evening, { dmUid: DM }));
    const shape = report.map((section) =>
      section.kind === "outside"
        ? { outside: section.entries.map((e) => e.id) }
        : {
            encounter: section.encounterId,
            outcome: section.outcome ?? null,
            rounds: section.rounds.map((r) => [r.round, r.entries.map((e) => e.id)]),
          }
    );
    expect(shape).toEqual([
      { outside: ["a1"] },
      {
        encounter: "goblins",
        outcome: "victory",
        rounds: [
          [1, ["a2", "a3", "d3"]],
          [2, ["b1"]],
        ],
      },
      { outside: ["a4"] },
    ]);
  });

  it("keeps lines recorded before the first round in an unnumbered round", () => {
    const log: LogItem[] = [
      event("d1", DM, { kind: "encounter-start", encounterId: "ambush" }),
      event("a1", "ana", { kind: "condition", conditionId: "prone", gained: true }),
    ];
    const [section] = buildReport(foldSession(log, { dmUid: DM }));
    expect(section).toEqual({
      kind: "encounter",
      encounterId: "ambush",
      rounds: [{ round: null, entries: [expect.objectContaining({ id: "a1" })] }],
    });
  });

  it("is deterministic: the same log always yields the same report", () => {
    const once = buildReport(foldSession(evening, { dmUid: DM }));
    const twice = buildReport(foldSession(structuredClone(evening), { dmUid: DM }));
    expect(twice).toEqual(once);
  });
});
