/** The single MechanicsProgram → ordered physical transaction compiler. */

import { materialRefKey } from "@/lib/action-journal";
import { canonicalFingerprint, canonicalJson } from "@/lib/canonical-fingerprint";
import { conformDamageDefenseProfile, resolveDamage } from "@/lib/damage";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import { selectEffectiveDamageDefenseProfile } from "@/lib/mechanic-occurrences";
import {
  conformNewInventoryInstance,
  conformNewMaterialEntity,
} from "@/lib/material-state";
import { deriveMechanicsPostEventEmissions } from "@/lib/mechanics-execution";
import {
  projectMechanicsTransaction,
  simulateMechanicsTransaction,
} from "@/lib/mechanics-operation";
import {
  materializeMechanicsStandingFacts,
  mechanicsProgramEffectOccurrenceId,
  mechanicsProgramExpansionSlot,
  resolveMechanicsLifetime,
  resolveMechanicsMaterialClocks,
  selectActiveMechanicsEffects,
  selectActiveProgramStepChildren,
} from "@/lib/mechanics-program-effects";
import {
  mechanicsProgramStepIsActive,
  prepareMechanicsProgramCompilation,
  refreshMechanicsProgramProjectedCompilationContext,
  resolveMechanicsProgramAmount,
  resolveMechanicsProgramTargets,
} from "@/lib/mechanics-program";
import {
  entityRefKey,
  occurrenceGenerationRefKey,
} from "@/lib/mechanics-reference-schema";
import {
  advanceMechanicsPendingFrameStep,
  topMechanicsPendingFrame,
} from "@/lib/mechanics-world";
import type { ActionFactGuard } from "@/types/action-journal";
import type { DamageAllocationObservation, DamageDefenseProfile } from "@/types/damage";
import type {
  CompileMechanicsFrameInput,
  MechanicsCompiledSegment,
  MechanicsCompiledStepTrace,
  MechanicsCompilerContinuation,
  MechanicsFrameCompileRejection,
  MechanicsFrameCompileResult,
} from "@/types/mechanics-compiler";
import { HIT_POINT_MAXIMUM_FACT_ADDRESS } from "@/types/mechanics-operation";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
  MechanicsTransaction,
  MechanicsTransactionSimulationResult,
} from "@/types/mechanics-operation";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  MechanicOccurrence,
  NewMechanicOccurrence,
  ProgramStepOccurrenceOrigin,
  StandingFact,
} from "@/types/mechanic-occurrence";
import type {
  ManualInstruction,
  MechanicsProgramCompilationContext,
  MechanicsRequestIdentity,
  ResolvedMechanicsAnswer,
} from "@/types/mechanics-program";
import type { MechanicsStep } from "@/types/mechanics-program-authoring";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type { MaterialEntity } from "@/types/material-state";
import type {
  MechanicsCausalState,
  MechanicsPendingFrameCursor,
} from "@/types/mechanics-world";

const MAX_COMPILED_OPERATIONS = 2_048;

type CompilerCoordination = Extract<
  MechanicsFrameCompileResult,
  { readonly status: "needs-coordination" }
>["coordination"];

type CompilerRequest = Extract<
  MechanicsFrameCompileResult,
  { readonly status: "needs-response" }
>["request"];

interface MechanicsCompilerFiber {
  readonly binding: ReturnType<typeof canonicalFingerprint>;
  readonly cursor: Readonly<MechanicsPendingFrameCursor>;
  readonly frame: Readonly<CompileMechanicsFrameInput["reviewed"]["intent"]["frame"]>;
  readonly request: Readonly<CompilerRequest>;
  readonly responsePrefix: readonly Readonly<
    CompileMechanicsFrameInput["responses"][number]
  >[];
  /** The exact issuance causal state; resumption on any other state fails closed. */
  readonly state: Readonly<CompileMechanicsFrameInput["state"]>;
}

const compilerFibers = new WeakMap<object, Readonly<MechanicsCompilerFiber>>();

type EffectStep = Extract<
  MechanicsStep,
  {
    readonly kind: "condition" | "concentration" | "polymorph" | "standing";
  }
>;

type EffectStartStep = EffectStep & {
  readonly lifetime: NonNullable<EffectStep["lifetime"]>;
  readonly operation: "apply" | "start";
};

type EffectEndStep = EffectStep & {
  readonly lifetime: null;
  readonly operation: "end" | "remove";
};

interface EffectStartSlot {
  readonly fact: Readonly<StandingFact> | null;
  readonly slot: number;
  readonly target: Readonly<EntityRef>;
}

function effectTargetIsCreature(
  world: Readonly<MechanicsProgramCompilationContext["world"]>,
  target: Readonly<EntityRef>
): boolean {
  const document = world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(target.material)
  );
  if (!document) return false;
  if (target.entityId === "self") return document.kind === "character";
  const entity = document.state.entities[target.entityId];
  return (
    entity?.ordinal === target.ordinal &&
    entity.availability === "present" &&
    entity.kind === "creature"
  );
}

function freezeDeep<T>(value: T): Readonly<T> {
  const visited = new WeakSet<object>();
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || visited.has(entry)) return;
    visited.add(entry);
    Object.values(entry).forEach(visit);
    Object.freeze(entry);
  };
  visit(value);
  return value;
}

function compilerInputBinding(
  input: Readonly<CompileMechanicsFrameInput>
): ReturnType<typeof canonicalFingerprint> {
  return canonicalFingerprint({
    authoritySnapshot: input.authoritySnapshot,
    facts: input.facts,
    reviewed: input.reviewed,
  });
}

function compilerContinuation(
  input: Readonly<CompileMechanicsFrameInput>,
  cursor: Readonly<MechanicsPendingFrameCursor>,
  request: Readonly<CompilerRequest>
): Readonly<MechanicsCompilerContinuation> {
  const fiber = Object.freeze({
    binding: compilerInputBinding(input),
    cursor: freezeDeep(structuredClone(cursor)),
    frame: input.reviewed.intent.frame,
    request: freezeDeep(structuredClone(request)),
    responsePrefix: freezeDeep(structuredClone(input.responses)),
    state: input.state,
  }) satisfies MechanicsCompilerFiber;
  const continuation = freezeDeep({}) as Readonly<MechanicsCompilerContinuation>;
  compilerFibers.set(continuation, fiber);
  return continuation;
}

function compilerFiberMatches(
  fiber: Readonly<MechanicsCompilerFiber>,
  input: Readonly<CompileMechanicsFrameInput>
): boolean {
  try {
    const top = topMechanicsPendingFrame(input.state);
    return (
      top !== null &&
      fiber.state === input.state &&
      fiber.binding === compilerInputBinding(input) &&
      canonicalFingerprint(top.frame) === canonicalFingerprint(fiber.frame) &&
      canonicalFingerprint(top.cursor) === canonicalFingerprint(fiber.cursor)
    );
  } catch {
    return false;
  }
}

/** Runtime proof that a continuation was issued for exactly this input and basis. */
export function isMechanicsCompilerContinuationFor(
  value: unknown,
  input: Readonly<CompileMechanicsFrameInput>
): value is Readonly<MechanicsCompilerContinuation> {
  if (typeof value !== "object" || value === null) return false;
  const fiber = compilerFibers.get(value);
  return (
    fiber !== undefined &&
    compilerFiberMatches(fiber, input) &&
    canonicalFingerprint(fiber.responsePrefix) === canonicalFingerprint(input.responses)
  );
}

/**
 * Authenticate and consume the single-use continuation for one resumption.
 * Consumption invalidates it even when the resumed compilation then rejects.
 */
