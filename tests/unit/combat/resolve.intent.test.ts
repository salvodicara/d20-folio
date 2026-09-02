import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  emptyState,
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue, errors } = buildCatalogue(PROTOTYPE_MECHANICS);

function run(state: FoldedState, actions: readonly Action[]): FoldedState {
  let current = state;
  for (const action of actions) {
    const result = resolve(current, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    current = result.state;
  }
  return current;
}

const seq = seqFactory("p1");
const ranger = testEntity({
  id: "ranger",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 15,
  abilities: { DEX: 3, CON: 2 },
  saves: { CON: 2, WIS: 1 },
  mechanics: [
    "srd:weapon:longbow",
    "srd:spell:hunters-mark",
    "srd:spell:shield",
    "proto:spell:giggle",
  ],
  resources: {
    "slot-1": { current: 2, max: 2, recharge: "long" },
    "slot-2": { current: 1, max: 1, recharge: "long" },
  },
});
const goblin = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 7,
  ac: 15,
  saves: { WIS: -1 },
  mechanics: ["monster:goblin:scimitar"],
});
const visible: Relation[] = [
  { kind: "visible", a: "ranger", b: "monster-1", value: true },
  { kind: "visible", a: "monster-1", b: "ranger", value: true },
];

function opened(): FoldedState {
  const state = run(
    emptyState(),
    openingActions("dm", seq, [ranger, goblin], { ranger: 20, "monster-1": 10 }, [
      "ranger",
      "monster-1",
    ])
  );
  return { ...state, relations: visible };
}

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

