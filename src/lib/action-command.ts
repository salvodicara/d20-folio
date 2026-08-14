/**
 * Storage-neutral outer transaction for one resolved action.
 *
 * Rule-specific planners lower their exact writes into owned JSON addresses.
 * The combat-effect command stays opaque: a production adapter must execute
 * that nested receipt inside the same transaction as every other leg.
 */

import {
  atomicDocumentForOwner,
  atomicDocumentKey,
  atomicLedgerForOwner,
  atomicOwnerKey,
  type AtomicDocumentRef,
  type AtomicOwner,
} from "@/lib/combat-effect-atomic";
import {
  materializeCombatEffectCommandBatch,
  type CombatEffectCommandBatch,
  type CombatEffectCommandBatchPolicy,
  type CombatEffectCommandReceipt,
} from "@/lib/combat-effect-command";

type JsonPrimitive = string | number | boolean | null;
export type ActionJson =
  | JsonPrimitive
  | ReadonlyArray<ActionJson>
  | { readonly [key: string]: ActionJson };
export type ActionJsonObject = { readonly [key: string]: ActionJson };

export type ActionCommandSurface = AtomicOwner["surface"];
export type ActionCausalState = "committed" | "undone";
export type ActionTransitionPolicy = "initial" | "undo" | "redo";
export type ActionTransitionDirection = "forward" | "reverse";
export type ActionDurability = "server-confirmed" | "local-pending";

export interface ActionFieldValue {
  present: boolean;
  value?: ActionJson;
}

/** One exact field owned by one physical document. */
export interface ActionOwnedRootByKind {
  occurrence: "occurrence";
  economy: "economy";
  "scalar-payment": "scalarResources";
  "item-payment": "itemResources";
  concentration: "concentration";
  "active-state": "active";
  outcome: "outcomes";
  log: "log";
}

export type ActionOwnedLegKind = keyof ActionOwnedRootByKind;
export type ActionOwnedPath<Kind extends ActionOwnedLegKind = ActionOwnedLegKind> =
  readonly [ActionOwnedRootByKind[Kind], ...string[]];

export interface ActionOwnedChange<Kind extends ActionOwnedLegKind = ActionOwnedLegKind> {
  path: ActionOwnedPath<Kind>;
  expected: ActionFieldValue;
  next: ActionFieldValue;
}

export interface ActionOwnedLegOf<Kind extends ActionOwnedLegKind> {
  id: string;
  kind: Kind;
  owner: AtomicOwner;
  changes: ReadonlyArray<ActionOwnedChange<Kind>>;
}

export type ActionOwnedLeg = {
  [Kind in ActionOwnedLegKind]: ActionOwnedLegOf<Kind>;
}[ActionOwnedLegKind];

/**
 * The outer kernel deliberately does not inspect or reconstruct the nested
 * receipt. `owners` declares the logical entities; their persisted documents
 * are derived deterministically while applying the receipt.
 */
export interface ActionCombatEffectLeg {
  id: string;
  kind: "combat-effect";
  owners: ReadonlyArray<AtomicOwner>;
  receipt: CombatEffectCommandReceipt;
}

export type ActionCommandLeg = ActionOwnedLeg | ActionCombatEffectLeg;

export interface ActionCommandDraft {
  schema: 1;
  commandId: string;
  adapterId: string;
  actor: AtomicOwner;
  predecessor: string | null;
  legs: ReadonlyArray<ActionCommandLeg>;
}

/** Only a ready candidate can cross the mutation boundary. */
export type ActionCommandCandidate =
  | { status: "ready"; command: ActionCommandDraft }
  | { status: "needs-input" }
  | { status: "cancelled" };

export interface ActionCommandReceipt extends ActionCommandDraft {
  payloadIdentity: string;
}

export type ActionCommandPreparation =
  | { status: "prepared"; receipt: ActionCommandReceipt }
  | { status: "not-prepared"; reason: "needs-input" | "cancelled" }
  | { status: "rejected"; reason: "invalid-command" };

export interface ActionCommitTransition {
  schema: 1;
  kind: "commit";
  policy: "initial";
  direction: "forward";
  expectedGeneration: 0;
  receipt: ActionCommandReceipt;
  combatEffectBatch?: Readonly<CombatEffectCommandBatch>;
}

