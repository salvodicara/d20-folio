import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { conformDamageDefenseProfile, conformDamageDefenseRule } from "@/lib/damage";
import {
  END_RULE_SCHEMA,
  MECHANIC_OCCURRENCE_SCHEMA_REFS,
  NEW_MECHANIC_OCCURRENCE_SCHEMA,
  OCCURRENCE_STATE_SCHEMA,
  PROGRAM_PHASE_COMPLETION_SCHEMA,
  PROGRAM_STEP_OCCURRENCE_ORIGIN_SCHEMA,
  type MechanicOccurrenceSchemaCustomTypes,
  type MechanicOccurrenceSchemaRefTypes,
} from "@/lib/mechanic-occurrence-schema";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import {
  conformMaterialEntityId,
  conformMechanicId,
} from "@/lib/mechanics-reference-schema";
import type { DamageDefenseProfile, DamageDefenseRule } from "@/types/damage";
import type {
  EffectOccurrence,
  EndRule,
  MechanicOccurrence,
  NewMechanicOccurrence,
  OccurrenceState,
  OccurrenceStateParseResult,
  ProgramOccurrence,
  ProgramPhaseCompletion,
  ProgramStepOccurrenceOrigin,
} from "@/types/mechanic-occurrence";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { ClockRef, EntityRef } from "@/types/mechanics-reference";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type OccurrenceOfKind<Kind extends MechanicOccurrence["kind"]> = Extract<
  MechanicOccurrence,
  { kind: Kind }
>;
type ProgramStep = NonNullable<
  ProgramOccurrence["authority"]["snapshot"]["program"]
>["phases"][number]["steps"][number];

export interface OccurrenceEntry<
  Occurrence extends MechanicOccurrence = MechanicOccurrence,
> {
  id: string;
  occurrence: Readonly<Occurrence>;
}

export interface ProjectedGrantSource {
  occurrenceId: string;
  groupId: string;
  programOccurrenceId: string;
  authority: Readonly<MechanicsProgramAuthorityReceipt>;
  target: Readonly<EntityRef>;
}

export interface ProgramExecution {
  program: OccurrenceEntry<ProgramOccurrence>;
  children: ReadonlyArray<OccurrenceEntry<EffectOccurrence>>;
}

export interface ResolvedOccurrenceAuthority {
  rootId: string;
  root: Readonly<ProgramOccurrence>;
  authority: Readonly<MechanicsProgramAuthorityReceipt>;
}

function stableKey(value: unknown): value is string {
  return conformMechanicId(value) !== null;
}

function conformId(value: unknown): string | null {
  return stableKey(value) ? value : null;
}

function conformSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0)
    ? value
    : null;
}

function conformIntegerAtLeast(value: unknown, minimum: number): number | null {
  const parsed = conformSafeInteger(value);
  return parsed !== null && parsed >= minimum ? parsed : null;
}

const OCCURRENCE_SCHEMA_CONTEXT: ExactSchemaContext<
  MechanicOccurrenceSchemaCustomTypes,
  MechanicOccurrenceSchemaRefTypes
> = {
  customs: {
    "flat-adjustment": conformSafeInteger,
    id: conformId,
    "material-entity-id": conformMaterialEntityId,
    "mechanics-program-authority-receipt": conformMechanicsProgramAuthorityReceipt,
    "nonnegative-integer": (value) => conformIntegerAtLeast(value, 0),
    "positive-integer": (value) => conformIntegerAtLeast(value, 1),
  },
  refs: MECHANIC_OCCURRENCE_SCHEMA_REFS,
};
const conformNewOccurrenceStructure = exactConformer(
  NEW_MECHANIC_OCCURRENCE_SCHEMA,
  OCCURRENCE_SCHEMA_CONTEXT
);
const conformEndRuleStructure = exactConformer(
  END_RULE_SCHEMA,
  OCCURRENCE_SCHEMA_CONTEXT
);
const conformProgramStepOccurrenceOriginStructure = exactConformer(
  PROGRAM_STEP_OCCURRENCE_ORIGIN_SCHEMA,
  OCCURRENCE_SCHEMA_CONTEXT
);
const conformProgramPhaseCompletionStructure = exactConformer(
  PROGRAM_PHASE_COMPLETION_SCHEMA,
  OCCURRENCE_SCHEMA_CONTEXT
);
const conformOccurrenceStateStructure = exactConformer(
  OCCURRENCE_STATE_SCHEMA,
  OCCURRENCE_SCHEMA_CONTEXT
);

