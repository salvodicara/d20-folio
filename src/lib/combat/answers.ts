/**
 * Reading an intent's answers: numeric and positional answers, and binding an authored area
 * shape to the caster's position answers.
 */
import { assertNever } from "./ids";
import type { AreaShapeSpec } from "./mechanic";
import type { AreaShape } from "./position";
import type { FoldedState, IntentAction, Position } from "./types";

/** A numeric answer, given directly or as the total of an accepted `roll` action. Total like
 *  `answerPosition`: a persisted log may carry a malformed answer (`null` included, whose
 *  `typeof` is `"object"`), and this helper reports it missing rather than throwing. */
export function answerNumber(
  state: FoldedState,
  answers: IntentAction["answers"],
  key: string
): number | null {
  // `unknown`, not `Answer`: a persisted log may carry an answer the union does not describe.
  const value: unknown = answers[key];
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "roll" in value) {
    return typeof value.roll === "string"
      ? (state.rolls[value.roll]?.total ?? null)
      : null;
  }
  return null;
}

/** A `position`-kind answer, given directly as `{x,y}` (never as a roll reference). */
export function answerPosition(
  answers: IntentAction["answers"],
  key: string
): Position | null {
  // `unknown`, not `Answer`: a persisted log may carry a malformed answer, and this helper
  // rejects it rather than throwing (the shape the `move` step has always checked).
  const value: unknown = answers[key];
  return typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : null;
}

export type AreaResolution =
  | { readonly kind: "shape"; readonly shape: AreaShape }
  | { readonly kind: "missing"; readonly input: string };

/** An authored `AreaShapeSpec` bound to the caster's `position` answers. */
export function areaShapeFrom(
  spec: AreaShapeSpec,
  answers: IntentAction["answers"]
): AreaResolution {
  const origin = answerPosition(answers, spec.origin);
  if (origin === null) return { kind: "missing", input: spec.origin };
  switch (spec.kind) {
    case "sphere":
    case "cylinder":
      return {
        kind: "shape",
        shape: { kind: spec.kind, origin, radiusFt: spec.radiusFt },
      };
    case "cube":
      return { kind: "shape", shape: { kind: "cube", origin, sizeFt: spec.sizeFt } };
    case "cone":
    case "line": {
      const aim = answerPosition(answers, spec.aim);
      if (aim === null) return { kind: "missing", input: spec.aim };
      return {
        kind: "shape",
        shape:
          spec.kind === "cone"
            ? { kind: "cone", origin, aim, lengthFt: spec.lengthFt }
            : {
                kind: "line",
                origin,
                aim,
                lengthFt: spec.lengthFt,
                widthFt: spec.widthFt,
              },
      };
    }
    default:
      return assertNever(spec, "area shape spec");
  }
}
