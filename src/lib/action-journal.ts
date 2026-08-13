import { canonicalJson } from "@/lib/canonical-fingerprint";
import type { EntityRef, MaterialRef } from "@/types/mechanics-reference";
import type {
  ActionDocumentGuard,
  ActionFactGuard,
  ActionJournal,
  ActionJournalReset,
  ActionJournalResetResult,
  ActionJournalTransition,
  ActionJournalTransitionResult,
  ActionJournalWorld,
  ActionMutation,
  JournalAction,
  JournalActionDraft,
  JournalActorRef,
  JournalMaterialDocument,
  JournalPath,
  JsonValue,
  ResolvedActionFact,
  StoredValue,
} from "@/types/action-journal";

export const ACTION_JOURNAL_MAX_ACTIONS = 20;
export const ACTION_JOURNAL_MAX_BYTES = 256 * 1024;
export const ACTION_JOURNAL_MAX_PATH_DEPTH = 16;

const MAX_COLLECTION_LENGTH = 1_024;
const MAX_STRING_LENGTH = 1_024;
const MAX_PATH_SEGMENT_LENGTH = 256;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ENGINE_ROOTS = new Set(["schema", "buildRevision", "epoch", "revision", "actions"]);

type UnknownRecord = Record<string, unknown>;

function isSafeCounter(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    typeof value === "number" &&
    value >= 0 &&
    !Object.is(value, -0)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= MAX_STRING_LENGTH
  );
}

function hasPlainPrototype(value: object): boolean {
  return Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyDataProperties(value: object, expected: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expected.length ||
    ownKeys.some((key) => typeof key !== "string")
  ) {
    return false;
  }
  const actual = (ownKeys as string[]).sort();
  const wanted = [...expected].sort();
  if (actual.some((key, index) => key !== wanted[index])) return false;
  return actual.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function isExactRecord(value: unknown, keys: readonly string[]): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    hasPlainPrototype(value) &&
    hasOnlyDataProperties(value, keys)
  );
}

function recordValue(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value as unknown;
}

function isDensePlainArray(
  value: unknown,
  maxLength = MAX_COLLECTION_LENGTH
): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    return false;
  if (value.length > maxLength) return false;
  const expected = Array.from({ length: value.length }, (_, index) => String(index));
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== expected.length + 1 || ownKeys.at(-1) !== "length") return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (ownKeys[index] !== expected[index]) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, expected[index] ?? "");
    if (descriptor?.enumerable !== true || !("value" in descriptor)) return false;
  }
  return true;
}

function isJsonValue(
  value: unknown,
  ancestors = new WeakSet<object>()
): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);

  let valid: boolean;
  if (Array.isArray(value)) {
    valid = isDensePlainArray(value, Number.MAX_SAFE_INTEGER);
    if (valid) {
      for (const item of value) {
        if (!isJsonValue(item, ancestors)) {
          valid = false;
          break;
        }
      }
    }
  } else {
    valid = hasPlainPrototype(value);
    if (valid) {
      const keys = Reflect.ownKeys(value);
      valid = keys.every((key) => {
        if (typeof key !== "string" || UNSAFE_KEYS.has(key)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return (
          descriptor?.enumerable === true &&
          "value" in descriptor &&
          isJsonValue(descriptor.value, ancestors)
        );
      });
    }
  }

  ancestors.delete(value);
  return valid;
}

function isMaterialRef(value: unknown): value is MaterialRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const kind = recordValue(value, "kind");
  if (kind === "character-play") {
    if (!isExactRecord(value, ["kind", "uid", "characterId"])) return false;
    return isNonEmptyString(value.uid) && isNonEmptyString(value.characterId);
  }
  return (
    kind === "shared-combat" &&
    isExactRecord(value, ["kind", "campaignId"]) &&
    isNonEmptyString(value.campaignId)
  );
}

function isEntityRef(value: unknown): value is EntityRef {
  return (
    isExactRecord(value, ["material", "entityId"]) &&
    isMaterialRef(value.material) &&
    isNonEmptyString(value.entityId)
  );
}

