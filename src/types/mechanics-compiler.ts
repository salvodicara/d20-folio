/** Canonical transient contracts for compiling one reviewed program frame. */

import type { ActionFactGuard } from "@/types/action-journal";
import type { DamageAllocationObservation, DamageTableOverride } from "@/types/damage";
import type { DiceObservation, DiceRollRequirement } from "@/types/dice-formula";
import type { MechanicsAuthoritySnapshot } from "@/types/mechanics-authority";
import type { MechanicsPostEventEmission } from "@/types/mechanics-execution";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type {
  MechanicsOperationExecution,
  MechanicsOperationConsequence,
  MechanicsOperationNoChange,
  MechanicsTransaction,
  MechanicsTransactionSimulationResult,
} from "@/types/mechanics-operation";
import type {
  ManualInstruction,
  ReviewedMechanicsIntent,
} from "@/types/mechanics-program";
import type { MechanicsCausalState } from "@/types/mechanics-world";
import type { TurnEconomyProjection } from "@/types/turn-economy";

export type MechanicsCompilerResponse =
  | {
      readonly kind: "damage-allocation";
      readonly observation: Readonly<DamageAllocationObservation>;
      readonly requestId: string;
    }
  | {
      readonly kind: "damage-override";
      readonly override: Readonly<DamageTableOverride> | null;
      readonly requestId: string;
    }
  | {
      readonly kind: "zero-hit-points";
      readonly policy: "dead" | "dying";
      readonly requestId: string;
    }
  | {
      readonly decision: "keep" | "replace";
      readonly kind: "temporary-hit-points";
      readonly requestId: string;
    }
  | {
      readonly kind: "condition-immunity-override";
      readonly reasonId: string;
      readonly requestId: string;
    }
  | {
      readonly kind: "resource-observation";
      readonly observation: Readonly<DiceObservation>;
      readonly requestId: string;
    };

export type MechanicsCompilerRequest =
  | {
      readonly kind: "damage-allocation";
      readonly requestId: string;
      readonly requirement: {
        readonly amount: number;
        readonly operation: "increase" | "reduction";
        readonly packetId: string;
        readonly parts: readonly {
          readonly maximumAmount: number | null;
          readonly partId: string;
        }[];
        readonly sourceId: string;
      };
    }
  | {
      readonly computedAmount: number;
      readonly kind: "damage-override";
      readonly requestId: string;
    }
  | {
      readonly kind: "zero-hit-points";
      readonly requestId: string;
      readonly target: EntityRef;
    }
  | {
      readonly current: number;
      readonly incoming: number;
      readonly kind: "temporary-hit-points";
      readonly requestId: string;
      readonly target: EntityRef;
    }
  | {
      readonly conditionId: string;
      readonly kind: "condition-immunity-override";
      readonly requestId: string;
      readonly target: EntityRef;
    }
  | {
      readonly boundary: "capacity" | "initial" | "record-roll" | "recovery";
      readonly kind: "resource-observation";
      readonly requestId: string;
      readonly requirement: DiceRollRequirement;
    };

export interface MechanicsCompiledStepTrace {
  readonly executions: readonly (
    | Readonly<MechanicsOperationExecution>
    | Readonly<MechanicsOperationNoChange>
  )[];
  readonly operationIds: readonly string[];
  readonly status: "compiled" | "manual" | "omitted";
  readonly stepId: string;
}

export interface CompileMechanicsFrameInput {
  readonly authoritySnapshot: Readonly<MechanicsAuthoritySnapshot>;
  /**
   * The single-use response continuation being consumed. Required exactly when
   * `responses` is nonempty: the responses must extend that continuation's
   * consumed prefix by one answer to its issued request.
   */
  readonly continuation: Readonly<MechanicsCompilerContinuation> | null;
  /** Trusted, guarded facts not already represented by MechanicsWorld. */
  readonly facts: readonly Readonly<ActionFactGuard>[];
  readonly responses: readonly Readonly<MechanicsCompilerResponse>[];
  readonly reviewed: Readonly<ReviewedMechanicsIntent>;
  readonly state: Readonly<MechanicsCausalState>;
  /**
   * Caller-supplied effective turn-economy projections, one per combatant the
   * frame may claim for. The kernel re-emits and commit-validates each used
   * projection as a fingerprint fact guard, so a stale projection fails closed.
   */
  readonly turnEconomy: readonly Readonly<{
    readonly combatant: EntityRef;
    readonly projection: TurnEconomyProjection;
  }>[];
}

declare const MECHANICS_COMPILER_CONTINUATION: unique symbol;

/**
 * Single-use process-local capability for resuming one suspended compilation
 * with a genuine user response. Its private fiber binds the exact issuance
 * causal state, reviewed input, cursor, consumed response prefix and issued
 * request; it carries no world, transaction prefix or progress model and can
 * never be persisted. Consumption invalidates it even when the resumed
 * compilation then rejects; causal coordination never mints one — the
 * coordinator mutates state and restarts ordinary compilation instead.
 */
export interface MechanicsCompilerContinuation {
  readonly [MECHANICS_COMPILER_CONTINUATION]: true;
}

/**
 * One authentic compiler-owned transition. The coordinator consumes this
 * segment, delivers its emissions/consequences, then invokes the compiler again
 * with the returned causal state. No projected world or second progress cursor
 * can cross this seam.
 */
export interface MechanicsCompiledSegment {
  readonly actionFacts: readonly Readonly<ActionFactGuard>[];
  readonly consequences: readonly Readonly<MechanicsOperationConsequence>[];
  readonly emissions: readonly Readonly<MechanicsPostEventEmission>[];
  /** Root ends this segment defers to the frame's phase CAS. */
  readonly endRequests: readonly Readonly<OccurrenceGenerationRef>[];
  readonly manual: readonly ManualInstruction[];
  readonly state: Readonly<MechanicsCausalState>;
  readonly trace: readonly MechanicsCompiledStepTrace[];
  readonly transaction: Readonly<MechanicsTransaction> | null;
}

export type MechanicsFrameCompileRejection =
  | "invalid-reviewed-intent"
  | "invalid-state"
  | "invalid-authority-snapshot"
  | "invalid-response"
  | "unresolved-predicate"
  | "unresolved-step"
  | "missing-compiler-fact"
  | "unsupported-step"
  | "kernel-rejected";

export type MechanicsFrameCompileResult =
  | {
      readonly segment: Readonly<MechanicsCompiledSegment>;
      readonly status: "compiled";
    }
  | {
      readonly continuation: Readonly<MechanicsCompilerContinuation>;
      readonly request: Readonly<MechanicsCompilerRequest>;
      readonly segment: null;
      readonly status: "needs-response";
    }
  | {
      readonly coordination:
        | {
            readonly kind: "concentration-replacement";
            readonly occurrences: readonly OccurrenceGenerationRef[];
          }
        | {
            readonly boundary: Extract<
              MechanicsTransactionSimulationResult,
              { readonly status: "needs-boundary" }
            >["boundary"];
            readonly kind: "boundary";
          }
        | {
            readonly kind: "occurrence-end";
            readonly occurrences: readonly OccurrenceGenerationRef[];
          };
      readonly segment: null;
      readonly status: "needs-coordination";
    }
  | {
      readonly operationId: string | null;
      readonly phaseId: string | null;
      readonly reason: MechanicsFrameCompileRejection;
      readonly referenceId: string | null;
      readonly status: "rejected";
      readonly stepId: string | null;
    };
