import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState, Relation } from "@/lib/combat/types";
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

const ranger = testEntity({
  id: "ranger",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 15,
  abilities: { DEX: 3 },
  mechanics: ["srd:weapon:shortsword", "srd:spell:shield"],
  resources: { "slot-1": { current: 2, max: 2, recharge: "long" } },
});
const goblin = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 7,
  ac: 15,
  mechanics: ["monster:goblin:scimitar"],
});
const relations: Relation[] = [
  { kind: "visible", a: "ranger", b: "monster-1", value: true },
  { kind: "visible", a: "monster-1", b: "ranger", value: true },
  { kind: "adjacent", a: "ranger", b: "monster-1" },
];

function intent(
  by: string,
  entity: string,
  mechanic: string,
  program: string,
  extra: Partial<Extract<Action, { kind: "intent" }>> = {}
): Action {
  return {
    kind: "intent",
    id: nextActionId("i"),
    seq: seq(),
    by,
    entity,
    mechanic,
    program,
    targets: [],
    answers: {},
    payment: [],
    window: null,
    basedOn: 0,
    ...extra,
  };
}

/** Ranger first, then the goblin; advance so it is the goblin's turn. */
function goblinsTurn(): FoldedState {
  const state = run(
    emptyState(),
    openingActions("dm", seq, [ranger, goblin], { ranger: 20, "monster-1": 10 }, [
      "ranger",
      "monster-1",
    ])
  );
  return run({ ...state, relations }, [tableAction("dm", seq(), { op: "end-turn" })]);
}

describe("resolve — reaction windows on another creature's turn", () => {
  it("an attack on a creature that can react opens a window and holds the attack; Shield changes the outcome on resolve", () => {
    let state = goblinsTurn();
    const attack = intent("dm", "monster-1", "monster:goblin:scimitar", "attack", {
      targets: ["ranger"],
      answers: { roll: 12, damage: 5 }, // 12 + 4 = 16 vs AC 15: a hit unless Shield
    });
    const declared = resolve(state, attack, catalogue);
    expect(declared.kind).toBe("applied");
    if (declared.kind !== "applied") return;
    state = declared.state;
    expect(state.windows).toHaveLength(1);
    expect(firstOf(state.windows).event.kind).toBe("attack-declared");
    expect(firstOf(state.windows).eligible).toEqual(["ranger"]);
    expect(state.declared[attack.id]).toBeDefined();
    expect(mustEntity(state, "ranger").vitals.hp).toBe(20); // held, not resolved
    expect(declared.receipt.paid).toEqual(["turn:attack"]); // the goblin's attack claim is spent now

    const windowId = firstOf(state.windows).id;
    state = run(state, [
      intent("p1", "ranger", "srd:spell:shield", "react", {
        window: windowId,
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
      }),
    ]);
    expect(mustEntity(state, "ranger").turn.reaction).toBe(1);
    expect(mustEntity(state, "ranger").resources["slot-1"]?.current).toBe(1);
    const ward = Object.values(state.effects).find((e) => e.payload.kind === "standing");
    expect(ward?.lifetime).toEqual({
      kind: "turn-edge",
      entity: "ranger",
      edge: "start",
      round: 2,
    });

    const again = resolve(
      state,
      intent("p1", "ranger", "srd:spell:shield", "react", { window: windowId }),
      catalogue
    );
    expect(again).toEqual({
      kind: "rejected",
      rejection: { reason: "unaffordable", cost: "turn:reaction" },
    });

    const resolved = resolve(
      state,
      { kind: "resolve", id: nextActionId("r"), seq: seq(), by: "dm", window: windowId },
      catalogue
    );
    expect(resolved.kind).toBe("applied");
    if (resolved.kind !== "applied") return;
    expect(resolved.receipt.outcome).toBe("negated"); // 16 vs 20 misses
    expect(mustEntity(resolved.state, "ranger").vitals.hp).toBe(20);
    expect(resolved.state.windows).toEqual([]);
    expect(resolved.state.declared).toEqual({});
  });

  it("an attack on a creature with no eligible reaction resolves immediately", () => {
    const state = goblinsTurn();
    const noShield = {
      ...state,
      entities: {
        ...state.entities,
        ranger: { ...mustEntity(state, "ranger"), mechanics: ["srd:weapon:shortsword"] },
      },
    };
    const result = resolve(
      noShield,
      intent("dm", "monster-1", "monster:goblin:scimitar", "attack", {
        targets: ["ranger"],
        answers: { roll: 12, damage: 5 },
      }),
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.state.windows).toEqual([]);
    expect(mustEntity(result.state, "ranger").vitals.hp).toBe(15);
  });

  it("a declared departure from reach opens an opportunity-attack window; the reaction resolves at once", () => {
    let state = goblinsTurn();
    const leave: Action = {
      kind: "declare",
      id: nextActionId("d"),
      seq: seq(),
      by: "dm",
      relation: { kind: "adjacent", a: "ranger", b: "monster-1" },
      remove: true,
      mover: "monster-1",
    };
    state = run(state, [leave]);
    expect(state.relations.some((r) => r.kind === "adjacent")).toBe(false);
    expect(state.windows).toHaveLength(1);
    expect(firstOf(state.windows).event).toEqual({
      kind: "entity-left-reach",
      entity: "monster-1",
      from: "ranger",
    });
    const windowId = firstOf(state.windows).id;
    state = run(state, [
      intent("p1", "ranger", "srd:weapon:shortsword", "opportunity", {
        window: windowId,
        targets: ["monster-1"],
        answers: { roll: 10, damage: 4 }, // 10 + 3 + 2 = 15 ≥ 15
      }),
    ]);
    expect(mustEntity(state, "monster-1").vitals.hp).toBe(3);
    expect(mustEntity(state, "ranger").turn.reaction).toBe(1);
    state = run(state, [
      { kind: "resolve", id: nextActionId("r"), seq: seq(), by: "dm", window: windowId },
    ]);
    expect(state.windows).toEqual([]);
  });

  it("an override is an action: the DM sets a player's AC with a reason and it survives the fold", () => {
    const state = goblinsTurn();
    const result = resolve(
      state,
      {
        kind: "override",
        id: nextActionId("o"),
        seq: seq(),
        by: "dm",
        entity: "ranger",
        path: "stats.ac",
        value: 18,
        reason: "ruling:cover-from-the-wagon",
      },
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "ranger").overrides["stats.ac"]).toEqual({
      value: 18,
      reason: "ruling:cover-from-the-wagon",
      by: "dm",
    });
  });
});