function consumeCompilerContinuation(
  value: unknown,
  input: Readonly<CompileMechanicsFrameInput>
): Readonly<MechanicsCompilerFiber> | null {
  if (typeof value !== "object" || value === null) return null;
  const fiber = compilerFibers.get(value);
  if (!fiber) return null;
  compilerFibers.delete(value);
  return compilerFiberMatches(fiber, input) ? fiber : null;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isEffectStartStep(step: Readonly<MechanicsStep>): step is EffectStartStep {
  if (
    step.kind !== "condition" &&
    step.kind !== "standing" &&
    step.kind !== "concentration" &&
    step.kind !== "polymorph"
  ) {
    return false;
  }
  return (
    step.lifetime !== null &&
    ((step.kind === "condition" && step.operation === "apply") ||
      (step.kind !== "condition" && step.operation === "start"))
  );
}

function isEffectEndStep(step: Readonly<MechanicsStep>): step is EffectEndStep {
  if (
    step.kind !== "condition" &&
    step.kind !== "standing" &&
    step.kind !== "concentration" &&
    step.kind !== "polymorph"
  ) {
    return false;
  }
  return (
    step.lifetime === null &&
    ((step.kind === "condition" && step.operation === "remove") ||
      (step.kind !== "condition" && step.operation === "end"))
  );
}

function effectSlots(
  step: Readonly<EffectStep>,
  context: Readonly<MechanicsProgramCompilationContext>,
  firstSlot = 1
): readonly Readonly<EffectStartSlot>[] | null {
  const identities = resolveMechanicsProgramTargets(
    step.kind === "concentration" ? { kind: "role", role: "caster" } : step.target,
    context
  );
  if (!identities) return null;
  const targets = identities.map(({ binding }) => binding);
  let facts: readonly Readonly<StandingFact | null>[];
  if (step.kind !== "standing") {
    facts = targets.map(() => null);
  } else {
    const marked =
      step.fact.kind === "target-mark"
        ? (resolveMechanicsProgramTargets(step.fact.marked, context)?.map(
            ({ binding }) => binding
          ) ?? null)
        : null;
    const materialized = materializeMechanicsStandingFacts(step.fact, targets, marked);
    if (!materialized) return null;
    facts = materialized.map(({ fact }) => fact);
  }
  const result: EffectStartSlot[] = [];
  for (const [index, identity] of identities.entries()) {
    const offset = mechanicsProgramExpansionSlot(index);
    const slot = offset === null ? null : firstSlot + offset - 1;
    const fact = facts[index];
    if (
      slot === null ||
      !Number.isSafeInteger(slot) ||
      slot < firstSlot ||
      fact === undefined
    ) {
      return null;
    }
    result.push({ fact, slot, target: identity.binding });
  }
  return result;
}

function effectEndOccurrences(
  step: Readonly<EffectEndStep>,
  slots: readonly Readonly<EffectStartSlot>[],
  context: Readonly<MechanicsProgramCompilationContext>
): readonly Readonly<OccurrenceGenerationRef>[] | null {
  if (step.kind === "concentration") {
    const target = slots[0]?.target;
    const caster = context.intent.frame.authority.anchors.caster;
    if (
      slots.length !== 1 ||
      !target ||
      !caster ||
      entityRefKey(target) !== entityRefKey(caster)
    ) {
      return null;
    }
  }
  const root = context.intent.frame.rootReceipt.root;
  return uniqueOccurrences(
    slots.flatMap(({ fact, target }) => {
      if (step.kind === "condition") {
        return selectActiveMechanicsEffects(context.world, {
          conditionId: step.conditionId,
          kind: "condition",
          target,
        });
      }
      if (step.kind === "standing") {
        return fact
          ? selectActiveMechanicsEffects(context.world, {
              fact,
              kind: "standing",
              root,
              target,
            })
          : [];
      }
      if (step.kind === "concentration") {
        return selectActiveMechanicsEffects(context.world, {
          kind: "concentration",
          root,
          target,
        });
      }
      return selectActiveMechanicsEffects(context.world, {
        formId: step.formId,
        kind: "polymorph-form",
        root,
        target,
      });
    })
  );
}

function lifetimeCombatant(
  lifetime: Readonly<NonNullable<EffectStep["lifetime"]>>,
  context: Readonly<MechanicsProgramCompilationContext>
): { readonly combatant: Readonly<EntityRef> | null; readonly ok: boolean } {
  if (lifetime.kind !== "rest-completed" && lifetime.kind !== "turn-boundary") {
    return { combatant: null, ok: true };
  }
  const targets = resolveMechanicsProgramTargets(
    { kind: "role", role: lifetime.combatant },
    context
  );
  const combatant = targets?.length === 1 ? targets[0]?.binding : null;
  return combatant ? { combatant, ok: true } : { combatant: null, ok: false };
}

function currentTurnPhase(
  context: Readonly<MechanicsProgramCompilationContext>,
  state: Readonly<MechanicsCausalState>,
  combatant: Readonly<EntityRef> | null
): "active" | "end" | "start" {
  const trigger = context.intent.frame.trigger;
  if (combatant === null) return "active";
  const clocks = resolveMechanicsMaterialClocks(context.world, combatant.material);
  const encounter = clocks?.encounter;
  if (!encounter) return "active";
  const clockKey = materialRefKey(encounter.clock.material);
  const combatantKey = entityRefKey(combatant);
  if (
    trigger.kind === "turn-boundary" &&
    trigger.clock.epoch === encounter.clock.epoch &&
    materialRefKey(trigger.clock.material) === clockKey &&
    trigger.round === encounter.state.round &&
    entityRefKey(trigger.combatant) === combatantKey
  ) {
    return trigger.phase;
  }
  const reached = state.context.request.boundaries.filter(
    (boundary) =>
      boundary.kind === "turn-boundary" &&
      boundary.clock.epoch === encounter.clock.epoch &&
      materialRefKey(boundary.clock.material) === clockKey &&
      boundary.round === encounter.state.round &&
      entityRefKey(boundary.combatant) === combatantKey
  );
  return reached.some(({ phase }) => phase === "end")
    ? "end"
    : reached.some(({ phase }) => phase === "start")
      ? "start"
      : "active";
}

function rootOccurrenceOrdinal(
  context: Readonly<MechanicsProgramCompilationContext>
): number | null {
  const material = context.intent.frame.rootReceipt.root.occurrence.material;
  const document = context.world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(material)
  );
  const ordinal = document?.state.nextOccurrenceOrdinal;
  return ordinal !== undefined &&
    Number.isSafeInteger(ordinal) &&
    ordinal > 0 &&
    ordinal < Number.MAX_SAFE_INTEGER
    ? ordinal
    : null;
}

function documentAllocator(
  context: Readonly<MechanicsProgramCompilationContext>,
  key: "nextEntityOrdinal" | "nextInventoryOrdinal"
): number | null {
  const material = context.intent.frame.rootReceipt.root.occurrence.material;
  const document = context.world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(material)
  );
  const state = document?.state;
  const ordinal =
    state && key in state ? (state as Record<typeof key, number>)[key] : undefined;
  return ordinal !== undefined &&
    Number.isSafeInteger(ordinal) &&
    ordinal > 0 &&
    ordinal < Number.MAX_SAFE_INTEGER
    ? ordinal
    : null;
}

function blueprintEntityKey(
  template: Readonly<
    Extract<MechanicsStep, { readonly kind: "entity-create" }>["template"]
  >
): string {
  return template.kind === "monster"
    ? `monster:${template.monsterId}`
    : template.kind === "companion"
      ? `companion:${template.sourceId}:${template.variantId}`
      : `object:${template.objectId}`;
}

