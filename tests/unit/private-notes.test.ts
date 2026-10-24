/**
 * A note the author keeps to themself (owner answer 2026-10-24: visible ONLY to its
 * author, not the DM). It is never a line of the campaign's session log; it lives
 * in the author's own owner-only store, with the same marks and stamps as a shared
 * note, and only the author's own Diario shows it among the shared ones, by time.
 */
import { describe, expect, it } from "vitest";

import {
  authorDiarioNotes,
  privateNoteDraft,
  privateNoteLines,
} from "@/lib/session-log/private-notes";
import type { NoteLine } from "@/lib/session-log/notes";

describe("privateNoteDraft", () => {
  it("trims, caps and stamps the note where it was written", () => {
    expect(
      privateNoteDraft("  @Bo lied !  ", 5000, { encounterId: "enc-1", round: 3 })
    ).toEqual({ text: "@Bo lied !", at: 5000, encounterId: "enc-1", round: 3 });
    expect(privateNoteDraft("x".repeat(600), 1, null)?.text).toHaveLength(500);
  });

  it("outside a fight it has no encounter or round; a blank note is nothing", () => {
    expect(privateNoteDraft("map the cellar", 1, null)).toEqual({
      text: "map the cellar",
      at: 1,
      encounterId: null,
      round: null,
    });
    expect(privateNoteDraft("   ", 1, null)).toBeNull();
  });
});

describe("the author's Diario", () => {
  const shared: NoteLine[] = [
    {
      id: "s1",
      text: "#Keep at dusk",
      by: "dm",
      at: 1000,
      encounterId: null,
      round: null,
      corrected: false,
      mentions: [],
      places: ["Keep"],
      important: false,
    },
    {
      id: "s2",
      text: "@Goblin fled",
      by: "u2",
      at: 3000,
      encounterId: "enc-1",
      round: 2,
      corrected: false,
      mentions: ["Goblin"],
      places: [],
      important: false,
    },
  ];
  const mine = privateNoteLines("u1", [
    { id: "p1", text: "@Bo lied !", at: 2000, encounterId: "enc-1", round: 1 },
  ]);

  it("private notes read their marks and say they are private", () => {
    expect(mine[0]).toMatchObject({
      id: "p1",
      by: "u1",
      mentions: ["Bo"],
      important: true,
      private: true,
      round: 1,
    });
  });

  it("they sit among the shared notes by time", () => {
    expect(authorDiarioNotes(shared, mine).map((n) => n.id)).toEqual(["s1", "p1", "s2"]);
  });

  it("with no private notes the Diario is the shared one", () => {
    expect(authorDiarioNotes(shared, [])).toEqual(shared);
  });
});
