/**
 * Pure MechanicsProgram authoring and semantic conformance kernel.
 *
 * Programs declare operations and stable table facts. They contain no observed
 * rolls, mutable world state, persistence paths, or localized copy.
 */

import { canonicalJson } from "@/lib/canonical-fingerprint";
import { conformD20TestRequest } from "@/lib/d20-test";
import { conformDamageDefenseRule } from "@/lib/damage";
import type { DamageDefenseSelector } from "@/types/damage";
import {
  conformDiceAcceptancePolicy,
  conformDiceReplacementPolicy,
  conformDiceFormula,
} from "@/lib/dice-formula";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { conformIntegerExpression } from "@/lib/integer-expression";
import {
  MECHANICS_PREDICATE_SCHEMA,
  MECHANICS_PROGRAM_SCHEMA,
  MECHANICS_PROGRAM_AUTHORING_SCHEMA_REFS,
  mechanicsProgramStepChildKind,
  type D20RequestSpecSchemaShape,
  type MechanicsProgramAuthoringSchemaCustomTypes,
  type MechanicsProgramAuthoringSchemaRefTypes,
} from "@/lib/mechanics-program-authoring-schema";
import {
  conformResourceRecoveryTrigger,
  conformResourceSelector,
  conformResourceTerm,
} from "@/lib/resources";
import type { IntegerExpression } from "@/types/integer-expression";
import type { EntityRef } from "@/types/mechanics-reference";
import type {
  MechanicsEntitySelector,
  MechanicsInput,
  MechanicsPredicate,
  MechanicsProgram,
  MechanicsProgramPhase,
  MechanicsRole,
  MechanicsStep,
} from "@/types/mechanics-program-authoring";
import type { ResourceSelector } from "@/types/resource";

export type {
  MechanicsAmountSpec,
  MechanicsD20RequestSpec,
  MechanicsEntitySelector,
  MechanicsInput,
  MechanicsItemSelector,
  MechanicsLifetimeSpec,
  MechanicsPhaseTrigger,
  MechanicsPredicate,
  MechanicsProgram,
  MechanicsProgramPhase,
  MechanicsProgramRegister,
  MechanicsRole,
  MechanicsStep,
} from "@/types/mechanics-program-authoring";

const MAX_ID_LENGTH = 128;
const MAX_PROGRAM_PHASES = 64;
const MAX_PROGRAM_REGISTERS = 64;
const MAX_PHASE_INPUTS = 128;
const MAX_PHASE_STEPS = 128;
const MAX_PROGRAM_NODES = 512;
const MAX_PREDICATE_DEPTH = 12;
const MAX_PREDICATE_NODES = 128;
const MAX_OPTIONS = 256;
const MAX_PAYMENTS = 64;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);
const ROLES = new Set<MechanicsRole>([
  "owner",
  "source",
  "target",
  "caster",
  "activator",
  "triggering-attacker",
  "victim",
]);
const D20_OUTCOMES = [
  "hit",
  "miss",
  "critical-hit",
  "success",
  "failure",
  "total-only",
  "ineligible",
  "death-save-success",
  "death-save-failure",
  "death-save-natural-one",
  "death-save-recovery",
] as const;

type PlainRecord = Record<string, unknown>;

function identifier(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function safeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER): number | null {
  return Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    (value as number) >= minimum
    ? (value as number)
    : null;
}

function jsonScalar(value: unknown): string | number | boolean | null | undefined {
  return value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0))
    ? value
    : undefined;
}

function damageDefenseSelector(value: unknown): DamageDefenseSelector | null {
  const rule = conformDamageDefenseRule({
    amount: -1,
    kind: "flat-adjustment",
    selector: value,
    sourceId: "mechanics-program-selector",
  });
  return rule?.kind === "flat-adjustment" ? rule.selector : null;
}

const D20_PLACEHOLDER = {
  material: {
    characterId: "mechanics-program",
    kind: "character-play",
    uid: "mechanics-program",
  },
  entityId: "self",
} as const satisfies EntityRef;

function mechanicsRole(value: unknown): MechanicsRole | null {
  return typeof value === "string" && ROLES.has(value as MechanicsRole)
    ? (value as MechanicsRole)
    : null;
}

