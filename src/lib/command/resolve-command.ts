import { decodeResolveCommandInput } from "@/lib/command/codec";
import {
  commandEventId,
  commandPatchId,
  commandReceiptId,
  externalRequestId,
  resolutionResultFingerprint,
} from "@/lib/command/identity";
import type {
  CommandEvent,
  CommandPatch,
  CommandReceipt,
  CommitResult,
  ExternalInputRequest,
  Preview,
  ResolutionOutcome,
  ResolvedFacts,
  RevisionChange,
  UseRuleCommand,
  UndoReceiptCommand,
  WorldState,
} from "@/types/command";
import type { ResourceSpendRuleDefinition } from "@/types/rule-definition";

function rejected(reason: Extract<ResolutionOutcome, { status: "rejected" }>["reason"]) {
  return { status: "rejected", reason } as const;
}

function selectedTargetRequest(
  command: UseRuleCommand,
  rule: ResourceSpendRuleDefinition
): Extract<ExternalInputRequest, { kind: "selected-targets" }> {
  if (rule.target.kind !== "selected-targets") {
    throw new TypeError("Selected target request requires a selected-target rule");
  }
  const draft = {
    kind: "selected-targets",
    requestId: `req:v1:${"0".repeat(64)}` as const,
    min: rule.target.min,
    max: rule.target.max,
    candidateIds: rule.target.candidateIds,
  } as const;
  return {
    ...draft,
    requestId: externalRequestId(
      {
        commandId: command.commandId,
        payloadFingerprint: command.payloadFingerprint,
        ruleId: command.ruleId,
        ruleVersion: command.ruleVersion,
        stateId: command.expectedRevision.stateId,
        expectedRevision: command.expectedRevision.revision,
      },
      draft
    ),
  };
}

function resolvedFacts(
  command: UseRuleCommand,
  world: WorldState,
  rule: ResourceSpendRuleDefinition
): ResolvedFacts & { readonly inversePatches: readonly CommandPatch[] } {
  const resource = world.resources.find(
    (candidate) => candidate.resourceId === rule.resourceId
  );
  if (resource === undefined)
    throw new TypeError("Resource must exist before resolution");
  const after = resource.current - rule.amount;
  const patchWithoutId = {
    schemaVersion: 1,
    kind: "set-resource",
    stateId: world.stateId,
    resourceId: rule.resourceId,
    before: resource.current,
    after,
  } as const;
  const patch: CommandPatch = {
    ...patchWithoutId,
    patchId: commandPatchId(command.commandId, 0, patchWithoutId),
  };
  const inverseWithoutId = {
    ...patchWithoutId,
    before: after,
    after: resource.current,
  };
  const inversePatch: CommandPatch = {
    ...inverseWithoutId,
    patchId: commandPatchId(command.commandId, 0, inverseWithoutId),
  };
  const eventWithoutId = {
    schemaVersion: 1,
    kind: "resource-spent",
    actorId: command.actorId,
    subjectId: command.subjectId,
    ruleId: command.ruleId,
    resourceId: rule.resourceId,
    amount: rule.amount,
  } as const;
  const event: CommandEvent = {
    ...eventWithoutId,
    eventId: commandEventId(command.commandId, 0, eventWithoutId),
  };
  const revisions: readonly RevisionChange[] = [
    { stateId: world.stateId, before: world.revision, after: world.revision + 1 },
  ];
  const facts = {
    commandId: command.commandId,
    payloadFingerprint: command.payloadFingerprint,
    patches: [patch],
    events: [event],
    revisions,
  } as const;
  return {
    ...facts,
    resultFingerprint: resolutionResultFingerprint(facts),
    inversePatches: [inversePatch],
  };
}

function commit(
  facts: ResolvedFacts & { readonly inversePatches: readonly CommandPatch[] }
): CommitResult {
  const receiptWithoutId = {
    schemaVersion: 1,
    commandId: facts.commandId,
    payloadFingerprint: facts.payloadFingerprint,
    resultFingerprint: facts.resultFingerprint,
    patches: facts.patches,
    events: facts.events,
    revisions: facts.revisions,
    inversePatches: facts.inversePatches,
  } as const;
  const receipt: CommandReceipt = {
    ...receiptWithoutId,
    receiptId: commandReceiptId(receiptWithoutId),
  };
  return {
    status: "committed",
    commandId: facts.commandId,
    payloadFingerprint: facts.payloadFingerprint,
    resultFingerprint: facts.resultFingerprint,
    patches: facts.patches,
    events: facts.events,
    revisions: facts.revisions,
    receipt,
  };
}

function replay(receipt: CommandReceipt): CommitResult {
  return {
    status: "committed",
    commandId: receipt.commandId,
    payloadFingerprint: receipt.payloadFingerprint,
    resultFingerprint: receipt.resultFingerprint,
    patches: receipt.patches,
    events: receipt.events,
    revisions: receipt.revisions,
    receipt,
  };
}

