/**
 * A fight's heading in the evening's report (the Diario and the sheet's «Resoconto"):
 * its foes, its rounds, how it ended, and its time span. Walkthrough 2026-11-12 (M2):
 * «Fine scontro» left no trace: an ended fight now reads from its start to its end
 * («19:41–19:47»), a won one says so; a fight still running shows its start alone.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DiaryBlock } from "@/domains/chronicle/diary-view";
import { ReportBlocks } from "@/domains/chronicle/ui/ReportBlocks";
import type { SessionReportNames } from "@/lib/views/session-report-view";

const at = (minute: number) => new Date(2026, 9, 23, 19, minute).getTime();
const names = { pc: () => "Lyra" } as unknown as SessionReportNames;
const fight = (patch: Partial<Extract<DiaryBlock, { kind: "fight" }>>): DiaryBlock => ({
  kind: "fight",
  encounterId: "f1",
  at: at(41),
  entries: [],
  rounds: 3,
  foes: ["Goblin"],
  names: {},
  ...patch,
});
const heading = (block: DiaryBlock) => {
  render(<ReportBlocks blocks={[block]} names={names} players={{}} locale="en" />);
  return screen.getByRole("heading").textContent.replace(/\u00a0/g, " ");
};

describe("a fight's heading", () => {
  it("an ended fight reads from its start to its end", () => {
    expect(heading(fight({ endedAt: at(47) }))).toMatch(
      /Goblin · 3 rounds · 07:41.PM–07:47.PM$/i
    );
  });

  it("a won fight says so", () => {
    expect(heading(fight({ endedAt: at(47), outcome: "victory" }))).toContain(
      "· Victory ·"
    );
  });

  it("a fight still running shows its start alone", () => {
    expect(heading(fight({}))).toMatch(/3 rounds · 07:41.PM$/i);
  });
});
