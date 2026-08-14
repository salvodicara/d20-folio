/**
 * The bounded depth-first causal fixed-point coordinator.
 *
 * One call runs one complete causal action: root intent review, root creation,
 * the LIFO pending-frame compile loop, frozen event audiences, subscriber
 * dispatch, readable end waves, boundary checkpoints and exactly one final
 * journal draft. Resumption is replay: the caller re-invokes with the same
 * intent/state and extended answer/response ledgers; the deterministic run
 * reaches the same suspension and consumes the new entries. No coordinator
 * state is serialized, and every capability it consumes is process-local.
 */

import { canonicalFingerprint, canonicalJson } from "@/lib/canonical-fingerprint";
import { planMechanicsWorldAction } from "@/lib/mechanics-action";
import { conformMechanicsExecutionFrame } from "@/lib/mechanics-command-boundary";
import { compileMechanicsFrame } from "@/lib/mechanics-compiler";
import { resolveMechanicsLifetime } from "@/lib/mechanics-program-effects";
import { deriveMechanicsSourceEndingEvents } from "@/lib/mechanics-execution";
import { simulateMechanicsTransaction } from "@/lib/mechanics-operation";
import {
  dispatchMechanicsEventSubscriber,
  reviewMechanicsIntent,
  selectMechanicsEventSubscribers,
} from "@/lib/mechanics-program";
import {
  advanceMechanicsBoundary,
  beginMechanicsBoundaryFromCausalState,
  completeMechanicsBoundaryCheckpoint,
  conformMechanicsCausalState,
  finalizeMechanicsCausalEndWave,
  finalizeMechanicsCausalMaterialCleanup,
  popMechanicsPendingFrame,
  pushMechanicsPendingFrame,
  rebaseMechanicsCausalState,
  topMechanicsPendingFrame,
} from "@/lib/mechanics-world";
import type { ActionFactGuard } from "@/types/action-journal";
import type {
  MechanicsCompilerContinuation,
  MechanicsCompilerResponse,
} from "@/types/mechanics-compiler";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";
import type {
  MechanicsCoordinationFrameRef,
  MechanicsCoordinationInput,
  MechanicsCoordinationRejection,
  MechanicsCoordinationResult,
  MechanicsCoordinationTraceEntry,
} from "@/types/mechanics-coordinator";
import type { MechanicsSubscriberSelection } from "@/types/mechanics-execution";
import type { MechanicsAnswer, ReviewedMechanicsIntent } from "@/types/mechanics-program";
import type {
  MechanicsOperationCause,
  MechanicsTransaction,
} from "@/types/mechanics-operation";
import type { OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type { MechanicsCausalState } from "@/types/mechanics-world";

const DEFAULT_WORK_BUDGET = 2_048;

interface FrameRecord {
  chain: {
    readonly continuation: Readonly<MechanicsCompilerContinuation>;
    readonly responses: readonly Readonly<MechanicsCompilerResponse>[];
  } | null;
  /** Root ends deferred by `end-program` segments to this frame's phase CAS. */
  endRequests: readonly Readonly<OccurrenceGenerationRef>[];
  readonly reviewed: Readonly<ReviewedMechanicsIntent>;
}

interface AudienceEntry {
  /** Pending-frame depth at which this audience's members may dispatch. */
  readonly baselineDepth: number;
  next: number;
  readonly selections: readonly Readonly<MechanicsSubscriberSelection>[];
}

interface DriveContext {
  readonly audiences: AudienceEntry[];
  /** Frames below or at this depth belong to an outer scope and never compile here. */
  readonly baselineDepth: number;
  readonly deliveredWaves: Set<string>;
  /** Action mode finalizes delivered waves; checkpoint mode leaves them latched. */
  readonly finalizeWaves: boolean;
  state: Readonly<MechanicsCausalState>;
}

function freezeDeep<T>(value: T): Readonly<T> {
  const visited = new WeakSet<object>();
  const visit = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || visited.has(entry)) return;
    visited.add(entry);
    Object.values(entry).forEach(visit);
    if (!Object.isFrozen(entry)) Object.freeze(entry);
  };
  visit(value);
  return value;
}