function isJournalActorRef(value: unknown): value is JournalActorRef {
  if (isEntityRef(value)) return true;
  return (
    isExactRecord(value, ["kind", "material", "authority"]) &&
    value.kind === "material-authority" &&
    isMaterialRef(value.material) &&
    (value.authority === "table" || value.authority === "environment")
  );
}

function isStoredValue(value: unknown): value is StoredValue {
  if (isExactRecord(value, ["present"]) && value.present === false) return true;
  return (
    isExactRecord(value, ["present", "value"]) &&
    value.present === true &&
    isJsonValue(value.value)
  );
}

function isPath(value: unknown): value is JournalPath {
  return (
    isDensePlainArray(value, ACTION_JOURNAL_MAX_PATH_DEPTH) &&
    value.length > 0 &&
    value.every(
      (segment) =>
        typeof segment === "string" &&
        segment.length > 0 &&
        segment.length <= MAX_PATH_SEGMENT_LENGTH &&
        !UNSAFE_KEYS.has(segment)
    )
  );
}

function storedValueEqual(left: StoredValue, right: StoredValue): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function materialRefKey(material: MaterialRef): string {
  return canonicalJson(material);
}

export function entityRefKey(owner: EntityRef): string {
  return canonicalJson(owner);
}

export function journalActorRefKey(owner: JournalActorRef): string {
  return canonicalJson(owner);
}

function pathKey(path: JournalPath): string {
  return canonicalJson(path);
}

function factKey(fact: Pick<ActionFactGuard, "owner" | "address">): string {
  return `${journalActorRefKey(fact.owner)}\u0000${pathKey(fact.address)}`;
}

function compareByKey<T>(values: readonly T[], key: (value: T) => string): boolean {
  let previous: string | undefined;
  for (const value of values) {
    const current = key(value);
    if (previous !== undefined && previous >= current) return false;
    previous = current;
  }
  return true;
}

function isDocumentGuard(value: unknown): value is ActionDocumentGuard {
  return (
    isExactRecord(value, ["material", "epoch", "revision"]) &&
    isMaterialRef(value.material) &&
    isSafeCounter(value.epoch) &&
    isSafeCounter(value.revision)
  );
}

function isFactGuard(value: unknown): value is ActionFactGuard {
  return (
    isExactRecord(value, ["owner", "address", "expected", "lifecycle"]) &&
    isJournalActorRef(value.owner) &&
    isPath(value.address) &&
    isStoredValue(value.expected) &&
    (value.lifecycle === "commit" || value.lifecycle === "commit-redo")
  );
}

/** Exact hostile-input boundary for semantic facts observed by an action plan. */
export function conformActionFactGuard(value: unknown): Readonly<ActionFactGuard> | null {
  return isFactGuard(value) ? structuredClone(value) : null;
}

function isMutation(value: unknown): value is ActionMutation {
  return (
    isExactRecord(value, ["target", "path", "before", "after"]) &&
    isMaterialRef(value.target) &&
    isPath(value.path) &&
    !ENGINE_ROOTS.has(value.path[0]) &&
    isStoredValue(value.before) &&
    isStoredValue(value.after) &&
    !storedValueEqual(value.before, value.after)
  );
}

function ownerMaterialKey(owner: JournalActorRef): string {
  return materialRefKey(owner.material);
}

