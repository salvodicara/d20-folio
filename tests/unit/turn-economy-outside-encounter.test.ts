/**
 * Actions work outside combat (owner decision 2026-10-16): with no encounter running the
 * turn economy only LOGS, it never gates, and nothing waits for End Turn. Inside an
 * encounter (a campaign fight, or a solo fight the player started by rolling Initiative
 * or advancing a round) the per-turn budget still holds.
 */
import { describe, expect, it } from "vitest";
import {
  encounterRunning,
  executionFor,
  spendsOncePerTurnUse,
  TURN_EXECUTION,
} from "@/lib/play/cast-execution";
import type { ResolvedAction } from "@/lib/smart-tracker";

const bonus = (id: string) =>
  ({ id, source: "feature", type: "bonus" }) as ResolvedAction;
const action = (id: string) =>
  ({ id, source: "feature", type: "action" }) as ResolvedAction;

const OUT_OF_COMBAT = { sharedEncounter: false, soloRound: 1, soloInitiative: "" };

describe("encounterRunning", () => {
  it("is false for a sheet at round 1 with no Initiative and no campaign encounter", () => {
    expect(encounterRunning(OUT_OF_COMBAT)).toBe(false);
  });
  it("is true in a campaign encounter", () => {
    expect(encounterRunning({ ...OUT_OF_COMBAT, sharedEncounter: true })).toBe(true);
  });
  it("is true once the solo player rolled Initiative", () => {
    expect(encounterRunning({ ...OUT_OF_COMBAT, soloInitiative: "14" })).toBe(true);
  });
  it("is true once a solo round advanced", () => {
    expect(encounterRunning({ ...OUT_OF_COMBAT, soloRound: 2 })).toBe(true);
  });
});

describe("executionFor outside an encounter", () => {
  it("a Bonus Action (Second Wind, then a potion) claims no turn slot and survives End Turn", () => {
    for (const use of [bonus("second-wind"), bonus("potion-of-healing")]) {
      expect(executionFor(use, false, false)).toEqual({
        consumesTurnEconomy: false,
        turnScoped: false,
        ritual: false,
      });
    }
  });
  it("an Action (Search, then Study) claims no turn slot", () => {
    expect(executionFor(action("search"), false, false)?.consumesTurnEconomy).toBe(false);
    expect(executionFor(action("study"), false, false)?.consumesTurnEconomy).toBe(false);
  });
  it("inside an encounter the same uses still claim the turn's economy", () => {
    expect(executionFor(bonus("second-wind"), false, true)).toBe(TURN_EXECUTION);
    expect(executionFor(action("search"), false, true)).toBe(TURN_EXECUTION);
  });
  it("a ritual stays a ritual either way", () => {
    const spell = {
      id: "detect-magic",
      source: "spell",
      spellId: "detect-magic",
      type: "action",
    } as ResolvedAction;
    expect(executionFor(spell, true, false)?.ritual).toBe(true);
    expect(executionFor(spell, true, true)?.ritual).toBe(true);
  });
});

describe("spendsOncePerTurnUse", () => {
  it("a once-per-turn use (Sneak Attack) is spent only in an encounter", () => {
    expect(spendsOncePerTurnUse("per-turn", true)).toBe(true);
    expect(spendsOncePerTurnUse("per-turn", false)).toBe(false);
  });
  it("any other recovery is always spent", () => {
    expect(spendsOncePerTurnUse("short-rest", false)).toBe(true);
    expect(spendsOncePerTurnUse(undefined, false)).toBe(true);
  });
});
