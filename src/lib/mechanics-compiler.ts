/** The single MechanicsProgram → ordered physical transaction compiler. */

import { materialRefKey } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import { deriveMechanicsPostEvents } from "@/lib/mechanics-execution";
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
  refreshMechanicsProgramCompilationContext,
  resolveMechanicsProgramTargets,
} from "@/lib/mechanics-program";
import {
  entityRefKey,
  occurrenceGenerationRefKey,
} from "@/lib/mechanics-reference-schema";
import type {
  CompileMechanicsFrameInput,
  MechanicsCompiledStepTrace,
  MechanicsFrameCompileRejection,
  MechanicsFrameCompileResult,
} from "@/types/mechanics-compiler";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
  MechanicsTransaction,
  MechanicsTransactionProjectionResult,
  MechanicsTransactionSimulationResult,
} from "@/types/mechanics-operation";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  NewMechanicOccurrence,
  ProgramStepOccurrenceOrigin,
  StandingFact,
} from "@/types/mechanic-occurrence";
import type {
  ManualInstruction,
  MechanicsProgramCompilationContext,
  ResolvedMechanicsAnswer,
} from "@/types/mechanics-program";
import type { MechanicsStep } from "@/types/mechanics-program-authoring";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type { MechanicsCausalState } from "@/types/mechanics-world";