function pathsOverlap(left: JournalPath, right: JournalPath): boolean {
  const short = Math.min(left.length, right.length);
  for (let index = 0; index < short; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function isActionStructure(value: unknown): value is JournalAction {
  if (
    !isExactRecord(value, ["id", "generation", "actor", "guards", "mutations"]) ||
    !isNonEmptyString(value.id) ||
    !isSafeCounter(value.generation) ||
    value.generation === 0 ||
    !isJournalActorRef(value.actor) ||
    !isExactRecord(value.guards, ["documents", "facts"]) ||
    !isDensePlainArray(value.guards.documents) ||
    value.guards.documents.length === 0 ||
    !value.guards.documents.every(isDocumentGuard) ||
    !compareByKey(value.guards.documents, (guard) => materialRefKey(guard.material)) ||
    !isDensePlainArray(value.guards.facts) ||
    !value.guards.facts.every(isFactGuard) ||
    !compareByKey(value.guards.facts, factKey) ||
    !isDensePlainArray(value.mutations) ||
    value.mutations.length === 0 ||
    !value.mutations.every(isMutation)
  ) {
    return false;
  }

  const documentKeys = new Set(
    value.guards.documents.map((guard) => materialRefKey(guard.material))
  );
  const actorKey = ownerMaterialKey(value.actor);
  if (!documentKeys.has(actorKey)) return false;
  for (const fact of value.guards.facts) {
    if (!documentKeys.has(ownerMaterialKey(fact.owner))) return false;
  }

  const mutationKeys = value.mutations.map(
    (mutation) => `${materialRefKey(mutation.target)}\u0000${pathKey(mutation.path)}`
  );
  if (
    mutationKeys.some((key, index) => index > 0 && (mutationKeys[index - 1] ?? "") >= key)
  ) {
    return false;
  }
  for (let index = 0; index < value.mutations.length; index += 1) {
    const mutation = value.mutations[index];
    if (!mutation || !documentKeys.has(materialRefKey(mutation.target))) return false;
    for (let other = index + 1; other < value.mutations.length; other += 1) {
      const candidate = value.mutations[other];
      if (!candidate) return false;
      if (materialRefKey(candidate.target) !== materialRefKey(mutation.target)) break;
      if (pathsOverlap(mutation.path, candidate.path)) return false;
    }
  }
  return true;
}

function actionFits(action: JournalAction): boolean {
  return (
    new TextEncoder().encode(
      canonicalJson({ ...action, generation: Number.MAX_SAFE_INTEGER })
    ).byteLength <= ACTION_JOURNAL_MAX_BYTES
  );
}

function isAction(value: unknown): value is JournalAction {
  return isActionStructure(value) && actionFits(value);
}

function isActionDraft(value: unknown): value is JournalActionDraft {
  if (!isExactRecord(value, ["id", "actor", "guards", "mutations"])) return false;
  return isActionStructure({ ...value, generation: 1 });
}

function actionBody(action: JournalAction | JournalActionDraft): string {
  return canonicalJson({
    id: action.id,
    actor: action.actor,
    guards: action.guards,
    mutations: action.mutations,
  });
}

export function actionJournalCanonicalJson(journal: ActionJournal): string {
  return canonicalJson(journal);
}

export function actionJournalByteLength(journal: ActionJournal): number {
  return new TextEncoder().encode(actionJournalCanonicalJson(journal)).byteLength;
}

function worstCaseJournal(journal: ActionJournal): ActionJournal {
  return {
    epoch: Number.MAX_SAFE_INTEGER,
    revision: Number.MAX_SAFE_INTEGER,
    actions: journal.actions.map((action) => ({
      ...action,
      generation: Number.MAX_SAFE_INTEGER,
    })),
  };
}

function journalFits(journal: ActionJournal): boolean {
  return (
    journal.actions.length <= ACTION_JOURNAL_MAX_ACTIONS &&
    actionJournalByteLength(journal) <= ACTION_JOURNAL_MAX_BYTES &&
    actionJournalByteLength(worstCaseJournal(journal)) <= ACTION_JOURNAL_MAX_BYTES
  );
}

export function isActionJournal(value: unknown): value is ActionJournal {
  if (
    !isExactRecord(value, ["epoch", "revision", "actions"]) ||
    !isSafeCounter(value.epoch) ||
    !isSafeCounter(value.revision) ||
    !isDensePlainArray(value.actions, ACTION_JOURNAL_MAX_ACTIONS) ||
    !value.actions.every(isAction)
  ) {
    return false;
  }
  const ids = new Set<string>();
  let reachedUndoneSuffix = false;
  for (const action of value.actions) {
    if (ids.has(action.id)) return false;
    ids.add(action.id);
    if (action.generation % 2 === 0) reachedUndoneSuffix = true;
    else if (reachedUndoneSuffix) return false;
  }
  return journalFits({
    epoch: value.epoch,
    revision: value.revision,
    actions: value.actions,
  });
}

export function isJournalAction(value: unknown): value is JournalAction {
  return isAction(value);
}

function isJsonObject(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    hasPlainPrototype(value) &&
    isJsonValue(value)
  );
}

function isMaterialDocument(value: unknown): value is JournalMaterialDocument {
  return (
    isExactRecord(value, ["material", "journal", "data"]) &&
    isMaterialRef(value.material) &&
    isActionJournal(value.journal) &&
    isJsonObject(value.data)
  );
}

export function isActionJournalWorld(value: unknown): value is ActionJournalWorld {
  if (
    !isExactRecord(value, ["scope", "documents"]) ||
    !isMaterialRef(value.scope) ||
    !isDensePlainArray(value.documents) ||
    value.documents.length === 0 ||
    !value.documents.every(isMaterialDocument) ||
    !compareByKey(value.documents, (document) => materialRefKey(document.material))
  ) {
    return false;
  }
  const scope = value.scope;
  const scopeKey = materialRefKey(scope);
  const scopeDocuments = value.documents.filter(
    (document) => materialRefKey(document.material) === scopeKey
  );
  if (scopeDocuments.length !== 1) return false;
  if (scope.kind === "character-play" && value.documents.length !== 1) return false;
  if (
    !value.documents.every(
      (document) =>
        materialRefKey(document.material) === scopeKey ||
        (scope.kind === "shared-combat" && document.material.kind === "character-play")
    )
  ) {
    return false;
  }
  return true;
}

function isResolvedFact(value: unknown): value is ResolvedActionFact {
  return (
    isExactRecord(value, ["owner", "address", "actual"]) &&
    isJournalActorRef(value.owner) &&
    isPath(value.address) &&
    isStoredValue(value.actual)
  );
}

function isResolvedFacts(value: unknown): value is readonly ResolvedActionFact[] {
  return (
    isDensePlainArray(value) &&
    value.every(isResolvedFact) &&
    compareByKey(value, factKey)
  );
}

function isTransition(value: unknown): value is ActionJournalTransition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const kind = recordValue(value, "kind");
  if (kind === "commit") {
    return (
      isExactRecord(value, ["kind", "action"]) &&
      isActionDraft(recordValue(value, "action"))
    );
  }
  if (kind !== "undo" && kind !== "redo") return false;
  const documentValue = recordValue(value, "documents");
  if (
    !isExactRecord(value, ["kind", "action", "expectedGeneration", "documents"]) ||
    !isActionDraft(recordValue(value, "action")) ||
    !isSafeCounter(recordValue(value, "expectedGeneration")) ||
    !isDensePlainArray(documentValue) ||
    !documentValue.every(isDocumentGuard) ||
    !compareByKey(documentValue, (guard) => materialRefKey(guard.material))
  ) {
    return false;
  }
  const expectedGeneration = recordValue(value, "expectedGeneration");
  if (typeof expectedGeneration !== "number" || expectedGeneration === 0) return false;
  return kind === "undo" ? expectedGeneration % 2 === 1 : expectedGeneration % 2 === 0;
}

