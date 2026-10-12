/** `lib/play/cast-execution`: whether a use spends the turn, and when it may be a ritual. */
import { describe, expect, it } from "vitest";
import { asRitualAction, executionFor, TURN_EXECUTION } from "@/lib/play/cast-execution";
import type { ResolvedAction } from "@/lib/smart-tracker";

const action = (over: Partial<ResolvedAction> = {}) =>
  ({ id: "a", type: "action", costsSlot: false, ...over }) as ResolvedAction;

describe("executionFor", () => {
  it("a levelled ritual spell may be cast as a ritual, outside the turn", () => {
    expect(
      executionFor(action({ source: "spell", spellId: "detect-magic" }), true)
    ).toEqual({ consumesTurnEconomy: false, turnScoped: false, ritual: true });
  });

  it("a spell that is not a ritual, or a non-spell, may not", () => {
    expect(
      executionFor(action({ source: "spell", spellId: "magic-missile" }), true)
    ).toBeNull();
    expect(executionFor(action({ source: "feature" }), true)).toBeNull();
  });

  it("a spell, a cast-pool use or an extended cast stands outside the turn's economy", () => {
    const outside = { consumesTurnEconomy: false, turnScoped: false, ritual: false };
    expect(
      executionFor(action({ source: "spell", spellId: "magic-missile" }), false)
    ).toEqual(outside);
    expect(
      executionFor(action({ source: "feature", castPoolSourceId: "p" }), false)
    ).toEqual(outside);
    expect(
      executionFor(action({ source: "feature", castTiming: "extended" }), false)
    ).toEqual(outside);
  });

  it("anything else is a turn action", () => {
    expect(executionFor(action({ source: "weapon" }), false)).toBe(TURN_EXECUTION);
  });
});

describe("asRitualAction", () => {
  it("is free and clears every cost", () => {
    const ritual = asRitualAction(
      action({ costsSlot: true, slotLevel: 1, costTracker: "x", trackerCost: 2 })
    );
    expect(ritual).toMatchObject({
      type: "free",
      costsSlot: false,
      slotLevel: undefined,
      costTracker: undefined,
      trackerCost: undefined,
    });
  });
});
