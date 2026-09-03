import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
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
});
