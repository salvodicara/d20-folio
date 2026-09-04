/**
 * The mechanics authoring contract (v1) — what SRD data, the private content pack and
 * homebrew write against. Spec: docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md.
 *
 * `conformMechanic` is the only entry: a closed-world structural check followed by semantic
 * rules, each failure carrying the JSON path and a rule id. Never a bare `null`.
 */
import { parseMechanicValue } from "./codec";
import type { LabelId, MechanicId } from "./ids";
import type { Ability, ConditionId, DamageType, Rider } from "./types";

export const MECHANIC_SCHEMA_VERSIONS = [1] as const;

export type Binding = "$self" | "$target" | "$event.entity";

export type Expr =
  | number
  | { readonly byLevel: Readonly<Record<number, number>> }
  | { readonly ability: Ability }
  | { readonly stat: "spellSaveDc" | "spellAttack" | "proficiency" }
  | { readonly sum: readonly Expr[] };

export type Predicate =
  | { readonly outcome: "hit" | "crit" | "miss" | "save-fail" | "save-success" }
  | { readonly answer: string; readonly equals: string | number | boolean }
  | {
      readonly relation: "adjacent" | "visible" | "engaged" | "mark";
      readonly between: readonly [Binding, Binding];
      readonly value?: boolean;
    }
  | { readonly condition: ConditionId; readonly on: Binding; readonly present: boolean }
  | { readonly is: readonly [Binding, Binding] }
  | {
      readonly hp: Binding;
      readonly op: "<=" | "<" | ">=" | ">";
      readonly value: number | "half-max";
    }
  | { readonly all: readonly Predicate[] }
  | { readonly any: readonly Predicate[] }
  | { readonly not: Predicate };

export type EventSelector =
  | { readonly kind: "turn-start" | "turn-end" | "round-start" }
  | { readonly kind: "attack-declared"; readonly target: "self" | "any" }
  | { readonly kind: "damage-taken"; readonly of: "self" | "controlled" }
  | {
      readonly kind: "hp-zero";
      readonly of: "self" | "controlled" | { readonly markedBy: "self" } | "any";
    }
  | { readonly kind: "entity-left-reach"; readonly of: "self" }
  | { readonly kind: "concentration-ended"; readonly source: "self" }
  | { readonly kind: "rest-completed"; readonly rest: "short" | "long" };

export type Trigger =
  | {
      readonly kind: "invocation";
      readonly economy: "action" | "bonus" | "reaction" | "free" | "none";
    }
  | {
      readonly kind: "event";
      readonly event: EventSelector;
      readonly scope: "self" | "controlled" | "others" | "any";
      readonly window: boolean;
    };

export type Cost =
  | { readonly kind: "slot"; readonly level: number; readonly upcast?: boolean }
  | { readonly kind: "resource"; readonly id: string; readonly amount: number }
  | {
      readonly kind: "turn";
      readonly claim: "action" | "bonus" | "reaction" | "attack" | "free";
    }
  | { readonly kind: "concentration" };

export type Input =
  | {
      readonly id: string;
      readonly kind: "d20";
      readonly for: "attack" | "save" | "check" | "concentration";
      readonly ability?: Ability;
      readonly perTarget?: boolean;
    }
  | {
      readonly id: string;
      readonly kind: "dice";
      readonly formula: string;
      readonly perTarget?: boolean;
    }
  | { readonly id: string; readonly kind: "choice"; readonly options: readonly LabelId[] }
  | { readonly id: string; readonly kind: "table"; readonly label: LabelId }
  | { readonly id: string; readonly kind: "position" };

/** An area of effect, authored against `position` inputs: the reducer binds `origin` (and `aim`
 *  for a cone/line) to the caster's answers, then derives the affected entities itself. */