/**
 * Reuses the terminal D20 conformer by replacing only its two entity slots with
 * placeholders. No roll, modifier or outcome grammar is duplicated here.
 */
function d20RequestSpec(value: unknown): D20RequestSpecSchemaShape | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  const candidate = value as PlainRecord;
  const actor = mechanicsRole(candidate.actor);
  if (!actor || typeof candidate.kind !== "string") return null;
  const rawTarget = candidate.target;
  const target = rawTarget === null ? null : mechanicsRole(rawTarget);
  if (rawTarget !== null && !target) return null;
  const materialized = {
    ...candidate,
    actor: D20_PLACEHOLDER,
    target: rawTarget === null ? null : D20_PLACEHOLDER,
  };
  const canonical = conformD20TestRequest(materialized);
  if (!canonical) return null;
  return {
    ...canonical,
    actor,
    target,
  } as D20RequestSpecSchemaShape;
}

const PROGRAM_SCHEMA_CONTEXT: ExactSchemaContext<
  MechanicsProgramAuthoringSchemaCustomTypes,
  MechanicsProgramAuthoringSchemaRefTypes
> = {
  customs: {
    "d20-request-spec": d20RequestSpec,
    "damage-defense-rule": conformDamageDefenseRule,
    "damage-defense-selector": damageDefenseSelector,
    "dice-formula": conformDiceFormula,
    id: identifier,
    "integer-expression": conformIntegerExpression,
    "json-scalar": (value) => {
      const scalar = jsonScalar(value);
      return scalar === undefined ? null : scalar;
    },
    "positive-integer": (value) => safeInteger(value, 1),
    "resource-selector": conformResourceSelector,
    "resource-term": conformResourceTerm,
    "resource-trigger": conformResourceRecoveryTrigger,
    "signed-integer": safeInteger,
    "term-id": identifier,
  },
  refs: MECHANICS_PROGRAM_AUTHORING_SCHEMA_REFS,
};

export const MECHANICS_PROGRAM_AUTHORING_SCHEMA_CONTEXT = PROGRAM_SCHEMA_CONTEXT;

const conformProgramStructure = exactConformer(
  MECHANICS_PROGRAM_SCHEMA,
  PROGRAM_SCHEMA_CONTEXT
);
const conformPredicateStructure = exactConformer(
  MECHANICS_PREDICATE_SCHEMA,
  PROGRAM_SCHEMA_CONTEXT
);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** A phase may wait for another phase, but authored phase-end dependencies are a DAG. */
function phaseEndDependenciesAreAcyclic(
  phases: readonly MechanicsProgramPhase[]
): boolean {
  const byId = new Map(phases.map((phase) => [phase.phaseId, phase] as const));
  const complete = new Set<string>();
  const active = new Set<string>();
  const visit = (phaseId: string): boolean => {
    if (complete.has(phaseId)) return true;
    if (active.has(phaseId)) return false;
    const phase = byId.get(phaseId);
    if (!phase) return false;
    active.add(phaseId);
    if (phase.trigger.kind === "program-phase-end" && !visit(phase.trigger.phaseId)) {
      return false;
    }
    active.delete(phaseId);
    complete.add(phaseId);
    return true;
  };
  return phases.every((phase) => visit(phase.phaseId));
}

function phaseEndReachability(
  phases: readonly MechanicsProgramPhase[]
): ReadonlyMap<string, ReadonlySet<string>> {
  const successors = new Map<string, string[]>();
  for (const phase of phases) {
    if (phase.trigger.kind !== "program-phase-end") continue;
    const values = successors.get(phase.trigger.phaseId);
    if (values) values.push(phase.phaseId);
    else successors.set(phase.trigger.phaseId, [phase.phaseId]);
  }
  return new Map(
    phases.map((phase) => {
      const reached = new Set<string>([phase.phaseId]);
      const pending = [phase.phaseId];
      while (pending.length > 0) {
        const current = pending.pop();
        if (!current) continue;
        for (const successor of successors.get(current) ?? []) {
          if (reached.has(successor)) continue;
          reached.add(successor);
          pending.push(successor);
        }
      }
      return [phase.phaseId, reached] as const;
    })
  );
}

