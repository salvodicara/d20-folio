import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { resolve } from "@/lib/combat/resolve";
import {
  buildCatalogue,
  emptyCatalogue,
  mechanicOf,
  programOf,
} from "@/lib/combat/catalogue";
import type { Action, Effect, FoldedState } from "@/lib/combat/types";
import { testEntity } from "./__helpers__/entities";
import { emptyState, openingActions, seqFactory, tableAction } from "./__helpers__/state";
import type { Mechanic } from "@/lib/combat/mechanic";

const catalogue = emptyCatalogue();

/** A minimal well-formed carried mechanic; `broken` fails a SEMANTIC rule of `conformMechanic`
 *  (an `attack` step whose roll input the program never declares). */
function carried(id: string): Mechanic {
  return {
    schema: 1,
    id,
    source: "pack",
    active: [
      {
        id: "use",
        trigger: { kind: "invocation", economy: "action" },
        cost: [{ kind: "turn", claim: "action" }],
        steps: [{ id: "use", kind: "manual-table", label: id }],
      },
    ],
  };
}

const broken = {
  schema: 1,
  id: "pack:broken",
  source: "pack",
  active: [
    {
      id: "use",
      trigger: { kind: "invocation", economy: "action" },
      steps: [{ id: "swing", kind: "attack", roll: "roll", bonus: 3, damage: [] }],
    },
  ],
} as unknown as Mechanic;

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
      tableAction("dm", seq2(), { op: "add-entity", entity: ranger, mechanics: [] }),
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
      tableAction("p1", seq4(), { op: "add-entity", entity: ranger, mechanics: [] }),
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
        tableAction("p2", seq6(), { op: "join", entity: newcomer, mechanics: [] }),
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
        tableAction("dm", seq6(), { op: "join", entity: ranger, mechanics: [] }),
      ]);
      const result = resolve(
        state,
        tableAction("dm", seq6(), { op: "join", entity: ranger, mechanics: [] }),
        catalogue
      );
      expect(result.kind).toBe("rejected");
      if (result.kind !== "rejected") return;
      expect(result.rejection.reason).toBe("invalid-table-op");
    });

    it("leave removes the entity and ends an effect it sourced", () => {
      let state = applyAll(emptyState(), [
        tableAction("dm", seq6(), { op: "start", epoch: 1 }),
        tableAction("dm", seq6(), { op: "join", entity: ranger, mechanics: [] }),
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
        tableAction("p1", seq6(), { op: "sync", entity: synced, mechanics: [] }),
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
        tableAction("p3", seq6(), { op: "sync", entity: newcomer, mechanics: [] }),
        catalogue
      );
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") return;
      expect(result.state.entities["pc-3"]).toEqual(newcomer);
      expect(result.state.clock.order).toEqual([]);
    });
  });
});