function uniqueOccurrences(
  values: readonly Readonly<OccurrenceGenerationRef>[]
): readonly Readonly<OccurrenceGenerationRef>[] {
  const seen = new Set<string>();
  return values
    .filter((value) => {
      const key = occurrenceGenerationRefKey(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (left, right) =>
        compareCodeUnits(
          materialRefKey(left.occurrence.material),
          materialRefKey(right.occurrence.material)
        ) ||
        left.ordinal - right.ordinal ||
        compareCodeUnits(left.occurrence.occurrenceId, right.occurrence.occurrenceId)
    );
}

function occurrenceBelongsToCurrentFrame(
  occurrence: Readonly<OccurrenceGenerationRef>,
  context: Readonly<MechanicsProgramCompilationContext>
): boolean {
  const document = context.world.documents.find(
    ({ material }) =>
      materialRefKey(material) === materialRefKey(occurrence.occurrence.material)
  );
  const value = document?.state.occurrences[occurrence.occurrence.occurrenceId];
  return (
    value !== undefined &&
    value.ordinal === occurrence.ordinal &&
    value.kind !== "program" &&
    occurrenceGenerationRefKey(value.origin.root) ===
      occurrenceGenerationRefKey(context.intent.frame.rootReceipt.root) &&
    value.origin.phaseId === context.phase.phaseId &&
    value.origin.execution === context.execution
  );
}

function replacementCoordination(
  step: Readonly<EffectStartStep>,
  slots: readonly Readonly<EffectStartSlot>[],
  context: Readonly<MechanicsProgramCompilationContext>
):
  | Readonly<CompilerCoordination>
  | Extract<MechanicsFrameCompileResult, { readonly status: "rejected" }>
  | null {
  if (step.kind !== "concentration" && step.kind !== "polymorph") return null;
  if (step.kind === "concentration") {
    const target = slots[0]?.target;
    const caster = context.intent.frame.authority.anchors.caster;
    if (
      slots.length !== 1 ||
      !target ||
      !caster ||
      entityRefKey(target) !== entityRefKey(caster)
    ) {
      return rejected(
        "unresolved-step",
        context.phase.phaseId,
        step.stepId,
        "invalid-concentration-owner"
      );
    }
  }
  if (new Set(slots.map(({ target }) => entityRefKey(target))).size !== slots.length) {
    return rejected(
      "unresolved-step",
      context.phase.phaseId,
      step.stepId,
      "duplicate-exclusive-target"
    );
  }
  const occurrences = uniqueOccurrences(
    slots.flatMap(({ target }) =>
      selectActiveMechanicsEffects(
        context.world,
        step.kind === "concentration"
          ? { kind: "concentration", target }
          : { kind: "polymorph-form", target }
      )
    )
  );
  if (occurrences.length === 0) return null;
  if (
    occurrences.some((occurrence) => occurrenceBelongsToCurrentFrame(occurrence, context))
  ) {
    return rejected(
      "unresolved-step",
      context.phase.phaseId,
      step.stepId,
      "same-frame-exclusive-replacement"
    );
  }
  return freezeDeep(
    step.kind === "concentration"
      ? { kind: "concentration-replacement" as const, occurrences }
      : { kind: "occurrence-end" as const, occurrences }
  );
}

function effectOccurrence(
  step: Readonly<EffectStartStep>,
  slot: Readonly<EffectStartSlot>,
  origin: Readonly<ProgramStepOccurrenceOrigin>,
  endRules: NonNullable<ReturnType<typeof resolveMechanicsLifetime>>,
  parentId: string
): Readonly<NewMechanicOccurrence> | null {
  const common = {
    endRules,
    origin,
    parentId,
    target: slot.target,
  } as const;
  if (step.kind === "condition") {
    return { ...common, conditionId: step.conditionId, kind: "condition" };
  }
  if (step.kind === "concentration") return { ...common, kind: "concentration" };
  if (step.kind === "polymorph") {
    return { ...common, formId: step.formId, kind: "polymorph-form" };
  }
  return slot.fact ? { ...common, fact: slot.fact, kind: "standing" } : null;
}

type VitalityStep = Extract<
  MechanicsStep,
  {
    readonly kind:
      | "damage"
      | "heal"
      | "temporary-hit-points"
      | "clear-temporary-hit-points"
      | "exhaustion-change"
      | "stabilize"
      | "death";
  }
>;

function isVitalityStep(step: Readonly<MechanicsStep>): step is VitalityStep {
  return (
    step.kind === "damage" ||
    step.kind === "heal" ||
    step.kind === "temporary-hit-points" ||
    step.kind === "clear-temporary-hit-points" ||
    step.kind === "exhaustion-change" ||
    step.kind === "stabilize" ||
    step.kind === "death"
  );
}

interface VitalitySlot {
  readonly identity: Readonly<MechanicsRequestIdentity>;
  readonly slot: number;
  readonly target: Readonly<EntityRef>;
}

function vitalitySlots(
  step: Readonly<VitalityStep>,
  context: Readonly<MechanicsProgramCompilationContext>,
  firstSlot: number
): readonly Readonly<VitalitySlot>[] | null {
  const identities = resolveMechanicsProgramTargets(step.target, context);
  if (!identities) return null;
  const result: VitalitySlot[] = [];
  for (const [index, identity] of identities.entries()) {
    const offset = mechanicsProgramExpansionSlot(index);
    const slot = offset === null ? null : firstSlot + offset - 1;
    if (slot === null || !Number.isSafeInteger(slot) || slot < firstSlot) return null;
    result.push({ identity, slot, target: identity.binding });
  }
  return result;
}

type LocatedVitalityTarget =
  | { readonly kind: "character" }
  | { readonly entity: Readonly<MaterialEntity>; readonly kind: "entity" };

function locateVitalityTarget(
  world: Readonly<MechanicsProgramCompilationContext["world"]>,
  target: Readonly<EntityRef>
): Readonly<LocatedVitalityTarget> | null {
  const document = world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(target.material)
  );
  if (!document) return null;
  if (target.entityId === "self") {
    return document.kind === "character" ? { kind: "character" } : null;
  }
  const entity = document.state.entities[target.entityId];
  return entity?.ordinal === target.ordinal && entity.availability === "present"
    ? { entity, kind: "entity" }
    : null;
}

function vitalityTargetIsCreature(located: Readonly<LocatedVitalityTarget>): boolean {
  return located.kind === "character" || located.entity.kind === "creature";
}

/** Material defenses (object override or custom template) merged with standing facts. */
function effectiveVitalityDefenseProfile(
  world: Readonly<MechanicsProgramCompilationContext["world"]>,
  target: Readonly<EntityRef>,
  located: Readonly<LocatedVitalityTarget>
): Readonly<DamageDefenseProfile> | null {
  const document = world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(target.material)
  );
  if (!document) return null;
  const standing = selectEffectiveDamageDefenseProfile(document.state, target);
  if (located.kind === "character" || located.entity.kind === "creature") {
    return standing;
  }
  const explicit = located.entity.overrides.damageDefenseProfile;
  if (explicit !== null) return explicit;
  const template =
    located.entity.template.kind === "custom"
      ? located.entity.template.definition.damageDefenseProfile
      : null;
  const seen = new Set(standing.rules.map(({ sourceId }) => sourceId));
  const rules = [
    ...standing.rules,
    ...(template?.rules ?? []).filter(({ sourceId }) => !seen.has(sourceId)),
  ];
  return conformDamageDefenseProfile({
    damageThreshold: template?.damageThreshold ?? null,
    rules,
  });
}

/** The caller-guarded effective maximum, or null when no guard names the target. */
function guardedMaximumHitPoints(
  facts: readonly Readonly<ActionFactGuard>[],
  target: Readonly<EntityRef>
): number | null {
  const targetKey = canonicalJson(target);
  for (const fact of facts) {
    if (
      canonicalJson(fact.address) !== canonicalJson(HIT_POINT_MAXIMUM_FACT_ADDRESS) ||
      canonicalJson(fact.owner) !== targetKey ||
      !fact.expected.present ||
      typeof fact.expected.value !== "number" ||
      !Number.isSafeInteger(fact.expected.value) ||
      fact.expected.value <= 0
    ) {
      continue;
    }
    return fact.expected.value;
  }
  return null;
}

function materialMaximumHitPoints(
  located: Readonly<LocatedVitalityTarget>
): number | null {
  if (located.kind !== "entity") return null;
  return (
    located.entity.overrides.hitPointMaximum ??
    (located.entity.template.kind === "custom"
      ? located.entity.template.definition.hitPointMaximum
      : null)
  );
}

/** Active root-owned Temporary-HP sources still targeting the holder. */
function selectRootTemporaryHitPointSources(
  world: Readonly<MechanicsProgramCompilationContext["world"]>,
  root: Readonly<OccurrenceGenerationRef>,
  target: Readonly<EntityRef>
): readonly Readonly<OccurrenceGenerationRef>[] {
  const document = world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(target.material)
  );
  if (!document) return [];
  const rootKey = occurrenceGenerationRefKey(root);
  const matches = (occurrence: Readonly<MechanicOccurrence>): boolean =>
    occurrence.kind === "standing" &&
    occurrence.ending === null &&
    occurrenceGenerationRefKey(occurrence.origin.root) === rootKey &&
    entityRefKey(occurrence.target) === entityRefKey(target) &&
    occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty");
  return uniqueOccurrences(
    Object.entries(document.state.occurrences).flatMap(([occurrenceId, occurrence]) =>
      matches(occurrence)
        ? [
            {
              occurrence: { material: document.material, occurrenceId },
              ordinal: occurrence.ordinal,
            },
          ]
        : []
    )
  );
}