function canonicalClone(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonicalClone);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalClone(value[key] as JsonValue)])
    );
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || Object.isFrozen(entry)) return;
    Object.values(entry).forEach(visit);
    Object.freeze(entry);
  };
  visit(value);
  return value;
}

function canonicalKey(value: JsonValue): string {
  return JSON.stringify(canonicalClone(value));
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalKey(left as JsonValue) === canonicalKey(right as JsonValue);
}

function uniqueSemanticEntries(values: ReadonlyArray<JsonValue>): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = canonicalKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function compareCanonical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isEffectOccurrence(
  occurrence: Readonly<MechanicOccurrence>
): occurrence is Readonly<EffectOccurrence> {
  return occurrence.kind !== "program";
}

function dependencyIds(occurrence: MechanicOccurrence): string[] {
  const result = isEffectOccurrence(occurrence) ? [occurrence.parentId] : [];
  for (const rule of occurrence.endRules) {
    if (rule.kind === "occurrence-end" || rule.kind === "program-phase-end") {
      result.push(rule.occurrenceId);
    }
  }
  return [...new Set(result)];
}

function acyclic(occurrences: Readonly<Record<string, MechanicOccurrence>>): boolean {
  const complete = new Set<string>();
  const active = new Set<string>();
  const visit = (id: string): boolean => {
    if (complete.has(id)) return true;
    if (active.has(id)) return false;
    active.add(id);
    const occurrence = occurrences[id];
    if (!occurrence) return false;
    for (const dependency of dependencyIds(occurrence)) {
      if (!visit(dependency)) return false;
    }
    active.delete(id);
    complete.add(id);
    return true;
  };
  return Object.keys(occurrences).every(visit);
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return sameJson(left, right);
}

function hasExactKeys(record: Readonly<Record<string, unknown>>, ids: readonly string[]) {
  const keys = Object.keys(record);
  return keys.length === ids.length && ids.every((id) => Object.hasOwn(record, id));
}

function validProgramState(
  occurrence: Readonly<Pick<ProgramOccurrence, "authority" | "phaseState" | "registers">>,
  initial: boolean
): boolean {
  const program = occurrence.authority.snapshot.program;
  if (!program) return false;
  const phaseIds = program.phases.map((phase) => phase.phaseId);
  const registerIds = program.registers.map((register) => register.registerId);
  return (
    hasExactKeys(occurrence.phaseState, phaseIds) &&
    hasExactKeys(occurrence.registers, registerIds) &&
    (!initial ||
      (program.phases.every(({ phaseId }) => {
        const state = occurrence.phaseState[phaseId];
        return state?.execution === 0 && state.lastTriggerEventId === null;
      }) &&
        program.registers.every((register) =>
          Object.is(occurrence.registers[register.registerId], register.initial)
        )))
  );
}

function effectMatchesProgramStep(
  occurrence: Readonly<EffectOccurrence>,
  step: Readonly<ProgramStep>
): boolean {
  switch (occurrence.kind) {
    case "condition":
      return step.kind === "condition" && step.operation === "apply";
    case "standing":
      return (
        (step.kind === "standing" && step.operation === "start") ||
        step.kind === "temporary-hit-points"
      );
    case "concentration":
      return step.kind === "concentration" && step.operation === "start";
    case "polymorph-form":
      return step.kind === "polymorph" && step.operation === "start";
    case "material-lifecycle":
      return step.kind === "entity-create" || step.kind === "inventory-create";
  }
}

