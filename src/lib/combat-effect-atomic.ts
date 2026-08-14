/** Storage-neutral compare-and-swap facts for one reviewed combat-effect plan. */

import {
  ALL_ABILITY_CODES,
  ALL_DAMAGE_SOURCES,
  type CombatEffectAreaFact,
  type CombatEffectLifetime,
  type ConditionId,
  type DamageSource,
} from "@/data/types";
import { DAMAGE_TYPES as CANONICAL_DAMAGE_TYPES, type DamageType } from "@/types/damage";
import type { DamageDefenses } from "@/lib/damage-intake";
import type {
  CombatEffectEntityRef,
  CombatEffectStateView,
} from "@/lib/combat-effect-program";
import type { CombatEffectLifecycleCursor } from "@/lib/combat-effect-lifecycle";
import type { ActiveCombatEffect } from "@/types/combat-effect";

type JsonPrimitive = string | number | boolean | null;
type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

export type AtomicOwner =
  | {
      kind: "pc";
      surface: "local";
      uid: string;
      characterId: string;
      combatantId: string;
    }
  | {
      kind: "pc";
      surface: "shared";
      campaignId: string;
      encounterEpoch: number;
      combatantId: string;
      memberUid: string;
      characterId: string;
    }
  | {
      kind: "monster";
      surface: "shared";
      campaignId: string;
      encounterEpoch: number;
      combatantId: string;
    };

/** Exact persisted document participating in one atomic action. */
export type AtomicDocumentRef =
  | {
      kind: "character-play";
      uid: string;
      characterId: string;
    }
  | {
      kind: "shared-encounter";
      campaignId: string;
      encounterEpoch: number;
    };

export interface AtomicEntityBinding {
  ref: CombatEffectEntityRef;
  owner: AtomicOwner;
}

export interface SerializableDamageDefenses {
  allDamageResistance: boolean;
  resistances: ReadonlyArray<DamageType>;
  immunities: ReadonlyArray<DamageType>;
  vulnerabilities: ReadonlyArray<DamageType>;
  sourceResistances: ReadonlyArray<DamageSource>;
  flatReductions: ReadonlyArray<{
    id: string;
    damageTypes: ReadonlyArray<DamageType>;
    amount: number;
    trigger: "attack";
  }>;
  saveDamageRules: ReadonlyArray<{
    id: string;
    ability: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
    requiresDamageOnSuccess: "half";
    onSuccess: "none";
    onFailure: "half";
  }>;
}

export interface AtomicBaseState extends Pick<
  CombatEffectStateView,
  | "hp"
  | "tempHp"
  | "stable"
  | "deathSaves"
  | "conditions"
  | "conditionLifetimes"
  | "standing"
  | "standingLifetimes"
> {
  /** The complete logical resource manifest. `null` is an observed absence. */
  resources: Readonly<Record<string, number | null>>;
  /** The complete logical state-flag manifest for this snapshot. */
  stateFlags: Readonly<Record<string, boolean>>;
}

export type AtomicResourceBinding =
  | { kind: "tracker"; trackerId: string }
  | { kind: "spell-slot"; usageKey: string }
  | {
      kind: "item-resource";
      itemId: string;
      instanceId: string;
      resourceId: string;
    };

export type AtomicResourceSnapshot =
  | { present: false }
  | {
      present: true;
      binding: Exclude<AtomicResourceBinding, { kind: "item-resource" }>;
      current: number;
      capacity: number;
      enabled: boolean;
    }
  | {
      present: true;
      binding: Extract<AtomicResourceBinding, { kind: "item-resource" }>;
      current: number;
      capacity: number;
      enabled: boolean;
      /** Revision of the item instance that owns this resource binding. */
      bindingRevision: number;
    };

export interface AtomicStateFlagBinding {
  kind: "active-feature";
  activeKey: string;
}

export interface AtomicStateFlagSnapshot {
  binding: AtomicStateFlagBinding;
  active: boolean;
}

export interface AtomicZeroHpFloor {
  stateKey: string;
  hitPoints: number;
}

export type AtomicOccurrenceRuleIdentity = ActiveCombatEffect;

/** The full immutable occurrence rule, not a lossy payload fingerprint. */
export interface AtomicOccurrenceHead {
  effectId: string;
  headOpId: string;
  active: boolean;
  terminal: boolean;
  effect: AtomicOccurrenceRuleIdentity;
}

/** `present: false` is distinct from an existing, fully-undone runtime whose head is null. */
export type AtomicLifecycleHead =
  | { present: false }
  | {
      present: true;
      headCommandId: string | null;
      cursor: CombatEffectLifecycleCursor;
    };

export type AtomicAddress =
  | { kind: "document-revision"; document: AtomicDocumentRef }
  | { kind: "base-state" }
  | { kind: "max-hp" }
  | { kind: "damage-defenses" }
  | {
      kind: "resource";
      /** Authored logical id. The snapshot binding maps it one-to-one to a
       * physical tracker/slot/item key; their strings need not be identical. */
      programResourceId: string;
    }
  | { kind: "state-flag"; stateKey: string }
  | { kind: "zero-hp-floors" }
  | { kind: "occurrence-heads" }
  | {
      kind: "lifecycle-head";
      occurrenceId: string;
      programId: string;
      sourceId: string;
    };

type AtomicReadOf<Address extends AtomicAddress, Expected> = {
  owner: AtomicOwner;
  address: Address;
  expected: Expected;
};

export type AtomicRead =
  | AtomicReadOf<{ kind: "document-revision"; document: AtomicDocumentRef }, number>
  | AtomicReadOf<{ kind: "base-state" }, AtomicBaseState>
  | AtomicReadOf<{ kind: "max-hp" }, number>
  | AtomicReadOf<{ kind: "damage-defenses" }, SerializableDamageDefenses>
  | AtomicReadOf<{ kind: "resource"; programResourceId: string }, AtomicResourceSnapshot>
  | AtomicReadOf<{ kind: "state-flag"; stateKey: string }, AtomicStateFlagSnapshot>
  | AtomicReadOf<{ kind: "zero-hp-floors" }, ReadonlyArray<AtomicZeroHpFloor>>
  | AtomicReadOf<{ kind: "occurrence-heads" }, ReadonlyArray<AtomicOccurrenceHead>>
  | AtomicReadOf<
      {
        kind: "lifecycle-head";
        occurrenceId: string;
        programId: string;
        sourceId: string;
      },
      AtomicLifecycleHead
    >;

