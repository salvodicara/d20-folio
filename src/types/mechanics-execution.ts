/** Transient contracts for simultaneous terminal mechanics resolution. */

import type { ActionFactGuard } from "@/types/action-journal";
import type { DamageResolution } from "@/types/damage";
import type { DiceRollRequirement } from "@/types/dice-formula";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type {
  MechanicsOperation,
  MechanicsOperationConsequence,
  MechanicsOperationExecution,
  MechanicsOperationNoChange,
  MechanicsOperationRejection,
  MechanicsOperationStage,
  MechanicsTransaction,
} from "@/types/mechanics-operation";
import type {
  MechanicsBoundaryCommand,
  MechanicsCausalState,
  MechanicsWorld,
} from "@/types/mechanics-world";
import type { ResourceRef } from "@/types/resource";

export interface GroupProposal {
  readonly operation: Readonly<MechanicsOperation>;
  readonly proposalId: string;
}

/** Proposals share the causal state supplied by the trusted execution context. */
export interface ResolutionGroup {
  readonly groupId: string;
  readonly proposals: readonly [Readonly<GroupProposal>, ...Readonly<GroupProposal>[]];
}

/** Opaque logical addresses touched by one terminal operation. */
export interface MechanicsOperationAccessFootprint {
  /** Dependencies inspected without mutation. Shared reads never conflict. */
  readonly reads: readonly string[];
  /** Rule-visible writes whose relative order belongs to the table. */
  readonly semanticWrites: readonly string[];
  /** Preallocated monotonic-ledger writes ordered canonically by the engine. */
  readonly technicalWrites: readonly string[];
}

export interface OrderingObservation {
  readonly kind: "ordering";
  readonly partitions: readonly OrderingRequestPartition[];
  readonly requestId: string;
}

/** One genuine table-ordering choice; allocator-only members are deliberately absent. */
export interface OrderingRequestPartition {
  readonly collisionKey: string;
  readonly proposalIds: readonly string[];
}

export interface ResolutionPrecedence {
  readonly afterProposalId: string;
  readonly beforeProposalId: string;
}

export interface ResolutionPartition {
  readonly collisionKeys: readonly string[];
  /** The genuine, independent semantic choices exposed to the table. */
  readonly orderingPartitions: readonly OrderingRequestPartition[];
  readonly proposalIds: readonly string[];
  /** Monotonic allocator order that no table observation may reverse. */
  readonly technicalPrecedence: readonly ResolutionPrecedence[];
}

export type ResolutionGroupAnalysis =
  | {
      readonly collisionKeys: readonly string[];
      readonly kind: "disjoint";
      readonly partitions: readonly ResolutionPartition[];
    }
  | {
      readonly collisionKeys: readonly string[];
      readonly kind: "needs-ordering";
      readonly partitions: readonly ResolutionPartition[];
      readonly requestId: string;
    }
  | {
      readonly kind: "rejected";
      readonly reason: "invalid-group" | "unsupported-operation";
    };

interface MechanicsEventBase {
  readonly eventId: string;
  readonly operationId: string;
}

export type MechanicsEvent =
  | (MechanicsEventBase & {
      readonly attacker: EntityRef | null;
      readonly criticalHit: boolean;
      readonly kind: "damage-taken";
      readonly resolution: Readonly<DamageResolution>;
    })
  | (MechanicsEventBase & {
      readonly kind: "hit-points-zero";
      readonly target: EntityRef;
    })
  | (MechanicsEventBase & {
      readonly execution: number;
      readonly kind: "program-phase-end";
      readonly occurrence: OccurrenceGenerationRef;
      readonly phaseId: string;
    })
  | (MechanicsEventBase & {
      readonly kind: "resource-depleted";
      readonly resource: ResourceRef;
    })
  | (MechanicsEventBase & {
      readonly kind: "source-ending";
      readonly occurrence: OccurrenceGenerationRef;
    });

/** Events derived from a complete transaction's applied stages. */
export type MechanicsPostEvent = Exclude<
  MechanicsEvent,
  { readonly kind: "source-ending" }
>;

declare const MECHANICS_EVENT_EMISSION: unique symbol;

/** One authentic event paired with the exact world immediately after its producing stage. */
export interface MechanicsEventEmission<Event extends MechanicsEvent = MechanicsEvent> {
  readonly [MECHANICS_EVENT_EMISSION]: true;
  readonly emissionWorld: Readonly<MechanicsWorld>;
  readonly event: Readonly<Event>;
}

