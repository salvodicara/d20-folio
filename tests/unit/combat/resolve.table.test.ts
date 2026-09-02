import { describe, expect, it } from "vitest";
import { resolve } from "@/lib/combat/resolve";
import { emptyCatalogue } from "@/lib/combat/catalogue";
import type { Action, Effect, FoldedState } from "@/lib/combat/types";
import { testEntity } from "./__helpers__/entities";
import { emptyState, openingActions, seqFactory, tableAction } from "./__helpers__/state";

const catalogue = emptyCatalogue();

function applyAll(state: FoldedState, actions: readonly Action[]): FoldedState {
  let current = state;
  for (const action of actions) {
    const result = resolve(current, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    current = result.state;
  }
  return current;
}

describe("resolve — table operations and the clock", () => {
  const seq = seqFactory("dm");
  const ranger = testEntity({ id: "ranger", kind: "pc", controllerUid: "p1", hp: 20 });
  const goblin = testEntity({ id: "monster-1", kind: "monster", hp: 7 });

  it("start allocates the epoch; add-entity registers entities; begin-turns freezes the declared order", () => {
    const state = applyAll(
      emptyState(),
      openingActions("dm", seq, [ranger, goblin], { ranger: 15, "monster-1": 15 }, [
        "monster-1",
        "ranger",
      ])
    );
    expect(state.epoch).toBe(7);
    expect(Object.keys(state.entities)).toEqual(["ranger", "monster-1"]);
    expect(state.clock.phase).toBe("turns");
    expect(state.clock.round).toBe(1);
    expect(state.clock.order).toEqual(["monster-1", "ranger"]); // the tie was declared
    expect(state.clock.current).toBe("monster-1");
  });

  it("rejects begin-turns whose order names an unknown entity", () => {
    const seq2 = seqFactory("dm");
    const state = applyAll(emptyState(), [
      tableAction("dm", seq2(), { op: "start", epoch: 1 }),
      tableAction("dm", seq2(), { op: "add-entity", entity: ranger }),
    ]);
    const result = resolve(
      state,
      tableAction("dm", seq2(), { op: "begin-turns", order: ["ranger", "ghost"] }),
      catalogue
    );
    expect(result.kind).toBe("rejected");
  });

  it("end-turn advances the pointer, wraps the round, resets the ledger and expires a turn-edge effect exactly", () => {
    const seq3 = seqFactory("dm");
    let state = applyAll(
      emptyState(),
      openingActions("dm", seq3, [ranger, goblin], { ranger: 12, "monster-1": 18 }, [
        "monster-1",
        "ranger",
      ])
    );
    // A standing effect on the ranger "until the start of the ranger's next turn" (round 2).
    const shield: Effect = {
      id: "effect-1",
      source: { entity: "ranger", mechanic: "test", action: "x", castLevel: null },
      target: "ranger",
      payload: { kind: "standing", facts: { acBonus: 5 } },
      lifetime: { kind: "turn-edge", entity: "ranger", edge: "start", round: 2 },
      concentration: false,
    };
    state = {
      ...state,
      effects: { [shield.id]: shield },
      entities: {
        ...state.entities,
        "monster-1": {
          ...state.entities["monster-1"],
          turn: { ...state.entities["monster-1"].turn, action: 1 },
        },
      },
    };
    state = applyAll(state, [tableAction("dm", seq3(), { op: "end-turn" })]); // goblin → ranger, round 1
    expect(state.clock.current).toBe("ranger");
    expect(state.clock.round).toBe(1);
    expect(state.entities["monster-1"].turn.action).toBe(1); // a ledger resets at the START of its owner's turn
    expect(state.effects["effect-1"]).toBeDefined(); // ranger's round-1 turn start is not round 2

    state = applyAll(state, [tableAction("dm", seq3(), { op: "end-turn" })]); // ranger → goblin, round 2
    expect(state.clock.current).toBe("monster-1");
    expect(state.clock.round).toBe(2);
    expect(state.entities["monster-1"].turn.action).toBe(0); // reset at the goblin's round-2 turn start
    expect(state.effects["effect-1"]).toBeDefined();

    state = applyAll(state, [tableAction("dm", seq3(), { op: "end-turn" })]); // goblin → ranger, round 2 start
    expect(state.clock.current).toBe("ranger");
    expect(state.effects["effect-1"]).toBeUndefined(); // expired at the start of the ranger's round-2 turn
  });

  it("rest allocates the ordinal and ends only rest lifetimes whose minimum ordinal is met", () => {
    const seq4 = seqFactory("p1");
    let state = applyAll(emptyState(), [
      tableAction("p1", seq4(), { op: "start", epoch: 1 }),
      tableAction("p1", seq4(), { op: "add-entity", entity: ranger }),
    ]);
    const survives: Effect = {
      id: "effect-2",
      source: { entity: "ranger", mechanic: "test", action: "x", castLevel: null },
      target: "ranger",
      payload: { kind: "standing", facts: {} },
      lifetime: { kind: "rest", rest: "short", minimumOrdinal: 2 },
      concentration: false,
    };
    const ends: Effect = {
      ...survives,
      id: "effect-3",
      lifetime: { kind: "rest", rest: "short", minimumOrdinal: 1 },
    };
    state = { ...state, effects: { "effect-2": survives, "effect-3": ends } };
    state = applyAll(state, [tableAction("p1", seq4(), { op: "rest", rest: "short" })]);
    expect(state.clock.restOrdinal).toBe(1);
    expect(state.effects["effect-3"]).toBeUndefined();
    expect(state.effects["effect-2"]).toBeDefined();
  });
});