describe("resolve — the map and fog table ops (stage 5)", () => {
  const BACKGROUND = {
    path: "campaigns/c1/maps/m1.jpeg",
    url: "https://example.test/m1.jpeg?token=x",
    width: 3000,
    height: 2000,
    cellPx: 100,
    origin: { x: 0, y: 0 },
    bytes: 1_234_567,
  };
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
  const fogOp = (
    change:
      | { kind: "cover"; covered: boolean }
      | { kind: "reveal"; rect: ReturnType<typeof rect> }
      | { kind: "hide"; rect: ReturnType<typeof rect> }
  ) => tableAction("dm", seqFactory("dm")(), { op: "fog", change });

  it("map sets, replaces and clears the background without touching fog or positions", () => {
    const seqM = seqFactory("dm");
    const ranger = testEntity({ id: "ranger", kind: "pc", position: { x: 2, y: 2 } });
    let state = applyAll(emptyState(), [
      tableAction("dm", seqM(), { op: "start", epoch: 1 }),
      tableAction("dm", seqM(), { op: "add-entity", entity: ranger, mechanics: [] }),
      tableAction("dm", seqM(), { op: "fog", change: { kind: "cover", covered: true } }),
      tableAction("dm", seqM(), {
        op: "fog",
        change: { kind: "reveal", rect: rect(0, 0, 4, 4) },
      }),
      tableAction("dm", seqM(), { op: "map", background: BACKGROUND }),
    ]);
    expect(state.map.background).toEqual(BACKGROUND);
    expect(state.map.fog).toEqual({ covered: true, revealed: [rect(0, 0, 4, 4)] });
    expect(mustEntity(state, "ranger").position).toEqual({ x: 2, y: 2 });
    state = applyAll(state, [
      tableAction("dm", seqM(), { op: "map", background: { ...BACKGROUND, cellPx: 50 } }),
    ]);
    expect(state.map.background?.cellPx).toBe(50);
    state = applyAll(state, [tableAction("dm", seqM(), { op: "map", background: null })]);
    expect(state.map.background).toBeNull();
    expect(state.map.fog.revealed).toEqual([rect(0, 0, 4, 4)]);
  });

  it("map rejects a malformed background", () => {
    const result = resolve(
      emptyState(),
      tableAction("dm", seqFactory("dm")(), {
        op: "map",
        background: { ...BACKGROUND, cellPx: Number.NaN },
      }),
      catalogue
    );
    expect(result).toEqual({
      kind: "rejected",
      rejection: { reason: "invalid-table-op", detail: "map: malformed background" },
    });
  });

  it("fog: cover on/off resets the revealed list; reveal appends; hide subtracts", () => {
    let state = applyAll(emptyState(), [
      fogOp({ kind: "cover", covered: true }),
      fogOp({ kind: "reveal", rect: rect(0, 0, 4, 4) }),
      fogOp({ kind: "reveal", rect: rect(10, 10, 2, 2) }),
    ]);
    expect(state.map.fog).toEqual({
      covered: true,
      revealed: [rect(0, 0, 4, 4), rect(10, 10, 2, 2)],
    });
    state = applyAll(state, [fogOp({ kind: "hide", rect: rect(0, 0, 4, 2) })]);
    expect(state.map.fog.revealed).toEqual([rect(0, 2, 4, 2), rect(10, 10, 2, 2)]);
    state = applyAll(state, [fogOp({ kind: "cover", covered: false })]);
    expect(state.map.fog).toEqual({ covered: false, revealed: [] });
    state = applyAll(state, [fogOp({ kind: "cover", covered: true })]);
    expect(state.map.fog).toEqual({ covered: true, revealed: [] });
  });

  it("fog: reveal and hide are rejected while fog is off, and a malformed rectangle is rejected", () => {
    const off = resolve(
      emptyState(),
      fogOp({ kind: "reveal", rect: rect(0, 0, 1, 1) }),
      catalogue
    );
    expect(off).toEqual({
      kind: "rejected",
      rejection: { reason: "invalid-table-op", detail: "fog: reveal while fog is off" },
    });
    const covered = applyAll(emptyState(), [fogOp({ kind: "cover", covered: true })]);
    const bad = resolve(
      covered,
      fogOp({ kind: "hide", rect: rect(0, 0, 0, 1) }),
      catalogue
    );
    expect(bad).toEqual({
      kind: "rejected",
      rejection: { reason: "invalid-table-op", detail: "fog: malformed hide rectangle" },
    });
  });

  it("fog: the rectangle budget is a rejection, not a silent drop", () => {
    let state = applyAll(emptyState(), [fogOp({ kind: "cover", covered: true })]);
    for (let i = 0; i < 256; i += 1) {
      state = applyAll(state, [fogOp({ kind: "reveal", rect: rect(i * 3, 0, 1, 1) })]);
    }
    const over = resolve(
      state,
      fogOp({ kind: "reveal", rect: rect(-5, 0, 1, 1) }),
      catalogue
    );
    expect(over).toEqual({
      kind: "rejected",
      rejection: {
        reason: "invalid-table-op",
        detail: "fog: rectangle budget exhausted",
      },
    });
  });
});