export interface CombatEffectAtomicReadSet {
  schema: 1;
  bindings: ReadonlyArray<AtomicEntityBinding>;
  reads: ReadonlyArray<AtomicRead>;
}

export interface CombatEffectAtomicReadSetHeader {
  occurrenceId: string;
  programId: string;
  sourceId: string;
}

const DAMAGE_TYPES = new Set<string>(CANONICAL_DAMAGE_TYPES);
const DAMAGE_SOURCES = new Set<string>(ALL_DAMAGE_SOURCES);
const ABILITIES = new Set<string>(ALL_ABILITY_CODES);
const CONDITIONS = new Set<ConditionId>([
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
]);
const AREA_FACTS = new Set<CombatEffectAreaFact>([
  "difficult-terrain",
  "obscured",
  "ranged-weapon-impossible",
  "strong-wind",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
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

function stateKey(value: unknown): value is string {
  return (
    nonEmpty(value) &&
    value !== "__proto__" &&
    value !== "constructor" &&
    value !== "prototype"
  );
}

function safeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

/** Reject accessors, sparse arrays, symbols, prototypes and cycles before field reads. */
function plainJson(value: unknown, stack = new WeakSet<object>()): value is JsonValue {
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
            plainJson(descriptor.value, stack)
        )
      : (Object.getPrototypeOf(value) === Object.prototype ||
          Object.getPrototypeOf(value) === null) &&
        Object.entries(descriptors).every(
          ([key, descriptor]) =>
            key.length > 0 &&
            descriptor.enumerable &&
            "value" in descriptor &&
            plainJson(descriptor.value, stack)
        ));
  stack.delete(value);
  return valid;
}

function canonical(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const object = value as { readonly [key: string]: JsonValue };
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key] as JsonValue)])
    );
  }
  return value;
}

function frozenCanonical<T>(value: T): Readonly<T> {
  if (!plainJson(value)) throw new TypeError("Atomic read set must be JSON-plain");
  const result = canonical(value) as T;
  const freeze = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || Object.isFrozen(entry)) return;
    Object.freeze(entry);
    Object.values(entry).forEach(freeze);
  };
  freeze(result);
  return result;
}

function strictlySorted(values: ReadonlyArray<string>): boolean {
  return values.every(
    (value, index) => index === 0 || (values[index - 1] as string) < value
  );
}

function orderedUniqueBy<T>(
  values: ReadonlyArray<T>,
  key: (value: T) => string
): boolean {
  return values.every((value, index) => {
    const current = key(value);
    return nonEmpty(current) && (index === 0 || key(values[index - 1] as T) < current);
  });
}

