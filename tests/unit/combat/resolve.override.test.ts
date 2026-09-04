import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, Effect, FoldedState, OverrideAction } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const seq = seqFactory("dm");

function opened(hero: Partial<Parameters<typeof testEntity>[0]> = {}): FoldedState {
  let state = initialState();
  const entity = testEntity({ id: "hero", kind: "pc", hp: 30, ...hero });
  for (const action of openingActions("dm", seq, [entity], { hero: 10 }, ["hero"])) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

function override(path: string, value: unknown): Action {
  return {
    kind: "override",
    id: nextActionId("o"),
    seq: seq(),
    by: "dm",
    entity: "hero",
    path,
    value,
    reason: "DM correction",
  };
}

describe("override — direct-patch paths actually change the fact, not just the audit record", () => {
  it("vitals.hp: an HP override changes the entity's live HP", () => {
    const result = resolve(opened(), override("vitals.hp", 18), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(18);
    expect(mustEntity(result.state, "hero").overrides["vitals.hp"]).toEqual({
      value: 18,
      reason: "DM correction",
      by: "dm",
    });
  });

  it("vitals.hp: a negative override clamps to 0 instead of going negative", () => {
    const result = resolve(opened(), override("vitals.hp", -5), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(0);
    expect(mustEntity(result.state, "hero").vitals.life).toBe("dying"); // a PC dropped by hand
    expect(mustEntity(result.state, "hero").overrides["vitals.hp"]?.value).toBe(-5);
  });

  it("vitals.hp to zero downs a PC exactly as damage would: dying, death saves untouched", () => {
    const state = opened({ deathSaves: { successes: 1, failures: 1 } });
    const result = resolve(state, override("vitals.hp", 0), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals).toMatchObject({
      hp: 0,
      life: "dying",
      deathSaves: { successes: 1, failures: 1 },
    });
  });

  it("vitals.hp to zero kills a monster outright, the way applyDamage does", () => {
    const state = opened({ kind: "monster" });
    const result = resolve(state, override("vitals.hp", 0), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(0);
    expect(mustEntity(result.state, "hero").vitals.life).toBe("dead");
  });

  it("vitals.hp to zero on a creature already at zero leaves its life state alone", () => {
    const state = opened({ hp: 0, life: "stable" });
    const result = resolve(state, override("vitals.hp", 0), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.life).toBe("stable");
  });

  it("vitals.life: the DM's last word on death — dying can be overridden to stable", () => {
    const state = opened({
      hp: 0,
      life: "dying",
      deathSaves: { successes: 0, failures: 2 },
    });
    const result = resolve(state, override("vitals.life", "stable"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.life).toBe("stable");
  });

  it("vitals.hp above zero on a dying or stable creature revives it, like healing does", () => {
    const state = opened({
      hp: 0,
      life: "dying",
      deathSaves: { successes: 1, failures: 2 },
    });
    const result = resolve(state, override("vitals.hp", 5), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals).toMatchObject({
      hp: 5,
      life: "alive",
      deathSaves: { successes: 0, failures: 0 },
    });
  });

  it("vitals.hp on a dead creature changes HP only — death is reversed by an explicit life override", () => {
    const state = opened({ hp: 0, life: "dead" });
    const result = resolve(state, override("vitals.hp", 5), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.life).toBe("dead");
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(5);
  });

  it("vitals.life: a string outside the whitelist is recorded but never becomes a life state", () => {
    const result = resolve(opened(), override("vitals.life", "zombie"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.life).toBe("alive"); // unchanged
    expect(mustEntity(result.state, "hero").overrides["vitals.life"]?.value).toBe(
      "zombie"
    );
  });

  it("a malformed override (wrong type) is still recorded but never corrupts the live field", () => {
    const result = resolve(opened(), override("vitals.hp", "not-a-number"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(30); // unchanged
    expect(mustEntity(result.state, "hero").overrides["vitals.hp"]?.value).toBe(
      "not-a-number"
    );
  });

  it("stats.ac keeps its existing consult-at-read behavior (unaffected by this change)", () => {
    const result = resolve(opened(), override("stats.ac", 99), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    // stats.ac is never direct-patched — its base field is untouched; effectiveAc() consults
    // overrides["stats.ac"] at read time (unchanged behavior, proven by resolve.intent.test.ts).
    expect(mustEntity(result.state, "hero").stats.ac).toBe(12); // testEntity default, unpatched
    expect(mustEntity(result.state, "hero").overrides["stats.ac"]?.value).toBe(99);
  });
});

describe("override — an HP override to zero has damage's tail (stage 4)", () => {
  function concentrating(hp: number): FoldedState {
    const state = opened({ hp });
    const effect: Effect = {
      id: "effect-1",
      source: { entity: "hero", mechanic: "test", action: "x", castLevel: null },
      target: "hero",
      payload: { kind: "standing", facts: {} },
      lifetime: { kind: "manual" },
      concentration: true,
    };
    return {
      ...state,
      effects: { [effect.id]: effect },
      entities: {
        ...state.entities,
        hero: { ...mustEntity(state, "hero"), concentration: effect.id },
      },
    };
  }

  it("an override that drops HP from above zero to zero ends concentration, not damage-taken", () => {
    const state = concentrating(10);
    const result = resolve(state, override("vitals.hp", 0), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.receipt.events).toEqual([
      { kind: "hp-zero", entity: "hero" },
      { kind: "effect-ended", effect: "effect-1" },
      { kind: "concentration-ended", entity: "hero", effect: "effect-1" },
    ]);
    expect(mustEntity(result.state, "hero").concentration).toBeNull();
    expect(result.state.effects["effect-1"]).toBeUndefined();
  });

  it("an override from zero back to a positive HP (revival) emits no events", () => {
    const state = concentrating(0);
    const dying = {
      ...state,
      entities: {
        ...state.entities,
        hero: {
          ...mustEntity(state, "hero"),
          vitals: { ...mustEntity(state, "hero").vitals, life: "dying" as const },
        },
      },
    };
    const result = resolve(dying, override("vitals.hp", 12), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.receipt.events).toEqual([]);
  });

  it("an override between two positive HP values emits no events", () => {
    const state = concentrating(20);
    const result = resolve(state, override("vitals.hp", 10), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.receipt.events).toEqual([]);
  });

  it("an override of vitals.life to dead ends concentration too, with no hp-zero (HP may be above 0)", () => {
    const state = concentrating(20);
    const result = resolve(state, override("vitals.life", "dead"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.state.effects["effect-1"]).toBeUndefined();
    expect(mustEntity(result.state, "hero").concentration).toBeNull();
    expect(result.receipt.events).toEqual([
      { kind: "effect-ended", effect: "effect-1" },
      { kind: "concentration-ended", entity: "hero", effect: "effect-1" },
    ]);
    expect(result.receipt.events).not.toContainEqual(
      expect.objectContaining({ kind: "hp-zero" })
    );
  });
});

describe("override — position and reveal.* are direct-patch paths (stage 5)", () => {
  const seqP = seqFactory("dm");
  function table(): FoldedState {
    let state = initialState();
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
      position: { x: 1, y: 0 },
    });
    for (const action of openingActions(
      "dm",
      seqP,
      [hero, goblin],
      { hero: 10, goblin: 5 },
      ["hero", "goblin"]
    )) {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    // The opening seats them adjacent by position but no relation exists until something moves.
    const placed = resolve(state, place("goblin", { x: 1, y: 0 }), catalogue);
    if (placed.kind !== "applied") throw new Error("placement failed");
    return placed.state;
  }
  function place(entity: string, value: unknown, by = "dm"): OverrideAction {
    return {
      kind: "override",
      id: nextActionId("o"),
      seq: seqP(),
      by,
      entity,
      path: "position",
      value,
      reason: "placed",
    };
  }
  const derived = (state: FoldedState, of: string) =>
    state.relations.filter(
      (r) => (r.kind === "adjacent" || r.kind === "range") && (r.a === of || r.b === of)
    );

  it("a placement sets the position, derives adjacent/range, and leaves the movement budget alone", () => {
    const state = table();
    expect(derived(state, "goblin")).toEqual([
      { kind: "adjacent", a: "goblin", b: "hero" },
      { kind: "range", a: "goblin", b: "hero", band: "reach" },
    ]);
    expect(mustEntity(state, "goblin").turn.movementUsed).toBe(0);
    expect(mustEntity(state, "goblin").overrides.position).toEqual({
      value: { x: 1, y: 0 },
      reason: "placed",
      by: "dm",
    });
  });

  it("a placement that leaves reach recomputes the facts but opens no opportunity-attack window", () => {
    const before = table();
    const result = resolve(before, place("goblin", { x: 8, y: 0 }), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "goblin").position).toEqual({ x: 8, y: 0 });
    expect(derived(result.state, "goblin")).toEqual([
      { kind: "range", a: "goblin", b: "hero", band: "far" },
    ]);
    expect(result.state.windows).toEqual([]);
    expect(result.receipt.events).toEqual([]);
  });

  it("a null placement takes the token off the map and drops its derived facts", () => {
    const result = resolve(table(), place("goblin", null), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "goblin").position).toBeNull();
    expect(derived(result.state, "goblin")).toEqual([]);
  });

  it("a malformed placement is recorded but patches nothing", () => {
    const result = resolve(table(), place("goblin", { x: 0.5, y: "no" }), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "goblin").position).toEqual({ x: 1, y: 0 });
    expect(mustEntity(result.state, "goblin").overrides.position?.value).toEqual({
      x: 0.5,
      y: "no",
    });
  });

  it("a placement applies on a log-only table — the seam that lets a log-only table move tokens", () => {
    const logOnly = resolve(
      table(),
      {
        kind: "table",
        id: nextActionId("t"),
        seq: seqP(),
        by: "dm",
        table: { op: "settings", revealMonsterHp: false, automation: "log-only" },
      },
      catalogue
    );
    if (logOnly.kind !== "applied") throw new Error("settings failed");
    const result = resolve(logOnly.state, place("hero", { x: 3, y: 3 }, "p1"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").position).toEqual({ x: 3, y: 3 });
  });

  it("reveal.token / reveal.block / reveal.hp patch the flag; a non-boolean is recorded only", () => {
    let state = table();
    for (const [path, value] of [
      ["reveal.token", false],
      ["reveal.block", true],
      ["reveal.hp", true],
    ] as const) {
      const result = resolve(
        state,
        { ...place("goblin", value), path, reason: "DM" },
        catalogue
      );
      if (result.kind !== "applied") throw new Error("reveal override failed");
      state = result.state;
    }
    expect(mustEntity(state, "goblin").reveal).toEqual({
      block: true,
      hp: true,
      token: false,
    });
    const bad = resolve(
      state,
      { ...place("goblin", "yes"), path: "reveal.token", reason: "DM" },
      catalogue
    );
    if (bad.kind !== "applied") throw new Error("reveal override failed");
    expect(mustEntity(bad.state, "goblin").reveal.token).toBe(false);
  });
});

/**
 * The three paths the DM's HP editor writes (component 18, stage 6 §D9). Temp HP and max HP are
 * persisted facts like `vitals.hp` — the projection sets them and `sync` refreshes them, so a
 * correction has to move the fact, not only the audit record. A condition is not a field at all:
 * it is an `Effect`, so the `condition` path starts or ends one with a `manual` lifetime, which
 * is the same thing the DM does by hand at the table.
 */
describe("override — the HP editor's paths", () => {
  it("vitals.tempHp: a number becomes the temporary-HP pool, sourced by no effect", () => {
    const result = resolve(opened(), override("vitals.tempHp", 7), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.tempHp).toEqual({
      amount: 7,
      source: null,
    });
  });

  it("vitals.tempHp: zero or null clears the pool rather than leaving an empty one", () => {
    const seeded = resolve(opened(), override("vitals.tempHp", 7), catalogue);
    if (seeded.kind !== "applied") throw new Error("temp override failed");
    for (const value of [0, null]) {
      const cleared = resolve(seeded.state, override("vitals.tempHp", value), catalogue);
      expect(cleared.kind).toBe("applied");
      if (cleared.kind !== "applied") return;
      expect(mustEntity(cleared.state, "hero").vitals.tempHp).toBeNull();
    }
  });

  it("vitals.tempHp: a non-number is recorded but never corrupts the pool", () => {
    const result = resolve(opened(), override("vitals.tempHp", "lots"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.tempHp).toBeNull();
    expect(mustEntity(result.state, "hero").overrides["vitals.tempHp"]?.value).toBe(
      "lots"
    );
  });

  it("stats.maxHp: the DM's correction moves the maximum, floored at 1", () => {
    const raised = resolve(opened(), override("stats.maxHp", 45), catalogue);
    expect(raised.kind).toBe("applied");
    if (raised.kind !== "applied") return;
    expect(mustEntity(raised.state, "hero").stats.maxHp).toBe(45);
    const floored = resolve(opened(), override("stats.maxHp", 0), catalogue);
    if (floored.kind !== "applied") throw new Error("max override failed");
    expect(mustEntity(floored.state, "hero").stats.maxHp).toBe(1);
  });

  it("condition: the DM starts one as a manual effect on the entity", () => {
    const result = resolve(
      opened(),
      override("condition", { condition: "prone", active: true }),
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    const effects = Object.values(result.state.effects);
    expect(effects).toHaveLength(1);
    expect(effects[0]).toMatchObject({
      target: "hero",
      payload: { kind: "condition", condition: "prone" },
      lifetime: { kind: "manual" },
      concentration: false,
    });
  });

  it("condition: starting the same one twice does not stack a second effect", () => {
    const first = resolve(
      opened(),
      override("condition", { condition: "prone", active: true }),
      catalogue
    );
    if (first.kind !== "applied") throw new Error("condition override failed");
    const second = resolve(
      first.state,
      override("condition", { condition: "prone", active: true }),
      catalogue
    );
    expect(second.kind).toBe("applied");
    if (second.kind !== "applied") return;
    expect(Object.keys(second.state.effects)).toHaveLength(1);
  });

  it("condition: clearing one ends every condition effect of that id on the entity", () => {
    const started = resolve(
      opened(),
      override("condition", { condition: "prone", active: true }),
      catalogue
    );
    if (started.kind !== "applied") throw new Error("condition override failed");
    const cleared = resolve(
      started.state,
      override("condition", { condition: "prone", active: false }),
      catalogue
    );
    expect(cleared.kind).toBe("applied");
    if (cleared.kind !== "applied") return;
    expect(Object.keys(cleared.state.effects)).toHaveLength(0);
    expect(cleared.receipt.events).toContainEqual({
      kind: "effect-ended",
      effect: Object.keys(started.state.effects)[0],
    });
  });

  it("condition: an id outside the closed set is recorded and changes nothing", () => {
    const result = resolve(
      opened(),
      override("condition", { condition: "hangry", active: true }),
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(Object.keys(result.state.effects)).toHaveLength(0);
  });

  it("condition: a creature immune to it is not conditioned by the path either", () => {
    const state = opened({ conditionImmunities: ["prone"] });
    const result = resolve(
      state,
      override("condition", { condition: "prone", active: true }),
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(Object.keys(result.state.effects)).toHaveLength(0);
  });
});