export interface ActionUndoTransition {
  schema: 1;
  kind: "undo";
  policy: "undo";
  direction: "reverse";
  expectedGeneration: number;
  receipt: ActionCommandReceipt;
  combatEffectBatch?: Readonly<CombatEffectCommandBatch>;
}

export interface ActionRedoTransition {
  schema: 1;
  kind: "redo";
  policy: "redo";
  direction: "forward";
  expectedGeneration: number;
  receipt: ActionCommandReceipt;
  combatEffectBatch?: Readonly<CombatEffectCommandBatch>;
}

export type ActionTransition =
  | ActionCommitTransition
  | ActionUndoTransition
  | ActionRedoTransition;

export interface ActionLifecycleRecord {
  payloadIdentity: string;
  actor: AtomicOwner;
  state: ActionCausalState;
  generation: number;
  predecessor: string | null;
}

/** Minimal reference state for a storage adapter or deterministic test double. */
export type ActionAdapterRejection =
  | "missing-document"
  | "stale-state"
  | "causal-conflict"
  | "duplicate-command"
  | "command-collision"
  | "failed";

export type ActionAdapterApplyResult =
  | {
      status: "applied";
      generation: number;
      head: string | null;
      durability: ActionDurability;
    }
  | {
      status: "already-applied";
      payloadIdentity: string;
      generation: number;
      head: string | null;
      durability: ActionDurability;
    }
  | { status: "rejected"; reason: ActionAdapterRejection };

/**
 * The sole write boundary for every leg in one action.
 *
 * Implementations MUST use one storage transaction to stage generic changes
 * and `combatEffectBatch`; they must not invoke the child adapter. Initial
 * execution checks every generic expectation and every child read fact. Undo
 * checks the exact committed owned poststate. Redo checks the exact undone
 * owned state plus the child batch's current semantic facts. A successful
 * transition increments each distinct touched persisted document exactly once.
 * `already-applied` is permitted only after comparing the stored exact payload
 * identity and returning the canonical generation/head for the exact retried
 * transition. A plain `duplicate-command` rejection is not reconciliation.
 * Durability is explicit: shared adapters may report only `server-confirmed`;
 * local adapters may also report an acknowledged `local-pending` write.
 */
export interface ActionCommandAdapter {
  id: string;
  surface: ActionCommandSurface;
  compareAndSwap(
    transition: Readonly<ActionTransition>
  ): ActionAdapterApplyResult | Promise<ActionAdapterApplyResult>;
}

export type ActionCommandExecution =
  | {
      status: "applied" | "already-applied";
      receipt: ActionCommandReceipt;
      generation: number;
      head: string | null;
      durability: ActionDurability;
    }
  | {
      status: "rejected";
      reason:
        | "invalid-transition"
        | "invalid-adapter"
        | "adapter-failure"
        | Exclude<ActionAdapterRejection, "failed">;
    };

const OWNED_LEG_KINDS = [
  "occurrence",
  "economy",
  "scalar-payment",
  "item-payment",
  "concentration",
  "active-state",
  "outcome",
  "log",
] as const satisfies ReadonlyArray<ActionOwnedLegKind>;

/**
 * Generic action legs own only these disjoint roots. HP, temporary HP, death
 * saves, conditions, effects, child lifecycles, and physical revisions belong
 * exclusively to the materialized combat-effect batch in production.
 */
const OWNED_ROOT = {
  occurrence: "occurrence",
  economy: "economy",
  "scalar-payment": "scalarResources",
  "item-payment": "itemResources",
  concentration: "concentration",
  "active-state": "active",
  outcome: "outcomes",
  log: "log",
} as const satisfies ActionOwnedRootByKind;

const LEG_ORDER = [
  "occurrence",
  "economy",
  "scalar-payment",
  "item-payment",
  "concentration",
  "active-state",
  "combat-effect",
  "outcome",
  "log",
] as const satisfies ReadonlyArray<ActionCommandLeg["kind"]>;