function encodedIdentity(parts: ReadonlyArray<string | number>): string {
  return parts
    .map(String)
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function validOwner(value: unknown): value is AtomicOwner {
  if (!record(value) || !nonEmpty(value.combatantId)) return false;
  if (value.kind === "pc" && value.surface === "local") {
    return (
      exactKeys(value, ["kind", "surface", "uid", "characterId", "combatantId"]) &&
      nonEmpty(value.uid) &&
      nonEmpty(value.characterId)
    );
  }
  if (value.kind === "pc" && value.surface === "shared") {
    return (
      exactKeys(value, [
        "kind",
        "surface",
        "campaignId",
        "encounterEpoch",
        "combatantId",
        "memberUid",
        "characterId",
      ]) &&
      nonEmpty(value.campaignId) &&
      safeInteger(value.encounterEpoch, 0) &&
      nonEmpty(value.memberUid) &&
      nonEmpty(value.characterId)
    );
  }
  return (
    value.kind === "monster" &&
    value.surface === "shared" &&
    exactKeys(value, [
      "kind",
      "surface",
      "campaignId",
      "encounterEpoch",
      "combatantId",
    ]) &&
    nonEmpty(value.campaignId) &&
    safeInteger(value.encounterEpoch, 0)
  );
}

function validDocumentRef(value: unknown): value is AtomicDocumentRef {
  if (!record(value)) return false;
  if (value.kind === "character-play") {
    return (
      exactKeys(value, ["kind", "uid", "characterId"]) &&
      nonEmpty(value.uid) &&
      nonEmpty(value.characterId)
    );
  }
  return (
    value.kind === "shared-encounter" &&
    exactKeys(value, ["kind", "campaignId", "encounterEpoch"]) &&
    nonEmpty(value.campaignId) &&
    safeInteger(value.encounterEpoch, 0)
  );
}

function documentKey(document: AtomicDocumentRef): string {
  return document.kind === "character-play"
    ? encodedIdentity(["document", "character-play", document.uid, document.characterId])
    : encodedIdentity([
        "document",
        "shared-encounter",
        document.campaignId,
        document.encounterEpoch,
      ]);
}

function ownerKey(owner: AtomicOwner): string {
  if (owner.kind === "pc" && owner.surface === "local") {
    return encodedIdentity(["owner", "pc", owner.uid, owner.characterId]);
  }
  if (owner.kind === "pc") {
    return encodedIdentity(["owner", "pc", owner.memberUid, owner.characterId]);
  }
  return encodedIdentity([
    "owner",
    "monster",
    "shared",
    owner.campaignId,
    owner.encounterEpoch,
    owner.combatantId,
  ]);
}

/**
 * Collision-safe deterministic identity for one logical combat entity.
 * A PC remains the same entity across local/shared execution contexts; monsters
 * remain distinct even though every monster in an encounter shares one document.
 */
export function atomicOwnerKey(owner: AtomicOwner): string {
  if (!plainJson(owner) || !validOwner(owner)) {
    throw new TypeError("Invalid atomic owner");
  }
  return ownerKey(owner);
}

/** The one persisted document that owns this entity's mutable play facts. */
export function atomicDocumentForOwner(owner: AtomicOwner): AtomicDocumentRef {
  if (!plainJson(owner) || !validOwner(owner)) {
    throw new TypeError("Invalid atomic owner");
  }
  if (owner.kind === "pc") {
    return {
      kind: "character-play",
      uid: owner.surface === "local" ? owner.uid : owner.memberUid,
      characterId: owner.characterId,
    };
  }
  return {
    kind: "shared-encounter",
    campaignId: owner.campaignId,
    encounterEpoch: owner.encounterEpoch,
  };
}

/** The one occurrence/lifecycle ledger used by this entity in this execution. */
export function atomicLedgerForOwner(owner: AtomicOwner): AtomicDocumentRef {
  if (!plainJson(owner) || !validOwner(owner)) {
    throw new TypeError("Invalid atomic owner");
  }
  if (owner.surface === "shared") {
    return {
      kind: "shared-encounter",
      campaignId: owner.campaignId,
      encounterEpoch: owner.encounterEpoch,
    };
  }
  return {
    kind: "character-play",
    uid: owner.uid,
    characterId: owner.characterId,
  };
}

/** Collision-safe deterministic identity for one persisted document. */
export function atomicDocumentKey(document: AtomicDocumentRef): string {
  if (!plainJson(document) || !validDocumentRef(document)) {
    throw new TypeError("Invalid atomic document");
  }
  return documentKey(document);
}

/** Execution scope for routing one atomic batch; distinct from physical ownership. */
export function atomicOwnerScopeKey(owner: AtomicOwner): string {
  if (!plainJson(owner) || !validOwner(owner)) {
    throw new TypeError("Invalid atomic owner");
  }
  return owner.surface === "local"
    ? encodedIdentity(["scope", "local", owner.uid])
    : encodedIdentity(["scope", "shared", owner.campaignId, owner.encounterEpoch]);
}

function validTarget(value: unknown): boolean {
  return (
    record(value) && exactKeys(value, ["combatantId"]) && nonEmpty(value.combatantId)
  );
}

function validEntityRef(value: unknown): value is CombatEffectEntityRef {
  return (
    record(value) &&
    ((value.kind === "source" &&
      exactKeys(value, ["kind", "id"]) &&
      nonEmpty(value.id)) ||
      (value.kind === "target" &&
        exactKeys(value, ["kind", "target"]) &&
        validTarget(value.target)))
  );
}

function entityRefKey(ref: CombatEffectEntityRef): string {
  return ref.kind === "source"
    ? encodedIdentity(["ref", "source", ref.id])
    : encodedIdentity(["ref", "target", ref.target.combatantId]);
}

/** Collision-safe deterministic order key for one logical-to-physical binding. */
export function atomicEntityBindingKey(binding: AtomicEntityBinding): string {
  if (!plainJson(binding) || !validEntityBinding(binding)) {
    throw new TypeError("Invalid atomic entity binding");
  }
  return entityRefKey(binding.ref);
}

function bindingMatchesOwner(binding: AtomicEntityBinding): boolean {
  if (binding.ref.kind === "source") {
    return binding.ref.id === binding.owner.combatantId;
  }
  const target = binding.ref.target;
  return target.combatantId === binding.owner.combatantId;
}

function validEntityBinding(value: unknown): value is AtomicEntityBinding {
  return (
    record(value) &&
    exactKeys(value, ["ref", "owner"]) &&
    validEntityRef(value.ref) &&
    validOwner(value.owner) &&
    bindingMatchesOwner(value as unknown as AtomicEntityBinding)
  );
}

function validLifetime(value: unknown): value is CombatEffectLifetime {
  if (!record(value)) return false;
  if (value.kind === "source-end" || value.kind === "manual") {
    return exactKeys(value, ["kind"]);
  }
  if (value.kind === "phase-end") {
    return exactKeys(value, ["kind", "phaseId"]) && nonEmpty(value.phaseId);
  }
  if (value.kind === "turn-boundary") {
    return (
      exactKeys(value, ["kind", "subject", "phase", "offsetTurns"]) &&
      (value.subject === "source" || value.subject === "target") &&
      (value.phase === "turn-start" || value.phase === "turn-end") &&
      safeInteger(value.offsetTurns, 0)
    );
  }
  return (
    value.kind === "elapsed" &&
    exactKeys(value, ["kind", "amount", "unit"]) &&
    safeInteger(value.amount, 1) &&
    (value.unit === "round" ||
      value.unit === "minute" ||
      value.unit === "hour" ||
      value.unit === "day")
  );
}

function validLifetimeMap(
  value: unknown,
  active: ReadonlyArray<string>,
  validKey: (value: unknown) => boolean
): boolean {
  if (!record(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === active.length &&
    keys.every(validKey) &&
    active.every((key) => Object.hasOwn(value, key)) &&
    Object.values(value).every((lifetime) => lifetime === null || validLifetime(lifetime))
  );
}

function validBaseState(value: unknown): value is AtomicBaseState {
  if (
    !record(value) ||
    !exactKeys(value, [
      "hp",
      "tempHp",
      "stable",
      "deathSaves",
      "conditions",
      "conditionLifetimes",
      "standing",
      "standingLifetimes",
      "resources",
      "stateFlags",
    ]) ||
    !safeInteger(value.hp, 0) ||
    !safeInteger(value.tempHp, 0) ||
    typeof value.stable !== "boolean" ||
    !record(value.deathSaves) ||
    !exactKeys(value.deathSaves, ["successes", "failures"]) ||
    !safeInteger(value.deathSaves.successes, 0) ||
    value.deathSaves.successes > 3 ||
    !safeInteger(value.deathSaves.failures, 0) ||
    value.deathSaves.failures > 3 ||
    !Array.isArray(value.conditions) ||
    value.conditions.some((condition) => !CONDITIONS.has(condition as ConditionId)) ||
    !strictlySorted(value.conditions as ReadonlyArray<string>) ||
    !Array.isArray(value.standing) ||
    value.standing.some((id) => !stateKey(id)) ||
    !strictlySorted(value.standing as ReadonlyArray<string>) ||
    !record(value.resources) ||
    Object.entries(value.resources).some(
      ([id, amount]) => !stateKey(id) || (amount !== null && !safeInteger(amount, 0))
    ) ||
    !record(value.stateFlags) ||
    Object.entries(value.stateFlags).some(
      ([id, active]) => !stateKey(id) || typeof active !== "boolean"
    )
  ) {
    return false;
  }
  return (
    validLifetimeMap(
      value.conditionLifetimes,
      value.conditions as ReadonlyArray<string>,
      (condition) =>
        typeof condition === "string" && CONDITIONS.has(condition as ConditionId)
    ) &&
    validLifetimeMap(
      value.standingLifetimes,
      value.standing as ReadonlyArray<string>,
      stateKey
    )
  );
}

function validStringSet(value: unknown, allowed: ReadonlySet<string>): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && allowed.has(entry)) &&
    strictlySorted(value as ReadonlyArray<string>)
  );
}

