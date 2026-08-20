/** Pure specification and resolution of physical dice. No RNG, domain semantics, or I/O. */

import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import {
  conformIntegerExpression,
  evaluateIntegerExpression,
  type IntegerBindings,
} from "@/lib/integer-expression";
import {
  DICE_ACCEPTANCE_POLICY_SCHEMA,
  DICE_FORMULA_SCHEMA,
  DICE_OBSERVATION_SCHEMA,
  DICE_REPLACEMENT_POLICY_SCHEMA,
  DICE_RESOLUTION_SCHEMA,
  DICE_ROLL_REQUIREMENT_SCHEMA,
  STANDARD_DIE_SIDES,
  type DiceFormula,
  type DiceFormulaSchemaCustomTypes,
  type DiceAcceptancePolicy,
  type DiceObservation,
  type DiceResolution,
  type DiceReplacementPolicy,
  type DiceRollRequirement,
  type DieSides,
  type ResolvedDiceReplacementRule,
  type ResolvedDiceTrail,
} from "@/types/dice-formula";

export type {
  DiceAggregateObservation,
  DiceAggregateRequirement,
  DiceAcceptancePolicy,
  DiceAcceptanceRule,
  DiceFormula,
  DiceFormulaTerm,
  DiceIntegerRequirement,
  DiceObservation,
  DiceReplacement,
  DiceReplacementPolicy,
  DiceReplacementRule,
  DiceResolution,
  DiceRollRequirement,
  DiceTrailObservation,
  DiceTrailRequirement,
  DiceTrailStep,
  DiceRequiredReroll,
  DieSides,
  ResolvedDiceAggregate,
  ResolvedDiceInteger,
  ResolvedDiceReplacementRule,
  ResolvedDiceTrail,
} from "@/types/dice-formula";

const MAX_TERMS = 64;
const MAX_DICE_PER_TERM = 256;
const MAX_TOTAL_DICE = 512;
const MAX_TRAIL_STEPS = 64;
const MAX_TERM_ID_LENGTH = 128;
const MAX_ID_LENGTH = 256;
const MAX_DIE_FACE = 100;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);
const DIE_SIDES = new Set<number>(STANDARD_DIE_SIDES);

function identifier(value: unknown, maximumLength: number): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function integer(value: unknown, minimum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum
    ? (value as number)
    : null;
}

function dieSides(value: unknown): DieSides | null {
  return Number.isSafeInteger(value) && DIE_SIDES.has(value as number)
    ? (value as DieSides)
    : null;
}

const DICE_SCHEMA_CONTEXT: ExactSchemaContext<
  DiceFormulaSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "die-sides": dieSides,
    id: (value) => identifier(value, MAX_ID_LENGTH),
    "integer-expression": conformIntegerExpression,
    "nonnegative-integer": (value) => integer(value, 0),
    "positive-integer": (value) => integer(value, 1),
    "signed-integer": (value) => integer(value, Number.MIN_SAFE_INTEGER),
    "term-id": (value) => identifier(value, MAX_TERM_ID_LENGTH),
  },
  refs: {},
};

const conformFormulaStructure = exactConformer(DICE_FORMULA_SCHEMA, DICE_SCHEMA_CONTEXT);
const conformObservationStructure = exactConformer(
  DICE_OBSERVATION_SCHEMA,
  DICE_SCHEMA_CONTEXT
);
const conformRequirementStructure = exactConformer(
  DICE_ROLL_REQUIREMENT_SCHEMA,
  DICE_SCHEMA_CONTEXT
);
const conformResolutionStructure = exactConformer(
  DICE_RESOLUTION_SCHEMA,
  DICE_SCHEMA_CONTEXT
);
const conformReplacementPolicyStructure = exactConformer(
  DICE_REPLACEMENT_POLICY_SCHEMA,
  DICE_SCHEMA_CONTEXT
);
const conformAcceptancePolicyStructure = exactConformer(
  DICE_ACCEPTANCE_POLICY_SCHEMA,
  DICE_SCHEMA_CONTEXT
);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** Exact authored formula boundary with bounded terms and stable, unique term ids. */
export function conformDiceFormula(value: unknown): Readonly<DiceFormula> | null {
  const formula = conformFormulaStructure(value);
  if (
    !formula ||
    formula.terms.length > MAX_TERMS ||
    !unique(formula.terms.map((term) => term.termId)) ||
    !formula.terms.some((term) => term.kind !== "integer")
  ) {
    return null;
  }
  return formula;
}