const LEG_RANK = new Map(LEG_ORDER.map((kind, index) => [kind, index]));
const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_LEGS = 32;
const MAX_CHANGES_PER_LEG = 64;
const MAX_PATH_DEPTH = 8;
const MAX_ID_LENGTH = 256;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  required: ReadonlyArray<string>,
  optional: ReadonlyArray<string> = []
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function boundedId(value: unknown): value is string {
  return nonEmpty(value) && value.length <= MAX_ID_LENGTH;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

/** Reject accessors, sparse arrays, symbols, prototypes and cycles before reads. */
function jsonPlain(value: unknown, stack = new WeakSet<object>()): value is ActionJson {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || stack.has(value)) return false;
  stack.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const valid =
    Object.getOwnPropertySymbols(value).length === 0 &&
    (Array.isArray(value)
      ? Object.getPrototypeOf(value) === Array.prototype &&
        Object.keys(descriptors).length === value.length + 1 &&
        Object.hasOwn(descriptors, "length") &&
        Array.from(
          { length: value.length },
          (_, index) => descriptors[String(index)]
        ).every(
          (descriptor) =>
            descriptor !== undefined &&
            descriptor.enumerable &&
            "value" in descriptor &&
            jsonPlain(descriptor.value, stack)
        )
      : (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null) &&
        Object.entries(descriptors).every(
          ([key, descriptor]) =>
            key.length > 0 &&
            descriptor.enumerable &&
            "value" in descriptor &&
            jsonPlain(descriptor.value, stack)
        ));
  stack.delete(value);
  return valid;
}

function canonical(value: ActionJson): ActionJson {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const object = value as ActionJsonObject;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key] as ActionJson)])
    );
  }
  return value;
}

function same(left: unknown, right: unknown): boolean {
  return (
    jsonPlain(left) &&
    jsonPlain(right) &&
    JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
  );
}

function freeze<T>(value: T): Readonly<T> {
  const visit = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || Object.isFrozen(entry)) return;
    Object.freeze(entry);
    Object.values(entry).forEach(visit);
  };
  visit(value);
  return value;
}

function cloneFrozen<T>(value: T): Readonly<T> {
  if (!jsonPlain(value)) throw new TypeError("Action command data must be JSON-plain");
  return freeze(structuredClone(value) as T);
}

function ownerKey(value: unknown): string | null {
  try {
    return atomicOwnerKey(value as AtomicOwner);
  } catch {
    return null;
  }
}

function validFieldValue(value: unknown): value is ActionFieldValue {
  return (
    record(value) &&
    typeof value.present === "boolean" &&
    (value.present
      ? exactKeys(value, ["present", "value"]) && jsonPlain(value.value)
      : exactKeys(value, ["present"]))
  );
}

function validPath<Kind extends ActionOwnedLegKind>(
  value: unknown,
  kind: Kind
): value is ActionOwnedPath<Kind> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_PATH_DEPTH &&
    value[0] === OWNED_ROOT[kind] &&
    value.every((segment) => nonEmpty(segment) && !FORBIDDEN_PATH_SEGMENTS.has(segment))
  );
}

function validOwnedChange<Kind extends ActionOwnedLegKind>(
  value: unknown,
  kind: Kind
): value is ActionOwnedChange<Kind> {
  return (
    record(value) &&
    exactKeys(value, ["path", "expected", "next"]) &&
    validPath(value.path, kind) &&
    validFieldValue(value.expected) &&
    validFieldValue(value.next) &&
    !same(value.expected, value.next)
  );
}

function validOwnedLeg(value: unknown): value is ActionOwnedLeg {
  if (
    !record(value) ||
    !(OWNED_LEG_KINDS as ReadonlyArray<unknown>).includes(value.kind)
  ) {
    return false;
  }
  const kind = value.kind as ActionOwnedLegKind;
  return (
    exactKeys(value, ["id", "kind", "owner", "changes"]) &&
    boundedId(value.id) &&
    ownerKey(value.owner) !== null &&
    Array.isArray(value.changes) &&
    value.changes.length > 0 &&
    value.changes.length <= MAX_CHANGES_PER_LEG &&
    value.changes.every((change) => validOwnedChange(change, kind))
  );
}

function validEffectLeg(value: unknown): value is ActionCombatEffectLeg {
  if (
    !record(value) ||
    value.kind !== "combat-effect" ||
    !exactKeys(value, ["id", "kind", "owners", "receipt"]) ||
    !boundedId(value.id) ||
    !Array.isArray(value.owners) ||
    value.owners.length === 0 ||
    !record(value.receipt) ||
    !jsonPlain(value.receipt)
  ) {
    return false;
  }
  const keys = value.owners.map(ownerKey);
  return (
    keys.every((key): key is string => key !== null) && new Set(keys).size === keys.length
  );
}

