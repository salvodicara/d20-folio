/** Pure review and evaluation of entered D20 Tests. The engine never rolls. */

import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  conformDiceFormula,
  conformDiceObservation,
  conformDiceReplacementPolicy,
  diceReplacementsAreAuthorized,
  evaluateDiceFormula,
  evaluateDiceReplacementPolicy,
  resolveDiceObservation,
} from "@/lib/dice-formula";
import {
  conformIntegerExpression,
  evaluateIntegerExpression,
  type IntegerBindings,
} from "@/lib/integer-expression";
import { conformEntityRef } from "@/lib/mechanics-reference-schema";
import { ABILITY_CODES, type AbilityCode } from "@/types/ability";
import {
  D20_TEST_OBSERVATION_SCHEMA,
  D20_TEST_REQUEST_SCHEMA,
  type D20AttackOutcome,
  type D20DeathSaveOutcome,
  type D20OrdinaryOutcome,
  type D20Outcome,
  type D20RollMode,
  type D20TestObservation,
  type D20TestRequest,
  type D20TestResult,
  type D20TestReview,
  type D20TestSchemaCustomTypes,
  type ResolvedD20EnteredModifier,
  type ResolvedD20EnteredModifierRule,
  type ResolvedD20FaceFloorRule,
  type ResolvedD20Modifier,
  type ResolvedD20ReplacementRule,
  type ResolvedD20SubstitutionRule,
  type ResolvedD20TotalFloorRule,
} from "@/types/d20-test";

export type {
  D20AttackOutcome,
  D20DeathSaveOutcome,
  D20EnteredModifier,
  D20EnteredModifierRule,
  D20FaceFloorRule,
  D20Modifier,
  D20OrdinaryOutcome,
  D20Outcome,
  D20OutcomeBasis,
  D20OutcomeId,
  D20OutcomeStatus,
  D20ReplacementRule,
  D20ResolutionFact,
  D20RollMode,
  D20RollRules,
  D20SubstitutionObservation,
  D20SubstitutionRule,
  D20TableOverride,
  D20TargetNumber,
  D20TestKind,
  D20TestObservation,
  D20TestRequest,
  D20TestResult,
  D20TestReview,
  D20TotalFloorRule,
  ResolvedD20EnteredModifier,
  ResolvedD20EnteredModifierRule,
  ResolvedD20FaceFloorRule,
  ResolvedD20Modifier,
  ResolvedD20ReplacementRule,
  ResolvedD20SubstitutionRule,
  ResolvedD20TotalFloorRule,
} from "@/types/d20-test";

const MAX_ID_LENGTH = 256;
const MAX_FACTS = 64;
const MAX_D20_DICE = 16;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);
const ABILITIES = new Set<AbilityCode>(ABILITY_CODES);

function identifier(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function signedInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && !Object.is(value, -0) ? (value as number) : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 1 ? (value as number) : null;
}

function ability(value: unknown): AbilityCode | null {
  return typeof value === "string" && ABILITIES.has(value as AbilityCode)
    ? (value as AbilityCode)
    : null;
}

const D20_SCHEMA_CONTEXT: ExactSchemaContext<
  D20TestSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    ability,
    "dice-formula": conformDiceFormula,
    "dice-observation": conformDiceObservation,
    "entity-ref": conformEntityRef,
    id: identifier,
    "integer-expression": conformIntegerExpression,
    "positive-integer": positiveInteger,
    "signed-integer": signedInteger,
  },
  refs: {},
};

const conformRequestStructure = exactConformer(
  D20_TEST_REQUEST_SCHEMA,
  D20_SCHEMA_CONTEXT
);
const conformObservationStructure = exactConformer(
  D20_TEST_OBSERVATION_SCHEMA,
  D20_SCHEMA_CONTEXT
);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function boundedUniqueSources(values: readonly { readonly sourceId: string }[]): boolean {
  return values.length <= MAX_FACTS && unique(values.map((value) => value.sourceId));
}

