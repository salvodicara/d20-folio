/**
 * Difficult Terrain (SRD 5.2.1 Rules Glossary): "every foot of movement in that
 * space costs 1 extra foot". The movement meter's ×2 toggle spends feet moved at
 * that cost, in 5-ft steps that must fit the turn's remaining movement, and it is
 * turn-scoped: the next turn starts on open ground.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DIFFICULT_TERRAIN_COST_PER_FOOT,
  spendMovement,
} from "@/lib/play/difficult-terrain";
import { useCombatStore } from "@/stores/combatStore";

describe("difficult terrain", () => {
  it("costs 1 extra foot per foot", () => {
    expect(DIFFICULT_TERRAIN_COST_PER_FOOT).toBe(2);
  });

  it("spends the feet moved at the terrain's cost", () => {
    // [used before, used marked, cost per foot, budget] → used after
    for (const [prev, next, cost, budget, after] of [
      [0, 10, 1, 30, 10], // open ground: what you mark is what you spend
      [0, 10, 2, 30, 20], // 10 ft through difficult terrain costs 20
      [0, 15, 2, 30, 30], // 15 ft costs the whole 30 ft Speed
      [10, 20, 2, 30, 30], // 10 more ft with 20 left: exactly fits
      [20, 30, 2, 30, 30], // 10 ft wanted, 10 left: only 5 ft fits (costs 10)
      [25, 30, 2, 30, 25], // 5 ft left can't pay a 10-ft step: nothing moves
      [20, 10, 2, 30, 10], // marking movement back gives it back as marked
      [0, 30, 2, 60, 60], // after a Dash: 30 ft of terrain spends 60
    ] as const) {
      expect(spendMovement(prev, next, cost, budget)).toBe(after);
    }
  });

  it("is turn-scoped", () => {
    useCombatStore.getState().setDifficultTerrain(true);
    expect(useCombatStore.getState().difficultTerrain).toBe(true);
    useCombatStore.getState().resetTurn();
    expect(useCombatStore.getState().difficultTerrain).toBe(false);
  });
});

beforeEach(() => useCombatStore.setState({ difficultTerrain: false }));