const MAX_COMPILED_OPERATIONS = 2_048;

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
  context: Readonly<MechanicsProgramCompilationContext>
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
    const slot = mechanicsProgramExpansionSlot(index);
    const fact = facts[index];
    if (slot === null || fact === undefined) return null;
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
  step: Readonly<EffectStartStep>,
  context: Readonly<MechanicsProgramCompilationContext>
): { readonly combatant: Readonly<EntityRef> | null; readonly ok: boolean } {
  const lifetime = step.lifetime;
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
): MechanicsFrameCompileResult | null {
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
  return freezeDeep({
    coordination:
      step.kind === "concentration"
        ? { kind: "concentration-replacement" as const, occurrences }
        : { kind: "occurrence-end" as const, occurrences },
    status: "needs-coordination" as const,
  });
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
  cause: Readonly<MechanicsOperationCause>
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
    operationId: operationId(input, step.stepId, 1, "program-register-transition"),
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

function phaseOperation(
  input: Readonly<CompileMechanicsFrameInput>,
  context: Readonly<MechanicsProgramCompilationContext>,
  cause: Readonly<MechanicsOperationCause>
): Readonly<Extract<MechanicsOperation, { readonly kind: "program-state-transition" }>> {
  const receipt = input.reviewed.intent.frame.rootReceipt;
  const registers =
    context.root?.registers ??
    Object.fromEntries(
      input.reviewed.intent.frame.authority.snapshot.program?.registers.map(
        ({ initial, registerId }) => [registerId, initial]
      ) ?? []
    );
  return {
    causeId: cause.causeId,
    expectedRegisters: receipt.kind === "create" ? null : registers,
    kind: "program-state-transition",
    nextRegisters: registers,
    operationId: operationId(input, receipt.next.phaseId, 1, "program-state-transition"),
    receipt,
  };
}

function projectionProblem(
  result: Exclude<MechanicsTransactionProjectionResult, { readonly status: "projected" }>,
  phaseId: string,
  stepId: string | null
): MechanicsFrameCompileResult {
  if (result.status === "needs-boundary") {
    return freezeDeep({
      coordination: { boundary: result.boundary, kind: "boundary" as const },
      status: "needs-coordination" as const,
    });
  }
  if (result.status === "needs-observation") {
    return freezeDeep({
      request: {
        boundary: result.boundary,
        kind: "resource-observation" as const,
        requestId: canonicalFingerprint({
          boundary: result.boundary,
          operationId: result.operationId,
          requirement: result.requirement,
        }),
        requirement: result.requirement,
      },
      status: "needs-response" as const,
    });
  }
  return rejected("kernel-rejected", phaseId, stepId, result.reason, result.operationId);
}

function finalProblem(
  result: Exclude<
    MechanicsTransactionSimulationResult,
    { readonly status: "simulated" | "no-change" }
  >,
  phaseId: string
): MechanicsFrameCompileResult {
  if (result.status === "needs-boundary") {
    return freezeDeep({
      coordination: { boundary: result.boundary, kind: "boundary" as const },
      status: "needs-coordination" as const,
    });
  }
  if (result.status === "needs-observation") {
    return freezeDeep({
      request: {
        boundary: result.boundary,
        kind: "resource-observation" as const,
        requestId: canonicalFingerprint({
          boundary: result.boundary,
          operationId: result.operationId,
          requirement: result.requirement,
        }),
        requirement: result.requirement,
      },
      status: "needs-response" as const,
    });
  }
  return rejected("kernel-rejected", phaseId, null, result.reason, result.operationId);
}

/** Compile one already-reviewed frame; no store, locale, persistence or UI is consulted. */
export function compileMechanicsFrame(
  input: Readonly<CompileMechanicsFrameInput>
): Readonly<MechanicsFrameCompileResult> {
  const phaseId = input.reviewed.intent.frame.rootReceipt.next.phaseId;
  const preparation = prepareMechanicsProgramCompilation(input.reviewed, input.state);
  if (preparation.status === "replay") return freezeDeep({ status: "replay" });
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
  if (input.responses.length > 0) {
    return rejected("invalid-response", phaseId, null, "unused-response");
  }
  if (hasReviewedPayments(input.reviewed.resolved)) {
    return rejected("unsupported-step", phaseId, null, "reviewed-payment");
  }

  const authority: Readonly<MechanicsProgramAuthorityReceipt> =
    input.reviewed.intent.frame.authority;
  const receipt = input.reviewed.intent.frame.rootReceipt;
  const installedCause: MechanicsOperationCause = {
    causeId: canonicalFingerprint({
      authority,
      invocation: input.reviewed.intent.frame.invocation,
    }),
    invocation: input.reviewed.intent.frame.invocation,
  };
  const rootInvocation = { kind: "program-root", occurrence: receipt.root } as const;
  const rootCause: MechanicsOperationCause = {
    causeId: canonicalFingerprint({ authority, invocation: rootInvocation }),
    invocation: rootInvocation,
  };
  const causes = new Map(
    [installedCause, rootCause].map((cause) => [cause.causeId, cause] as const)
  );
  const operations: Readonly<MechanicsOperation>[] = [];
  const manual: Readonly<ManualInstruction>[] = [];
  const trace: MechanicsCompiledStepTrace[] = [];
  let context = preparation.context;
  const state = preparation.state;

  const project = (
    operation: Readonly<MechanicsOperation>,
    stepId: string | null
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
      return projectionProblem(result, phaseId, stepId);
    }
    const refreshed = refreshMechanicsProgramCompilationContext(
      input.reviewed,
      result.world,
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

  if (receipt.kind === "create") {
    const problem = project(phaseOperation(input, context, installedCause), null);
    if (problem) return problem;
  }

  for (const step of context.phase.steps) {
    const active = mechanicsProgramStepIsActive(step, context);
    if (active === null) {
      return rejected("unresolved-predicate", phaseId, step.stepId);
    }
    if (!active) {
      trace.push({
        executions: [],
        operationIds: [],
        status: "omitted",
        stepId: step.stepId,
      });
      continue;
    }
    if (step.kind === "manual-relocation" || step.kind === "manual-table") {
      const instruction = manualInstruction(step, context);
      if (!instruction) return rejected("unresolved-step", phaseId, step.stepId);
      manual.push(instruction);
      trace.push({
        executions: [],
        operationIds: [],
        status: "manual",
        stepId: step.stepId,
      });
      continue;
    }
    if (step.kind === "occurrence-end") {
      const occurrences = selectActiveProgramStepChildren(
        context.world,
        receipt.root,
        step.childStepId
      );
      if (occurrences.length > 0) {
        return freezeDeep({
          coordination: { kind: "occurrence-end" as const, occurrences },
          status: "needs-coordination" as const,
        });
      }
      trace.push({
        executions: [],
        operationIds: [],
        status: "compiled",
        stepId: step.stepId,
      });
      continue;
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
        return freezeDeep({
          coordination: { kind: "occurrence-end" as const, occurrences },
          status: "needs-coordination" as const,
        });
      }
      trace.push({
        executions: [],
        operationIds: [],
        status: "compiled",
        stepId: step.stepId,
      });
      continue;
    }
    if (isEffectStartStep(step)) {
      const slots = effectSlots(step, context);
      if (!slots) return rejected("unresolved-step", phaseId, step.stepId, "targets");
      if (
        step.kind !== "standing" &&
        !slots.every(({ target }) => effectTargetIsCreature(context.world, target))
      ) {
        return rejected("unresolved-step", phaseId, step.stepId, "wrong-target-kind");
      }
      const lifetimeTarget = lifetimeCombatant(step, context);
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
      if (coordination) return coordination;
      const operationIds: string[] = [];
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
        operationIds.push(id);
      }
      trace.push({
        executions: [],
        operationIds,
        status: "compiled",
        stepId: step.stepId,
      });
      continue;
    }
    if (step.kind !== "register") {
      return rejected("unsupported-step", phaseId, step.stepId, step.kind);
    }
    const operation = registerOperation(input, context, step, rootCause);
    if (!operation) return rejected("unresolved-step", phaseId, step.stepId);
    const problem = project(operation, step.stepId);
    if (problem) return problem;
    trace.push({
      executions: [],
      operationIds: [operation.operationId],
      status: "compiled",
      stepId: step.stepId,
    });
  }

  if (receipt.kind === "advance") {
    const problem = project(phaseOperation(input, context, rootCause), null);
    if (problem) return problem;
  }
  const transaction = transactionFor(input, operations, causes);
  if (!transaction) return rejected("kernel-rejected", phaseId, null);
  const simulation = simulateMechanicsTransaction(transaction, {
    authoritySnapshot: input.authoritySnapshot,
    state,
  });
  if (simulation.status !== "simulated" && simulation.status !== "no-change") {
    return finalProblem(simulation, phaseId);
  }
  const executionById = new Map(
    simulation.executions.map((execution) => [execution.operationId, execution] as const)
  );
  const completeTrace = trace.map((entry) => ({
    ...entry,
    executions: entry.operationIds.flatMap((id) => {
      const execution = executionById.get(id);
      return execution ? [execution] : [];
    }),
  }));
  return freezeDeep({
    events: deriveMechanicsPostEvents(simulation.stages),
    manual,
    simulation,
    status: "compiled" as const,
    trace: completeTrace,
    transaction,
  });
}
