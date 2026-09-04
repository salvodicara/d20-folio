import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, Answers, Entity, FoldedState, Position } from "@/lib/combat/types";
import type { AreaShapeSpec, Mechanic } from "@/lib/combat/mechanic";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

/** A one-step area mechanic: derive the targets from `shape`, burn each of them. */
function areaMechanic(id: string, shape: AreaShapeSpec, everyone = true): Mechanic {
  const aim = shape.kind === "cone" || shape.kind === "line" ? [shape.aim] : [];
  return {
    schema: 1,
    id,
    source: "homebrew",
    active: [
      {
        id: "cast",
        trigger: { kind: "invocation", economy: "action" },
        cost: [{ kind: "turn", claim: "action" }],
        targets: {
          count: "area",
          // `not is($target, $self)` is the smallest predicate that provably excludes an entity
          // standing inside the shape: the caster at the origin of their own blast.
          eligibility: everyone ? { all: [] } : { not: { is: ["$target", "$self"] } },
          area: shape,
        },
        inputs: [
          { id: "origin", kind: "position" },
          ...aim.map((id): { id: string; kind: "position" } => ({
            id,
            kind: "position",
          })),
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
}

const blast = areaMechanic("test:blast", {
  kind: "sphere",
  origin: "origin",
  radiusFt: 10,
});
const blastOthers = areaMechanic(
  "test:blast-others",
  { kind: "sphere", origin: "origin", radiusFt: 10 },
  false
);
// Geometry per `position.ts`: Euclidean feet at 5 ft/cell; a cube extends +x/+y from its origin,
// a cone is 90° symmetric about the aim, a line is its width centred on the aim segment.
const cube = areaMechanic("test:cube", { kind: "cube", origin: "origin", sizeFt: 10 });
const cone = areaMechanic("test:cone", {
  kind: "cone",
  origin: "origin",
  aim: "aim",
  lengthFt: 15,
});
const line = areaMechanic("test:line", {
  kind: "line",
  origin: "origin",
  aim: "aim",
  lengthFt: 20,
  widthFt: 5,
});

const { catalogue } = buildCatalogue([blast, blastOthers, cube, cone, line]);
const MECHANICS = [
  "test:blast",
  "test:blast-others",
  "test:cube",
  "test:cone",
  "test:line",
];
const seq = seqFactory("caster");

function opened(
  casterPosition: Position | null = null,
  extra: readonly Entity[] = []
): FoldedState {
  let state = initialState();
  const caster = testEntity({
    id: "caster",
    kind: "pc",
    hp: 20,
    mechanics: MECHANICS,
    position: casterPosition,
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
    [caster, inside, outside, ...extra],
    { caster: 10 },
    ["caster"]
  )) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

function cast(mechanic = "test:blast", answers: Answers = {}): Action {
  return {
    kind: "intent",
    id: nextActionId("i"),
    seq: seq(),
    by: "caster",
    entity: "caster",
    mechanic,
    program: "cast",
    targets: [],
    answers: { origin: { x: 0, y: 0 }, damage: 7, ...answers },
    payment: [],
    window: null,
    basedOn: 0,
  };
}

/** A probe at a grid cell, unnamed by any mechanic — only its HP matters. */
function probe(id: string, position: Position): Entity {
  return testEntity({ id, kind: "monster", hp: 10, position });
}

describe("area targeting — the reducer derives targets from positions, never trusts the client", () => {
  it("hits everyone inside the shape and no one outside it, ignoring a supplied targets array", () => {
    const state = opened();
    const result = resolve(state, cast(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "inside").vitals.hp).toBe(3);
    expect(mustEntity(result.state, "outside").vitals.hp).toBe(10);
  });

  it("rejects with missing-answer when the origin position wasn't answered", () => {
    const state = opened();
    const blind = { ...cast(), answers: { damage: 7 } };
    const result = resolve(state, blind, catalogue);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.rejection).toEqual({ reason: "missing-answer", input: "origin" });
  });

  it("applies with no per-target steps when the shape contains no entity", () => {
    const state = opened();
    const empty = { ...cast(), answers: { origin: { x: 20, y: 20 }, damage: 7 } };
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

  it("a caster standing in their own blast is a target of it — no implicit self-exclusion", () => {
    const state = opened({ x: 0, y: 0 });
    const result = resolve(state, cast(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "caster").vitals.hp).toBe(13); // 20 − 7, same as everyone
    expect(mustEntity(result.state, "inside").vitals.hp).toBe(3);
  });

  it("an eligibility predicate excludes someone the shape contains", () => {
    const state = opened({ x: 0, y: 0 });
    const result = resolve(state, cast("test:blast-others"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "caster").vitals.hp).toBe(20); // inside the sphere, not eligible
    expect(mustEntity(result.state, "inside").vitals.hp).toBe(3); // still burned
  });

  // The cone pair differs only in angle (both probes 10 ft from the origin) and the line pair only
  // in width (both probes 15 ft along the aim), so each catches a distance-only regression; the cube
  // pair proves membership on both sides of its edge (a sphere of the same size would agree).
  it.each<{
    mechanic: string;
    within: Position;
    beyond: Position;
    aim: Position | null;
  }>([
    { mechanic: "test:cube", within: { x: 1, y: 1 }, beyond: { x: 3, y: 0 }, aim: null },
    {
      mechanic: "test:cone",
      within: { x: 2, y: 0 },
      beyond: { x: 0, y: 2 },
      aim: { x: 1, y: 0 },
    },
    {
      mechanic: "test:line",
      within: { x: 3, y: 0 },
      beyond: { x: 3, y: 1 },
      aim: { x: 1, y: 0 },
    },
  ])("$mechanic burns the probe inside its shape and spares the one outside", (shape) => {
    const state = opened(null, [probe("in", shape.within), probe("out", shape.beyond)]);
    const answers: Answers = shape.aim === null ? {} : { aim: shape.aim };
    const result = resolve(state, cast(shape.mechanic, answers), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "in").vitals.hp).toBe(3);
    expect(mustEntity(result.state, "out").vitals.hp).toBe(10);
  });

  it("a cone with its origin answered but no aim is rejected for the aim input, not silently pointed", () => {
    const result = resolve(opened(), cast("test:cone"), catalogue);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.rejection).toEqual({ reason: "missing-answer", input: "aim" });
  });
});
