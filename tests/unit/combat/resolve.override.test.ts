import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState } from "@/lib/combat/types";
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
    expect(mustEntity(result.state, "hero").vitals.life).toBe("alive");
    expect(mustEntity(result.state, "hero").overrides["vitals.hp"]?.value).toBe(-5);
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
