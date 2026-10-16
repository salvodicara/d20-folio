/**
 * Play outside a fight (owner, 2026-10-16): exploration, rests, rituals and downtime are
 * part of the session too. The report groups them into numbered SCENES, as a fight is
 * grouped into rounds: a scene starts at the session's first line, at an explicit
 * `scene-start` (with an optional title), after a rest and after a fight. Each scene
 * carries the time of its first line.
 */
import { describe, expect, it } from "vitest";

import { buildReport, foldSession } from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";
import {
  renderSessionReport,
  type SessionReportNames,
} from "@/lib/views/session-report-view";

const DM = "dm";
let clock = 0;
const ev = (
  id: string,
  by: string,
  event: PlayEvent,
  at = (clock += 60_000)
): LogItem => ({
  type: "event",
  id,
  by,
  at,
  event,
});

const evening: LogItem[] = [
  ev("n1", DM, { kind: "note", text: "The party reaches the ruined chapel" }),
  ev("a1", "ana", {
    kind: "action",
    actor: "pc-ana",
    source: { custom: "Detect Magic" },
  }),
  ev("r1", "ana", { kind: "rest", rest: "short", actor: "pc-ana" }),
  ev("a2", "ana", { kind: "note", text: "Ana studies the altar" }),
  ev("s1", DM, { kind: "scene-start", title: "The crypt" }),
  ev("n2", DM, { kind: "note", text: "Stairs lead down" }),
  ev("e1", DM, { kind: "encounter-start", encounterId: "ghouls" }),
  ev("e2", DM, { kind: "round-start", round: 1 }),
  ev("a3", "ana", { kind: "damage", amount: 5, actor: "pc-ana", target: "monster-1" }),
  ev("e3", DM, { kind: "encounter-end", encounterId: "ghouls", outcome: "victory" }),
  ev("n3", DM, { kind: "note", text: "They loot the crypt" }),
];

const shape = (items: LogItem[]) =>
  buildReport(foldSession(items, { dmUid: DM })).map((section) =>
    section.kind === "outside"
      ? {
          scene: section.scene,
          title: section.title ?? null,
          ids: section.entries.map((e) => e.id),
        }
      : { encounter: section.encounterId }
  );

describe("scenes outside a fight", () => {
  it("numbers the scenes: a rest closes one, a scene-start opens one, a fight sits between", () => {
    expect(shape(evening)).toEqual([
      { scene: 1, title: null, ids: ["n1", "a1", "r1"] },
      { scene: 2, title: null, ids: ["a2"] },
      { scene: 3, title: "The crypt", ids: ["n2"] },
      { encounter: "ghouls" },
      { scene: 4, title: null, ids: ["n3"] },
    ]);
  });

  it("each scene carries the time of its first line", () => {
    const report = buildReport(foldSession(evening, { dmUid: DM }));
    const first = report[0];
    expect(first?.kind === "outside" && first.startedAt).toBe(evening[0]?.at);
  });

  it("an empty scene (a marker with nothing after it) is not a section", () => {
    const items = [
      ev("n1", DM, { kind: "note", text: "Camp" }),
      ev("s1", DM, { kind: "scene-start", title: "Unused" }),
      ev("s2", DM, { kind: "scene-start", title: "Dawn" }),
      ev("n2", DM, { kind: "note", text: "They ride on" }),
    ];
    expect(shape(items)).toEqual([
      { scene: 1, title: null, ids: ["n1"] },
      { scene: 2, title: "Dawn", ids: ["n2"] },
    ]);
  });

  it("the export names each scene with its title and time", () => {
    const names: SessionReportNames = {
      pc: (id) => (id === "pc-ana" ? "Ana" : undefined),
      condition: (id) => id,
      action: (text) => ("custom" in text ? text.custom : "?"),
      spell: (ref) => ref,
      time: (at) => `T${at / 60_000}`,
    };
    const t = (key: string, args?: Record<string, string | number>) =>
      key === "sessionReport.scene"
        ? `Scene ${String(args?.n)}`
        : key === "sessionReport.encounter"
          ? `Encounter ${String(args?.n)}`
          : key;
    const text = renderSessionReport(
      buildReport(foldSession(evening.slice(0, 6), { dmUid: DM })),
      "S",
      t,
      names
    );
    const headings = text.split("\n").filter((line) => line.startsWith("## "));
    const first = evening[0]?.at ?? 0;
    expect(headings).toEqual([
      `## Scene 1 · T${first / 60_000}`,
      `## Scene 2 · T${first / 60_000 + 3}`,
      `## Scene 3: The crypt · T${first / 60_000 + 5}`,
    ]);
  });
});

