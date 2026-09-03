/**
 * Dice as data: the formula grammar, reproducible faces from a seed, evaluation and
 * verification of a roll record. Pure: no randomness lives here — the seam that draws a seed
 * is `src/lib/dice.ts`. Design: ADR-0010; the grammar is the Foundry VTT / Roll20 subset the
 * table needs: `NdS`, `kh`/`kl`, signed integers (a leading sign is allowed); a formula
 * without dice is not a roll (`no-dice`), and `RollError.at` indexes the normalized text.
 */
import type { EntityId, LabelId } from "./ids";

export const DIE_SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof DIE_SIDES)[number];
export const MAX_DICE = 100;
export const MAX_FLAT = 1000;

export interface DiceTerm {
  readonly kind: "dice";
  readonly sign: 1 | -1;
  readonly count: number;
  readonly sides: DieSides;
  readonly keep: { readonly mode: "highest" | "lowest"; readonly count: number } | null;
}
export interface FlatTerm {
  readonly kind: "flat";
  readonly sign: 1 | -1;
  readonly value: number;
}
export type FormulaTerm = DiceTerm | FlatTerm;
export interface Formula {
  readonly text: string;
  readonly terms: readonly FormulaTerm[];
}

export type RollErrorCode =
  | "empty"
  | "syntax"
  | "die-sides"
  | "dice-count"
  | "too-many-dice"
  | "keep-count"
  | "flat-range"
  | "no-dice"
  | "faces-count"
  | "face-range"
  | "seed-missing"
  | "seed-on-manual"
  | "faces-mismatch"
  | "total-mismatch";
export interface RollError {
  readonly code: RollErrorCode;
  readonly at?: number;
}
export function isRollError(value: unknown): value is RollError {
  return typeof value === "object" && value !== null && "code" in value;
}

export type RollSource = "app" | "manual";
export const ROLL_PURPOSES = [
  "attack",
  "damage",
  "save",
  "check",
  "initiative",
  "death-save",
  "concentration",
  "free",
] as const;
export type RollPurpose = (typeof ROLL_PURPOSES)[number];

/** What the log stores for one roll (ADR-0010); the action envelope adds id, seq and by. */
export interface RollRecord {
  readonly formula: string;
  readonly faces: readonly number[];
  readonly total: number;
  readonly seed: number | null;
  readonly source: RollSource;
  readonly hidden: boolean;
  readonly roller: EntityId | null;
  readonly purpose: RollPurpose;
  readonly label: LabelId | null;
}

// ── Grammar ─────────────────────────────────────────────────────────────────

