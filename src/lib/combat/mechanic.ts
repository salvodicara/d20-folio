/**
 * The mechanics authoring contract (v1) — what SRD data, the private content pack and
 * homebrew write against. Spec: docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md.
 *
 * `conformMechanic` is the only entry: a closed-world structural check followed by semantic
 * rules, each failure carrying the JSON path and a rule id. Never a bare `null`.
 */
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
  | { readonly id: string; readonly kind: "table"; readonly label: LabelId };

export interface TargetSpec {
  readonly count: number;
  readonly eligibility: Predicate;
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

// ── Structural check (closed keys, closed enums) ────────────────────────────

const MECHANIC_KEYS = new Set(["schema", "id", "source", "label", "active"]);
const PROGRAM_KEYS = new Set(["id", "trigger", "cost", "targets", "inputs", "steps"]);
const SOURCES = new Set(["srd", "pack", "homebrew", "monster"]);
const STEP_KINDS = new Set([
  "attack",
  "save",
  "damage",
  "heal",
  "effect-start",
  "condition",
  "move-mark",
  "turn-claim",
  "negate",
  "manual-table",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(rule: string, path: string): Conformance {
  return { ok: false, rule, path };
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string
): Conformance | null {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return fail("unknown-key", path ? `${path}.${key}` : key);
  }
  return null;
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
  for (const [i, step] of program.steps.entries()) {
    const stepPath = `${path}.steps[${i}]`;
    if (!STEP_KINDS.has(step.kind)) return fail("unknown-step-kind", `${stepPath}.kind`);
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

export function conformMechanic(value: unknown): Conformance {
  if (!isRecord(value)) return fail("not-an-object", "");
  const top = unknownKeys(value, MECHANIC_KEYS, "");
  if (top) return top;
  if (value.schema !== 1) return fail("unsupported-schema", "schema");
  if (typeof value.id !== "string" || value.id.length === 0)
    return fail("invalid-id", "id");
  if (typeof value.source !== "string" || !SOURCES.has(value.source))
    return fail("invalid-source", "source");
  if (value.active !== undefined) {
    if (!Array.isArray(value.active)) return fail("invalid-active", "active");
    for (const [i, program] of value.active.entries()) {
      const path = `active[${i}]`;
      if (!isRecord(program)) return fail("invalid-program", path);
      const keys = unknownKeys(program, PROGRAM_KEYS, path);
      if (keys) return keys;
      if (typeof program.id !== "string") return fail("invalid-program-id", `${path}.id`);
      if (!isRecord(program.trigger)) return fail("invalid-trigger", `${path}.trigger`);
      if (!Array.isArray(program.steps)) return fail("invalid-steps", `${path}.steps`);
      const semantic = checkProgram(program as unknown as Program, path);
      if (semantic) return semantic;
    }
  }
  return { ok: true, mechanic: value as unknown as Mechanic };
}