function validProgramStepOrigin(
  occurrence: Readonly<EffectOccurrence>,
  parent: Readonly<ProgramOccurrence>
): boolean {
  const { origin } = occurrence;
  const phase = parent.authority.snapshot.program?.phases.find(
    ({ phaseId }) => phaseId === origin.phaseId
  );
  const phaseState = parent.phaseState[origin.phaseId];
  const step = phase?.steps.find(({ stepId }) => stepId === origin.stepId);
  return (
    occurrence.parentId === origin.root.occurrence.occurrenceId &&
    parent.ordinal === origin.root.ordinal &&
    phaseState !== undefined &&
    origin.execution - 1 <= phaseState.execution &&
    step !== undefined &&
    effectMatchesProgramStep(occurrence, step)
  );
}

function programStepOriginKey(origin: Readonly<ProgramStepOccurrenceOrigin>): string {
  return canonicalKey([
    origin.root.ordinal,
    origin.phaseId,
    origin.execution,
    origin.stepId,
    origin.slot,
  ]);
}

function validStateInvariants(state: OccurrenceState): boolean {
  const ids = Object.keys(state.occurrences);
  const ordinals = new Set<number>();
  const programStepOrigins = new Set<string>();
  const concentrations = new Set<string>();
  const damageRulesBySource = new Map<string, DamageDefenseRule>();
  const polymorphForms = new Set<string>();

  for (const id of ids) {
    if (!stableKey(id)) return false;
    const occurrence = state.occurrences[id];
    if (
      !occurrence ||
      ordinals.has(occurrence.ordinal) ||
      !uniqueSemanticEntries(occurrence.endRules) ||
      (occurrence.ending !== null && !uniqueSemanticEntries(occurrence.ending.causes)) ||
      (occurrence.kind === "program" && !validProgramState(occurrence, false))
    ) {
      return false;
    }
    if (occurrence.ordinal >= state.nextOccurrenceOrdinal) return false;
    ordinals.add(occurrence.ordinal);

    if (occurrence.ending === null && occurrence.kind === "concentration") {
      const targetKey = canonicalKey(occurrence.target);
      if (concentrations.has(targetKey)) return false;
      concentrations.add(targetKey);
    }
    if (occurrence.ending === null && occurrence.kind === "polymorph-form") {
      const targetKey = canonicalKey(occurrence.target);
      if (polymorphForms.has(targetKey)) return false;
      polymorphForms.add(targetKey);
    }
    if (
      occurrence.ending === null &&
      occurrence.kind === "standing" &&
      occurrence.fact.kind === "damage-defense"
    ) {
      const rule = conformDamageDefenseRule(occurrence.fact.rule);
      if (!rule) return false;
      const prior = damageRulesBySource.get(rule.sourceId);
      if (prior && !sameJson(prior, rule)) return false;
      damageRulesBySource.set(rule.sourceId, rule);
    }

    if (isEffectOccurrence(occurrence)) {
      const parent = state.occurrences[occurrence.parentId];
      const originKey = programStepOriginKey(occurrence.origin);
      if (
        !parent ||
        parent.kind !== "program" ||
        parent.ordinal >= occurrence.ordinal ||
        !validProgramStepOrigin(occurrence, parent) ||
        programStepOrigins.has(originKey)
      ) {
        return false;
      }
      programStepOrigins.add(originKey);
    }

    for (const rule of occurrence.endRules) {
      if (rule.kind === "occurrence-end") {
        const dependency = state.occurrences[rule.occurrenceId];
        if (!dependency || dependency.ordinal >= occurrence.ordinal) return false;
      } else if (rule.kind === "program-phase-end") {
        const program = state.occurrences[rule.occurrenceId];
        if (
          !program ||
          program.kind !== "program" ||
          program.ordinal >= occurrence.ordinal ||
          !Object.hasOwn(program.phaseState, rule.phaseId) ||
          !isEffectOccurrence(occurrence) ||
          occurrence.parentId !== rule.occurrenceId
        ) {
          return false;
        }
      }
    }
  }
  return acyclic(state.occurrences);
}

function canonicalOccurrence(occurrence: MechanicOccurrence): MechanicOccurrence {
  const clone = canonicalClone(occurrence) as unknown as MechanicOccurrence;
  const endRules = [...clone.endRules].sort((left, right) =>
    compareCanonical(canonicalKey(left), canonicalKey(right))
  );
  const ending =
    clone.ending === null
      ? null
      : {
          causes: [...clone.ending.causes].sort((left, right) =>
            compareCanonical(canonicalKey(left), canonicalKey(right))
          ),
        };
  return { ...clone, ending, endRules };
}