export type AreaShapeSpec =
  | {
      readonly kind: "sphere" | "cylinder";
      readonly origin: string;
      readonly radiusFt: number;
    }
  | { readonly kind: "cube"; readonly origin: string; readonly sizeFt: number }
  | {
      readonly kind: "cone";
      readonly origin: string;
      readonly aim: string;
      readonly lengthFt: number;
    }
  | {
      readonly kind: "line";
      readonly origin: string;
      readonly aim: string;
      readonly lengthFt: number;
      readonly widthFt: number;
    };

export interface TargetSpec {
  readonly count: number | "area";
  readonly eligibility: Predicate;
  readonly area?: AreaShapeSpec;
}

export type LifetimeSpec =
  | { readonly kind: "manual" }
  | {
      readonly kind: "turn-edge";
      readonly entity: Binding;
      readonly edge: "start" | "end";
    }
  | { readonly kind: "rounds"; readonly remaining: number }
  | {
      readonly kind: "seconds";
      readonly remaining: number | { readonly byLevel: Readonly<Record<number, number>> };
    }
  | { readonly kind: "rest"; readonly rest: "short" | "long" };

export interface EffectTemplate {
  readonly kind: "standing" | "mark";
  readonly to: Binding;
  readonly lifetime: LifetimeSpec;
  readonly concentration?: boolean;
  readonly acBonus?: number;
  readonly riders?: readonly Rider[];
  readonly advantage?: boolean;
}

export interface DamagePart {
  readonly dice: string; // input id of the rolled dice, or a fixed "N"
  readonly type: DamageType;
}

export type Step = { readonly id: string; readonly when?: Predicate } & (
  | {
      readonly kind: "attack";
      readonly roll: string;
      readonly bonus: Expr;
      readonly damage: readonly DamagePart[];
    }
  | {
      readonly kind: "save";
      readonly roll: string;
      readonly ability: Ability;
      readonly dc: Expr | "spell";
      readonly onSuccess: "half" | "negate";
    }
  | {
      readonly kind: "damage";
      readonly parts: readonly DamagePart[];
      readonly to: Binding;
    }
  | { readonly kind: "heal"; readonly amount: Expr; readonly to: Binding }
  | { readonly kind: "effect-start"; readonly effect: EffectTemplate }
  | {
      readonly kind: "condition";
      readonly condition: ConditionId;
      readonly to: Binding;
      readonly lifetime: LifetimeSpec;
      readonly concentration?: boolean;
    }
  | { readonly kind: "move-mark"; readonly from: Binding; readonly to: Binding }
  | { readonly kind: "turn-claim"; readonly claim: "once"; readonly key: string }
  | { readonly kind: "negate"; readonly target: "declared-action" }
  | { readonly kind: "manual-table"; readonly label: LabelId }
  | { readonly kind: "move"; readonly to: string }
  /** A Dash: adds the acting entity's speed to this turn's movement budget
   *  (`TurnLedger.movementExtra`). No inputs, no targets — the whole step is the grant. */
  | { readonly kind: "dash" }
);

export interface Program {
  readonly id: string;
  readonly trigger: Trigger;
  readonly cost?: readonly Cost[];
  readonly targets?: TargetSpec;
  readonly inputs?: readonly Input[];
  readonly steps: readonly Step[];
}

export interface Mechanic {
  readonly schema: 1;
  readonly id: MechanicId;
  readonly source: "srd" | "pack" | "homebrew" | "monster";
  readonly label?: LabelId;
  readonly active?: readonly Program[];
}

export type Conformance =
  | { readonly ok: true; readonly mechanic: Mechanic }
  | { readonly ok: false; readonly rule: string; readonly path: string };

// ── Structural check ────────────────────────────────────────────────────────
//
// Structure is `codec.ts`'s `mechanicSchema` and nothing else: ONE closed vocabulary, so a
// definition this check accepts can never be one the persisted document quarantines. See
// `parseMechanicValue`'s note for why that asymmetry was fatal.

function fail(rule: string, path: string): Conformance {
  return { ok: false, rule, path };
}

// ── Semantic rules ──────────────────────────────────────────────────────────

