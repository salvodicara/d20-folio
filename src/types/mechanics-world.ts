import type { EndRule } from "@/types/mechanic-occurrence";
import type {
  CharacterMaterialRef,
  ClockRef,
  EntityRef,
  MaterialRef,
  OccurrenceRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";
import type {
  CharacterMaterialState,
  EncounterParticipant,
  EncounterState,
  SharedMaterialState,
} from "@/types/material-state";

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

/** Exact transaction snapshot. Missing live-reference documents make it invalid. */
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
  | "invalid-clock"
  | "invalid-lease"
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

/** An explicit observed boundary. Causal and temporary-HP endings are derived by closure. */
export type ObservedMechanicsBoundary = Exclude<
  EndRule,
  | { kind: "occurrence-end" }
  | { kind: "program-phase-end" }
  | { kind: "temporary-hp-empty" }
>;

export interface OccurrenceRemoval {
  material: MaterialRef;
  occurrenceIds: readonly string[];
}

/** One inventory tombstone kept only until the surrounding transaction finishes. */
export interface InventorySourceLease {
  material: CharacterMaterialRef;
  instanceId: string;
  instanceOrdinal: number;
}

export interface MechanicsClosureRequest {
  boundaries?: readonly ObservedMechanicsBoundary[];
  inventorySourceLeases?: readonly InventorySourceLease[];
  removals?: readonly OccurrenceRemoval[];
}

/** Every table clock/encounter observation enters the engine through this one command. */
export type MechanicsBoundaryCommand =
  | {
      readonly clock: ClockRef;
      readonly elapsedSeconds: number;
      readonly kind: "advance-time";
    }
  | { readonly input: RestBoundaryInput; readonly kind: "complete-rest" }
  | { readonly input: DayPhaseBoundaryInput; readonly kind: "observe-day-phase" }
  | { readonly kind: "complete-turn"; readonly material: MaterialRef }
  | {
      readonly kind: "start-encounter";
      readonly material: MaterialRef;
      readonly seed: EncounterSeed;
    }
  | { readonly kind: "end-encounter"; readonly material: MaterialRef };

/** One ordered causal barrier. Sources are still live in `world`. */
export interface MechanicsClosureCheckpoint {
  readonly candidates: readonly Readonly<MechanicsEndCandidate>[];
  readonly ordinal: number;
  readonly request: Readonly<MechanicsClosureRequest>;
  readonly world: Readonly<MechanicsWorld>;
}

export type MechanicsClosureResolverResult =
  | { readonly status: "resolved"; readonly world: Readonly<MechanicsWorld> }
  | {
      readonly reason: MechanicsWorldSimulationRejection;
      readonly status: "rejected";
    };

/** Injected by the event executor; world-core never delivers subscribers itself. */
export type MechanicsClosureResolver = (
  checkpoint: Readonly<MechanicsClosureCheckpoint>
) => Readonly<MechanicsClosureResolverResult>;

/** One independently provable reason an active occurrence belongs to an end wave. */
export type MechanicsEndCause =
  | { readonly kind: "requested" }
  | {
      readonly kind: "explicit-boundary";
      readonly boundary: ObservedMechanicsBoundary;
    }
  | { readonly kind: "concentration-broken" }
  | {
      readonly kind: "dependency-ended";
      readonly dependency: OccurrenceRef;
    }
  | { readonly kind: "temporary-hit-points-empty" }
  | {
      readonly kind: "live-entity-missing";
      readonly entity: EntityRef;
    };

/** Immutable discovery receipt. Dependents precede every dependency in the list. */
export interface MechanicsEndCandidate {
  readonly occurrence: OccurrenceRef;
  /** Non-empty, duplicate-free and canonically sorted. */
  readonly causes: readonly MechanicsEndCause[];
}

export type MechanicsEndDiscoveryResult =
  | {
      readonly status: "discovered";
      readonly candidates: readonly MechanicsEndCandidate[];
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