function validFlatReductions(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ["id", "damageTypes", "amount", "trigger"]) &&
        nonEmpty(entry.id) &&
        validStringSet(entry.damageTypes, DAMAGE_TYPES) &&
        safeInteger(entry.amount, 0) &&
        entry.trigger === "attack"
    ) &&
    orderedUniqueBy(value as ReadonlyArray<{ id: string }>, (entry) => entry.id)
  );
}

function validSaveDamageRules(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, [
          "id",
          "ability",
          "requiresDamageOnSuccess",
          "onSuccess",
          "onFailure",
        ]) &&
        nonEmpty(entry.id) &&
        typeof entry.ability === "string" &&
        ABILITIES.has(entry.ability) &&
        entry.requiresDamageOnSuccess === "half" &&
        entry.onSuccess === "none" &&
        entry.onFailure === "half"
    ) &&
    orderedUniqueBy(value as ReadonlyArray<{ id: string }>, (entry) => entry.id)
  );
}

function validSerializableDamageDefenses(
  value: unknown
): value is SerializableDamageDefenses {
  return (
    record(value) &&
    exactKeys(value, [
      "allDamageResistance",
      "resistances",
      "immunities",
      "vulnerabilities",
      "sourceResistances",
      "flatReductions",
      "saveDamageRules",
    ]) &&
    typeof value.allDamageResistance === "boolean" &&
    validStringSet(value.resistances, DAMAGE_TYPES) &&
    validStringSet(value.immunities, DAMAGE_TYPES) &&
    validStringSet(value.vulnerabilities, DAMAGE_TYPES) &&
    validStringSet(value.sourceResistances, DAMAGE_SOURCES) &&
    validFlatReductions(value.flatReductions) &&
    validSaveDamageRules(value.saveDamageRules)
  );
}

function sortedSet<T extends string>(
  value: ReadonlySet<T>,
  allowed: ReadonlySet<string>,
  label: string
): T[] {
  if (!((value as unknown) instanceof Set)) {
    throw new TypeError(`${label} must be a Set`);
  }
  const entries: T[] = Array.from(value);
  if (entries.some((entry) => !allowed.has(entry))) {
    throw new TypeError(`${label} contains an invalid value`);
  }
  return entries.sort();
}

