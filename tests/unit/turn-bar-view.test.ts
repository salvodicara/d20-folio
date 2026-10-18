/**
 * The Play turn bar's view model (design session, 2026-10-18): one row per resource
 * (Action, Bonus Action, Reaction, Movement) with what is used, the budget, whether it
 * is spent and the names spent on it. In exploration (no fight running) nothing gates:
 * uses are counted, a row is never spent. The mode is one shared derivation, so the bar
 * and the playbook agree on "combat" versus "exploration".
 */
import { describe, expect, it } from "vitest";

import { playMode } from "@/lib/play/cast-execution";
import { turnBarView, type TurnBarInput } from "@/lib/views/turn-bar-view";

const turn = (over: Partial<TurnBarInput> = {}): TurnBarInput => ({
  mode: "combat",
  selected: { action: [], bonus: [] },
  budget: { action: 1, bonus: 1 },
  reaction: { used: false },
  movement: { usedFt: 0, speedFt: 30 },
  ...over,
});

describe("playMode", () => {
  it("is combat in a campaign encounter, or solo once Initiative or a round is in", () => {
    expect(playMode({ sharedEncounter: true, soloRound: 1, soloInitiative: "" })).toBe(
      "combat"
    );
    expect(playMode({ sharedEncounter: false, soloRound: 2, soloInitiative: "" })).toBe(
      "combat"
    );
    expect(playMode({ sharedEncounter: false, soloRound: 1, soloInitiative: "14" })).toBe(
      "combat"
    );
    expect(playMode({ sharedEncounter: false, soloRound: 1, soloInitiative: " " })).toBe(
      "exploration"
    );
  });
});

describe("turnBarView", () => {
  it("one row per resource, open at the start of a turn", () => {
    expect(turnBarView(turn())).toEqual([
      { kind: "action", used: 0, budget: 1, state: "open", spentNames: [] },
      { kind: "bonus", used: 0, budget: 1, state: "open", spentNames: [] },
      { kind: "reaction", used: 0, budget: 1, state: "open", spentNames: [] },
      { kind: "move", used: 0, budget: 30, state: "open", spentNames: [] },
    ]);
  });

  it("in a fight, a slot used up to its budget is spent and names what spent it", () => {
    const rows = turnBarView(
      turn({
        selected: { action: [{ name: "Attack" }], bonus: [{ name: "Second Wind" }] },
        budget: { action: 2, bonus: 1 },
        reaction: { used: true, name: "Shield" },
        movement: { usedFt: 30, speedFt: 30 },
      })
    );
    expect(rows).toEqual([
      { kind: "action", used: 1, budget: 2, state: "open", spentNames: ["Attack"] },
      { kind: "bonus", used: 1, budget: 1, state: "spent", spentNames: ["Second Wind"] },
      { kind: "reaction", used: 1, budget: 1, state: "spent", spentNames: ["Shield"] },
      { kind: "move", used: 30, budget: 30, state: "spent", spentNames: [] },
    ]);
  });

  it("in exploration nothing gates: uses are counted, no row is ever spent", () => {
    const rows = turnBarView(
      turn({
        mode: "exploration",
        selected: { action: [{ name: "Search" }, { name: "Study" }], bonus: [] },
        reaction: { used: true },
        movement: { usedFt: 60, speedFt: 30 },
      })
    );
    expect(rows.map((row) => [row.kind, row.used, row.state])).toEqual([
      ["action", 2, "open"],
      ["bonus", 0, "open"],
      ["reaction", 1, "open"],
      ["move", 60, "open"],
    ]);
    expect(rows[0]?.spentNames).toEqual(["Search", "Study"]);
  });

  it("a reaction used without a known name still counts", () => {
    const reaction = turnBarView(turn({ reaction: { used: true } }))[2];
    expect(reaction).toMatchObject({ used: 1, state: "spent", spentNames: [] });
  });
});