/** Active root-owned material lifecycles still targeting the holder. */
function selectRootMaterialLifecycles(
  world: Readonly<MechanicsProgramCompilationContext["world"]>,
  root: Readonly<OccurrenceGenerationRef>,
  target: Readonly<EntityRef>
): readonly Readonly<OccurrenceGenerationRef>[] {
  const document = world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(target.material)
  );
  if (!document) return [];
  const rootKey = occurrenceGenerationRefKey(root);
  return uniqueOccurrences(
    Object.entries(document.state.occurrences).flatMap(([occurrenceId, occurrence]) =>
      occurrence.kind === "material-lifecycle" &&
      occurrence.ending === null &&
      occurrenceGenerationRefKey(occurrence.origin.root) === rootKey &&
      entityRefKey(occurrence.target) === entityRefKey(target)
        ? [
            {
              occurrence: { material: document.material, occurrenceId },
              ordinal: occurrence.ordinal,
            },
          ]
        : []
    )
  );
}

/** Locate one exact owned inventory copy and its current enchantment bearer. */
function locateInventoryCopy(
  world: Readonly<MechanicsProgramCompilationContext["world"]>,
  item: Readonly<{
    readonly instanceId: string;
    readonly instanceOrdinal: number;
    readonly owner: Readonly<EntityRef["material"]>;
  }>
): Readonly<{ enchantment: Readonly<unknown> | null }> | null {
  const document = world.documents.find(
    (candidate) => materialRefKey(candidate.material) === materialRefKey(item.owner)
  );
  if (document?.kind !== "character") return null;
  const instance = document.state.inventory[item.instanceId];
  return instance && instance.ordinal === item.instanceOrdinal
    ? { enchantment: instance.enchantment }
    : null;
}

function rejected(
  reason: MechanicsFrameCompileRejection,
  phaseId: string | null,
  stepId: string | null,
  referenceId: string | null = null,
  operationId: string | null = null
): MechanicsFrameCompileResult {
  return freezeDeep({
    operationId,
    phaseId,
    reason,
    referenceId,
    status: "rejected" as const,
    stepId,
  });
}

function operationId(
  input: Readonly<CompileMechanicsFrameInput>,
  stepId: string,
  slot: number,
  kind: string
): string {
  const receipt = input.reviewed.intent.frame.rootReceipt;
  return canonicalFingerprint({
    actionId: input.reviewed.intent.actionId,
    execution: receipt.next.execution,
    kind,
    phaseId: receipt.next.phaseId,
    root: receipt.root,
    slot,
    stepId,
  });
}

function causesFor(
  operations: readonly Readonly<MechanicsOperation>[],
  causes: ReadonlyMap<string, Readonly<MechanicsOperationCause>>
):
  | readonly [Readonly<MechanicsOperationCause>, ...Readonly<MechanicsOperationCause>[]]
  | null {
  if (operations.length === 0) return null;
  const used = new Set(operations.map(({ causeId }) => causeId));
  const result = [...used].map((causeId) => causes.get(causeId) ?? null);
  if (result.some((cause) => cause === null)) return null;
  const sorted = (result as Readonly<MechanicsOperationCause>[]).sort((left, right) =>
    compareCodeUnits(left.causeId, right.causeId)
  );
  const first = sorted[0];
  return first ? [first, ...sorted.slice(1)] : null;
}

function transactionFor(
  input: Readonly<CompileMechanicsFrameInput>,
  operations: readonly Readonly<MechanicsOperation>[],
  causes: ReadonlyMap<string, Readonly<MechanicsOperationCause>>
): MechanicsTransaction | null {
  const usedCauses = causesFor(operations, causes);
  const firstOperation = operations[0];
  if (!usedCauses || !firstOperation) return null;
  return {
    actionId: input.reviewed.intent.actionId,
    actor: input.reviewed.intent.frame.authority.installation.owner,
    causes: usedCauses,
    factGuards: [...input.reviewed.intent.factGuards, ...input.facts],
    operations: [firstOperation, ...operations.slice(1)],
  };
}

function hasReviewedPayments(
  resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>
): boolean {
  return Object.values(resolved).some((answer) => {
    if (answer.kind === "resource") return true;
    return (
      (answer.kind === "d20" || answer.kind === "dice") &&
      answer.requests.some(({ payments }) => payments.length > 0)
    );
  });
}

function registerOperation(
  input: Readonly<CompileMechanicsFrameInput>,
  context: Readonly<MechanicsProgramCompilationContext>,
  step: Readonly<Extract<MechanicsStep, { readonly kind: "register" }>>,
  cause: Readonly<MechanicsOperationCause>,
  slot: number
): Readonly<
  Extract<MechanicsOperation, { readonly kind: "program-register-transition" }>
> | null {
  const current = context.root?.registers[step.registerId];
  if (current === undefined) return null;
  let next: string | number | boolean | null;
  if (step.operation.kind === "set-scalar") {
    next = step.operation.value;
  } else {
    const value = evaluateIntegerExpression(step.operation.value, context.bindings);
    if (value === null) return null;
    if (step.operation.kind === "set-integer") {
      next = value;
    } else {
      if (typeof current !== "number") return null;
      next = current + value;
      if (!Number.isSafeInteger(next) || Object.is(next, -0)) return null;
    }
  }
  return {
    causeId: cause.causeId,
    expected: current,
    kind: "program-register-transition",
    next,
    operationId: operationId(input, step.stepId, slot, "program-register-transition"),
    registerId: step.registerId,
    root: input.reviewed.intent.frame.rootReceipt.root,
  };
}

function manualInstruction(
  step: Readonly<
    Extract<MechanicsStep, { readonly kind: "manual-relocation" | "manual-table" }>
  >,
  context: Readonly<MechanicsProgramCompilationContext>
): Readonly<ManualInstruction> | null {
  if (step.kind === "manual-relocation") {
    const targets = resolveMechanicsProgramTargets(step.target, context);
    return targets
      ? {
          instructionId: step.instructionId,
          kind: "relocation",
          mode: step.mode,
          stepId: step.stepId,
          targets,
        }
      : null;
  }
  const answer = context.resolved[step.tableInputId];
  return answer?.kind === "table"
    ? {
        authority: answer.authority,
        instructionId: step.instructionId,
        kind: "table",
        rowId: answer.rowId,
        stepId: step.stepId,
      }
    : null;
}

function phaseTransitionOperation(
  input: Readonly<CompileMechanicsFrameInput>,
  cause: Readonly<MechanicsOperationCause>
): Readonly<Extract<MechanicsOperation, { readonly kind: "program-phase-transition" }>> {
  const receipt = input.reviewed.intent.frame.rootReceipt;
  return {
    causeId: cause.causeId,
    expected:
      receipt.kind === "create"
        ? {
            execution: 0,
            phaseId: receipt.next.phaseId,
            triggerEventId: null,
          }
        : receipt.expected,
    kind: "program-phase-transition",
    next: receipt.next,
    operationId: operationId(input, receipt.next.phaseId, 1, "program-phase-transition"),
    root: receipt.root,
  };
}

function transactionProblem(
  input: Readonly<CompileMechanicsFrameInput>,
  cursor: Readonly<MechanicsPendingFrameCursor>,
  responses: ReadonlyMap<
    string,
    Readonly<CompileMechanicsFrameInput["responses"][number]>
  >,
  result: Extract<
    MechanicsTransactionSimulationResult,
    {
      readonly status: "needs-boundary" | "needs-observation" | "rejected";
    }
  >,
  phaseId: string,
  stepId: string | null
): MechanicsFrameCompileResult {
  if (result.status === "needs-boundary") {
    return freezeDeep({
      coordination: { boundary: result.boundary, kind: "boundary" as const },
      segment: null,
      status: "needs-coordination" as const,
    });
  }
  if (result.status === "needs-observation") {
    const request = freezeDeep({
      boundary: result.boundary,
      kind: "resource-observation" as const,
      requestId: canonicalFingerprint({
        boundary: result.boundary,
        operationId: result.operationId,
        requirement: result.requirement,
      }),
      requirement: result.requirement,
    });
    if (responses.has(request.requestId)) {
      return rejected(
        "invalid-response",
        phaseId,
        stepId,
        "unconsumable-response",
        result.operationId
      );
    }
    return freezeDeep({
      continuation: compilerContinuation(input, cursor, request),
      request,
      segment: null,
      status: "needs-response" as const,
    });
  }
  return rejected("kernel-rejected", phaseId, stepId, result.reason, result.operationId);
}

