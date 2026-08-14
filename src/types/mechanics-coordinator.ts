/** Public contracts for the bounded depth-first causal fixed-point coordinator. */

import type { ActionFactGuard, JournalActionDraft } from "@/types/action-journal";
import type { MechanicsAuthoritySnapshot } from "@/types/mechanics-authority";
import type {
  MechanicsCompilerRequest,
  MechanicsCompilerResponse,
  MechanicsCompiledStepTrace,
} from "@/types/mechanics-compiler";
import type {
  ManualInstruction,
  MechanicsAnswer,
  MechanicsIntent,
  MechanicsRequirement,
  MechanicsReviewRejection,
} from "@/types/mechanics-program";
import type { OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type { MechanicsCausalState } from "@/types/mechanics-world";

/**
 * Deterministic identity of one execution frame inside one causal action:
 * the exact root generation plus the phase CAS target it advances to. Answer
 * and response ledgers address suspended work through this identity, so a
 * replayed run reaches the same frame and consumes the same entries.
 */
export interface MechanicsCoordinationFrameRef {
  readonly execution: number;
  readonly phaseId: string;
  readonly root: Readonly<OccurrenceGenerationRef>;
  readonly triggerEventId: string | null;
}

/** Review-level answers for one subscriber frame, addressed by its identity. */
export interface MechanicsCoordinationFrameAnswers {
  readonly answers: readonly Readonly<MechanicsAnswer>[];
  readonly frame: Readonly<MechanicsCoordinationFrameRef>;
}

/**
 * One complete causal action request. Resumption is replay: re-invoke with the
 * same intent/state and the ledgers extended by the newly collected entries —
 * the run is deterministic, so it reaches the same suspension and consumes the
 * new entry. No coordinator state is ever serialized or handed to the caller.
 */
export interface MechanicsCoordinationInput {
  readonly answers: readonly Readonly<MechanicsAnswer>[];
  readonly authoritySnapshot: Readonly<MechanicsAuthoritySnapshot>;
  readonly facts: readonly Readonly<ActionFactGuard>[];
  readonly frameAnswers: readonly Readonly<MechanicsCoordinationFrameAnswers>[];
  readonly intent: Readonly<MechanicsIntent>;
  readonly responses: readonly Readonly<MechanicsCompilerResponse>[];
  readonly state: Readonly<MechanicsCausalState>;
  /** Override the default work budget; smaller only. Absent means the default. */
  readonly workBudget?: number;
}

/** One frame's compiled step trace inside the whole-action trace. */
export interface MechanicsCoordinationTraceEntry {
  readonly frame: Readonly<MechanicsCoordinationFrameRef>;
  readonly manual: readonly Readonly<ManualInstruction>[];
  readonly trace: readonly Readonly<MechanicsCompiledStepTrace>[];
}

export type MechanicsCoordinationRejection =
  | MechanicsReviewRejection
  | "invalid-input"
  | "invalid-state"
  | "invalid-reviewed-intent"
  | "invalid-response"
  | "unresolved-predicate"
  | "unresolved-step"
  | "missing-compiler-fact"
  | "unsupported-step"
  | "kernel-rejected"
  | "root-create-rejected"
  | "dispatch-rejected"
  | "boundary-rejected"
  | "coordination-rejected"
  | "journal-rejected"
  | "work-budget";

export type MechanicsCoordinationResult =
  | {
      /** Null when the fixed point produced no material mutation. */
      readonly action: Readonly<JournalActionDraft> | null;
      readonly actionFacts: readonly Readonly<ActionFactGuard>[];
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "complete";
      readonly trace: readonly Readonly<MechanicsCoordinationTraceEntry>[];
    }
  | {
      /** Null addresses the root intent's own review. */
      readonly frame: Readonly<MechanicsCoordinationFrameRef> | null;
      readonly requirement: Readonly<MechanicsRequirement> | null;
      readonly status: "needs-answer";
    }
  | {
      readonly frame: Readonly<MechanicsCoordinationFrameRef>;
      readonly request: Readonly<MechanicsCompilerRequest>;
      readonly status: "needs-response";
    }
  | {
      readonly detail: string | null;
      readonly frame: Readonly<MechanicsCoordinationFrameRef> | null;
      readonly reason: MechanicsCoordinationRejection;
      readonly status: "rejected";
    };
