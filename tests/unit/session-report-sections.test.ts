/**
 * Every surface that shows the session report (the classic recap, the new Diario and
 * the new Play rail) builds it through one function, so a fight left open closes and a
 * fight nobody started is inferred in all of them alike.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { foldSession, isInferredFight } from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";
import { sessionReportSections } from "@/lib/session-log/session-report-sections";

const MIN = 60_000;
const line = (id: string, by: string, atMin: number, event: PlayEvent): LogItem => ({
  type: "event",
  id,
  by,
  at: atMin * MIN,
  event,
});
const sword = { srd: { kind: "equipment", key: "longsword", field: "name" } } as const;

describe("the one session-report builder", () => {
  it("closes a forgotten fight and infers one from attacks with no target", () => {
    const sections = sessionReportSections(
      foldSession(
        [
          line("s", "dm", 0, { kind: "encounter-start", encounterId: "7" }),
          line("r", "ana", 5, { kind: "rest", rest: "short", actor: "pc-ana" }),
          line("a", "ana", 30, { kind: "action", actor: "pc-ana", source: sword }),
          line("b", "ben", 31, { kind: "damage", amount: 3, target: "pc-ben" }),
          line("c", "ana", 32, { kind: "action", actor: "pc-ana", source: sword }),
        ],
        { dmUid: "dm" }
      )
    );
    expect(
      sections.map((s) => (s.kind === "encounter" ? isInferredFight(s) : "outside"))
    ).toEqual([false, "outside", true]);
  });

  it.each([
    "src/features/campaigns/SessionDayReport.tsx",
    "src/domains/chronicle/ui/DiaryTab.tsx",
    "src/domains/play/ui/PlayRight.tsx",
  ])("%s builds its report through it", (file) => {
    const source = readFileSync(resolve(__dirname, "../..", file), "utf8");
    expect(source).toContain("sessionReportSections(");
    expect(source).not.toMatch(/\bbuildReport\(/);
  });
});