function scopeDocument(world: ActionJournalWorld): JournalMaterialDocument {
  const key = materialRefKey(world.scope);
  const found = world.documents.find(
    (document) => materialRefKey(document.material) === key
  );
  if (!found) throw new Error("Validated journal world has no scope document");
  return found;
}

function rejected(
  world: ActionJournalWorld,
  reason: Extract<ActionJournalTransitionResult, { status: "rejected" }>["reason"]
): ActionJournalTransitionResult {
  return { status: "rejected", reason, world };
}

function resetRejected(
  world: ActionJournalWorld,
  reason: Extract<ActionJournalResetResult, { status: "rejected" }>["reason"]
): ActionJournalResetResult {
  return { status: "rejected", reason, world };
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (current: unknown): void => {
    if (typeof current !== "object" || current === null || Object.isFrozen(current))
      return;
    for (const child of Object.values(current)) freeze(child);
    Object.freeze(current);
  };
  freeze(clone);
  return clone;
}

function documentMap(world: ActionJournalWorld): Map<string, JournalMaterialDocument> {
  return new Map(
    world.documents.map((document) => [
      materialRefKey(document.material),
      structuredClone(document),
    ])
  );
}

function actualAtPath(
  data: Readonly<Record<string, JsonValue>>,
  path: JournalPath
): StoredValue | null {
  let parent: Readonly<Record<string, JsonValue>> = data;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!segment || !Object.hasOwn(parent, segment)) return null;
    const child = parent[segment];
    if (
      typeof child !== "object" ||
      child === null ||
      Array.isArray(child) ||
      !hasPlainPrototype(child)
    ) {
      return null;
    }
    parent = child as Readonly<Record<string, JsonValue>>;
  }
  const leaf = path.at(-1);
  if (!leaf) return null;
  return Object.hasOwn(parent, leaf)
    ? { present: true, value: parent[leaf] ?? null }
    : { present: false };
}

