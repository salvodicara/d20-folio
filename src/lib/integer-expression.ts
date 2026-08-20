/** Exact conformance and total evaluation for deterministic integer arithmetic. */

import { exactConformer } from "@/lib/exact-schema";
import {
  INTEGER_EXPRESSION_SCHEMA,
  type IntegerBindings,
  type IntegerExpression,
  type IntegerExpressionSchemaCustomTypes,
  type IntegerExpressionSchemaRefs,
} from "@/types/integer-expression";

export type { IntegerBindings, IntegerExpression } from "@/types/integer-expression";

const MAX_DEPTH = 16;
const MAX_NODES = 128;
const MAX_CHILDREN = 32;
const MAX_ID_LENGTH = 128;
const MAX_BINDINGS = 256;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

function id(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function signedInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null;
}

const INTEGER_EXPRESSION_CONTEXT = {
  customs: {
    id,
    "signed-integer": signedInteger,
  },
  refs: {
    "integer-expression": INTEGER_EXPRESSION_SCHEMA,
  },
} satisfies {
  readonly customs: {
    readonly [Name in keyof IntegerExpressionSchemaCustomTypes]: (
      value: unknown
    ) => IntegerExpressionSchemaCustomTypes[Name] | null;
  };
  readonly refs: {
    readonly [Name in keyof IntegerExpressionSchemaRefs]: typeof INTEGER_EXPRESSION_SCHEMA;
  };
};

const conformIntegerExpressionStructure = exactConformer(
  INTEGER_EXPRESSION_SCHEMA,
  INTEGER_EXPRESSION_CONTEXT
);

function withinComplexity(
  expression: IntegerExpression,
  depth: number,
  count: { value: number }
): boolean {
  count.value += 1;
  if (depth > MAX_DEPTH || count.value > MAX_NODES) return false;
  switch (expression.kind) {
    case "fixed":
    case "binding":
      return true;
    case "add":
      return (
        expression.terms.length <= MAX_CHILDREN &&
        expression.terms.every((child) => withinComplexity(child, depth + 1, count))
      );
    case "multiply":
      return (
        expression.factors.length <= MAX_CHILDREN &&
        expression.factors.every((child) => withinComplexity(child, depth + 1, count))
      );
    case "divide":
      return (
        withinComplexity(expression.dividend, depth + 1, count) &&
        withinComplexity(expression.divisor, depth + 1, count)
      );
    case "min":
    case "max":
      return (
        expression.values.length <= MAX_CHILDREN &&
        expression.values.every((child) => withinComplexity(child, depth + 1, count))
      );
  }
}

/** Rejects extra fields, aliases, hostile ids, excessive depth, and excessive fan-out. */
export function conformIntegerExpression(
  value: unknown
): Readonly<IntegerExpression> | null {
  const expression = conformIntegerExpressionStructure(value);
  return expression && withinComplexity(expression, 0, { value: 0 }) ? expression : null;
}

export function conformIntegerBindings(value: unknown): Readonly<IntegerBindings> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > MAX_BINDINGS || keys.some((key) => typeof key !== "string")) {
    return null;
  }
  const valid = (keys as string[]).every((bindingId) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, bindingId);
    return (
      id(bindingId) !== null &&
      descriptor?.enumerable === true &&
      "value" in descriptor &&
      Number.isSafeInteger(descriptor.value) &&
      !Object.is(descriptor.value, -0)
    );
  });
  return valid ? (value as IntegerBindings) : null;
}

function safe(value: number): number | null {
  return Number.isSafeInteger(value) ? value : null;
}

function evaluate(
  expression: IntegerExpression,
  bindings: IntegerBindings
): number | null {
  switch (expression.kind) {
    case "fixed":
      return expression.value;
    case "binding": {
      if (!Object.hasOwn(bindings, expression.bindingId)) return null;
      const value = bindings[expression.bindingId];
      return value === undefined ? null : safe(value);
    }
    case "add": {
      let total = 0;
      for (const term of expression.terms) {
        const value = evaluate(term, bindings);
        if (value === null) return null;
        const next = safe(total + value);
        if (next === null) return null;
        total = next;
      }
      return total;
    }
    case "multiply": {
      let total = 1;
      for (const factor of expression.factors) {
        const value = evaluate(factor, bindings);
        if (value === null) return null;
        const next = safe(total * value);
        if (next === null) return null;
        total = next;
      }
      return total;
    }
    case "divide": {
      const dividend = evaluate(expression.dividend, bindings);
      const divisor = evaluate(expression.divisor, bindings);
      if (dividend === null || divisor === null || divisor === 0) return null;
      return safe(
        expression.rounding === "floor"
          ? Math.floor(dividend / divisor)
          : Math.ceil(dividend / divisor)
      );
    }
    case "min":
    case "max": {
      const values: number[] = [];
      for (const child of expression.values) {
        const value = evaluate(child, bindings);
        if (value === null) return null;
        values.push(value);
      }
      return expression.kind === "min" ? Math.min(...values) : Math.max(...values);
    }
  }
}

/**
 * Total evaluator: malformed expressions, missing bindings, division by zero, and
 * every unsafe-integer intermediate return `null`.
 */
export function evaluateIntegerExpression(
  expression: unknown,
  bindings: unknown
): number | null {
  const canonical = conformIntegerExpression(expression);
  const canonicalBindings = conformIntegerBindings(bindings);
  return canonical && canonicalBindings ? evaluate(canonical, canonicalBindings) : null;
}