/** Exact physical-observation boundary; face ranges are checked against a requirement. */
export function conformDiceObservation(value: unknown): Readonly<DiceObservation> | null {
  const observation = conformObservationStructure(value);
  if (
    !observation ||
    observation.trails.length > MAX_TOTAL_DICE ||
    observation.aggregates.length > MAX_TERMS ||
    observation.trails.some((trail) => trail.steps.length > MAX_TRAIL_STEPS)
  ) {
    return null;
  }
  const rollIds = [
    ...observation.trails.map((trail) => trail.trailId),
    ...observation.aggregates.map((aggregate) => aggregate.rollId),
  ];
  return unique(rollIds) ? observation : null;
}

/** Exact authored replacement policy with one canonical rule per source. */
export function conformDiceReplacementPolicy(
  value: unknown
): Readonly<DiceReplacementPolicy> | null {
  const policy = conformReplacementPolicyStructure(value);
  if (
    !policy ||
    policy.length > MAX_TRAIL_STEPS ||
    !unique(policy.map(({ sourceId }) => sourceId)) ||
    policy.some(
      (rule) =>
        rule.kind === "faces" &&
        (rule.faces.length > MAX_DIE_FACE ||
          !unique(rule.faces.map(String)) ||
          rule.faces.some(
            (face, index) =>
              face > MAX_DIE_FACE || (index > 0 && face <= (rule.faces[index - 1] ?? 0))
          ))
    )
  ) {
    return null;
  }
  return policy;
}

/** Exact authored required-reroll policy with canonical, non-overlapping selectors. */
export function conformDiceAcceptancePolicy(
  value: unknown
): Readonly<DiceAcceptancePolicy> | null {
  const policy = conformAcceptancePolicyStructure(value);
  if (
    !policy ||
    policy.length > MAX_TERMS ||
    !unique(policy.map(({ ruleId }) => ruleId))
  ) {
    return null;
  }
  const covered = new Set<string>();
  for (const rule of policy) {
    if (
      !unique(rule.termIds) ||
      !unique(rule.rejectedFaces.map(String)) ||
      rule.termIds.some(
        (termId, index) => index > 0 && termId <= (rule.termIds[index - 1] ?? "")
      ) ||
      rule.rejectedFaces.some(
        (face, index) =>
          face > MAX_DIE_FACE ||
          (index > 0 && face <= (rule.rejectedFaces[index - 1] ?? 0))
      )
    ) {
      return null;
    }
    for (const termId of rule.termIds) {
      for (const face of rule.rejectedFaces) {
        const key = framed([termId, String(face)]);
        if (covered.has(key)) return null;
        covered.add(key);
      }
    }
  }
  return policy;
}

/** Resolve policy expressions once against the same bindings as the roll formula. */
export function evaluateDiceReplacementPolicy(
  value: unknown,
  bindings: IntegerBindings
): readonly ResolvedDiceReplacementRule[] | null {
  const policy = conformDiceReplacementPolicy(value);
  if (!policy) return null;
  const resolved: ResolvedDiceReplacementRule[] = [];
  const maximumTotalUses = MAX_TOTAL_DICE * MAX_TRAIL_STEPS;
  for (const rule of policy) {
    const maximumUses = evaluateIntegerExpression(rule.maximumUses, bindings);
    if (maximumUses === null || maximumUses < 0 || maximumUses > maximumTotalUses) {
      return null;
    }
    resolved.push(
      rule.kind === "any-face"
        ? { kind: "any-face", maximumUses, sourceId: rule.sourceId }
        : {
            faces: rule.faces,
            kind: "faces",
            maximumUses,
            sourceId: rule.sourceId,
          }
    );
  }
  return resolved;
}