function setAtPath(
  data: Record<string, JsonValue>,
  path: JournalPath,
  next: StoredValue
): boolean {
  let parent = data;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (!segment) return false;
    const child = parent[segment];
    if (
      typeof child !== "object" ||
      child === null ||
      Array.isArray(child) ||
      !hasPlainPrototype(child)
    ) {
      return false;
    }
    parent = child as Record<string, JsonValue>;
  }
  const leaf = path.at(-1);
  if (!leaf) return false;
  if (next.present) parent[leaf] = structuredClone(next.value);
  else Reflect.deleteProperty(parent, leaf);
  return true;
}

function validateDocumentFences(
  world: ActionJournalWorld,
  fences: readonly ActionDocumentGuard[],
  original: readonly ActionDocumentGuard[] = fences
): boolean {
  const documents = new Map(
    world.documents.map((document) => [materialRefKey(document.material), document])
  );
  if (
    !fences.some(
      (guard) => materialRefKey(guard.material) === materialRefKey(world.scope)
    )
  ) {
    return false;
  }
  if (fences.length !== original.length) return false;
  for (let index = 0; index < fences.length; index += 1) {
    const fence = fences[index];
    const planned = original[index];
    if (
      !fence ||
      !planned ||
      materialRefKey(fence.material) !== materialRefKey(planned.material) ||
      fence.epoch !== planned.epoch
    ) {
      return false;
    }
    const document = documents.get(materialRefKey(fence.material));
    if (
      !document ||
      document.journal.epoch !== fence.epoch ||
      document.journal.revision !== fence.revision
    ) {
      return false;
    }
  }
  return true;
}

function validateFacts(
  guards: readonly ActionFactGuard[],
  facts: readonly ResolvedActionFact[]
): boolean {
  const resolved = new Map(facts.map((fact) => [factKey(fact), fact.actual]));
  if (facts.length !== guards.length) return false;
  for (const guard of guards) {
    const actual = resolved.get(factKey(guard));
    if (!actual || !storedValueEqual(actual, guard.expected)) return false;
  }
  return true;
}

function mutationConflict(
  documents: ReadonlyMap<string, JournalMaterialDocument>,
  mutations: readonly ActionMutation[],
  direction: "forward" | "reverse"
): boolean {
  return mutations.some((mutation) => {
    const document = documents.get(materialRefKey(mutation.target));
    if (!document) return true;
    const actual = actualAtPath(document.data, mutation.path);
    const expected = direction === "forward" ? mutation.before : mutation.after;
    return actual === null || !storedValueEqual(actual, expected);
  });
}

