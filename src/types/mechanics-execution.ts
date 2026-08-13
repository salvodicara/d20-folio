/** Transient contracts for simultaneous terminal mechanics resolution. */

import type {
  ActionFactGuard,
  JournalActionDraft,
  JournalActorRef,
} from "@/types/action-journal";
import type { NonExhaustionConditionId } from "@/types/condition";
import type { DamageResolution } from "@/types/damage";
import type { DiceRollRequirement } from "@/types/dice-formula";
import type { EntityRef, MaterialRef, OccurrenceRef } from "@/types/mechanics-reference";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
  MechanicsOperationExecution,
  MechanicsOperationNoChange,
  MechanicsOperationRejection,
  MechanicsTransaction,
} from "@/types/mechanics-operation";
import type { MechanicsWorld } from "@/types/mechanics-world";
import type { ResourceRef } from "@/types/resource";

export interface GroupProposal {
  readonly operation: Readonly<MechanicsOperation>;
  readonly proposalId: string;
}

/** All proposals observe `basis`; this value is never a sequential execution plan. */
export interface ResolutionGroup {
  readonly basis: Readonly<MechanicsWorld>;
  readonly groupId: string;
  readonly proposals: readonly [Readonly<GroupProposal>, ...Readonly<GroupProposal>[]];
}

export interface OrderingObservation {
  readonly kind: "ordering";
  readonly partitions: readonly {
    readonly collisionKey: string;
    readonly proposalIds: readonly string[];
  }[];
  readonly requestId: string;
}

/** Internal envelope resolved from authority; it is never a public client command. */
export interface ResolutionGroupContext {
  readonly actionId: string;
  readonly actor: JournalActorRef;
  readonly causes: readonly [
    Readonly<MechanicsOperationCause>,
    ...Readonly<MechanicsOperationCause>[],
  ];
  readonly factGuards: readonly Readonly<ActionFactGuard>[];
  readonly ordering: Readonly<OrderingObservation> | null;
}

export interface ResolutionPartition {
  readonly collisionKeys: readonly string[];
  readonly proposalIds: readonly string[];
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

export interface SubscriberSnapshot {
  readonly subscribers: readonly Readonly<MechanicsInvocationRef>[];
}

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
      readonly kind: "resource-depleted";
      readonly resource: ResourceRef;
    })
  | (MechanicsEventBase & {
      readonly kind: "occurrence-ended" | "source-ended";
      readonly occurrence: OccurrenceRef;
    })
  | (MechanicsEventBase & {
      readonly conditionId: NonExhaustionConditionId;
      readonly kind: "condition-changed";
      readonly present: boolean;
      readonly target: EntityRef;
    })
  | (MechanicsEventBase & {
      readonly entity: EntityRef;
      readonly kind: "entity-changed";
    })
  | (MechanicsEventBase & {
      readonly instanceId: string;
      readonly instanceOrdinal: number;
      readonly kind: "inventory-changed";
      readonly owner: Extract<MaterialRef, { readonly kind: "character-play" }>;
    })
  | (MechanicsEventBase & {
      readonly combatant: EntityRef;
      readonly kind: "turn-changed";
    })
  | (MechanicsEventBase & {
      readonly kind: "register-changed";
      readonly program: OccurrenceRef;
      readonly registerId: string;
    });

export interface CapturedMechanicsEvent {
  readonly event: Readonly<MechanicsEvent>;
  readonly subscribers: Readonly<SubscriberSnapshot>;
}

export type AppliedMechanicsOperation = Readonly<MechanicsOperationExecution>;

export type ResolutionGroupPlanResult =
  | {
      readonly analysis: Extract<
        ResolutionGroupAnalysis,
        { readonly kind: "needs-ordering" }
      >;
      readonly request: {
        readonly kind: "ordering";
        readonly partitions: readonly ResolutionPartition[];
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
    }
  | {
      readonly action: Readonly<JournalActionDraft>;
      readonly analysis: Exclude<ResolutionGroupAnalysis, { readonly kind: "rejected" }>;
      readonly events: readonly Readonly<MechanicsEvent>[];
      readonly executions: readonly (
        | Readonly<MechanicsOperationExecution>
        | Readonly<MechanicsOperationNoChange>
      )[];
      readonly orderedProposalIds: readonly string[];
      readonly status: "planned";
      readonly transaction: Readonly<MechanicsTransaction>;
      readonly world: Readonly<MechanicsWorld>;
    }
  | {
      readonly analysis: Exclude<ResolutionGroupAnalysis, { readonly kind: "rejected" }>;
      readonly events: readonly [];
      readonly executions: readonly Readonly<MechanicsOperationNoChange>[];
      readonly orderedProposalIds: readonly string[];
      readonly status: "no-change";
      readonly transaction: Readonly<MechanicsTransaction>;
      readonly world: Readonly<MechanicsWorld>;
    }
  | {
      readonly operationId: string | null;
      readonly reason:
        | "invalid-group"
        | "unsupported-operation"
        | "invalid-context"
        | "unexpected-ordering"
        | "invalid-ordering"
        | "post-event-derivation"
        | MechanicsOperationRejection;
      readonly status: "rejected";
    };

export type MechanicsPostEventDerivationResult =
  | { readonly events: readonly Readonly<MechanicsEvent>[]; readonly status: "derived" }
  | {
      readonly reason: "invalid-before" | "invalid-after" | "execution-mismatch";
      readonly status: "rejected";
    };

export interface MechanicsEndWaveEvents {
  readonly events: readonly Readonly<MechanicsEvent>[];
  readonly status: "derived";
}
