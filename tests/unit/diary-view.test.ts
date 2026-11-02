/**
 * The Diario's automatic report (approved prototype camp-diary, 2026-11-02): the evening in
 * blocks — exploration, each fight with its rounds and foes, each rest with what it
 * restored — every block stamped with the time of its first line. Notes stay where they
 * were written. Evenings are numbered by their play log's id (its local day), oldest first.
 */
import { describe, expect, it } from "vitest";

import {
  diaryBlocks,
  oldPageTitle,
  sessionNumbers,
} from "@/domains/chronicle/diary-view";
import { buildReport, type PlayEvent, type SessionEntry } from "@/lib/session-log";

let n = 0;
const at = (minute: number) => Date.UTC(2026, 9, 23, 19, minute);
function line(
  minute: number,
  event: PlayEvent,
  fight?: { id: string; round?: number }
): SessionEntry {
  n += 1;
  return {
    id: `e${n}`,
    by: "u1",
    at: at(minute),
    event,
    corrected: false,
    corrections: 0,
    ...(fight ? { encounterId: fight.id, round: fight.round } : {}),
  };
}

const note = (minute: number, text: string, fight?: { id: string; round?: number }) =>
  line(minute, { kind: "note", text, actor: "pc-a" }, fight);
const goblins = { id: "f1" };
const evening = [
  note(5, "Orin asks for the stolen hammer."),
  line(10, {
    kind: "concentration",
    started: true,
    actor: "pc-a",
    spell: "detect-magic",
  } as PlayEvent),
  line(40, {
    kind: "encounter-start",
    encounterId: "f1",
    names: { m1: "Goblin 1", m2: "Goblin 2", m3: "Goblin Boss" },
  }),
  line(40, { kind: "round-start", round: 1 }, goblins),
  line(
    41,
    { kind: "damage", target: "pc-a", amount: 14 },
    {
      id: "f1",
      round: 1,
    }
  ),
  line(44, { kind: "round-start", round: 3 }, goblins),
  note(45, "The boss flees.", { id: "f1", round: 3 }),
  line(46, { kind: "down", target: "m1" }, { id: "f1", round: 3 }),
  line(47, { kind: "encounter-end", encounterId: "f1", outcome: "victory" }),
  line(90, { kind: "rest", rest: "short", actor: "pc-a" }),
  line(90, { kind: "rest", rest: "short", actor: "pc-b" }),
  line(91, { kind: "heal", target: "pc-a", amount: 7 }),
  note(95, "We head for the crypt."),
];

describe("diaryBlocks", () => {
  const blocks = diaryBlocks(buildReport(evening));

  it("splits the evening into exploration, the fight and the rest, in order", () => {
    expect(blocks.map((b) => b.kind)).toEqual(["explore", "fight", "rest", "explore"]);
  });

  it("stamps each block with the time of its first line", () => {
    expect(blocks.map((b) => b.at)).toEqual([at(5), at(41), at(90), at(95)]);
  });

  it("a fight says how many rounds it lasted, its foes once each and how it ended", () => {
    expect(blocks[1]).toMatchObject({
      kind: "fight",
      rounds: 3,
      foes: ["Goblin", "Goblin Boss"],
      outcome: "victory",
    });
  });

  it("keeps a note written during the fight inside the fight", () => {
    const fight = blocks[1];
    expect(fight?.entries.map((e) => e.event.kind)).toEqual(["damage", "note", "down"]);
  });

  it("a rest gathers everyone's rest and what it restored", () => {
    expect(blocks[2]?.entries.map((e) => e.event.kind)).toEqual(["rest", "rest", "heal"]);
  });
});

describe("sessionNumbers", () => {
  it("numbers the evenings by their play log, the oldest is 1, a second sitting after the first", () => {
    expect(
      sessionNumbers(["2026-10-23", "2026-09-04", "2026-10-23-2", "2026-09-11"])
    ).toEqual({
      "2026-09-04": 1,
      "2026-09-11": 2,
      "2026-10-23": 3,
      "2026-10-23-2": 4,
    });
  });

  it("a tenth sitting on one day stays after the second", () => {
    expect(sessionNumbers(["2026-10-23-10", "2026-10-23-2"])).toEqual({
      "2026-10-23-2": 1,
      "2026-10-23-10": 2,
    });
  });
});

describe("oldPageTitle", () => {
  it("keeps a title the table gave the evening", () => {
    expect(oldPageTitle("Il martello rubato")).toBe("Il martello rubato");
  });
  it("drops the old page's default name, which would contradict the evening's number", () => {
    expect(oldPageTitle("Session 7")).toBeUndefined();
    expect(oldPageTitle(" sessione 12 ")).toBeUndefined();
    expect(oldPageTitle("")).toBeUndefined();
  });
});