const TERM = /^(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/;
const DIE_SIDES_SET = new Set<number>(DIE_SIDES);

export function parseFormula(text: string): Formula | RollError {
  const source = text.replace(/\s+/g, "").toLowerCase();
  if (source.length === 0) return { code: "empty" };
  const terms: FormulaTerm[] = [];
  let at = 0;
  let sign: 1 | -1 = 1;
  let dice = 0;
  while (at < source.length) {
    const op = source[at];
    if (op === "+" || op === "-") {
      sign = op === "-" ? -1 : 1;
      at += 1;
    } else if (at > 0) {
      return { code: "syntax", at };
    }
    const match = TERM.exec(source.slice(at));
    if (!match) return { code: "syntax", at };
    const [whole, countText, sidesText, keepMode, keepText, flatText] = match;
    if (flatText !== undefined) {
      const value = Number(flatText);
      if (value > MAX_FLAT) return { code: "flat-range", at };
      terms.push({ kind: "flat", sign, value });
    } else {
      const count = countText ? Number(countText) : 1;
      const sides = Number(sidesText);
      if (!DIE_SIDES_SET.has(sides)) return { code: "die-sides", at };
      if (count < 1) return { code: "dice-count", at };
      dice += count;
      if (dice > MAX_DICE) return { code: "too-many-dice", at };
      let keep: DiceTerm["keep"] = null;
      if (keepMode !== undefined) {
        const keepCount = Number(keepText);
        if (keepCount < 1 || keepCount > count) return { code: "keep-count", at };
        keep = { mode: keepMode === "kh" ? "highest" : "lowest", count: keepCount };
      }
      terms.push({ kind: "dice", sign, count, sides: sides as DieSides, keep });
    }
    at += whole.length;
  }
  if (dice === 0) return { code: "no-dice" };
  return { text: render(terms), terms };
}

function render(terms: readonly FormulaTerm[]): string {
  return terms
    .map((term, index) => {
      const sign = term.sign === -1 ? "-" : index === 0 ? "" : "+";
      if (term.kind === "flat") return `${sign}${term.value}`;
      const keep = term.keep
        ? `${term.keep.mode === "highest" ? "kh" : "kl"}${term.keep.count}`
        : "";
      return `${sign}${term.count}d${term.sides}${keep}`;
    })
    .join("");
}

export function diceCount(formula: Formula): number {
  return formula.terms.reduce(
    (sum, term) => sum + (term.kind === "dice" ? term.count : 0),
    0
  );
}

// ── Reproducible faces ──────────────────────────────────────────────────────

/** mulberry32: a 32-bit generator small enough to read, good enough for dice; never changed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function facesFromSeed(seed: number, formula: Formula): number[] {
  const next = mulberry32(seed);
  const faces: number[] = [];
  for (const term of formula.terms) {
    if (term.kind !== "dice") continue;
    for (let i = 0; i < term.count; i += 1)
      faces.push(Math.floor(next() * term.sides) + 1);
  }
  return faces;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export interface EvaluatedTerm {
  readonly term: FormulaTerm;
  readonly faces: readonly { readonly value: number; readonly kept: boolean }[];
  readonly subtotal: number;
}
export interface Evaluation {
  readonly total: number;
  readonly terms: readonly EvaluatedTerm[];
}

export function evaluate(
  formula: Formula,
  faces: readonly number[]
): Evaluation | RollError {
  if (faces.length !== diceCount(formula)) return { code: "faces-count" };
  const terms: EvaluatedTerm[] = [];
  let cursor = 0;
  let total = 0;
  for (const term of formula.terms) {
    if (term.kind === "flat") {
      const subtotal = term.sign * term.value;
      total += subtotal;
      terms.push({ term, faces: [], subtotal });
      continue;
    }
    const slice = faces.slice(cursor, cursor + term.count);
    for (let i = 0; i < slice.length; i += 1) {
      const face = slice[i] ?? 0;
      if (!Number.isInteger(face) || face < 1 || face > term.sides) {
        return { code: "face-range", at: cursor + i };
      }
    }
    const kept = new Set<number>();
    const keep = term.keep;
    if (keep) {
      const ranked = slice
        .map((value, index) => ({ value, index }))
        .sort((a, b) =>
          keep.mode === "highest" ? b.value - a.value : a.value - b.value
        );
      for (const entry of ranked.slice(0, keep.count)) kept.add(entry.index);
    } else {
      slice.forEach((_, index) => kept.add(index));
    }
    const subtotal =
      term.sign *
      slice.reduce((sum, value, index) => sum + (kept.has(index) ? value : 0), 0);
    total += subtotal;
    terms.push({
      term,
      faces: slice.map((value, index) => ({ value, kept: kept.has(index) })),
      subtotal,
    });
    cursor += term.count;
  }
  return { total, terms };
}

// ── Verification ────────────────────────────────────────────────────────────

const UINT32 = 0xffffffff;

/** Null when the record is consistent; the fold rejects a roll that is not (ADR-0010). */
export function verifyRoll(record: RollRecord): RollError | null {
  const formula = parseFormula(record.formula);
  if (isRollError(formula)) return formula;
  const evaluation = evaluate(formula, record.faces);
  if (isRollError(evaluation)) return evaluation;
  if (record.source === "app") {
    const seed = record.seed;
    if (seed === null || !Number.isInteger(seed) || seed < 0 || seed > UINT32) {
      return { code: "seed-missing" };
    }
    const expected = facesFromSeed(seed, formula);
    if (expected.some((face, index) => face !== record.faces[index])) {
      return { code: "faces-mismatch" };
    }
  } else if (record.seed !== null) {
    return { code: "seed-on-manual" };
  }
  if (evaluation.total !== record.total) return { code: "total-mismatch" };
  return null;
}