/** Convert engine Sets into the canonical JSON defense fact used by a read set. */
export function canonicalizeDamageDefenses(
  defenses: Readonly<DamageDefenses>
): Readonly<SerializableDamageDefenses> {
  if (typeof defenses.allDamageResistance !== "boolean") {
    throw new TypeError("All-damage resistance must be boolean");
  }
  const flatReductions = defenses.flatReductions
    .map((entry) => {
      const damageTypes: unknown = entry.damageTypes;
      if (
        !nonEmpty(entry.id) ||
        !Array.isArray(damageTypes) ||
        damageTypes.some(
          (damageType) => typeof damageType !== "string" || !DAMAGE_TYPES.has(damageType)
        ) ||
        new Set(damageTypes).size !== damageTypes.length ||
        !safeInteger(entry.amount, 0) ||
        (entry.trigger as unknown) !== "attack"
      ) {
        throw new TypeError("Invalid flat damage reduction");
      }
      return {
        id: entry.id,
        damageTypes: [...(damageTypes as DamageType[])].sort(),
        amount: entry.amount,
        trigger: entry.trigger,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const saveDamageRules = defenses.saveDamageRules
    .map((entry) => {
      if (
        !nonEmpty(entry.id) ||
        !ABILITIES.has(entry.ability) ||
        (entry.requiresDamageOnSuccess as unknown) !== "half" ||
        (entry.onSuccess as unknown) !== "none" ||
        (entry.onFailure as unknown) !== "half"
      ) {
        throw new TypeError("Invalid save damage rule");
      }
      return { ...entry };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  if (
    new Set(flatReductions.map(({ id }) => id)).size !== flatReductions.length ||
    new Set(saveDamageRules.map(({ id }) => id)).size !== saveDamageRules.length
  ) {
    throw new TypeError("Damage defense ids must be unique");
  }
  const result: SerializableDamageDefenses = {
    allDamageResistance: defenses.allDamageResistance,
    resistances: sortedSet(defenses.resistances, DAMAGE_TYPES, "Resistances"),
    immunities: sortedSet(defenses.immunities, DAMAGE_TYPES, "Immunities"),
    vulnerabilities: sortedSet(defenses.vulnerabilities, DAMAGE_TYPES, "Vulnerabilities"),
    sourceResistances: sortedSet(
      defenses.sourceResistances,
      DAMAGE_SOURCES,
      "Source resistances"
    ),
    flatReductions,
    saveDamageRules,
  };
  if (!validSerializableDamageDefenses(result)) {
    throw new TypeError("Damage defenses could not be canonicalized");
  }
  return frozenCanonical(result);
}

/** Materialize a validated portable defense fact into fresh command-local Sets. */
export function materializeDamageDefenses(
  value: unknown
): Readonly<DamageDefenses> | null {
  if (!plainJson(value) || !validSerializableDamageDefenses(value)) return null;
  const canonicalValue = frozenCanonical(
    value as SerializableDamageDefenses
  ) as SerializableDamageDefenses;
  const result: DamageDefenses = {
    allDamageResistance: canonicalValue.allDamageResistance,
    resistances: new Set(canonicalValue.resistances),
    immunities: new Set(canonicalValue.immunities),
    vulnerabilities: new Set(canonicalValue.vulnerabilities),
    sourceResistances: new Set(canonicalValue.sourceResistances),
    flatReductions: canonicalValue.flatReductions.map((entry) => ({
      ...entry,
      damageTypes: [...entry.damageTypes],
    })),
    saveDamageRules: canonicalValue.saveDamageRules.map((entry) => ({ ...entry })),
  };
  result.flatReductions.forEach((entry) => {
    Object.freeze(entry.damageTypes);
    Object.freeze(entry);
  });
  result.saveDamageRules.forEach(Object.freeze);
  Object.freeze(result.flatReductions);
  Object.freeze(result.saveDamageRules);
  return result;
}

function validCombatant(value: unknown): boolean {
  if (!record(value) || !nonEmpty(value.combatantId)) return false;
  if (value.kind === "pc") {
    return (
      exactKeys(value, ["kind", "combatantId", "memberUid", "characterId"]) &&
      nonEmpty(value.memberUid) &&
      nonEmpty(value.characterId)
    );
  }
  return value.kind === "monster" && exactKeys(value, ["kind", "combatantId"]);
}

function validProgramOwner(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, [
      "occurrenceId",
      "programId",
      "phaseId",
      "stepId",
      "operationId",
      "instance",
      "iteration",
    ]) &&
    nonEmpty(value.occurrenceId) &&
    nonEmpty(value.programId) &&
    nonEmpty(value.phaseId) &&
    nonEmpty(value.stepId) &&
    nonEmpty(value.operationId) &&
    (value.instance === null || safeInteger(value.instance, 0)) &&
    safeInteger(value.iteration, 0)
  );
}

function validEffectSource(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, ["kind", "id", "actionId"], ["castLevel"]) &&
    (value.kind === "spell" || value.kind === "feature") &&
    nonEmpty(value.id) &&
    nonEmpty(value.actionId) &&
    (value.castLevel === undefined || safeInteger(value.castLevel, 1))
  );
}

function validEffectPayload(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "grant-group") {
    return (
      exactKeys(value, ["kind", "activeKey"], ["phase"]) &&
      nonEmpty(value.activeKey) &&
      (value.phase === undefined ||
        value.phase === "active" ||
        value.phase === "aftereffect")
    );
  }
  if (value.kind === "target-mark") {
    return (
      exactKeys(value, ["kind", "activeKey", "scope"]) &&
      nonEmpty(value.activeKey) &&
      (value.scope === "marked" || value.scope === "cursed" || value.scope === "vowed")
    );
  }
  if (value.kind === "condition") {
    return (
      exactKeys(value, ["kind", "conditionId"]) &&
      typeof value.conditionId === "string" &&
      CONDITIONS.has(value.conditionId as ConditionId)
    );
  }
  return (
    value.kind === "program-standing" &&
    exactKeys(value, ["kind", "effectId"]) &&
    nonEmpty(value.effectId)
  );
}

function validEffectDuration(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === "encounter") return exactKeys(value, ["kind"]);
  if (value.kind === "concentration") {
    return (
      exactKeys(value, ["kind", "actorId", "sourceId"]) &&
      nonEmpty(value.actorId) &&
      nonEmpty(value.sourceId)
    );
  }
  return (
    value.kind === "turn-boundary" &&
    exactKeys(value, ["kind", "combatantId", "round", "phase"]) &&
    nonEmpty(value.combatantId) &&
    safeInteger(value.round, 0) &&
    (value.phase === "turn-start" || value.phase === "turn-end")
  );
}

function validActiveEffect(value: unknown): value is ActiveCombatEffect {
  if (
    !record(value) ||
    !exactKeys(
      value,
      ["id", "actor", "target", "source", "payload", "duration"],
      ["programOwner", "authoredLifetime", "bindings", "applied"]
    ) ||
    !nonEmpty(value.id) ||
    !validCombatant(value.actor) ||
    !validCombatant(value.target) ||
    !validEffectSource(value.source) ||
    !validEffectPayload(value.payload) ||
    (value.programOwner !== undefined && !validProgramOwner(value.programOwner)) ||
    (value.authoredLifetime !== undefined && !validLifetime(value.authoredLifetime)) ||
    !validEffectDuration(value.duration)
  ) {
    return false;
  }
  if (
    record(value.payload) &&
    value.payload.kind === "program-standing" &&
    value.programOwner === undefined
  ) {
    return false;
  }
  if (
    value.programOwner !== undefined &&
    record(value.payload) &&
    value.payload.kind !== "condition" &&
    value.payload.kind !== "program-standing"
  ) {
    return false;
  }
  if (
    value.bindings !== undefined &&
    (!record(value.bindings) ||
      !exactKeys(value.bindings, [], ["spellcastingModifier"]) ||
      (value.bindings.spellcastingModifier !== undefined &&
        !safeInteger(value.bindings.spellcastingModifier)))
  ) {
    return false;
  }
  return !(
    value.applied !== undefined &&
    (!record(value.applied) ||
      !exactKeys(value.applied, [], ["currentHpDelta"]) ||
      (value.applied.currentHpDelta !== undefined &&
        !safeInteger(value.applied.currentHpDelta)))
  );
}

/** Strict exact-shape guard for the complete immutable rule of one occurrence. */
export function isAtomicOccurrenceRuleIdentity(
  value: unknown
): value is AtomicOccurrenceRuleIdentity {
  try {
    return plainJson(value) && validActiveEffect(value);
  } catch {
    return false;
  }
}

/** Canonical, deeply frozen occurrence rule identity for lineage and CAS checks. */
export function conformAtomicOccurrenceRuleIdentity(
  value: unknown
): Readonly<AtomicOccurrenceRuleIdentity> | null {
  return isAtomicOccurrenceRuleIdentity(value) ? frozenCanonical(value) : null;
}

