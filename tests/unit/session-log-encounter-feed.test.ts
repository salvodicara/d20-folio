/**
 * encounter-feed — the Combat Chronicle as a view of the session log. Cases ported from
 * the retired render-time reconcile (`chronicle-reconcile.test.ts`): a player's declared
 * hit on a creature claims that creature's unattributed damage in the same round; the
 * amount is always the DM's; ambiguity is marked, never guessed; nothing is fabricated.
 */
import { describe, expect, it } from "vitest";

import {
  attributionCorrection,
  encounterFeed,
  foldSession,
  hideCombatants,
  mayAttribute,
  mayRetract,
  needsAttribution,
} from "@/lib/session-log";
import type { LogItem, PlayEvent } from "@/lib/session-log";

const DM = "dm";
let clock = 0;
const item = (id: string, by: string, event: PlayEvent): LogItem => ({
  type: "event",
  id,
  by,
  at: ++clock,
  event,
});
const start = item("s", DM, { kind: "encounter-start", encounterId: "7" });
const round = (n: number) => item(`r${n}`, DM, { kind: "round-start", round: n });
const dmg = (id: string, target: string, amount = 8) =>
  item(id, DM, { kind: "damage", amount, target });
const declare = (
  id: string,
  uid: string,
  targets: string[],
  outcome: "hit" | "miss" = "hit"
) =>
  item(id, uid, {
    kind: "action",
    actor: `pc-${uid}`,
    source: { custom: "Longsword" },
    targets,
    outcome,
  });

const feed = (...log: LogItem[]) =>
  encounterFeed(foldSession([start, ...log], { dmUid: DM }), "7");

describe("encounterFeed — one encounter, read from the log", () => {
  it("shows only the current encounter's lines, never its markers", () => {
    const before = dmg("old", "monster-1");
    const lines = encounterFeed(
      foldSession(
        [
          before,
          start,
          round(1),
          dmg("d1", "monster-1"),
          item("e", DM, { kind: "encounter-end", encounterId: "7" }),
          dmg("after", "monster-1"),
        ],
        { dmUid: DM }
      ),
      "7"
    );
    expect(lines.map((l) => [l.id, l.round])).toEqual([["d1", 1]]);
  });
});

describe("encounterFeed — auto-attribution (a view, never stored)", () => {
  it("a declared hit + that creature's pending damage ⇒ attributed, the DM's amount", () => {
    const [line, ...rest] = feed(
      round(2),
      declare("a", "mara", ["monster-1"]),
      dmg("d", "monster-1", 8)
    );
    expect(rest).toEqual([]); // the declaration folds into the damage line
    expect(line).toMatchObject({
      id: "d",
      auto: true,
      event: {
        kind: "damage",
        amount: 8,
        actor: "pc-mara",
        source: { custom: "Longsword" },
      },
    });
    expect(line?.uncertain).toBeUndefined();
    expect(line && needsAttribution(line)).toBe(false);
    // The log itself is untouched: the line still records no attacker.
    expect(line?.logged).toEqual({ kind: "damage", amount: 8, target: "monster-1" });
  });

  it("only pairs within the same round — another round stays pending", () => {
    const lines = feed(
      round(2),
      declare("a", "mara", ["monster-1"]),
      round(3),
      dmg("d", "monster-1")
    );
    expect(lines.map((l) => l.id)).toEqual(["a", "d"]);
    expect(lines[1]?.auto).toBeUndefined();
    expect(lines[1] && needsAttribution(lines[1])).toBe(true);
  });

  it("never re-claims damage already attributed or deliberately left unattributed", () => {
    const named = item("d1", DM, {
      kind: "damage",
      amount: 5,
      target: "monster-1",
      actor: "pc-bren",
    });
    const nobody = item("d2", DM, {
      kind: "damage",
      amount: 3,
      target: "monster-1",
      unattributed: true,
    });
    const lines = feed(round(2), declare("a", "mara", ["monster-1"]), named, nobody);
    expect(lines.map((l) => [l.id, l.auto ?? false])).toEqual([
      ["a", false],
      ["d1", false],
      ["d2", false],
    ]);
    expect(lines.some((l) => needsAttribution(l))).toBe(false);
  });

  it("a declared miss stays its own certain line and claims nothing", () => {
    const lines = feed(
      round(1),
      declare("a", "mara", ["monster-1"], "miss"),
      dmg("d", "monster-1")
    );
    expect(lines.map((l) => l.id)).toEqual(["a", "d"]);
    expect(lines[1] && needsAttribution(lines[1])).toBe(true);
  });

  it("a declared hit with no damage invents no amount", () => {
    const lines = feed(round(1), declare("a", "mara", ["monster-1"]));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.event.kind).toBe("action");
  });

  it("two players on the same creature and round ⇒ paired in log order, both uncertain", () => {
    const lines = feed(
      round(2),
      declare("a", "bren", ["monster-1"]),
      declare("b", "mara", ["monster-1"]),
      dmg("d1", "monster-1", 8),
      dmg("d2", "monster-1", 5)
    );
    expect(
      lines.map((l) => [l.event.kind === "damage" && l.event.actor, l.uncertain])
    ).toEqual([
      ["pc-bren", true],
      ["pc-mara", true],
    ]);
    expect(lines.every((l) => needsAttribution(l))).toBe(true); // the DM confirms
  });

  it("one declaration pairs with one drop; a second drop stays pending", () => {
    const lines = feed(
      round(2),
      declare("a", "mara", ["monster-1"]),
      dmg("d1", "monster-1"),
      dmg("d2", "monster-1")
    );
    expect(lines.map((l) => [l.id, l.auto ?? false])).toEqual([
      ["d1", true],
      ["d2", false],
    ]);
  });

  it("repeated swings by the same player stay certain", () => {
    const lines = feed(
      round(2),
      declare("a", "mara", ["monster-1"]),
      declare("b", "mara", ["monster-1"]),
      dmg("d1", "monster-1"),
      dmg("d2", "monster-1")
    );
    expect(lines.every((l) => l.auto === true && l.uncertain === undefined)).toBe(true);
  });

  it("a hit on several creatures claims one drop on each, never inventing the rest", () => {
    const lines = feed(
      round(1),
      declare("a", "cor", ["monster-1", "monster-2", "monster-3"]),
      dmg("d1", "monster-1", 22),
      dmg("d3", "monster-3", 11)
    );
    expect(lines.map((l) => [l.id, l.event.kind === "damage" && l.event.actor])).toEqual([
      ["d1", "pc-cor"],
      ["d3", "pc-cor"],
    ]);
  });

  it("damage recorded before the declaration in the same round still pairs (paper play)", () => {
    const lines = feed(
      round(1),
      dmg("d", "monster-1"),
      declare("a", "mara", ["monster-1"])
    );
    expect(lines.map((l) => [l.id, l.auto])).toEqual([["d", true]]);
  });
});

