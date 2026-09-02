import { describe, expect, it } from "vitest";
import { compareSeq, sortBySeq } from "@/lib/combat/ids";

describe("compareSeq — the hybrid logical clock total order", () => {
  it("orders by ms, then counter, then author uid", () => {
    expect(
      compareSeq({ ms: 1, counter: 0, by: "b" }, { ms: 2, counter: 0, by: "a" })
    ).toBe(-1);
    expect(
      compareSeq({ ms: 1, counter: 1, by: "b" }, { ms: 1, counter: 0, by: "a" })
    ).toBe(1);
    expect(
      compareSeq({ ms: 1, counter: 0, by: "a" }, { ms: 1, counter: 0, by: "b" })
    ).toBe(-1);
    expect(
      compareSeq({ ms: 1, counter: 0, by: "a" }, { ms: 1, counter: 0, by: "a" })
    ).toBe(0);
  });

  it("sortBySeq is stable and does not mutate its input", () => {
    const input = [
      { seq: { ms: 2, counter: 0, by: "a" }, id: "x" },
      { seq: { ms: 1, counter: 0, by: "b" }, id: "y" },
    ];
    const sorted = sortBySeq(input);
    expect(sorted.map((a) => a.id)).toEqual(["y", "x"]);
    expect(input.map((a) => a.id)).toEqual(["x", "y"]);
  });
});