function canonicalState(state: OccurrenceState): Readonly<OccurrenceState> {
  const entries = Object.entries(state.occurrences)
    .map(([id, occurrence]) => [id, canonicalOccurrence(occurrence)] as const)
    .sort(
      ([leftId, left], [rightId, right]) =>
        left.ordinal - right.ordinal || compareCanonical(leftId, rightId)
    );
  return deepFreeze({
    nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
    occurrences: Object.fromEntries(entries),
  });
}

/** Strictly conform one not-yet-allocated active occurrence. */
export function conformNewMechanicOccurrence(
  value: unknown
): Readonly<NewMechanicOccurrence> | null {
  try {
    const occurrence = conformNewOccurrenceStructure(
      value
    ) as NewMechanicOccurrence | null;
    if (
      !occurrence ||
      !uniqueSemanticEntries(occurrence.endRules) ||
      (occurrence.kind === "program" && !validProgramState(occurrence, true))
    ) {
      return null;
    }
    return occurrence;
  } catch {
    return null;
  }
}

/** Exact hostile shape boundary; root/program semantics belong to state validation. */
export function conformProgramStepOccurrenceOrigin(
  value: unknown
): Readonly<ProgramStepOccurrenceOrigin> | null {
  try {
    return conformProgramStepOccurrenceOriginStructure(value);
  } catch {
    return null;
  }
}

/** Exact hostile shape boundary for one kernel-issued phase-completion proof. */
export function conformProgramPhaseCompletion(
  value: unknown
): Readonly<ProgramPhaseCompletion> | null {
  try {
    return conformProgramPhaseCompletionStructure(value);
  } catch {
    return null;
  }
}

/** Exact hostile-input boundary for one resolved occurrence end rule. */
export function conformEndRule(value: unknown): Readonly<EndRule> | null {
  try {
    return conformEndRuleStructure(value);
  } catch {
    return null;
  }
}

/** Fail-closed JSON boundary for the active-only occurrence state. */
export function parseOccurrenceState(value: unknown): OccurrenceStateParseResult {
  try {
    const candidate = conformOccurrenceStateStructure(value) as OccurrenceState | null;
    if (!candidate || !validStateInvariants(candidate)) return { ok: false };
    return { ok: true, value: canonicalState(candidate) };
  } catch {
    return { ok: false };
  }
}

/** Empty state. Ordinal zero is reserved; the first allocation is one. */
export function createOccurrenceState(): Readonly<OccurrenceState> {
  return deepFreeze({ nextOccurrenceOrdinal: 1, occurrences: {} });
}

function parsedOrThrow(state: Readonly<OccurrenceState>): Readonly<OccurrenceState> {
  const parsed = parseOccurrenceState(state);
  if (!parsed.ok) throw new TypeError("Invalid occurrence state");
  return parsed.value;
}

/** Allocate an occurrence. Callers never choose or reuse its ordinal. */
export function addOccurrence(
  state: Readonly<OccurrenceState>,
  id: string,
  occurrence: NewMechanicOccurrence
): Readonly<OccurrenceState> {
  const current = parsedOrThrow(state);
  const conformed = conformNewMechanicOccurrence(occurrence);
  if (!stableKey(id) || Object.hasOwn(current.occurrences, id) || !conformed) {
    throw new TypeError("Invalid occurrence insertion");
  }
  const candidate = {
    nextOccurrenceOrdinal: current.nextOccurrenceOrdinal + 1,
    occurrences: {
      ...current.occurrences,
      [id]: {
        ...conformed,
        ending: null,
        ordinal: current.nextOccurrenceOrdinal,
      },
    },
  };
  const parsed = parseOccurrenceState(candidate);
  if (!parsed.ok) throw new TypeError("Invalid occurrence insertion");
  return parsed.value;
}

/**
 * Allocate a program root whose first phase transition is already committed.
 * Program creation is one atomic kernel operation, so it cannot pass through
 * the zero-execution `NewMechanicOccurrence` boundary used by authored effects.
 */