function validLeg(value: unknown): value is ActionCommandLeg {
  return validEffectLeg(value) || validOwnedLeg(value);
}

function changeKey(owner: AtomicOwner, path: ReadonlyArray<string>): string {
  const encodedPath = path.map((part) => `${part.length}:${part}`).join("|");
  return `${atomicOwnerKey(owner)}|${encodedPath}`;
}

/** Repeated ownership is legal only when each leg starts at the prior exact end. */
function changesAreContinuous(legs: ReadonlyArray<ActionCommandLeg>): boolean {
  const prior = new Map<string, ActionFieldValue>();
  for (const leg of legs) {
    if (leg.kind === "combat-effect") continue;
    for (const change of leg.changes) {
      const key = changeKey(leg.owner, change.path);
      const expected = prior.get(key);
      if (expected && !same(expected, change.expected)) return false;
      prior.set(key, change.next);
    }
  }
  return true;
}

function legOwners(leg: Readonly<ActionCommandLeg>): ReadonlyArray<AtomicOwner> {
  return leg.kind === "combat-effect" ? leg.owners : [leg.owner];
}

function ownerIsInActorScope(
  actor: Readonly<AtomicOwner>,
  owner: Readonly<AtomicOwner>
): boolean {
  if (actor.surface === "local") {
    return owner.surface === "local" && owner.uid === actor.uid;
  }
  return (
    owner.surface === "shared" &&
    owner.campaignId === actor.campaignId &&
    owner.encounterEpoch === actor.encounterEpoch
  );
}

function materializedEffectBatch(
  receipt: Readonly<ActionCommandReceipt | ActionCommandDraft>,
  policy: CombatEffectCommandBatchPolicy
): Readonly<CombatEffectCommandBatch> | null {
  const effect = receipt.legs.find(
    (leg): leg is ActionCombatEffectLeg => leg.kind === "combat-effect"
  );
  if (!effect) return null;
  const result = materializeCombatEffectCommandBatch(effect.receipt, policy);
  return result.status === "prepared" ? result.batch : null;
}

function effectLegMatchesCommand(
  command: Readonly<ActionCommandDraft>,
  effect: Readonly<ActionCombatEffectLeg>
): boolean {
  const batch = materializedEffectBatch(command, "initial");
  if (
    !batch ||
    batch.adapterId !== command.adapterId ||
    batch.surface !== command.actor.surface
  ) {
    return false;
  }
  const declared = effect.owners.map(atomicOwnerKey);
  const materialized = [
    ...new Set(batch.readSet.bindings.map(({ owner }) => atomicOwnerKey(owner))),
  ].sort(compareCodeUnits);
  const nestedRevisionReads = batch.readSet.reads.filter(
    (read) => read.address.kind === "document-revision"
  );
  const requiredDocuments = [
    ...new Set(
      batch.readSet.bindings.flatMap(({ owner }) => [
        atomicDocumentKey(atomicDocumentForOwner(owner)),
        atomicDocumentKey(atomicLedgerForOwner(owner)),
      ])
    ),
  ].sort(compareCodeUnits);
  return (
    same(declared, materialized) &&
    same(
      nestedRevisionReads
        .map(({ address }) =>
          address.kind === "document-revision" ? atomicDocumentKey(address.document) : ""
        )
        .sort(compareCodeUnits),
      requiredDocuments
    )
  );
}

function initialDocumentRevisions(
  command: Readonly<ActionCommandDraft>
): ReadonlyMap<string, number> | null {
  const revisions = new Map<string, number>();
  const add = (document: Readonly<AtomicDocumentRef>, revision: number): boolean => {
    const key = atomicDocumentKey(document);
    const prior = revisions.get(key);
    if (prior !== undefined && prior !== revision) return false;
    revisions.set(key, revision);
    return true;
  };
  const batch = materializedEffectBatch(command, "initial");
  if (batch) {
    for (const read of batch.readSet.reads) {
      if (read.address.kind !== "document-revision") continue;
      if (typeof read.expected !== "number" || !add(read.address.document, read.expected))
        return null;
    }
  }
  for (const leg of command.legs) {
    if (
      leg.kind !== "combat-effect" &&
      !revisions.has(atomicDocumentKey(atomicDocumentForOwner(leg.owner)))
    ) {
      return null;
    }
  }
  return revisions;
}