describe("resolve — intents", () => {
  it("the prototype catalogue conforms", () => {
    expect(errors).toEqual([]);
  });

  it("a longbow attack hits when d20 + DEX + PB meets AC, applies damage and pays an attack claim", () => {
    const state = opened();
    const result = resolve(
      state,
      intent("p1", "ranger", "srd:weapon:longbow", "attack", {
        targets: ["monster-1"],
        answers: { roll: 10, damage: 5 }, // 10 + 3 + 2 = 15 ≥ AC 15
      }),
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.state.entities["monster-1"].vitals.hp).toBe(2);
    expect(result.receipt.paid).toEqual(["turn:attack"]);
    expect(result.receipt.outcome).toBe("established");
    expect(result.state.entities.ranger.turn.attacksUsed).toBe(1);
    expect(result.state.entities.ranger.turn.action).toBe(1);
  });

  it("a natural 1 misses even when the total would hit; a miss pays the claim and deals nothing", () => {
    const state = opened();
    const result = resolve(
      state,
      intent("p1", "ranger", "srd:weapon:longbow", "attack", {
        targets: ["monster-1"],
        answers: { roll: 1, damage: 8 },
      }),
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.state.entities["monster-1"].vitals.hp).toBe(7);
    expect(result.receipt.outcome).toBe("negated");
    expect(result.receipt.paid).toEqual(["turn:attack"]);
  });

  it("Hunter's Mark spends the bonus action and a slot, sets concentration, marks the target; the next hit adds the rider", () => {
    let state = opened();
    state = run(state, [
      intent("p1", "ranger", "srd:spell:hunters-mark", "cast", {
        targets: ["monster-1"],
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
      }),
    ]);
    expect(state.entities.ranger.resources["slot-1"].current).toBe(1);
    expect(state.entities.ranger.turn.bonus).toBe(1);
    const markId = state.entities.ranger.concentration;
    expect(markId).not.toBeNull();
    expect(state.effects[markId as string].payload.kind).toBe("mark");
    expect(state.relations).toContainEqual({
      kind: "mark",
      effect: markId,
      by: "ranger",
      on: "monster-1",
    });

    // A hit without the rider die answered is rejected: the reducer asks for it.
    const missing = resolve(
      state,
      intent("p1", "ranger", "srd:weapon:longbow", "attack", {
        targets: ["monster-1"],
        answers: { roll: 15, damage: 3 },
      }),
      catalogue
    );
    expect(missing).toEqual({
      kind: "rejected",
      rejection: { reason: "missing-answer", input: `rider:${markId}` },
    });

    const hit = run(state, [
      intent("p1", "ranger", "srd:weapon:longbow", "attack", {
        targets: ["monster-1"],
        answers: { roll: 15, damage: 3, [`rider:${markId}`]: 4 },
      }),
    ]);
    expect(hit.entities["monster-1"].vitals.hp).toBe(0); // 7 - 3 - 4
    expect(hit.entities["monster-1"].vitals.life).toBe("dead");
  });

  it("a save-gated concentration spell whose target succeeds is negated: slot spent, no concentration, no condition", () => {
    const state = opened();
    const result = resolve(
      state,
      intent("p1", "ranger", "proto:spell:giggle", "cast", {
        targets: ["monster-1"],
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
        answers: { "save:monster-1": 14 }, // 14 - 1 = 13 ≥ DC 13
      }),
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.receipt.outcome).toBe("negated");
    expect(result.state.entities.ranger.resources["slot-1"].current).toBe(1);
    expect(result.state.entities.ranger.concentration).toBeNull();
    expect(Object.keys(result.state.effects)).toEqual([]);
  });

  it("the same spell on a failed save establishes both conditions under one concentration", () => {
    const state = run(opened(), [
      intent("p1", "ranger", "proto:spell:giggle", "cast", {
        targets: ["monster-1"],
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
        answers: { "save:monster-1": 5 },
      }),
    ]);
    const held = state.entities.ranger.concentration;
    expect(held).not.toBeNull();
    const conditions = Object.values(state.effects).filter(
      (e) => e.payload.kind === "condition"
    );
    expect(
      conditions.map((e) => (e.payload.kind === "condition" ? e.payload.condition : null))
    ).toEqual(["prone", "incapacitated"]);
    expect(conditions.every((e) => e.concentration)).toBe(true);
  });

  it("an unaffordable intent is rejected and changes nothing", () => {
    const broke: FoldedState = {
      ...opened(),
    };
    const drained = {
      ...broke,
      entities: {
        ...broke.entities,
        ranger: {
          ...broke.entities.ranger,
          resources: { "slot-1": { current: 0, max: 2, recharge: "long" as const } },
        },
      },
    };
    const result = resolve(
      drained,
      intent("p1", "ranger", "srd:spell:hunters-mark", "cast", {
        targets: ["monster-1"],
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
      }),
      catalogue
    );
    expect(result).toEqual({
      kind: "rejected",
      rejection: { reason: "unaffordable", cost: "slot:1" },
    });
  });

  it("acting outside your turn is rejected", () => {
    const state = opened(); // ranger is current
    const result = resolve(
      state,
      intent("dm", "monster-1", "monster:goblin:scimitar", "attack", {
        targets: ["ranger"],
        answers: { roll: 10, damage: 3 },
      }),
      catalogue
    );
    expect(result).toEqual({
      kind: "rejected",
      rejection: { reason: "not-your-turn", entity: "monster-1" },
    });
  });

  it("damage to a concentrating caster opens a concentration check; a failed check ends the mark and its rider", () => {
    let state = run(opened(), [
      intent("p1", "ranger", "srd:spell:hunters-mark", "cast", {
        targets: ["monster-1"],
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
      }),
      tableAction("dm", seq(), { op: "end-turn" }), // goblin's turn
    ]);
    const markId = state.entities.ranger.concentration as string;
    state = run(state, [
      intent("dm", "monster-1", "monster:goblin:scimitar", "attack", {
        targets: ["ranger"],
        answers: { roll: 12, damage: 6 }, // 12 + 4 = 16 ≥ AC 15 → 6 damage
      }),
    ]);
    expect(state.entities.ranger.vitals.hp).toBe(14);
    expect(state.checks).toHaveLength(1);
    expect(state.checks[0]).toMatchObject({
      entity: "ranger",
      kind: "concentration",
      dc: 10,
    });
    const failed = run(state, [
      {
        kind: "check",
        id: nextActionId("c"),
        seq: seq(),
        by: "p1",
        check: state.checks[0].id,
        answers: { d20: 3 },
      }, // 3 + 2 < 10
    ]);
    expect(failed.entities.ranger.concentration).toBeNull();
    expect(failed.effects[markId]).toBeUndefined();
    expect(failed.relations.some((r) => r.kind === "mark")).toBe(false);
    expect(failed.checks).toEqual([]);
  });
});
