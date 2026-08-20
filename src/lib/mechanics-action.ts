/**
 * Persistence adapter for the pure mechanics-world simulators.
 *
 * Mechanics reducers may calculate a candidate world, but only ActionJournal is
 * allowed to advance revisions or persist history. This adapter proves that the
 * candidate kept every journal/protected field unchanged and compiles its exact
 * material delta into one reversible JournalActionDraft.
 */

import {
  ACTION_JOURNAL_MAX_PATH_DEPTH,
  isJournalAction,
  journalActorRefKey,
  materialRefKey,
} from "@/lib/action-journal";
import { parseMechanicsWorld } from "@/lib/mechanics-world";
import type {
  ActionFactGuard,
  ActionMutation,
  JournalActionDraft,
  JournalActorRef,
  JournalPath,
  JsonValue,
  StoredValue,
} from "@/types/action-journal";
import type { MaterialRef } from "@/types/mechanics-reference";
import type { MechanicsDocument, MechanicsWorld } from "@/types/mechanics-world";

const PROTECTED_ROOTS = [
  "actions",
  "buildRevision",
  "epoch",
  "revision",
  "schema",
] as const;
const PROTECTED_ROOT_SET = new Set<string>(PROTECTED_ROOTS);

export type MechanicsActionPlanRejection =
  | "invalid-before"
  | "invalid-after"
  | "world-mismatch"
  | "invalid-scope"
  | "protected-change"
  | "invalid-action";

export type MechanicsActionPlanResult =
  | { readonly status: "planned"; readonly action: JournalActionDraft }
  | { readonly status: "no-change" }
  | {
      readonly status: "rejected";
      readonly reason: MechanicsActionPlanRejection;
    };

export interface MechanicsActionIdentity {
  readonly id: string;
  readonly actor: JournalActorRef;
  /** Semantic reads not already represented by the material snapshot. */
  readonly facts?: readonly ActionFactGuard[];
}

type JsonObject = Readonly<Record<string, JsonValue>>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (!isJsonObject(left) || !isJsonObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) => key === rightKeys[index] && jsonEqual(left[key], right[key])
    )
  );
}

function stored(present: boolean, value?: unknown): StoredValue {
  return present
    ? { present: true, value: structuredClone(value) as JsonValue }
    : { present: false };
}

function appendMutation(
  target: MaterialRef,
  path: JournalPath,
  beforePresent: boolean,
  before: unknown,
  afterPresent: boolean,
  after: unknown,
  output: ActionMutation[]
): void {
  output.push({
    target: structuredClone(target),
    path: [...path],
    before: stored(beforePresent, before),
    after: stored(afterPresent, after),
  });
}

function appendDiff(
  target: MaterialRef,
  path: JournalPath,
  beforePresent: boolean,
  before: unknown,
  afterPresent: boolean,
  after: unknown,
  output: ActionMutation[]
): void {
  if (beforePresent === afterPresent && jsonEqual(before, after)) return;
  if (
    !beforePresent ||
    !afterPresent ||
    path.length === ACTION_JOURNAL_MAX_PATH_DEPTH ||
    !isJsonObject(before) ||
    !isJsonObject(after)
  ) {
    appendMutation(target, path, beforePresent, before, afterPresent, after, output);
    return;
  }

  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const key of keys) {
    appendDiff(
      target,
      [...path, key],
      Object.hasOwn(before, key),
      before[key],
      Object.hasOwn(after, key),
      after[key],
      output
    );
  }
}

function protectedFieldsMatch(
  before: MechanicsDocument["state"],
  after: MechanicsDocument["state"]
): boolean {
  return PROTECTED_ROOTS.every((key) =>
    jsonEqual(
      (before as unknown as Record<string, unknown>)[key],
      (after as unknown as Record<string, unknown>)[key]
    )
  );
}

