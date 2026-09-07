import { describe, expect, it } from "vitest";
import { equal } from "../../src/lib/shared/model";

describe("shared JSON equality", () => {
  it.each([
    [[], {}],
    [{}, []],
    [["rider"], { 0: "rider" }],
  ])("distinguishes arrays from maps: %j and %j", (before, after) => {
    expect(equal(before, after)).toBe(false);
  });
  it("detects a nested preserved payload changing from an empty array to an empty map", () => {
    const before = { payload: { schema: 1, data: { unknownProgram: { steps: [] } } } };
    const after = { payload: { schema: 1, data: { unknownProgram: { steps: {} } } } };
    expect(equal(before, after)).toBe(false);
  });
  it("compares map contents independently of insertion order", () => {
    expect(
      equal(
        { name: "Blade", payload: { effects: [], source: "custom" } },
        { payload: { source: "custom", effects: [] }, name: "Blade" }
      )
    ).toBe(true);
  });
  it("preserves ordered array and scalar comparisons", () => {
    expect(equal(["hit", "damage"], ["damage", "hit"])).toBe(false);
    expect(equal([1, { kind: "damage" }], [1, { kind: "damage" }])).toBe(true);
    expect(equal(null, {})).toBe(false);
    expect(equal(1, "1")).toBe(false);
  });
});
