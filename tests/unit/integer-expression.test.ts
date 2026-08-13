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
