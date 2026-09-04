import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
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
          ...mustEntity(state, "monster-1"),
          turn: { ...mustEntity(state, "monster-1").turn, action: 1 },
        },
      },
    };
    state = applyAll(state, [tableAction("dm", seq3(), { op: "end-turn" })]); // goblin → ranger, round 1
    expect(state.clock.current).toBe("ranger");
    expect(state.clock.round).toBe(1);
    expect(mustEntity(state, "monster-1").turn.action).toBe(1); // a ledger resets at the START of its owner's turn
    expect(state.effects["effect-1"]).toBeDefined(); // ranger's round-1 turn start is not round 2

    state = applyAll(state, [tableAction("dm", seq3(), { op: "end-turn" })]); // ranger → goblin, round 2
    expect(state.clock.current).toBe("monster-1");
    expect(state.clock.round).toBe(2);
    expect(mustEntity(state, "monster-1").turn.action).toBe(0); // reset at the goblin's round-2 turn start
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

  describe("table — settings", () => {
    const seq5 = seqFactory("dm");

    function opened(): FoldedState {
      return applyAll(emptyState(), [
        tableAction("dm", seq5(), { op: "start", epoch: 1 }),
      ]);
    }

    it("rejects automation: propose-and-confirm (stage 6, not built yet)", () => {
      const state = opened();
      const result = resolve(
        state,
        tableAction("dm", seq5(), {
          op: "settings",
          revealMonsterHp: false,
          automation: "propose-and-confirm",
        }),
        catalogue
      );
      expect(result.kind).toBe("rejected");
      if (result.kind !== "rejected") return;
      expect(result.rejection.reason).toBe("invalid-table-op");
    });

    it("accepts log-only and full-auto, and can switch back mid-session", () => {
      let state = opened();
      for (const automation of ["log-only", "full-auto"] as const) {
        const result = resolve(
          state,
          tableAction("dm", seq5(), {
            op: "settings",
            revealMonsterHp: false,
            automation,
          }),
          catalogue
        );
        if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
        state = result.state;
        expect(state.settings.automation).toBe(automation);
      }
    });
  });

  describe("table — join, leave, sync (the encounter lease)", () => {
    const seq6 = seqFactory("dm");

    it("join adds an entity, appending it to the turn order while turns are running", () => {
      const state = applyAll(
        emptyState(),
        openingActions("dm", seq6, [ranger, goblin], { ranger: 15, "monster-1": 15 }, [
          "monster-1",
          "ranger",
        ])
      );
      const newcomer = testEntity({
        id: "pc-2",
        kind: "pc",
        controllerUid: "p2",
        hp: 12,
      });
      const result = resolve(
        state,
        tableAction("p2", seq6(), { op: "join", entity: newcomer }),
        catalogue
      );
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") return;
      expect(result.state.entities["pc-2"]).toEqual(newcomer);
      expect(result.state.clock.order).toEqual(["monster-1", "ranger", "pc-2"]);
      expect(result.receipt.summary).toEqual(["table:join"]);
    });

    it("rejects a second join with the same id as invalid-table-op", () => {
      const state = applyAll(emptyState(), [
        tableAction("dm", seq6(), { op: "start", epoch: 1 }),
        tableAction("dm", seq6(), { op: "join", entity: ranger }),
      ]);
      const result = resolve(
        state,
        tableAction("dm", seq6(), { op: "join", entity: ranger }),
        catalogue
      );
      expect(result.kind).toBe("rejected");
      if (result.kind !== "rejected") return;
      expect(result.rejection.reason).toBe("invalid-table-op");
    });

    it("leave removes the entity and ends an effect it sourced", () => {
      let state = applyAll(emptyState(), [
        tableAction("dm", seq6(), { op: "start", epoch: 1 }),
        tableAction("dm", seq6(), { op: "join", entity: ranger }),
      ]);
      const effect: Effect = {
        id: "effect-4",
        source: { entity: "ranger", mechanic: "test", action: "x", castLevel: null },
        target: "ranger",
        payload: { kind: "standing", facts: {} },
        lifetime: { kind: "manual" },
        concentration: false,
      };
      state = { ...state, effects: { [effect.id]: effect } };
      const result = resolve(
        state,
        tableAction("dm", seq6(), { op: "leave", entity: "ranger" }),
        catalogue
      );
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") return;
      expect(result.state.entities["ranger"]).toBeUndefined();
      expect(result.state.effects["effect-4"]).toBeUndefined();
      expect(result.receipt.summary).toEqual(["table:leave"]);
    });

    it("sync upserts the entity — replaces an existing one wholesale, order untouched", () => {
      const state = applyAll(
        emptyState(),
        openingActions("dm", seq6, [ranger, goblin], { ranger: 15, "monster-1": 15 }, [
          "monster-1",
          "ranger",
        ])
      );
      const synced = { ...ranger, vitals: { ...ranger.vitals, hp: 3 } };
      const result = resolve(
        state,
        tableAction("p1", seq6(), { op: "sync", entity: synced }),
        catalogue
      );
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") return;
      expect(result.state.entities["ranger"]).toEqual(synced);
      expect(result.state.clock.order).toEqual(["monster-1", "ranger"]);
      expect(result.receipt.summary).toEqual(["table:sync"]);
    });

    it("sync inserts the entity when absent, leaving the order untouched", () => {
      const state = applyAll(emptyState(), [
        tableAction("dm", seq6(), { op: "start", epoch: 1 }),
      ]);
      const newcomer = testEntity({ id: "pc-3", kind: "pc", hp: 8 });
      const result = resolve(
        state,
        tableAction("p3", seq6(), { op: "sync", entity: newcomer }),
        catalogue
      );
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") return;
      expect(result.state.entities["pc-3"]).toEqual(newcomer);
      expect(result.state.clock.order).toEqual([]);
    });
  });
});
