/**
 * The dice seam — the ONLY module in the app that draws randomness for a roll of the game
 * (golden rule 32, ADR-0010; guarded by `tests/unit/dice-randomness.guard.test.ts`).
 *
 * `roll` builds a `roll` action body: an `app` roll draws one 32-bit seed and derives its faces
 * with the pure generator of `src/lib/combat/dice.ts`, so every client can verify it; a
 * `manual` roll carries the faces the person read off real dice and no seed. The action
 * envelope (`id`, `seq`) is stamped by the append adapter of the encounter document.
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
} from "@/lib/combat/dice";
import type { EntityId, LabelId } from "@/lib/combat/ids";

interface RollOptionsBase {
  readonly by: string;
  readonly roller?: EntityId | null;
  readonly reason: RollPurpose;
  readonly label?: LabelId | null;
  readonly hidden?: boolean;
}
/** `app` draws a seed; `manual` takes the faces read off physical dice, in formula order. */
export type RollOptions = RollOptionsBase &
  (
    | { readonly mode: "app" }
    | { readonly mode: "manual"; readonly faces: readonly number[] }
  );

/** A `roll` action without its envelope (`id`, `seq`). */
export interface PendingRoll {
  readonly kind: "roll";
  readonly by: string;
  readonly roll: RollRecord;
}

export type SeedSource = () => number;

export const cryptoSeed: SeedSource = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 0;
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
    options.mode === "app" ? facesFromSeed(seed ?? 0, formula) : options.faces;
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
