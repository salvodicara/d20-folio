/**
 * A hero has one initiative per fight. When two rolls land for the same hero (the
 * player's own roll from the sheet and the DM's typed roll for them, racing), the
 * fight keeps the last one, so the report shows that one line: the last value wins
 * and the order follows it (D&D Beyond Maps). Another hero's roll is untouched.
 */
import { describe, expect, it } from "vitest";

import { foldSession, type LogItem, type PlayEvent } from "@/lib/session-log";
import { sessionReportSections } from "@/lib/session-log/session-report-sections";

const DM = "dm";
const line = (id: string, by: string, atMin: number, event: PlayEvent): LogItem => ({
  type: "event",
  id,
  by,
  at: atMin * 60_000,
  event,
});

const fightLines = (items: LogItem[]) =>
  sessionReportSections(foldSession(items, { dmUid: DM })).flatMap((s) =>
    s.kind === "encounter" ? s.rounds.flatMap((r) => r.entries.map((e) => e.id)) : []
  );

describe("one initiative per hero per fight", () => {
  it("the player's roll then the DM's for the same hero: only the DM's (the last) stays", () => {
    expect(
      fightLines([
        line("s", DM, 0, { kind: "encounter-start", encounterId: "7" }),
        line("own", "ana", 1, {
          kind: "initiative",
          actor: "pc-ana",
          roll: 12,
          total: 15,
        }),
        line("dm-ana", DM, 1, {
          kind: "initiative",
          actor: "pc-ana",
          roll: 14,
          total: 17,
          rolledBy: "dm",
        }),
        line("dm-bo", DM, 1, {
          kind: "initiative",
          actor: "pc-bo",
          roll: 9,
          total: 11,
          rolledBy: "dm",
        }),
      ])
    ).toEqual(["dm-ana", "dm-bo"]);
  });

  it("the same hero in two fights keeps one roll in each", () => {
    expect(
      fightLines([
        line("s1", DM, 0, { kind: "encounter-start", encounterId: "1" }),
        line("a1", "ana", 1, {
          kind: "initiative",
          actor: "pc-ana",
          roll: 10,
          total: 13,
        }),
        line("e1", DM, 5, { kind: "encounter-end", encounterId: "1" }),
        line("s2", DM, 10, { kind: "encounter-start", encounterId: "2" }),
        line("a2", "ana", 11, {
          kind: "initiative",
          actor: "pc-ana",
          roll: 8,
          total: 11,
        }),
      ])
    ).toEqual(["a1", "a2"]);
  });
});