export function addTransitionedProgramOccurrence(
  state: Readonly<OccurrenceState>,
  id: string,
  occurrence: Omit<ProgramOccurrence, "ending" | "ordinal">
): Readonly<OccurrenceState> {
  const current = parsedOrThrow(state);
  if (!stableKey(id) || Object.hasOwn(current.occurrences, id)) {
    throw new TypeError("Invalid program occurrence insertion");
  }
  const candidate = {
    nextOccurrenceOrdinal: current.nextOccurrenceOrdinal + 1,
    occurrences: {
      ...current.occurrences,
      [id]: {
        ...structuredClone(occurrence),
        ending: null,
        ordinal: current.nextOccurrenceOrdinal,
      },
    },
  };
  const parsed = parseOccurrenceState(candidate);
  if (!parsed.ok) throw new TypeError("Invalid program occurrence insertion");
  return parsed.value;
}

function removalSet(
  ids: string | ReadonlyArray<string> | ReadonlySet<string>
): Set<string> {
  const values = typeof ids === "string" ? [ids] : [...ids];
  if (!values.every(stableKey)) throw new TypeError("Invalid occurrence removal");
  return new Set(values);
}

/** Remove occurrences and every active occurrence whose lifetime depends on them. */
export function removeOccurrences(
  state: Readonly<OccurrenceState>,
  ids: string | ReadonlyArray<string> | ReadonlySet<string>
): Readonly<OccurrenceState> {
  const current = parsedOrThrow(state);
  const removed = removalSet(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, occurrence] of Object.entries(current.occurrences)) {
      if (removed.has(id)) continue;
      if (dependencyIds(occurrence).some((dependency) => removed.has(dependency))) {
        removed.add(id);
        changed = true;
      }
    }
  }
  if (![...removed].some((id) => Object.hasOwn(current.occurrences, id))) return current;
  const occurrences = Object.fromEntries(
    Object.entries(current.occurrences).filter(([id]) => !removed.has(id))
  );
  const parsed = parseOccurrenceState({
    nextOccurrenceOrdinal: current.nextOccurrenceOrdinal,
    occurrences,
  });
  if (!parsed.ok) throw new TypeError("Invalid occurrence removal result");
  return parsed.value;
}

/** Stable FIFO order for every selector: allocation ordinal, then id. */
export function selectOccurrenceEntries(
  state: Readonly<OccurrenceState>
): ReadonlyArray<OccurrenceEntry> {
  return Object.entries(state.occurrences)
    .map(([id, occurrence]) => ({ id, occurrence }))
    .sort(
      (left, right) =>
        left.occurrence.ordinal - right.occurrence.ordinal ||
        compareCanonical(left.id, right.id)
    );
}

export function resolveOccurrenceAuthority(
  state: Readonly<OccurrenceState>,
  occurrenceId: string
): ResolvedOccurrenceAuthority | null {
  const occurrence = state.occurrences[occurrenceId];
  if (!occurrence) return null;
  const rootId = isEffectOccurrence(occurrence) ? occurrence.parentId : occurrenceId;
  const root = state.occurrences[rootId];
  return root?.kind === "program" ? { rootId, root, authority: root.authority } : null;
}

export function selectOccurrencesForTarget(
  state: Readonly<OccurrenceState>,
  target: EntityRef
): ReadonlyArray<OccurrenceEntry<EffectOccurrence>> {
  return selectOccurrenceEntries(state).flatMap(({ id, occurrence }) =>
    isEffectOccurrence(occurrence) &&
    occurrence.ending === null &&
    sameEntity(occurrence.target, target)
      ? [{ id, occurrence }]
      : []
  );
}

function entriesForOptionalTarget(
  state: Readonly<OccurrenceState>,
  target?: EntityRef
): ReadonlyArray<OccurrenceEntry> {
  return target === undefined
    ? selectOccurrenceEntries(state).filter(
        ({ occurrence }) => occurrence.ending === null
      )
    : selectOccurrencesForTarget(state, target);
}

export function selectActiveKeys(
  state: Readonly<OccurrenceState>,
  target?: EntityRef
): ReadonlyArray<string> {
  return [
    ...new Set(
      entriesForOptionalTarget(state, target).flatMap(({ occurrence }) =>
        occurrence.kind === "standing" && occurrence.fact.kind === "active-key"
          ? [occurrence.fact.key]
          : []
      )
    ),
  ].sort();
}

