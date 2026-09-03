import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  emptyState,
  firstOf,
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const seq = seqFactory("p1");

function run(state: FoldedState, actions: readonly Action[]): FoldedState {
  let current = state;
  for (const action of actions) {
    const result = resolve(current, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    current = result.state;
  }
  return current;
}

function move(by: string, entity: string, to: { x: number; y: number }): Action {
  return {
    kind: "intent",
    id: nextActionId("i"),
    seq: seq(),
    by,
    entity,
    mechanic: "core:move",
    program: "move",
    targets: [],
    answers: { to },
    payment: [],
    window: null,
    basedOn: 0,
  };
}

const ranger = testEntity({
  id: "ranger",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 15,
  abilities: { DEX: 3 },
  mechanics: ["srd:weapon:shortsword", "core:move"],
});

function goblinAt(position: { x: number; y: number } | null) {
  return testEntity({
    id: "monster-1",
    kind: "monster",
    controllerUid: "dm",
    hp: 7,
    ac: 13,
    mechanics: ["core:move"],
    position,
  });
}

/** Ranger's turn is current. */
function opened(goblinPosition: { x: number; y: number } | null = null): FoldedState {
  return run(
    emptyState(),
    openingActions(
      "dm",
      seq,
      [ranger, goblinAt(goblinPosition)],
      { ranger: 20, "monster-1": 10 },
      ["ranger", "monster-1"]
    )
  );
}

const endTurn = () => tableAction("dm", seq(), { op: "end-turn" });

describe("resolve — the move step", () => {
  it("first placement is free and does not consume movement", () => {
    const state = run(opened(), [move("p1", "ranger", { x: 0, y: 0 })]);
    expect(mustEntity(state, "ranger").position).toEqual({ x: 0, y: 0 });
    expect(mustEntity(state, "ranger").turn.movementUsed).toBe(0);
  });

  it("a later move within budget updates position and accumulates movementUsed", () => {
    const state = run(opened(), [
      move("p1", "ranger", { x: 0, y: 0 }),
      move("p1", "ranger", { x: 4, y: 0 }), // 20 ft, within the default 30 ft speed
    ]);
    expect(mustEntity(state, "ranger").position).toEqual({ x: 4, y: 0 });
    expect(mustEntity(state, "ranger").turn.movementUsed).toBe(20);
  });

  it("rejects a move beyond the remaining speed budget", () => {
    const state = run(opened(), [move("p1", "ranger", { x: 0, y: 0 })]);
    const result = resolve(state, move("p1", "ranger", { x: 7, y: 0 }), catalogue); // 35 ft > 30
    expect(result).toEqual({
      kind: "rejected",
      rejection: { reason: "unaffordable", cost: "movement" },
    });
  });

  it("split movement across two moves respects the shared budget", () => {
    const state = run(opened(), [
      move("p1", "ranger", { x: 0, y: 0 }),
      move("p1", "ranger", { x: 6, y: 0 }), // 30 ft, exactly the budget
    ]);
    const result = resolve(state, move("p1", "ranger", { x: 7, y: 0 }), catalogue); // one more cell
    expect(result).toEqual({
      kind: "rejected",
      rejection: { reason: "unaffordable", cost: "movement" },
    });
  });

  it("a program cannot invoke move off its own turn", () => {
    const state = opened(); // it is ranger's turn
    const result = resolve(state, move("dm", "monster-1", { x: 0, y: 0 }), catalogue);
    expect(result).toEqual({
      kind: "rejected",
      rejection: { reason: "not-your-turn", entity: "monster-1" },
    });
  });

  it("moving into another entity's reach derives an adjacent relation", () => {
    const state = run(opened({ x: 5, y: 5 }), [move("p1", "ranger", { x: 4, y: 5 })]);
    expect(
      state.relations.some(
        (r) => r.kind === "adjacent" && r.a === "ranger" && r.b === "monster-1"
      )
    ).toBe(true);
  });

  it("moving away from an adjacent creature emits entity-left-reach and opens the opportunity window", () => {
    let state = run(opened({ x: 1, y: 0 }), [move("p1", "ranger", { x: 0, y: 0 })]);
    expect(
      state.relations.some(
        (r) => r.kind === "adjacent" && r.a === "ranger" && r.b === "monster-1"
      )
    ).toBe(true);

    state = run(state, [endTurn(), move("dm", "monster-1", { x: 5, y: 0 })]); // 25 ft, leaves reach
    expect(state.relations.some((r) => r.kind === "adjacent")).toBe(false);
    expect(state.windows).toHaveLength(1);
    expect(firstOf(state.windows).event).toEqual({
      kind: "entity-left-reach",
      entity: "monster-1",
      from: "ranger",
    });
    expect(firstOf(state.windows).eligible).toEqual(["ranger"]);
  });
});
