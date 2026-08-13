import type { EntityRef, MaterialRef } from "@/types/mechanics-reference";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

/** `present: false` is deliberately distinct from a stored JSON `null`. */
export type StoredValue = { present: false } | { present: true; value: JsonValue };

/**
 * A table action normally has a creature actor. Hazards, lair/environment
 * effects and explicit table declarations do not; they use the material that
 * authorizes the action instead of fabricating a creature identity.
 */
export type JournalActorRef =
  | EntityRef
  | {
      kind: "material-authority";
      material: MaterialRef;
      authority: "table" | "environment";
    };

/** A bounded path into a semantic fact namespace or material document. */
export type JournalPath = readonly [string, ...string[]];

/**
 * A persisted action stores the original plan fence used by commit. Undo and
 * redo carry fresh guards of this same shape for their current CAS.
 */
export interface ActionDocumentGuard {
  material: MaterialRef;
  epoch: number;
  revision: number;
}

/**
 * A semantic fact consulted by the planner but not authored by the action.
 * Every fact is checked on commit. Only mutable live facts opt into redo
 * validation; immutable authority/definition snapshots remain commit-only so an
 * exact replay is not blocked by later catalogue drift. Undo never resolves
 * semantic facts: document fences, LIFO generation and exact post-mutation CAS
 * are sufficient to restore what the forward action changed.
 */
export interface ActionFactGuard {
  owner: JournalActorRef;
  address: JournalPath;
  expected: StoredValue;
  lifecycle: "commit" | "commit-redo";
}

export interface ActionGuards {
  /** Sorted by physical material identity; every observed document appears once. */
  documents: readonly ActionDocumentGuard[];
  /** Sorted by exact owner then address. Required even when empty. */
  facts: readonly ActionFactGuard[];
}

export interface ActionMutation {
  target: MaterialRef;
  path: JournalPath;
  before: StoredValue;
  after: StoredValue;
}

/** Persisted immutable action. Only `generation` may change. */
export interface JournalAction {
  id: string;
  generation: number;
  actor: JournalActorRef;
  guards: ActionGuards;
  /** Sorted by target then path; paths for one target may not overlap. */
  mutations: readonly ActionMutation[];
}

export type JournalActionDraft = Omit<JournalAction, "generation">;

/** The sole persisted journal envelope. */
export interface ActionJournal {
  epoch: number;
  revision: number;
  /** Odd generations form the applied prefix; even generations the undone suffix. */
  actions: readonly JournalAction[];
}

/** Pure reducer model: every physical document owns one envelope plus material data. */
export interface JournalMaterialDocument {
  material: MaterialRef;
  journal: ActionJournal;
  data: Readonly<Record<string, JsonValue>>;
}

export interface ActionJournalWorld {
  /** The document whose journal serializes this transition. */
  scope: MaterialRef;
  /** Sorted by physical identity; only `scope.actions` changes during a transition. */
  documents: readonly JournalMaterialDocument[];
}

/** Fresh semantic reads supplied to the pure reducer by the persistence adapter. */
export interface ResolvedActionFact {
  owner: JournalActorRef;
  address: JournalPath;
  actual: StoredValue;
}

export type ActionJournalTransition =
  | {
      kind: "commit";
      action: JournalActionDraft;
    }
  | {
      kind: "undo" | "redo";
      /** Full immutable body: retry identity never rests on an id alone. */
      action: JournalActionDraft;
      expectedGeneration: number;
      /** Current exact fences for the same documents stored on `action`. */
      documents: readonly ActionDocumentGuard[];
    };

export interface ActionJournalReset {
  epoch: number;
  expectedRevision: number;
}

export type ActionJournalRejectionReason =
  | "invalid-world"
  | "invalid-facts"
  | "invalid-transition"
  | "invalid-action"
  | "epoch-conflict"
  | "revision-conflict"
  | "action-collision"
  | "action-not-found"
  | "generation-conflict"
  | "branch-conflict"
  | "document-conflict"
  | "fact-conflict"
  | "mutation-conflict"
  | "journal-overflow";

export type ActionJournalTransitionResult =
  | {
      status: "applied" | "already-applied";
      world: Readonly<ActionJournalWorld>;
      actionId: string;
      generation: number;
      evictedActionIds: readonly string[];
    }
  | {
      status: "rejected";
      reason: ActionJournalRejectionReason;
      world: Readonly<ActionJournalWorld>;
    };

export type ActionJournalResetResult =
  | {
      status: "applied" | "already-applied";
      world: Readonly<ActionJournalWorld>;
    }
  | {
      status: "rejected";
      reason: ActionJournalRejectionReason;
      world: Readonly<ActionJournalWorld>;
    };
