import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import {
  evaluate,
  facesFromSeed,
  parseFormula,
  type RollRecord,
} from "@/lib/combat/dice";
import { fold } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, Encounter, FoldedState, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { emptyState, openingActions, seqFactory } from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const seq = seqFactory("p1");
const ranger = testEntity({
  id: "ranger",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 15,
  abilities: { DEX: 3 },
  mechanics: ["srd:weapon:longbow"],
});
const goblin = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 7,
  ac: 15,
  mechanics: ["monster:goblin:scimitar"],
});
const visible: Relation[] = [
  { kind: "visible", a: "ranger", b: "monster-1", value: true },
  { kind: "visible", a: "monster-1", b: "ranger", value: true },
];

function opening(): Action[] {
  return openingActions("dm", seq, [ranger, goblin], { ranger: 20, "monster-1": 10 }, [
    "ranger",
    "monster-1",
  ]);
}
function run(actions: readonly Action[]): FoldedState {
  let state: FoldedState = { ...emptyState(), relations: visible };
  for (const action of actions) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}
function appRoll(text: string, seed: number, over: Partial<RollRecord> = {}): RollRecord {
  const formula = parseFormula(text);
  if ("code" in formula) throw new Error(formula.code);
  const faces = facesFromSeed(seed, formula);
  const evaluation = evaluate(formula, faces);
  if ("code" in evaluation) throw new Error(evaluation.code);
  const total = evaluation.total;
  return {
    formula: formula.text,
    faces,
    total,
    seed,
    source: "app",
    hidden: false,
    roller: "ranger",
    purpose: "attack",
    label: null,
    ...over,
  };
}
function manual(
  text: string,
  faces: number[],
  total: number,
  purpose: RollRecord["purpose"]
): RollRecord {
  return {
    formula: text,
    faces,
    total,
    seed: null,
    source: "manual",
    hidden: false,
    roller: "ranger",
    purpose,
    label: null,
  };
}
function rollAction(id: string, by: string, roll: RollRecord): Action {
  return { kind: "roll", id, seq: seq(), by, roll };
}
function attack(id: string, attackRoll: string, damageRoll: string): Action {
  return {
    kind: "intent",
    id,
    seq: seq(),
    by: "p1",
    entity: "ranger",
    mechanic: "srd:weapon:longbow",
    program: "attack",
    targets: ["monster-1"],
    answers: { roll: { roll: attackRoll }, damage: { roll: damageRoll } },
    payment: [],
    window: null,
    basedOn: 0,
  };
}

describe("roll — a logged action with provenance", () => {
  it("records an app roll and rejects a tampered one", () => {
    const state = run([...opening(), rollAction("r1", "p1", appRoll("1d20", 5))]);
    expect(state.rolls.r1?.seed).toBe(5);
    const honest = appRoll("1d20", 5);
    const face = honest.faces[0] === 20 ? 1 : 20;
    const result = resolve(
      state,
      rollAction("r2", "p1", { ...honest, faces: [face], total: face }),
      catalogue
    );
    expect(result.kind === "rejected" && result.rejection).toEqual({
      reason: "invalid-roll",
      code: "faces-mismatch",
    });
  });
  it("records a manual roll and a hidden DM roll", () => {
    const hidden: RollRecord = {
      ...appRoll("1d20", 9),
      hidden: true,
      roller: "monster-1",
    };
    const state = run([
      ...opening(),
      rollAction("r1", "p1", manual("1d20", [17], 17, "attack")),
      rollAction("r2", "dm", hidden),
    ]);
    expect(state.rolls.r1?.source).toBe("manual");
    expect(state.rolls.r2?.hidden).toBe(true);
  });
  it("rejects a roll for an unknown entity", () => {
    const result = resolve(
      run(opening()),
      rollAction("r1", "p1", appRoll("1d20", 1, { roller: "nobody" })),
      catalogue
    );
    expect(result.kind === "rejected" && result.rejection).toEqual({
      reason: "unknown-entity",
      entity: "nobody",
    });
  });
});

describe("intents consume rolls by id", () => {
  it("hits with a manual 15 (+5 vs AC 15) and applies the rolled damage", () => {
    const state = run([
      ...opening(),
      rollAction("r1", "p1", manual("1d20", [15], 15, "attack")),
      rollAction("r2", "p1", manual("1d8", [6], 6, "damage")),
      attack("i1", "r1", "r2"),
    ]);
    expect(state.entities["monster-1"]?.vitals.hp).toBe(1);
  });
  it("undoing the roll makes the attack re-validate as missing-answer", () => {
    const log: Action[] = [
      ...opening(),
      rollAction("r1", "p1", manual("1d20", [15], 15, "attack")),
      rollAction("r2", "p1", manual("1d8", [6], 6, "damage")),
      attack("i1", "r1", "r2"),
      { kind: "undo", id: "u1", seq: seq(), by: "dm", of: "r1", reason: null },
    ];
    const encounter: Encounter = {
      schema: 1,
      id: "e",
      host: { kind: "campaign", campaignId: "c" },
      log,
      checkpoint: null,
    };
    // Relations become log actions in stage 2; until then the caller seeds them.
    const result = fold(encounter, catalogue, { ...emptyState(), relations: visible });
    expect(result.rejections).toEqual([
      { action: "i1", rejection: { reason: "missing-answer", input: "roll" } },
    ]);
    expect(result.state.entities["monster-1"]?.vitals.hp).toBe(7);
  });
});