/** Exact authored request boundary plus cross-field invariants. */
export function conformD20TestRequest(value: unknown): Readonly<D20TestRequest> | null {
  const request = conformRequestStructure(value);
  if (!request) return null;
  const rules = request.rollRules;
  if (
    rules.advantageSourceIds.length > MAX_FACTS ||
    rules.disadvantageSourceIds.length > MAX_FACTS ||
    rules.extraD20SourceIds.length > MAX_D20_DICE - 2 ||
    (request.kind === "attack" &&
      request.automaticCriticalSourceIds.length > MAX_FACTS) ||
    !boundedUniqueSources(request.modifiers) ||
    !boundedUniqueSources(request.enteredModifiers) ||
    !boundedUniqueSources(rules.faceFloors) ||
    !boundedUniqueSources(rules.replacements.map(({ rule }) => rule)) ||
    !boundedUniqueSources(rules.substitutions) ||
    !boundedUniqueSources(rules.totalFloors) ||
    !unique(rules.advantageSourceIds) ||
    !unique(rules.disadvantageSourceIds) ||
    !unique(rules.extraD20SourceIds) ||
    !conformDiceReplacementPolicy(rules.replacements.map(({ rule }) => rule)) ||
    (request.kind === "attack" && !unique(request.automaticCriticalSourceIds))
  ) {
    return null;
  }
  return request;
}

/** Exact entered-fact boundary. Requirement-dependent checks happen during evaluation. */
export function conformD20TestObservation(
  value: unknown
): Readonly<D20TestObservation> | null {
  const observation = conformObservationStructure(value);
  return observation && boundedUniqueSources(observation.enteredModifiers)
    ? observation
    : null;
}

function freezeDeep<T>(value: T): Readonly<T> {
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || Object.isFrozen(entry)) return;
    Object.values(entry).forEach(visit);
    Object.freeze(entry);
  };
  visit(value);
  return value;
}

function safeAdd(left: number, right: number): number | null {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : null;
}

function safeSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    const next = safeAdd(total, value);
    if (next === null) return null;
    total = next;
  }
  return total;
}

function rollMode(request: D20TestRequest): D20RollMode {
  if (request.resolution.kind !== "rolled") return "not-rolled";
  const advantage = request.rollRules.advantageSourceIds.length > 0;
  const disadvantage = request.rollRules.disadvantageSourceIds.length > 0;
  if (advantage && disadvantage) return "cancelled";
  if (advantage) return "advantage";
  if (disadvantage) return "disadvantage";
  return "normal";
}

function evaluateModifiers(
  request: D20TestRequest,
  bindings: IntegerBindings
): readonly ResolvedD20Modifier[] | null {
  const result: ResolvedD20Modifier[] = [];
  for (const modifier of request.modifiers) {
    const value = evaluateIntegerExpression(modifier.value, bindings);
    if (value === null) return null;
    result.push({ sourceId: modifier.sourceId, value });
  }
  return result;
}

function evaluateEnteredModifierRules(
  request: D20TestRequest,
  bindings: IntegerBindings
): readonly ResolvedD20EnteredModifierRule[] | null {
  const result: ResolvedD20EnteredModifierRule[] = [];
  for (const rule of request.enteredModifiers) {
    if (rule.kind === "dice-formula") {
      const requirement = evaluateDiceFormula(rule.formula, bindings);
      if (!requirement) return null;
      result.push({
        kind: "dice-formula",
        required: rule.required,
        requirement,
        sourceId: rule.sourceId,
      });
      continue;
    }
    const minimum = evaluateIntegerExpression(rule.minimum, bindings);
    const maximum = evaluateIntegerExpression(rule.maximum, bindings);
    if (minimum === null || maximum === null || minimum > maximum) return null;
    result.push({
      kind: "exact",
      maximum,
      minimum,
      required: rule.required,
      sourceId: rule.sourceId,
    });
  }
  return result;
}

function evaluateTotalFloors(
  request: D20TestRequest,
  bindings: IntegerBindings
): readonly ResolvedD20TotalFloorRule[] | null {
  const result: ResolvedD20TotalFloorRule[] = [];
  for (const rule of request.rollRules.totalFloors) {
    const minimumTotal = evaluateIntegerExpression(rule.minimumTotal, bindings);
    if (minimumTotal === null) return null;
    result.push({ minimumTotal, sourceId: rule.sourceId });
  }
  return result;
}