export function selectProjectedGrantSources(
  state: Readonly<OccurrenceState>,
  target?: EntityRef
): ReadonlyArray<ProjectedGrantSource> {
  return entriesForOptionalTarget(state, target).flatMap(({ id, occurrence }) => {
    if (occurrence.kind !== "standing" || occurrence.fact.kind !== "grant-group") {
      return [];
    }
    const resolved = resolveOccurrenceAuthority(state, id);
    return resolved
      ? [
          {
            authority: resolved.authority,
            groupId: occurrence.fact.groupId,
            occurrenceId: id,
            programOccurrenceId: resolved.rootId,
            target: occurrence.target,
          },
        ]
      : [];
  });
}

export function selectConditionOccurrences(
  state: Readonly<OccurrenceState>,
  target: EntityRef,
  conditionId?: string
): ReadonlyArray<OccurrenceEntry<OccurrenceOfKind<"condition">>> {
  return selectOccurrencesForTarget(state, target).flatMap(({ id, occurrence }) =>
    occurrence.kind === "condition" &&
    (conditionId === undefined || occurrence.conditionId === conditionId)
      ? [{ id, occurrence }]
      : []
  );
}

/** Hidden conditions remain mechanically effective; hidden only gates presentation. */
export function selectEffectiveConditions(
  state: Readonly<OccurrenceState>,
  target: EntityRef
): ReadonlyArray<string> {
  return [
    ...new Set(
      selectConditionOccurrences(state, target).map(
        ({ occurrence }) => occurrence.conditionId
      )
    ),
  ].sort();
}

export function selectConcentrationForActor(
  state: Readonly<OccurrenceState>,
  actor: EntityRef
): OccurrenceEntry<OccurrenceOfKind<"concentration">> | null {
  return (
    (selectOccurrencesForTarget(state, actor).find(
      ({ occurrence }) => occurrence.kind === "concentration"
    ) as OccurrenceEntry<OccurrenceOfKind<"concentration">> | undefined) ?? null
  );
}

export function selectMarkedTarget(
  state: Readonly<OccurrenceState>,
  actor: EntityRef,
  markId: string
): Readonly<EntityRef> | null {
  const matches = selectOccurrencesForTarget(state, actor).flatMap(({ occurrence }) =>
    occurrence.kind === "standing" &&
    occurrence.fact.kind === "target-mark" &&
    occurrence.fact.markId === markId
      ? [occurrence.fact.marked]
      : []
  );
  return matches.at(-1) ?? null;
}

export function selectStandingFacts(
  state: Readonly<OccurrenceState>,
  target?: EntityRef
): ReadonlyArray<OccurrenceEntry<OccurrenceOfKind<"standing">>> {
  return entriesForOptionalTarget(state, target).flatMap(({ id, occurrence }) =>
    occurrence.kind === "standing" ? [{ id, occurrence }] : []
  );
}

/** Ordered, kernel-ready damage defenses; repeated instances of one rule do not stack. */
export function selectEffectiveDamageDefenseProfile(
  state: Readonly<OccurrenceState>,
  target: EntityRef
): Readonly<DamageDefenseProfile> {
  const seen = new Set<string>();
  const rules: DamageDefenseRule[] = [];
  for (const { occurrence } of selectStandingFacts(state, target)) {
    if (occurrence.fact.kind !== "damage-defense") continue;
    const { rule } = occurrence.fact;
    if (seen.has(rule.sourceId)) continue;
    seen.add(rule.sourceId);
    rules.push(rule);
  }
  const profile = conformDamageDefenseProfile({ damageThreshold: null, rules });
  if (!profile) throw new TypeError("Invalid effective damage-defense profile");
  return profile;
}

/** Condition immunity is a distinct rules domain, never packed into damage profiles. */
export function selectEffectiveConditionImmunities(
  state: Readonly<OccurrenceState>,
  target: EntityRef
): ReadonlyArray<string> {
  return [
    ...new Set(
      selectStandingFacts(state, target).flatMap(({ occurrence }) =>
        occurrence.fact.kind === "condition-immunity" ? [occurrence.fact.conditionId] : []
      )
    ),
  ].sort();
}