function validOccurrenceHeads(
  value: unknown
): value is ReadonlyArray<AtomicOccurrenceHead> {
  if (!Array.isArray(value)) return false;
  const heads = value as ReadonlyArray<unknown>;
  const headOpIds = new Set<string>();
  for (const head of heads) {
    if (
      !record(head) ||
      !exactKeys(head, ["effectId", "headOpId", "active", "terminal", "effect"]) ||
      !nonEmpty(head.effectId) ||
      !nonEmpty(head.headOpId) ||
      typeof head.active !== "boolean" ||
      typeof head.terminal !== "boolean" ||
      (head.terminal && head.active) ||
      !validActiveEffect(head.effect) ||
      head.effect.id !== head.effectId ||
      headOpIds.has(head.headOpId)
    ) {
      return false;
    }
    headOpIds.add(head.headOpId);
  }
  return orderedUniqueBy(
    value as ReadonlyArray<AtomicOccurrenceHead>,
    (head) => head.effectId
  );
}

function effectTargetsOwner(effect: ActiveCombatEffect, owner: AtomicOwner): boolean {
  if (effect.target.combatantId !== owner.combatantId) return false;
  if (owner.kind === "monster") {
    return effect.target.kind === "monster";
  }
  const memberUid = owner.surface === "local" ? owner.uid : owner.memberUid;
  return (
    effect.target.kind === "pc" &&
    effect.target.memberUid === memberUid &&
    effect.target.characterId === owner.characterId
  );
}

function validTallies(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ["id", "value"]) &&
        nonEmpty(entry.id) &&
        safeInteger(entry.value, 0)
    ) &&
    orderedUniqueBy(value as ReadonlyArray<{ id: string }>, (entry) => entry.id)
  );
}

function validLayerStates(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ["id", "state"]) &&
        nonEmpty(entry.id) &&
        (entry.state === "active" || entry.state === "destroyed")
    ) &&
    orderedUniqueBy(value as ReadonlyArray<{ id: string }>, (entry) => entry.id)
  );
}

function validAreaStates(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((fact) => AREA_FACTS.has(fact as CombatEffectAreaFact)) &&
    strictlySorted(value as ReadonlyArray<string>)
  );
}

function validPhases(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ["phaseId", "nextOccurrence"]) &&
        nonEmpty(entry.phaseId) &&
        safeInteger(entry.nextOccurrence, 1)
    ) &&
    orderedUniqueBy(value as ReadonlyArray<{ phaseId: string }>, (entry) => entry.phaseId)
  );
}

function validLifecycleCursor(value: unknown): value is CombatEffectLifecycleCursor {
  return (
    record(value) &&
    exactKeys(value, ["tallies", "layerStates", "areaStates", "ended", "phases"]) &&
    validTallies(value.tallies) &&
    validLayerStates(value.layerStates) &&
    validAreaStates(value.areaStates) &&
    typeof value.ended === "boolean" &&
    validPhases(value.phases)
  );
}

function validLifecycleHead(value: unknown): value is AtomicLifecycleHead {
  if (!record(value) || typeof value.present !== "boolean") return false;
  return !value.present
    ? exactKeys(value, ["present"])
    : exactKeys(value, ["present", "headCommandId", "cursor"]) &&
        (value.headCommandId === null || nonEmpty(value.headCommandId)) &&
        validLifecycleCursor(value.cursor);
}

function validResourceBinding(value: unknown): value is AtomicResourceBinding {
  if (!record(value)) return false;
  if (value.kind === "tracker") {
    return exactKeys(value, ["kind", "trackerId"]) && nonEmpty(value.trackerId);
  }
  if (value.kind === "spell-slot") {
    return exactKeys(value, ["kind", "usageKey"]) && nonEmpty(value.usageKey);
  }
  return (
    value.kind === "item-resource" &&
    exactKeys(value, ["kind", "itemId", "instanceId", "resourceId"]) &&
    nonEmpty(value.itemId) &&
    nonEmpty(value.instanceId) &&
    nonEmpty(value.resourceId)
  );
}

function validResourceSnapshot(value: unknown): value is AtomicResourceSnapshot {
  if (!record(value) || typeof value.present !== "boolean") return false;
  if (!value.present) return exactKeys(value, ["present"]);
  if (
    !validResourceBinding(value.binding) ||
    !safeInteger(value.current, 0) ||
    !safeInteger(value.capacity, 0) ||
    value.current > value.capacity ||
    typeof value.enabled !== "boolean"
  ) {
    return false;
  }
  return value.binding.kind === "item-resource"
    ? exactKeys(value, [
        "present",
        "binding",
        "current",
        "capacity",
        "enabled",
        "bindingRevision",
      ]) && safeInteger(value.bindingRevision, 0)
    : exactKeys(value, ["present", "binding", "current", "capacity", "enabled"]);
}

function validStateFlagSnapshot(value: unknown): value is AtomicStateFlagSnapshot {
  return (
    record(value) &&
    exactKeys(value, ["binding", "active"]) &&
    record(value.binding) &&
    exactKeys(value.binding, ["kind", "activeKey"]) &&
    value.binding.kind === "active-feature" &&
    nonEmpty(value.binding.activeKey) &&
    typeof value.active === "boolean"
  );
}

function validZeroHpFloors(value: unknown): value is ReadonlyArray<AtomicZeroHpFloor> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        record(entry) &&
        exactKeys(entry, ["stateKey", "hitPoints"]) &&
        stateKey(entry.stateKey) &&
        safeInteger(entry.hitPoints, 1)
    ) &&
    orderedUniqueBy(value as ReadonlyArray<AtomicZeroHpFloor>, (entry) => entry.stateKey)
  );
}