function evaluateSubstitutions(
  request: D20TestRequest,
  bindings: IntegerBindings
): readonly ResolvedD20SubstitutionRule[] | null {
  const result: ResolvedD20SubstitutionRule[] = [];
  for (const rule of request.rollRules.substitutions) {
    const face = evaluateIntegerExpression(rule.face, bindings);
    if (face === null || face < 1 || face > 20) return null;
    result.push({ face, sourceId: rule.sourceId });
  }
  return result;
}

function evaluateFaceFloors(
  request: D20TestRequest,
  bindings: IntegerBindings
): readonly ResolvedD20FaceFloorRule[] | null {
  const result: ResolvedD20FaceFloorRule[] = [];
  for (const rule of request.rollRules.faceFloors) {
    const minimumFace = evaluateIntegerExpression(rule.minimumFace, bindings);
    if (minimumFace === null || minimumFace < 1 || minimumFace > 20) return null;
    result.push({ minimumFace, sourceId: rule.sourceId });
  }
  return result;
}

function evaluateReplacementRules(
  request: D20TestRequest,
  bindings: IntegerBindings
): readonly ResolvedD20ReplacementRule[] | null {
  const resolved = evaluateDiceReplacementPolicy(
    request.rollRules.replacements.map(({ rule }) => rule),
    bindings
  );
  if (!resolved || resolved.length !== request.rollRules.replacements.length) {
    return null;
  }
  const result: ResolvedD20ReplacementRule[] = [];
  for (let index = 0; index < resolved.length; index += 1) {
    const rule = resolved[index];
    const authored = request.rollRules.replacements[index];
    if (!rule || !authored) return null;
    result.push({ appliesTo: authored.appliesTo, rule });
  }
  return result;
}

function targetFacts(
  request: D20TestRequest,
  bindings: IntegerBindings
): {
  readonly criticalThreshold: number | null;
  readonly recoveryThreshold: number | null;
  readonly targetNumber: D20TestReview["targetNumber"];
} | null {
  if (request.kind === "attack") {
    const armorClass = evaluateIntegerExpression(request.armorClass, bindings);
    const criticalThreshold = evaluateIntegerExpression(
      request.criticalThreshold,
      bindings
    );
    return armorClass !== null &&
      armorClass >= 0 &&
      criticalThreshold !== null &&
      criticalThreshold >= 2 &&
      criticalThreshold <= 20
      ? {
          criticalThreshold,
          recoveryThreshold: null,
          targetNumber: { kind: "armor-class", value: armorClass },
        }
      : null;
  }
  if (request.kind === "death-save") {
    const recoveryThreshold = evaluateIntegerExpression(
      request.recoveryThreshold,
      bindings
    );
    return recoveryThreshold !== null && recoveryThreshold >= 2 && recoveryThreshold <= 20
      ? {
          criticalThreshold: null,
          recoveryThreshold,
          targetNumber: { kind: "difficulty-class", value: 10 },
        }
      : null;
  }
  if (request.difficultyClass === null) {
    return {
      criticalThreshold: null,
      recoveryThreshold: null,
      targetNumber: null,
    };
  }
  const difficultyClass = evaluateIntegerExpression(request.difficultyClass, bindings);
  return difficultyClass !== null && difficultyClass >= 0
    ? {
        criticalThreshold: null,
        recoveryThreshold: null,
        targetNumber: { kind: "difficulty-class", value: difficultyClass },
      }
    : null;
}

