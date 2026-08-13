/** The single MechanicsProgram → ordered physical transaction compiler. */

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import {
  projectMechanicsTransaction,
  simulateMechanicsTransaction,
} from "@/lib/mechanics-operation";
import {
  mechanicsProgramStepIsActive,
  prepareMechanicsProgramCompilation,
  refreshMechanicsProgramCompilationContext,
  resolveMechanicsProgramTargets,
} from "@/lib/mechanics-program";
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
  ManualInstruction,
  MechanicsProgramCompilationContext,
  ResolvedMechanicsAnswer,
} from "@/types/mechanics-program";
import type { MechanicsStep } from "@/types/mechanics-program-authoring";

const MAX_COMPILED_OPERATIONS = 2_048;

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
  const preparation = prepareMechanicsProgramCompilation(
    input.reviewed,
    input.state.world
  );
  if (preparation.status === "replay") return freezeDeep({ status: "replay" });
  if (preparation.status === "rejected") {
    return rejected(
      "invalid-reviewed-intent",
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
      state: input.state,
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
    state: input.state,
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
    manual,
    simulation,
    status: "compiled" as const,
    trace: completeTrace,
    transaction,
  });
}
