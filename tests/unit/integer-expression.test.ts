import { describe, expect, it } from "vitest";

import { evaluateIntegerExpression } from "@/lib/integer-expression";

describe("integer-expression bindings", () => {
  const expression = { bindingId: "level", kind: "binding" } as const;

  it("accepts exact plain safe-integer facts", () => {
    expect(evaluateIntegerExpression(expression, { level: 7 })).toBe(7);
  });

  it("rejects accessors, negative zero, symbols, and oversized maps", () => {
    const accessor: Record<string, number> = {};
    Object.defineProperty(accessor, "level", {
      enumerable: true,
      get: () => 7,
    });
    expect(evaluateIntegerExpression(expression, accessor)).toBeNull();
    expect(evaluateIntegerExpression(expression, { level: -0 })).toBeNull();

    const symbol = { level: 7 } as Record<PropertyKey, number>;
    symbol[Symbol("hidden")] = 1;
    expect(evaluateIntegerExpression(expression, symbol)).toBeNull();

    const oversized = Object.fromEntries(
      Array.from({ length: 257 }, (_, index) => [`binding-${index}`, index])
    );
    expect(evaluateIntegerExpression(expression, oversized)).toBeNull();
  });
});

describe("integer-expression table (step lookup)", () => {
  const level = { kind: "binding", bindingId: "level" } as const;
  const fixed = (value: number) => ({ kind: "fixed", value }) as const;
  // Cantrip damage dice, 2024: 1 die, 2 at 5th, 3 at 11th, 4 at 17th.
  const cantripDice = {
    kind: "table",
    input: level,
    rows: [
      { atLeast: 5, value: fixed(2) },
      { atLeast: 11, value: fixed(3) },
      { atLeast: 17, value: fixed(4) },
    ],
    below: fixed(1),
  } as const;

  it.each([
    [1, 1],
    [4, 1],
    [5, 2],
    [10, 2],
    [11, 3],
    [16, 3],
    [17, 4],
    [20, 4],
  ])("level %i gives %i", (lvl, dice) => {
    expect(evaluateIntegerExpression(cantripDice, { level: lvl })).toBe(dice);
  });

  it("without `below`, an input under every row has no value", () => {
    const noBelow = {
      kind: cantripDice.kind,
      input: cantripDice.input,
      rows: cantripDice.rows,
    };
    expect(evaluateIntegerExpression(noBelow, { level: 1 })).toBeNull();
    expect(evaluateIntegerExpression(noBelow, { level: 5 })).toBe(2);
  });

  it("rejects rows that are not strictly increasing", () => {
    const unordered = {
      ...cantripDice,
      rows: [cantripDice.rows[1], cantripDice.rows[0]],
    };
    expect(evaluateIntegerExpression(unordered, { level: 12 })).toBeNull();
  });

  it("row values are expressions too", () => {
    const scaled = {
      kind: "table",
      input: level,
      rows: [{ atLeast: 1, value: { kind: "multiply", factors: [level, fixed(5)] } }],
    } as const;
    expect(evaluateIntegerExpression(scaled, { level: 3 })).toBe(15);
  });
});