/** Resolve authored expressions into one immutable physical-input contract. */
export function reviewD20Test(
  requestValue: unknown,
  bindings: IntegerBindings
): Readonly<D20TestReview> | null {
  const request = conformD20TestRequest(requestValue);
  if (
    !request ||
    evaluateIntegerExpression({ kind: "fixed", value: 0 }, bindings) === null
  ) {
    return null;
  }
  const mode = rollMode(request);
  if (
    request.resolution.kind === "rolled" &&
    request.rollRules.extraD20SourceIds.length > 0 &&
    mode !== "advantage"
  ) {
    return null;
  }
  const modifiers = evaluateModifiers(request, bindings);
  const enteredModifiers = evaluateEnteredModifierRules(request, bindings);
  const faceFloors = evaluateFaceFloors(request, bindings);
  const replacements = evaluateReplacementRules(request, bindings);
  const substitutions = evaluateSubstitutions(request, bindings);
  const totalFloors = evaluateTotalFloors(request, bindings);
  const target = targetFacts(request, bindings);
  if (
    !modifiers ||
    !enteredModifiers ||
    !faceFloors ||
    !replacements ||
    !substitutions ||
    !totalFloors ||
    !target
  ) {
    return null;
  }
  const deterministicModifier = safeSum(modifiers.map((modifier) => modifier.value));
  if (deterministicModifier === null) return null;

  let d20Requirement = null;
  if (mode !== "not-rolled") {
    const ordinaryCount = mode === "advantage" || mode === "disadvantage" ? 2 : 1;
    const count = ordinaryCount + request.rollRules.extraD20SourceIds.length;
    if (count > MAX_D20_DICE) return null;
    d20Requirement = evaluateDiceFormula(
      {
        terms: [
          {
            count: { kind: "fixed", value: count },
            kind: "dice",
            operation: "add",
            sides: 20,
            termId: "d20",
          },
        ],
      },
      {}
    );
    if (!d20Requirement) return null;
  }

  return freezeDeep({
    criticalThreshold: target.criticalThreshold,
    deterministicModifier,
    d20Requirement,
    enteredModifiers,
    faceFloors,
    mode,
    modifiers,
    recoveryThreshold: target.recoveryThreshold,
    replacements,
    request,
    substitutions,
    targetNumber: target.targetNumber,
    totalFloors,
  });
}

type ResolvedDiceTrails = NonNullable<
  ReturnType<typeof resolveDiceObservation>
>["trails"];

interface ReplacementTrailGroup {
  readonly kind: "d20" | "entered-modifier";
  readonly trails: ResolvedDiceTrails;
}

function replacementTrailsAreAuthorized(
  review: D20TestReview,
  groups: readonly ReplacementTrailGroup[]
): boolean {
  return diceReplacementsAreAuthorized(
    groups.map((group) => ({
      rules: review.replacements.flatMap(({ appliesTo, rule }) =>
        group.kind === "d20" || appliesTo === "any-die" ? [rule] : []
      ),
      trails: group.trails,
    }))
  );
}

interface ResolvedEnteredModifiers {
  readonly modifiers: readonly ResolvedD20EnteredModifier[];
  readonly total: number;
  readonly trailGroups: readonly ReplacementTrailGroup[];
}

function resolveEnteredModifiers(
  review: D20TestReview,
  observation: D20TestObservation
): ResolvedEnteredModifiers | null {
  const rules = new Map(review.enteredModifiers.map((rule) => [rule.sourceId, rule]));
  const entered = new Map(
    observation.enteredModifiers.map((modifier) => [modifier.sourceId, modifier])
  );
  if (
    observation.enteredModifiers.some(
      (modifier) => rules.get(modifier.sourceId)?.kind !== modifier.kind
    ) ||
    review.enteredModifiers.some((rule) => rule.required && !entered.has(rule.sourceId))
  ) {
    return null;
  }
  const canonicalOrder = review.enteredModifiers
    .filter((rule) => entered.has(rule.sourceId))
    .map((rule) => rule.sourceId);
  if (
    canonicalOrder.some(
      (sourceId, index) => observation.enteredModifiers[index]?.sourceId !== sourceId
    )
  ) {
    return null;
  }

  const modifiers: ResolvedD20EnteredModifier[] = [];
  const trailGroups: ReplacementTrailGroup[] = [];
  let total = 0;
  for (const rule of review.enteredModifiers) {
    const modifier = entered.get(rule.sourceId);
    if (!modifier) continue;
    if (rule.kind === "exact" && modifier.kind === "exact") {
      if (modifier.value < rule.minimum || modifier.value > rule.maximum) return null;
      const next = safeAdd(total, modifier.value);
      if (next === null) return null;
      total = next;
      modifiers.push({ kind: "exact", sourceId: rule.sourceId, value: modifier.value });
      continue;
    }
    if (rule.kind !== "dice-formula" || modifier.kind !== "dice-formula") {
      return null;
    }
    const resolution = resolveDiceObservation(rule.requirement, modifier.observation);
    if (!resolution) return null;
    const next = safeAdd(total, resolution.total);
    if (next === null) return null;
    total = next;
    modifiers.push({
      kind: "dice-formula",
      resolution,
      sourceId: rule.sourceId,
      value: resolution.total,
    });
    trailGroups.push({ kind: "entered-modifier", trails: resolution.trails });
  }
  return { modifiers, total, trailGroups };
}