function validCommandShape(value: unknown): value is ActionCommandDraft {
  if (
    !record(value) ||
    !jsonPlain(value) ||
    !exactKeys(value, [
      "schema",
      "commandId",
      "adapterId",
      "actor",
      "predecessor",
      "legs",
    ]) ||
    value.schema !== 1 ||
    !boundedId(value.commandId) ||
    !boundedId(value.adapterId) ||
    ownerKey(value.actor) === null ||
    (value.predecessor !== null && !boundedId(value.predecessor)) ||
    value.predecessor === value.commandId ||
    !Array.isArray(value.legs) ||
    value.legs.length === 0 ||
    value.legs.length > MAX_LEGS ||
    !value.legs.every(validLeg)
  ) {
    return false;
  }
  const command = value as unknown as ActionCommandDraft;
  const actorKey = atomicOwnerKey(command.actor);
  const ids = new Set<string>();
  let priorRank = -1;
  let effectLegs = 0;
  let actorParticipates = false;
  let effect: ActionCombatEffectLeg | undefined;
  for (const leg of command.legs) {
    if (ids.has(leg.id)) return false;
    ids.add(leg.id);
    const rank = LEG_RANK.get(leg.kind);
    if (rank === undefined || rank < priorRank) return false;
    priorRank = rank;
    if (leg.kind === "combat-effect") {
      effectLegs += 1;
      effect = leg;
    }
    for (const owner of legOwners(leg)) {
      if (!ownerIsInActorScope(command.actor, owner)) return false;
      if (leg.kind !== "combat-effect" && atomicOwnerKey(owner) !== actorKey) {
        return false;
      }
      if (atomicOwnerKey(owner) === actorKey) actorParticipates = true;
    }
  }
  return (
    effectLegs <= 1 &&
    actorParticipates &&
    changesAreContinuous(command.legs) &&
    (effect === undefined || effectLegMatchesCommand(command, effect)) &&
    initialDocumentRevisions(command) !== null
  );
}

function normalizeLegs(legs: ReadonlyArray<ActionCommandLeg>): ActionCommandLeg[] {
  return legs
    .map((leg) => {
      if (leg.kind !== "combat-effect") return structuredClone(leg);
      return {
        id: leg.id,
        kind: leg.kind,
        owners: [...leg.owners]
          .map((owner) => structuredClone(owner))
          .sort((left, right) =>
            compareCodeUnits(atomicOwnerKey(left), atomicOwnerKey(right))
          ),
        // Preserve the nested receipt's own byte order; it is opaque here.
        receipt: structuredClone(leg.receipt),
      } satisfies ActionCombatEffectLeg;
    })
    .sort(
      (left, right) =>
        (LEG_RANK.get(left.kind) as number) - (LEG_RANK.get(right.kind) as number)
    );
}

function payloadIdentity(value: ActionCommandDraft): string {
  return JSON.stringify(canonical(value as unknown as ActionJson));
}

/** Normalize canonical leg order and create an immutable exact receipt. */
export function prepareActionCommand(candidate: unknown): ActionCommandPreparation {
  if (
    record(candidate) &&
    jsonPlain(candidate) &&
    exactKeys(candidate, ["status"]) &&
    (candidate.status === "needs-input" || candidate.status === "cancelled")
  ) {
    return { status: "not-prepared", reason: candidate.status };
  }
  if (
    !record(candidate) ||
    !jsonPlain(candidate) ||
    !exactKeys(candidate, ["status", "command"]) ||
    candidate.status !== "ready" ||
    !record(candidate.command)
  ) {
    return { status: "rejected", reason: "invalid-command" };
  }
  const raw = candidate.command;
  if (
    !exactKeys(raw, [
      "schema",
      "commandId",
      "adapterId",
      "actor",
      "predecessor",
      "legs",
    ]) ||
    !Array.isArray(raw.legs) ||
    !raw.legs.every(validLeg)
  ) {
    return { status: "rejected", reason: "invalid-command" };
  }
  const normalized: unknown = {
    schema: raw.schema,
    commandId: raw.commandId,
    adapterId: raw.adapterId,
    actor: structuredClone(raw.actor),
    predecessor: raw.predecessor,
    legs: normalizeLegs(raw.legs),
  };
  if (!validCommandShape(normalized)) {
    return { status: "rejected", reason: "invalid-command" };
  }
  const receipt = {
    ...normalized,
    payloadIdentity: payloadIdentity(normalized),
  } satisfies ActionCommandReceipt;
  return { status: "prepared", receipt: cloneFrozen(receipt) };
}

