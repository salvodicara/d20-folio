# Stage 1 — the dice seam — implementation plan (2026-09-03)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `roll(formula, { by, reason, hidden, mode })` becomes a persisted encounter-log action
with faces, total, seed, roller and source (`app | manual`), consumed by the reducer through the
existing `d20`/`dice` inputs, rendered as one localized log line — with no screen.

**Architecture:** A pure formula module inside the engine (`src/lib/combat/dice.ts`: grammar,
seeded faces, evaluation, verification) and one impure seam outside it (`src/lib/dice.ts`), the
only place in the app that draws randomness for dice. An `app` roll stores its seed and every
client re-derives the faces from it, so a tampered roll is rejected by the fold; a `manual` roll
stores the entered faces and `seed: null`. Intents answer a `d20`/`dice` input with the roll's
action id; undoing the roll makes the intent re-validate as `missing-answer`. Golden replays are
JSON logs folded by one runner. Copied from the state of the art with evidence: Foundry VTT's
`Roll` (formula, terms, per-die results, total, `toJSON`/`fromData`, `MersenneTwister` seeded
generator) and roll modes (Public, GM, Blind, Self); Roll20's `/roll`, `/gmroll` (GM and roller
see it), `/sr`; D&D Beyond's Game Log (who rolled, what for, result with modifiers, secret rolls).

**Tech Stack:** strict TypeScript, Vitest 4 (`fast` project, node), i18next JSON namespaces,
`crypto.getRandomValues` (browser and Node 24).