function selectedTrail(
  review: D20TestReview,
  trails: NonNullable<ReturnType<typeof resolveDiceObservation>>["trails"]
) {
  if (trails.length === 0) return null;
  let selected = trails[0];
  if (!selected) return null;
  for (const trail of trails.slice(1)) {
    if (
      (review.mode === "advantage" && trail.effectiveFace > selected.effectiveFace) ||
      (review.mode === "disadvantage" && trail.effectiveFace < selected.effectiveFace)
    ) {
      selected = trail;
    }
  }
  return selected;
}

function ineligibleOutcome(review: D20TestReview): D20Outcome {
  const request = review.request;
  if (request.kind === "attack") {
    return {
      appliedAutomaticCriticalSourceIds: [],
      basis: "ineligible",
      critical: false,
      criticalThreshold: review.criticalThreshold as number,
      hit: false,
      kind: "attack",
      naturalCritical: false,
      naturalOne: false,
      outcomeId: "ineligible",
      status: "ineligible",
    };
  }
  if (request.kind === "death-save") {
    return {
      basis: "ineligible",
      failures: 0,
      hitPointsRegained: 0,
      kind: "death-save",
      naturalOne: false,
      outcomeId: "ineligible",
      recoveryBenefit: false,
      recoveryThreshold: review.recoveryThreshold as number,
      status: "ineligible",
      successes: 0,
    };
  }
  return {
    basis: "ineligible",
    kind: request.kind,
    outcomeId: "ineligible",
    status: "ineligible",
  };
}

function automaticOutcome(review: D20TestReview): D20Outcome {
  const request = review.request;
  const fact = request.resolution;
  if (fact.kind === "ineligible") return ineligibleOutcome(review);
  if (fact.kind !== "automatic") {
    throw new TypeError("automaticOutcome requires a non-rolled fact");
  }
  const success = fact.outcome === "success";
  if (request.kind === "attack") {
    const critical = success && request.automaticCriticalSourceIds.length > 0;
    return {
      appliedAutomaticCriticalSourceIds: critical
        ? request.automaticCriticalSourceIds
        : [],
      basis: "automatic",
      critical,
      criticalThreshold: review.criticalThreshold as number,
      hit: success,
      kind: "attack",
      naturalCritical: false,
      naturalOne: false,
      outcomeId: critical ? "critical-hit" : success ? "hit" : "miss",
      status: fact.outcome,
    };
  }
  if (request.kind === "death-save") {
    return {
      basis: "automatic",
      failures: success ? 0 : 1,
      hitPointsRegained: 0,
      kind: "death-save",
      naturalOne: false,
      outcomeId: success ? "death-save-success" : "death-save-failure",
      recoveryBenefit: false,
      recoveryThreshold: review.recoveryThreshold as number,
      status: fact.outcome,
      successes: success ? 1 : 0,
    };
  }
  return {
    basis: "automatic",
    kind: request.kind,
    outcomeId: fact.outcome,
    status: fact.outcome,
  };
}

function rolledAttackOutcome(
  review: D20TestReview,
  naturalFace: number,
  total: number
): D20AttackOutcome {
  const request = review.request;
  if (request.kind !== "attack" || review.targetNumber === null) {
    throw new TypeError("rolledAttackOutcome requires an attack review");
  }
  const criticalThreshold = review.criticalThreshold as number;
  const naturalOne = naturalFace === 1;
  const naturalCritical = naturalFace >= criticalThreshold;
  const hit = !naturalOne && (naturalCritical || total >= review.targetNumber.value);
  const critical =
    hit && (naturalCritical || request.automaticCriticalSourceIds.length > 0);
  return {
    appliedAutomaticCriticalSourceIds:
      critical && !naturalCritical ? request.automaticCriticalSourceIds : [],
    basis: "roll",
    critical,
    criticalThreshold,
    hit,
    kind: "attack",
    naturalCritical,
    naturalOne,
    outcomeId: critical ? "critical-hit" : hit ? "hit" : "miss",
    status: hit ? "success" : "failure",
  };
}