describe("the cast list at the top of the copy", () => {
  const names: SessionReportNames = {
    pc: () => undefined,
    condition: (id) => id,
    action: () => "?",
    spell: (ref) => ref,
  };
  const t = (key: string, args?: Record<string, string | number>) =>
    key === "sessionReport.castParty"
      ? `Party: ${String(args?.list)}`
      : key === "sessionReport.castEncounters"
        ? `Encounters: ${String(args?.list)}`
        : key === "sessionReport.result.victory"
          ? "victory"
          : key;

  it("names the party, then each fight with its creatures counted and its outcome", () => {
    const items = [
      ev("e1", DM, {
        kind: "encounter-start",
        encounterId: "a",
        names: {
          "monster-1": "Goblin",
          "monster-2": "Goblin",
          "monster-3": "Goblin",
          "monster-4": "Wolf",
        },
      }),
      ev("e2", DM, { kind: "encounter-end", encounterId: "a", outcome: "victory" }),
      ev("e3", DM, {
        kind: "encounter-start",
        encounterId: "b",
        names: { "monster-5": "Ghoul" },
      }),
      ev("e4", DM, { kind: "encounter-end", encounterId: "b" }),
    ];
    const text = renderSessionReport(
      buildReport(foldSession(items, { dmUid: DM })),
      "S",
      t,
      names,
      {
        party: [
          { name: "Ana", classes: "Bard 3" },
          { name: "Ben", classes: "Paladin 2 / Warlock 1" },
        ],
      }
    );
    expect(text.split("\n").slice(0, 4)).toEqual([
      "# S",
      "",
      "Party: Ana (Bard 3), Ben (Paladin 2 / Warlock 1)",
      "Encounters: 1. Goblin ×3, Wolf — victory; 2. Ghoul",
    ]);
  });

  it("leaves out what it does not know: no party, no fights, no list", () => {
    const report = buildReport(foldSession(evening.slice(0, 2), { dmUid: DM }));
    expect(renderSessionReport(report, "S", t, names, { party: [] })).toBe(
      renderSessionReport(report, "S", t, names)
    );
  });
});

describe("scenes need no input at the table", () => {
  it("an automatic scene can be titled afterwards: a scene-start moved to its start", () => {
    const items = [
      ev("n1", DM, { kind: "note", text: "Camp" }),
      ev("r1", "ana", { kind: "rest", rest: "long", actor: "pc-ana" }),
      ev("n2", DM, { kind: "note", text: "They ride north" }),
      ev("n3", DM, { kind: "note", text: "A storm" }),
      // After the game, from the narrative editor: a title for scene 2.
      ev("t1", DM, { kind: "scene-start", title: "The road north" }),
      {
        id: "m1",
        by: DM,
        at: (clock += 60_000),
        type: "move",
        target: "t1",
        after: "r1",
      },
    ] as LogItem[];
    expect(shape(items)).toEqual([
      { scene: 1, title: null, ids: ["n1", "r1"] },
      { scene: 2, title: "The road north", ids: ["n2", "n3"] },
    ]);
  });

  it("a title added afterwards can be taken back (hide), and the scenes stay as they were", () => {
    const items = [
      ev("n1", DM, { kind: "note", text: "Camp" }),
      ev("t1", DM, { kind: "scene-start", title: "Oops" }),
      ev("n2", DM, { kind: "note", text: "Later" }),
      { id: "h1", by: DM, at: (clock += 60_000), type: "hide", target: "t1" },
    ] as LogItem[];
    expect(shape(items)).toEqual([{ scene: 1, title: null, ids: ["n1", "n2"] }]);
  });
});
