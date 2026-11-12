/**
 * A character in no campaign still gets «Resoconto» on the Play screen's right column
 * (coordinator, 2026-11-12: the three-column frame never drops a column): its own sheet
 * log, read as session lines with the character as `me`, ready for the one report
 * builder every surface uses.
 */
import { describe, expect, it } from "vitest";

import { ownSessionEntries } from "@/domains/play/own-session-log";
import { buildReport } from "@/lib/session-log";
import type { LogEntry } from "@/types/character";

const log: LogEntry[] = [
  { id: "a", ts: 1_000, event: { kind: "hp-heal", amount: 7, current: 20, max: 30 } },
  { id: "b", ts: 2_000, event: { kind: "turn-end" } as LogEntry["event"] },
  { id: "c", ts: 3_000, event: { kind: "hp-damage", amount: 4, current: 16, max: 30 } },
];

describe("ownSessionEntries", () => {
  it("reads each sheet line as a session line with the character as me, in order", () => {
    const entries = ownSessionEntries(log, "pc-me");
    expect(entries.map((e) => e.id)).toEqual(["a", "c"]);
    expect(entries[0]?.event).toMatchObject({ kind: "heal", amount: 7, target: "pc-me" });
    expect(entries[0]).toMatchObject({ by: "pc-me", at: 1_000 });
  });

  it("is what the report builder reads", () => {
    expect(buildReport(ownSessionEntries(log, "pc-me")).length).toBeGreaterThan(0);
  });

  it("an empty log has nothing to report", () => {
    expect(ownSessionEntries([], "pc-me")).toEqual([]);
  });
});
