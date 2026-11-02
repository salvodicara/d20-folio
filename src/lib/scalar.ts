/**
 * One language for every scaled number in the catalogue (edge-case family M11,
 * docs/architecture/2026-11-edge-cases.md).
 *
 * A `Scalar` is a plain number or an `IntegerExpression`; a `DiceScalar` is a
 * literal dice string ("2d6") or a `DiceFormula` whose counts are expressions.
 * Bindings come from one vocabulary (`SCALAR_BINDINGS`), and every resolution
 * reports the bindings it read so the value breakdown can say why
 * ("cast level 4").
 */

import { conformDiceFormula } from "@/lib/dice-formula";
import {
  conformIntegerExpression,
  evaluateIntegerExpression,
  integerExpressionBindingIds,
  type IntegerBindings,
  type IntegerExpression,
} from "@/lib/integer-expression";
import type { DiceFormula } from "@/types/dice-formula";
import type { IntegerExpressionTableRow } from "@/types/integer-expression";

export type Scalar = number | IntegerExpression;
export type DiceScalar = string | DiceFormula;

type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

/** The binding ids a catalogue Scalar may read. Anything else is a typo. */
export const SCALAR_BINDINGS = {
  totalLevel: "level.total",
  classLevel: (classId: string) => `level.class.${classId}`,
  proficiencyBonus: "pb",
  abilityModifier: (ability: Ability) => `ability.mod.${ability}`,
  abilityScore: (ability: Ability) => `ability.score.${ability}`,
  /** The slot level the spell is cast with. */
  castLevel: "cast.level",
  /** The spell's own (lowest) level. */
  castBaseLevel: "cast.base-level",
  /** Uses spent from a tracker (Relentless Rage's DC = 10 + 5 × uses). */
  trackerUsed: (trackerId: string) => `tracker.used.${trackerId}`,
} as const;

const BINDING_PATTERN =
  /^(level\.total|pb|cast\.level|cast\.base-level|level\.class\.[a-z0-9-]+|ability\.(mod|score)\.(STR|DEX|CON|INT|WIS|CHA)|tracker\.used\.[a-z0-9-]+)$/;

/** Whether a binding id belongs to the vocabulary. */
export function isScalarBinding(bindingId: string): boolean {
  return BINDING_PATTERN.test(bindingId);
}

/** A binding the resolution read, with its value: one breakdown term. */
export interface ScalarTerm {
  readonly bindingId: string;
  readonly value: number;
}

function termsOf(
  expressions: IntegerExpression[],
  bindings: IntegerBindings
): ScalarTerm[] {
  const ids = new Set(expressions.flatMap(integerExpressionBindingIds));
  return [...ids].flatMap((bindingId) => {
    const value = bindings[bindingId];
    return value === undefined ? [] : [{ bindingId, value }];
  });
}

/** Resolve a Scalar; `null` when it is malformed or reads a missing binding. */
export function resolveScalar(
  scalar: Scalar,
  bindings: IntegerBindings
): { value: number; terms: ScalarTerm[] } | null {
  if (typeof scalar === "number") {
    return Number.isSafeInteger(scalar) ? { value: scalar, terms: [] } : null;
  }
  const expression = conformIntegerExpression(scalar);
  if (!expression) return null;
  const value = evaluateIntegerExpression(expression, bindings);
  return value === null ? null : { value, terms: termsOf([expression], bindings) };
}

/** Resolve a DiceScalar to a plain dice string ("3d6", "1d8+2"). */
export function resolveDice(
  dice: DiceScalar,
  bindings: IntegerBindings
): { formula: string; terms: ScalarTerm[] } | null {
  if (typeof dice === "string") return { formula: dice, terms: [] };
  const formula = conformDiceFormula(dice);
  if (!formula) return null;
  let text = "";
  const expressions: IntegerExpression[] = [];
  for (const term of formula.terms) {
    const expr = term.kind === "integer" ? term.value : term.count;
    expressions.push(expr);
    const n = evaluateIntegerExpression(expr, bindings);
    if (n === null) return null;
    if (term.kind !== "integer" && n === 0) continue;
    const piece = term.kind === "integer" ? `${n}` : `${n}d${term.sides}`;
    const sign = term.operation === "subtract" ? "-" : "+";
    text = text === "" ? (sign === "-" ? `-${piece}` : piece) : `${text}${sign}${piece}`;
  }
  return { formula: text === "" ? "0" : text, terms: termsOf(expressions, bindings) };
}

const DICE_STRING = /^(\d+)d(\d+)$/;

/**
 * Convert the legacy `dice` + `diceByLevel` pair (one die size, a count that steps
 * with a level) into a DiceScalar whose count is a level table.
 */
export function scalarFromLevelTable(
  bindingId: string,
  base: string,
  byLevel: Readonly<Record<number, string>>
): DiceScalar {
  const parse = (d: string): { count: number; sides: number } => {
    const m = DICE_STRING.exec(d);
    if (!m) throw new Error(`not a plain dice string: ${d}`);
    return { count: Number(m[1]), sides: Number(m[2]) };
  };
  const first = parse(base);
  const steps = Object.entries(byLevel)
    .map(([level, d]) => ({ atLeast: Number(level), ...parse(d) }))
    .sort((a, b) => a.atLeast - b.atLeast);
  if (steps.some((s) => s.sides !== first.sides)) {
    throw new Error("diceByLevel changes the die size; write the DiceFormula by hand");
  }
  const rows = steps.map(
    (s): IntegerExpressionTableRow => ({
      atLeast: s.atLeast,
      value: { kind: "fixed", value: s.count },
    })
  );
  const count: IntegerExpression =
    rows.length === 0
      ? { kind: "fixed", value: first.count }
      : {
          kind: "table",
          input: { kind: "binding", bindingId },
          rows: rows as [IntegerExpressionTableRow, ...IntegerExpressionTableRow[]],
          below: { kind: "fixed", value: first.count },
        };
  return {
    terms: [
      {
        kind: "dice",
        count,
        operation: "add",
        sides: first.sides as never,
        termId: "dice",
      },
    ],
  };
}