export interface DiceReplacementAuthorizationBatch {
  readonly rules: readonly ResolvedDiceReplacementRule[];
  readonly trails: readonly ResolvedDiceTrail[];
}

function resolvedReplacementRuleIsValid(
  rule: Readonly<ResolvedDiceReplacementRule>
): boolean {
  return (
    identifier(rule.sourceId, MAX_ID_LENGTH) !== null &&
    Number.isSafeInteger(rule.maximumUses) &&
    rule.maximumUses >= 0 &&
    rule.maximumUses <= MAX_TOTAL_DICE * MAX_TRAIL_STEPS &&
    (rule.kind === "any-face" ||
      (rule.faces.length > 0 &&
        rule.faces.length <= MAX_DIE_FACE &&
        unique(rule.faces.map(String)) &&
        rule.faces.every(
          (face, index) =>
            Number.isSafeInteger(face) &&
            face >= 1 &&
            face <= MAX_DIE_FACE &&
            (index === 0 || face > (rule.faces[index - 1] ?? 0))
        )))
  );
}

function sameReplacementRule(
  left: ResolvedDiceReplacementRule,
  right: ResolvedDiceReplacementRule
): boolean {
  return (
    left.kind === right.kind &&
    left.maximumUses === right.maximumUses &&
    (left.kind === "any-face" ||
      (right.kind === "faces" &&
        left.faces.length === right.faces.length &&
        left.faces.every((face, index) => face === right.faces[index])))
  );
}

/**
 * Authorize every replacement in one causal roll batch. Batches may expose a
 * subset of rules (for example D20-only rules), while use caps remain global.
 */
export function countAuthorizedDiceReplacementUses(
  batches: readonly DiceReplacementAuthorizationBatch[]
): Readonly<Record<string, number>> | null {
  const rulesBySource = new Map<string, ResolvedDiceReplacementRule>();
  for (const { rules } of batches) {
    if (
      !unique(rules.map(({ sourceId }) => sourceId)) ||
      rules.some((rule) => !resolvedReplacementRuleIsValid(rule))
    ) {
      return null;
    }
    for (const rule of rules) {
      const prior = rulesBySource.get(rule.sourceId);
      if (prior && !sameReplacementRule(prior, rule)) return null;
      rulesBySource.set(rule.sourceId, rule);
    }
  }

  const uses = new Map<string, number>();
  for (const { rules, trails } of batches) {
    const allowed = new Map(rules.map((rule) => [rule.sourceId, rule]));
    for (const trail of trails) {
      let currentFace = trail.initialFace;
      for (const step of trail.steps) {
        if (step.kind === "required-reroll") {
          currentFace = step.face;
          continue;
        }
        const rule = allowed.get(step.sourceId);
        if (!rule || (rule.kind === "faces" && !rule.faces.includes(currentFace))) {
          return null;
        }
        const nextUses = (uses.get(rule.sourceId) ?? 0) + 1;
        if (nextUses > rule.maximumUses) return null;
        uses.set(rule.sourceId, nextUses);
        currentFace = step.face;
      }
    }
  }
  return Object.freeze(
    Object.fromEntries(
      [...uses.entries()].sort(([left], [right]) => left.localeCompare(right))
    )
  );
}

/** Validate every voluntary replacement in one causal roll batch. */
export function diceReplacementsAreAuthorized(
  batches: readonly DiceReplacementAuthorizationBatch[]
): boolean {
  return countAuthorizedDiceReplacementUses(batches) !== null;
}

