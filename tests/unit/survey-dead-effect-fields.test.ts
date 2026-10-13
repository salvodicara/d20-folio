/** The read-only survey of the dead effect residue: it counts, and it reads standings as the app does. */
import { describe, expect, it } from "vitest";
import { worldStandingActiveKeys } from "@/lib/world-standing-grants";
import {
  liveStandingFactKinds,
  surveyDocuments,
} from "../../scripts/survey-dead-effect-fields";

const standing = (over: Record<string, unknown> = {}) => ({
  kind: "standing",
  ending: null,
  target: { entityId: "self", material: { kind: "character-play" } },
  fact: { kind: "active-key", key: "spell-bless" },
  ...over,
});

const world = {
  occurrences: {
    live: standing(),
    ended: standing({ ending: { round: 3 } }),
    other: standing({
      target: { entityId: "monster-1", material: { kind: "character-play" } },
    }),
    delta: standing({ fact: { kind: "max-hp-delta", amount: 5 } }),
  },
};

describe("liveStandingFactKinds", () => {
  it("finds exactly the live self standings the app reads", () => {
    expect(liveStandingFactKinds(world).sort()).toEqual(["active-key", "max-hp-delta"]);
    expect([...worldStandingActiveKeys(world)]).toEqual(["spell-bless"]);
    expect(liveStandingFactKinds(undefined)).toEqual([]);
  });
});

describe("surveyDocuments", () => {
  it("counts each residue field, never reading a payload", () => {
    const counts = surveyDocuments([
      { path: "users/u/characters/c", data: {} },
      {
        path: "users/u/characters/c/combat/state",
        data: { activeEffects: [{ id: "x" }], playState: { state: { world } } },
      },
      { path: "users/u/characters/d/combat/state", data: { activeEffects: [] } },
      { path: "users/v/characters/e", data: { state: { world } } },
      {
        path: "campaigns/k",
        data: {
          encounter: {
            effectOps: [{ op: "apply" }],
            world: {
              occurrences: {
                live: { kind: "condition", ending: null },
                over: { kind: "condition", ending: { round: 2 } },
              },
            },
          },
        },
      },
      { path: "campaigns/l", data: { encounter: { effectOps: [] } } },
      { path: "campaigns/k/snapshots/s", data: { encounter: { effectOps: [1] } } },
    ]);
    expect(counts).toEqual({
      characters: 2,
      combatStates: 2,
      campaigns: 2,
      activeEffects: 1,
      effectOps: 1,
      encounterWorldConditions: 1,
      liveStandings: 2,
      standingFactKinds: { "active-key": 2, "max-hp-delta": 2 },
    });
  });
});