describe("resolve — the mechanics an entity carries into the log (stage 6 §2 D2)", () => {
  const seq = seqFactory("dm");
  const ogre = testEntity({
    id: "ogre",
    kind: "monster",
    hp: 68,
    mechanics: ["pack:ogre:club"],
  });
  const pc = testEntity({
    id: "pc-1",
    kind: "pc",
    controllerUid: "p1",
    hp: 12,
    mechanics: ["pack:ogre:club"],
  });

  function started(): FoldedState {
    return applyAll(emptyState(), [tableAction("dm", seq(), { op: "start", epoch: 1 })]);
  }

  it("add-entity folds the carried definitions into state.mechanics", () => {
    const state = applyAll(started(), [
      tableAction("dm", seq(), {
        op: "add-entity",
        entity: ogre,
        mechanics: [carried("pack:ogre:club")],
      }),
    ]);
    expect(state.mechanics["pack:ogre:club"]).toEqual(carried("pack:ogre:club"));
  });

  it("join folds them too, and an entity seated with none changes nothing", () => {
    let state = applyAll(started(), [
      tableAction("p1", seq(), {
        op: "join",
        entity: pc,
        mechanics: [carried("pack:ogre:club")],
      }),
    ]);
    expect(Object.keys(state.mechanics)).toEqual(["pack:ogre:club"]);
    state = applyAll(state, [
      tableAction("dm", seq(), { op: "add-entity", entity: ogre, mechanics: [] }),
    ]);
    expect(Object.keys(state.mechanics)).toEqual(["pack:ogre:club"]);
  });

  it("a carried mechanic that fails conformance rejects the whole op", () => {
    const result = resolve(
      started(),
      tableAction("dm", seq(), { op: "add-entity", entity: ogre, mechanics: [broken] }),
      catalogue
    );
    expect(result).toEqual({
      kind: "rejected",
      rejection: {
        reason: "invalid-table-op",
        detail:
          "add-entity: mechanic pack:broken roll-input-declared at active[0].steps[0].roll",
      },
    });
  });

  it("sync replaces the entity's carried ids, dropping one it no longer carries", () => {
    let state = applyAll(started(), [
      tableAction("dm", seq(), {
        op: "add-entity",
        entity: { ...ogre, mechanics: ["pack:ogre:club", "pack:ogre:javelin"] },
        mechanics: [carried("pack:ogre:club"), carried("pack:ogre:javelin")],
      }),
    ]);
    expect(Object.keys(state.mechanics).sort()).toEqual([
      "pack:ogre:club",
      "pack:ogre:javelin",
    ]);
    state = applyAll(state, [
      tableAction("dm", seq(), {
        op: "sync",
        entity: { ...ogre, mechanics: ["pack:ogre:club"] },
        mechanics: [carried("pack:ogre:club")],
      }),
    ]);
    expect(Object.keys(state.mechanics)).toEqual(["pack:ogre:club"]);
  });

  it("remove-entity drops the departing entity's ids, but keeps one another entity lists", () => {
    let state = applyAll(started(), [
      tableAction("dm", seq(), {
        op: "add-entity",
        entity: { ...ogre, mechanics: ["pack:ogre:club", "pack:shared"] },
        mechanics: [carried("pack:ogre:club"), carried("pack:shared")],
      }),
      tableAction("p1", seq(), {
        op: "join",
        entity: { ...pc, mechanics: ["pack:shared"] },
        mechanics: [carried("pack:shared")],
      }),
    ]);
    state = applyAll(state, [
      tableAction("dm", seq(), { op: "remove-entity", entity: "ogre" }),
    ]);
    expect(Object.keys(state.mechanics)).toEqual(["pack:shared"]);
  });

  it("a carried definition wins over the same id in the static catalogue", () => {
    const stat = buildCatalogue([
      { ...carried("pack:ogre:club"), source: "srd" },
    ]).catalogue;
    const state = applyAll(started(), [
      tableAction("dm", seq(), {
        op: "add-entity",
        entity: ogre,
        mechanics: [carried("pack:ogre:club")],
      }),
    ]);
    expect(mechanicOf(state, stat, "pack:ogre:club")?.source).toBe("pack");
    expect(mechanicOf(emptyState(), stat, "pack:ogre:club")?.source).toBe("srd");
    expect(programOf(state, stat, "pack:ogre:club", "use")?.id).toBe("use");
    expect(programOf(state, stat, "pack:missing", "use")).toBeNull();
  });

  it("leave drops the leaving entity's ids", () => {
    let state = applyAll(started(), [
      tableAction("p1", seq(), {
        op: "join",
        entity: pc,
        mechanics: [carried("pack:ogre:club")],
      }),
    ]);
    state = applyAll(state, [tableAction("p1", seq(), { op: "leave", entity: "pc-1" })]);
    expect(state.mechanics).toEqual({});
  });
});