function undoFacts(
  command: UndoReceiptCommand,
  world: WorldState
): (ResolvedFacts & { readonly inversePatches: readonly CommandPatch[] }) | null {
  const source = command.receipt;
  if (source.revisions.length !== 1) return null;
  const sourceRevision = source.revisions[0];
  if (sourceRevision === undefined || sourceRevision.stateId !== world.stateId)
    return null;
  if (sourceRevision.after !== world.revision) return null;

  for (const inverse of source.inversePatches) {
    const resource = world.resources.find(
      (candidate) => candidate.resourceId === inverse.resourceId
    );
    if (
      inverse.stateId !== world.stateId ||
      resource === undefined ||
      resource.current !== inverse.before ||
      inverse.after > resource.maximum
    ) {
      return null;
    }
  }

  const patches = source.inversePatches.map((inverse, index): CommandPatch => {
    const projected = {
      schemaVersion: 1,
      kind: "set-resource",
      stateId: inverse.stateId,
      resourceId: inverse.resourceId,
      before: inverse.before,
      after: inverse.after,
    } as const;
    return { ...projected, patchId: commandPatchId(command.commandId, index, projected) };
  });
  const inversePatches = source.patches.map((forward, index): CommandPatch => {
    const projected = {
      schemaVersion: 1,
      kind: "set-resource",
      stateId: forward.stateId,
      resourceId: forward.resourceId,
      before: forward.before,
      after: forward.after,
    } as const;
    return { ...projected, patchId: commandPatchId(command.commandId, index, projected) };
  });
  const events = source.events.map((sourceEvent, index): CommandEvent => {
    const projected = {
      schemaVersion: 1,
      kind:
        sourceEvent.kind === "resource-spent"
          ? ("resource-restored" as const)
          : ("resource-spent" as const),
      actorId: command.actorId,
      subjectId: command.subjectId,
      ruleId: sourceEvent.ruleId,
      resourceId: sourceEvent.resourceId,
      amount: sourceEvent.amount,
    } as const;
    return { ...projected, eventId: commandEventId(command.commandId, index, projected) };
  });
  const revisions: readonly RevisionChange[] = [
    { stateId: world.stateId, before: world.revision, after: world.revision + 1 },
  ];
  const facts = {
    commandId: command.commandId,
    payloadFingerprint: command.payloadFingerprint,
    patches,
    events,
    revisions,
  } as const;
  return {
    ...facts,
    resultFingerprint: resolutionResultFingerprint(facts),
    inversePatches,
  };
}

export function resolveCommand(input: unknown): ResolutionOutcome {
  const decoded = decodeResolveCommandInput(input);
  if (!decoded.ok) return rejected(decoded.reason);
  const {
    command,
    externalAnswers,
    mode,
    priorReceipt,
    ruleDefinition: rule,
    world,
  } = decoded.value;

  if (priorReceipt !== null) {
    if (mode !== "commit" || priorReceipt.commandId !== command.commandId) {
      return rejected("invalid-receipt");
    }
    if (priorReceipt.payloadFingerprint !== command.payloadFingerprint) {
      return rejected("command-id-payload-mismatch");
    }
    return replay(priorReceipt);
  }
  if (command.expectedRevision.stateId !== world.stateId)
    return rejected("state-mismatch");
  if (command.expectedRevision.revision !== world.revision)
    return rejected("revision-mismatch");
  if (command.kind === "undo-receipt") {
    if (rule !== null || externalAnswers.values.length !== 0)
      return rejected("invalid-receipt");
    const facts = undoFacts(command, world);
    if (facts === null) return rejected("invalid-patch");
    if (mode === "commit") return commit(facts);
    return {
      status: "preview",
      commandId: facts.commandId,
      payloadFingerprint: facts.payloadFingerprint,
      resultFingerprint: facts.resultFingerprint,
      patches: facts.patches,
      events: facts.events,
      revisions: facts.revisions,
    };
  }
  if (rule === null) return rejected("unknown-rule-kind");
  if (rule.ruleId !== command.ruleId || rule.ruleVersion !== command.ruleVersion) {
    return rejected("rule-reference-mismatch");
  }
  const resource = world.resources.find(
    (candidate) => candidate.resourceId === rule.resourceId
  );
  if (resource === undefined) return rejected("resource-unavailable");
  if (resource.current < rule.amount) return rejected("insufficient-resource");

  if (rule.target.kind === "actor") {
    if (command.subjectId !== command.actorId) return rejected("illegal-target");
    if (externalAnswers.values.length !== 0) return rejected("answer-request-mismatch");
  } else {
    const request = selectedTargetRequest(command, rule);
    if (externalAnswers.values.length === 0) {
      return { status: "need-external-input", commandId: command.commandId, request };
    }
    if (externalAnswers.values.length !== 1) return rejected("invalid-external-answers");
    const answer = externalAnswers.values[0];
    if (answer?.kind !== "selected-targets" || answer.requestId !== request.requestId) {
      return rejected("answer-request-mismatch");
    }
    if (
      answer.targetIds.length < request.min ||
      answer.targetIds.length > request.max ||
      answer.targetIds.some((targetId) => !request.candidateIds.includes(targetId)) ||
      !answer.targetIds.includes(command.subjectId)
    ) {
      return rejected("illegal-target");
    }
  }

  const facts = resolvedFacts(command, world, rule);
  if (facts.patches.length === 0) return rejected("no-change");
  if (mode === "preview") {
    const preview: Preview = {
      status: "preview",
      commandId: facts.commandId,
      payloadFingerprint: facts.payloadFingerprint,
      resultFingerprint: facts.resultFingerprint,
      patches: facts.patches,
      events: facts.events,
      revisions: facts.revisions,
    };
    return preview;
  }
  return commit(facts);
}

export function retainCommandReceipts(
  receipts: readonly CommandReceipt[],
  maximum: number
): readonly CommandReceipt[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new RangeError("Invalid receipt bound");
  return Object.freeze(receipts.slice(-maximum));
}
