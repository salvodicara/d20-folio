/**
 * Shared slot-completeness gate used by the five feat-/feature-choice
 * resolvers (skill / tool / language / skill-or-tool / expertise).
 */
import { describe, expect, it } from "vitest";
import { arePicksComplete } from "@/lib/feat-choices-common";

describe("arePicksComplete", () => {
  it("returns true for empty slots regardless of picks", () => {
    expect(arePicksComplete([], {})).toBe(true);
    expect(arePicksComplete([], { "slot-0": ["x"] })).toBe(true);
  });

  it("returns false when a slot has no picks", () => {
    expect(arePicksComplete([{ slotId: "slot-0", amount: 1 }], {})).toBe(false);
  });

  it("returns false when a slot is under-filled", () => {
    expect(
      arePicksComplete([{ slotId: "slot-0", amount: 3 }], { "slot-0": ["a", "b"] })
    ).toBe(false);
  });

  it("returns true when every slot is filled to exactly its amount", () => {
    expect(
      arePicksComplete([{ slotId: "slot-0", amount: 2 }], { "slot-0": ["a", "b"] })
    ).toBe(true);
  });

  it("returns false when a slot is over-filled", () => {
    expect(
      arePicksComplete([{ slotId: "slot-0", amount: 1 }], { "slot-0": ["a", "b"] })
    ).toBe(false);
  });

  it("treats a zero-amount slot as complete when empty and incomplete when filled", () => {
    expect(arePicksComplete([{ slotId: "slot-0", amount: 0 }], {})).toBe(true);
    expect(arePicksComplete([{ slotId: "slot-0", amount: 0 }], { "slot-0": [] })).toBe(
      true
    );
    expect(arePicksComplete([{ slotId: "slot-0", amount: 0 }], { "slot-0": ["a"] })).toBe(
      false
    );
  });

  it("requires every slot to be complete across multiple slots", () => {
    const slots = [
      { slotId: "slot-0", amount: 1 },
      { slotId: "slot-1", amount: 2 },
    ];
    expect(arePicksComplete(slots, { "slot-0": ["a"], "slot-1": ["b", "c"] })).toBe(true);
    expect(arePicksComplete(slots, { "slot-0": ["a"], "slot-1": ["b"] })).toBe(false);
    expect(arePicksComplete(slots, { "slot-1": ["b", "c"] })).toBe(false);
  });
});
