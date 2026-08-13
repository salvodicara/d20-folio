/** Canonical transient contracts for compiling one reviewed program frame. */

import type { ActionFactGuard } from "@/types/action-journal";
import type { DamageAllocationObservation, DamageTableOverride } from "@/types/damage";
import type { DiceObservation } from "@/types/dice-formula";
import type { MechanicsAuthoritySnapshot } from "@/types/mechanics-authority";
import type { OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type {
  MechanicsOperationExecution,
  MechanicsOperationNoChange,
  MechanicsTransaction,
  MechanicsTransactionSimulationResult,
} from "@/types/mechanics-operation";
import type {
  ManualInstruction,
  ReviewedMechanicsIntent,
} from "@/types/mechanics-program";
import type { MechanicsCausalState } from "@/types/mechanics-world";

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
      readonly target: import("@/types/mechanics-reference").EntityRef;
    }
  | {
      readonly current: number;
      readonly incoming: number;
      readonly kind: "temporary-hit-points";
      readonly requestId: string;
      readonly target: import("@/types/mechanics-reference").EntityRef;
    }
  | {
      readonly conditionId: string;
      readonly kind: "condition-immunity-override";
      readonly requestId: string;
      readonly target: import("@/types/mechanics-reference").EntityRef;
    }
  | {
      readonly boundary: "capacity" | "initial" | "record-roll" | "recovery";
      readonly kind: "resource-observation";
      readonly requestId: string;
      readonly requirement: import("@/types/dice-formula").DiceRollRequirement;
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
  /** Trusted, guarded facts not already represented by MechanicsWorld. */
  readonly facts: readonly Readonly<ActionFactGuard>[];
  readonly responses: readonly Readonly<MechanicsCompilerResponse>[];
  readonly reviewed: Readonly<ReviewedMechanicsIntent>;
  readonly state: Readonly<MechanicsCausalState>;
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
      readonly manual: readonly ManualInstruction[];
      readonly simulation: Extract<
        MechanicsTransactionSimulationResult,
        { readonly status: "simulated" | "no-change" }
      >;
      readonly status: "compiled";
      readonly trace: readonly MechanicsCompiledStepTrace[];
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | { readonly status: "replay" }
  | {
      readonly request: Readonly<MechanicsCompilerRequest>;
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