function applyTransition(
  world: ActionJournalWorld,
  actions: readonly JournalAction[],
  mutations: readonly ActionMutation[],
  direction: "forward" | "reverse"
): ActionJournalWorld | null {
  const documents = documentMap(world);
  const touched = new Set<string>([materialRefKey(world.scope)]);
  for (const mutation of mutations) touched.add(materialRefKey(mutation.target));
  for (const key of touched) {
    const document = documents.get(key);
    if (!document || document.journal.revision === Number.MAX_SAFE_INTEGER) return null;
  }
  for (const mutation of mutations) {
    const document = documents.get(materialRefKey(mutation.target));
    if (!document) return null;
    const next = direction === "forward" ? mutation.after : mutation.before;
    if (!setAtPath(document.data, mutation.path, next)) return null;
  }
  const scopeKey = materialRefKey(world.scope);
  for (const key of touched) {
    const document = documents.get(key);
    if (!document) return null;
    document.journal = {
      ...document.journal,
      revision: document.journal.revision + 1,
      ...(key === scopeKey ? { actions } : {}),
    };
  }
  return immutable({ scope: world.scope, documents: [...documents.values()] });
}

function transitionBoundary(actions: readonly JournalAction[]): number {
  const firstUndone = actions.findIndex((action) => action.generation % 2 === 0);
  return firstUndone === -1 ? actions.length : firstUndone;
}

function boundedCommittedActions(
  scope: JournalMaterialDocument,
  actions: readonly JournalAction[],
  committedActionId: string
): { actions: readonly JournalAction[]; evicted: readonly string[] } | null {
  const retained = [...actions];
  const evicted: string[] = [];
  while (
    retained.length > ACTION_JOURNAL_MAX_ACTIONS ||
    !journalFits({
      epoch: scope.journal.epoch,
      revision: scope.journal.revision + 1,
      actions: retained,
    })
  ) {
    const oldest = retained[0];
    if (!oldest || oldest.id === committedActionId || oldest.generation % 2 === 0)
      return null;
    retained.shift();
    evicted.push(oldest.id);
  }
  return { actions: retained, evicted };
}