function frameRef(
  frame: Readonly<MechanicsExecutionFrame>
): Readonly<MechanicsCoordinationFrameRef> {
  return freezeDeep({
    execution: frame.rootReceipt.next.execution,
    phaseId: frame.rootReceipt.next.phaseId,
    root: structuredClone(frame.rootReceipt.root),
    triggerEventId: frame.rootReceipt.next.triggerEventId,
  });
}

function rejectedResult(
  reason: MechanicsCoordinationRejection,
  frame: Readonly<MechanicsCoordinationFrameRef> | null = null,
  detail: string | null = null
): Readonly<MechanicsCoordinationResult> {
  return freezeDeep({ detail, frame, reason, status: "rejected" as const });
}

const INPUT_KEYS = [
  "answers",
  "authoritySnapshot",
  "facts",
  "frameAnswers",
  "intent",
  "responses",
  "state",
  "turnEconomy",
] as const;

function isExactInput(value: unknown): value is Readonly<MechanicsCoordinationInput> {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  return (
    INPUT_KEYS.every((key) => keys.includes(key)) &&
    keys.every(
      (key) => key === "workBudget" || (INPUT_KEYS as readonly string[]).includes(key)
    )
  );
}

/** Run one complete causal action to its bounded fixed point. */
export function runMechanicsCausalAction(
  inputValue: unknown
): Readonly<MechanicsCoordinationResult> {
  if (!isExactInput(inputValue)) return rejectedResult("invalid-input");
  const input = inputValue;
  const conformed = conformMechanicsCausalState(input.state);
  if (!conformed.ok) return rejectedResult("invalid-state");
  if (conformed.value.context.pendingFrames.length !== 0) {
    return rejectedResult("invalid-state", null, "pending-frames");
  }
  const entryState = conformed.value;
  const budgetInput = input.workBudget;
  let budget =
    typeof budgetInput === "number" &&
    Number.isSafeInteger(budgetInput) &&
    budgetInput > 0
      ? Math.min(budgetInput, DEFAULT_WORK_BUDGET)
      : DEFAULT_WORK_BUDGET;

  const answersByFrame = new Map<string, readonly Readonly<MechanicsAnswer>[]>();
  for (const entry of input.frameAnswers) {
    answersByFrame.set(canonicalFingerprint(entry.frame), entry.answers);
  }
  const responsesById = new Map<string, Readonly<MechanicsCompilerResponse>>();
  for (const response of input.responses) {
    if (responsesById.has(response.requestId)) {
      return rejectedResult("invalid-input", null, "duplicate-response");
    }
    responsesById.set(response.requestId, response);
  }

  const frameRecords = new Map<string, FrameRecord>();
  const trace: Readonly<MechanicsCoordinationTraceEntry>[] = [];
  const actionFacts = new Map<string, Readonly<ActionFactGuard>>();
  for (const fact of input.facts) actionFacts.set(canonicalJson(fact), fact);
  const sourceEndOperationId = canonicalFingerprint({
    actionId: input.intent.actionId,
    purpose: "source-ending-delivery",
  });
  const frameKey = (frame: Readonly<MechanicsExecutionFrame>): string =>
    canonicalFingerprint(frameRef(frame));

  // A CREATE root reviews against the closed entry basis before any push. A
  // non-create root (a pulse advance) is admissible only as the pending TOP,
  // so its frame pushes FIRST and the review runs on that pushed basis — the
  // reviewed frame must then equal the pushed frame under the canonical form.
  const preFrame = conformMechanicsExecutionFrame(input.intent.frame);
  if (!preFrame) return rejectedResult("invalid-intent");

  let state: Readonly<MechanicsCausalState> = entryState;
  if (preFrame.rootReceipt.kind !== "create") {
    const prePushed = pushMechanicsPendingFrame(entryState, preFrame);
    if (!prePushed.ok) {
      return rejectedResult("invalid-state", frameRef(preFrame), prePushed.reason);
    }
    state = prePushed.value;
  }
  const rootReview = reviewMechanicsIntent(input.intent, input.answers, state);
  if (rootReview.status !== "reviewed") {
    return rootReview.requirement !== null
      ? freezeDeep({
          frame: null,
          requirement: rootReview.requirement,
          status: "needs-answer" as const,
        })
      : rejectedResult(rootReview.reason, null, rootReview.referenceId);
  }
  const rootFrame = rootReview.reviewed.intent.frame;
  if (canonicalFingerprint(rootFrame) !== canonicalFingerprint(preFrame)) {
    return rejectedResult("invalid-intent", frameRef(preFrame), "frame-drift");
  }

  if (rootFrame.rootReceipt.kind === "create") {
    const program = rootFrame.authority.snapshot.program;
    const rootEndRules = (program?.lifetime ?? []).flatMap((spec) => {
      const resolved = resolveMechanicsLifetime(spec, {
        bindings: rootFrame.authority.staticBindings,
        combatant:
          spec.kind === "rest-completed" || spec.kind === "turn-boundary"
            ? rootFrame.authority.anchors[
                spec.combatant === "owner"
                  ? "owner"
                  : spec.combatant === "caster"
                    ? "caster"
                    : spec.combatant === "activator"
                      ? "activator"
                      : spec.combatant === "source"
                        ? "source"
                        : "target"
              ]
            : null,
        currentPhaseId: rootFrame.rootReceipt.next.phaseId,
        currentTurnPhase: "active",
        execution: rootFrame.rootReceipt.next.execution,
        phaseExecutions: Object.fromEntries(
          program?.phases.map(({ phaseId }) => [phaseId, 0]) ?? []
        ),
        root: rootFrame.rootReceipt.root,
        world: entryState.world,
      });
      return resolved ?? [null];
    });
    if (rootEndRules.some((rule) => rule === null)) {
      return rejectedResult("root-create-rejected", frameRef(rootFrame), "root-lifetime");
    }
    const cause: MechanicsOperationCause = {
      causeId: canonicalFingerprint({
        authority: rootFrame.authority,
        invocation: rootFrame.invocation,
      }),
      invocation: rootFrame.invocation,
    };
    const transaction: MechanicsTransaction = {
      actionId: rootReview.reviewed.intent.actionId,
      actor: rootFrame.authority.installation.owner,
      causes: [cause],
      factGuards: [],
      operations: [
        {
          causeId: cause.causeId,
          endRules: rootEndRules.filter((rule) => rule !== null),
          kind: "program-root-create",
          materialEpoch: rootFrame.rootReceipt.materialEpoch,
          operationId: `root-create:${canonicalFingerprint(rootFrame.rootReceipt)}`,
          root: rootFrame.rootReceipt.root,
        },
      ],
    };
    const created = simulateMechanicsTransaction(transaction, {
      authoritySnapshot: input.authoritySnapshot,
      state,
    });
    if (created.status !== "simulated" && created.status !== "no-change") {
      return rejectedResult(
        "root-create-rejected",
        frameRef(rootFrame),
        created.status === "rejected" ? created.reason : created.status
      );
    }
    state = created.state;
  }
  if (rootFrame.rootReceipt.kind === "create") {
    const pushed = pushMechanicsPendingFrame(state, rootFrame);
    if (!pushed.ok) {
      return rejectedResult("invalid-state", frameRef(rootFrame), pushed.reason);
    }
    state = pushed.value;
  }
  frameRecords.set(frameKey(rootFrame), {
    chain: null,
    endRequests: [],
    reviewed: rootReview.reviewed,
  });

  /** Select every emission's audience and push nonempty ones depth-first. */
  const enqueueAudiences = (
    target: DriveContext,
    emissions: readonly unknown[]
  ): Readonly<MechanicsCoordinationResult> | null => {
    const entries: AudienceEntry[] = [];
    for (const emission of emissions) {
      const audience = selectMechanicsEventSubscribers(emission);
      if (audience.status !== "selected") {
        return rejectedResult("dispatch-rejected", null, audience.reason);
      }
      if (audience.selections.length > 0) {
        entries.push({
          baselineDepth: target.state.context.pendingFrames.length,
          next: 0,
          selections: audience.selections,
        });
      }
    }
    for (const entry of entries.reverse()) target.audiences.push(entry);
    return null;
  };

  /** Dispatch one audience member; a stale subscriber is silently skipped. */
  const dispatchNext = (
    target: DriveContext,
    entry: AudienceEntry
  ): Readonly<MechanicsCoordinationResult> | null => {
    const selection = entry.selections[entry.next];
    entry.next += 1;
    if (!selection) return rejectedResult("dispatch-rejected", null, "missing-member");
    const dispatched = dispatchMechanicsEventSubscriber(selection, target.state);
    if (dispatched.status === "rejected") {
      return dispatched.reason === "stale-subscriber"
        ? null
        : rejectedResult("dispatch-rejected", null, dispatched.reason);
    }
    const ref = frameRef(dispatched.frame);
    const answers = answersByFrame.get(canonicalFingerprint(ref)) ?? [];
    const review = reviewMechanicsIntent(
      { actionId: input.intent.actionId, factGuards: [], frame: dispatched.frame },
      answers,
      dispatched.state
    );
    if (review.status !== "reviewed") {
      return review.requirement !== null
        ? freezeDeep({
            frame: ref,
            requirement: review.requirement,
            status: "needs-answer" as const,
          })
        : rejectedResult(review.reason, ref, review.referenceId);
    }
    frameRecords.set(frameKey(dispatched.frame), {
      chain: null,
      endRequests: [],
      reviewed: review.reviewed,
    });
    target.state = dispatched.state;
    return null;
  };

  /** Compile the LIFO top frame one segment forward. */
  const compileTop = (
    target: DriveContext
  ): Readonly<MechanicsCoordinationResult> | null => {
    const top = topMechanicsPendingFrame(target.state);
    if (!top) return rejectedResult("invalid-state", null, "missing-top");
    const record = frameRecords.get(frameKey(top.frame));
    if (!record) return rejectedResult("invalid-state", null, "unknown-frame");
    const ref = frameRef(top.frame);
    const result = compileMechanicsFrame({
      authoritySnapshot: input.authoritySnapshot,
      continuation: record.chain?.continuation ?? null,
      facts: input.facts,
      responses: record.chain?.responses ?? [],
      reviewed: record.reviewed,
      state: target.state,
      turnEconomy: input.turnEconomy,
    });
    if (result.status === "compiled") {
      record.chain = null;
      record.endRequests = [...record.endRequests, ...result.segment.endRequests];
      target.state = result.segment.state;
      if (result.segment.trace.length > 0 || result.segment.manual.length > 0) {
        trace.push(
          freezeDeep({
            frame: ref,
            manual: result.segment.manual,
            trace: result.segment.trace,
          })
        );
      }
      for (const fact of result.segment.actionFacts) {
        actionFacts.set(canonicalJson(fact), fact);
      }
      return enqueueAudiences(target, result.segment.emissions);
    }
    if (result.status === "needs-response") {
      const found = responsesById.get(result.request.requestId);
      if (!found) {
        return freezeDeep({
          frame: ref,
          request: result.request,
          status: "needs-response" as const,
        });
      }
      record.chain = {
        continuation: result.continuation,
        responses: [...(record.chain?.responses ?? []), found],
      };
      return null;
    }
    if (result.status === "needs-coordination") {
      if (result.coordination.kind === "boundary") {
        return runBoundary(target, result.coordination.boundary, ref);
      }
      const requested = rebaseMechanicsCausalState(
        target.state.world,
        target.state,
        [],
        result.coordination.occurrences
      );
      if (!requested.ok) {
        return rejectedResult("coordination-rejected", ref, requested.reason);
      }
      target.state = requested.value;
      return null;
    }
    return rejectedResult(result.reason, ref, result.referenceId);
  };

  /**
   * Deliver one readable wave's source endings exactly once per wave basis; a
   * delivered wave finalizes in action mode and stays latched in checkpoint
   * mode. Returns "delivered" only for a checkpoint-mode delivered wave.
   */
  const deliverOrFinalizeWave = (
    target: DriveContext
  ): Readonly<MechanicsCoordinationResult> | "delivered" | "progress" | null => {
    const endWave = target.state.context.endWave;
    if (endWave === null) return null;
    if (target.deliveredWaves.has(endWave.wave.basis)) {
      if (!target.finalizeWaves) return "delivered";
      const finalized = finalizeMechanicsCausalEndWave(target.state);
      if (!finalized.ok) {
        return rejectedResult("coordination-rejected", null, finalized.reason);
      }
      target.state = finalized.value;
      return "progress";
    }
    target.deliveredWaves.add(endWave.wave.basis);
    const derived = deriveMechanicsSourceEndingEvents(
      target.state.world,
      endWave.wave,
      sourceEndOperationId
    );
    if (derived.status !== "derived") {
      return rejectedResult("coordination-rejected", null, derived.reason);
    }
    return enqueueAudiences(target, derived.emissions) ?? "progress";
  };

  /**
   * The one depth-first drive loop. Action mode runs to the global fixed
   * point; checkpoint mode stops once the checkpoint's wave audience is fully
   * delivered and the frame stack is back at its baseline depth.
   */
  const drive = (target: DriveContext): Readonly<MechanicsCoordinationResult> | null => {
    for (;;) {
      if (budget <= 0) return rejectedResult("work-budget");
      budget -= 1;
      const depth = target.state.context.pendingFrames.length;
      const top = topMechanicsPendingFrame(target.state);
      if (top && depth > target.baselineDepth && top.cursor.stage === "phase-complete") {
        const record = frameRecords.get(frameKey(top.frame));
        const popped = popMechanicsPendingFrame(
          target.state,
          top.frame,
          record?.endRequests ?? []
        );
        if (!popped.ok) return rejectedResult("invalid-state", null, popped.reason);
        if (record) record.endRequests = [];
        target.state = popped.value;
        continue;
      }
      const audienceTop = target.audiences.at(-1);
      if (audienceTop) {
        if (depth > audienceTop.baselineDepth) {
          const problem = compileTop(target);
          if (problem) return problem;
          continue;
        }
        if (audienceTop.next >= audienceTop.selections.length) {
          target.audiences.pop();
          continue;
        }
        const problem = dispatchNext(target, audienceTop);
        if (problem) return problem;
        continue;
      }
      const wave = deliverOrFinalizeWave(target);
      if (wave === "delivered") return null;
      if (wave === "progress") continue;
      if (wave !== null) return wave;
      if (top && depth > target.baselineDepth) {
        const problem = compileTop(target);
        if (problem) return problem;
        continue;
      }
      return null;
    }
  };

  /** Run one complete-turn boundary, delivering every checkpoint's audience. */
  function runBoundary(
    target: DriveContext,
    command: unknown,
    ref: Readonly<MechanicsCoordinationFrameRef>
  ): Readonly<MechanicsCoordinationResult> | null {
    let result = beginMechanicsBoundaryFromCausalState(target.state, command);
    for (;;) {
      if (budget <= 0) return rejectedResult("work-budget");
      budget -= 1;
      if (result.status === "rejected") {
        return rejectedResult("boundary-rejected", ref, result.reason);
      }
      if (result.status === "complete") {
        target.state = result.state;
        return null;
      }
      const checkpoint: DriveContext = {
        audiences: [],
        baselineDepth: result.checkpoint.state.context.pendingFrames.length,
        deliveredWaves: new Set<string>(),
        finalizeWaves: false,
        state: result.checkpoint.state,
      };
      const problem = drive(checkpoint);
      if (problem) return problem;
      const completion = completeMechanicsBoundaryCheckpoint(
        result.continuation,
        checkpoint.state
      );
      if (!completion) return rejectedResult("boundary-rejected", ref);
      result = advanceMechanicsBoundary(result.continuation, completion);
    }
  }

  const context: DriveContext = {
    audiences: [],
    baselineDepth: 0,
    deliveredWaves: new Set<string>(),
    finalizeWaves: true,
    state,
  };
  const outcome = drive(context);
  if (outcome) return outcome;
  state = context.state;

  const cleaned = finalizeMechanicsCausalMaterialCleanup(state);
  if (!cleaned.ok) return rejectedResult("journal-rejected", null, cleaned.reason);
  state = cleaned.value;

  const planned = planMechanicsWorldAction(entryState.world, state.world, {
    actor: structuredClone(rootFrame.authority.installation.owner),
    facts: [...actionFacts.values()],
    id: input.intent.actionId,
  });
  if (planned.status === "rejected") {
    return rejectedResult("journal-rejected", null, planned.reason);
  }
  return freezeDeep({
    action: planned.status === "planned" ? planned.action : null,
    actionFacts: [...actionFacts.values()],
    state,
    status: "complete" as const,
    trace,
  });
}