function sameWorldIdentity(before: MechanicsWorld, after: MechanicsWorld): boolean {
  if (
    materialRefKey(before.scope) !== materialRefKey(after.scope) ||
    before.documents.length !== after.documents.length
  ) {
    return false;
  }
  return before.documents.every((document, index) => {
    const candidate = after.documents[index];
    return (
      candidate !== undefined &&
      candidate.kind === document.kind &&
      materialRefKey(candidate.material) === materialRefKey(document.material)
    );
  });
}

function journalScopeValid(world: MechanicsWorld): boolean {
  const scopeKey = materialRefKey(world.scope);
  if (world.scope.kind === "character-play") {
    return (
      world.documents.length === 1 &&
      materialRefKey(world.documents[0]?.material as MaterialRef) === scopeKey
    );
  }
  return world.documents.every(
    (document) =>
      materialRefKey(document.material) === scopeKey ||
      document.material.kind === "character-play"
  );
}

function mutationSortKey(mutation: ActionMutation): string {
  return `${materialRefKey(mutation.target)}\u0000${JSON.stringify(mutation.path)}`;
}

function factSortKey(fact: ActionFactGuard): string {
  return `${journalActorRefKey(fact.owner)}\u0000${JSON.stringify(fact.address)}`;
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Compile one already-simulated mechanics transition into the sole persisted
 * action form. Every document used to prove cross-document invariants is guarded,
 * even when it has no mutation.
 */
export function planMechanicsWorldAction(
  beforeValue: Readonly<MechanicsWorld>,
  afterValue: Readonly<MechanicsWorld>,
  identity: MechanicsActionIdentity
): MechanicsActionPlanResult {
  const beforeResult = parseMechanicsWorld(beforeValue);
  if (!beforeResult.ok) return { status: "rejected", reason: "invalid-before" };
  const afterResult = parseMechanicsWorld(afterValue);
  if (!afterResult.ok) return { status: "rejected", reason: "invalid-after" };
  const before = beforeResult.value;
  const after = afterResult.value;
  if (!sameWorldIdentity(before, after)) {
    return { status: "rejected", reason: "world-mismatch" };
  }
  if (!journalScopeValid(before)) {
    return { status: "rejected", reason: "invalid-scope" };
  }

  const mutations: ActionMutation[] = [];
  for (let index = 0; index < before.documents.length; index += 1) {
    const source = before.documents[index];
    const candidate = after.documents[index];
    if (!source || !candidate) {
      return { status: "rejected", reason: "world-mismatch" };
    }
    if (!protectedFieldsMatch(source.state, candidate.state)) {
      return { status: "rejected", reason: "protected-change" };
    }
    const sourceState = source.state as unknown as JsonObject;
    const candidateState = candidate.state as unknown as JsonObject;
    const keys = [
      ...new Set([...Object.keys(sourceState), ...Object.keys(candidateState)]),
    ]
      .filter((key) => !PROTECTED_ROOT_SET.has(key))
      .sort();
    for (const key of keys) {
      appendDiff(
        source.material,
        [key],
        Object.hasOwn(sourceState, key),
        sourceState[key],
        Object.hasOwn(candidateState, key),
        candidateState[key],
        mutations
      );
    }
  }
  if (mutations.length === 0) return { status: "no-change" };
  mutations.sort((left, right) =>
    compareKeys(mutationSortKey(left), mutationSortKey(right))
  );

  const documents = before.documents.map((document) => ({
    material: structuredClone(document.material),
    epoch: document.state.epoch,
    revision: document.state.revision,
  }));
  const facts = [...(identity.facts ?? [])]
    .map((fact) => structuredClone(fact))
    .sort((left, right) => compareKeys(factSortKey(left), factSortKey(right)));
  const action: JournalActionDraft = {
    id: identity.id,
    actor: structuredClone(identity.actor),
    guards: { documents, facts },
    mutations,
  };
  return isJournalAction({ ...action, generation: 1 })
    ? { status: "planned", action }
    : { status: "rejected", reason: "invalid-action" };
}
