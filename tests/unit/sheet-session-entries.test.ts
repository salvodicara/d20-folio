/**
 * A sheet's own log read as session lines (a character in no campaign): its solo fight
 * is a fight in the report, as a campaign fight is. «Start combat» opens it, each End
 * Turn starts its next round, «End combat» or a rest closes it. A sheet whose fight was
 * never started by hand (the classic band: the first End Turn is the first sign) opens
 * it at that End Turn. The fight's id comes from the line that opened it, so a reload
 * reads the same fight.
 */
import { describe, expect, it } from "vitest";

import { sessionReportSections, sheetSessionEntries } from "@/lib/session-log";
import type { LogEntry } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

const ME = "pc-me";
const line = (id: string, event: CombatEvent): LogEntry => ({
  id,
  ts: Number(id),
  event,
});
const swing = (id: string): LogEntry =>
  line(id, {
    kind: "action-use",
    action: { custom: "Longsword" },
    effect: "attack",
    slot: "action",
  });
const rest = (id: string): LogEntry => line(id, { kind: "rest", restKind: "short" });

/** The report's shape: a section per fight (its rounds and their line ids), the rest
 *  outside. */
function shape(log: LogEntry[]) {
  return sessionReportSections(sheetSessionEntries(log, ME)).map((section) =>
    section.kind === "outside"
      ? { outside: section.entries.map((e) => e.id) }
      : {
          fight: section.encounterId,
          rounds: section.rounds.map((r) => [r.round, ...r.entries.map((e) => e.id)]),
        }
  );
}

describe("a solo fight in the sheet's own report", () => {
  it("Start combat, End Turn and End combat bound a fight round by round", () => {
    expect(
      shape([
        swing("1"),
        line("2", { kind: "fight-start" }),
        swing("3"),
        line("4", { kind: "turn-end", round: 2 }),
        swing("5"),
        line("6", { kind: "fight-end" }),
        swing("7"),
      ])
    ).toEqual([
      { outside: ["1"] },
      {
        fight: "solo:2",
        rounds: [
          [1, "3"],
          [2, "5"],
        ],
      },
      { outside: ["7"] },
    ]);
  });

  it("with no Start combat, the first End Turn opens the fight", () => {
    expect(
      shape([
        swing("1"),
        line("2", { kind: "turn-end", round: 2 }),
        swing("3"),
        line("4", { kind: "turn-end", round: 3 }),
        swing("5"),
      ])
    ).toEqual([
      { outside: ["1"] },
      {
        fight: "solo:2",
        rounds: [
          [2, "3"],
          [3, "5"],
        ],
      },
    ]);
  });

  it("a rest closes a fight left open; the next End Turn opens a new one", () => {
    expect(
      shape([
        line("1", { kind: "fight-start" }),
        swing("2"),
        rest("3"),
        line("4", { kind: "turn-end", round: 2 }),
        swing("5"),
      ])
    ).toEqual([
      { fight: "solo:1", rounds: [[1, "2"]] },
      { outside: ["3"] },
      { fight: "solo:4", rounds: [[2, "5"]] },
    ]);
  });

  it("an extra turn stays a line of its round, not a new round", () => {
    const extra = line("3", {
      kind: "turn-end",
      round: 1,
      extraTurn: { source: "rogue-thief-reflexes", n: 1, of: 1 },
    });
    expect(shape([line("1", { kind: "fight-start" }), swing("2"), extra])).toEqual([
      { fight: "solo:1", rounds: [[1, "2", "3"]] },
    ]);
  });

  it("an End combat with no fight on adds nothing", () => {
    expect(shape([swing("1"), line("2", { kind: "fight-end" })])).toEqual([
      { outside: ["1"] },
    ]);
  });
});
