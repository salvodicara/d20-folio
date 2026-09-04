import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { mapView, planDrop, remainingMovement } from "@/lib/combat/map";
import { resolve } from "@/lib/combat/resolve";
import { mustEntity } from "@/lib/combat/state";
import type { Action, FoldedState } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  emptyState,
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const DM = { uid: "dm", dm: true };
const P1 = { uid: "p1", dm: false };
const P2 = { uid: "p2", dm: false };

function run(state: FoldedState, actions: readonly Action[]): FoldedState {
  let current = state;
  for (const action of actions) {
    const result = resolve(current, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    current = result.state;
  }
  return current;
}

/** Hero (p1, speed 30) at (0,0) and the DM's goblin at (5,5); `turns` = begin with hero first. */
function table(opts: { turns?: boolean; automation?: "full-auto" | "log-only" } = {}) {
  const seq = seqFactory("dm");
  const hero = testEntity({
    id: "hero",
    kind: "pc",
    controllerUid: "p1",
    hp: 30,
    mechanics: ["core:move"],
    position: { x: 0, y: 0 },
  });
  const goblin = testEntity({
    id: "goblin",
    kind: "monster",
    hp: 7,
    mechanics: ["core:move"],
    position: { x: 5, y: 5 },
  });
  const opening = openingActions("dm", seq, [hero, goblin], { hero: 15, goblin: 5 }, [
    "hero",
    "goblin",
  ]);
  const actions =
    opts.turns === false
      ? opening.filter((a) => a.kind !== "table" || a.table.op !== "begin-turns")
      : opening;
  let state = run(emptyState(), actions);
  if (opts.automation === "log-only") {
    state = run(state, [
      tableAction("dm", seq(), {
        op: "settings",
        revealMonsterHp: false,
        automation: "log-only",
      }),
    ]);
  }
  return { state, seq };
}

describe("planDrop — which action a dropped token becomes (design addendum §5)", () => {
  it("row 1: an unknown entity, or an actor who neither controls it nor is the DM, is refused", () => {
    const { state } = table();
    expect(planDrop(state, { entity: "ghost", to: { x: 1, y: 1 }, actor: DM })).toEqual({
      kind: "refused",
      reason: "unknown",
    });
    expect(planDrop(state, { entity: "hero", to: { x: 1, y: 1 }, actor: P2 })).toEqual({
      kind: "refused",
      reason: "control",
    });
  });

  it("row 2: the controller, on its turn, within the budget, moves", () => {
    const { state } = table();
    expect(planDrop(state, { entity: "hero", to: { x: 6, y: 0 }, actor: P1 })).toEqual({
      kind: "move",
      to: { x: 6, y: 0 },
      feet: 30,
    });
  });

  it("row 3: the DM places — another's token, or its own monster out of turn or over budget", () => {
    const { state } = table();
    expect(planDrop(state, { entity: "hero", to: { x: 6, y: 0 }, actor: DM })).toEqual({
      kind: "place",
      to: { x: 6, y: 0 },
    });
    expect(planDrop(state, { entity: "goblin", to: { x: 6, y: 5 }, actor: DM })).toEqual({
      kind: "place",
      to: { x: 6, y: 5 },
    });
  });

  it("row 2 for the DM's own monster on its turn within budget: a real move, not a placement", () => {
    const { state, seq } = table();
    const goblinsTurn = run(state, [tableAction("dm", seq(), { op: "end-turn" })]);
    expect(
      planDrop(goblinsTurn, { entity: "goblin", to: { x: 6, y: 5 }, actor: DM })
    ).toEqual({
      kind: "move",
      to: { x: 6, y: 5 },
      feet: 5,
    });
    expect(
      planDrop(goblinsTurn, { entity: "goblin", to: { x: 20, y: 5 }, actor: DM })
    ).toEqual({
      kind: "place",
      to: { x: 20, y: 5 },
    });
  });

  it("row 4: the controller places while turns are not running", () => {
    const { state } = table({ turns: false });
    expect(state.clock.phase).toBe("gathering");
    expect(planDrop(state, { entity: "hero", to: { x: 9, y: 9 }, actor: P1 })).toEqual({
      kind: "place",
      to: { x: 9, y: 9 },
    });
  });

  it("row 5: the controller places on a log-only table, even on its own turn", () => {
    const { state } = table({ automation: "log-only" });
    expect(planDrop(state, { entity: "hero", to: { x: 1, y: 0 }, actor: P1 })).toEqual({
      kind: "place",
      to: { x: 1, y: 0 },
    });
  });

  it("row 6: the controller out of turn is refused", () => {
    const { state, seq } = table();
    const goblinsTurn = run(state, [tableAction("dm", seq(), { op: "end-turn" })]);
    expect(
      planDrop(goblinsTurn, { entity: "hero", to: { x: 1, y: 0 }, actor: P1 })
    ).toEqual({
      kind: "refused",
      reason: "turn",
    });
  });

  it("row 7: the controller over the budget is refused; the budget reads the speed override and what the turn spent", () => {
    const { state, seq } = table();
    expect(planDrop(state, { entity: "hero", to: { x: 7, y: 0 }, actor: P1 })).toEqual({
      kind: "refused",
      reason: "movement",
    });
    const slowed = run(state, [
      {
        kind: "override",
        id: nextActionId("o"),
        seq: seq(),
        by: "dm",
        entity: "hero",
        path: "stats.speed",
        value: 10,
        reason: "encumbered",
      },
    ]);
    expect(remainingMovement(mustEntity(slowed, "hero"))).toBe(10);
    expect(planDrop(slowed, { entity: "hero", to: { x: 2, y: 0 }, actor: P1 }).kind).toBe(
      "move"
    );
    expect(planDrop(slowed, { entity: "hero", to: { x: 3, y: 0 }, actor: P1 })).toEqual({
      kind: "refused",
      reason: "movement",
    });
  });

  it("row 2 applies the move step's own budget test: a speed override below what the turn spent refuses even a same-cell drop", () => {
    const { state, seq } = table();
    const walked = run(state, [
      {
        kind: "intent",
        id: nextActionId("i"),
        seq: seq(),
        by: "p1",
        entity: "hero",
        mechanic: "core:move",
        program: "move",
        targets: [],
        answers: { to: { x: 4, y: 0 } },
        payment: [],
        window: null,
        basedOn: 0,
      },
      {
        kind: "override",
        id: nextActionId("o"),
        seq: seq(),
        by: "dm",
        entity: "hero",
        path: "stats.speed",
        value: 10,
        reason: "slowed",
      },
    ]);
    expect(mustEntity(walked, "hero").turn.movementUsed).toBe(20);
    expect(planDrop(walked, { entity: "hero", to: { x: 4, y: 0 }, actor: P1 })).toEqual({
      kind: "refused",
      reason: "movement",
    });
    // …and the reducer agrees: the same drop as a move intent is unaffordable.
    const result = resolve(
      walked,
      {
        kind: "intent",
        id: nextActionId("i"),
        seq: seq(),
        by: "p1",
        entity: "hero",
        mechanic: "core:move",
        program: "move",
        targets: [],
        answers: { to: { x: 4, y: 0 } },
        payment: [],
        window: null,
        basedOn: 0,
      },
      catalogue
    );
    expect(result).toEqual({
      kind: "rejected",
      rejection: { reason: "unaffordable", cost: "turn:movement" },
    });
  });

  it("an entity without core:move never plans a move: its controller is refused, the DM places", () => {
    const seq = seqFactory("dm");
    const statue = testEntity({
      id: "statue",
      kind: "pc",
      controllerUid: "p1",
      position: { x: 0, y: 0 },
    });
    const state = run(
      emptyState(),
      openingActions("dm", seq, [statue], { statue: 1 }, ["statue"])
    );
    expect(planDrop(state, { entity: "statue", to: { x: 1, y: 0 }, actor: P1 })).toEqual({
      kind: "refused",
      reason: "movement",
    });
    expect(planDrop(state, { entity: "statue", to: { x: 1, y: 0 }, actor: DM })).toEqual({
      kind: "place",
      to: { x: 1, y: 0 },
    });
  });

  it("a first placement costs nothing", () => {
    const seq = seqFactory("dm");
    const hero = testEntity({
      id: "hero",
      kind: "pc",
      controllerUid: "p1",
      mechanics: ["core:move"],
    });
    const state = run(
      emptyState(),
      openingActions("dm", seq, [hero], { hero: 1 }, ["hero"])
    );
    expect(planDrop(state, { entity: "hero", to: { x: 40, y: 40 }, actor: P1 })).toEqual({
      kind: "move",
      to: { x: 40, y: 40 },
      feet: 0,
    });
  });
});

describe("mapView — what each viewer sees (design addendum §6)", () => {
  function fogged() {
    const { state, seq } = table();
    const hide = (entity: string): Action => ({
      kind: "override",
      id: nextActionId("o"),
      seq: seq(),
      by: "dm",
      entity,
      path: "reveal.token",
      value: false,
      reason: "lurking",
    });
    // Fog on; only the hero's corner revealed; a hidden wolf placed by the DM in the open.
    const wolf = testEntity({
      id: "wolf",
      kind: "monster",
      hp: 11,
      position: { x: 2, y: 0 },
    });
    return run(state, [
      tableAction("dm", seq(), { op: "add-entity", entity: wolf }),
      hide("wolf"),
      tableAction("dm", seq(), { op: "fog", change: { kind: "cover", covered: true } }),
      tableAction("dm", seq(), {
        op: "fog",
        change: { kind: "reveal", rect: { x: 0, y: 0, w: 3, h: 3 } },
      }),
    ]);
  }

  it("the DM sees every positioned token, hidden ones flagged, with HP numbers", () => {
    const view = mapView(fogged(), DM);
    expect(view.tokens.map((t) => [t.id, t.hidden, t.hp])).toEqual([
      ["goblin", false, 7],
      ["hero", false, 30],
      ["wolf", true, 11],
    ]);
    expect(view.fog).toEqual({ covered: true, revealed: [{ x: 0, y: 0, w: 3, h: 3 }] });
    expect(view.tokens.find((t) => t.id === "hero")?.current).toBe(true);
  });

  it("a player loses hidden tokens and tokens under fog, and monster HP numbers unless revealed", () => {
    const state = fogged();
    // goblin at (5,5) is under fog; wolf is hidden; hero is the player's own.
    expect(mapView(state, P1).tokens.map((t) => t.id)).toEqual(["hero"]);
    const seq = seqFactory("dm");
    const uncovered = run(state, [
      tableAction("dm", seq(), { op: "fog", change: { kind: "cover", covered: false } }),
    ]);
    const tokens = mapView(uncovered, P1).tokens;
    expect(tokens.map((t) => [t.id, t.hp, t.maxHp])).toEqual([
      ["goblin", null, null],
      ["hero", 30, 30],
    ]);
    expect(tokens.find((t) => t.id === "goblin")?.hpRatio).toBe(1);
    const revealed = run(uncovered, [
      tableAction("dm", seq(), {
        op: "settings",
        revealMonsterHp: true,
        automation: "full-auto",
      }),
    ]);
    expect(mapView(revealed, P1).tokens.find((t) => t.id === "goblin")?.hp).toBe(7);
  });

  it("the HP bar ratio is clamped to [0, 1] and a player-controlled monster is the player's own", () => {
    const seq = seqFactory("dm");
    const pet = testEntity({
      id: "pet",
      kind: "monster",
      controllerUid: "p1",
      hp: 15,
      maxHp: 10,
      position: { x: 0, y: 0 },
      hidden: true,
    });
    const state = run(
      emptyState(),
      openingActions("dm", seq, [pet], { pet: 1 }, ["pet"])
    );
    const [token] = mapView(state, P1).tokens;
    expect(token?.hpRatio).toBe(1);
    expect(token?.hp).toBe(15);
    expect(mapView(state, P2).tokens).toEqual([]);
  });

  it("a player always sees their own token, hidden or under fog", () => {
    const { state, seq } = table();
    const own = run(state, [
      {
        kind: "override",
        id: nextActionId("o"),
        seq: seq(),
        by: "dm",
        entity: "hero",
        path: "reveal.token",
        value: false,
        reason: "invisible",
      },
      tableAction("dm", seq(), { op: "fog", change: { kind: "cover", covered: true } }),
    ]);
    expect(mapView(own, P1).tokens.map((t) => [t.id, t.hidden])).toEqual([
      ["hero", true],
    ]);
    expect(mapView(own, P2).tokens).toEqual([]);
  });
});
