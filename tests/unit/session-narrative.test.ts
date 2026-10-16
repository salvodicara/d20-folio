/**
 * The session narrative is customisable (owner, 2026-10-16): every member's lines merge
 * into one story, round by round, and a line can be edited (`correct`, existing), hidden
 * and shown again, or moved. Each override is an appended item, so history never changes
 * and every device folds the same narrative. docs/architecture/session-log-per-event.md.
 */
import { describe, expect, it } from "vitest";

import { buildReport, foldSession } from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";

const DM = "dm-uid";

let clock = 0;
const event = (id: string, by: string, ev: PlayEvent): LogItem => ({
  type: "event",
  id,
  by,
  at: ++clock,
  event: ev,
});
const meta = (
  id: string,
  by: string,
  body:
    | { type: "hide"; target: string }
    | { type: "show"; target: string }
    | { type: "move"; target: string; after: string | null }
): LogItem => ({ id, by, at: ++clock, ...body });

const fight: LogItem[] = [
  event("d1", DM, { kind: "encounter-start", encounterId: "goblins" }),
  event("d2", DM, { kind: "round-start", round: 1 }),
  event("a1", "ana", { kind: "damage", amount: 9, actor: "pc-ana", target: "monster-1" }),
  event("b1", "ben", { kind: "heal", amount: 4, target: "pc-ana" }),
  event("d3", DM, { kind: "round-start", round: 2 }),
  event("a2", "ana", { kind: "note", text: "Ana taunts the goblin" }),
];

const ids = (items: LogItem[], opts?: { includeHidden?: boolean }) =>
  foldSession(items, { dmUid: DM }, opts).map((entry) => entry.id);

describe("session narrative overrides", () => {
  it("a hidden line leaves the narrative and the report; showing it brings it back", () => {
    const hidden = [...fight, meta("h1", "ana", { type: "hide", target: "a1" })];
    expect(ids(hidden)).toEqual(["d1", "d2", "b1", "d3", "a2"]);
    const [section] = buildReport(foldSession(hidden, { dmUid: DM }));
    expect(
      section?.kind === "encounter" && section.rounds[0]?.entries.map((e) => e.id)
    ).toEqual(["b1"]);
    expect(ids([...hidden, meta("s1", "ana", { type: "show", target: "a1" })])).toEqual(
      ids(fight)
    );
  });

  it("the editor still sees a hidden line, marked", () => {
    const entries = foldSession(
      [...fight, meta("h1", DM, { type: "hide", target: "b1" })],
      { dmUid: DM },
      { includeHidden: true }
    );
    expect(entries.find((e) => e.id === "b1")).toMatchObject({ hidden: true });
    expect(entries.find((e) => e.id === "a1")?.hidden).toBeUndefined();
  });

  it("a moved line takes its new place, and its round follows the place", () => {
    const moved = [...fight, meta("m1", DM, { type: "move", target: "a2", after: "a1" })];
    expect(ids(moved)).toEqual(["d1", "d2", "a1", "a2", "b1", "d3"]);
    const a2 = foldSession(moved, { dmUid: DM }).find((e) => e.id === "a2");
    expect(a2).toMatchObject({ round: 1, moved: true });
    expect(
      ids([...fight, meta("m2", DM, { type: "move", target: "b1", after: "d2" })])
    ).toEqual(["d1", "d2", "b1", "a1", "d3", "a2"]);
  });

  it("only the line's author or the DM may hide or move it", () => {
    expect(ids([...fight, meta("h1", "ben", { type: "hide", target: "a1" })])).toEqual(
      ids(fight)
    );
    expect(
      ids([...fight, meta("m1", "ben", { type: "move", target: "a2", after: "a1" })])
    ).toEqual(ids(fight));
    expect(ids([...fight, meta("h2", DM, { type: "hide", target: "a1" })])).not.toContain(
      "a1"
    );
  });

  it("the markers that shape the story (start, rounds, end) never hide or move", () => {
    expect(ids([...fight, meta("h1", DM, { type: "hide", target: "d3" })])).toEqual(
      ids(fight)
    );
    expect(
      ids([...fight, meta("m1", DM, { type: "move", target: "d3", after: "d1" })])
    ).toEqual(ids(fight));
  });

  it("a move after an unknown line, or onto itself, changes nothing", () => {
    expect(
      ids([...fight, meta("m1", DM, { type: "move", target: "a2", after: "nope" })])
    ).toEqual(ids(fight));
    expect(
      ids([...fight, meta("m1", DM, { type: "move", target: "a2", after: "a2" })])
    ).toEqual(ids(fight));
  });

  it("the same items fold the same narrative on every device", () => {
    const items = [
      ...fight,
      meta("m1", DM, { type: "move", target: "a2", after: "a1" }),
      meta("h1", "ben", { type: "hide", target: "b1" }),
      meta("m2", DM, { type: "move", target: "a2", after: null }),
    ];
    expect(ids(items)).toEqual(["a2", "d1", "d2", "a1", "d3"]);
    expect(ids(items)).toEqual(ids([...items]));
  });
});
