/**
 * The Tesoro tab's «Chi ha preso cosa» (approved prototype camp-treasure): every coin
 * movement of the shared chest, newest first, with who did it (the player's name), what
 * moved in or out, and their note.
 */
import { describe, expect, it } from "vitest";

import { treasuryHistory } from "@/domains/treasury/treasury-history-view";
import type { TreasuryLogEntry } from "@/types/campaign";

const at = (day: number) => new Date(2026, 9, day, 21, 0);
const log: TreasuryLogEntry[] = [
  {
    amount: 85,
    currency: "gp",
    type: "remove",
    note: "Brindol market",
    by: "u-tib",
    at: at(9),
  },
  { amount: 120, currency: "gp", type: "add", note: "", by: "u-gone", at: at(23) },
  {
    amount: 4,
    currency: "sp",
    type: "add",
    note: "found in the crypt",
    by: "u-kaela",
    at: at(16),
  },
];
const players = { "u-tib": "Ludovica", "u-kaela": "Nico" };

describe("treasuryHistory", () => {
  const lines = treasuryHistory(log, players);

  it("lists every movement, newest first", () => {
    expect(lines.map((l) => l.at.getDate())).toEqual([23, 16, 9]);
  });

  it("says who, in or out, how much of which coin, and the note", () => {
    expect(lines[2]).toMatchObject({
      who: "Ludovica",
      direction: "out",
      amount: 85,
      currency: "gp",
      note: "Brindol market",
    });
    expect(lines[1]).toMatchObject({
      who: "Nico",
      direction: "in",
      amount: 4,
      currency: "sp",
    });
  });

  it("a member who left keeps the line, without a name", () => {
    expect(lines[0]).toMatchObject({
      who: null,
      direction: "in",
      amount: 120,
      note: null,
    });
  });
});