**Spec:** `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §1 (dice
invariant), §3.1 (`roll` action, roll answers), ADR-0010; constitution §2.2; golden rule 32;
design spec `2026-09-03-ui-redesign-design.md` rules 31, 34, 37 (behaviour only).

## Global Constraints

- `main` untouched; commits on `v2` only; no deploy, no release, no screen, no e2e spec.
- Conventional Commits, owner sole author, one `.changeset/*.md` per commit, owning document
  reconciled in the same commit; never `--no-verify`.
- `src/lib/combat` stays pure: no React, Firebase, Zustand, i18n, clock, `Math.random`,
  `crypto.getRandomValues`, `crypto.randomUUID` (the boundary guard is extended in task 2).
- Randomness for dice exists only in `src/lib/dice.ts` (guard in task 5); every other use of
  randomness in `src/` is an id or a non-dice seed and is pinned by the same guard.
- Every user-visible string ships in EN and IT (`src/i18n/{en,it}/ui/combatLog.json`);
  `pnpm i18n:check` green.
- Public artifacts carry no product-identity term; fixtures are named by role.
- Gate: `just ci` (composed), `pnpm test:rules`, `vite build && pnpm test:budget`; the pack seam
  is not touched, so `just ci-srd-only` is not required by this plan (run it anyway at the end
  because task 1 touches `src/lib/combat/types.ts`, a public module).

## Interfaces (shared by every task)

```ts
// src/lib/combat/dice.ts — pure
export const DIE_SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof DIE_SIDES)[number];
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
  | "too-many-dice"
  | "keep-count"
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
export type RollSource = "app" | "manual";
export type RollPurpose =
  | "attack"
  | "damage"
  | "save"
  | "check"
  | "initiative"
  | "death-save"
  | "concentration"
  | "free";
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
export interface EvaluatedTerm {
  readonly term: FormulaTerm;
  readonly faces: readonly { readonly value: number; readonly kept: boolean }[];
  readonly subtotal: number;
}
export interface Evaluation {
  readonly total: number;
  readonly terms: readonly EvaluatedTerm[];
}
export const MAX_DICE = 100;
export function parseFormula(text: string): Formula | RollError; // discriminate with isRollError
export function isRollError(value: unknown): value is RollError;
export function diceCount(formula: Formula): number;
export function facesFromSeed(seed: number, formula: Formula): number[]; // mulberry32, uint32 seed
export function evaluate(
  formula: Formula,
  faces: readonly number[]
): Evaluation | RollError;
export function verifyRoll(record: RollRecord): RollError | null;

// src/lib/combat/types.ts — additions
export type Answer =
  | number
  | string
  | boolean
  | readonly number[]
  | { readonly roll: ActionId };
export type Answers = Readonly<Record<string, Answer>>;
// Action union gains: (ActionBase & { readonly kind: "roll"; readonly roll: RollRecord })
// FoldedState gains: readonly rolls: Readonly<Record<ActionId, RollRecord>>;
// Rejection gains: { readonly reason: "invalid-roll"; readonly code: RollErrorCode }

// src/lib/dice.ts — the seam (impure)
export interface RollOptions {
  readonly by: string;
  readonly roller?: EntityId | null;
  readonly reason: RollPurpose;
  readonly label?: LabelId | null;
  readonly hidden?: boolean;
  readonly mode: RollSource;
  readonly faces?: readonly number[];
}
export interface PendingRoll {
  readonly kind: "roll";
  readonly by: string;
  readonly roll: RollRecord;
} // Omit<RollAction, "id" | "seq">
export type SeedSource = () => number;
export const cryptoSeed: SeedSource;
export function roll(
  formula: string,
  options: RollOptions,
  seedSource?: SeedSource
): PendingRoll | RollError;

// src/lib/views/roll-view.ts — pure presenter
export interface RollViewer {
  readonly uid: string;
  readonly dm: boolean;
}
export function rollLine(
  t: TranslateFn,
  roll: RollRecord,
  by: string,
  viewer: RollViewer,
  who: string
): string;
```

---

### Task 1: Pure formula module — grammar, seeded faces, evaluation, verification

**Files:**

- Create: `src/lib/combat/dice.ts`
- Test: `tests/unit/combat/dice.test.ts`

**Interfaces:** produces everything under `src/lib/combat/dice.ts` above; consumes `EntityId`,
`LabelId` from `./ids`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  diceCount,
  evaluate,
  facesFromSeed,
  isRollError,
  parseFormula,
  verifyRoll,
  type Formula,
  type RollRecord,
} from "@/lib/combat/dice";

function formula(text: string): Formula {
  const parsed = parseFormula(text);
  if (isRollError(parsed)) throw new Error(parsed.code);
  return parsed;
}

describe("parseFormula — the Foundry grammar subset", () => {
  it("parses dice, keep-highest and flat terms with signs", () => {
    expect(formula("2d20kh1 + 5 - 1d4").terms).toEqual([
      { kind: "dice", sign: 1, count: 2, sides: 20, keep: { mode: "highest", count: 1 } },
      { kind: "flat", sign: 1, value: 5 },
      { kind: "dice", sign: -1, count: 1, sides: 4, keep: null },
    ]);
  });
  it("normalizes the text: lowercase, no whitespace, implicit count", () => {
    expect(formula(" D20 ").text).toBe("1d20");
    expect(formula("8d6").text).toBe("8d6");
    expect(formula("2d20KL1+3").text).toBe("2d20kl1+3");
  });
  it.each([
    ["", "empty"],
    ["1d7", "die-sides"],
    ["101d6", "too-many-dice"],
    ["3d6kh4", "keep-count"],
    ["1d20+", "syntax"],
    ["d20d20", "syntax"],
    ["1d20 * 2", "syntax"],
  ])("rejects %s with %s", (text, code) => {
    const parsed = parseFormula(text);
    expect(isRollError(parsed) && parsed.code).toBe(code);
  });
  it("counts the dice of the whole formula", () => {
    expect(diceCount(formula("2d20kh1+1d8+3"))).toBe(3);
    expect(diceCount(formula("5"))).toBe(0);
  });
});

describe("facesFromSeed — reproducible faces", () => {
  it("is deterministic per seed and in range", () => {
    const f = formula("8d6+1d20");
    const a = facesFromSeed(42, f);
    expect(a).toEqual(facesFromSeed(42, f));
    expect(a).toHaveLength(9);
    a.slice(0, 8).forEach((face) => expect(face).toBeGreaterThanOrEqual(1));
    a.slice(0, 8).forEach((face) => expect(face).toBeLessThanOrEqual(6));
    expect(a[8]).toBeGreaterThanOrEqual(1);
    expect(a[8]).toBeLessThanOrEqual(20);
    expect(facesFromSeed(43, f)).not.toEqual(a);
  });
  it("pins the generator so a stored seed keeps reproducing the same faces", () => {
    expect(facesFromSeed(7, formula("4d6"))).toEqual(facesFromSeed(7, formula("4d6")));
    expect(facesFromSeed(0, formula("1d20"))).toEqual([
      facesFromSeed(0, formula("1d20"))[0],
    ]);
    expect(facesFromSeed(123456789, formula("3d8+2d10"))).toMatchInlineSnapshot();
  });
});

describe("evaluate — totals with kept and dropped dice", () => {
  it("keeps the highest die for advantage and adds flats", () => {
    const result = evaluate(formula("2d20kh1+5"), [7, 18]);
    if (isRollError(result)) throw new Error(result.code);
    expect(result.total).toBe(23);
    expect(result.terms[0]?.faces).toEqual([
      { value: 7, kept: false },
      { value: 18, kept: true },
    ]);
  });
  it("keeps the lowest for disadvantage and subtracts negative dice", () => {
    const result = evaluate(formula("2d20kl1-1d4"), [7, 18, 3]);
    if (isRollError(result)) throw new Error(result.code);
    expect(result.total).toBe(4);
  });
  it("rejects a wrong count of faces and an out-of-range face", () => {
    expect(evaluate(formula("2d6"), [1])).toEqual({ code: "faces-count" });
    expect(evaluate(formula("2d6"), [1, 7])).toEqual({ code: "face-range", at: 1 });
    expect(evaluate(formula("1d6"), [0])).toEqual({ code: "face-range", at: 0 });
    expect(evaluate(formula("1d6"), [2.5])).toEqual({ code: "face-range", at: 0 });
  });
});

describe("verifyRoll — provenance", () => {
  const app = (over: Partial<RollRecord> = {}): RollRecord => {
    const f = formula("1d20+3");
    const faces = facesFromSeed(99, f);
    const total = faces[0]! + 3;
    return {
      formula: "1d20+3",
      faces,
      total,
      seed: 99,
      source: "app",
      hidden: false,
      roller: "hero",
      purpose: "attack",
      label: null,
      ...over,
    };
  };
  it("accepts an app roll whose faces reproduce from its seed", () => {
    expect(verifyRoll(app())).toBeNull();
  });
  it("rejects a tampered app roll", () => {
    const honest = app();
    const face = honest.faces[0] === 20 ? 19 : 20;
    expect(verifyRoll({ ...honest, faces: [face], total: face + 3 })).toEqual({
      code: "faces-mismatch",
    });
  });
  it("rejects a wrong total, a missing seed and a seed on a manual roll", () => {
    expect(verifyRoll({ ...app(), total: 0 })).toEqual({ code: "total-mismatch" });
    expect(verifyRoll({ ...app(), seed: null })).toEqual({ code: "seed-missing" });
    expect(verifyRoll({ ...app(), seed: 1.5 })).toEqual({ code: "seed-missing" });
    expect(verifyRoll({ ...app(), source: "manual" })).toEqual({
      code: "seed-on-manual",
    });
  });
  it("accepts a manual roll with entered faces and no seed", () => {
    expect(
      verifyRoll({ ...app(), source: "manual", seed: null, faces: [11], total: 14 })
    ).toBeNull();
  });
  it("reports formula errors first", () => {
    expect(verifyRoll({ ...app(), formula: "1d7" })).toEqual({
      code: "die-sides",
      at: 0,
    });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test --run tests/unit/combat/dice.test.ts`
Expected: FAIL — cannot resolve `@/lib/combat/dice`.

- [ ] **Step 3: Implement**

```ts
/**
 * Dice as data: the formula grammar, reproducible faces from a seed, evaluation and
 * verification of a roll record. Pure: no randomness lives here — the seam that draws a seed
 * is `src/lib/dice.ts`. Design: ADR-0010; the grammar is the Foundry VTT / Roll20 subset the
 * table needs: `NdS`, `kh`/`kl`, signed integers.
 */
