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

export type Scalar = number | IntegerExpression;
export type DiceScalar = string | DiceFormula | DiceTable;

/**
 * Dice that step with a value (a class level, the cast level): the last row whose
 * `atLeast` the input reaches, else `below`. Each step is a dice string, so a step
 * can change the die size ("1d6" to "1d8") or carry a term ("1d8+WIS").
 */
export interface DiceTable {
  readonly kind: "dice-table";
  readonly input: IntegerExpression;
  readonly rows: readonly [DiceTableRow, ...DiceTableRow[]];
  readonly below: string;
}
export interface DiceTableRow {
  readonly atLeast: number;
  readonly dice: string;
}

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

/**
 * The catalogue boundary for a DiceScalar: any dice string (as before), or a
 * well-formed DiceFormula that reads only vocabulary bindings.
 */
export function conformDiceScalar(value: unknown): DiceScalar | null {
  if (typeof value === "string") return value;
  if (isDiceTableShape(value)) return conformDiceTable(value);
  const formula = conformDiceFormula(value);
  if (!formula) return null;
  const ids = formula.terms.flatMap((t) =>
    integerExpressionBindingIds(t.kind === "integer" ? t.value : t.count)
  );
  return ids.every(isScalarBinding) ? formula : null;
}

function isDiceTableShape(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "dice-table"
  );
}

function conformDiceTable(value: Record<string, unknown>): DiceTable | null {
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "below,input,kind,rows") return null;
  const input = conformIntegerExpression(value.input);
  if (!input || !integerExpressionBindingIds(input).every(isScalarBinding)) return null;
  if (typeof value.below !== "string" || !Array.isArray(value.rows)) return null;
  const rows: DiceTableRow[] = [];
  for (const row of value.rows as unknown[]) {
    if (typeof row !== "object" || row === null) return null;
    const { atLeast, dice, ...rest } = row as Record<string, unknown>;
    if (Object.keys(rest).length > 0) return null;
    if (!Number.isSafeInteger(atLeast) || typeof dice !== "string") return null;
    const previous = rows[rows.length - 1];
    if (previous && (atLeast as number) <= previous.atLeast) return null;
    rows.push({ atLeast: atLeast as number, dice });
  }
  const [first, ...more] = rows;
  return first
    ? { kind: "dice-table", input, rows: [first, ...more], below: value.below }
    : null;
}

/** Resolve a DiceScalar to a plain dice string ("3d6", "1d8+2"). */
export function resolveDice(
  dice: DiceScalar,
  bindings: IntegerBindings
): { formula: string; terms: ScalarTerm[] } | null {
  if (typeof dice === "string") return { formula: dice, terms: [] };
  if (isDiceTableShape(dice)) {
    const table = conformDiceTable(dice);
    if (!table) return null;
    const input = evaluateIntegerExpression(table.input, bindings);
    if (input === null) return null;
    let chosen = table.below;
    for (const row of table.rows) if (input >= row.atLeast) chosen = row.dice;
    return { formula: chosen, terms: termsOf([table.input], bindings) };
  }
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

/**
 * Catalogue shorthand: dice that step with one class's level. `base` applies
 * below the first step; a step equal to `base` is dropped as redundant.
 */
export function levelDice(
  classId: string,
  base: string,
  byLevel: Readonly<Record<number, string>>
): DiceTable {
  const steps = Object.entries(byLevel)
    .map(([level, dice]) => ({ atLeast: Number(level), dice }))
    .sort((a, b) => a.atLeast - b.atLeast)
    .filter((row, i, all) => row.dice !== (i === 0 ? base : all[i - 1]?.dice));
  const [first, ...more] = steps;
  return {
    kind: "dice-table",
    input: { kind: "binding", bindingId: SCALAR_BINDINGS.classLevel(classId) },
    rows: first ? [first, ...more] : [{ atLeast: 1, dice: base }],
    below: base,
  };
}