function rolledDeathSaveOutcome(
  review: D20TestReview,
  naturalFace: number,
  total: number
): D20DeathSaveOutcome {
  const recoveryThreshold = review.recoveryThreshold as number;
  const naturalOne = naturalFace === 1;
  const recoveryBenefit = !naturalOne && naturalFace >= recoveryThreshold;
  const success = recoveryBenefit || (!naturalOne && total >= 10);
  return {
    basis: "roll",
    failures: naturalOne ? 2 : success ? 0 : 1,
    hitPointsRegained: recoveryBenefit ? 1 : 0,
    kind: "death-save",
    naturalOne,
    outcomeId: naturalOne
      ? "death-save-natural-one"
      : recoveryBenefit
        ? "death-save-recovery"
        : success
          ? "death-save-success"
          : "death-save-failure",
    recoveryBenefit,
    recoveryThreshold,
    status: success ? "success" : "failure",
    successes: success && !recoveryBenefit ? 1 : 0,
  };
}

function rolledOrdinaryOutcome(review: D20TestReview, total: number): D20OrdinaryOutcome {
  const request = review.request;
  if (request.kind === "attack" || request.kind === "death-save") {
    throw new TypeError("rolledOrdinaryOutcome requires an ordinary D20 Test");
  }
  if (review.targetNumber === null) {
    return {
      basis: "roll",
      kind: request.kind,
      outcomeId: "total-only",
      status: "total-only",
    };
  }
  const success = total >= review.targetNumber.value;
  return {
    basis: "roll",
    kind: request.kind,
    outcomeId: success ? "success" : "failure",
    status: success ? "success" : "failure",
  };
}

function tableOutcome(
  review: D20TestReview,
  computed: D20Outcome,
  observation: D20TestObservation
): D20Outcome | null {
  const override = observation.tableOverride;
  if (override === null) return computed;
  const request = review.request;
  if (request.kind === "attack") {
    if (override.kind !== "attack" || (!override.hit && override.critical)) return null;
    const natural = computed as D20AttackOutcome;
    return {
      appliedAutomaticCriticalSourceIds:
        override.hit && override.critical && !natural.naturalCritical
          ? request.automaticCriticalSourceIds
          : [],
      basis: "table-override",
      critical: override.critical,
      criticalThreshold: review.criticalThreshold as number,
      hit: override.hit,
      kind: "attack",
      naturalCritical: natural.naturalCritical,
      naturalOne: natural.naturalOne,
      outcomeId: override.critical ? "critical-hit" : override.hit ? "hit" : "miss",
      status: override.hit ? "success" : "failure",
    };
  }
  if (request.kind === "death-save") {
    if (override.kind !== "death-save") return null;
    const natural = computed as D20DeathSaveOutcome;
    const success =
      override.result === "one-success" || override.result === "regain-one-hit-point";
    return {
      basis: "table-override",
      failures:
        override.result === "two-failures"
          ? 2
          : override.result === "one-failure"
            ? 1
            : 0,
      hitPointsRegained: override.result === "regain-one-hit-point" ? 1 : 0,
      kind: "death-save",
      naturalOne: natural.naturalOne,
      outcomeId:
        override.result === "two-failures"
          ? "death-save-two-failures"
          : override.result === "regain-one-hit-point"
            ? "death-save-recovery"
            : success
              ? "death-save-success"
              : "death-save-failure",
      recoveryBenefit: override.result === "regain-one-hit-point",
      recoveryThreshold: review.recoveryThreshold as number,
      status: success ? "success" : "failure",
      successes: override.result === "one-success" ? 1 : 0,
    };
  }
  if (override.kind !== "outcome") return null;
  return {
    basis: "table-override",
    kind: request.kind,
    outcomeId: override.outcome,
    status: override.outcome,
  };
}