import type { EntityId, LabelId } from "./ids";

export const DIE_SIDES = [2, 3, 4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof DIE_SIDES)[number];
export const MAX_DICE = 100;

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
  | "too-many-dice"
  | "keep-count"
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
export type RollPurpose =
  | "attack"
  | "damage"
  | "save"
  | "check"
  | "initiative"
  | "death-save"
  | "concentration"
  | "free";

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
    if (terms.length > 0 || at > 0) {
      const op = source[at];
      if (op !== "+" && op !== "-") return { code: "syntax", at };
      sign = op === "-" ? -1 : 1;
      at += 1;
    }
    const match = TERM.exec(source.slice(at));
    if (!match) return { code: "syntax", at };
    const [whole, countText, sidesText, keepMode, keepText, flatText] = match;
    if (flatText !== undefined) {
      terms.push({ kind: "flat", sign, value: Number(flatText) });
    } else {
      const count = countText === "" || countText === undefined ? 1 : Number(countText);
      const sides = Number(sidesText);
      if (!DIE_SIDES_SET.has(sides)) return { code: "die-sides", at };
      dice += count;
      if (count < 1 || dice > MAX_DICE) return { code: "too-many-dice", at };
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
  return { text: render(terms), terms };
}

function render(terms: readonly FormulaTerm[]): string {
  return terms
    .map((term, index) => {
      const sign =
        index === 0 ? (term.sign === -1 ? "-" : "") : term.sign === -1 ? "-" : "+";
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
      const face = slice[i]!;
      if (!Number.isInteger(face) || face < 1 || face > term.sides) {
        return { code: "face-range", at: cursor + i };
      }
    }
    const kept = new Set<number>();
    if (term.keep) {
      const ranked = slice
        .map((value, index) => ({ value, index }))
        .sort((a, b) =>
          term.keep!.mode === "highest" ? b.value - a.value : a.value - b.value
        );
      ranked.slice(0, term.keep.count).forEach((entry) => kept.add(entry.index));
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
```

- [ ] **Step 4: Run to see it pass** — `pnpm test --run tests/unit/combat/dice.test.ts` (the inline snapshot is written on the first run; commit it).
- [ ] **Step 5: Commit** — changeset `v2-dice-formula.md`: "feat(combat): dice as data — formula grammar, seeded faces, evaluation, verification".

### Task 2: The `roll` action in the aggregate and the reducer

**Files:**

- Modify: `src/lib/combat/types.ts` (Answer, Answers, Action, FoldedState, Rejection)
- Modify: `src/lib/combat/resolve.ts` (case `roll`)
- Modify: `src/lib/combat/fold.ts` (`initialState().rolls`)
- Modify: `src/lib/combat/intent.ts` (`answerNumber(state, answers, key)` at every call site; `applyCheck`)
- Modify: `tests/unit/combat/__helpers__/state.ts` (`emptyState().rolls = {}`), `tests/unit/combat/boundary.guard.test.ts` (FORBIDDEN gains `/\bcrypto\.getRandomValues\b/`, `/\bcrypto\.randomUUID\b/`)
- Test: `tests/unit/combat/resolve.roll.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { facesFromSeed, parseFormula, type RollRecord } from "@/lib/combat/dice";
import { fold } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, Encounter, FoldedState, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { emptyState, openingActions, seqFactory } from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const seq = seqFactory("p1");
const ranger = testEntity({
  id: "ranger",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 15,
  abilities: { DEX: 3 },
  mechanics: ["srd:weapon:longbow"],
});
const goblin = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 7,
  ac: 15,
  mechanics: ["monster:goblin:scimitar"],
});
const visible: Relation[] = [
  { kind: "visible", a: "ranger", b: "monster-1", value: true },
  { kind: "visible", a: "monster-1", b: "ranger", value: true },
];

function opening(): Action[] {
  return openingActions("dm", seq, [ranger, goblin], { ranger: 20, "monster-1": 10 }, [
    "ranger",
    "monster-1",
  ]);
}
function run(actions: readonly Action[]): FoldedState {
  let state: FoldedState = { ...emptyState(), relations: visible };
  for (const action of actions) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}
function appRoll(text: string, seed: number, over: Partial<RollRecord> = {}): RollRecord {
  const formula = parseFormula(text);
  if ("code" in formula) throw new Error(formula.code);
  const faces = facesFromSeed(seed, formula);
  const flat = formula.terms.find((t) => t.kind === "flat");
  const total =
    faces.reduce((a, b) => a + b, 0) +
    (flat && flat.kind === "flat" ? flat.sign * flat.value : 0);
  return {
    formula: formula.text,
    faces,
    total,
    seed,
    source: "app",
    hidden: false,
    roller: "ranger",
    purpose: "attack",
    label: null,
    ...over,
  };
}
function rollAction(id: string, by: string, roll: RollRecord): Action {
  return { kind: "roll", id, seq: seq(), by, roll };
}

describe("roll — a logged action with provenance", () => {
  it("records an app roll and rejects a tampered one", () => {
    const state = run([...opening(), rollAction("r1", "p1", appRoll("1d20", 5))]);
    expect(state.rolls.r1?.seed).toBe(5);
    const honest = appRoll("1d20", 5);
    const tampered = {
      ...honest,
      faces: [honest.faces[0] === 20 ? 1 : 20],
      total: honest.faces[0] === 20 ? 1 : 20,
    };
    const result = resolve(state, rollAction("r2", "p1", tampered), catalogue);
    expect(result.kind === "rejected" && result.rejection).toEqual({
      reason: "invalid-roll",
      code: "faces-mismatch",
    });
  });
  it("records a manual roll and a hidden DM roll", () => {
    const manual: RollRecord = {
      formula: "1d20",
      faces: [17],
      total: 17,
      seed: null,
      source: "manual",
      hidden: false,
      roller: "ranger",
      purpose: "attack",
      label: null,
    };
    const hidden: RollRecord = {
      ...appRoll("1d20", 9),
      hidden: true,
      roller: "monster-1",
    };
    const state = run([
      ...opening(),
      rollAction("r1", "p1", manual),
      rollAction("r2", "dm", hidden),
    ]);
    expect(state.rolls.r1?.source).toBe("manual");
    expect(state.rolls.r2?.hidden).toBe(true);
  });
  it("rejects a roll for an unknown entity", () => {
    const result = resolve(
      run(opening()),
      rollAction("r1", "p1", appRoll("1d20", 1, { roller: "nobody" })),
      catalogue
    );
    expect(result.kind === "rejected" && result.rejection).toEqual({
      reason: "unknown-entity",
      entity: "nobody",
    });
  });
});

describe("intents consume rolls by id", () => {
  function attack(id: string, attackRoll: string, damageRoll: string): Action {
    return {
      kind: "intent",
      id,
      seq: seq(),
      by: "p1",
      entity: "ranger",
      mechanic: "srd:weapon:longbow",
      program: "attack",
      targets: ["monster-1"],
      answers: { roll: { roll: attackRoll }, damage: { roll: damageRoll } },
      payment: [],
      window: null,
      basedOn: 0,
    };
  }
  it("hits with a manual 15 (+5 vs AC 15) and applies the rolled damage", () => {
    const d20: RollRecord = {
      formula: "1d20",
      faces: [15],
      total: 15,
      seed: null,
      source: "manual",
      hidden: false,
      roller: "ranger",
      purpose: "attack",
      label: null,
    };
    const d8: RollRecord = {
      formula: "1d8",
      faces: [6],
      total: 6,
      seed: null,
      source: "manual",
      hidden: false,
      roller: "ranger",
      purpose: "damage",
      label: null,
    };
    const state = run([
      ...opening(),
      rollAction("r1", "p1", d20),
      rollAction("r2", "p1", d8),
      attack("i1", "r1", "r2"),
    ]);
    expect(state.entities["monster-1"]?.vitals.hp).toBe(1);
  });
  it("undoing the roll makes the attack re-validate as missing-answer", () => {
    const d20: RollRecord = {
      formula: "1d20",
      faces: [15],
      total: 15,
      seed: null,
      source: "manual",
      hidden: false,
      roller: "ranger",
      purpose: "attack",
      label: null,
    };
    const d8: RollRecord = {
      formula: "1d8",
      faces: [6],
      total: 6,
      seed: null,
      source: "manual",
      hidden: false,
      roller: "ranger",
      purpose: "damage",
      label: null,
    };
    const log: Action[] = [
      ...opening(),
      rollAction("r1", "p1", d20),
      rollAction("r2", "p1", d8),
      attack("i1", "r1", "r2"),
      { kind: "undo", id: "u1", seq: seq(), by: "dm", of: "r1", reason: null },
    ];
    const encounter: Encounter = {
      schema: 1,
      id: "e",
      host: { kind: "campaign", campaignId: "c" },
      log,
      checkpoint: null,
    };
    // relations are declared in the log in stage 2; until then the runner seeds them
    const result = fold({ ...encounter, log }, catalogue, {
      ...emptyState(),
      relations: visible,
    });
    expect(result.rejections).toEqual([
      { action: "i1", rejection: { reason: "missing-answer", input: "roll" } },
    ]);
    expect(result.state.entities["monster-1"]?.vitals.hp).toBe(7);
  });
});
```

Note: `fold(encounter, catalogue, from?)` gains an optional third parameter — the starting
state when there is no checkpoint (defaults to `initialState()`); it lets tests and replays seed
declared relations before stage 2 makes them log actions.

- [ ] **Step 2: Run to see it fail** — `pnpm test --run tests/unit/combat/resolve.roll.test.ts` (type errors on `rolls`, `kind: "roll"`).
- [ ] **Step 3: Implement.** In `types.ts` add the `Answer` union, the `roll` member `(ActionBase & { readonly kind: "roll"; readonly roll: RollRecord })` importing `RollRecord`, `RollErrorCode` from `./dice`; `rolls` on `FoldedState`; `{ reason: "invalid-roll"; code: RollErrorCode }` on `Rejection`. In `resolve.ts`:

```ts
case "roll": {
  const error = verifyRoll(action.roll);
  if (error) return { kind: "rejected", rejection: { reason: "invalid-roll", code: error.code } };
  if (action.roll.roller !== null && !state.entities[action.roll.roller]) {
    return { kind: "rejected", rejection: { reason: "unknown-entity", entity: action.roll.roller } };
  }
  return applied(
    { ...state, rolls: { ...state.rolls, [action.id]: action.roll } },
    { action: action.id, outcome: "applied", paid: [], events: [], summary: ["roll", `roll:${action.roll.purpose}`] }
  );
}
```

In `intent.ts` replace `answerNumber(answers, key)` with:

```ts
function answerNumber(state: FoldedState, answers: Answers, key: string): number | null {
  const value = answers[key];
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "roll" in value) {
    return state.rolls[value.roll]?.total ?? null;
  }
  return null;
}
```

and pass the intent's entry state at each of the five call sites (`applyIntent`'s `state`, and
`state` in `applyCheck`). `fold.ts`: `initialState()` gains `rolls: {}` and `fold` gains the
optional `from` parameter. Helpers: `emptyState()` gains `rolls: {}`. Boundary guard: two new
forbidden patterns.

- [ ] **Step 4: Run** — `pnpm test --run tests/unit/combat/` (all green, 38 + new).
- [ ] **Step 5: Commit** — changeset `v2-roll-action.md`: "feat(combat): the roll action — verified provenance in the fold, rolls consumed by id".

### Task 3: The seam — `src/lib/dice.ts`

**Files:**

- Create: `src/lib/dice.ts`
- Test: `tests/unit/dice-seam.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { facesFromSeed, parseFormula } from "@/lib/combat/dice";
import { cryptoSeed, roll } from "@/lib/dice";

