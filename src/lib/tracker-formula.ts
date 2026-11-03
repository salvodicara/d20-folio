/**
 * A tracker formula ("PB", "WIS", "level*5", "1+level", "ceil(level/2)") compiled
 * to the shared Scalar language (`@/lib/scalar`), so a resource's uses resolve
 * through the same evaluator as every other catalogue number. The stored strings
 * do not change: catalogue and homebrew trackers keep their formulas, and this
 * reads them.
 *
 * The compiled tree keeps the formula grammar's own floors exactly:
 *   - a bare ability modifier counts as at least 1 ("WIS" with WIS 8 → 1);
 *   - "TERM*N" floors an ability product at 1, never a level or PB product;
 *   - every sum, difference, division and rounding floors its result at 1;
 *   - inside a sum the right-hand term is raw (a −1 modifier subtracts 1).
 * An unknown formula, or an unknown part of one, counts as 1 and is reported.
 */
import type { IntegerExpression } from "@/types/integer-expression";
import { SCALAR_BINDINGS } from "@/lib/scalar";

export interface CompiledTrackerFormula {
  readonly expression: IntegerExpression;
  /** The formula parts that matched no grammar shape (each counted as 1). */
  readonly unknown: readonly string[];
}

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
type Ability = (typeof ABILITIES)[number];

const isAbility = (term: string): term is Ability =>
  (ABILITIES as readonly string[]).includes(term);

const fixed = (value: number): IntegerExpression => ({ kind: "fixed", value });
const binding = (bindingId: string): IntegerExpression => ({
  kind: "binding",
  bindingId,
});
const atLeastOne = (expression: IntegerExpression): IntegerExpression => ({
  kind: "max",
  values: [fixed(1), expression],
});

/** A bare term inside a sum or division: raw, never floored. */
function rawTerm(term: string): IntegerExpression {
  if (term === "level") return binding(SCALAR_BINDINGS.featureLevel);
  if (term === "PB") return binding(SCALAR_BINDINGS.proficiencyBonus);
  if (isAbility(term)) return binding(SCALAR_BINDINGS.abilityModifier(term));
  return fixed(Number(/^\d+/.exec(term)?.[0] ?? 0));
}

/** A positive divisor: "0" divides by 1, as the formula grammar always has. */
const divisor = (digits: string): IntegerExpression => fixed(Number(digits) || 1);

export function compileTrackerFormula(formula: string): CompiledTrackerFormula {
  const unknown: string[] = [];
  const compile = (f: string): IntegerExpression => {
    const num = parseInt(f, 10);
    if (!isNaN(num) && f === String(num)) return fixed(num);
    if (isAbility(f)) return atLeastOne(rawTerm(f));
    if (f === "PB" || f === "level") return rawTerm(f);

    const [, left = "", right = ""] = /^max\(([^,()]+),([^,()]+)\)$/.exec(f) ?? [];
    if (left)
      return { kind: "max", values: [compile(left.trim()), compile(right.trim())] };

    const [, op, inner = "", by = ""] = /^(floor|ceil)\((.+)\/(\d+)\)$/.exec(f) ?? [];
    if (op) {
      return atLeastOne({
        kind: "divide",
        dividend: compile(inner),
        divisor: divisor(by),
        rounding: op === "ceil" ? "ceil" : "floor",
      });
    }

    const [, base = "", factor = ""] = /^(\w+)\*(\d+)$/.exec(f) ?? [];
    if (base === "level" || base === "PB" || isAbility(base)) {
      const product: IntegerExpression = {
        kind: "multiply",
        factors: [rawTerm(base), fixed(Number(factor))],
      };
      return isAbility(base) ? atLeastOne(product) : product;
    }

    const [, sumLeft = "", sign, term = ""] =
      /^(.+)([+])(\w+)$/.exec(f) ?? /^(.+)(-)(\w+)$/.exec(f) ?? [];
    if (sign) {
      const right =
        sign === "+"
          ? rawTerm(term)
          : { kind: "multiply" as const, factors: [fixed(-1), rawTerm(term)] as const };
      return atLeastOne({ kind: "add", terms: [compile(sumLeft), right] });
    }

    const [, dividend, digits = ""] = /^(\w+)\/(\d+)$/.exec(f) ?? [];
    if (dividend) {
      return atLeastOne({
        kind: "divide",
        dividend: rawTerm(dividend),
        divisor: divisor(digits),
        rounding: "floor",
      });
    }

    unknown.push(f);
    return fixed(1);
  };
  const expression = compile(formula);
  return { expression, unknown };
}
