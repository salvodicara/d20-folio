/**
 * Notes written during play (owner direction 2026-10-23, row 11): `@who` names a
 * creature, `#where` a place, `!important` (any word starting with "!") marks the note
 * important; each note carries the time and, in a fight, the encounter and round where
 * it was written, and shared notes go into the session Diario beside the actions. The
 * marks are read from the text (nothing new is stored), so a corrected note always
 * reads its own marks. Pure model; nothing is wired to a screen.
 */
import { describe, expect, it } from "vitest";

import { foldSession, type LogItem } from "@/lib/session-log";
import { noteLines, parseNote, resolveMentions } from "@/lib/session-log/notes";

describe("parseNote", () => {
  it("reads @who, #where and !important from the text", () => {
    expect(parseNote("@Bo found the key in #Duskwell !important")).toEqual({
      mentions: ["Bo"],
      places: ["Duskwell"],
      important: true,
    });
  });

  it("several marks, accents and dashes, and punctuation after a mark", () => {
    expect(parseNote("@Anaïs and @Bo-Ra met at #porto-vecchio, then #Rocca.")).toEqual({
      mentions: ["Anaïs", "Bo-Ra"],
      places: ["porto-vecchio", "Rocca"],
      important: false,
    });
  });

  it("any word starting with ! marks it important; a ! inside a word doesn't", () => {
    expect(parseNote("!! the bridge is out").important).toBe(true);
    expect(parseNote("watch out!").important).toBe(false);
    expect(parseNote("an email like a@b.c or a #").mentions).toEqual([]);
  });

  it("each mark once, in the order written", () => {
    expect(parseNote("@Bo then @bo then @Ana").mentions).toEqual(["Bo", "Ana"]);
  });
});

describe("resolveMentions", () => {
  const party = [
    { id: "pc-u1", name: "Anaïs Vel" },
    { id: "pc-u2", name: "Bo" },
    { id: "monster-1", name: "Goblin" },
  ];

  it("matches a name or its first word, ignoring case and accents", () => {
    expect(resolveMentions(["anais", "BO", "goblin"], party)).toEqual([
      { mention: "anais", id: "pc-u1" },
      { mention: "BO", id: "pc-u2" },
      { mention: "goblin", id: "monster-1" },
    ]);
  });

  it("a name no one has stays as written", () => {
    expect(resolveMentions(["Zed"], party)).toEqual([{ mention: "Zed", id: null }]);
  });
});

describe("noteLines: the notes as the Diario shows them", () => {
  const items: LogItem[] = [
    {
      id: "n1",
      by: "dm",
      at: 1000,
      type: "event",
      event: { kind: "note", text: "#Keep at dusk" },
    },
    {
      id: "e1",
      by: "dm",
      at: 2000,
      type: "event",
      event: { kind: "encounter-start", encounterId: "enc-1" },
    },
    {
      id: "r1",
      by: "dm",
      at: 2100,
      type: "event",
      event: { kind: "round-start", round: 1 },
    },
    {
      id: "r2",
      by: "dm",
      at: 2500,
      type: "event",
      event: { kind: "round-start", round: 2 },
    },
    {
      id: "n2",
      by: "u2",
      at: 2600,
      type: "event",
      event: { kind: "note", text: "@Goblin fled !important", actor: "pc-u2" },
    },
    { id: "d1", by: "u2", at: 2700, type: "event", event: { kind: "damage", amount: 4 } },
  ];
  const lines = noteLines(foldSession(items, { dmUid: "dm" }));

  it("only the notes, in the log's order, with their marks", () => {
    expect(lines.map((l) => l.id)).toEqual(["n1", "n2"]);
    expect(lines[0]).toMatchObject({ places: ["Keep"], important: false });
    expect(lines[1]).toMatchObject({
      mentions: ["Goblin"],
      important: true,
      actor: "pc-u2",
    });
  });

  it("each stamped with its time, and in a fight its encounter and round", () => {
    expect(lines[0]).toMatchObject({ at: 1000, encounterId: null, round: null });
    expect(lines[1]).toMatchObject({ at: 2600, encounterId: "enc-1", round: 2 });
  });

  it("a corrected note reads the marks of its new text", () => {
    const corrected = noteLines(
      foldSession(
        [
          ...items,
          {
            id: "c1",
            by: "u2",
            at: 3000,
            type: "correct",
            target: "n2",
            event: { kind: "note", text: "@Goblin fled to #Cave", actor: "pc-u2" },
          },
        ],
        { dmUid: "dm" }
      )
    );
    expect(corrected[1]).toMatchObject({ places: ["Cave"], important: false });
  });
});