function framed(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

function trailId(termId: string, index: number): string {
  return framed(["trail", termId, String(index)]);
}

function aggregateId(termId: string): string {
  return framed(["aggregate", termId]);
}

function safeAdd(left: number, right: number): number | null {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : null;
}

function signed(value: number, operation: "add" | "subtract"): number | null {
  const result = operation === "add" ? value : -value;
  return Number.isSafeInteger(result) ? (Object.is(result, -0) ? 0 : result) : null;
}

function addBounds(
  minimum: number,
  maximum: number,
  termMinimum: number,
  termMaximum: number
): readonly [number, number] | null {
  const nextMinimum = safeAdd(minimum, termMinimum);
  const nextMaximum = safeAdd(maximum, termMaximum);
  return nextMinimum === null || nextMaximum === null ? null : [nextMinimum, nextMaximum];
}

function termBounds(
  minimum: number,
  maximum: number,
  operation: "add" | "subtract"
): readonly [number, number] {
  return operation === "add" ? [minimum, maximum] : [-maximum, -minimum];
}

function requirementSemantics(
  requirement: DiceRollRequirement
): Readonly<DiceRollRequirement> | null {
  const acceptanceRules = conformDiceAcceptancePolicy(requirement.acceptanceRules);
  if (
    !acceptanceRules ||
    requirement.trails.length > MAX_TOTAL_DICE ||
    requirement.aggregates.length > MAX_TERMS ||
    requirement.deterministicTerms.length > MAX_TERMS
  ) {
    return null;
  }

  const rollIds = [
    ...requirement.trails.map((trail) => trail.trailId),
    ...requirement.aggregates.map((aggregate) => aggregate.rollId),
  ];
  if (!unique(rollIds)) return null;

  const categories = new Map<string, "trail" | "aggregate" | "integer">();
  const trailCounts = new Map<string, number>();
  const trailFacts = new Map<
    string,
    { readonly operation: "add" | "subtract"; readonly sides: DieSides }
  >();
  let physicalDice = 0;
  let minimum = 0;
  let maximum = 0;

  for (const trail of requirement.trails) {
    if (trail.maximumFace !== trail.sides) return null;
    const category = categories.get(trail.termId);
    if (category !== undefined && category !== "trail") return null;
    categories.set(trail.termId, "trail");
    const facts = trailFacts.get(trail.termId);
    if (
      facts !== undefined &&
      (facts.operation !== trail.operation || facts.sides !== trail.sides)
    ) {
      return null;
    }
    trailFacts.set(trail.termId, {
      operation: trail.operation,
      sides: trail.sides,
    });
    const index = trailCounts.get(trail.termId) ?? 0;
    if (trail.trailId !== trailId(trail.termId, index)) return null;
    trailCounts.set(trail.termId, index + 1);
    physicalDice += 1;
    const bounds = termBounds(1, trail.sides, trail.operation);
    const totals = addBounds(minimum, maximum, bounds[0], bounds[1]);
    if (!totals) return null;
    [minimum, maximum] = totals;
  }

  for (const aggregate of requirement.aggregates) {
    if (
      aggregate.count < 1 ||
      aggregate.count > MAX_DICE_PER_TERM ||
      aggregate.rollId !== aggregateId(aggregate.termId) ||
      aggregate.minimumTotal !== aggregate.count ||
      aggregate.maximumTotal !== aggregate.count * aggregate.sides ||
      categories.has(aggregate.termId)
    ) {
      return null;
    }
    categories.set(aggregate.termId, "aggregate");
    physicalDice += aggregate.count;
    const bounds = termBounds(
      aggregate.minimumTotal,
      aggregate.maximumTotal,
      aggregate.operation
    );
    const totals = addBounds(minimum, maximum, bounds[0], bounds[1]);
    if (!totals) return null;
    [minimum, maximum] = totals;
  }

  for (const term of requirement.deterministicTerms) {
    if (categories.has(term.termId)) return null;
    categories.set(term.termId, "integer");
    const contribution = signed(term.value, term.operation);
    if (contribution === null) return null;
    const totals = addBounds(minimum, maximum, contribution, contribution);
    if (!totals) return null;
    [minimum, maximum] = totals;
  }

  const rejectedByTerm = new Map<string, Set<number>>();
  for (const rule of acceptanceRules) {
    for (const termId of rule.termIds) {
      const facts = trailFacts.get(termId);
      if (!facts || rule.rejectedFaces.some((face) => face > facts.sides)) {
        return null;
      }
      const rejected = rejectedByTerm.get(termId) ?? new Set<number>();
      rule.rejectedFaces.forEach((face) => rejected.add(face));
      if (rejected.size >= facts.sides) return null;
      rejectedByTerm.set(termId, rejected);
    }
  }

  return physicalDice <= MAX_TOTAL_DICE &&
    minimum === requirement.minimumTotal &&
    maximum === requirement.maximumTotal
    ? requirement
    : null;
}

function resolutionSemantics(
  resolution: DiceResolution
): Readonly<DiceResolution> | null {
  if (
    resolution.trails.length > MAX_TOTAL_DICE ||
    resolution.aggregates.length > MAX_TERMS ||
    resolution.deterministicTerms.length > MAX_TERMS ||
    resolution.trails.some((trail) => trail.steps.length > MAX_TRAIL_STEPS)
  ) {
    return null;
  }

  const rollIds = [
    ...resolution.trails.map((trail) => trail.trailId),
    ...resolution.aggregates.map((aggregate) => aggregate.rollId),
  ];
  if (!unique(rollIds)) return null;

  const categories = new Map<string, "trail" | "aggregate" | "integer">();
  const trailCounts = new Map<string, number>();
  const trailFacts = new Map<
    string,
    { readonly operation: "add" | "subtract"; readonly sides: DieSides }
  >();
  let physicalDice = 0;
  let total = 0;

  for (const trail of resolution.trails) {
    const category = categories.get(trail.termId);
    if (category !== undefined && category !== "trail") return null;
    categories.set(trail.termId, "trail");
    const facts = trailFacts.get(trail.termId);
    if (
      facts !== undefined &&
      (facts.operation !== trail.operation || facts.sides !== trail.sides)
    ) {
      return null;
    }
    trailFacts.set(trail.termId, {
      operation: trail.operation,
      sides: trail.sides,
    });
    const index = trailCounts.get(trail.termId) ?? 0;
    if (
      trail.trailId !== trailId(trail.termId, index) ||
      trail.initialFace > trail.sides ||
      trail.steps.some((step) => step.face > trail.sides)
    ) {
      return null;
    }
    trailCounts.set(trail.termId, index + 1);
    const effective = trail.steps.at(-1)?.face ?? trail.initialFace;
    const contribution = signed(effective, trail.operation);
    if (trail.effectiveFace !== effective || trail.contribution !== contribution) {
      return null;
    }
    const next = safeAdd(total, contribution);
    if (next === null) return null;
    total = next;
    physicalDice += 1;
  }

  for (const aggregate of resolution.aggregates) {
    if (
      aggregate.count < 1 ||
      aggregate.count > MAX_DICE_PER_TERM ||
      aggregate.rollId !== aggregateId(aggregate.termId) ||
      aggregate.total < aggregate.count ||
      aggregate.total > aggregate.count * aggregate.sides ||
      categories.has(aggregate.termId)
    ) {
      return null;
    }
    categories.set(aggregate.termId, "aggregate");
    const contribution = signed(aggregate.total, aggregate.operation);
    if (aggregate.contribution !== contribution) return null;
    const next = safeAdd(total, contribution);
    if (next === null) return null;
    total = next;
    physicalDice += aggregate.count;
  }

  for (const term of resolution.deterministicTerms) {
    if (categories.has(term.termId)) return null;
    categories.set(term.termId, "integer");
    const contribution = signed(term.value, term.operation);
    if (term.contribution !== contribution) return null;
    const next = safeAdd(total, contribution);
    if (next === null) return null;
    total = next;
  }

  return physicalDice <= MAX_TOTAL_DICE && resolution.total === total ? resolution : null;
}

/** Exact boundary for a concrete evaluated requirement. */
export function conformDiceRollRequirement(
  value: unknown
): Readonly<DiceRollRequirement> | null {
  const requirement = conformRequirementStructure(value);
  return requirement ? requirementSemantics(requirement) : null;
}

/**
 * Exact persisted resolution boundary. Every contribution, effective face, stable
 * roll id, range and total is re-derived so stored observations cannot forge facts.
 */
export function conformDiceResolution(value: unknown): Readonly<DiceResolution> | null {
  const resolution = conformResolutionStructure(value);
  return resolution ? resolutionSemantics(resolution) : null;
}

/** Evaluate authored counts and modifiers into stable physical-roll requirements. */
export function evaluateDiceFormula(
  value: unknown,
  bindings: IntegerBindings,
  acceptancePolicyValue: unknown = []
): Readonly<DiceRollRequirement> | null {
  const formula = conformDiceFormula(value);
  const acceptancePolicy = conformDiceAcceptancePolicy(acceptancePolicyValue);
  if (!formula || !acceptancePolicy) return null;

  const trails: DiceRollRequirement["trails"][number][] = [];
  const aggregates: DiceRollRequirement["aggregates"][number][] = [];
  const deterministicTerms: DiceRollRequirement["deterministicTerms"][number][] = [];
  let physicalDice = 0;
  let minimumTotal = 0;
  let maximumTotal = 0;

  for (const term of formula.terms) {
    if (term.kind === "integer") {
      const value = evaluateIntegerExpression(term.value, bindings);
      if (value === null) return null;
      const contribution = signed(value, term.operation);
      if (contribution === null) return null;
      const totals = addBounds(minimumTotal, maximumTotal, contribution, contribution);
      if (!totals) return null;
      [minimumTotal, maximumTotal] = totals;
      deterministicTerms.push({
        operation: term.operation,
        termId: term.termId,
        value,
      });
      continue;
    }

    const count = evaluateIntegerExpression(term.count, bindings);
    if (count === null || count < 0 || count > MAX_DICE_PER_TERM) return null;
    physicalDice += count;
    if (physicalDice > MAX_TOTAL_DICE) return null;
    if (count === 0) continue;

    const maximum = count * term.sides;
    const bounds = termBounds(count, maximum, term.operation);
    const totals = addBounds(minimumTotal, maximumTotal, bounds[0], bounds[1]);
    if (!totals) return null;
    [minimumTotal, maximumTotal] = totals;

    if (term.kind === "aggregate-dice") {
      aggregates.push({
        count,
        maximumTotal: maximum,
        minimumTotal: count,
        operation: term.operation,
        rollId: aggregateId(term.termId),
        sides: term.sides,
        termId: term.termId,
      });
      continue;
    }
    for (let index = 0; index < count; index += 1) {
      trails.push({
        maximumFace: term.sides,
        minimumFace: 1,
        operation: term.operation,
        sides: term.sides,
        termId: term.termId,
        trailId: trailId(term.termId, index),
      });
    }
  }

  const activeTerms = new Set(trails.map(({ termId }) => termId));
  const acceptanceRules = acceptancePolicy.flatMap((rule) => {
    const termIds = rule.termIds.filter((termId) => activeTerms.has(termId));
    return termIds.length > 0 ? [{ ...rule, termIds }] : [];
  });
  return conformDiceRollRequirement({
    acceptanceRules,
    aggregates,
    deterministicTerms,
    maximumTotal,
    minimumTotal,
    trails,
  });
}

function requiredRerollRule(
  requirement: Readonly<DiceRollRequirement>,
  termId: string,
  face: number
) {
  return (
    requirement.acceptanceRules.find(
      (rule) => rule.termIds.includes(termId) && rule.rejectedFaces.includes(face)
    ) ?? null
  );
}

function acceptedTrailFace(
  requirement: Readonly<DiceRollRequirement>,
  termId: string,
  initialFace: number,
  steps: ReadonlyArray<import("@/types/dice-formula").DiceTrailStep>
): number | null {
  let currentFace = initialFace;
  for (const step of steps) {
    const required = requiredRerollRule(requirement, termId, currentFace);
    if (
      (required !== null &&
        (step.kind !== "required-reroll" || step.ruleId !== required.ruleId)) ||
      (required === null && step.kind === "required-reroll")
    ) {
      return null;
    }
    currentFace = step.face;
  }
  return requiredRerollRule(requirement, termId, currentFace) === null
    ? currentFace
    : null;
}

/** Resolve exact physical observations into a safe total and complete provenance. */
export function resolveDiceObservation(
  requirementValue: unknown,
  observationValue: unknown
): Readonly<DiceResolution> | null {
  const requirement = conformDiceRollRequirement(requirementValue);
  const observation = conformDiceObservation(observationValue);
  if (
    !requirement ||
    !observation ||
    requirement.trails.length !== observation.trails.length ||
    requirement.aggregates.length !== observation.aggregates.length
  ) {
    return null;
  }

  const trails: DiceResolution["trails"][number][] = [];
  const aggregates: DiceResolution["aggregates"][number][] = [];
  const deterministicTerms: DiceResolution["deterministicTerms"][number][] = [];
  let total = 0;

  for (let index = 0; index < requirement.trails.length; index += 1) {
    const expected = requirement.trails[index];
    const observed = observation.trails[index];
    if (
      expected === undefined ||
      observed === undefined ||
      observed.trailId !== expected.trailId ||
      observed.initialFace < expected.minimumFace ||
      observed.initialFace > expected.maximumFace ||
      observed.steps.some(
        (step) => step.face < expected.minimumFace || step.face > expected.maximumFace
      )
    ) {
      return null;
    }
    const effectiveFace = acceptedTrailFace(
      requirement,
      expected.termId,
      observed.initialFace,
      observed.steps
    );
    if (effectiveFace === null) return null;
    const contribution = signed(effectiveFace, expected.operation);
    if (contribution === null) return null;
    const next = safeAdd(total, contribution);
    if (next === null) return null;
    total = next;
    trails.push({
      contribution,
      effectiveFace,
      initialFace: observed.initialFace,
      operation: expected.operation,
      steps: observed.steps,
      sides: expected.sides,
      termId: expected.termId,
      trailId: expected.trailId,
    });
  }

  for (let index = 0; index < requirement.aggregates.length; index += 1) {
    const expected = requirement.aggregates[index];
    const observed = observation.aggregates[index];
    if (
      expected === undefined ||
      observed === undefined ||
      observed.rollId !== expected.rollId ||
      observed.total < expected.minimumTotal ||
      observed.total > expected.maximumTotal
    ) {
      return null;
    }
    const contribution = signed(observed.total, expected.operation);
    if (contribution === null) return null;
    const next = safeAdd(total, contribution);
    if (next === null) return null;
    total = next;
    aggregates.push({
      contribution,
      count: expected.count,
      operation: expected.operation,
      rollId: expected.rollId,
      sides: expected.sides,
      termId: expected.termId,
      total: observed.total,
    });
  }

  for (const term of requirement.deterministicTerms) {
    const contribution = signed(term.value, term.operation);
    if (contribution === null) return null;
    const next = safeAdd(total, contribution);
    if (next === null) return null;
    total = next;
    deterministicTerms.push({ ...term, contribution });
  }

  if (total < requirement.minimumTotal || total > requirement.maximumTotal) {
    return null;
  }
  return conformDiceResolution({
    aggregates,
    deterministicTerms,
    total,
    trails,
  });
}