describe("attribution and retraction rights", () => {
  const dm = { uid: DM, isDm: true };
  const ben = { uid: "ben", isDm: false };
  const [onMonster, onBen, bensOwn] = feed(
    round(1),
    dmg("d1", "monster-1"),
    dmg("d2", "pc-ben"),
    item("p1", "ben", { kind: "heal", amount: 4, target: "pc-ben" })
  );

  it("the DM answers 'who struck?' anywhere; a player only for their own character", () => {
    if (!onMonster || !onBen) throw new Error("fixture");
    expect(mayAttribute(onMonster, dm)).toBe(true);
    expect(mayAttribute(onMonster, ben)).toBe(false);
    expect(mayAttribute(onBen, ben)).toBe(true);
  });

  it("a line is retracted by its author or the DM", () => {
    if (!onBen || !bensOwn) throw new Error("fixture");
    expect(mayRetract(onBen, dm)).toBe(true);
    expect(mayRetract(onBen, ben)).toBe(false);
    expect(mayRetract(bensOwn, ben)).toBe(true);
  });

  it("the correction is the same event with the attacker set, or marked 'no one'", () => {
    if (!onBen) throw new Error("fixture");
    expect(attributionCorrection(onBen, "monster-2")).toEqual({
      kind: "damage",
      amount: 8,
      target: "pc-ben",
      actor: "monster-2",
    });
    expect(attributionCorrection(onBen, null)).toEqual({
      kind: "damage",
      amount: 8,
      target: "pc-ben",
      unattributed: true,
    });
    // …and the fold accepts Ben's own answer.
    const log = [
      start,
      round(1),
      dmg("d2", "pc-ben"),
      {
        type: "correct",
        id: "c",
        by: "ben",
        at: 1,
        target: "d2",
        event: attributionCorrection(onBen, "monster-2"),
      },
    ] as LogItem[];
    expect(encounterFeed(foldSession(log, { dmUid: DM }), "7")[0]?.event).toMatchObject({
      actor: "monster-2",
    });
  });
});

describe("hideCombatants", () => {
  it("drops every line that names a hidden creature (an ambush stays secret)", () => {
    const lines = feed(
      round(1),
      dmg("d1", "monster-1"),
      item("d2", DM, { kind: "damage", amount: 4, target: "pc-ana", actor: "monster-2" }),
      declare("a", "ana", ["monster-2"], "miss")
    );
    expect(hideCombatants(lines, new Set(["monster-2"])).map((l) => l.id)).toEqual([
      "d1",
    ]);
  });
});
