/**
 * A fight left open in the app (nobody pressed End) stops swallowing the rest of the
 * evening in the report: read time only, nothing written. After a rest (no one rests in
 * a fight) or after an hour with no line (the app's own idle end, `encounterEndReason`),
 * the lines leave the fight. A fight that is still going, or one that was ended, is
 * untouched.
 */
import { describe, expect, it } from "vitest";

import { buildReport, foldSession } from "@/lib/session-log";
import { closeForgottenFights } from "@/lib/session-log/close-forgotten-fights";
import type { LogItem, PlayEvent } from "@/lib/session-log";

const DM = "dm";
const MIN = 60_000;
const line = (id: string, by: string, atMin: number, event: PlayEvent): LogItem => ({
  type: "event",
  id,
  by,
  at: atMin * MIN,
  event,
});
const hit = { kind: "damage", amount: 3, target: "pc-ana" } as const;

const sections = (items: LogItem[]) =>
  buildReport(closeForgottenFights(foldSession(items, { dmUid: DM }))).map((s) =>
    s.kind === "encounter"
      ? `fight:${s.rounds.flatMap((r) => r.entries.map((e) => e.id)).join(",")}`
      : `outside:${s.entries.map((e) => e.id).join(",")}`
  );

describe("a fight nobody ended", () => {
  it("a rest closes it: the rest and what follows are outside", () => {
    expect(
      sections([
        line("s", DM, 0, { kind: "encounter-start", encounterId: "7" }),
        line("a", "ana", 1, hit),
        line("r", "ana", 20, { kind: "rest", rest: "short", actor: "pc-ana" }),
        line("w", "ana", 25, { kind: "heal", amount: 2 }),
      ])
    ).toEqual(["fight:a", "outside:r,w"]);
  });

  it("an hour with no line closes it", () => {
    expect(
      sections([
        line("s", DM, 0, { kind: "encounter-start", encounterId: "7" }),
        line("a", "ana", 1, hit),
        line("b", "ana", 50, hit),
        line("c", "ana", 111, { kind: "heal", amount: 2 }),
      ])
    ).toEqual(["fight:a,b", "outside:c"]);
  });

  it("a fight that goes on, or one that ended, is untouched", () => {
    expect(
      sections([
        line("s", DM, 0, { kind: "encounter-start", encounterId: "7" }),
        line("a", "ana", 1, hit),
        line("b", "ana", 30, hit),
        line("e", DM, 31, { kind: "encounter-end", encounterId: "7" }),
        line("r", "ana", 40, { kind: "rest", rest: "short", actor: "pc-ana" }),
      ])
    ).toEqual(["fight:a,b", "outside:r"]);
  });
});