/** End rules are a logical OR: one matching boundary selects the occurrence once. */
export function selectOccurrencesEndingAt(
  state: Readonly<OccurrenceState>,
  boundary: EndRule,
  target?: EntityRef
): ReadonlyArray<OccurrenceEntry> {
  return entriesForOptionalTarget(state, target).filter(({ occurrence }) =>
    occurrence.endRules.some((rule) => sameJson(rule, boundary))
  );
}

export function selectChildrenOf(
  state: Readonly<OccurrenceState>,
  parentId: string
): ReadonlyArray<OccurrenceEntry<EffectOccurrence>> {
  return selectOccurrenceEntries(state).flatMap(({ id, occurrence }) =>
    isEffectOccurrence(occurrence) && occurrence.parentId === parentId
      ? [{ id, occurrence }]
      : []
  );
}

/** Select only children owned by one exact program-phase execution. */
export function selectProgramPhaseChildren(
  state: Readonly<OccurrenceState>,
  parentId: string,
  phaseId: string,
  execution: number
): ReadonlyArray<OccurrenceEntry<EffectOccurrence>> {
  return selectChildrenOf(state, parentId).filter(
    ({ occurrence }) =>
      occurrence.origin.phaseId === phaseId && occurrence.origin.execution === execution
  );
}

/** Select one authored step's children from one exact phase execution. */
export function selectProgramStepChildren(
  state: Readonly<OccurrenceState>,
  parentId: string,
  phaseId: string,
  execution: number,
  stepId: string
): ReadonlyArray<OccurrenceEntry<EffectOccurrence>> {
  return selectProgramPhaseChildren(state, parentId, phaseId, execution).filter(
    ({ occurrence }) => occurrence.origin.stepId === stepId
  );
}

/** Smallest remaining absolute duration; turn boundaries need the caller's current round. */
export function selectRoundsUntilDeadline(
  state: Readonly<OccurrenceState>,
  occurrenceId: string,
  currentRound?: number,
  clock?: ClockRef,
  elapsedSeconds?: number
): number | null {
  const occurrence = state.occurrences[occurrenceId];
  if (!occurrence || occurrence.ending !== null) return null;
  const candidates = occurrence.endRules.flatMap((rule) => {
    if (
      rule.kind === "time-reached" &&
      clock !== undefined &&
      elapsedSeconds !== undefined &&
      sameJson(rule.clock, clock)
    ) {
      return [Math.ceil(Math.max(0, rule.elapsedSeconds - elapsedSeconds) / 6)];
    }
    if (rule.kind === "turn-boundary" && currentRound !== undefined) {
      return [Math.max(0, rule.round - currentRound)];
    }
    return [];
  });
  return candidates.length === 0 ? null : Math.min(...candidates);
}

export function selectProgramExecution(
  state: Readonly<OccurrenceState>,
  occurrenceId: string
): ProgramExecution | null {
  const occurrence = state.occurrences[occurrenceId];
  if (!occurrence || occurrence.kind !== "program") return null;
  return {
    program: { id: occurrenceId, occurrence },
    children: selectChildrenOf(state, occurrenceId),
  };
}

export function selectPolymorphForm(
  state: Readonly<OccurrenceState>,
  target: EntityRef
): OccurrenceEntry<OccurrenceOfKind<"polymorph-form">> | null {
  const forms = selectOccurrencesForTarget(state, target).flatMap(({ id, occurrence }) =>
    occurrence.kind === "polymorph-form" ? [{ id, occurrence }] : []
  );
  return forms[0] ?? null;
}

/** Item activation is exactly a standing active-key with physical-instance provenance. */
export function selectItemActivations(
  state: Readonly<OccurrenceState>,
  target?: EntityRef
): ReadonlyArray<OccurrenceEntry<OccurrenceOfKind<"standing">>> {
  return selectStandingFacts(state, target).filter(
    ({ id, occurrence }) =>
      occurrence.fact.kind === "active-key" &&
      resolveOccurrenceAuthority(state, id)?.authority.source.kind === "inventory-item"
  );
}