/** Resolve entered physical facts. Malformed or unauthorized facts return `null`. */
export function evaluateD20Test(
  requestValue: unknown,
  bindings: IntegerBindings,
  observationValue: unknown
): Readonly<D20TestResult> | null {
  const review = reviewD20Test(requestValue, bindings);
  const observation = conformD20TestObservation(observationValue);
  if (!review || !observation) return null;

  let selectedNaturalFace: number | null = null;
  let selectedTrailId: string | null = null;
  let effectiveFace: number | null = null;
  let appliedFaceFloorSourceIds: readonly string[] = [];
  let appliedSubstitution: ResolvedD20SubstitutionRule | null = null;
  let appliedTotalFloorSourceIds: readonly string[] = [];
  let enteredTotal = 0;
  let preFloorTotal: number | null = null;
  let resolvedEnteredModifiers: readonly ResolvedD20EnteredModifier[] = [];
  let total: number | null = null;

  if (review.mode === "not-rolled") {
    if (observation.d20 !== null || observation.enteredModifiers.length > 0) return null;
  } else {
    if (observation.d20 === null || review.d20Requirement === null) return null;
    const trailGroups: ReplacementTrailGroup[] = [];
    const d20Observation = observation.d20;
    if ("kind" in d20Observation) {
      const substitution = review.substitutions.find(
        (rule) => rule.sourceId === d20Observation.sourceId
      );
      if (!substitution) return null;
      appliedSubstitution = substitution;
      selectedNaturalFace = substitution.face;
    } else {
      const resolution = resolveDiceObservation(review.d20Requirement, d20Observation);
      if (!resolution) return null;
      const selected = selectedTrail(review, resolution.trails);
      if (!selected) return null;
      selectedNaturalFace = selected.effectiveFace;
      selectedTrailId = selected.trailId;
      trailGroups.push({ kind: "d20", trails: resolution.trails });
    }
    effectiveFace = selectedNaturalFace;
    const maximumFloor = review.faceFloors.reduce(
      (maximum, rule) => Math.max(maximum, rule.minimumFace),
      1
    );
    if (effectiveFace < maximumFloor) {
      effectiveFace = maximumFloor;
      appliedFaceFloorSourceIds = review.faceFloors
        .filter((rule) => rule.minimumFace === maximumFloor)
        .map((rule) => rule.sourceId);
    }
    const entered = resolveEnteredModifiers(review, observation);
    if (!entered) return null;
    trailGroups.push(...entered.trailGroups);
    if (!replacementTrailsAreAuthorized(review, trailGroups)) return null;
    enteredTotal = entered.total;
    resolvedEnteredModifiers = entered.modifiers;
    const subtotal = safeAdd(effectiveFace, review.deterministicModifier);
    preFloorTotal = subtotal === null ? null : safeAdd(subtotal, enteredTotal);
    if (preFloorTotal === null) return null;
    const maximumTotalFloor = review.totalFloors.reduce(
      (maximum, rule) => Math.max(maximum, rule.minimumTotal),
      preFloorTotal
    );
    total = maximumTotalFloor;
    if (total > preFloorTotal) {
      appliedTotalFloorSourceIds = review.totalFloors
        .filter((rule) => rule.minimumTotal === total)
        .map((rule) => rule.sourceId);
    }
  }

  const margin =
    total === null || review.targetNumber === null
      ? null
      : safeAdd(total, -review.targetNumber.value);
  if (total !== null && review.targetNumber !== null && margin === null) return null;

  let computedOutcome: D20Outcome;
  if (review.request.resolution.kind !== "rolled") {
    computedOutcome = automaticOutcome(review);
  } else {
    if (selectedNaturalFace === null || total === null) return null;
    computedOutcome =
      review.request.kind === "attack"
        ? rolledAttackOutcome(review, selectedNaturalFace, total)
        : review.request.kind === "death-save"
          ? rolledDeathSaveOutcome(review, selectedNaturalFace, total)
          : rolledOrdinaryOutcome(review, total);
  }
  const outcome = tableOutcome(review, computedOutcome, observation);
  if (!outcome) return null;

  return freezeDeep({
    appliedFaceFloorSourceIds,
    appliedSubstitution,
    appliedTotalFloorSourceIds,
    computedOutcome,
    effectiveFace,
    enteredModifierTotal: enteredTotal,
    margin,
    observation,
    outcome,
    preFloorTotal,
    review,
    resolvedEnteredModifiers,
    selectedNaturalFace,
    selectedTrailId,
    total,
  });
}
