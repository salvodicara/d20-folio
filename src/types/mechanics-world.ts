import type {
  MechanicsEndCause,
  ObservedMechanicsBoundary,
} from "@/types/mechanic-occurrence";
import type { CanonicalFingerprint } from "@/lib/canonical-fingerprint";
import type {
  CharacterMaterialRef,
  ClockRef,
  EntityRef,
  InventoryGenerationRef,
  MaterialEntityRef,
  MaterialRef,
  OccurrenceGenerationRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";
import type {
  CharacterMaterialState,
  EncounterParticipant,
  EncounterState,
  SharedMaterialState,
} from "@/types/material-state";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";

export type MechanicsDocument =
  | {
      kind: "character";
      material: CharacterMaterialRef;
      state: Readonly<CharacterMaterialState>;
    }
  | {
      kind: "shared";
      material: SharedMaterialRef;
      state: Readonly<SharedMaterialState>;
    };

/** Exact physical snapshot. Missing live-reference documents make it invalid. */
export interface MechanicsWorld {
  scope: MaterialRef;
  /** Strictly sorted by physical material identity, with no duplicates. */
  documents: readonly MechanicsDocument[];
}

export type MechanicsWorldInvalidReason =
  | "invalid-shape"
  | "invalid-document"
  | "invalid-order"
  | "missing-scope"
  | "missing-reference"
  | "invalid-ending"
  | "invalid-turn-state"
  | "invalid-clock"
  | "invalid-lease"
  | "protected-state-mismatch"
  | "controller-cycle"
  | "duplicate-lifecycle-owner"
  | "invalid-program-origin"
  | "duplicate-exclusive-state";

export type MechanicsWorldParseResult =
  | { ok: true; value: Readonly<MechanicsWorld> }
  | { ok: false; reason: MechanicsWorldInvalidReason };

export type MechanicsWorldSimulationRejection =
  | "invalid-world"
  | "invalid-boundary"
  | "invalid-transition"
  | "invalid-end-wave"
  | "clock-conflict"
  | "encounter-conflict"
  | "missing-document"
  | "overflow";

/** Pure projected material state. It never commits, versions, or records history. */
export type MechanicsWorldSimulationResult =
  | { status: "applied" | "already-applied"; world: Readonly<MechanicsWorld> }
  | {
      status: "rejected";
      reason: MechanicsWorldSimulationRejection;
      world: Readonly<MechanicsWorld>;
    };

/** A readable internal transition only; this world is not persistible or terminal. */
export type MechanicsEndWaveLatchResult =
  | { status: "latched" | "already-latched"; world: Readonly<MechanicsWorld> }
  | {
      status: "rejected";
      reason: MechanicsWorldSimulationRejection;
      world: Readonly<MechanicsWorld>;
    };

export interface MechanicsClosureRequest {
  boundaries?: readonly ObservedMechanicsBoundary[];
  endRequests?: readonly OccurrenceGenerationRef[];
  inventorySourceLeases?: readonly InventoryGenerationRef[];
}

/**
 * Exact proof carried while one causal action is still allowed to read sources
 * that have already been selected for ending. Leases are canonical, cumulative,
 * and live only for the surrounding causal action.
 */
export interface MechanicsCausalContext {
  readonly endWave: Readonly<MechanicsEndWaveCheckpoint> | null;
  readonly pendingFrames: readonly Readonly<MechanicsPendingFrame>[];
  readonly request: Required<MechanicsClosureRequest>;
}

/** Exact progress inside one active program frame. */
export type MechanicsPendingFrameCursor =
  | {
      readonly nextSlot: number;
      readonly stage: "step";
      readonly stepIndex: number;
    }
  | { readonly stage: "phase-transition" }
  | { readonly stage: "phase-complete" };

/** One semantic stack entry; the final entry is the only mutable top frame. */
export interface MechanicsPendingFrame {
  readonly cursor: Readonly<MechanicsPendingFrameCursor>;
  readonly frame: Readonly<MechanicsExecutionFrame>;
  /** Kernel-issued only when an authentic emission selected this exact frame. */
  readonly selectedEvent: boolean;
}

declare const MECHANICS_CAUSAL_STATE: unique symbol;

/** Kernel-produced, process-local transient. Never persist or deserialize it. */
export interface MechanicsCausalState {
  readonly [MECHANICS_CAUSAL_STATE]: true;
  readonly context: Readonly<MechanicsCausalContext>;
  readonly world: Readonly<MechanicsWorld>;
}

export type MechanicsCausalStateResult =
  | { readonly ok: true; readonly value: Readonly<MechanicsCausalState> }
  | {
      readonly ok: false;
      readonly reason: MechanicsWorldSimulationRejection;
    };

/** Every table clock/encounter observation enters the engine through this one command. */
export type MechanicsBoundaryCommand =
  | {
      readonly clock: ClockRef;
      readonly elapsedSeconds: number;
      readonly kind: "advance-time";
    }
  | { readonly input: RestBoundaryInput; readonly kind: "complete-rest" }
  | { readonly input: DayPhaseBoundaryInput; readonly kind: "observe-day-phase" }
  | {
      readonly excludeCurrent: MaterialEntityRef | null;
      readonly kind: "complete-turn";
      readonly material: MaterialRef;
    }
  | {
      readonly kind: "start-encounter";
      readonly material: MaterialRef;
      readonly seed: EncounterSeed;
    }
  | { readonly kind: "end-encounter"; readonly material: MaterialRef };

/** Exact participant generation captured by an encounter-boundary cursor. */
export interface MechanicsBoundaryParticipantCursor {
  readonly combatant: EntityRef;
  readonly participantId: string;
  readonly participantOrdinal: number;
}

/** Pure encounter identity needed to reject participant-id ABA while suspended. */
export interface MechanicsBoundaryEncounterCursor {
  readonly currentCombatantId: string | null;
  readonly epoch: number;
  readonly order: readonly string[];
  readonly participants: readonly MechanicsBoundaryParticipantCursor[];
  readonly phase: EncounterState["phase"];
  readonly round: number;
}

export type MechanicsBoundaryCursor =
  | { readonly kind: "finish" }
  | {
      readonly encounter: MechanicsBoundaryEncounterCursor;
      readonly excludeCurrent: MaterialEntityRef | null;
      readonly expectedRound: number;
      readonly expectedTimelineSeconds: number;
      readonly kind: "complete-turn";
      readonly lastSelected: MechanicsBoundaryParticipantCursor | null;
      readonly phase: "after-end" | "after-time" | "after-start";
      readonly scanOffset: number;
      readonly selected: MechanicsBoundaryParticipantCursor | null;
    }
  | {
      readonly characterMaterials: readonly CharacterMaterialRef[];
      readonly kind: "start-shared-encounter";
      readonly nextIndex: number;
      readonly pendingEncounter: MechanicsBoundaryEncounterCursor;
    }
  | {
      readonly encounter: MechanicsBoundaryEncounterCursor;
      readonly kind: "end-encounter";
    };

/** One ordered causal barrier. Every ending source remains readable in `state`. */
export interface MechanicsBoundaryCheckpoint {
  readonly boundary: Readonly<ObservedMechanicsBoundary> | null;
  readonly ordinal: number;
  readonly state: Readonly<MechanicsCausalState>;
  readonly wave: Readonly<MechanicsEndWaveReceipt>;
}

declare const MECHANICS_BOUNDARY_CONTINUATION: unique symbol;

/** Kernel-produced process-local boundary state. Never persist or deserialize it. */
export interface MechanicsBoundaryContinuation {
  readonly [MECHANICS_BOUNDARY_CONTINUATION]: true;
  readonly basis: Readonly<MechanicsWorld>;
  readonly checkpoint: Readonly<MechanicsBoundaryCheckpoint>;
  readonly command: Readonly<MechanicsBoundaryCommand>;
  readonly cursor: Readonly<MechanicsBoundaryCursor>;
  readonly request: Required<MechanicsClosureRequest>;
}

declare const MECHANICS_BOUNDARY_COMPLETION: unique symbol;

/** Coordinator-issued proof that one exact checkpoint finished event delivery. */
export interface MechanicsBoundaryCompletion {
  readonly [MECHANICS_BOUNDARY_COMPLETION]: true;
  readonly continuation: CanonicalFingerprint;
  readonly state: Readonly<MechanicsCausalState>;
}

export type MechanicsBoundaryResult =
  | {
      readonly continuation: Readonly<MechanicsBoundaryContinuation>;
      readonly checkpoint: Readonly<MechanicsBoundaryCheckpoint>;
      readonly status: "checkpoint";
    }
  | {
      readonly outcome: "applied" | "already-applied";
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "complete";
    }
  | {
      readonly reason: MechanicsWorldSimulationRejection;
      readonly status: "rejected";
    };

/** Immutable discovery receipt. Dependents precede every dependency in the list. */
export interface MechanicsEndCandidate {
  readonly occurrence: OccurrenceGenerationRef;
  /** Non-empty, duplicate-free and canonically sorted. */
  readonly causes: readonly MechanicsEndCause[];
}

/** Monotonic pre-finalization receipt bound to one exact readable world. */
export interface MechanicsEndWaveReceipt {
  readonly basis: CanonicalFingerprint;
  readonly candidates: readonly MechanicsEndCandidate[];
  readonly request: Required<MechanicsClosureRequest>;
  readonly schema: 1;
}

/** A previously proved wave and the exact readable world that proved it. */
export interface MechanicsEndWaveCheckpoint {
  readonly wave: Readonly<MechanicsEndWaveReceipt>;
  readonly world: Readonly<MechanicsWorld>;
}

export type MechanicsEndDiscoveryResult =
  | {
      readonly status: "discovered";
      readonly wave: Readonly<MechanicsEndWaveReceipt>;
      readonly world: Readonly<MechanicsWorld>;
    }
  | {
      readonly status: "rejected";
      readonly reason: MechanicsWorldSimulationRejection;
      readonly world: Readonly<MechanicsWorld>;
    };

export type EncounterParticipantSeed = Omit<EncounterParticipant, "economy">;

/** Encounter facts are supplied by the table; the engine owns epoch and economy ledgers. */
export interface EncounterSeed {
  readonly currentCombatantId: string | null;
  readonly nextCombatantOrdinal: number;
  readonly order: readonly string[];
  readonly participants: Readonly<Record<string, EncounterParticipantSeed>>;
  readonly phase: EncounterState["phase"];
  readonly round: number;
}

export interface RestBoundaryInput {
  clock: ClockRef;
  combatant: EntityRef;
  rest: "short" | "long";
}

export interface DayPhaseBoundaryInput {
  clock: ClockRef;
  phase: "dawn" | "dusk";
}