function phaseLifetimeLivenessIsValid(phases: readonly MechanicsProgramPhase[]): boolean {
  const reachable = phaseEndReachability(phases);
  const invocation = phases.find(({ trigger }) => trigger.kind === "invocation");
  if (!invocation) return false;
  const oneShot = reachable.get(invocation.phaseId);
  if (!oneShot) return false;
  const sourceEndPhases = phases.filter(({ trigger }) => trigger.kind === "source-end");

  for (const creator of phases) {
    const creatorReachable = reachable.get(creator.phaseId);
    if (!creatorReachable) return false;
    for (const step of creator.steps) {
      const target = lifetimePhaseId(step);
      if (target === null) continue;
      if (
        target !== creator.phaseId &&
        oneShot.has(target) &&
        !creatorReachable.has(target)
      ) {
        return false;
      }
      if (
        creatorReachable.has(target) &&
        sourceEndPhases.some((sourceEnd) =>
          reachable.get(sourceEnd.phaseId)?.has(creator.phaseId)
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

function canonicalSubset<Value extends string>(
  values: readonly Value[],
  order: readonly Value[]
): boolean {
  let prior = -1;
  for (const value of values) {
    const index = order.indexOf(value);
    if (index <= prior) return false;
    prior = index;
  }
  return true;
}

function predicateWithinBounds(
  predicate: MechanicsPredicate,
  depth: number,
  nodes: { value: number }
): boolean {
  nodes.value += 1;
  if (depth > MAX_PREDICATE_DEPTH || nodes.value > MAX_PREDICATE_NODES) return false;
  if (predicate.kind === "not") {
    return predicateWithinBounds(predicate.predicate, depth + 1, nodes);
  }
  if (predicate.kind === "all" || predicate.kind === "any") {
    return (
      predicate.predicates.length <= 32 &&
      predicate.predicates.every((child) =>
        predicateWithinBounds(child, depth + 1, nodes)
      )
    );
  }
  return true;
}

function predicatesOfPhase(phase: MechanicsProgramPhase): readonly MechanicsPredicate[] {
  return [
    ...phase.inputs.flatMap((input) => (input.when ? [input.when] : [])),
    ...phase.steps.flatMap((step) => (step.when ? [step.when] : [])),
  ];
}

function collectPredicateReferences(
  predicate: MechanicsPredicate,
  visitor: (predicate: MechanicsPredicate) => boolean
): boolean {
  if (!visitor(predicate)) return false;
  if (predicate.kind === "not") {
    return collectPredicateReferences(predicate.predicate, visitor);
  }
  if (predicate.kind === "all" || predicate.kind === "any") {
    return predicate.predicates.every((child) =>
      collectPredicateReferences(child, visitor)
    );
  }
  return true;
}

function predicateReadsEvolvingState(predicate: MechanicsPredicate): boolean {
  if (predicate.kind === "not") {
    return predicateReadsEvolvingState(predicate.predicate);
  }
  if (predicate.kind === "all" || predicate.kind === "any") {
    return predicate.predicates.some(predicateReadsEvolvingState);
  }
  return [
    "condition-present",
    "entity-hit-points",
    "entity-kind",
    "landed-damage",
    "register",
    "resource",
    "standing-present",
  ].includes(predicate.kind);
}

export function mechanicsPhaseOrderedDependencies(
  phase: MechanicsProgramPhase
): readonly string[] {
  const dependent: string[] = [];
  for (let index = 0; index < phase.steps.length; index += 1) {
    const step = phase.steps[index];
    if (!step || index === 0) continue;
    if (
      (step.when !== null && predicateReadsEvolvingState(step.when)) ||
      amountSpecs(step).some(({ spec }) => spec.kind === "landed-damage")
    ) {
      dependent.push(step.stepId);
    }
  }
  return dependent;
}

function answerPredicateKind(
  predicate: MechanicsPredicate
): MechanicsInput["kind"] | null {
  switch (predicate.kind) {
    case "answer-boolean":
      return "boolean";
    case "answer-choice":
      return "choice";
    case "answer-d20":
      return "d20";
    case "answer-dice-total":
      return "dice";
    case "answer-entity-count":
      return "entities";
    case "answer-integer":
      return "integer";
    case "answer-table":
      return "table";
    default:
      return null;
  }
}

function selectorInputReference(
  selector: MechanicsEntitySelector
): StepInputReference | null {
  return selector.kind === "input"
    ? { inputId: selector.inputId, kind: "entities" }
    : selector.kind === "d20-outcome"
      ? { inputId: selector.inputId, kind: "d20" }
      : selector.kind === "dice-total"
        ? { inputId: selector.inputId, kind: "dice" }
        : null;
}

function resourceReviewedInputId(selector: ResourceSelector): string | null {
  return (selector.kind === "item-resource" || selector.kind === "item-quantity") &&
    selector.item.kind === "reviewed-input"
    ? selector.item.inputId
    : null;
}

interface StepInputReference {
  readonly inputId: string;
  readonly kind: "d20" | "dice" | "entities" | "item";
}

function selectorReferencesOfStep(step: MechanicsStep): readonly StepInputReference[] {
  const references: StepInputReference[] = [];
  const withEntity = step as MechanicsStep & {
    readonly target?: MechanicsEntitySelector;
  };
  if (withEntity.target) {
    const reference = selectorInputReference(withEntity.target);
    if (reference) references.push(reference);
  }
  if (step.kind === "standing" && step.fact.kind === "target-mark") {
    const reference = selectorInputReference(step.fact.marked);
    if (reference) references.push(reference);
  }
  if (step.kind === "inventory-end" || step.kind === "inventory-change") {
    if (step.item.kind === "input") {
      references.push({ inputId: step.item.inputId, kind: "item" });
    }
  }
  if (step.kind === "resource-change") {
    const inputId = resourceReviewedInputId(step.term.selector);
    if (inputId) references.push({ inputId, kind: "item" });
  }
  if (step.kind === "resource-recover" || step.kind === "resource-state") {
    const inputId = resourceReviewedInputId(step.resource);
    if (inputId) references.push({ inputId, kind: "item" });
  }
  return references;
}

function entitySelectorsOfStep(step: MechanicsStep): readonly MechanicsEntitySelector[] {
  const selectors: MechanicsEntitySelector[] = [];
  const withEntity = step as MechanicsStep & {
    readonly target?: MechanicsEntitySelector;
  };
  if (withEntity.target) selectors.push(withEntity.target);
  if (step.kind === "standing" && step.fact.kind === "target-mark") {
    selectors.push(step.fact.marked);
  }
  return selectors;
}

function stepTargetSelector(step: MechanicsStep): MechanicsEntitySelector | null {
  return "target" in step ? step.target : null;
}

function perRequestDiceAmountMatchesTarget(
  inputId: string,
  target: MechanicsEntitySelector,
  inputs: ReadonlyMap<string, MechanicsInput>
): boolean {
  const diceInput = inputs.get(inputId);
  if (diceInput?.kind !== "dice" || diceInput.expansion.kind === "single") return false;

  if (diceInput.expansion.kind === "entities" && target.kind === "input") {
    return target.inputId === diceInput.expansion.inputId;
  }
  if (diceInput.expansion.kind === "d20-outcomes" && target.kind === "d20-outcome") {
    return (
      target.cardinality === "per-request" &&
      target.quantifier === "any" &&
      target.inputId === diceInput.expansion.inputId &&
      exactEqual(target.outcomeIds, diceInput.expansion.outcomeIds)
    );
  }
  if (diceInput.expansion.kind === "dice-totals" && target.kind === "dice-total") {
    return (
      target.cardinality === "per-request" &&
      target.quantifier === "any" &&
      target.inputId === diceInput.expansion.inputId &&
      target.comparison === diceInput.expansion.comparison &&
      exactEqual(target.value, diceInput.expansion.value)
    );
  }
  return false;
}

function lifetimePhaseId(step: MechanicsStep): string | null {
  const lifetime = "lifetime" in step && step.lifetime !== null ? step.lifetime : null;
  return lifetime?.kind === "program-phase-end" ? lifetime.phaseId : null;
}

function amountSpecs(step: MechanicsStep): readonly {
  readonly partId: string | null;
  readonly spec: Extract<MechanicsStep, { kind: "damage" }>["parts"][number]["amount"];
}[] {
  if (step.kind === "damage") {
    return step.parts.map((part) => ({ partId: part.partId, spec: part.amount }));
  }
  if (step.kind === "heal" || step.kind === "temporary-hit-points") {
    return [{ partId: null, spec: step.amount }];
  }
  if (step.kind === "incoming-damage-adjustment") {
    return [{ partId: null, spec: step.amount }];
  }
  return [];
}

function integerBindingIds(expression: IntegerExpression): readonly string[] {
  switch (expression.kind) {
    case "fixed":
      return [];
    case "binding":
      return [expression.bindingId];
    case "add":
      return expression.terms.flatMap(integerBindingIds);
    case "multiply":
      return expression.factors.flatMap(integerBindingIds);
    case "divide":
      return [
        ...integerBindingIds(expression.dividend),
        ...integerBindingIds(expression.divisor),
      ];
    case "min":
    case "max":
      return expression.values.flatMap(integerBindingIds);
  }
}

function validAmountTransform(expression: IntegerExpression): boolean {
  return integerBindingIds(expression).includes("input-total");
}

function authoredBindingIds(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(authoredBindingIds);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Readonly<Record<string, unknown>>;
  const own =
    record.kind === "binding" && typeof record.bindingId === "string"
      ? [record.bindingId]
      : [];
  return [...own, ...Object.values(record).flatMap(authoredBindingIds)];
}

function programSemantics(program: MechanicsProgram): boolean {
  if (
    program.phases.length > MAX_PROGRAM_PHASES ||
    program.registers.length > MAX_PROGRAM_REGISTERS ||
    program.phases.filter((phase) => phase.trigger.kind === "invocation").length !== 1 ||
    !unique(program.phases.map((phase) => phase.phaseId)) ||
    !unique(program.registers.map((register) => register.registerId)) ||
    !phaseEndDependenciesAreAcyclic(program.phases) ||
    !phaseLifetimeLivenessIsValid(program.phases)
  ) {
    return false;
  }
  const phaseIds = new Set(program.phases.map((phase) => phase.phaseId));
  if (
    program.lifetime?.some(
      (spec) =>
        spec.kind === "source-end" ||
        spec.kind === "temporary-hit-points-empty" ||
        (spec.kind === "program-phase-end" && !phaseIds.has(spec.phaseId))
    )
  ) {
    return false;
  }
  const registerIds = new Set(program.registers.map((register) => register.registerId));
  const allInputs = program.phases.flatMap((phase) => phase.inputs);
  const allSteps = program.phases.flatMap((phase) => phase.steps);
  const inputIds = new Set(allInputs.map((input) => input.inputId));
  const stepIds = new Set(allSteps.map((step) => step.stepId));
  if (
    allInputs.length + allSteps.length > MAX_PROGRAM_NODES ||
    inputIds.size !== allInputs.length ||
    stepIds.size !== allSteps.length ||
    [...inputIds].some((inputId) => stepIds.has(inputId))
  ) {
    return false;
  }
  const steps = new Map(allSteps.map((step) => [step.stepId, step] as const));

  for (const phase of program.phases) {
    if (
      phase.inputs.length > MAX_PHASE_INPUTS ||
      phase.steps.length > MAX_PHASE_STEPS ||
      (phase.trigger.kind === "program-phase-end" &&
        (!phaseIds.has(phase.trigger.phaseId) ||
          phase.trigger.phaseId === phase.phaseId)) ||
      phase.steps.some(
        (step, index) => step.kind === "end-program" && index !== phase.steps.length - 1
      )
    ) {
      return false;
    }
    const inputs = new Map(phase.inputs.map((input) => [input.inputId, input] as const));
    const inputIndex = new Map(
      phase.inputs.map((input, index) => [input.inputId, index] as const)
    );
    const allowedInputTotalUses = phase.steps.reduce(
      (total, step) =>
        total +
        amountSpecs(step).reduce(
          (subtotal, amount) =>
            subtotal +
            (amount.spec.kind === "integer"
              ? 0
              : integerBindingIds(amount.spec.transform).filter(
                  (bindingId) => bindingId === "input-total"
                ).length),
          0
        ),
      0
    );
    const phaseBindingIds = authoredBindingIds(phase);
    if (
      phaseBindingIds.filter((bindingId) => bindingId === "input-total").length !==
        allowedInputTotalUses ||
      phaseBindingIds.some((bindingId) => {
        if (bindingId.startsWith("register.")) {
          return !registerIds.has(bindingId.slice("register.".length));
        }
        if (bindingId.startsWith("phase.")) {
          const match = /^phase\.(.+)\.executions$/.exec(bindingId);
          return !match?.[1] || !phaseIds.has(match[1]);
        }
        if (bindingId.startsWith("trigger.")) {
          return (
            phase.trigger.kind !== "damage-taken" ||
            (bindingId !== "trigger.damage" && bindingId !== "trigger.raw-damage")
          );
        }
        if (bindingId.startsWith("input.")) {
          const match = /^input\.(.+)\.level$/.exec(bindingId);
          return (
            !match?.[1] ||
            !phase.inputs.some(
              (candidate) =>
                candidate.kind === "resource" && candidate.inputId === match[1]
            )
          );
        }
        return false;
      })
    ) {
      return false;
    }
    for (const [index, input] of phase.inputs.entries()) {
      if (
        (input.kind === "choice" &&
          (input.options.length > MAX_OPTIONS || !unique(input.options))) ||
        (input.kind === "table" &&
          (input.rows.length > MAX_OPTIONS || !unique(input.rows))) ||
        ((input.kind === "d20" || input.kind === "dice") &&
          (input.payments.length > MAX_PAYMENTS ||
            !unique(input.payments.map((payment) => payment.sourceId)))) ||
        (input.kind === "d20" &&
          input.payments.some(
            (payment) =>
              !input.request.rollRules.replacements.some(
                (replacement) => replacement.rule.sourceId === payment.sourceId
              )
          )) ||
        (input.kind === "dice" &&
          (!conformDiceAcceptancePolicy(input.acceptancePolicy) ||
            !conformDiceReplacementPolicy(input.replacementPolicy) ||
            input.payments.some(
              (payment) =>
                !input.replacementPolicy.some(
                  (replacement) => replacement.sourceId === payment.sourceId
                )
            )))
      ) {
        return false;
      }
      const reviewedInputs =
        input.kind === "resource"
          ? [resourceReviewedInputId(input.term.selector)]
          : input.kind === "d20" || input.kind === "dice"
            ? input.payments.map((payment) =>
                resourceReviewedInputId(payment.term.selector)
              )
            : [];
      if (
        (input.kind === "d20" &&
          input.expansion.kind === "entities" &&
          (inputs.get(input.expansion.inputId)?.kind !== "entities" ||
            (inputIndex.get(input.expansion.inputId) ?? Number.POSITIVE_INFINITY) >=
              index)) ||
        (input.kind === "dice" &&
          input.expansion.kind !== "single" &&
          (inputs.get(input.expansion.inputId)?.kind !==
            (input.expansion.kind === "entities"
              ? "entities"
              : input.expansion.kind === "d20-outcomes"
                ? "d20"
                : "dice") ||
            (inputIndex.get(input.expansion.inputId) ?? Number.POSITIVE_INFINITY) >=
              index ||
            (input.expansion.kind === "d20-outcomes" &&
              !canonicalSubset(input.expansion.outcomeIds, D20_OUTCOMES)))) ||
        reviewedInputs.some(
          (reviewedInput) =>
            reviewedInput !== null &&
            (inputIndex.get(reviewedInput) ?? Number.POSITIVE_INFINITY) >= index
        )
      ) {
        return false;
      }
      if (
        input.when &&
        !collectPredicateReferences(input.when, (predicate) => {
          const expectedKind = answerPredicateKind(predicate);
          if (!expectedKind || !("inputId" in predicate)) return true;
          const referenced = inputs.get(predicate.inputId);
          return (
            referenced?.kind === expectedKind &&
            (inputIndex.get(predicate.inputId) ?? Number.POSITIVE_INFINITY) < index
          );
        })
      ) {
        return false;
      }
    }

    for (const [stepIndex, step] of phase.steps.entries()) {
      if (
        (step.kind === "damage" &&
          (!unique(step.parts.map((part) => part.partId)) ||
            !canonicalSubset(step.traits, [
              "spell",
              "weapon",
              "ranged-weapon",
              "magical",
              "siege",
            ]))) ||
        (step.kind === "incoming-damage-adjustment" &&
          phase.trigger.kind !== "damage-taken") ||
        (step.kind === "register" && !registerIds.has(step.registerId)) ||
        ((step.kind === "condition" ||
          step.kind === "standing" ||
          step.kind === "concentration" ||
          step.kind === "polymorph") &&
          (step.operation === "apply" || step.operation === "start") !==
            (step.lifetime !== null)) ||
        (lifetimePhaseId(step) !== null &&
          !phaseIds.has(lifetimePhaseId(step) as string)) ||
        (step.kind === "occurrence-end" &&
          mechanicsProgramStepChildKind(steps.get(step.childStepId)) === null) ||
        selectorReferencesOfStep(step).some(
          ({ inputId, kind }) => inputs.get(inputId)?.kind !== kind
        ) ||
        entitySelectorsOfStep(step).some(
          (selector) =>
            selector.kind === "d20-outcome" &&
            !canonicalSubset(selector.outcomeIds, D20_OUTCOMES)
        ) ||
        (step.kind === "manual-table" && inputs.get(step.tableInputId)?.kind !== "table")
      ) {
        return false;
      }
      for (const amount of amountSpecs(step)) {
        const amountSpec = amount.spec;
        const diceInput =
          amountSpec.kind === "dice-input" ? inputs.get(amountSpec.inputId) : undefined;
        const targetSelector = stepTargetSelector(step);
        if (
          amountSpec.kind === "dice-input" &&
          (diceInput?.kind !== "dice" ||
            (amountSpec.cardinality === "shared" &&
              diceInput.expansion.kind !== "single") ||
            (amountSpec.cardinality === "per-target-request" &&
              (diceInput.expansion.kind === "single" ||
                targetSelector === null ||
                !perRequestDiceAmountMatchesTarget(
                  amountSpec.inputId,
                  targetSelector,
                  inputs
                ))))
        ) {
          return false;
        }
        if (
          amountSpec.kind !== "integer" &&
          !validAmountTransform(amountSpec.transform)
        ) {
          return false;
        }
        if (amountSpec.kind === "landed-damage") {
          const sourceIndex = phase.steps.findIndex(
            (candidate) => candidate.stepId === amountSpec.stepId
          );
          const source = phase.steps[sourceIndex];
          if (
            sourceIndex < 0 ||
            sourceIndex >= stepIndex ||
            source?.kind !== "damage" ||
            (source.when !== null && !exactEqual(source.when, step.when)) ||
            (amountSpec.partId !== null &&
              !source.parts.some((part) => part.partId === amountSpec.partId))
          ) {
            return false;
          }
        }
      }
      if (
        step.when &&
        !collectPredicateReferences(step.when, (predicate) => {
          const expectedKind = answerPredicateKind(predicate);
          if (expectedKind && "inputId" in predicate) {
            return inputs.get(predicate.inputId)?.kind === expectedKind;
          }
          if (predicate.kind === "register") return registerIds.has(predicate.registerId);
          if (predicate.kind === "phase-executions") {
            return phaseIds.has(predicate.phaseId);
          }
          if (predicate.kind === "landed-damage") {
            const landed = steps.get(predicate.stepId);
            return (
              landed?.kind === "damage" &&
              (predicate.partId === null ||
                landed.parts.some((part) => part.partId === predicate.partId))
            );
          }
          return true;
        })
      ) {
        return false;
      }
    }
  }

  if (
    predicatesOfPhase(program.phases[0]).some(
      (predicate) => !predicateWithinBounds(predicate, 0, { value: 0 })
    )
  ) {
    return false;
  }
  return program.phases.every((phase) =>
    predicatesOfPhase(phase).every((predicate) =>
      predicateWithinBounds(predicate, 0, { value: 0 })
    )
  );
}

/** Exact, canonical, deeply-frozen durable authoring boundary. */
export function conformMechanicsProgram(
  value: unknown
): Readonly<MechanicsProgram> | null {
  const program = conformProgramStructure(value);
  return program && programSemantics(program) ? program : null;
}

/** Standalone predicate conformance for data tooling and tests. */
export function conformMechanicsPredicate(
  value: unknown
): Readonly<MechanicsPredicate> | null {
  const predicate = conformPredicateStructure(value);
  return predicate && predicateWithinBounds(predicate, 0, { value: 0 })
    ? predicate
    : null;
}

function exactEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