/** Strict outer validation. The nested combat-effect receipt remains opaque. */
export function isActionCommandReceipt(value: unknown): value is ActionCommandReceipt {
  if (
    !record(value) ||
    !jsonPlain(value) ||
    !exactKeys(value, [
      "schema",
      "commandId",
      "adapterId",
      "actor",
      "predecessor",
      "legs",
      "payloadIdentity",
    ]) ||
    !nonEmpty(value.payloadIdentity)
  ) {
    return false;
  }
  const command = {
    schema: value.schema,
    commandId: value.commandId,
    adapterId: value.adapterId,
    actor: value.actor,
    predecessor: value.predecessor,
    legs: value.legs,
  };
  return validCommandShape(command) && value.payloadIdentity === payloadIdentity(command);
}

function transition(
  receipt: ActionCommandReceipt,
  kind: ActionTransition["kind"],
  expectedGeneration: number
): ActionTransition {
  if (!isActionCommandReceipt(receipt)) {
    throw new TypeError("Invalid action command receipt");
  }
  const policy: CombatEffectCommandBatchPolicy =
    kind === "commit" ? "initial" : kind === "undo" ? "undo" : "redo";
  const combatEffectBatch = materializedEffectBatch(receipt, policy);
  const hasEffect = receipt.legs.some((leg) => leg.kind === "combat-effect");
  if (hasEffect !== (combatEffectBatch !== null)) {
    throw new TypeError("Invalid nested combat-effect receipt");
  }
  const candidate =
    kind === "commit"
      ? {
          schema: 1,
          kind,
          policy: "initial",
          direction: "forward",
          expectedGeneration,
          receipt: structuredClone(receipt),
          ...(combatEffectBatch ? { combatEffectBatch } : {}),
        }
      : kind === "undo"
        ? {
            schema: 1,
            kind,
            policy: "undo",
            direction: "reverse",
            expectedGeneration,
            receipt: structuredClone(receipt),
            ...(combatEffectBatch ? { combatEffectBatch } : {}),
          }
        : {
            schema: 1,
            kind,
            policy: "redo",
            direction: "forward",
            expectedGeneration,
            receipt: structuredClone(receipt),
            ...(combatEffectBatch ? { combatEffectBatch } : {}),
          };
  if (!validTransition(candidate)) throw new TypeError("Invalid action generation");
  return cloneFrozen(candidate);
}

export function actionCommitTransition(
  receipt: ActionCommandReceipt
): ActionCommitTransition {
  return transition(receipt, "commit", 0) as ActionCommitTransition;
}

export function actionUndoTransition(
  receipt: ActionCommandReceipt,
  expectedGeneration: number
): ActionUndoTransition {
  return transition(receipt, "undo", expectedGeneration) as ActionUndoTransition;
}

export function actionRedoTransition(
  receipt: ActionCommandReceipt,
  expectedGeneration: number
): ActionRedoTransition {
  return transition(receipt, "redo", expectedGeneration) as ActionRedoTransition;
}

function validTransition(value: unknown): value is ActionTransition {
  if (
    !record(value) ||
    !jsonPlain(value) ||
    !exactKeys(
      value,
      ["schema", "kind", "policy", "direction", "expectedGeneration", "receipt"],
      ["combatEffectBatch"]
    ) ||
    value.schema !== 1 ||
    !safeInteger(value.expectedGeneration, 0) ||
    (value.policy !== "initial" && value.policy !== "undo" && value.policy !== "redo") ||
    !isActionCommandReceipt(value.receipt)
  ) {
    return false;
  }
  const effect = value.receipt.legs.some((leg) => leg.kind === "combat-effect");
  const expectedBatch = materializedEffectBatch(value.receipt, value.policy);
  if (
    effect !== Object.hasOwn(value, "combatEffectBatch") ||
    (effect && (!expectedBatch || !same(value.combatEffectBatch, expectedBatch)))
  ) {
    return false;
  }
  if (value.kind === "commit") {
    return (
      value.policy === "initial" &&
      value.direction === "forward" &&
      value.expectedGeneration === 0
    );
  }
  if (value.kind === "undo") {
    return (
      value.policy === "undo" &&
      value.direction === "reverse" &&
      value.expectedGeneration > 0 &&
      value.expectedGeneration % 2 === 1
    );
  }
  return (
    value.kind === "redo" &&
    value.policy === "redo" &&
    value.direction === "forward" &&
    value.expectedGeneration >= 2 &&
    value.expectedGeneration % 2 === 0
  );
}