function validAddress(value: unknown): value is AtomicAddress {
  if (!record(value) || !nonEmpty(value.kind)) return false;
  if (
    value.kind === "base-state" ||
    value.kind === "max-hp" ||
    value.kind === "damage-defenses" ||
    value.kind === "zero-hp-floors" ||
    value.kind === "occurrence-heads"
  ) {
    return exactKeys(value, ["kind"]);
  }
  if (value.kind === "document-revision") {
    return exactKeys(value, ["kind", "document"]) && validDocumentRef(value.document);
  }
  if (value.kind === "resource") {
    return (
      exactKeys(value, ["kind", "programResourceId"]) && nonEmpty(value.programResourceId)
    );
  }
  if (value.kind === "state-flag") {
    return exactKeys(value, ["kind", "stateKey"]) && stateKey(value.stateKey);
  }
  return (
    value.kind === "lifecycle-head" &&
    exactKeys(value, ["kind", "occurrenceId", "programId", "sourceId"]) &&
    nonEmpty(value.occurrenceId) &&
    nonEmpty(value.programId) &&
    nonEmpty(value.sourceId)
  );
}

function addressKey(owner: AtomicOwner, address: AtomicAddress): string {
  if (address.kind === "document-revision") {
    return encodedIdentity(["address", documentKey(address.document), address.kind]);
  }
  const tail =
    address.kind === "resource"
      ? [address.kind, address.programResourceId]
      : address.kind === "state-flag"
        ? [address.kind, address.stateKey]
        : address.kind === "lifecycle-head"
          ? [address.kind, address.occurrenceId, address.programId, address.sourceId]
          : [address.kind];
  return encodedIdentity(["address", ownerKey(owner), ...tail]);
}

/** Collision-safe deterministic identity for one logical compare-and-swap address. */
export function atomicAddressKey(owner: AtomicOwner, address: AtomicAddress): string {
  if (
    !plainJson(owner) ||
    !validOwner(owner) ||
    !plainJson(address) ||
    !validAddress(address)
  ) {
    throw new TypeError("Invalid atomic address");
  }
  return addressKey(owner, address);
}

function validRead(value: unknown): value is AtomicRead {
  if (
    !record(value) ||
    !exactKeys(value, ["owner", "address", "expected"]) ||
    !validOwner(value.owner) ||
    !validAddress(value.address)
  ) {
    return false;
  }
  const address = value.address;
  switch (address.kind) {
    case "document-revision":
      return safeInteger(value.expected, 0);
    case "base-state":
      return validBaseState(value.expected);
    case "max-hp":
      return safeInteger(value.expected, 0);
    case "damage-defenses":
      return validSerializableDamageDefenses(value.expected);
    case "resource":
      return validResourceSnapshot(value.expected);
    case "state-flag":
      return validStateFlagSnapshot(value.expected);
    case "zero-hp-floors":
      return validZeroHpFloors(value.expected);
    case "occurrence-heads":
      return validOccurrenceHeads(value.expected);
    case "lifecycle-head":
      return validLifecycleHead(value.expected);
  }
}

function validReadSetHeader(value: unknown): value is CombatEffectAtomicReadSetHeader {
  return (
    record(value) &&
    exactKeys(value, ["occurrenceId", "programId", "sourceId"]) &&
    nonEmpty(value.occurrenceId) &&
    nonEmpty(value.programId) &&
    nonEmpty(value.sourceId)
  );
}

const OWNER_CORE_ADDRESSES = [
  "base-state",
  "max-hp",
  "damage-defenses",
  "zero-hp-floors",
  "occurrence-heads",
] as const;

function sameSortedKeys(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>
): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function logicalCombatantKey(binding: AtomicEntityBinding): string {
  return encodedIdentity([binding.owner.kind, binding.owner.combatantId]);
}