describe("roll — the only door to randomness for dice", () => {
  it("an app roll draws one seed and derives its faces from it", () => {
    const pending = roll(
      "2d20kh1+5",
      { by: "p1", roller: "hero", reason: "attack", mode: "app" },
      () => 77
    );
    if ("code" in pending) throw new Error(pending.code);
    const formula = parseFormula("2d20kh1+5");
    if ("code" in formula) throw new Error(formula.code);
    expect(pending).toEqual({
      kind: "roll",
      by: "p1",
      roll: {
        formula: "2d20kh1+5",
        faces: facesFromSeed(77, formula),
        total: Math.max(...facesFromSeed(77, formula)) + 5,
        seed: 77,
        source: "app",
        hidden: false,
        roller: "hero",
        purpose: "attack",
        label: null,
      },
    });
  });
  it("a manual roll stores the entered faces and no seed", () => {
    const pending = roll(
      "1d20+2",
      {
        by: "p1",
        reason: "save",
        mode: "manual",
        faces: [13],
        hidden: true,
        label: "spell:fireball",
      },
      () => {
        throw new Error("must not draw a seed");
      }
    );
    if ("code" in pending) throw new Error(pending.code);
    expect(pending.roll).toEqual({
      formula: "1d20+2",
      faces: [13],
      total: 15,
      seed: null,
      source: "manual",
      hidden: true,
      roller: null,
      purpose: "save",
      label: "spell:fireball",
    });
  });
  it("refuses bad input with the same codes the fold uses", () => {
    expect(roll("1d7", { by: "p1", reason: "free", mode: "app" }, () => 1)).toEqual({
      code: "die-sides",
      at: 0,
    });
    expect(roll("1d20", { by: "p1", reason: "free", mode: "manual" }, () => 1)).toEqual({
      code: "faces-count",
    });
    expect(
      roll("1d20", { by: "p1", reason: "free", mode: "manual", faces: [21] }, () => 1)
    ).toEqual({ code: "face-range", at: 0 });
  });
  it("the default seed source is a 32-bit unsigned integer", () => {
    const seed = cryptoSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see it fail** — `pnpm test --run tests/unit/dice-seam.test.ts`.
- [ ] **Step 3: Implement**

```ts
/**
 * The dice seam — the ONLY module in the app that draws randomness for a roll of the game
 * (golden rule 32, ADR-0010; guarded by `tests/unit/dice-randomness.guard.test.ts`).
 *
 * `roll` builds a `roll` action body: an `app` roll draws one 32-bit seed and derives its faces
 * with the pure generator of `src/lib/combat/dice.ts`, so every client can verify it; a
 * `manual` roll carries the faces the person read off real dice and no seed. The action envelope
 * (`id`, `seq`) is stamped by the append adapter of the encounter document.
 */
import {
  evaluate,
  facesFromSeed,
  isRollError,
  parseFormula,
  verifyRoll,
  type RollError,
  type RollPurpose,
  type RollRecord,
  type RollSource,
} from "@/lib/combat/dice";
import type { EntityId, LabelId } from "@/lib/combat/ids";

export interface RollOptions {
  readonly by: string;
  readonly roller?: EntityId | null;
  readonly reason: RollPurpose;
  readonly label?: LabelId | null;
  readonly hidden?: boolean;
  readonly mode: RollSource;
  /** Faces read off physical dice, in formula order; required when `mode` is `manual`. */
  readonly faces?: readonly number[];
}

export interface PendingRoll {
  readonly kind: "roll";
  readonly by: string;
  readonly roll: RollRecord;
}

export type SeedSource = () => number;

export const cryptoSeed: SeedSource = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]!;
};

export function roll(
  formulaText: string,
  options: RollOptions,
  seedSource: SeedSource = cryptoSeed
): PendingRoll | RollError {
  const formula = parseFormula(formulaText);
  if (isRollError(formula)) return formula;
  const seed = options.mode === "app" ? seedSource() : null;
  const faces =
    options.mode === "app" ? facesFromSeed(seed!, formula) : (options.faces ?? []);
  const evaluation = evaluate(formula, faces);
  if (isRollError(evaluation)) return evaluation;
  const record: RollRecord = {
    formula: formula.text,
    faces,
    total: evaluation.total,
    seed,
    source: options.mode,
    hidden: options.hidden ?? false,
    roller: options.roller ?? null,
    purpose: options.reason,
    label: options.label ?? null,
  };
  const error = verifyRoll(record);
  if (error) return error;
  return { kind: "roll", by: options.by, roll: record };
}
```

- [ ] **Step 4: Run** — green.
- [ ] **Step 5: Commit** — changeset `v2-dice-seam.md`: "feat(dice): the dice seam — app, manual and hidden rolls with provenance".

### Task 4: The log line (EN + IT), no screen

**Files:**

- Create: `src/lib/views/roll-view.ts`
- Modify: `src/i18n/en/ui/combatLog.json`, `src/i18n/it/ui/combatLog.json`
- Test: `tests/unit/roll-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import en from "@/i18n/en/ui/combatLog.json";
import it_ from "@/i18n/it/ui/combatLog.json";
import type { RollRecord } from "@/lib/combat/dice";
import { rollLine } from "@/lib/views/roll-view";

type Dict = Record<string, unknown>;
function translator(dict: Dict) {
  return (key: string, args: Record<string, string | number> = {}) => {
    const value = key
      .split(".")
      .reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], dict);
    if (typeof value !== "string") throw new Error(`missing key ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(args[name]));
  };
}
const tEn = translator(en);
const tIt = translator(it_);
const base: RollRecord = {
  formula: "2d20kh1+5",
  faces: [7, 18],
  total: 23,
  seed: 4,
  source: "app",
  hidden: false,
  roller: "hero",
  purpose: "attack",
  label: null,
};

describe("rollLine", () => {
  it("renders an app roll with faces and total", () => {
    expect(rollLine(tEn, base, "p1", { uid: "p2", dm: false }, "Marco")).toBe(
      "Marco rolls 2d20kh1+5 for an attack: [7, 18] = 23"
    );
    expect(rollLine(tIt, base, "p1", { uid: "p2", dm: false }, "Marco")).toBe(
      "Marco tira 2d20kh1+5 per un attacco: [7, 18] = 23"
    );
  });
  it("renders a manual roll as entered from real dice", () => {
    expect(
      rollLine(
        tEn,
        { ...base, source: "manual", seed: null },
        "p1",
        { uid: "p1", dm: false },
        "Marco"
      )
    ).toContain("from real dice");
  });
  it("hides the faces of a hidden roll from everyone but the DM and the roller", () => {
    const hidden = { ...base, hidden: true };
    expect(rollLine(tEn, hidden, "dm", { uid: "p1", dm: false }, "The DM")).toBe(
      "The DM rolls hidden dice for an attack"
    );
    expect(rollLine(tEn, hidden, "dm", { uid: "dm", dm: true }, "The DM")).toContain(
      "= 23"
    );
    expect(rollLine(tEn, hidden, "p1", { uid: "p1", dm: false }, "Marco")).toContain(
      "= 23"
    );
    expect(rollLine(tEn, hidden, "p1", { uid: "dm", dm: true }, "Marco")).toContain(
      "= 23"
    );
  });
  it("names every purpose in both languages", () => {
    for (const purpose of [
      "attack",
      "damage",
      "save",
      "check",
      "initiative",
      "death-save",
      "concentration",
      "free",
    ] as const) {
      expect(() =>
        rollLine(tEn, { ...base, purpose }, "p1", { uid: "p1", dm: false }, "x")
      ).not.toThrow();
      expect(() =>
        rollLine(tIt, { ...base, purpose }, "p1", { uid: "p1", dm: false }, "x")
      ).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement.** Keys under `"combatLog"` in both files:

EN: `"rollApp": "{{who}} rolls {{formula}} for {{purpose}}: [{{faces}}] = {{total}}"`,
`"rollManual": "{{who}} enters {{formula}} for {{purpose}} from real dice: [{{faces}}] = {{total}}"`,
`"rollHidden": "{{who}} rolls hidden dice for {{purpose}}"`,
`"rollPurpose": { "attack": "an attack", "damage": "damage", "save": "a saving throw", "check": "a check", "initiative": "initiative", "death-save": "a death save", "concentration": "concentration", "free": "a free roll" }`.

IT: `"rollApp": "{{who}} tira {{formula}} per {{purpose}}: [{{faces}}] = {{total}}"`,
`"rollManual": "{{who}} inserisce {{formula}} per {{purpose}} dai dadi fisici: [{{faces}}] = {{total}}"`,
`"rollHidden": "{{who}} tira dadi nascosti per {{purpose}}"`,
`"rollPurpose": { "attack": "un attacco", "damage": "i danni", "save": "un tiro salvezza", "check": "una prova", "initiative": "l'iniziativa", "death-save": "un tiro salvezza contro morte", "concentration": "la concentrazione", "free": "un tiro libero" }`.

```ts
/**
 * Roll presenter — one localized log line per `roll` action (mirrors `combat-log-view.ts`:
 * `t` is injected, nothing here imports i18next). Hidden rolls show their faces only to the
 * DM and to the person who rolled (constitution §2.2: never hide a player's own roll).
 */
import type { RollRecord } from "@/lib/combat/dice";
import type { TranslateFn } from "./combat-log-view";

export interface RollViewer {
  readonly uid: string;
  readonly dm: boolean;
}

export function rollLine(
  t: TranslateFn,
  roll: RollRecord,
  by: string,
  viewer: RollViewer,
  who: string
): string {
  const purpose = t(`combatLog.rollPurpose.${roll.purpose}`);
  const concealed = roll.hidden && !viewer.dm && viewer.uid !== by;
  if (concealed) return t("combatLog.rollHidden", { who, purpose });
  return t(roll.source === "manual" ? "combatLog.rollManual" : "combatLog.rollApp", {
    who,
    purpose,
    formula: roll.formula,
    faces: roll.faces.join(", "),
    total: roll.total,
  });
}
```

- [ ] **Step 4: Run** — `pnpm test --run tests/unit/roll-view.test.ts && pnpm i18n:check`.
- [ ] **Step 5: Commit** — changeset `v2-roll-log-line.md`: "feat(views): the roll log line in EN and IT, hidden faces concealed by the presenter".

### Task 5: The randomness guard

**Files:**

- Create: `tests/unit/dice-randomness.guard.test.ts`

- [ ] **Step 1: Write the test (RED against an empty allowlist first, then pin the real one)**

```ts
/**
 * Randomness for dice exists only in the dice seam (golden rule 32, ADR-0010). Every other
 * call to a random source in `src/` is an id or a non-dice seed, pinned here so a new one is
 * a deliberate decision, never an accident.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");
const CALL = /\b(?:Math\.random|crypto\.getRandomValues|crypto\.randomUUID)\s*\(/;

const ALLOWED: Record<string, string> = {
  "src/lib/dice.ts": "the dice seam",
  "src/lib/quickbuild-random.ts": "character generation seed, not a roll",
  "src/features/campaigns/campaign-io.ts": "invite-code token",
  "src/lib/diagnostics-io.ts": "diagnostics report id (randomUUID + fallback)",
  "src/stores/characterStore.ts": "action and entity ids",
  "src/features/character/center/CombatResolver.tsx":
    "ids (legacy surface, dies at stage 6)",
  "src/features/character/center/ItemResourceCommandProvider.tsx": "ids (legacy surface)",
  "src/features/character/molecules/ResourceConversions.tsx": "ids (legacy surface)",
  "src/features/character/molecules/use-hp-controls.ts": "ids (legacy surface)",
  "src/features/campaigns/SharedNotes.tsx": "note ids",
  "src/lib/sanitize-session.ts": "replacement ids",
  "src/lib/item-resources.ts": "item instance ids",
  "src/lib/library.ts": "monster instance ids",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

describe("randomness — dice only through the seam", () => {
  it("pins every file that calls a random source", () => {
    const callers = walk(SRC)
      .filter((file) => CALL.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file))
      .sort();
    expect(callers).toEqual(Object.keys(ALLOWED).sort());
  });
});
```

- [ ] **Step 2: Run** — the first run reports the real set; reconcile the allowlist with what the run prints (no entry without a reason), rerun green.
- [ ] **Step 3: Commit** — changeset `v2-dice-randomness-guard.md`: "test(guard): randomness for dice only through the seam".

### Task 6: Golden replays — the runner and the provenance replay

**Files:**

- Create: `tests/unit/combat/replays.test.ts`, `tests/unit/combat/replays/dice-provenance.json`
- Modify: `docs/TEST_PORTFOLIO.md` (the replay contract)

**Replay format** (one JSON per replay; `entities` use the `testEntity` options; `log` entries
omit `seq`, stamped in order by the runner with `seqFactory(by)` per author starting at 1,000
plus the index, so the file order is the fold order; relations are seeded until stage 2):

```json
{
  "name": "dice provenance — app, manual, hidden, tampered, consumed, undone",
  "dm": "dm",
  "entities": [
    { "id": "ranger", "kind": "pc", "controllerUid": "p1", "hp": 20, "ac": 15, "abilities": { "DEX": 3 }, "mechanics": ["srd:weapon:longbow"] },
    { "id": "monster-1", "kind": "monster", "controllerUid": "dm", "hp": 7, "ac": 15, "mechanics": ["monster:goblin:scimitar"] }
  ],
  "initiative": { "ranger": 20, "monster-1": 10 },
  "order": ["ranger", "monster-1"],
  "relations": [
    { "kind": "visible", "a": "ranger", "b": "monster-1", "value": true },
    { "kind": "visible", "a": "monster-1", "b": "ranger", "value": true }
  ],
  "log": [
    { "id": "r-app", "by": "p1", "kind": "roll", "roll": { "formula": "1d20", "faces": [<from seed 5>], "total": <same>, "seed": 5, "source": "app", "hidden": false, "roller": "ranger", "purpose": "attack", "label": null } },
    { "id": "r-tampered", "by": "p1", "kind": "roll", "roll": { "formula": "1d20", "faces": [20], "total": 20, "seed": 5, "source": "app", "hidden": false, "roller": "ranger", "purpose": "attack", "label": null } },
    { "id": "r-manual", "by": "p1", "kind": "roll", "roll": { "formula": "1d20", "faces": [15], "total": 15, "seed": null, "source": "manual", "hidden": false, "roller": "ranger", "purpose": "attack", "label": null } },
    { "id": "r-damage", "by": "p1", "kind": "roll", "roll": { "formula": "1d8", "faces": [6], "total": 6, "seed": null, "source": "manual", "hidden": false, "roller": "ranger", "purpose": "damage", "label": null } },
    { "id": "r-hidden", "by": "dm", "kind": "roll", "roll": { "formula": "1d20", "faces": [<from seed 9>], "total": <same>, "seed": 9, "source": "app", "hidden": true, "roller": "monster-1", "purpose": "attack", "label": null } },
    { "id": "i-shot", "by": "p1", "kind": "intent", "entity": "ranger", "mechanic": "srd:weapon:longbow", "program": "attack", "targets": ["monster-1"], "answers": { "roll": { "roll": "r-manual" }, "damage": { "roll": "r-damage" } }, "payment": [], "window": null, "basedOn": 0 },
    { "id": "u-damage", "by": "dm", "kind": "undo", "of": "r-damage", "reason": "DM correction" }
  ],
  "expect": {
    "applied": 3,
    "rejections": [
      { "action": "r-tampered", "reason": "invalid-roll" },
      { "action": "i-shot", "reason": "missing-answer" }
    ],
    "state": { "rolls.r-app.seed": 5, "rolls.r-hidden.hidden": true, "entities.monster-1.vitals.hp": 7 }
  }
}
```

The executor fills the `<from seed N>` faces by running `facesFromSeed` once (the runner also
fails loudly with the expected faces when a seed's faces are wrong, so the file is self-correcting
by reading the failure). `applied` counts only the replay's own log (opening actions excluded): the undone damage roll and the undo itself are skipped, so three rolls apply.

- [ ] **Step 1: Write the runner**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { fold } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, Encounter, FoldedState, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { emptyState, openingActions, seqFactory } from "./__helpers__/state";

interface Replay {
  readonly name: string;
  readonly dm: string;
  readonly entities: readonly Parameters<typeof testEntity>[0][];
  readonly initiative: Readonly<Record<string, number>>;
  readonly order: readonly string[];
  readonly relations?: readonly Relation[];
  readonly log: readonly Omit<Action, "seq">[];
  readonly expect: {
    readonly applied: number;
    readonly rejections: readonly { action: string; reason: string }[];
    readonly state: Readonly<Record<string, unknown>>;
  };
}

const DIR = join(__dirname, "replays");
const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

function pick(state: FoldedState, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      state
    );
}

describe("golden replays", () => {
  for (const file of readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const replay = JSON.parse(readFileSync(join(DIR, file), "utf8")) as Replay;
    it(`${file}: ${replay.name}`, () => {
      const seq = seqFactory(replay.dm);
      let state: FoldedState = { ...emptyState(), relations: replay.relations ?? [] };
      for (const action of openingActions(
        replay.dm,
        seq,
        replay.entities.map(testEntity),
        replay.initiative,
        replay.order
      )) {
        const result = resolve(state, action, catalogue);
        if (result.kind === "rejected")
          throw new Error(`opening: ${JSON.stringify(result.rejection)}`);
        state = result.state;
      }
      const log = replay.log.map(
        (entry, index) =>
          ({ ...entry, seq: { ms: 5_000 + index, counter: 0, by: entry.by } }) as Action
      );
      const encounter: Encounter = {
        schema: 1,
        id: file,
        host: { kind: "campaign", campaignId: "replay" },
        log,
        checkpoint: null,
      };
      const result = fold(encounter, catalogue, state);
      expect(
        result.rejections.map((r) => ({ action: r.action, reason: r.rejection.reason }))
      ).toEqual(replay.expect.rejections);
      expect(result.applied).toBe(replay.expect.applied);
      for (const [path, expected] of Object.entries(replay.expect.state)) {
        expect(pick(result.state, path), path).toEqual(expected);
      }
    });
  }
});
```

- [ ] **Step 2: Write the replay JSON** (above) with real faces; run
      `pnpm test --run tests/unit/combat/replays.test.ts`; fix until green.
- [ ] **Step 3: Test the runner adversarially** — change `"applied"` to 4 and one expected
      HP; both must fail; revert.
- [ ] **Step 4: `docs/TEST_PORTFOLIO.md`** — section "Golden replays": the format above, the
      rule "one replay per hard case and per story; stories 1 and 2 land in stage 3 as
      `marco-first-turn.json` and `sara-ogre-ambush.json`".
- [ ] **Step 5: Commit** — changeset `v2-golden-replays.md`: "test(combat): golden replay runner and the dice-provenance replay".

### Task 7: Documents, gate, handoff

**Files:**

- Modify: `docs/ARCHITECTURE.md` (new section "The dice seam" after "Combat model": the two
  modules, the provenance rule, the guard, the presenter; "Dice today" sentence at the top
  updated: `v2` rolls through the seam, `main` still enters faces),
  `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stage 1 **Status: closed** with the
  commit list), `docs/PROGRAM_STATUS.md` ("`v2` — stage 1": what landed, gate wall time, the
  next stage), `docs/superpowers/plans/2026-09-03-v2-next-session-handoff.md` (rewritten for
  stage 2: positions and areas; reads in order; what stage 1 left; rules).
- [ ] **Step 1:** `just ci` (record wall time), `pnpm test:rules`, `pnpm exec vite build && pnpm test:budget`, `just ci-srd-only`.
- [ ] **Step 2:** Commit — changeset `v2-stage-1-closed.md`: "docs(v2): close stage 1 — the dice seam — and hand off stage 2".
- [ ] **Step 3:** `git push origin HEAD:refs/heads/v2 && git ls-remote origin refs/heads/v2`.