function validAdapter(value: unknown): value is ActionCommandAdapter {
  return (
    record(value) &&
    nonEmpty(value.id) &&
    (value.surface === "local" || value.surface === "shared") &&
    typeof value.compareAndSwap === "function"
  );
}

function validAdapterResult(value: unknown): value is ActionAdapterApplyResult {
  if (!record(value) || !jsonPlain(value) || !nonEmpty(value.status)) return false;
  if (value.status === "applied") {
    return (
      exactKeys(value, ["status", "generation", "head", "durability"]) &&
      safeInteger(value.generation, 1) &&
      (value.head === null || boundedId(value.head)) &&
      (value.durability === "server-confirmed" || value.durability === "local-pending")
    );
  }
  if (value.status === "already-applied") {
    return (
      exactKeys(value, [
        "status",
        "payloadIdentity",
        "generation",
        "head",
        "durability",
      ]) &&
      nonEmpty(value.payloadIdentity) &&
      safeInteger(value.generation, 1) &&
      (value.head === null || boundedId(value.head)) &&
      (value.durability === "server-confirmed" || value.durability === "local-pending")
    );
  }
  return (
    value.status === "rejected" &&
    exactKeys(value, ["status", "reason"]) &&
    [
      "missing-document",
      "stale-state",
      "causal-conflict",
      "duplicate-command",
      "command-collision",
      "failed",
    ].includes(value.reason as string)
  );
}

/** Invoke exactly one outer adapter for the complete action transition. */
export async function executeActionTransition(
  candidate: unknown,
  adapter: ActionCommandAdapter
): Promise<ActionCommandExecution> {
  if (!validTransition(candidate)) {
    return { status: "rejected", reason: "invalid-transition" };
  }
  // Validation proves canonical leg/owner/batch identity. Clone immediately so
  // caller mutation during an async adapter round-trip cannot change the command.
  const snapshotValue = cloneFrozen(candidate);
  if (!validTransition(snapshotValue)) {
    return { status: "rejected", reason: "invalid-transition" };
  }
  const snapshot = snapshotValue;
  if (
    !validAdapter(adapter) ||
    adapter.id !== snapshot.receipt.adapterId ||
    adapter.surface !== snapshot.receipt.actor.surface
  ) {
    return { status: "rejected", reason: "invalid-adapter" };
  }
  let result: ActionAdapterApplyResult;
  try {
    result = await adapter.compareAndSwap(snapshot);
  } catch {
    return { status: "rejected", reason: "adapter-failure" };
  }
  if (!validAdapterResult(result)) {
    return { status: "rejected", reason: "adapter-failure" };
  }
  if (result.status === "rejected") {
    return {
      status: "rejected",
      reason: result.reason === "failed" ? "adapter-failure" : result.reason,
    };
  }
  if (
    snapshot.receipt.actor.surface === "shared" &&
    result.durability !== "server-confirmed"
  ) {
    return { status: "rejected", reason: "adapter-failure" };
  }
  if (
    result.status === "already-applied" &&
    result.payloadIdentity !== snapshot.receipt.payloadIdentity
  ) {
    return { status: "rejected", reason: "command-collision" };
  }
  const expectedHead =
    snapshot.kind === "undo" ? snapshot.receipt.predecessor : snapshot.receipt.commandId;
  if (
    result.generation !== snapshot.expectedGeneration + 1 ||
    result.head !== expectedHead
  ) {
    return { status: "rejected", reason: "adapter-failure" };
  }
  return {
    status: result.status,
    receipt: snapshot.receipt,
    generation: result.generation,
    head: result.head,
    durability: result.durability,
  };
}

export function serializeActionCommandReceipt(receipt: unknown): string {
  if (!isActionCommandReceipt(receipt)) {
    throw new TypeError("Invalid action command receipt");
  }
  return JSON.stringify(canonical(receipt as unknown as ActionJson));
}
