import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  firstOf,
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const seq = seqFactory("p1");

const hero = testEntity({
  id: "hero",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 10,
  abilities: { DEX: 3 },
  mechanics: ["srd:weapon:longbow"],
});
const foe = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 10,
  ac: 5,
});
const visible: Relation[] = [{ kind: "visible", a: "hero", b: "monster-1", value: true }];

function opened(): FoldedState {
  let state = initialState();
  for (const action of openingActions(
    "dm",
    seq,
    [hero, foe],
    { hero: 20, "monster-1": 1 },
    ["hero", "monster-1"]
  )) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return { ...state, relations: visible };
}

function attack(): Action {
  return {
    kind: "intent",
    id: nextActionId("a"),
    seq: seq(),
    by: "p1",
    entity: "hero",
    mechanic: "srd:weapon:longbow",
    program: "attack",
    targets: ["monster-1"],
    answers: { roll: 15, damage: 5 }, // 15 + DEX 3 + PB 2 = 20 ≥ AC 5 → 5 damage
    payment: [],
    window: null,
    basedOn: 0,
  };
}

function logOnly(state: FoldedState): FoldedState {
  const result = resolve(
    state,
    tableAction("dm", seq(), {
      op: "settings",
      revealMonsterHp: false,
      automation: "log-only",
    }),
    catalogue
  );
  if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
  return result.state;
}

describe("automation — log-only computes the verdict but applies nothing (ADR-0011)", () => {
  it("a log-only attack leaves HP, the turn ledger and the cost untouched, with the full receipt", () => {
    const result = resolve(logOnly(opened()), attack(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "monster-1").vitals.hp).toBe(10); // unchanged
    expect(mustEntity(result.state, "hero").turn.attacksUsed).toBe(0); // cost not paid
    expect(result.receipt.paid).toEqual(["turn:attack"]); // receipt still shows what would pay
    expect(result.receipt.outcome).toBe("established"); // and the full verdict
    expect(result.state.revision).toBe(opened().revision + 2); // settings + this action still count
  });

  it("the same attack at full-auto applies exactly as before the setting existed", () => {
    const result = resolve(opened(), attack(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "monster-1").vitals.hp).toBe(5);
    expect(mustEntity(result.state, "hero").turn.attacksUsed).toBe(1);
  });

  it("at log-only, an attack that opens a reaction window withholds the cost too", () => {
    const shieldedFoe = testEntity({
      id: "monster-1",
      kind: "monster",
      controllerUid: "dm",
      hp: 10,
      ac: 5,
      mechanics: ["srd:spell:shield"],
      resources: { "slot-1": { current: 1, max: 1, recharge: "long" } },
    });
    let state = initialState();
    for (const action of openingActions(
      "dm",
      seq,
      [hero, shieldedFoe],
      { hero: 20, "monster-1": 1 },
      ["hero", "monster-1"]
    )) {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    state = logOnly({ ...state, relations: visible });
    const held = attack();
    const result = resolve(state, held, catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").turn.attacksUsed).toBe(0);
    expect(mustEntity(result.state, "hero").turn.action).toBe(0);
    expect(result.state.windows).toHaveLength(1);
    expect(result.state.declared[held.id]).toBeDefined();
  });

  it("at log-only, a real departure from reach does not open the run-internal opportunity window", () => {
    const reactor = testEntity({
      id: "hero",
      kind: "pc",
      controllerUid: "p1",
      hp: 20,
      ac: 15,
      abilities: { DEX: 3 },
      mechanics: ["srd:weapon:shortsword", "core:move"],
    });
    const mover = testEntity({
      id: "monster-1",
      kind: "monster",
      controllerUid: "dm",
      hp: 7,
      ac: 13,
      mechanics: ["core:move"],
      position: { x: 1, y: 0 },
    });
    let state = initialState();
    for (const action of openingActions(
      "dm",
      seq,
      [reactor, mover],
      { hero: 20, "monster-1": 10 },
      ["hero", "monster-1"]
    )) {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    function moveTo(entity: string, by: string, to: { x: number; y: number }): Action {
      return {
        kind: "intent",
        id: nextActionId("m"),
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
    function apply(action: Action): void {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    apply(moveTo("hero", "p1", { x: 0, y: 0 })); // adjacent to monster-1 at (1, 0)
    apply(tableAction("dm", seq(), { op: "end-turn" })); // monster-1's turn
    state = logOnly(state);
    apply(moveTo("monster-1", "dm", { x: 5, y: 0 })); // 20 ft — leaves reach at full-auto
    expect(mustEntity(state, "monster-1").position).toEqual({ x: 1, y: 0 }); // unchanged
    expect(state.windows).toEqual([]);
    expect(mustEntity(state, "monster-1").turn.movementUsed).toBe(0);
  });

  it("at log-only, resolving a window computes the verdict but withholds it", () => {
    const shieldedHero = testEntity({
      id: "hero",
      kind: "pc",
      controllerUid: "p1",
      hp: 20,
      ac: 15,
      mechanics: ["srd:spell:shield"],
      resources: { "slot-1": { current: 1, max: 1, recharge: "long" } },
    });
    const attacker = testEntity({
      id: "monster-1",
      kind: "monster",
      controllerUid: "dm",
      hp: 10,
      ac: 5,
      mechanics: ["monster:goblin:scimitar"],
    });
    let state = initialState();
    for (const action of openingActions(
      "dm",
      seq,
      [shieldedHero, attacker],
      { hero: 20, "monster-1": 10 },
      ["hero", "monster-1"]
    )) {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    state = {
      ...state,
      relations: [
        { kind: "visible", a: "hero", b: "monster-1", value: true },
        { kind: "visible", a: "monster-1", b: "hero", value: true },
      ],
    };
    const opening = resolve(
      state,
      tableAction("dm", seq(), { op: "end-turn" }), // monster-1's turn
      catalogue
    );
    if (opening.kind === "rejected") throw new Error(JSON.stringify(opening.rejection));
    state = opening.state;
    const attackAction: Action = {
      kind: "intent",
      id: nextActionId("i"),
      seq: seq(),
      by: "dm",
      entity: "monster-1",
      mechanic: "monster:goblin:scimitar",
      program: "attack",
      targets: ["hero"],
      answers: { roll: 12, damage: 6 }, // 12 + 4 = 16 ≥ AC 15 → 6 damage
      payment: [],
      window: null,
      basedOn: 0,
    };
    const declared = resolve(state, attackAction, catalogue);
    if (declared.kind === "rejected") throw new Error(JSON.stringify(declared.rejection));
    state = declared.state;
    expect(state.windows).toHaveLength(1);
    const windowId = firstOf(state.windows).id;
    state = logOnly(state);
    const result = resolve(
      state,
      { kind: "resolve", id: nextActionId("r"), seq: seq(), by: "p1", window: windowId },
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.state.windows).toEqual([]);
    expect(result.state.declared[attackAction.id]).toBeUndefined();
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(20); // unchanged
    expect(result.receipt.outcome).toBe("established"); // the computed verdict, still reported
  });
});