export type MechanicsPostEventEmission = MechanicsEventEmission<MechanicsPostEvent>;
export type MechanicsSourceEndingEventEmission = MechanicsEventEmission<
  Extract<MechanicsEvent, { readonly kind: "source-ending" }>
>;

declare const MECHANICS_SUBSCRIBER_SELECTION: unique symbol;

/** Process-local proof that one root/phase belonged to an event's emission-time audience. */
export interface MechanicsSubscriberSelection {
  readonly [MECHANICS_SUBSCRIBER_SELECTION]: true;
  readonly eventId: string;
  readonly phaseId: string;
  readonly root: Readonly<OccurrenceGenerationRef>;
}

export type MechanicsSubscriberSelectionResult =
  | {
      readonly selections: readonly Readonly<MechanicsSubscriberSelection>[];
      readonly status: "selected";
    }
  | {
      readonly reason: "invalid-emission" | "subscriber-overflow";
      readonly status: "rejected";
    };

export type MechanicsSubscriberDispatchResult =
  | {
      readonly frame: Readonly<MechanicsExecutionFrame>;
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "dispatched";
    }
  | {
      readonly reason:
        | "invalid-selection"
        | "invalid-state"
        | "stale-subscriber"
        | "execution-overflow";
      readonly status: "rejected";
    };

export type AppliedMechanicsOperation = Readonly<MechanicsOperationExecution>;

export type ResolutionGroupSimulationResult =
  | {
      readonly analysis: Extract<
        ResolutionGroupAnalysis,
        { readonly kind: "needs-ordering" }
      >;
      readonly request: {
        readonly kind: "ordering";
        readonly partitions: readonly OrderingRequestPartition[];
        readonly requestId: string;
      };
      readonly status: "needs-ordering";
    }
  | {
      readonly analysis:
        | Exclude<
            ResolutionGroupAnalysis,
            { readonly kind: "rejected" | "needs-ordering" }
          >
        | Extract<ResolutionGroupAnalysis, { readonly kind: "needs-ordering" }>;
      readonly boundary: "capacity" | "initial" | "record-roll" | "recovery";
      readonly operationId: string;
      readonly orderedProposalIds: readonly string[];
      readonly requirement: Readonly<DiceRollRequirement>;
      readonly status: "needs-observation";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly analysis: Exclude<ResolutionGroupAnalysis, { readonly kind: "rejected" }>;
      readonly boundary: Readonly<
        Extract<MechanicsBoundaryCommand, { readonly kind: "complete-turn" }>
      >;
      readonly operationId: string;
      readonly orderedProposalIds: readonly string[];
      readonly status: "needs-boundary";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly actionFacts: readonly Readonly<ActionFactGuard>[];
      readonly analysis: Exclude<ResolutionGroupAnalysis, { readonly kind: "rejected" }>;
      readonly consequences: readonly Readonly<MechanicsOperationConsequence>[];
      readonly emissions: readonly Readonly<MechanicsPostEventEmission>[];
      readonly executions: readonly (
        | Readonly<MechanicsOperationExecution>
        | Readonly<MechanicsOperationNoChange>
      )[];
      readonly orderedProposalIds: readonly string[];
      readonly stages: readonly Readonly<MechanicsOperationStage>[];
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "simulated";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly actionFacts: readonly [];
      readonly analysis: Exclude<ResolutionGroupAnalysis, { readonly kind: "rejected" }>;
      readonly consequences: readonly [];
      readonly emissions: readonly [];
      readonly executions: readonly Readonly<MechanicsOperationNoChange>[];
      readonly orderedProposalIds: readonly string[];
      readonly stages: readonly [];
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "no-change";
      readonly transaction: Readonly<MechanicsTransaction>;
    }
  | {
      readonly operationId: string | null;
      readonly reason:
        | "invalid-group"
        | "unsupported-operation"
        | "invalid-context"
        | "unexpected-ordering"
        | "invalid-ordering"
        | MechanicsOperationRejection;
      readonly status: "rejected";
    };

export type MechanicsSourceEndingEventDerivationResult =
  | {
      readonly emissions: readonly Readonly<MechanicsSourceEndingEventEmission>[];
      readonly status: "derived";
    }
  | {
      readonly reason: "invalid-end-wave";
      readonly status: "rejected";
    };
