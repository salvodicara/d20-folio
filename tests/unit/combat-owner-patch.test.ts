/**
 * The owner's `combat/state` write is only what the owner changed, against the server
 * state the edit was built on, so a peer's write in between (a DM hit, an ally's
 * condition) is never overwritten by a stale copy of the whole document:
 *
 * - Hit Points and death saves move by their delta (an increment): a heal entered
 *   while a hit lands keeps both;
 * - conditions and pending Concentration saves add or remove the items that changed;
 * - the play state changes key by key; any other field is the owner's, field by field.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { ownerCombatPatch } from "@/lib/combat-state-io";

const base = {
  hp: { current: 30, temp: 0 },
  conditions: ["prone"],
  deathSaves: { successes: 0, failures: 0 },
  initiativeRoll: 12,
  round: 2,
  bardicInspirationDie: "",
  pendingConcentrationSaves: [],
  playState: {
    version: 1,
    state: { trackers: { rage: { used: 1 } }, inspiration: false },
  },
};

describe("ownerCombatPatch", () => {
  it("nothing changed, nothing to write", () => {
    expect(ownerCombatPatch(base, structuredClone(base))).toEqual([]);
  });

  it("a heal moves Hit Points by its delta, so a hit landing meanwhile stays", () => {
    expect(ownerCombatPatch(base, { ...base, hp: { current: 35, temp: 0 } })).toEqual([
      { path: "hp.current", kind: "increment", by: 5 },
    ]);
  });

  it("bounded values are written as they are: damage, temp HP, death saves", () => {
    // An increment past a bound (HP below 0, temp below 0, a fourth failure) is refused
    // by the rules with the whole write; the owner's value always holds them.
    expect(
      ownerCombatPatch(base, {
        ...base,
        hp: { current: 22, temp: 5 },
        deathSaves: { successes: 1, failures: 0 },
      })
    ).toEqual([
      { path: "hp.current", kind: "set", value: 22 },
      { path: "hp.temp", kind: "set", value: 5 },
      { path: "deathSaves.successes", kind: "set", value: 1 },
    ]);
  });

  it("conditions add or remove what changed; both at once set the list", () => {
    expect(
      ownerCombatPatch(base, { ...base, conditions: ["prone", "poisoned"] })
    ).toEqual([{ path: "conditions", kind: "union", values: ["poisoned"] }]);
    expect(ownerCombatPatch(base, { ...base, conditions: [] })).toEqual([
      { path: "conditions", kind: "remove", values: ["prone"] },
    ]);
    expect(ownerCombatPatch(base, { ...base, conditions: ["poisoned"] })).toEqual([
      { path: "conditions", kind: "set", value: ["poisoned"] },
    ]);
  });

  it("the play state changes key by key; a key gone is deleted", () => {
    const { inspiration: _gone, ...state } = base.playState.state;
    void _gone;
    expect(
      ownerCombatPatch(base, {
        ...base,
        playState: { version: 1, state: { ...state, trackers: { rage: { used: 2 } } } },
      })
    ).toEqual([
      { path: "playState.state.trackers", kind: "set", value: { rage: { used: 2 } } },
      { path: "playState.state.inspiration", kind: "delete" },
    ]);
  });

  it("any other field is the owner's, field by field (End Turn: round and turn)", () => {
    expect(
      ownerCombatPatch(base, { ...base, round: 3, turnEconomy: { key: "solo:3" } })
    ).toEqual([
      { path: "round", kind: "set", value: 3 },
      { path: "turnEconomy", kind: "set", value: { key: "solo:3" } },
    ]);
  });
});