/** Compile one already-reviewed frame; no store, locale, persistence or UI is consulted. */
export function compileMechanicsFrame(
  input: Readonly<CompileMechanicsFrameInput>
): Readonly<MechanicsFrameCompileResult> {
  const phaseId = input.reviewed.intent.frame.rootReceipt.next.phaseId;
  const top = topMechanicsPendingFrame(input.state);
  if (
    top === null ||
    canonicalFingerprint(top.frame) !==
      canonicalFingerprint(input.reviewed.intent.frame) ||
    top.cursor.stage === "phase-complete"
  ) {
    return rejected("invalid-state", phaseId, null, "pending-frame");
  }
  const preparation = prepareMechanicsProgramCompilation(input.reviewed, input.state);
  if (preparation.status === "replay") {
    return rejected("invalid-state", phaseId, null, "pending-frame-replay");
  }
  if (preparation.status === "rejected") {
    return rejected(
      preparation.reason === "invalid-state"
        ? "invalid-state"
        : "invalid-reviewed-intent",
      phaseId,
      null,
      preparation.referenceId ?? preparation.reason
    );
  }
  const responsePool = new Map<
    string,
    Readonly<CompileMechanicsFrameInput["responses"][number]>
  >();
  if (input.responses.length > 0) {
    const fiber = consumeCompilerContinuation(input.continuation, input);
    if (!fiber) {
      return rejected("invalid-response", phaseId, null, "unauthentic-continuation");
    }
    const prefix = fiber.responsePrefix;
    const answer = input.responses.at(-1);
    if (
      input.responses.length !== prefix.length + 1 ||
      canonicalFingerprint(input.responses.slice(0, prefix.length)) !==
        canonicalFingerprint(prefix) ||
      !answer ||
      answer.requestId !== fiber.request.requestId ||
      answer.kind !== fiber.request.kind
    ) {
      return rejected("invalid-response", phaseId, null, "response-mismatch");
    }
    for (const response of input.responses) {
      if (responsePool.has(response.requestId)) {
        return rejected("invalid-response", phaseId, null, "duplicate-response");
      }
      responsePool.set(response.requestId, response);
    }
  } else if (input.continuation !== null) {
    return rejected("invalid-response", phaseId, null, "unused-continuation");
  }
  if (hasReviewedPayments(input.reviewed.resolved)) {
    return rejected("unsupported-step", phaseId, null, "reviewed-payment");
  }

  const authority: Readonly<MechanicsProgramAuthorityReceipt> =
    input.reviewed.intent.frame.authority;
  const receipt = input.reviewed.intent.frame.rootReceipt;
  const rootInvocation = { kind: "program-root", occurrence: receipt.root } as const;
  const rootCause: MechanicsOperationCause = {
    causeId: canonicalFingerprint({ authority, invocation: rootInvocation }),
    invocation: rootInvocation,
  };
  const causes = new Map([[rootCause.causeId, rootCause] as const]);
  const cursor = top.cursor;
  let context = preparation.context;
  const state = preparation.state;

  const suspend = (
    coordination: Readonly<CompilerCoordination>
  ): MechanicsFrameCompileResult =>
    freezeDeep({
      coordination,
      segment: null,
      status: "needs-coordination" as const,
    });

  const unusedResponses = (): MechanicsFrameCompileResult | null =>
    responsePool.size > 0
      ? rejected("invalid-response", phaseId, null, "unused-response")
      : null;

  const operations: Readonly<MechanicsOperation>[] = [];
  const project = (
    operation: Readonly<MechanicsOperation>,
    stepId: string
  ): MechanicsFrameCompileResult | null => {
    if (operations.length >= MAX_COMPILED_OPERATIONS) {
      return rejected("unresolved-step", phaseId, stepId, "operation-limit");
    }
    operations.push(operation);
    const transaction = transactionFor(input, operations, causes);
    if (!transaction) return rejected("kernel-rejected", phaseId, stepId);
    const result = projectMechanicsTransaction(transaction, {
      authoritySnapshot: input.authoritySnapshot,
      state,
    });
    if (result.status !== "projected") {
      operations.pop();
      return transactionProblem(input, cursor, responsePool, result, phaseId, stepId);
    }
    const refreshed = refreshMechanicsProgramProjectedCompilationContext(
      input.reviewed,
      result.projection,
      context.landedDamage
    );
    if (!refreshed) {
      return rejected(
        "kernel-rejected",
        phaseId,
        stepId,
        "invalid-projected-context",
        operation.operationId
      );
    }
    context = refreshed;
    return null;
  };

  const cursorOnly = (
    manual: readonly Readonly<ManualInstruction>[],
    trace: readonly Readonly<MechanicsCompiledStepTrace>[],
    endRequests: readonly Readonly<OccurrenceGenerationRef>[] = []
  ): MechanicsFrameCompileResult => {
    const unused = unusedResponses();
    if (unused) return unused;
    const advanced = advanceMechanicsPendingFrameStep(state, top.frame);
    if (!advanced.ok) {
      return rejected("kernel-rejected", phaseId, trace[0]?.stepId ?? null);
    }
    const segment: MechanicsCompiledSegment = {
      actionFacts: [],
      consequences: [],
      emissions: [],
      endRequests,
      manual,
      state: advanced.value,
      trace,
      transaction: null,
    };
    return freezeDeep({ segment, status: "compiled" as const });
  };

  const simulateStep = (stepId: string): MechanicsFrameCompileResult => {
    const transaction = transactionFor(input, operations, causes);
    if (!transaction) return rejected("kernel-rejected", phaseId, stepId);
    const simulation = simulateMechanicsTransaction(transaction, {
      authoritySnapshot: input.authoritySnapshot,
      state,
    });
    if (simulation.status !== "simulated" && simulation.status !== "no-change") {
      return transactionProblem(input, cursor, responsePool, simulation, phaseId, stepId);
    }
    const unused = unusedResponses();
    if (unused) return unused;
    const advanced = advanceMechanicsPendingFrameStep(simulation.state, top.frame);
    if (!advanced.ok) {
      return rejected("kernel-rejected", phaseId, stepId, "cursor-advance");
    }
    const operationIds = operations.map(({ operationId: id }) => id);
    const executionsById = new Map(
      simulation.executions.map(
        (execution) => [execution.operationId, execution] as const
      )
    );
    const segment: MechanicsCompiledSegment = {
      actionFacts: simulation.actionFacts,
      consequences: simulation.consequences,
      emissions: deriveMechanicsPostEventEmissions(simulation.stages),
      endRequests: [],
      manual: [],
      state: advanced.value,
      trace: [
        {
          executions: operationIds.flatMap((id) => {
            const execution = executionsById.get(id);
            return execution ? [execution] : [];
          }),
          operationIds,
          status: "compiled",
          stepId,
        },
      ],
      transaction: simulation.transaction,
    };
    return freezeDeep({ segment, status: "compiled" as const });
  };

  if (cursor.stage === "phase-transition") {
    const operation = phaseTransitionOperation(input, rootCause);
    const transaction = transactionFor(input, [operation], causes);
    if (!transaction) return rejected("kernel-rejected", phaseId, null);
    const simulation = simulateMechanicsTransaction(transaction, {
      authoritySnapshot: input.authoritySnapshot,
      state,
    });
    if (simulation.status !== "simulated" && simulation.status !== "no-change") {
      return transactionProblem(input, cursor, responsePool, simulation, phaseId, null);
    }
    const unused = unusedResponses();
    if (unused) return unused;
    const nextTop = topMechanicsPendingFrame(simulation.state);
    if (
      nextTop === null ||
      canonicalFingerprint(nextTop.frame) !== canonicalFingerprint(top.frame) ||
      nextTop.cursor.stage !== "phase-complete"
    ) {
      return rejected("kernel-rejected", phaseId, null, "phase-cursor");
    }
    const segment: MechanicsCompiledSegment = {
      actionFacts: simulation.actionFacts,
      consequences: simulation.consequences,
      emissions: deriveMechanicsPostEventEmissions(simulation.stages),
      endRequests: [],
      manual: [],
      state: simulation.state,
      trace: [],
      transaction: simulation.transaction,
    };
    return freezeDeep({ segment, status: "compiled" as const });
  }

  const step = context.phase.steps[cursor.stepIndex];
  if (!step) {
    return rejected("invalid-state", phaseId, null, "step-cursor");
  }
  {
    const active = mechanicsProgramStepIsActive(step, context);
    if (active === null) {
      return rejected("unresolved-predicate", phaseId, step.stepId);
    }
    if (!active) {
      return cursorOnly(
        [],
        [
          {
            executions: [],
            operationIds: [],
            status: "omitted",
            stepId: step.stepId,
          },
        ]
      );
    }
    if (step.kind === "manual-relocation" || step.kind === "manual-table") {
      const instruction = manualInstruction(step, context);
      if (!instruction) return rejected("unresolved-step", phaseId, step.stepId);
      return cursorOnly(
        [instruction],
        [
          {
            executions: [],
            operationIds: [],
            status: "manual",
            stepId: step.stepId,
          },
        ]
      );
    }
    if (step.kind === "occurrence-end") {
      const occurrences = selectActiveProgramStepChildren(
        context.world,
        receipt.root,
        step.childStepId
      );
      if (occurrences.length > 0) {
        return suspend({ kind: "occurrence-end", occurrences });
      }
      return cursorOnly(
        [],
        [
          {
            executions: [],
            operationIds: [],
            status: "compiled",
            stepId: step.stepId,
          },
        ]
      );
    }
    if (isEffectEndStep(step)) {
      const slots = effectSlots(step, context);
      if (!slots) return rejected("unresolved-step", phaseId, step.stepId, "targets");
      if (
        step.kind !== "standing" &&
        !slots.every(({ target }) => effectTargetIsCreature(context.world, target))
      ) {
        return rejected("unresolved-step", phaseId, step.stepId, "wrong-target-kind");
      }
      const occurrences = effectEndOccurrences(step, slots, context);
      if (!occurrences) {
        return rejected(
          "unresolved-step",
          phaseId,
          step.stepId,
          "invalid-concentration-owner"
        );
      }
      if (occurrences.length > 0) {
        return suspend({ kind: "occurrence-end", occurrences });
      }
      return cursorOnly(
        [],
        [
          {
            executions: [],
            operationIds: [],
            status: "compiled",
            stepId: step.stepId,
          },
        ]
      );
    }
    if (isEffectStartStep(step)) {
      const slots = effectSlots(step, context, cursor.nextSlot);
      if (!slots) return rejected("unresolved-step", phaseId, step.stepId, "targets");
      if (
        step.kind !== "standing" &&
        !slots.every(({ target }) => effectTargetIsCreature(context.world, target))
      ) {
        return rejected("unresolved-step", phaseId, step.stepId, "wrong-target-kind");
      }
      const lifetimeTarget = lifetimeCombatant(step.lifetime, context);
      if (!lifetimeTarget.ok) {
        return rejected("unresolved-step", phaseId, step.stepId, "lifetime-combatant");
      }
      const endRules = resolveMechanicsLifetime(step.lifetime, {
        bindings: context.bindings,
        combatant: lifetimeTarget.combatant,
        currentPhaseId: context.phase.phaseId,
        currentTurnPhase: currentTurnPhase(context, state, lifetimeTarget.combatant),
        execution: context.execution,
        phaseExecutions: Object.fromEntries(
          input.reviewed.intent.frame.authority.snapshot.program?.phases.map(
            ({ phaseId: authoredPhaseId }) => [
              authoredPhaseId,
              context.root?.phaseState[authoredPhaseId]?.execution ?? 0,
            ]
          ) ?? []
        ),
        root: receipt.root,
        world: context.world,
      });
      if (!endRules || rootOccurrenceOrdinal(context) === null) {
        return rejected("unresolved-step", phaseId, step.stepId, "effect-occurrence");
      }
      const coordination = replacementCoordination(step, slots, context);
      if (coordination) {
        return "status" in coordination ? coordination : suspend(coordination);
      }
      for (const slot of slots) {
        const origin: ProgramStepOccurrenceOrigin = {
          execution: context.execution,
          kind: "program-step",
          phaseId: context.phase.phaseId,
          root: receipt.root,
          slot: slot.slot,
          stepId: step.stepId,
        };
        const occurrenceId = mechanicsProgramEffectOccurrenceId(origin);
        const ordinal = rootOccurrenceOrdinal(context);
        const occurrence = occurrenceId
          ? effectOccurrence(
              step,
              slot,
              origin,
              endRules,
              receipt.root.occurrence.occurrenceId
            )
          : null;
        if (!occurrence || occurrenceId === null || ordinal === null) {
          return rejected("unresolved-step", phaseId, step.stepId, "effect-occurrence");
        }
        const id = operationId(input, step.stepId, slot.slot, "occurrence-create");
        const operation: Extract<
          MechanicsOperation,
          { readonly kind: "occurrence-create" }
        > = {
          causeId: rootCause.causeId,
          conditionImmunityOverride: null,
          created: {
            occurrence: {
              material: receipt.root.occurrence.material,
              occurrenceId,
            },
            ordinal,
          },
          kind: "occurrence-create",
          occurrence,
          operationId: id,
          parent: receipt.root,
        };
        const problem = project(operation, step.stepId);
        if (problem) return problem;
      }
      return operations.length === 0
        ? cursorOnly(
            [],
            [
              {
                executions: [],
                operationIds: [],
                status: "compiled",
                stepId: step.stepId,
              },
            ]
          )
        : simulateStep(step.stepId);
    }
    if (step.kind === "end-program") {
      return cursorOnly(
        [],
        [
          {
            executions: [],
            operationIds: [],
            status: "compiled",
            stepId: step.stepId,
          },
        ],
        [receipt.root]
      );
    }
    if (step.kind === "entity-create" || step.kind === "inventory-create") {
      const blueprints = input.reviewed.intent.frame.authority.snapshot.blueprints;
      const lifetimeTarget = lifetimeCombatant(step.lifetime, context);
      if (!lifetimeTarget.ok) {
        return rejected("unresolved-step", phaseId, step.stepId, "lifetime-combatant");
      }
      const endRules = resolveMechanicsLifetime(step.lifetime, {
        bindings: context.bindings,
        combatant: lifetimeTarget.combatant,
        currentPhaseId: context.phase.phaseId,
        currentTurnPhase: currentTurnPhase(context, state, lifetimeTarget.combatant),
        execution: context.execution,
        phaseExecutions: Object.fromEntries(
          input.reviewed.intent.frame.authority.snapshot.program?.phases.map(
            ({ phaseId: authoredPhaseId }) => [
              authoredPhaseId,
              context.root?.phaseState[authoredPhaseId]?.execution ?? 0,
            ]
          ) ?? []
        ),
        root: receipt.root,
        world: context.world,
      });
      const occurrenceOrdinal = rootOccurrenceOrdinal(context);
      if (!endRules || occurrenceOrdinal === null) {
        return rejected("unresolved-step", phaseId, step.stepId, "effect-occurrence");
      }
      const origin: ProgramStepOccurrenceOrigin = {
        execution: context.execution,
        kind: "program-step",
        phaseId: context.phase.phaseId,
        root: receipt.root,
        slot: cursor.nextSlot,
        stepId: step.stepId,
      };
      const lifecycleId = mechanicsProgramEffectOccurrenceId(origin);
      if (lifecycleId === null) {
        return rejected("unresolved-step", phaseId, step.stepId, "effect-occurrence");
      }
      const lifecycle: OccurrenceGenerationRef = {
        occurrence: {
          material: receipt.root.occurrence.material,
          occurrenceId: lifecycleId,
        },
        ordinal: occurrenceOrdinal,
      };
      if (step.kind === "entity-create") {
        const blueprint = conformNewMaterialEntity(
          blueprints?.entities[blueprintEntityKey(step.template)]
        );
        if (!blueprint) {
          return rejected("missing-compiler-fact", phaseId, step.stepId, "blueprint");
        }
        const controller =
          step.controller === null
            ? null
            : (resolveMechanicsProgramTargets(
                { kind: "role", role: step.controller },
                context
              )?.[0]?.binding ?? null);
        if (step.controller !== null && controller === null) {
          return rejected("unresolved-step", phaseId, step.stepId, "controller");
        }
        const entityOrdinal = documentAllocator(context, "nextEntityOrdinal");
        if (entityOrdinal === null) {
          return rejected("unresolved-step", phaseId, step.stepId, "entity-allocator");
        }
        const problem = project(
          {
            causeId: rootCause.causeId,
            endRules,
            entity: {
              entityId: `${step.entityKey}-${entityOrdinal}`,
              material: receipt.root.occurrence.material,
              ordinal: entityOrdinal,
            },
            kind: "entity-create",
            lifecycle,
            operationId: operationId(
              input,
              step.stepId,
              cursor.nextSlot,
              "entity-create"
            ),
            origin,
            parent: receipt.root,
            value: { ...structuredClone(blueprint), controller },
          },
          step.stepId
        );
        if (problem) return problem;
        return simulateStep(step.stepId);
      }
      const blueprint = conformNewInventoryInstance(blueprints?.items[step.itemId]);
      if (!blueprint) {
        return rejected("missing-compiler-fact", phaseId, step.stepId, "blueprint");
      }
      const quantity = evaluateIntegerExpression(step.quantity, context.bindings);
      if (quantity === null || quantity <= 0) {
        return rejected("unresolved-step", phaseId, step.stepId, "quantity");
      }
      const ownerEntity = resolveMechanicsProgramTargets(
        { kind: "role", role: step.owner },
        context
      )?.[0]?.binding;
      if (!ownerEntity || ownerEntity.material.kind !== "character-play") {
        return rejected("unresolved-step", phaseId, step.stepId, "owner");
      }
      const inventoryOrdinal = documentAllocator(context, "nextInventoryOrdinal");
      if (inventoryOrdinal === null) {
        return rejected("unresolved-step", phaseId, step.stepId, "inventory-allocator");
      }
      const instance = structuredClone(blueprint);
      const problem = project(
        {
          causeId: rootCause.causeId,
          endRules,
          instance: {
            ...instance,
            quantity: { ...instance.quantity, current: quantity },
          },
          item: {
            instanceId: `${step.instanceKey}-${inventoryOrdinal}`,
            instanceOrdinal: inventoryOrdinal,
            owner: ownerEntity.material,
          },
          kind: "inventory-create",
          lifecycle,
          operationId: operationId(
            input,
            step.stepId,
            cursor.nextSlot,
            "inventory-create"
          ),
          origin,
          parent: receipt.root,
        },
        step.stepId
      );
      if (problem) return problem;
      return simulateStep(step.stepId);
    }
    if (step.kind === "entity-change" || step.kind === "entity-end") {
      const identities = resolveMechanicsProgramTargets(step.target, context);
      if (!identities) {
        return rejected("unresolved-step", phaseId, step.stepId, "targets");
      }
      for (const identity of identities) {
        const target = identity.binding;
        if (target.entityId === "self" || target.ordinal === undefined) {
          return rejected("unresolved-step", phaseId, step.stepId, "wrong-target-kind");
        }
        if (step.kind === "entity-end") {
          const lifecycles = selectRootMaterialLifecycles(
            context.world,
            receipt.root,
            target
          );
          if (lifecycles.length > 0) {
            return suspend({ kind: "occurrence-end", occurrences: lifecycles });
          }
          continue;
        }
        const problem = project(
          {
            availability: step.availability,
            causeId: rootCause.causeId,
            kind: "entity-availability",
            operationId: operationId(
              input,
              step.stepId,
              identity.ordinal,
              "entity-availability"
            ),
            target: {
              entityId: target.entityId,
              material: target.material,
              ordinal: target.ordinal,
            },
          },
          step.stepId
        );
        if (problem) return problem;
      }
      return operations.length === 0
        ? cursorOnly(
            [],
            [
              {
                executions: [],
                operationIds: [],
                status: "compiled",
                stepId: step.stepId,
              },
            ]
          )
        : simulateStep(step.stepId);
    }
    if (step.kind === "inventory-change" || step.kind === "inventory-end") {
      const source = input.reviewed.intent.frame.authority.source;
      const answer =
        step.item.kind === "input" ? context.resolved[step.item.inputId] : null;
      const item =
        step.item.kind === "source-item"
          ? source.kind === "inventory-item"
            ? {
                instanceId: source.instanceId,
                instanceOrdinal: source.instanceOrdinal,
                owner: source.owner,
              }
            : null
          : answer?.kind === "item"
            ? {
                instanceId: answer.instanceId,
                instanceOrdinal: answer.instanceOrdinal,
                owner: answer.owner,
              }
            : null;
      if (!item) {
        return rejected("unresolved-step", phaseId, step.stepId, "item");
      }
      const copy = locateInventoryCopy(context.world, item);
      if (!copy) {
        return rejected("unresolved-step", phaseId, step.stepId, "missing-item");
      }
      const enchantmentBearer =
        copy.enchantment === null
          ? null
          : (copy.enchantment as Readonly<
              Extract<MechanicsOperation, { readonly kind: "inventory-end" }>
            >["enchantmentBearer"]);
      const problem = project(
        step.kind === "inventory-end"
          ? {
              causeId: rootCause.causeId,
              enchantmentBearer,
              item,
              kind: "inventory-end",
              operationId: operationId(input, step.stepId, 1, "inventory-end"),
            }
          : {
              causeId: rootCause.causeId,
              change: step.change,
              enchantmentBearer,
              item,
              kind: "inventory-transition",
              operationId: operationId(input, step.stepId, 1, "inventory-transition"),
            },
        step.stepId
      );
      if (problem) return problem;
      return simulateStep(step.stepId);
    }
    if (isVitalityStep(step)) {
      const slots = vitalitySlots(step, context, cursor.nextSlot);
      if (!slots) return rejected("unresolved-step", phaseId, step.stepId, "targets");
      const anchors = input.reviewed.intent.frame.authority.anchors;
      const guardSources = [...input.reviewed.intent.factGuards, ...input.facts];
      const vitalityId = (slot: number, kind: string): string =>
        operationId(input, step.stepId, slot, kind);
      for (const { identity, slot, target } of slots) {
        const located = locateVitalityTarget(context.world, target);
        if (!located) {
          return rejected("unresolved-step", phaseId, step.stepId, "missing-target");
        }
        const creature = vitalityTargetIsCreature(located);
        if (step.kind !== "damage" && step.kind !== "heal" && !creature) {
          return rejected("unresolved-step", phaseId, step.stepId, "wrong-target-kind");
        }
        if (step.kind === "damage") {
          const parts: { amount: number; damageType: string; partId: string }[] = [];
          for (const part of step.parts) {
            const amount = resolveMechanicsProgramAmount(part.amount, context, identity);
            if (amount === null) {
              return rejected("unresolved-step", phaseId, step.stepId, "amount");
            }
            if (amount > 0) {
              parts.push({ amount, damageType: part.damageType, partId: part.partId });
            }
          }
          if (parts.length === 0) continue;
          const profile = effectiveVitalityDefenseProfile(context.world, target, located);
          if (!profile) {
            return rejected("unresolved-step", phaseId, step.stepId, "defense-profile");
          }
          const packet = {
            delivery: step.delivery,
            packetId: vitalityId(slot, "damage-packet"),
            parts,
            target,
            traits: [...step.traits],
          };
          const allocations: Readonly<DamageAllocationObservation>[] = [];
          let resolution = resolveDamage(packet, profile, allocations);
          for (
            let remaining = step.parts.length + 1;
            resolution?.kind === "review-required" && remaining > 0;
            remaining -= 1
          ) {
            const request = freezeDeep({
              kind: "damage-allocation" as const,
              requestId: canonicalFingerprint({
                kind: "damage-allocation",
                packetId: packet.packetId,
                requirement: resolution.requirement,
              }),
              requirement: structuredClone(resolution.requirement),
            });
            const response = responsePool.get(request.requestId);
            if (!response || response.kind !== "damage-allocation") {
              return freezeDeep({
                continuation: compilerContinuation(input, cursor, request),
                request,
                segment: null,
                status: "needs-response" as const,
              });
            }
            responsePool.delete(request.requestId);
            allocations.push(response.observation);
            resolution = resolveDamage(packet, profile, allocations);
          }
          if (!resolution || resolution.kind !== "resolved") {
            return rejected("unresolved-step", phaseId, step.stepId, "damage");
          }
          const maximumValue = guardedMaximumHitPoints(guardSources, target);
          const maximumHitPoints =
            maximumValue !== null
              ? ({ kind: "fact", value: maximumValue } as const)
              : materialMaximumHitPoints(located) !== null
                ? ({ kind: "material" } as const)
                : null;
          if (!maximumHitPoints) {
            return rejected(
              "missing-compiler-fact",
              phaseId,
              step.stepId,
              "hit-point-maximum"
            );
          }
          const common = {
            attacker: anchors.source,
            causeId: rootCause.causeId,
            criticalHit: false,
            damage: resolution.resolution,
            maximumHitPoints,
          } as const;
          const problem = project(
            creature
              ? {
                  ...common,
                  kind: "creature-damage",
                  operationId: vitalityId(slot, "creature-damage"),
                  zeroHitPointsPolicy: located.kind === "character" ? "dying" : "dead",
                }
              : {
                  ...common,
                  kind: "object-damage",
                  operationId: vitalityId(slot, "object-damage"),
                },
            step.stepId
          );
          if (problem) return problem;
          continue;
        }
        if (step.kind === "heal") {
          const amount = resolveMechanicsProgramAmount(step.amount, context, identity);
          if (amount === null) {
            return rejected("unresolved-step", phaseId, step.stepId, "amount");
          }
          if (amount <= 0) continue;
          const guarded = guardedMaximumHitPoints(guardSources, target);
          const material = materialMaximumHitPoints(located);
          const maximumHitPoints = guarded ?? material;
          if (maximumHitPoints === null) {
            return rejected(
              "missing-compiler-fact",
              phaseId,
              step.stepId,
              "hit-point-maximum"
            );
          }
          const source =
            guarded !== null
              ? ({ kind: "fact" } as const)
              : ({ kind: "material" } as const);
          const problem = project(
            creature
              ? {
                  causeId: rootCause.causeId,
                  input: { amount, maximumHitPoints },
                  kind: "creature-healing",
                  maximumHitPointsSource: source,
                  operationId: vitalityId(slot, "creature-healing"),
                  target,
                }
              : {
                  causeId: rootCause.causeId,
                  input: { amount, maximumHitPoints },
                  kind: "object-repair",
                  maximumHitPointsSource: source,
                  operationId: vitalityId(slot, "object-repair"),
                  target,
                },
            step.stepId
          );
          if (problem) return problem;
          continue;
        }
        if (step.kind === "temporary-hit-points") {
          const amount = resolveMechanicsProgramAmount(step.amount, context, identity);
          if (amount === null) {
            return rejected("unresolved-step", phaseId, step.stepId, "amount");
          }
          if (amount <= 0) continue;
          const lifetimeTarget = lifetimeCombatant(step.lifetime, context);
          if (!lifetimeTarget.ok) {
            return rejected(
              "unresolved-step",
              phaseId,
              step.stepId,
              "lifetime-combatant"
            );
          }
          const authoredRules = resolveMechanicsLifetime(step.lifetime, {
            bindings: context.bindings,
            combatant: lifetimeTarget.combatant,
            currentPhaseId: context.phase.phaseId,
            currentTurnPhase: currentTurnPhase(context, state, lifetimeTarget.combatant),
            execution: context.execution,
            phaseExecutions: Object.fromEntries(
              input.reviewed.intent.frame.authority.snapshot.program?.phases.map(
                ({ phaseId: authoredPhaseId }) => [
                  authoredPhaseId,
                  context.root?.phaseState[authoredPhaseId]?.execution ?? 0,
                ]
              ) ?? []
            ),
            root: receipt.root,
            world: context.world,
          });
          const ordinal = rootOccurrenceOrdinal(context);
          if (!authoredRules || ordinal === null) {
            return rejected("unresolved-step", phaseId, step.stepId, "effect-occurrence");
          }
          const origin: ProgramStepOccurrenceOrigin = {
            execution: context.execution,
            kind: "program-step",
            phaseId: context.phase.phaseId,
            root: receipt.root,
            slot,
            stepId: step.stepId,
          };
          const occurrenceId = mechanicsProgramEffectOccurrenceId(origin);
          if (occurrenceId === null) {
            return rejected("unresolved-step", phaseId, step.stepId, "effect-occurrence");
          }
          const created: OccurrenceGenerationRef = {
            occurrence: { material: receipt.root.occurrence.material, occurrenceId },
            ordinal,
          };
          const problem = project(
            {
              causeId: rootCause.causeId,
              conditionImmunityOverride: null,
              created,
              kind: "occurrence-create",
              occurrence: {
                endRules: [...authoredRules, { kind: "temporary-hp-empty" }],
                fact: { factId: step.stepId, kind: "program-fact", value: true },
                kind: "standing",
                origin,
                parentId: receipt.root.occurrence.occurrenceId,
                target,
              },
              operationId: vitalityId(slot, "occurrence-create"),
              parent: receipt.root,
            },
            step.stepId
          );
          if (problem) return problem;
          const grantProblem = project(
            {
              causeId: rootCause.causeId,
              grant: {
                amount,
                decision: step.decision,
                sourceOccurrence: created,
              },
              kind: "temporary-hit-points-grant",
              operationId: vitalityId(slot, "temporary-hit-points-grant"),
              target,
            },
            step.stepId
          );
          if (grantProblem) return grantProblem;
          continue;
        }
        if (step.kind === "clear-temporary-hit-points") {
          if (step.source === "all") {
            const problem = project(
              {
                causeId: rootCause.causeId,
                clear: { kind: "all" },
                kind: "temporary-hit-points-clear",
                operationId: vitalityId(slot, "temporary-hit-points-clear"),
                target,
              },
              step.stepId
            );
            if (problem) return problem;
            continue;
          }
          const sources = selectRootTemporaryHitPointSources(
            context.world,
            receipt.root,
            target
          );
          for (const [index, sourceOccurrence] of sources.entries()) {
            const problem = project(
              {
                causeId: rootCause.causeId,
                clear: { kind: "source", sourceOccurrence },
                kind: "temporary-hit-points-clear",
                operationId: vitalityId(slot, `temporary-hit-points-clear-${index + 1}`),
                target,
              },
              step.stepId
            );
            if (problem) return problem;
          }
          continue;
        }
        if (step.kind === "exhaustion-change") {
          const amount = evaluateIntegerExpression(step.amount, context.bindings);
          if (amount === null) {
            return rejected("unresolved-step", phaseId, step.stepId, "amount");
          }
          if (amount <= 0) continue;
          const problem = project(
            {
              causeId: rootCause.causeId,
              kind: "exhaustion-transition",
              operationId: vitalityId(slot, "exhaustion-transition"),
              target,
              transition: {
                amount,
                kind: step.operation === "gain" ? "gain" : "remove",
              },
            },
            step.stepId
          );
          if (problem) return problem;
          continue;
        }
        const problem = project(
          step.kind === "stabilize"
            ? {
                causeId: rootCause.causeId,
                kind: "creature-stabilize",
                operationId: vitalityId(slot, "creature-stabilize"),
                target,
              }
            : {
                causeId: rootCause.causeId,
                kind: "creature-kill",
                operationId: vitalityId(slot, "creature-kill"),
                target,
              },
          step.stepId
        );
        if (problem) return problem;
      }
      return operations.length === 0
        ? cursorOnly(
            [],
            [
              {
                executions: [],
                operationIds: [],
                status: "compiled",
                stepId: step.stepId,
              },
            ]
          )
        : simulateStep(step.stepId);
    }
    if (step.kind !== "register") {
      return rejected("unsupported-step", phaseId, step.stepId, step.kind);
    }
    const operation = registerOperation(input, context, step, rootCause, cursor.nextSlot);
    if (!operation) return rejected("unresolved-step", phaseId, step.stepId);
    const problem = project(operation, step.stepId);
    if (problem) return problem;
    return simulateStep(step.stepId);
  }
}