function validReadSet(
  value: unknown,
  header?: Readonly<CombatEffectAtomicReadSetHeader>
): value is CombatEffectAtomicReadSet {
  if (
    !record(value) ||
    !exactKeys(value, ["schema", "bindings", "reads"]) ||
    value.schema !== 1 ||
    !Array.isArray(value.bindings) ||
    value.bindings.length === 0 ||
    !value.bindings.every(validEntityBinding) ||
    !orderedUniqueBy(value.bindings as ReadonlyArray<AtomicEntityBinding>, (binding) =>
      entityRefKey(binding.ref)
    ) ||
    !Array.isArray(value.reads) ||
    !value.reads.every(validRead) ||
    !orderedUniqueBy(value.reads as ReadonlyArray<AtomicRead>, (read) =>
      addressKey(read.owner, read.address)
    )
  ) {
    return false;
  }
  const bindings = value.bindings as ReadonlyArray<AtomicEntityBinding>;
  const reads = value.reads as ReadonlyArray<AtomicRead>;
  const scopes = new Set(bindings.map(({ owner }) => atomicOwnerScopeKey(owner)));
  if (scopes.size !== 1) return false;
  const boundOwners = new Set(bindings.map(({ owner }) => ownerKey(owner)));
  if (reads.some(({ owner }) => !boundOwners.has(ownerKey(owner)))) return false;

  const boundDocuments = new Set(
    bindings.flatMap(({ owner }) => [
      documentKey(atomicDocumentForOwner(owner)),
      documentKey(atomicLedgerForOwner(owner)),
    ])
  );
  const revisionDocuments = reads
    .filter(
      (read): read is Extract<AtomicRead, { address: { kind: "document-revision" } }> =>
        read.address.kind === "document-revision"
    )
    .map(({ address }) => documentKey(address.document));
  const misboundRevision = reads.some((read) => {
    if (read.address.kind !== "document-revision") return false;
    const document = documentKey(read.address.document);
    return (
      document !== documentKey(atomicDocumentForOwner(read.owner)) &&
      document !== documentKey(atomicLedgerForOwner(read.owner))
    );
  });
  if (
    misboundRevision ||
    revisionDocuments.length !== boundDocuments.size ||
    revisionDocuments.some(
      (document, index) => revisionDocuments.indexOf(document) !== index
    ) ||
    revisionDocuments.some((document) => !boundDocuments.has(document)) ||
    [...boundDocuments].some((document) => !revisionDocuments.includes(document))
  ) {
    return false;
  }

  const ownerByLogicalCombatant = new Map<string, string>();
  for (const binding of bindings) {
    const logical = logicalCombatantKey(binding);
    const physical = ownerKey(binding.owner);
    const prior = ownerByLogicalCombatant.get(logical);
    if (prior !== undefined && prior !== physical) return false;
    ownerByLogicalCombatant.set(logical, physical);
  }

  for (const owner of boundOwners) {
    for (const kind of OWNER_CORE_ADDRESSES) {
      if (
        reads.filter(
          (read) => ownerKey(read.owner) === owner && read.address.kind === kind
        ).length !== 1
      ) {
        return false;
      }
    }
  }

  const lifecycleReads = reads.filter(
    (read): read is Extract<AtomicRead, { address: { kind: "lifecycle-head" } }> =>
      read.address.kind === "lifecycle-head"
  );
  if (lifecycleReads.length !== 1) return false;
  const lifecycleRead = lifecycleReads[0];
  if (!lifecycleRead) return false;
  const sourceBinding = bindings.find(
    (binding) =>
      binding.ref.kind === "source" && binding.ref.id === lifecycleRead.address.sourceId
  );
  if (
    sourceBinding === undefined ||
    ownerKey(sourceBinding.owner) !== ownerKey(lifecycleRead.owner)
  ) {
    return false;
  }
  if (
    header !== undefined &&
    (lifecycleRead.address.occurrenceId !== header.occurrenceId ||
      lifecycleRead.address.programId !== header.programId ||
      lifecycleRead.address.sourceId !== header.sourceId)
  ) {
    return false;
  }

  const maxHpByOwner = new Map<string, number>();
  const baseStateByOwner = new Map<string, AtomicBaseState>();
  const resourceReadsByOwner = new Map<string, Map<string, AtomicResourceSnapshot>>();
  const stateFlagReadsByOwner = new Map<string, Map<string, AtomicStateFlagSnapshot>>();
  for (const read of reads) {
    const owner = ownerKey(read.owner);
    if (read.address.kind === "max-hp") {
      maxHpByOwner.set(owner, read.expected as number);
    }
    if (read.address.kind === "base-state") {
      baseStateByOwner.set(owner, read.expected as AtomicBaseState);
    }
    if (read.address.kind === "resource") {
      if (!validResourceSnapshot(read.expected)) return false;
      const resources =
        resourceReadsByOwner.get(owner) ?? new Map<string, AtomicResourceSnapshot>();
      resources.set(read.address.programResourceId, read.expected);
      resourceReadsByOwner.set(owner, resources);
    }
    if (read.address.kind === "state-flag") {
      const snapshot = read.expected as AtomicStateFlagSnapshot;
      if (snapshot.binding.activeKey !== read.address.stateKey) return false;
      const flags =
        stateFlagReadsByOwner.get(owner) ?? new Map<string, AtomicStateFlagSnapshot>();
      flags.set(read.address.stateKey, snapshot);
      stateFlagReadsByOwner.set(owner, flags);
    }
  }
  for (const owner of boundOwners) {
    const baseState = baseStateByOwner.get(owner);
    const maxHp = maxHpByOwner.get(owner);
    if (baseState === undefined || maxHp === undefined || baseState.hp > maxHp) {
      return false;
    }
    const resourceManifest = Object.keys(baseState.resources).sort();
    const resourceReads =
      resourceReadsByOwner.get(owner) ?? new Map<string, AtomicResourceSnapshot>();
    const resourceKeys = [...resourceReads.keys()].sort();
    if (!sameSortedKeys(resourceManifest, resourceKeys)) return false;
    for (const resourceId of resourceManifest) {
      const expected = baseState.resources[resourceId];
      const snapshot = resourceReads.get(resourceId);
      if (
        snapshot === undefined ||
        (expected === null
          ? snapshot.present
          : !snapshot.present || snapshot.current !== expected)
      ) {
        return false;
      }
    }
    const physicalResourceBindings = new Set<string>();
    for (const snapshot of resourceReads.values()) {
      if (!snapshot.present) continue;
      const binding = JSON.stringify(snapshot.binding);
      if (physicalResourceBindings.has(binding)) return false;
      physicalResourceBindings.add(binding);
    }
    const stateFlagManifest = Object.keys(baseState.stateFlags).sort();
    const stateFlagReads =
      stateFlagReadsByOwner.get(owner) ?? new Map<string, AtomicStateFlagSnapshot>();
    const stateFlagKeys = [...stateFlagReads.keys()].sort();
    if (!sameSortedKeys(stateFlagManifest, stateFlagKeys)) return false;
    for (const stateFlagKey of stateFlagManifest) {
      const snapshot = stateFlagReads.get(stateFlagKey);
      if (
        snapshot === undefined ||
        snapshot.active !== baseState.stateFlags[stateFlagKey]
      ) {
        return false;
      }
    }
  }
  for (const read of reads) {
    const owner = ownerKey(read.owner);
    if (
      read.address.kind === "zero-hp-floors" &&
      (read.expected as ReadonlyArray<AtomicZeroHpFloor>).some(
        ({ stateKey: key }) => stateFlagReadsByOwner.get(owner)?.get(key)?.active !== true
      )
    ) {
      return false;
    }
    if (
      read.address.kind === "occurrence-heads" &&
      (read.expected as ReadonlyArray<AtomicOccurrenceHead>).some(
        ({ effect }) => !effectTargetsOwner(effect, read.owner)
      )
    ) {
      return false;
    }
  }
  return true;
}

/** Exact defensive parser for the portable atomic planning snapshot. */
export function conformCombatEffectAtomicReadSet(
  value: unknown,
  header?: Readonly<CombatEffectAtomicReadSetHeader>
): Readonly<CombatEffectAtomicReadSet> | null {
  try {
    if (
      !plainJson(value) ||
      (header !== undefined && (!plainJson(header) || !validReadSetHeader(header))) ||
      !validReadSet(value, header)
    ) {
      return null;
    }
    return frozenCanonical(value as CombatEffectAtomicReadSet);
  } catch {
    return null;
  }
}

/** Byte-stable serialization used by command identity and replay checks. */
export function serializeCombatEffectAtomicReadSet(value: unknown): string {
  const conformed = conformCombatEffectAtomicReadSet(value);
  if (!conformed) throw new TypeError("Invalid combat-effect atomic read set");
  return JSON.stringify(conformed);
}
