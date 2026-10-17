/** One character's share of the session log: the lines where it acts or is acted on. */
import { describe, expect, it } from "vitest";
import {
  entriesInvolving,
  involvesCombatant,
  sessionCreatureNames,
  type PlayEvent,
  type SessionEntry,
} from "@/lib/session-log";

const me = "pc-u1";
const entry = (id: string, event: PlayEvent): SessionEntry => ({
  id,
  by: "u1",
  at: 0,
  event,
  corrected: false,
  corrections: 0,
});

describe("involvesCombatant", () => {
  it("my own actions, and what is done to me, are mine", () => {
    expect(involvesCombatant({ kind: "action", actor: me }, me)).toBe(true);
    expect(
      involvesCombatant({ kind: "damage", amount: 5, actor: "monster-1", target: me }, me)
    ).toBe(true);
    expect(
      involvesCombatant(
        { kind: "action", actor: "pc-u2", targets: ["monster-1", me] },
        me
      )
    ).toBe(true);
    expect(
      involvesCombatant(
        { kind: "condition", conditionId: "prone", gained: true, target: me },
        me
      )
    ).toBe(true);
    expect(involvesCombatant({ kind: "rest", rest: "short", actor: me }, me)).toBe(true);
  });

  it("another creature's lines, and the session markers, are not", () => {
    expect(
      involvesCombatant(
        { kind: "damage", amount: 5, actor: "pc-u2", target: "monster-1" },
        me
      )
    ).toBe(false);
    expect(involvesCombatant({ kind: "round-start", round: 2 }, me)).toBe(false);
    expect(involvesCombatant({ kind: "encounter-start", encounterId: "e" }, me)).toBe(
      false
    );
    expect(involvesCombatant({ kind: "note", text: "DM note" }, me)).toBe(false);
  });
});

describe("entriesInvolving and sessionCreatureNames", () => {
  const log = [
    entry("a", {
      kind: "encounter-start",
      encounterId: "e",
      names: { "monster-1": "Goblin" },
    }),
    entry("b", { kind: "action", actor: me, targets: ["monster-1"] }),
    entry("c", { kind: "damage", amount: 3, actor: "pc-u2", target: "monster-1" }),
    entry("d", { kind: "damage", amount: 5, actor: "monster-1", target: me }),
  ];

  it("keeps my lines in log order", () => {
    expect(entriesInvolving(log, me).map((e) => e.id)).toEqual(["b", "d"]);
  });

  it("names the session's creatures", () => {
    expect(sessionCreatureNames(log)).toEqual({ "monster-1": "Goblin" });
  });
});
