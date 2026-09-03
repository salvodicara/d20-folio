import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState } from "@/lib/combat/types";
import type { Mechanic } from "@/lib/combat/mechanic";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

const blast: Mechanic = {
  schema: 1,
  id: "test:blast",
  source: "homebrew",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "action" }],
      targets: {
        count: "area",
        eligibility: { all: [] },
        area: { kind: "sphere", origin: "origin", radiusFt: 10 },
      },
      inputs: [
        { id: "origin", kind: "position" },
        { id: "damage", kind: "dice", formula: "2d6" },
      ],
      steps: [
        {
          id: "hit",
          kind: "damage",
          parts: [{ dice: "damage", type: "fire" }],
          to: "$target",
        },
      ],
    },
  ],
};

const { catalogue } = buildCatalogue([blast]);
const seq = seqFactory("caster");

function opened(): FoldedState {
  let state = initialState();
  const caster = testEntity({
    id: "caster",
    kind: "pc",
    hp: 20,
    mechanics: ["test:blast"],
  });
  const inside = testEntity({
    id: "inside",
    kind: "monster",
    hp: 10,
    position: { x: 1, y: 0 },
  });
  const outside = testEntity({
    id: "outside",
    kind: "monster",
    hp: 10,
    position: { x: 10, y: 10 },
  });
  for (const action of openingActions(
    "caster",
    seq,
    [caster, inside, outside],
    { caster: 10 },
    ["caster"]
  )) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

function cast(): Action {
  return {
    kind: "intent",
    id: nextActionId("i"),
    seq: seq(),
    by: "caster",
    entity: "caster",
    mechanic: "test:blast",
    program: "cast",
    targets: [],
    answers: { origin: { x: 0, y: 0 }, damage: 7 },
    payment: [],
    window: null,
    basedOn: 0,
  };
}

describe("area targeting — the reducer derives targets from positions, never trusts the client", () => {
  it("hits everyone inside the shape and no one outside it, ignoring a supplied targets array", () => {
    const result = resolve(opened(), cast(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "inside").vitals.hp).toBe(3);
    expect(mustEntity(result.state, "outside").vitals.hp).toBe(10);
  });

  it("rejects with missing-answer when the origin position wasn't answered", () => {
    const blind = { ...cast(), answers: { damage: 7 } };
    const result = resolve(opened(), blind, catalogue);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.rejection).toEqual({ reason: "missing-answer", input: "origin" });
  });

  it("applies with no per-target steps when the shape contains no entity", () => {
    const empty = { ...cast(), answers: { origin: { x: 20, y: 20 }, damage: 7 } };
    const state = opened();
    const result = resolve(state, empty, catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.receipt.paid).toEqual(["turn:action"]);
    expect(result.receipt.outcome).toBe("applied");
    for (const id of Object.keys(state.entities)) {
      expect(mustEntity(result.state, id).vitals.hp).toBe(
        mustEntity(state, id).vitals.hp
      );
    }
  });
});