function answersReferenced(predicate: Predicate, out: Set<string>): void {
  if ("answer" in predicate) out.add(predicate.answer);
  else if ("all" in predicate) predicate.all.forEach((p) => answersReferenced(p, out));
  else if ("any" in predicate) predicate.any.forEach((p) => answersReferenced(p, out));
  else if ("not" in predicate) answersReferenced(predicate.not, out);
}

function checkProgram(program: Program, path: string): Conformance | null {
  const inputIds = new Set((program.inputs ?? []).map((input) => input.id));
  const isReaction =
    (program.trigger.kind === "invocation" && program.trigger.economy === "reaction") ||
    (program.trigger.kind === "event" && program.trigger.window);
  for (const [i, cost] of (program.cost ?? []).entries()) {
    if (cost.kind === "turn" && cost.claim === "reaction" && !isReaction) {
      return fail("cost-claim-matches-trigger", `${path}.cost[${i}]`);
    }
  }
  if (program.targets) {
    const area = program.targets.area;
    if (program.targets.count === "area" && area === undefined) {
      return fail("area-required-by-count", `${path}.targets`);
    }
    if (program.targets.count !== "area" && area !== undefined) {
      return fail("area-requires-area-count", `${path}.targets`);
    }
    if (area) {
      const positionIds = new Set(
        (program.inputs ?? [])
          .filter((input) => input.kind === "position")
          .map((input) => input.id)
      );
      const named =
        area.kind === "cone" || area.kind === "line"
          ? [area.origin, area.aim]
          : [area.origin];
      for (const id of named) {
        if (!positionIds.has(id))
          return fail("area-input-declared", `${path}.targets.area`);
      }
    }
  }
  for (const [i, step] of program.steps.entries()) {
    const stepPath = `${path}.steps[${i}]`;
    if (step.when) {
      const referenced = new Set<string>();
      answersReferenced(step.when, referenced);
      for (const id of referenced) {
        if (!inputIds.has(id))
          return fail("input-referenced-by-when", `${stepPath}.when`);
      }
    }
    if (step.kind === "turn-claim" && step.key.length === 0)
      return fail("once-per-turn-needs-key", stepPath);
    if ((step.kind === "attack" || step.kind === "save") && !inputIds.has(step.roll)) {
      return fail("roll-input-declared", `${stepPath}.roll`);
    }
    if (step.kind === "move" && !inputIds.has(step.to)) {
      return fail("move-input-declared", `${stepPath}.to`);
    }
    const usesTarget =
      (step.kind === "effect-start" && step.effect.to === "$target") ||
      (step.kind === "damage" && step.to === "$target") ||
      (step.kind === "heal" && step.to === "$target") ||
      (step.kind === "condition" && step.to === "$target") ||
      (step.kind === "move-mark" && step.to === "$target");
    if (usesTarget && !program.targets) return fail("targets-required-by-step", stepPath);
  }
  return null;
}

/**
 * The one entry: the codec's structural schema first, then the semantic rules the schema cannot
 * express (a reaction cost on a non-reaction trigger, a step naming an input the program never
 * declares, an area without its position input…).
 *
 * The structural half reports no path — `exact-schema` does not produce one — so it fails as
 * `invalid-mechanic-shape` at the root. The semantic half keeps its precise rule and path,
 * which is what a table's own authoring mistakes actually look like.
 *
 * The returned mechanic is the schema's canonicalized, deep-frozen CLONE, not the value passed
 * in: `FoldedState.mechanics` then holds exactly what the codec would write back.
 */
export function conformMechanic(value: unknown): Conformance {
  const mechanic = parseMechanicValue(value);
  if (mechanic === null) return fail("invalid-mechanic-shape", "");
  if (mechanic.id.length === 0) return fail("invalid-id", "id");
  for (const [i, program] of (mechanic.active ?? []).entries()) {
    const semantic = checkProgram(program, `active[${i}]`);
    if (semantic) return semantic;
  }
  return { ok: true, mechanic };
}