export function reduceActionJournal(
  world: ActionJournalWorld,
  transition: ActionJournalTransition,
  facts: readonly ResolvedActionFact[]
): ActionJournalTransitionResult {
  if (!isActionJournalWorld(world)) return rejected(world, "invalid-world");
  if (!isResolvedFacts(facts)) return rejected(world, "invalid-facts");
  if (!isTransition(transition)) return rejected(world, "invalid-transition");

  const scope = scopeDocument(world);

  if (transition.kind === "commit") {
    const existing = scope.journal.actions.find(
      (action) => action.id === transition.action.id
    );
    if (existing) {
      if (actionBody(existing) !== actionBody(transition.action)) {
        return rejected(world, "action-collision");
      }
      if (existing.generation === 1) {
        return {
          status: "already-applied",
          world,
          actionId: existing.id,
          generation: existing.generation,
          evictedActionIds: [],
        };
      }
      return rejected(world, "generation-conflict");
    }
    const action = immutable({ ...transition.action, generation: 1 });
    if (!isActionStructure(action)) return rejected(world, "invalid-action");
    if (!actionFits(action)) return rejected(world, "journal-overflow");
    if (!validateDocumentFences(world, action.guards.documents)) {
      return rejected(world, "document-conflict");
    }
    if (!validateFacts(action.guards.facts, facts)) {
      return rejected(world, "fact-conflict");
    }
    const documents = new Map(
      world.documents.map((document) => [materialRefKey(document.material), document])
    );
    if (mutationConflict(documents, action.mutations, "forward")) {
      return rejected(world, "mutation-conflict");
    }
    const boundary = transitionBoundary(scope.journal.actions);
    const branched = [...scope.journal.actions.slice(0, boundary), action];
    const bounded = boundedCommittedActions(scope, branched, action.id);
    if (!bounded) return rejected(world, "journal-overflow");
    const nextWorld = applyTransition(
      world,
      bounded.actions,
      action.mutations,
      "forward"
    );
    if (!nextWorld) return rejected(world, "journal-overflow");
    return {
      status: "applied",
      world: nextWorld,
      actionId: action.id,
      generation: 1,
      evictedActionIds: bounded.evicted,
    };
  }

  const existing = scope.journal.actions.find(
    (action) => action.id === transition.action.id
  );
  if (existing && actionBody(existing) !== actionBody(transition.action)) {
    return rejected(world, "action-collision");
  }
  if (existing && existing.generation === transition.expectedGeneration + 1) {
    return {
      status: "already-applied",
      world,
      actionId: existing.id,
      generation: existing.generation,
      evictedActionIds: [],
    };
  }
  if (existing && existing.generation !== transition.expectedGeneration) {
    return rejected(world, "generation-conflict");
  }
  if (
    !validateDocumentFences(
      world,
      transition.documents,
      existing?.guards.documents ?? transition.action.guards.documents
    )
  ) {
    return rejected(world, "document-conflict");
  }
  if (!existing) return rejected(world, "action-not-found");
  if (existing.generation === Number.MAX_SAFE_INTEGER) {
    return rejected(world, "generation-conflict");
  }

  const boundary = transitionBoundary(scope.journal.actions);
  const actionIndex = scope.journal.actions.indexOf(existing);
  const expectedIndex = transition.kind === "undo" ? boundary - 1 : boundary;
  if (actionIndex !== expectedIndex) return rejected(world, "branch-conflict");
  if (transition.kind === "redo") {
    const redoGuards = existing.guards.facts.filter(
      (guard) => guard.lifecycle === "commit-redo"
    );
    if (!validateFacts(redoGuards, facts)) {
      return rejected(world, "fact-conflict");
    }
  }
  const direction = transition.kind === "undo" ? "reverse" : "forward";
  const documents = new Map(
    world.documents.map((document) => [materialRefKey(document.material), document])
  );
  if (mutationConflict(documents, existing.mutations, direction)) {
    return rejected(world, "mutation-conflict");
  }
  const generation = existing.generation + 1;
  const actions = scope.journal.actions.map((action) =>
    action.id === existing.id ? immutable({ ...action, generation }) : action
  );
  const candidateJournal = {
    epoch: scope.journal.epoch,
    revision: scope.journal.revision + 1,
    actions,
  };
  if (!journalFits(candidateJournal)) return rejected(world, "journal-overflow");
  const nextWorld = applyTransition(world, actions, existing.mutations, direction);
  if (!nextWorld) return rejected(world, "journal-overflow");
  return {
    status: "applied",
    world: nextWorld,
    actionId: existing.id,
    generation,
    evictedActionIds: [],
  };
}

export function resetActionJournal(
  world: ActionJournalWorld,
  reset: ActionJournalReset
): ActionJournalResetResult {
  if (!isActionJournalWorld(world)) return resetRejected(world, "invalid-world");
  if (
    !isExactRecord(reset, ["epoch", "expectedRevision"]) ||
    !isSafeCounter(reset.epoch) ||
    !isSafeCounter(reset.expectedRevision)
  ) {
    return resetRejected(world, "invalid-transition");
  }
  const scope = scopeDocument(world);
  if (
    scope.journal.epoch === reset.epoch + 1 &&
    scope.journal.revision === reset.expectedRevision + 1 &&
    scope.journal.actions.length === 0
  ) {
    return { status: "already-applied", world };
  }
  if (scope.journal.epoch !== reset.epoch) return resetRejected(world, "epoch-conflict");
  if (scope.journal.revision !== reset.expectedRevision) {
    return resetRejected(world, "revision-conflict");
  }
  if (
    scope.journal.epoch === Number.MAX_SAFE_INTEGER ||
    scope.journal.revision === Number.MAX_SAFE_INTEGER
  ) {
    return resetRejected(world, "journal-overflow");
  }
  const documents = documentMap(world);
  const document = documents.get(materialRefKey(world.scope));
  if (!document) return resetRejected(world, "invalid-world");
  document.journal = {
    epoch: document.journal.epoch + 1,
    revision: document.journal.revision + 1,
    actions: [],
  };
  return {
    status: "applied",
    world: immutable({ scope: world.scope, documents: [...documents.values()] }),
  };
}
