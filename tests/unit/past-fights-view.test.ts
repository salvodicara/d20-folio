/**
 * The Scontro tab's «Scontri passati» (approved prototype camp-fight-idle): every fight of
 * the recorded evenings, newest first, with its evening's number, its foes, its rounds and
 * how it ended — read from the play logs (buildReport), never from the old chronicle text.
 */
import { describe, expect, it } from "vitest";

import { pastFights } from "@/domains/combat/past-fights-view";
import { buildReport, type PlayEvent, type SessionEntry } from "@/lib/session-log";

let n = 0;
const at = (day: number, minute: number) => Date.UTC(2026, 9, day, 19, minute);
function line(
  when: number,
  event: PlayEvent,
  fight?: { id: string; round: number }
): SessionEntry {
  n += 1;
  return {
    id: `e${n}`,
    by: "u1",
    at: when,
    event,
    corrected: false,
    corrections: 0,
    ...(fight ? { encounterId: fight.id, round: fight.round } : {}),
  };
}
const fight = (
  day: number,
  start: number,
  id: string,
  names: Record<string, string>,
  rounds: number,
  outcome?: "victory"
) => [
  line(at(day, start), { kind: "encounter-start", encounterId: id, names }),
  ...Array.from({ length: rounds }, (_, i) =>
    line(
      at(day, start + 1 + i),
      { kind: "damage", target: "pc-a", amount: 3 },
      {
        id,
        round: i + 1,
      }
    )
  ),
  line(at(day, start + 9), {
    kind: "encounter-end",
    encounterId: id,
    ...(outcome ? { outcome } : {}),
  }),
];

const evenings = [
  {
    id: "2026-10-23",
    sections: buildReport(
      fight(23, 0, "f3", { m1: "Raider 1", m2: "Raider Chief" }, 3, "victory")
    ),
  },
  {
    id: "2026-10-02",
    sections: buildReport([
      ...fight(2, 0, "f1", { w1: "Wolf 1", w2: "Wolf 2" }, 4),
      line(at(2, 40), { kind: "note", text: "We rest." }),
      ...fight(2, 45, "f2", { b1: "Bandit" }, 2, "victory"),
    ]),
  },
];

describe("pastFights", () => {
  const fights = pastFights(evenings, { "2026-10-02": 5, "2026-10-23": 8 });

  it("lists every fight, newest first, with its evening's number", () => {
    expect(fights.map((f) => [f.encounterId, f.session])).toEqual([
      ["f3", 8],
      ["f2", 5],
      ["f1", 5],
    ]);
  });

  it("names the foes once each, says how many rounds and how it ended", () => {
    expect(fights[0]).toMatchObject({
      foes: ["Raider", "Raider Chief"],
      rounds: 3,
      outcome: "victory",
    });
    expect(fights[2]).toMatchObject({ foes: ["Wolf"], rounds: 4 });
    expect(fights[2]?.outcome).toBeUndefined();
  });
});
