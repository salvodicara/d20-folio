import { materialRefKey } from "@/lib/action-journal";
import { conformMechanicsExecutionFrame } from "@/lib/mechanics-command-boundary";
import {
  consumeMechanicsSubscriberSelection,
  mechanicsSubscriberSelectionFiber,
} from "@/lib/mechanics-event-selection";
import {
  canonicalFingerprint,
  canonicalJson,
  conformCanonicalFingerprint,
} from "@/lib/canonical-fingerprint";
import { projectCreatureConditions } from "@/lib/condition";
import {
  conformProgramPhaseCompletion,
  isEffectOccurrence,
  resolveOccurrenceAuthority,
} from "@/lib/mechanic-occurrences";
import {
  parseCharacterMaterialState,
  parseSharedMaterialState,
} from "@/lib/material-state";
import {
  conformClockRef,
  conformEntityRef,
  conformInventoryGenerationRef,
  conformOccurrenceGenerationRef,
  entityRefKey,
  inventoryGenerationRefKey,
  occurrenceGenerationRefKey,
} from "@/lib/mechanics-reference-schema";
import {
  createBetweenTurnsEconomyState,
  createTurnEconomyState,
} from "@/lib/turn-economy";
import type {
  EndRule,
  MechanicOccurrence,
  MechanicsEndCause,
  ObservedMechanicsBoundary,
  ProgramPhaseCompletion,
} from "@/types/mechanic-occurrence";
import type { MechanicsSourceRef } from "@/types/mechanics-authority-ref";
import type {
  ClockRef,
  EntityRef,
  MaterialEntityRef,
  MaterialRef,
  OccurrenceGenerationRef,
  OccurrenceRef,
} from "@/types/mechanics-reference";
import type { ConditionInstance } from "@/types/condition";
import type {
  CharacterMaterialState,
  EncounterState,
  SharedMaterialState,
} from "@/types/material-state";
import type { CreatureVitals } from "@/types/vitals";
import type {
  EncounterSeed,
  MechanicsBoundaryCheckpoint,
  MechanicsBoundaryCompletion,
  MechanicsBoundaryCommand,
  MechanicsBoundaryContinuation,
  MechanicsBoundaryCursor,
  MechanicsBoundaryEncounterCursor,
  MechanicsBoundaryParticipantCursor,
  MechanicsBoundaryResult,
  MechanicsCausalState,
  MechanicsCausalStateResult,
  MechanicsClosureRequest,
  MechanicsDocument,
  MechanicsEndCandidate,
  MechanicsEndDiscoveryResult,
  MechanicsEndWaveLatchResult,
  MechanicsEndWaveCheckpoint,
  MechanicsEndWaveReceipt,
  MechanicsPendingFrame,
  MechanicsPendingFrameCursor,
  MechanicsWorld,
  MechanicsWorldInvalidReason,
  MechanicsWorldParseResult,
  MechanicsWorldSimulationRejection,
  MechanicsWorldSimulationResult,
} from "@/types/mechanics-world";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";
import type {
  CharacterMaterialRef,
  InventoryGenerationRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_ID_LENGTH = 256;
const MAX_WORLD_DOCUMENTS = 256;
const MAX_ENCOUNTER_PARTICIPANTS = 256;
const MAX_PENDING_FRAMES = 256;
const MAX_PENDING_SLOT = 2_048;

/** Nonempty pending stacks are process-local capabilities, never JSON credentials. */
const kernelCausalStates = new WeakSet<object>();

type MutableDocument =
  | {
      kind: "character";
      material: CharacterMaterialRef;
      state: CharacterMaterialState;
    }
  | {
      kind: "shared";
      material: SharedMaterialRef;
      state: SharedMaterialState;
    };

interface MutableWorld {
  scope: MaterialRef;
  documents: MutableDocument[];
}

function isExactRecord(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string")) {
    return false;
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  return actual.every((key, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      key === expected[index] && descriptor?.enumerable === true && "value" in descriptor
    );
  });
}

function ownDataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && "value" in descriptor
    ? (descriptor.value as unknown)
    : undefined;
}

function isClosureRequestShape(value: unknown): value is MechanicsClosureRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const allowed = new Set(["boundaries", "endRequests", "inventorySourceLeases"]);
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.at(-1) !== "length") return false;
  return keys.slice(0, -1).every((key, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      key === String(index) && descriptor?.enumerable === true && "value" in descriptor
    );
  });
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !UNSAFE_KEYS.has(value)
  );
}

function isCounter(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0)
  );
}

function isPositiveCounter(value: unknown): value is number {
  return isCounter(value) && value > 0;
}

function isMaterialRef(value: unknown): value is MaterialRef {
  if (isExactRecord(value, ["kind", "uid", "characterId"])) {
    return value.kind === "character-play" && isId(value.uid) && isId(value.characterId);
  }
  return (
    isExactRecord(value, ["kind", "campaignId"]) &&
    value.kind === "shared-combat" &&
    isId(value.campaignId)
  );
}

function conformObservedMechanicsBoundary(
  value: unknown
): Readonly<ObservedMechanicsBoundary> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const kind = ownDataProperty(value, "kind");
  if (kind === "time-reached") {
    if (!isExactRecord(value, ["clock", "elapsedSeconds", "kind"])) return null;
    const clock = conformClockRef(value.clock);
    return clock && isCounter(value.elapsedSeconds)
      ? freezeDeep({ clock, elapsedSeconds: value.elapsedSeconds, kind })
      : null;
  }
  if (kind === "combat-end") {
    if (!isExactRecord(value, ["clock", "kind"])) return null;
    const clock = conformClockRef(value.clock);
    return clock ? freezeDeep({ clock, kind }) : null;
  }
  if (kind === "turn-boundary") {
    if (!isExactRecord(value, ["clock", "combatant", "kind", "phase", "round"])) {
      return null;
    }
    const clock = conformClockRef(value.clock);
    const combatant = conformEntityRef(value.combatant);
    return clock &&
      combatant &&
      (value.phase === "start" || value.phase === "end") &&
      isPositiveCounter(value.round)
      ? freezeDeep<ObservedMechanicsBoundary>({
          clock,
          combatant,
          kind,
          phase: value.phase,
          round: value.round,
        })
      : null;
  }
  if (kind === "rest-completed") {
    if (
      !isExactRecord(value, ["boundaryOrdinal", "clock", "combatant", "kind", "rest"])
    ) {
      return null;
    }
    const clock = conformClockRef(value.clock);
    const combatant = conformEntityRef(value.combatant);
    return clock &&
      combatant &&
      isPositiveCounter(value.boundaryOrdinal) &&
      (value.rest === "short" || value.rest === "long")
      ? freezeDeep<ObservedMechanicsBoundary>({
          boundaryOrdinal: value.boundaryOrdinal,
          clock,
          combatant,
          kind,
          rest: value.rest,
        })
      : null;
  }
  if (kind === "day-phase") {
    if (!isExactRecord(value, ["boundaryOrdinal", "clock", "kind", "phase"])) {
      return null;
    }
    const clock = conformClockRef(value.clock);
    return clock &&
      isPositiveCounter(value.boundaryOrdinal) &&
      (value.phase === "dawn" || value.phase === "dusk")
      ? freezeDeep<ObservedMechanicsBoundary>({
          boundaryOrdinal: value.boundaryOrdinal,
          clock,
          kind,
          phase: value.phase,
        })
      : null;
  }
  return null;
}

function conformEncounterSeed(value: unknown): Readonly<EncounterSeed> | null {
  if (
    !isExactRecord(value, [
      "currentCombatantId",
      "nextCombatantOrdinal",
      "order",
      "participants",
      "phase",
      "round",
    ]) ||
    !(value.currentCombatantId === null || isId(value.currentCombatantId)) ||
    !isPositiveCounter(value.nextCombatantOrdinal) ||
    !isDenseArray(value.order) ||
    value.order.length > MAX_ENCOUNTER_PARTICIPANTS ||
    !value.order.every(isId) ||
    new Set(value.order).size !== value.order.length ||
    (value.phase !== "initiative" && value.phase !== "turns") ||
    !isPositiveCounter(value.round) ||
    typeof value.participants !== "object" ||
    value.participants === null ||
    Array.isArray(value.participants) ||
    Object.getPrototypeOf(value.participants) !== Object.prototype
  ) {
    return null;
  }
  const participantKeys = Reflect.ownKeys(value.participants);
  if (
    participantKeys.length > MAX_ENCOUNTER_PARTICIPANTS ||
    participantKeys.some((key) => typeof key !== "string" || !isId(key))
  ) {
    return null;
  }
  const participants: Record<string, EncounterSeed["participants"][string]> = {};
  for (const key of participantKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value.participants, key);
    const participant = descriptor?.value as unknown;
    if (
      descriptor?.enumerable !== true ||
      !("value" in descriptor) ||
      !isExactRecord(participant, [
        "combatant",
        "initiativeRoll",
        "ordinal",
        "skipped",
      ]) ||
      !isPositiveCounter(participant.ordinal) ||
      !(
        participant.initiativeRoll === null ||
        (isPositiveCounter(participant.initiativeRoll) &&
          participant.initiativeRoll <= 20)
      ) ||
      typeof participant.skipped !== "boolean"
    ) {
      return null;
    }
    const combatant = conformEntityRef(participant.combatant);
    if (!combatant) return null;
    participants[key] = {
      combatant,
      initiativeRoll: participant.initiativeRoll,
      ordinal: participant.ordinal,
      skipped: participant.skipped,
    };
  }
  return freezeDeep({
    currentCombatantId: value.currentCombatantId,
    nextCombatantOrdinal: value.nextCombatantOrdinal,
    order: [...value.order],
    participants,
    phase: value.phase,
    round: value.round,
  });
}

/** Exact hostile-input boundary for the sole world-clock/encounter command. */
export function conformMechanicsBoundaryCommand(
  value: unknown
): Readonly<MechanicsBoundaryCommand> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const kind = ownDataProperty(value, "kind");
  if (kind === "advance-time") {
    if (!isExactRecord(value, ["clock", "elapsedSeconds", "kind"])) return null;
    const clock = conformClockRef(value.clock);
    return clock && isPositiveCounter(value.elapsedSeconds)
      ? freezeDeep({ clock, elapsedSeconds: value.elapsedSeconds, kind })
      : null;
  }
  if (kind === "complete-rest") {
    if (!isExactRecord(value, ["input", "kind"])) return null;
    const boundary = conformObservedMechanicsBoundary({
      ...(isExactRecord(value.input, ["clock", "combatant", "rest"]) ? value.input : {}),
      boundaryOrdinal: 1,
      kind: "rest-completed",
    });
    return boundary?.kind === "rest-completed"
      ? freezeDeep({
          input: {
            clock: boundary.clock,
            combatant: boundary.combatant,
            rest: boundary.rest,
          },
          kind,
        })
      : null;
  }
  if (kind === "observe-day-phase") {
    if (!isExactRecord(value, ["input", "kind"])) return null;
    const boundary = conformObservedMechanicsBoundary({
      ...(isExactRecord(value.input, ["clock", "phase"]) ? value.input : {}),
      boundaryOrdinal: 1,
      kind: "day-phase",
    });
    return boundary?.kind === "day-phase"
      ? freezeDeep({
          input: { clock: boundary.clock, phase: boundary.phase },
          kind,
        })
      : null;
  }
  if (kind === "complete-turn") {
    if (
      !isExactRecord(value, ["excludeCurrent", "kind", "material"]) ||
      !isMaterialRef(value.material)
    ) {
      return null;
    }
    const excludeCurrent =
      value.excludeCurrent === null ? null : conformEntityRef(value.excludeCurrent);
    if (
      value.excludeCurrent !== null &&
      (!excludeCurrent || excludeCurrent.entityId === "self")
    ) {
      return null;
    }
    return freezeDeep({
      excludeCurrent: excludeCurrent as MaterialEntityRef | null,
      kind,
      material: structuredClone(value.material),
    });
  }
  if (kind === "end-encounter") {
    if (!isExactRecord(value, ["kind", "material"]) || !isMaterialRef(value.material)) {
      return null;
    }
    return freezeDeep({ kind, material: structuredClone(value.material) });
  }
  if (kind === "start-encounter") {
    if (
      !isExactRecord(value, ["kind", "material", "seed"]) ||
      !isMaterialRef(value.material)
    ) {
      return null;
    }
    const seed = conformEncounterSeed(value.seed);
    return seed
      ? freezeDeep({ kind, material: structuredClone(value.material), seed })
      : null;
  }
  return null;
}

function sameMaterial(left: MaterialRef, right: MaterialRef): boolean {
  return materialRefKey(left) === materialRefKey(right);
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return entityRefKey(left) === entityRefKey(right);
}

function sameClock(left: ClockRef, right: ClockRef): boolean {
  return left.epoch === right.epoch && sameMaterial(left.material, right.material);
}

function freezeDeep<T>(value: T): Readonly<T> {
  const visit = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || Object.isFrozen(entry)) return;
    Object.values(entry).forEach(visit);
    Object.freeze(entry);
  };
  visit(value);
  return value;
}

function documentFor(world: MutableWorld, material: MaterialRef): MutableDocument | null;
function documentFor(
  world: Pick<MechanicsWorld, "documents">,
  material: MaterialRef
): MechanicsDocument | null;
function documentFor(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  material: MaterialRef
): MechanicsDocument | MutableDocument | null {
  const key = materialRefKey(material);
  return (
    world.documents.find((document) => materialRefKey(document.material) === key) ?? null
  );
}

function occurrenceAtAddress(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  reference: OccurrenceRef
): MechanicOccurrence | null {
  return (
    documentFor(world, reference.material)?.state.occurrences[reference.occurrenceId] ??
    null
  );
}

function occurrenceAtGeneration(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  reference: OccurrenceGenerationRef
): MechanicOccurrence | null {
  const occurrence = occurrenceAtAddress(world, reference.occurrence);
  return occurrence?.ordinal === reference.ordinal ? occurrence : null;
}

function entityGenerationResolves(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  entityRef: EntityRef
): boolean {
  const document = documentFor(world, entityRef.material);
  if (!document) return false;
  if (entityRef.entityId === "self") return document.kind === "character";
  return document.state.entities[entityRef.entityId]?.ordinal === entityRef.ordinal;
}

function entityPresent(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  entityRef: EntityRef
): boolean {
  const document = documentFor(world, entityRef.material);
  if (!document || !entityGenerationResolves(world, entityRef)) return false;
  if (entityRef.entityId === "self") return true;
  const entity = document.state.entities[entityRef.entityId];
  return entity?.availability === "present";
}

function creaturePresent(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  entityRef: EntityRef
): boolean {
  const document = documentFor(world, entityRef.material);
  if (!document || !entityGenerationResolves(world, entityRef)) return false;
  if (entityRef.entityId === "self") return true;
  const entity = document.state.entities[entityRef.entityId];
  return entity?.kind === "creature" && entity.availability === "present";
}

function clockResolves(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  clock: ClockRef,
  kind: "timeline" | "encounter"
): boolean {
  const document = documentFor(world, clock.material);
  if (!document) return false;
  return kind === "timeline"
    ? document.state.timeline.epoch === clock.epoch
    : document.state.encounter?.epoch === clock.epoch;
}

function occurrenceLiveEntities(occurrence: MechanicOccurrence): EntityRef[] {
  const refs = isEffectOccurrence(occurrence) ? [occurrence.target] : [];
  if (occurrence.kind === "standing" && occurrence.fact.kind === "target-mark") {
    refs.push(occurrence.fact.marked);
  }
  for (const rule of occurrence.endRules) {
    if (rule.kind === "turn-boundary" || rule.kind === "rest-completed") {
      refs.push(rule.combatant);
    }
  }
  return refs;
}

function occurrenceLiveEntityResolves(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  occurrence: MechanicOccurrence,
  entity: EntityRef
): boolean {
  return occurrence.kind === "material-lifecycle"
    ? entityGenerationResolves(world, entity)
    : entityPresent(world, entity);
}

type InventoryItemSource = Extract<MechanicsSourceRef, { kind: "inventory-item" }>;

function inventoryItemSource(
  state: Pick<
    CharacterMaterialState | SharedMaterialState,
    "nextOccurrenceOrdinal" | "occurrences"
  >,
  occurrenceId: string
): Readonly<InventoryItemSource> | null {
  const source = resolveOccurrenceAuthority(state, occurrenceId)?.authority.source;
  return source?.kind === "inventory-item" ? source : null;
}

function inventorySourceKey(source: Readonly<InventoryItemSource>): string {
  return inventoryGenerationKey(source.owner, source.instanceId, source.instanceOrdinal);
}

function inventoryGenerationKey(
  owner: CharacterMaterialRef,
  instanceId: string,
  instanceOrdinal: number
): string {
  return inventoryGenerationRefKey({ instanceId, instanceOrdinal, owner });
}

function activeInventorySourceKeys(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld
): Set<string> {
  const result = new Set<string>();
  for (const document of world.documents) {
    for (const occurrenceId of Object.keys(document.state.occurrences)) {
      const source = inventoryItemSource(document.state, occurrenceId);
      if (source) result.add(inventorySourceKey(source));
    }
  }
  return result;
}

function inventorySourceResolves(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  source: Readonly<InventoryItemSource>
): boolean {
  const owner = documentFor(world, source.owner);
  return (
    owner?.kind === "character" &&
    owner.state.inventory[source.instanceId]?.ordinal === source.instanceOrdinal
  );
}

function occurrenceClocksResolve(
  world: MechanicsWorld,
  occurrence: MechanicOccurrence
): boolean {
  return occurrence.endRules.every((rule) => {
    if (
      rule.kind === "time-reached" ||
      rule.kind === "rest-completed" ||
      rule.kind === "day-phase"
    ) {
      if (!clockResolves(world, rule.clock, "timeline")) return false;
      const document = documentFor(world, rule.clock.material);
      if (rule.kind !== "time-reached") {
        return (
          document !== null &&
          rule.minimumBoundaryOrdinal <= document.state.timeline.nextBoundaryOrdinal
        );
      }
      return (
        document !== null && rule.elapsedSeconds > document.state.timeline.elapsedSeconds
      );
    }
    if (rule.kind === "combat-end" || rule.kind === "turn-boundary") {
      return clockResolves(world, rule.clock, "encounter");
    }
    return true;
  });
}

function effectTargetsHolder(
  world: MechanicsWorld,
  reference: OccurrenceGenerationRef,
  holder: EntityRef
): boolean {
  const occurrence = occurrenceAtGeneration(world, reference);
  return (
    occurrence !== null &&
    isEffectOccurrence(occurrence) &&
    sameEntity(occurrence.target, holder)
  );
}

function materialLifecycleOwns(
  world: MechanicsWorld,
  reference: OccurrenceGenerationRef,
  holder: EntityRef
): boolean {
  const occurrence = occurrenceAtGeneration(world, reference);
  return (
    occurrence?.kind === "material-lifecycle" && sameEntity(occurrence.target, holder)
  );
}

function temporaryHitPointSourceValid(
  world: MechanicsWorld,
  vitals: CreatureVitals,
  holder: EntityRef
): boolean {
  const reference = vitals.hitPoints.temporary.sourceOccurrence;
  return reference === null || effectTargetsHolder(world, reference, holder);
}

function occurrenceCreatureSemanticsValid(
  world: MechanicsWorld,
  occurrence: MechanicOccurrence
): boolean {
  if (!isEffectOccurrence(occurrence)) {
    return occurrence.endRules.every(
      (rule) =>
        (rule.kind !== "turn-boundary" && rule.kind !== "rest-completed") ||
        creaturePresent(world, rule.combatant)
    );
  }
  const targetMustBeCreature =
    occurrence.kind === "condition" ||
    occurrence.kind === "concentration" ||
    occurrence.kind === "polymorph-form" ||
    occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty");
  if (targetMustBeCreature && !creaturePresent(world, occurrence.target)) {
    return false;
  }
  return occurrence.endRules.every(
    (rule) =>
      (rule.kind !== "turn-boundary" && rule.kind !== "rest-completed") ||
      creaturePresent(world, rule.combatant)
  );
}

function validateReferences(
  world: MechanicsWorld,
  inventorySourceLeases: ReadonlySet<string> = new Set(),
  allowEndingDeadlines = false
): MechanicsWorldInvalidReason | null {
  const concentrations = new Set<string>();
  const encounterCombatants = new Set<string>();
  const polymorphs = new Set<string>();
  const ownedMaterialLifecycles = new Set<string>();
  const activeItemSources = activeInventorySourceKeys(world);
  for (const document of world.documents) {
    if (document.kind === "character") {
      const self = {
        material: document.material,
        entityId: "self",
      } satisfies EntityRef;
      if (!temporaryHitPointSourceValid(world, document.state.vitals, self)) {
        return "missing-reference";
      }
      for (const [instanceId, instance] of Object.entries(document.state.inventory)) {
        if (
          instance.ownerOccurrence !== null &&
          !materialLifecycleOwns(world, instance.ownerOccurrence, self)
        ) {
          return "missing-reference";
        }
        if (instance.ownerOccurrence !== null) {
          const ownerKey = occurrenceGenerationRefKey(instance.ownerOccurrence);
          if (ownedMaterialLifecycles.has(ownerKey)) {
            return "duplicate-lifecycle-owner";
          }
          ownedMaterialLifecycles.add(ownerKey);
        }
        if (
          instance.quantity.current === 0 &&
          !inventorySourceLeases.has(
            inventoryGenerationKey(document.material, instanceId, instance.ordinal)
          ) &&
          !activeItemSources.has(
            inventoryGenerationKey(document.material, instanceId, instance.ordinal)
          )
        ) {
          return "missing-reference";
        }
      }
    }
    for (const [entityId, entity] of Object.entries(document.state.entities)) {
      const holder = {
        material: document.material,
        entityId,
        ordinal: entity.ordinal,
      } satisfies EntityRef;
      const linkedInventory =
        entity.kind === "object" && entity.template.kind === "inventory-item"
          ? documentFor(world, entity.template.owner)
          : null;
      if (
        (entity.controller !== null &&
          !entityGenerationResolves(world, entity.controller)) ||
        (entity.ownerOccurrence !== null &&
          !materialLifecycleOwns(world, entity.ownerOccurrence, holder)) ||
        (entity.kind === "creature" &&
          !temporaryHitPointSourceValid(world, entity.vitals, holder)) ||
        (entity.kind === "object" &&
          entity.template.kind === "inventory-item" &&
          (linkedInventory?.kind !== "character" ||
            linkedInventory.state.inventory[entity.template.instanceId]?.ordinal !==
              entity.template.instanceOrdinal))
      ) {
        return "missing-reference";
      }
      if (entity.ownerOccurrence !== null) {
        const ownerKey = occurrenceGenerationRefKey(entity.ownerOccurrence);
        if (ownedMaterialLifecycles.has(ownerKey)) {
          return "duplicate-lifecycle-owner";
        }
        ownedMaterialLifecycles.add(ownerKey);
      }
    }
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      if (
        !occurrenceLiveEntities(occurrence).every((ref) =>
          occurrenceLiveEntityResolves(world, occurrence, ref)
        )
      ) {
        return "missing-reference";
      }
      if (
        !(allowEndingDeadlines && occurrence.ending !== null) &&
        !occurrenceClocksResolve(world, occurrence)
      ) {
        return "invalid-clock";
      }
      if (!occurrenceCreatureSemanticsValid(world, occurrence)) {
        return "missing-reference";
      }
      const itemSource = inventoryItemSource(document.state, occurrenceId);
      if (itemSource && !inventorySourceResolves(world, itemSource)) {
        return "missing-reference";
      }
      if (occurrence.kind === "concentration" && occurrence.ending === null) {
        const targetKey = entityRefKey(occurrence.target);
        if (concentrations.has(targetKey)) return "duplicate-exclusive-state";
        concentrations.add(targetKey);
      } else if (occurrence.kind === "polymorph-form" && occurrence.ending === null) {
        const targetKey = entityRefKey(occurrence.target);
        if (polymorphs.has(targetKey)) return "duplicate-exclusive-state";
        polymorphs.add(targetKey);
      }
    }
    const encounter = document.state.encounter;
    if (encounter) {
      for (const participant of Object.values(encounter.participants)) {
        const combatantKey = entityRefKey(participant.combatant);
        if (encounterCombatants.has(combatantKey)) {
          return "duplicate-exclusive-state";
        }
        encounterCombatants.add(combatantKey);
        if (!creaturePresent(world, participant.combatant)) {
          return "missing-reference";
        }
      }
    }
  }
  return null;
}

function validateLeases(world: MechanicsWorld): MechanicsWorldInvalidReason | null {
  const sharedLeases = new Map<string, { timeline: ClockRef; encounter: ClockRef }>();
  for (const document of world.documents) {
    if (document.kind !== "shared" || !document.state.encounter) continue;
    const timeline = {
      material: document.material,
      epoch: document.state.timeline.epoch,
    };
    const encounter = {
      material: document.material,
      epoch: document.state.encounter.epoch,
    };
    for (const participant of Object.values(document.state.encounter.participants)) {
      if (participant.combatant.material.kind !== "character-play") continue;
      const key = materialRefKey(participant.combatant.material);
      const existing = sharedLeases.get(key);
      if (existing && !sameClock(existing.encounter, encounter)) return "invalid-lease";
      sharedLeases.set(key, { timeline, encounter });
    }
  }

  for (const document of world.documents) {
    if (document.kind !== "character") continue;
    const lease = sharedLeases.get(materialRefKey(document.material));
    const binding = document.state.clockBinding;
    if (lease) {
      if (
        document.state.encounter !== null ||
        !sameClock(binding.timeline, lease.timeline) ||
        binding.encounter === null ||
        !sameClock(binding.encounter, lease.encounter)
      ) {
        return "invalid-lease";
      }
      continue;
    }
    if (binding.timeline.material.kind === "shared-combat") return "invalid-lease";
    if (!sameMaterial(binding.timeline.material, document.material))
      return "invalid-lease";
    if (binding.timeline.epoch !== document.state.timeline.epoch) return "invalid-lease";
    if (document.state.encounter === null) {
      if (binding.encounter !== null) return "invalid-lease";
    } else if (
      binding.encounter === null ||
      !sameMaterial(binding.encounter.material, document.material) ||
      binding.encounter.epoch !== document.state.encounter.epoch
    ) {
      return "invalid-lease";
    }
  }
  return null;
}

function validateControllerGraph(
  world: MechanicsWorld
): MechanicsWorldInvalidReason | null {
  const controllers = new Map<string, string>();
  for (const document of world.documents) {
    for (const [entityId, entity] of Object.entries(document.state.entities)) {
      if (entity.controller === null) continue;
      controllers.set(
        entityRefKey({ material: document.material, entityId, ordinal: entity.ordinal }),
        entityRefKey(entity.controller)
      );
    }
  }

  const visited = new Set<string>();
  for (const start of controllers.keys()) {
    const path = new Set<string>();
    let current: string | undefined = start;
    while (current !== undefined && !visited.has(current)) {
      if (path.has(current)) return "controller-cycle";
      path.add(current);
      current = controllers.get(current);
    }
    path.forEach((key) => visited.add(key));
  }
  return null;
}

interface PendingFramePermit {
  readonly execution: number;
  readonly phaseId: string;
  readonly root: OccurrenceGenerationRef;
}

function exactEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function receiptPhaseState(receipt: {
  readonly execution: number;
  readonly triggerEventId: string | null;
}) {
  return {
    execution: receipt.execution,
    lastTriggerEventId: receipt.triggerEventId,
  };
}

function pendingFrameKey(frame: Readonly<MechanicsExecutionFrame>): string {
  return `${occurrenceGenerationRefKey(frame.rootReceipt.root)}\u0000${frame.rootReceipt.next.phaseId}`;
}

function conformPendingFrameCursor(
  value: unknown,
  stepCount: number
): Readonly<MechanicsPendingFrameCursor> | null {
  if (isExactRecord(value, ["stage"])) {
    return value.stage === "phase-transition" || value.stage === "phase-complete"
      ? freezeDeep({ stage: value.stage })
      : null;
  }
  if (
    !isExactRecord(value, ["nextSlot", "stage", "stepIndex"]) ||
    value.stage !== "step" ||
    !isCounter(value.stepIndex) ||
    value.stepIndex >= stepCount ||
    !isPositiveCounter(value.nextSlot) ||
    value.nextSlot > MAX_PENDING_SLOT
  ) {
    return null;
  }
  return freezeDeep({
    nextSlot: value.nextSlot,
    stage: value.stage,
    stepIndex: value.stepIndex,
  });
}

function pendingFramePermit(
  world: Readonly<MechanicsWorld>,
  value: unknown
): {
  readonly frame: Readonly<MechanicsPendingFrame>;
  readonly permit: PendingFramePermit;
} | null {
  if (!isExactRecord(value, ["cursor", "frame", "selectedEvent"])) return null;
  const frame = conformMechanicsExecutionFrame(value.frame);
  if (!frame) return null;
  const program = frame.authority.snapshot.program;
  const phase = program?.phases.find(
    ({ phaseId }) => phaseId === frame.rootReceipt.next.phaseId
  );
  if (!program || !phase || !exactEqual(frame, value.frame)) return null;
  const cursor = conformPendingFrameCursor(value.cursor, phase.steps.length);
  if (
    !cursor ||
    !exactEqual(cursor, value.cursor) ||
    typeof value.selectedEvent !== "boolean"
  ) {
    return null;
  }
  const root = occurrenceAtGeneration(world, frame.rootReceipt.root);
  if (
    root?.kind !== "program" ||
    (root.ending !== null && !value.selectedEvent) ||
    !exactEqual(root.authority, frame.authority)
  ) {
    return null;
  }
  const current = root.phaseState[phase.phaseId];
  const expected =
    frame.rootReceipt.kind === "create"
      ? { execution: 0, lastTriggerEventId: null }
      : receiptPhaseState(frame.rootReceipt.expected);
  const next = receiptPhaseState(frame.rootReceipt.next);
  if (!exactEqual(current, cursor.stage === "phase-complete" ? next : expected)) {
    return null;
  }
  return {
    frame: freezeDeep({
      cursor,
      frame,
      selectedEvent: value.selectedEvent,
    }),
    permit: {
      execution: frame.rootReceipt.next.execution,
      phaseId: phase.phaseId,
      root: frame.rootReceipt.root,
    },
  };
}

function conformPendingFrames(
  world: Readonly<MechanicsWorld>,
  value: unknown
): readonly Readonly<MechanicsPendingFrame>[] | null {
  if (!isDenseArray(value) || value.length > MAX_PENDING_FRAMES) return null;
  const keys = new Set<string>();
  const frames: Readonly<MechanicsPendingFrame>[] = [];
  for (const entry of value) {
    const conformed = pendingFramePermit(world, entry);
    if (!conformed) return null;
    const key = pendingFrameKey(conformed.frame.frame);
    if (keys.has(key)) return null;
    keys.add(key);
    frames.push(conformed.frame);
  }
  return freezeDeep(frames);
}

function pendingFramePermits(
  world: Readonly<MechanicsWorld>,
  frames: readonly Readonly<MechanicsPendingFrame>[]
): readonly PendingFramePermit[] | null {
  const conformed = conformPendingFrames(world, frames);
  return conformed
    ? conformed.map(({ frame }) => ({
        execution: frame.rootReceipt.next.execution,
        phaseId: frame.rootReceipt.next.phaseId,
        root: frame.rootReceipt.root,
      }))
    : null;
}

/** One-ahead provenance exists only while its exact recoverable frame is active. */
function validateProgramOrigins(
  world: MechanicsWorld,
  permits: readonly PendingFramePermit[]
): MechanicsWorldInvalidReason | null {
  for (const document of world.documents) {
    for (const occurrence of Object.values(document.state.occurrences)) {
      if (!isEffectOccurrence(occurrence)) continue;
      const { origin } = occurrence;
      if (!sameMaterial(origin.root.occurrence.material, document.material)) {
        return "invalid-program-origin";
      }
      const root = occurrenceAtGeneration(world, origin.root);
      if (
        root?.kind !== "program" ||
        occurrence.parentId !== origin.root.occurrence.occurrenceId
      ) {
        return "invalid-program-origin";
      }
      const phase = root.phaseState[origin.phaseId];
      if (!phase || origin.execution > phase.execution + 1) {
        return "invalid-program-origin";
      }
      if (
        origin.execution === phase.execution + 1 &&
        !permits.some(
          (permit) =>
            permit.execution === origin.execution &&
            permit.phaseId === origin.phaseId &&
            exactEqual(permit.root, origin.root)
        )
      ) {
        return "invalid-program-origin";
      }
    }
  }
  return null;
}

function validateClosedTurnState(
  world: MechanicsWorld
): MechanicsWorldInvalidReason | null {
  for (const document of world.documents) {
    const encounter = document.state.encounter;
    if (encounter?.phase !== "turns" || encounter.currentCombatantId === null) {
      continue;
    }
    if (
      encounter.participants[encounter.currentCombatantId]?.economy.phase !== "own-turn"
    ) {
      return "invalid-turn-state";
    }
  }
  return null;
}

function validateWorldInvariants(
  world: MechanicsWorld,
  inventorySourceLeases: ReadonlySet<string> = new Set(),
  allowLatchedEndings = false,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[] = []
): MechanicsWorldInvalidReason | null {
  if (
    !allowLatchedEndings &&
    world.documents.some((document) =>
      Object.values(document.state.occurrences).some(
        (occurrence) => occurrence.ending !== null
      )
    )
  ) {
    return "invalid-ending";
  }
  const permits = pendingFramePermits(world, pendingFrames);
  if (!permits) return "invalid-program-origin";
  return validateWorldInvariantsWithPermits(world, inventorySourceLeases, permits);
}

function validateReadableCausalWorld(
  world: MechanicsWorld,
  inventorySourceLeases: ReadonlySet<string>,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): MechanicsWorldInvalidReason | null {
  const permits = pendingFramePermits(world, pendingFrames);
  if (!permits) return "invalid-program-origin";
  return (
    validateReferences(world, inventorySourceLeases, true) ??
    validateProgramOrigins(world, permits) ??
    validateControllerGraph(world) ??
    validateLeases(world)
  );
}

function validateWorldInvariantsWithPermits(
  world: MechanicsWorld,
  inventorySourceLeases: ReadonlySet<string>,
  permits: readonly PendingFramePermit[]
): MechanicsWorldInvalidReason | null {
  return (
    validateReferences(world, inventorySourceLeases) ??
    validateProgramOrigins(world, permits) ??
    validateControllerGraph(world) ??
    validateLeases(world)
  );
}

/** Parse exact physical documents without assuming their causal closure already ran. */
function parseMechanicsWorldStructure(value: unknown): MechanicsWorldParseResult {
  if (
    !isExactRecord(value, ["scope", "documents"]) ||
    !isMaterialRef(value.scope) ||
    !isDenseArray(value.documents) ||
    value.documents.length === 0 ||
    value.documents.length > MAX_WORLD_DOCUMENTS
  ) {
    return { ok: false, reason: "invalid-shape" };
  }
  const scope = value.scope;

  const documents: MechanicsDocument[] = [];
  let previousKey: string | null = null;
  for (const rawDocument of value.documents) {
    if (!isExactRecord(rawDocument, ["kind", "material", "state"])) {
      return { ok: false, reason: "invalid-document" };
    }
    let document: MechanicsDocument;
    if (rawDocument.kind === "character" && isMaterialRef(rawDocument.material)) {
      if (rawDocument.material.kind !== "character-play") {
        return { ok: false, reason: "invalid-document" };
      }
      const parsed = parseCharacterMaterialState(rawDocument.state, rawDocument.material);
      if (!parsed.ok) return { ok: false, reason: "invalid-document" };
      document = {
        kind: "character",
        material: rawDocument.material,
        state: parsed.value,
      };
    } else if (rawDocument.kind === "shared" && isMaterialRef(rawDocument.material)) {
      if (rawDocument.material.kind !== "shared-combat") {
        return { ok: false, reason: "invalid-document" };
      }
      const parsed = parseSharedMaterialState(rawDocument.state, rawDocument.material);
      if (!parsed.ok) return { ok: false, reason: "invalid-document" };
      document = { kind: "shared", material: rawDocument.material, state: parsed.value };
    } else {
      return { ok: false, reason: "invalid-document" };
    }
    const key = materialRefKey(document.material);
    if (previousKey !== null && previousKey >= key) {
      return { ok: false, reason: "invalid-order" };
    }
    previousKey = key;
    documents.push(document);
  }
  if (!documents.some((document) => sameMaterial(document.material, scope))) {
    return { ok: false, reason: "missing-scope" };
  }
  const world = { scope: { ...scope }, documents } satisfies MechanicsWorld;
  try {
    canonicalJson(world);
  } catch {
    return { ok: false, reason: "invalid-shape" };
  }
  return { ok: true, value: freezeDeep(world) };
}

/** Parse the exact physical world and every live reference; causal proof is separate. */
export function parseMechanicsWorld(value: unknown): MechanicsWorldParseResult {
  const structured = parseMechanicsWorldStructure(value);
  if (!structured.ok) return structured;
  const world = structured.value;
  const invalid = validateClosedTurnState(world) ?? validateWorldInvariants(world);
  return invalid ? { ok: false, reason: invalid } : { ok: true, value: world };
}

export function isMechanicsWorld(value: unknown): value is MechanicsWorld {
  return parseMechanicsWorld(value).ok;
}

function rejected(
  world: Readonly<MechanicsWorld>,
  reason: MechanicsWorldSimulationRejection
): Extract<MechanicsWorldSimulationResult, { status: "rejected" }> {
  return { status: "rejected", reason, world };
}

function mutableWorld(world: MechanicsWorld): MutableWorld {
  return structuredClone(world) as MutableWorld;
}

function economyTurnId(
  epoch: number,
  round: number | "pending",
  ordinal: number
): string {
  return `turn:${epoch}:${round}:${ordinal}`;
}

function betweenTurnsEconomy(epoch: number, ordinal: number) {
  const state = createBetweenTurnsEconomyState(economyTurnId(epoch, "pending", ordinal));
  if (!state) throw new TypeError("Invalid encounter economy identity");
  return structuredClone(state);
}

function ownTurnEconomy(epoch: number, round: number, ordinal: number) {
  const state = createTurnEconomyState(economyTurnId(epoch, round, ordinal));
  if (!state) throw new TypeError("Invalid encounter economy identity");
  return structuredClone(state);
}

/** Match one boundary against one resolved runtime end rule. */
export function isEndRuleDue(
  rule: EndRule,
  boundary: EndRule | ObservedMechanicsBoundary
): boolean {
  if (rule.kind !== boundary.kind) return false;
  if (rule.kind === "time-reached" && boundary.kind === "time-reached") {
    return (
      sameClock(rule.clock, boundary.clock) &&
      boundary.elapsedSeconds >= rule.elapsedSeconds
    );
  }
  if (rule.kind === "combat-end" && boundary.kind === "combat-end") {
    return sameClock(rule.clock, boundary.clock);
  }
  if (rule.kind === "turn-boundary" && boundary.kind === "turn-boundary") {
    return (
      sameClock(rule.clock, boundary.clock) &&
      sameEntity(rule.combatant, boundary.combatant) &&
      rule.round === boundary.round &&
      rule.phase === boundary.phase
    );
  }
  if (
    rule.kind === "rest-completed" &&
    boundary.kind === "rest-completed" &&
    "boundaryOrdinal" in boundary
  ) {
    return (
      sameClock(rule.clock, boundary.clock) &&
      sameEntity(rule.combatant, boundary.combatant) &&
      rule.rest === boundary.rest &&
      boundary.boundaryOrdinal >= rule.minimumBoundaryOrdinal
    );
  }
  if (
    rule.kind === "day-phase" &&
    boundary.kind === "day-phase" &&
    "boundaryOrdinal" in boundary
  ) {
    return (
      sameClock(rule.clock, boundary.clock) &&
      rule.phase === boundary.phase &&
      boundary.boundaryOrdinal >= rule.minimumBoundaryOrdinal
    );
  }
  if (rule.kind === "occurrence-end" && boundary.kind === "occurrence-end") {
    return rule.occurrenceId === boundary.occurrenceId;
  }
  if (rule.kind === "program-phase-end" && boundary.kind === "program-phase-end") {
    return (
      rule.occurrenceId === boundary.occurrenceId &&
      rule.phaseId === boundary.phaseId &&
      rule.execution === boundary.execution
    );
  }
  return rule.kind === "temporary-hp-empty" && boundary.kind === "temporary-hp-empty";
}

function observedBoundaryValid(
  world: MechanicsWorld,
  boundary: ObservedMechanicsBoundary
): boolean {
  if (boundary.kind === "time-reached") {
    const document = documentFor(world, boundary.clock.material);
    return (
      isCounter(boundary.elapsedSeconds) &&
      document !== null &&
      document.state.timeline.epoch === boundary.clock.epoch &&
      document.state.timeline.elapsedSeconds === boundary.elapsedSeconds
    );
  }
  if (boundary.kind === "combat-end" || boundary.kind === "turn-boundary") {
    const document = documentFor(world, boundary.clock.material);
    if (
      !document ||
      boundary.clock.epoch <= 0 ||
      boundary.clock.epoch >= document.state.nextEncounterEpoch
    ) {
      return false;
    }
    if (boundary.kind === "turn-boundary") {
      return Number.isSafeInteger(boundary.round) && boundary.round > 0;
    }
    return true;
  }
  if (boundary.kind === "rest-completed") {
    const document = documentFor(world, boundary.clock.material);
    return (
      document !== null &&
      document.state.timeline.epoch === boundary.clock.epoch &&
      boundary.boundaryOrdinal < document.state.timeline.nextBoundaryOrdinal &&
      boundary.boundaryOrdinal + 1 === document.state.timeline.nextBoundaryOrdinal &&
      creaturePresent(world, boundary.combatant)
    );
  }
  const document = documentFor(world, boundary.clock.material);
  return (
    document !== null &&
    document.state.timeline.epoch === boundary.clock.epoch &&
    boundary.boundaryOrdinal < document.state.timeline.nextBoundaryOrdinal &&
    boundary.boundaryOrdinal + 1 === document.state.timeline.nextBoundaryOrdinal
  );
}

function observedBoundaryHistoricallyValid(
  basis: MechanicsWorld,
  current: MechanicsWorld,
  boundary: ObservedMechanicsBoundary
): boolean {
  if (observedBoundaryValid(current, boundary)) return true;
  if (boundary.kind !== "combat-end" && boundary.kind !== "turn-boundary") {
    return false;
  }
  const original = documentFor(basis, boundary.clock.material);
  if (
    !original ||
    original.state.encounter?.epoch !== boundary.clock.epoch ||
    (boundary.kind === "turn-boundary" && !creaturePresent(basis, boundary.combatant))
  ) {
    return false;
  }
  const live = documentFor(current, boundary.clock.material);
  return (
    live !== null &&
    live.state.nextEncounterEpoch === original.state.nextEncounterEpoch &&
    live.state.encounter?.epoch !== boundary.clock.epoch
  );
}

function occurrenceDependencyIds(occurrence: MechanicOccurrence): string[] {
  const ids = isEffectOccurrence(occurrence) ? [occurrence.parentId] : [];
  for (const rule of occurrence.endRules) {
    if (rule.kind === "occurrence-end" || rule.kind === "program-phase-end") {
      ids.push(rule.occurrenceId);
    }
  }
  return ids;
}

function withoutMissingTemporaryHitPointSource(
  world: MutableWorld,
  vitals: CreatureVitals
): CreatureVitals | null {
  const temporary = vitals.hitPoints.temporary;
  const reference = temporary.sourceOccurrence;
  if (reference === null || occurrenceAtGeneration(world, reference) !== null)
    return null;
  return {
    hitPoints: {
      current: vitals.hitPoints.current,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: vitals.zeroHitPoints,
  };
}

function nextSurvivingParticipant(
  priorOrder: readonly string[],
  priorCurrentId: string,
  encounter: EncounterState,
  startOffset = 1
): {
  readonly offset: number;
  readonly participantId: string;
  readonly wraps: boolean;
} | null {
  const currentIndex = priorOrder.indexOf(priorCurrentId);
  if (currentIndex < 0) return null;
  const live = new Set(encounter.order);
  for (let offset = startOffset; offset <= priorOrder.length; offset += 1) {
    const index = (currentIndex + offset) % priorOrder.length;
    const participantId = priorOrder[index];
    if (participantId && live.has(participantId)) {
      return {
        offset,
        participantId,
        wraps: currentIndex + offset >= priorOrder.length,
      };
    }
  }
  return null;
}

class CurrentCombatantRemovalRequiresBoundary extends Error {}

interface CurrentCombatantRemovalAuthorization {
  readonly combatant: EntityRef;
  readonly encounterEpoch: number;
  readonly material: MaterialRef;
}

function currentRemovalAuthorized(
  authorization: Readonly<CurrentCombatantRemovalAuthorization> | null,
  material: Readonly<MaterialRef>,
  encounter: Readonly<EncounterState>,
  combatant: Readonly<EntityRef>
): boolean {
  return (
    authorization !== null &&
    authorization.encounterEpoch === encounter.epoch &&
    sameMaterial(authorization.material, material) &&
    sameEntity(authorization.combatant, combatant)
  );
}

function normalizeEncounter(
  world: MutableWorld,
  material: Readonly<MaterialRef>,
  encounter: EncounterState,
  currentRemoval: Readonly<CurrentCombatantRemovalAuthorization> | null = null
): boolean {
  let changed = false;
  const priorOrder = [...encounter.order];
  const priorCurrentId = encounter.currentCombatantId;
  const priorCurrent =
    priorCurrentId === null ? null : encounter.participants[priorCurrentId];
  if (
    priorCurrent !== undefined &&
    priorCurrent !== null &&
    !creaturePresent(world, priorCurrent.combatant) &&
    !currentRemovalAuthorized(currentRemoval, material, encounter, priorCurrent.combatant)
  ) {
    throw new CurrentCombatantRemovalRequiresBoundary();
  }
  for (const [participantId, participant] of Object.entries(encounter.participants)) {
    if (!creaturePresent(world, participant.combatant)) {
      Reflect.deleteProperty(encounter.participants, participantId);
      changed = true;
    }
  }
  if (encounter.phase === "initiative") return changed;

  const nextOrder = encounter.order.filter((id) => {
    const participant = encounter.participants[id];
    return participant !== undefined && !participant.skipped;
  });
  if (nextOrder.length !== encounter.order.length) {
    encounter.order = nextOrder;
    changed = true;
  }
  if (nextOrder.length === 0) {
    encounter.phase = "initiative";
    encounter.currentCombatantId = null;
    return true;
  }
  if (
    encounter.currentCombatantId === null ||
    !nextOrder.includes(encounter.currentCombatantId)
  ) {
    const next =
      priorCurrentId === null
        ? null
        : nextSurvivingParticipant(priorOrder, priorCurrentId, encounter);
    encounter.currentCombatantId = next?.participantId ?? (nextOrder[0] as string);
    changed = true;
  }
  return changed;
}

function detachOrphanedLeases(world: MutableWorld): boolean {
  let changed = false;
  for (const document of world.documents) {
    if (
      document.kind !== "character" ||
      document.state.clockBinding.timeline.material.kind !== "shared-combat"
    ) {
      continue;
    }
    const shared = documentFor(world, document.state.clockBinding.timeline.material);
    if (!shared || shared.kind !== "shared") continue;
    const authoritativeEncounter = shared.state.encounter;
    const stillParticipates =
      authoritativeEncounter !== null &&
      Object.values(authoritativeEncounter.participants).some((participant) =>
        sameMaterial(participant.combatant.material, document.material)
      );
    if (stillParticipates) continue;
    const sharedTimeline = {
      clock: timelineClock(shared),
      elapsedSeconds: shared.state.timeline.elapsedSeconds,
      nextBoundaryOrdinal: shared.state.timeline.nextBoundaryOrdinal,
    };
    const localTimeline = {
      clock: timelineClock(document),
      elapsedSeconds: document.state.timeline.elapsedSeconds,
      nextBoundaryOrdinal: document.state.timeline.nextBoundaryOrdinal,
    };
    rebaseTimelineRules(document.state, sharedTimeline, localTimeline);
    document.state.clockBinding = { timeline: localTimeline.clock, encounter: null };
    changed = true;
  }
  return changed;
}

/**
 * Project encounter membership after a trusted physical-entity mutation.
 *
 * This intentionally runs before the public world parser: an availability mutation may make an
 * encounter reference transiently invalid, and the kernel must remove that reference (and release
 * any now-orphaned shared clock lease) atomically with the mutation.
 */
export function reconcileMechanicsEncounterMembership(
  candidate: Readonly<MechanicsWorld>
): Readonly<MechanicsWorld> {
  const world = mutableWorld(candidate);
  let changed = true;
  while (changed) {
    changed = false;
    for (const document of world.documents) {
      if (
        document.state.encounter !== null &&
        normalizeEncounter(world, document.material, document.state.encounter)
      ) {
        changed = true;
      }
    }
    if (detachOrphanedLeases(world)) changed = true;
  }
  return freezeDeep(world);
}

function cleanEndedMaterial(
  world: MutableWorld,
  inventorySourceLeases: ReadonlySet<string>,
  currentRemoval: Readonly<CurrentCombatantRemovalAuthorization> | null = null
): void {
  let changed = true;
  while (changed) {
    changed = false;
    const activeItemSources = activeInventorySourceKeys(world);
    for (const document of world.documents) {
      if (document.kind === "character") {
        const clearedVitals = withoutMissingTemporaryHitPointSource(
          world,
          document.state.vitals
        );
        if (clearedVitals) {
          document.state.vitals = clearedVitals;
          changed = true;
        }
        for (const [instanceId, instance] of Object.entries(document.state.inventory)) {
          if (
            instance.ownerOccurrence !== null &&
            occurrenceAtGeneration(world, instance.ownerOccurrence) === null
          ) {
            const sourceKey = inventoryGenerationKey(
              document.material,
              instanceId,
              instance.ordinal
            );
            if (
              activeItemSources.has(sourceKey) ||
              inventorySourceLeases.has(sourceKey)
            ) {
              instance.quantity = { ...instance.quantity, current: 0 };
              instance.ownerOccurrence = null;
            } else {
              Reflect.deleteProperty(document.state.inventory, instanceId);
            }
            changed = true;
          }
        }
        for (const [instanceId, instance] of Object.entries(document.state.inventory)) {
          if (
            instance.quantity.current === 0 &&
            !inventorySourceLeases.has(
              inventoryGenerationKey(document.material, instanceId, instance.ordinal)
            ) &&
            !activeItemSources.has(
              inventoryGenerationKey(document.material, instanceId, instance.ordinal)
            )
          ) {
            Reflect.deleteProperty(document.state.inventory, instanceId);
            changed = true;
          }
        }
        for (const instance of Object.values(document.state.inventory)) {
          if (
            instance.enchantment !== null &&
            document.state.inventory[instance.enchantment.instanceId]?.ordinal !==
              instance.enchantment.instanceOrdinal
          ) {
            instance.enchantment = null;
            changed = true;
          }
        }
      }
      for (const [entityId, entity] of Object.entries(document.state.entities)) {
        if (
          entity.ownerOccurrence !== null &&
          occurrenceAtGeneration(world, entity.ownerOccurrence) === null
        ) {
          Reflect.deleteProperty(document.state.entities, entityId);
          changed = true;
          continue;
        }
        if (entity.kind === "object" && entity.template.kind === "inventory-item") {
          const owner = documentFor(world, entity.template.owner);
          if (
            owner?.kind !== "character" ||
            owner.state.inventory[entity.template.instanceId]?.ordinal !==
              entity.template.instanceOrdinal
          ) {
            Reflect.deleteProperty(document.state.entities, entityId);
            changed = true;
            continue;
          }
        }
        if (entity.kind === "creature") {
          const clearedVitals = withoutMissingTemporaryHitPointSource(
            world,
            entity.vitals
          );
          if (clearedVitals) {
            entity.vitals = clearedVitals;
            changed = true;
          }
        }
      }
    }

    for (const document of world.documents) {
      if (
        document.state.encounter &&
        normalizeEncounter(
          world,
          document.material,
          document.state.encounter,
          currentRemoval
        )
      ) {
        changed = true;
      }
    }
    if (detachOrphanedLeases(world)) changed = true;
  }
}

function materialFingerprint(
  state: CharacterMaterialState | SharedMaterialState
): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(state).filter(
        ([key]) => key !== "epoch" && key !== "revision" && key !== "actions"
      )
    )
  );
}

function projectWorld(
  original: Readonly<MechanicsWorld>,
  candidate: MutableWorld,
  inventorySourceLeases: ReadonlySet<string>,
  requireCausalClosure: boolean,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[] = []
): MechanicsWorldSimulationResult {
  if (
    !sameMaterial(original.scope, candidate.scope) ||
    original.documents.length !== candidate.documents.length ||
    candidate.documents.some((document, index) => {
      const prior = original.documents[index];
      return (
        !prior ||
        prior.kind !== document.kind ||
        !sameMaterial(prior.material, document.material)
      );
    })
  ) {
    return rejected(original, "invalid-transition");
  }
  let changed = false;
  for (const document of candidate.documents) {
    const before = documentFor(original, document.material);
    if (!before) return rejected(original, "missing-document");
    if (
      document.state.epoch !== before.state.epoch ||
      document.state.revision !== before.state.revision ||
      JSON.stringify(document.state.actions) !== JSON.stringify(before.state.actions)
    ) {
      return rejected(original, "invalid-transition");
    }
    if (materialFingerprint(before.state) === materialFingerprint(document.state))
      continue;
    changed = true;
  }
  const parsed = parseMechanicsWorldStructure(candidate);
  if (!parsed.ok) return rejected(original, "invalid-transition");
  if (
    requireCausalClosure &&
    validateWorldInvariants(parsed.value, inventorySourceLeases, false, pendingFrames)
  ) {
    return rejected(original, "invalid-transition");
  }
  return changed
    ? { status: "applied", world: parsed.value }
    : { status: "already-applied", world: parsed.value };
}

function finalize(
  original: Readonly<MechanicsWorld>,
  candidate: MutableWorld,
  inventorySourceLeases: ReadonlySet<string> = new Set(),
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[] = []
): MechanicsWorldSimulationResult {
  return projectWorld(original, candidate, inventorySourceLeases, true, pendingFrames);
}

function projectBoundaryMutation(
  original: Readonly<MechanicsWorld>,
  candidate: MutableWorld,
  inventorySourceLeases: ReadonlySet<string> = new Set(),
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[] = []
): MechanicsWorldSimulationResult {
  return projectWorld(original, candidate, inventorySourceLeases, false, pendingFrames);
}

function parseClosureRequest(
  world: MechanicsWorld,
  request: MechanicsClosureRequest,
  historicalBasis: MechanicsWorld | null = null
): {
  boundaries: ObservedMechanicsBoundary[];
  endRequests: Map<string, OccurrenceGenerationRef>;
  inventorySourceLeases: Set<string>;
} | null {
  if (
    !isExactRecord(request, ["boundaries", "endRequests", "inventorySourceLeases"]) ||
    !isDenseArray(request.boundaries) ||
    !isDenseArray(request.endRequests) ||
    !isDenseArray(request.inventorySourceLeases)
  ) {
    return null;
  }
  const boundaries: ObservedMechanicsBoundary[] = [];
  for (const value of request.boundaries) {
    const boundary = conformObservedMechanicsBoundary(value);
    if (
      !boundary ||
      !(historicalBasis
        ? observedBoundaryHistoricallyValid(historicalBasis, world, boundary)
        : observedBoundaryValid(world, boundary))
    ) {
      return null;
    }
    boundaries.push(structuredClone(boundary));
  }
  const boundaryKeys = boundaries.map((boundary) => canonicalJson(boundary));
  if (new Set(boundaryKeys).size !== boundaryKeys.length) return null;
  const inventorySourceLeases = new Set<string>();
  for (const entry of request.inventorySourceLeases) {
    const lease = conformInventoryGenerationRef(entry);
    if (!lease) return null;
    const document = documentFor(world, lease.owner);
    if (
      document?.kind !== "character" ||
      document.state.inventory[lease.instanceId]?.ordinal !== lease.instanceOrdinal
    ) {
      return null;
    }
    const key = leaseKey(lease);
    if (inventorySourceLeases.has(key)) return null;
    inventorySourceLeases.add(key);
  }
  const endRequests = new Map<string, OccurrenceGenerationRef>();
  for (const value of request.endRequests) {
    const entry = conformOccurrenceGenerationRef(value);
    if (!entry || occurrenceAtGeneration(world, entry) === null) return null;
    const key = occurrenceGenerationRefKey(entry);
    if (endRequests.has(key)) return null;
    endRequests.set(key, structuredClone(entry));
  }
  return {
    boundaries,
    endRequests,
    inventorySourceLeases,
  };
}

function transactionPermits(
  world: Readonly<MechanicsWorld>,
  state: Readonly<MechanicsCausalState> | null
): readonly PendingFramePermit[] | null {
  if (state === null) return [];
  if (
    !isExactRecord(state, ["context", "world"]) ||
    !isExactRecord(state.context, ["endWave", "pendingFrames", "request"]) ||
    !pendingCapabilityValid(state)
  ) {
    return null;
  }
  const basis = parseMechanicsWorldStructure(state.world);
  if (
    !basis.ok ||
    !protectedJournalsMatch(basis.value, world) ||
    !preservesLatchedEndings(basis.value, world) ||
    !preservesAllocationHighWater(basis.value, world)
  ) {
    return null;
  }
  const basisFrames = conformPendingFrames(basis.value, state.context.pendingFrames);
  const prefixFrames = conformPendingFrames(world, state.context.pendingFrames);
  return basisFrames &&
    prefixFrames &&
    exactEqual(basisFrames, state.context.pendingFrames) &&
    exactEqual(prefixFrames, state.context.pendingFrames)
    ? pendingFramePermits(world, prefixFrames)
    : null;
}

/**
 * Parse an intermediate transaction snapshot while exact inventory tombstones
 * are leased by the causal authority that is still executing. Such a snapshot
 * must never escape as persisted state.
 */
export function parseMechanicsWorldTransactionState(
  value: unknown,
  inventorySourceLeases: readonly InventoryGenerationRef[] = [],
  causalState: Readonly<MechanicsCausalState> | null = null
): MechanicsWorldParseResult {
  const structured = parseMechanicsWorldStructure(value);
  if (!structured.ok) return structured;
  const permits = transactionPermits(structured.value, causalState);
  if (!permits) return { ok: false, reason: "invalid-program-origin" };
  const closure = parseClosureRequest(structured.value, {
    boundaries: [],
    endRequests: [],
    inventorySourceLeases,
  });
  if (!closure) return { ok: false, reason: "invalid-lease" };
  const invalid = validateWorldInvariantsWithPermits(
    structured.value,
    closure.inventorySourceLeases,
    permits
  );
  return invalid ? { ok: false, reason: invalid } : { ok: true, value: structured.value };
}

/**
 * Validate one intermediate mutation inside an atomic low-level transaction.
 *
 * This deliberately does not discover or latch newly satisfied end rules:
 * another ordered operation in the same transaction may make the rule false
 * again (for example, creating a temporary-HP source immediately before
 * granting those temporary HP). Existing latched endings and every allocation
 * high-water mark remain monotonic. The transaction kernel performs the one
 * authoritative causal rebase after its final operation.
 */
export function projectMechanicsTransactionWorld(
  value: unknown,
  priorValue: unknown,
  inventorySourceLeases: readonly InventoryGenerationRef[] = [],
  causalState: Readonly<MechanicsCausalState> | null = null
): MechanicsWorldParseResult {
  const prior = parseMechanicsWorldStructure(priorValue);
  if (!prior.ok) return prior;
  const candidate = parseMechanicsWorldStructure(value);
  if (!candidate.ok) return candidate;
  if (!protectedJournalsMatch(prior.value, candidate.value)) {
    return { ok: false, reason: "protected-state-mismatch" };
  }
  const permits = transactionPermits(prior.value, causalState);
  if (!permits) return { ok: false, reason: "invalid-program-origin" };
  const closure = parseClosureRequest(candidate.value, {
    boundaries: [],
    endRequests: [],
    inventorySourceLeases,
  });
  if (!closure) return { ok: false, reason: "invalid-lease" };
  const invalid = validateWorldInvariantsWithPermits(
    candidate.value,
    closure.inventorySourceLeases,
    permits
  );
  if (invalid) return { ok: false, reason: invalid };
  if (!preservesLatchedEndings(prior.value, candidate.value)) {
    return { ok: false, reason: "invalid-ending" };
  }
  if (!preservesAllocationHighWater(prior.value, candidate.value)) {
    return { ok: false, reason: "invalid-order" };
  }
  return candidate;
}

function leaseKey(lease: Readonly<InventoryGenerationRef>): string {
  return inventoryGenerationRefKey(lease);
}

function normalizeInventorySourceLeases(
  world: Readonly<MechanicsWorld>,
  values: readonly Readonly<InventoryGenerationRef>[]
): readonly Readonly<InventoryGenerationRef>[] | null {
  try {
    const unique = [...new Map(values.map((lease) => [leaseKey(lease), lease])).values()];
    const normalized = normalizedClosureRequest({
      inventorySourceLeases: unique,
    }).inventorySourceLeases;
    const closure = parseClosureRequest(world, {
      boundaries: [],
      endRequests: [],
      inventorySourceLeases: normalized,
    });
    return closure ? freezeDeep(structuredClone(normalized)) : null;
  } catch {
    return null;
  }
}

function normalizeOccurrenceEndRequests(
  world: Readonly<MechanicsWorld>,
  values: readonly Readonly<OccurrenceGenerationRef>[]
): readonly Readonly<OccurrenceGenerationRef>[] | null {
  try {
    const unique = [
      ...new Map(
        values.map((value) => {
          const request = conformOccurrenceGenerationRef(value);
          if (!request) throw new TypeError("Invalid occurrence end request");
          return [occurrenceGenerationRefKey(request), request] as const;
        })
      ).values(),
    ];
    const normalized = normalizedClosureRequest({ endRequests: unique }).endRequests;
    const closure = parseClosureRequest(world, {
      boundaries: [],
      endRequests: normalized,
      inventorySourceLeases: [],
    });
    return closure ? freezeDeep(structuredClone(normalized)) : null;
  } catch {
    return null;
  }
}

type LatchedEndWaveResult =
  | {
      readonly ok: true;
      readonly value: Readonly<MechanicsEndWaveCheckpoint>;
    }
  | {
      readonly ok: false;
      readonly reason: MechanicsWorldSimulationRejection;
    };

function latchAndRediscoverEndWave(
  world: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>,
  historicalBasis: Readonly<MechanicsWorld> | null = null,
  currentRemoval: Readonly<CurrentCombatantRemovalAuthorization> | null = null,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[] = []
): LatchedEndWaveResult {
  const latched = historicalBasis
    ? latchHistoricalMechanicsEndWave(historicalBasis, world, wave)
    : latchMechanicsEndWave(world, wave);
  if (latched.status === "rejected") {
    return { ok: false, reason: latched.reason };
  }
  const current = historicalBasis
    ? discoverHistoricalMechanicsEndWave(historicalBasis, latched.world, wave.request)
    : discoverMechanicsEndWave(latched.world, wave.request);
  if (current.status === "rejected") {
    return { ok: false, reason: current.reason };
  }
  if (!latchedEndingsMatchWave(current.world, current.wave)) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const finalization = historicalBasis
    ? finalizeHistoricalMechanicsEndWave(
        historicalBasis,
        current.world,
        current.wave,
        currentRemoval
      )
    : finalizeMechanicsEndWave(current.world, current.wave);
  if (
    finalization.status === "rejected" &&
    !(
      pendingFrames.length > 0 &&
      validateReadableCausalWorld(
        current.world,
        leaseSet(current.wave.request),
        pendingFrames
      ) === null
    )
  ) {
    return { ok: false, reason: finalization.reason };
  }
  return {
    ok: true,
    value: freezeDeep({ wave: current.wave, world: current.world }),
  };
}

function preservesLatchedEndings(
  prior: Readonly<MechanicsWorld>,
  candidate: Readonly<MechanicsWorld>,
  allowAdditional = false
): boolean {
  try {
    const priorEndingCount = prior.documents.reduce(
      (count, document) =>
        count +
        Object.values(document.state.occurrences).filter(
          (occurrence) => occurrence.ending !== null
        ).length,
      0
    );
    const candidateEndingCount = candidate.documents.reduce(
      (count, document) =>
        count +
        Object.values(document.state.occurrences).filter(
          (occurrence) => occurrence.ending !== null
        ).length,
      0
    );
    if (
      (allowAdditional
        ? candidateEndingCount < priorEndingCount
        : priorEndingCount !== candidateEndingCount) ||
      materialRefKey(prior.scope) !== materialRefKey(candidate.scope) ||
      canonicalJson(prior.documents.map(({ material }) => material)) !==
        canonicalJson(candidate.documents.map(({ material }) => material))
    ) {
      return false;
    }
    for (const document of prior.documents) {
      const next = documentFor(candidate, document.material);
      if (!next) return false;
      for (const [occurrenceId, occurrence] of Object.entries(
        document.state.occurrences
      )) {
        if (occurrence.ending === null) continue;
        const nextOccurrence = next.state.occurrences[occurrenceId];
        if (
          !nextOccurrence ||
          nextOccurrence.ordinal !== occurrence.ordinal ||
          canonicalJson(nextOccurrence.ending) !== canonicalJson(occurrence.ending)
        ) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function preservesAllocationHighWater(
  prior: Readonly<MechanicsWorld>,
  candidate: Readonly<MechanicsWorld>
): boolean {
  return prior.documents.every((document) => {
    const next = documentFor(candidate, document.material);
    if (
      !next ||
      next.state.nextOccurrenceOrdinal < document.state.nextOccurrenceOrdinal ||
      next.state.nextEntityOrdinal < document.state.nextEntityOrdinal ||
      next.state.nextEncounterEpoch < document.state.nextEncounterEpoch ||
      next.state.timeline.nextBoundaryOrdinal <
        document.state.timeline.nextBoundaryOrdinal ||
      (document.kind === "character" &&
        (next.kind !== "character" ||
          next.state.nextInventoryOrdinal < document.state.nextInventoryOrdinal))
    ) {
      return false;
    }
    const encounter = document.state.encounter;
    const nextEncounter = next.state.encounter;
    if (encounter === null) {
      if (nextEncounter === null) return true;
      return (
        document.state.nextEncounterEpoch < Number.MAX_SAFE_INTEGER &&
        nextEncounter.epoch === document.state.nextEncounterEpoch &&
        next.state.nextEncounterEpoch === document.state.nextEncounterEpoch + 1
      );
    }
    return (
      nextEncounter === null ||
      (nextEncounter.epoch === encounter.epoch &&
        nextEncounter.nextCombatantOrdinal >= encounter.nextCombatantOrdinal)
    );
  });
}

function kernelCausalState(
  world: Readonly<MechanicsWorld>,
  context: Readonly<MechanicsCausalState["context"]>
): Readonly<MechanicsCausalState> {
  const state = freezeDeep({
    context,
    world,
  }) as unknown as Readonly<MechanicsCausalState>;
  kernelCausalStates.add(state);
  return state;
}

/** The only hostile causal entry: one causally closed persisted world, no leases. */
export function beginMechanicsCausalState(value: unknown): MechanicsCausalStateResult {
  const closed = parseMechanicsWorld(value);
  if (!closed.ok) return { ok: false, reason: "invalid-world" };
  const discovery = discoverMechanicsEndWave(closed.value);
  if (discovery.status === "rejected" || discovery.wave.candidates.length !== 0) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  return {
    ok: true,
    value: kernelCausalState(closed.value, {
      endWave: null,
      pendingFrames: [],
      request: discovery.wave.request,
    }),
  };
}

function pendingCapabilityValid(state: Readonly<MechanicsCausalState>): boolean {
  return state.context.pendingFrames.length === 0 || kernelCausalStates.has(state);
}

/**
 * Re-prove a mutated source-readable state, monotonically extending its exact
 * end wave and keeping every causal inventory lease alive. The finalized world
 * is used only as a closure oracle; sources remain readable in the returned state.
 */
export function rebaseMechanicsCausalState(
  value: Readonly<MechanicsWorld>,
  priorState: Readonly<MechanicsCausalState>,
  additionalLeases: readonly Readonly<InventoryGenerationRef>[] = [],
  additionalEndRequests: readonly Readonly<OccurrenceGenerationRef>[] = []
): MechanicsCausalStateResult {
  return rebaseMechanicsCausalStateWithFrames(
    value,
    priorState,
    additionalLeases,
    additionalEndRequests,
    isExactRecord(priorState, ["context", "world"]) &&
      isExactRecord(priorState.context, ["endWave", "pendingFrames", "request"])
      ? priorState.context.pendingFrames
      : null
  );
}

function rebaseMechanicsCausalStateWithFrames(
  value: Readonly<MechanicsWorld>,
  priorState: Readonly<MechanicsCausalState>,
  additionalLeases: readonly Readonly<InventoryGenerationRef>[],
  additionalEndRequests: readonly Readonly<OccurrenceGenerationRef>[],
  nextPendingFramesValue: unknown
): MechanicsCausalStateResult {
  const structured = parseMechanicsWorldStructure(value);
  if (!structured.ok) return { ok: false, reason: "invalid-world" };
  if (
    !isExactRecord(priorState, ["context", "world"]) ||
    !isExactRecord(priorState.context, ["endWave", "pendingFrames", "request"]) ||
    !pendingCapabilityValid(priorState) ||
    !isDenseArray(additionalLeases) ||
    !isDenseArray(additionalEndRequests)
  ) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const priorWorld = parseMechanicsWorldStructure(priorState.world);
  const priorPendingFrames = priorWorld.ok
    ? conformPendingFrames(priorWorld.value, priorState.context.pendingFrames)
    : null;
  const nextPendingFrames = conformPendingFrames(
    structured.value,
    nextPendingFramesValue
  );
  if (
    !priorWorld.ok ||
    !priorPendingFrames ||
    !nextPendingFrames ||
    !exactEqual(priorPendingFrames, priorState.context.pendingFrames) ||
    !protectedJournalsMatch(priorWorld.value, structured.value) ||
    !preservesLatchedEndings(priorWorld.value, structured.value) ||
    !preservesAllocationHighWater(priorWorld.value, structured.value)
  ) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const priorValue = priorState.context.endWave;
  let prior: Readonly<MechanicsEndWaveCheckpoint> | null = null;
  if (priorValue !== null) {
    if (
      !isExactRecord(priorValue, ["wave", "world"]) ||
      canonicalJson(priorValue.world) !== canonicalJson(priorWorld.value) ||
      !isMechanicsEndWaveReceiptForWorld(priorWorld.value, priorValue.wave) ||
      !latchedEndingsMatchWave(priorWorld.value, priorValue.wave) ||
      priorValue.wave.candidates.length === 0 ||
      canonicalJson(priorValue.wave.request) !== canonicalJson(priorState.context.request)
    ) {
      return { ok: false, reason: "invalid-end-wave" };
    }
    prior = { wave: priorValue.wave, world: priorWorld.value };
  } else {
    const closedPrior = parseMechanicsWorldTransactionState(
      priorWorld.value,
      priorState.context.request.inventorySourceLeases,
      priorState
    );
    if (!closedPrior.ok) return { ok: false, reason: "invalid-end-wave" };
    const priorDiscovery = discoverMechanicsEndWave(
      closedPrior.value,
      priorState.context.request
    );
    if (
      priorDiscovery.status === "rejected" ||
      priorDiscovery.wave.candidates.length !== 0
    ) {
      return { ok: false, reason: "invalid-end-wave" };
    }
  }
  const leases = normalizeInventorySourceLeases(structured.value, [
    ...priorState.context.request.inventorySourceLeases,
    ...(prior?.wave.request.inventorySourceLeases ?? []),
    ...additionalLeases,
  ]);
  if (!leases) return { ok: false, reason: "invalid-end-wave" };
  const endRequests = normalizeOccurrenceEndRequests(
    structured.value,
    additionalEndRequests
  );
  if (!endRequests) return { ok: false, reason: "invalid-end-wave" };
  const request = mergeClosureRequests(
    prior?.wave.request ?? priorState.context.request,
    normalizedClosureRequest({ endRequests, inventorySourceLeases: leases })
  );
  const invalid = validateWorldInvariants(
    structured.value,
    new Set(leases.map(leaseKey)),
    true,
    nextPendingFrames
  );
  if (invalid) return { ok: false, reason: "invalid-end-wave" };
  const openPendingRoots = new Map(
    nextPendingFrames
      .filter(({ cursor }) => cursor.stage !== "phase-complete")
      .map((pending) => [
        occurrenceGenerationRefKey(pending.frame.rootReceipt.root),
        pending,
      ])
  );
  const priorCandidateKeys = new Set(
    prior?.wave.candidates.map(({ occurrence }) =>
      occurrenceGenerationRefKey(occurrence)
    ) ?? []
  );
  const discovery = discoverMechanicsEndWave(structured.value, request);
  if (discovery.status === "rejected") {
    return { ok: false, reason: discovery.reason };
  }
  const latched = latchAndRediscoverEndWave(
    discovery.world,
    discovery.wave,
    null,
    null,
    nextPendingFrames
  );
  if (!latched.ok) return latched;
  if (
    latched.value.wave.candidates.some((candidate) => {
      const key = occurrenceGenerationRefKey(candidate.occurrence);
      const pending = openPendingRoots.get(key);
      return (
        pending !== undefined && (!pending.selectedEvent || !priorCandidateKeys.has(key))
      );
    })
  ) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const reprovedPendingFrames = conformPendingFrames(
    latched.value.world,
    nextPendingFrames
  );
  if (!reprovedPendingFrames || !exactEqual(reprovedPendingFrames, nextPendingFrames)) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  return {
    ok: true,
    value: kernelCausalState(latched.value.world, {
      endWave: latched.value.wave.candidates.length === 0 ? null : latched.value,
      pendingFrames: reprovedPendingFrames,
      request: latched.value.wave.request,
    }),
  };
}

/** Re-prove one exact kernel causal state without closing its readable world. */
export function conformMechanicsCausalState(value: unknown): MechanicsCausalStateResult {
  if (!isExactRecord(value, ["context", "world"])) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const state = value as unknown as Readonly<MechanicsCausalState>;
  if (
    !isExactRecord(state.context, ["endWave", "pendingFrames", "request"]) ||
    !pendingCapabilityValid(state)
  ) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const reproved = rebaseMechanicsCausalState(state.world, state);
  if (!reproved.ok) return reproved;
  return canonicalJson(reproved.value) === canonicalJson(state)
    ? reproved
    : { ok: false, reason: "invalid-end-wave" };
}

function exactCausalState(value: unknown): Readonly<MechanicsCausalState> | null {
  const conformed = conformMechanicsCausalState(value);
  return conformed.ok && exactEqual(conformed.value, value) ? conformed.value : null;
}

function exactExecutionFrame(value: unknown): Readonly<MechanicsExecutionFrame> | null {
  const frame = conformMechanicsExecutionFrame(value);
  return frame && exactEqual(frame, value) ? frame : null;
}

/** Read the semantic LIFO top; malformed or empty states expose no authority. */
export function topMechanicsPendingFrame(
  stateValue: unknown
): Readonly<MechanicsPendingFrame> | null {
  const state = exactCausalState(stateValue);
  return state?.context.pendingFrames.at(-1) ?? null;
}

/** Exact frame identity check for top-only compiler and coordinator transitions. */
export function topMechanicsPendingFrameMatches(
  stateValue: unknown,
  frameValue: unknown
): boolean {
  const top = topMechanicsPendingFrame(stateValue);
  const frame = exactExecutionFrame(frameValue);
  return top !== null && frame !== null && exactEqual(top.frame, frame);
}

function replacePendingTop(
  state: Readonly<MechanicsCausalState>,
  frame: Readonly<MechanicsExecutionFrame>,
  cursor: Readonly<MechanicsPendingFrameCursor>
): MechanicsCausalStateResult {
  const top = state.context.pendingFrames.at(-1);
  if (!top || !exactEqual(top.frame, frame)) {
    return { ok: false, reason: "invalid-transition" };
  }
  const pendingFrames = [
    ...state.context.pendingFrames.slice(0, -1),
    { cursor, frame, selectedEvent: top.selectedEvent },
  ];
  const conformed = conformPendingFrames(state.world, pendingFrames);
  if (!conformed || !exactEqual(conformed, pendingFrames)) {
    return { ok: false, reason: "invalid-transition" };
  }
  return rebaseMechanicsCausalStateWithFrames(state.world, state, [], [], conformed);
}

function pushPendingFrame(
  state: Readonly<MechanicsCausalState>,
  frame: Readonly<MechanicsExecutionFrame>,
  selectedEvent: boolean
): MechanicsCausalStateResult {
  const program = frame.authority.snapshot.program;
  const phase = program?.phases.find(
    ({ phaseId }) => phaseId === frame.rootReceipt.next.phaseId
  );
  if (!program || !phase) {
    return { ok: false, reason: "invalid-transition" };
  }
  const cursor: MechanicsPendingFrameCursor =
    phase.steps.length === 0
      ? { stage: "phase-transition" }
      : { nextSlot: 1, stage: "step", stepIndex: 0 };
  const pendingFrames = [
    ...state.context.pendingFrames,
    { cursor, frame, selectedEvent },
  ];
  const conformed = conformPendingFrames(state.world, pendingFrames);
  if (!conformed || !exactEqual(conformed, pendingFrames)) {
    return { ok: false, reason: "invalid-transition" };
  }
  return rebaseMechanicsCausalStateWithFrames(state.world, state, [], [], conformed);
}

/** Push one already-created exact active root at its receipt's expected phase state. */
export function pushMechanicsPendingFrame(
  stateValue: unknown,
  frameValue: unknown
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  const frame = exactExecutionFrame(frameValue);
  return state && frame
    ? pushPendingFrame(state, frame, false)
    : { ok: false, reason: "invalid-transition" };
}

/**
 * Trusted event-dispatch seam. The private selection fiber binds every frame
 * identity field; the ordinary push can never grant selected-event authority.
 */
export function pushMechanicsSelectedEventPendingFrame(
  stateValue: unknown,
  frameValue: unknown,
  selectionValue: unknown
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  const frame = exactExecutionFrame(frameValue);
  const selection = mechanicsSubscriberSelectionFiber(selectionValue);
  const root =
    state && frame ? occurrenceAtGeneration(state.world, frame.rootReceipt.root) : null;
  if (
    !state ||
    !frame ||
    !selection ||
    root?.kind !== "program" ||
    !exactEqual(frame.rootReceipt.root, selection.root) ||
    frame.rootReceipt.next.phaseId !== selection.phaseId ||
    frame.rootReceipt.next.triggerEventId !== selection.eventId ||
    !exactEqual(frame.authority, selection.authority) ||
    !exactEqual(frame.trigger, selection.evidence)
  ) {
    return { ok: false, reason: "invalid-transition" };
  }
  const pushed = pushPendingFrame(state, frame, true);
  return pushed.ok && consumeMechanicsSubscriberSelection(selectionValue)
    ? pushed
    : { ok: false, reason: "invalid-transition" };
}

/** Advance only the top frame's exact expansion slot. */
export function advanceMechanicsPendingFrameSlot(
  stateValue: unknown,
  frameValue: unknown
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  const frame = exactExecutionFrame(frameValue);
  const top = state?.context.pendingFrames.at(-1);
  if (
    !state ||
    !frame ||
    !top ||
    !exactEqual(top.frame, frame) ||
    top.cursor.stage !== "step" ||
    top.cursor.nextSlot >= MAX_PENDING_SLOT
  ) {
    return { ok: false, reason: "invalid-transition" };
  }
  return replacePendingTop(state, frame, {
    ...top.cursor,
    nextSlot: top.cursor.nextSlot + 1,
  });
}

/** Complete only the top step, resetting the next step's stable slot to one. */
export function advanceMechanicsPendingFrameStep(
  stateValue: unknown,
  frameValue: unknown
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  const frame = exactExecutionFrame(frameValue);
  const top = state?.context.pendingFrames.at(-1);
  const phase = frame?.authority.snapshot.program?.phases.find(
    ({ phaseId }) => phaseId === frame.rootReceipt.next.phaseId
  );
  if (
    !state ||
    !frame ||
    !top ||
    !phase ||
    !exactEqual(top.frame, frame) ||
    top.cursor.stage !== "step"
  ) {
    return { ok: false, reason: "invalid-transition" };
  }
  const nextIndex = top.cursor.stepIndex + 1;
  return replacePendingTop(
    state,
    frame,
    nextIndex === phase.steps.length
      ? { stage: "phase-transition" }
      : { nextSlot: 1, stage: "step", stepIndex: nextIndex }
  );
}

/** Accept the sole exact expected→next root CAS and mark the top frame complete atomically. */
export function acceptMechanicsPendingFramePhaseTransition(
  value: unknown,
  stateValue: unknown,
  frameValue: unknown,
  additionalLeases: readonly Readonly<InventoryGenerationRef>[] = [],
  additionalEndRequests: readonly Readonly<OccurrenceGenerationRef>[] = []
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  const frame = exactExecutionFrame(frameValue);
  const top = state?.context.pendingFrames.at(-1);
  const candidate = parseMechanicsWorldStructure(value);
  if (
    !state ||
    !frame ||
    !top ||
    !candidate.ok ||
    !exactEqual(top.frame, frame) ||
    top.cursor.stage !== "phase-transition"
  ) {
    return { ok: false, reason: "invalid-transition" };
  }
  const expected = mutableWorld(state.world);
  const document = documentFor(expected, frame.rootReceipt.root.occurrence.material);
  const root =
    document?.state.occurrences[frame.rootReceipt.root.occurrence.occurrenceId];
  if (
    root?.kind !== "program" ||
    root.ordinal !== frame.rootReceipt.root.ordinal ||
    (root.ending !== null && !top.selectedEvent)
  ) {
    return { ok: false, reason: "invalid-transition" };
  }
  root.phaseState[frame.rootReceipt.next.phaseId] = receiptPhaseState(
    frame.rootReceipt.next
  );
  if (!exactEqual(candidate.value, expected)) {
    return { ok: false, reason: "invalid-transition" };
  }
  const pendingFrames = [
    ...state.context.pendingFrames.slice(0, -1),
    {
      cursor: { stage: "phase-complete" } as const,
      frame,
      selectedEvent: top.selectedEvent,
    },
  ];
  const conformed = conformPendingFrames(candidate.value, pendingFrames);
  if (
    !conformed ||
    !exactEqual(conformed, pendingFrames) ||
    !protectedJournalsMatch(state.world, candidate.value) ||
    !preservesLatchedEndings(state.world, candidate.value) ||
    !preservesAllocationHighWater(state.world, candidate.value)
  ) {
    return { ok: false, reason: "invalid-transition" };
  }
  return rebaseMechanicsCausalStateWithFrames(
    candidate.value,
    state,
    additionalLeases,
    additionalEndRequests,
    conformed
  );
}

/** Pop only the exact completed LIFO top; no arbitrary stack setter exists. */
export function popMechanicsPendingFrame(
  stateValue: unknown,
  frameValue: unknown,
  endRequests: readonly Readonly<OccurrenceGenerationRef>[] = []
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  const frame = exactExecutionFrame(frameValue);
  const top = state?.context.pendingFrames.at(-1);
  if (
    !state ||
    !frame ||
    !top ||
    !exactEqual(top.frame, frame) ||
    top.cursor.stage !== "phase-complete" ||
    !isDenseArray(endRequests) ||
    !endRequests.every((request) => exactEqual(request, frame.rootReceipt.root))
  ) {
    return { ok: false, reason: "invalid-transition" };
  }
  return rebaseMechanicsCausalStateWithFrames(
    state.world,
    state,
    [],
    endRequests,
    state.context.pendingFrames.slice(0, -1)
  );
}

function causeKey(cause: MechanicsEndCause): string {
  return canonicalJson(cause);
}

function compareCanonical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function candidateKey(candidate: MechanicsEndCandidate): string {
  return occurrenceGenerationRefKey(candidate.occurrence);
}

function discoverCandidates(
  world: Readonly<MechanicsWorld>,
  closure: NonNullable<ReturnType<typeof parseClosureRequest>>
): readonly MechanicsEndCandidate[] {
  type OccurrenceNode = {
    readonly directCauses: Map<string, MechanicsEndCause>;
    readonly generation: OccurrenceGenerationRef;
    readonly key: string;
    readonly liveEntities: readonly EntityRef[];
    readonly materialKey: string;
    readonly occurrence: MechanicOccurrence;
    readonly sourceInventoryKey: string | null;
    dependencies: readonly OccurrenceNode[];
  };
  type EntityNode = {
    readonly availability: string;
    readonly inventoryKey: string | null;
    readonly key: string;
    readonly ownerKey: string | null;
    removed: boolean;
  };
  type InventoryNode = {
    activeSources: number;
    readonly key: string;
    readonly leased: boolean;
    ownerKey: string | null;
    quantity: number;
    removed: boolean;
  };
  type TemporaryHitPointsNode = {
    cleared: boolean;
    readonly current: number;
    readonly holderKey: string;
    readonly sourceKey: string | null;
  };

  const addToSetMap = <Value>(
    index: Map<string, Set<Value>>,
    key: string,
    value: Value
  ): void => {
    const values = index.get(key);
    if (values) values.add(value);
    else index.set(key, new Set([value]));
  };
  const clockKey = (clock: ClockRef): string =>
    JSON.stringify([materialRefKey(clock.material), clock.epoch]);
  const documents = new Map(
    world.documents.map((document) => [materialRefKey(document.material), document])
  );
  const exactBoundaries = new Map<string, ObservedMechanicsBoundary>();
  const qualitativeBoundaries = new Map<
    string,
    Extract<ObservedMechanicsBoundary, { kind: "day-phase" | "rest-completed" }>[]
  >();
  const timeBoundaries = new Map<
    string,
    Extract<ObservedMechanicsBoundary, { kind: "time-reached" }>[]
  >();
  for (const boundary of closure.boundaries) {
    if (boundary.kind === "time-reached") {
      const key = clockKey(boundary.clock);
      const values = timeBoundaries.get(key);
      if (values) values.push(boundary);
      else timeBoundaries.set(key, [boundary]);
    } else if (boundary.kind === "day-phase" || boundary.kind === "rest-completed") {
      const key =
        boundary.kind === "day-phase"
          ? canonicalJson({
              clock: boundary.clock,
              kind: boundary.kind,
              phase: boundary.phase,
            })
          : canonicalJson({
              clock: boundary.clock,
              combatant: boundary.combatant,
              kind: boundary.kind,
              rest: boundary.rest,
            });
      const values = qualitativeBoundaries.get(key);
      if (values) values.push(boundary);
      else qualitativeBoundaries.set(key, [boundary]);
    } else {
      exactBoundaries.set(canonicalJson(boundary), boundary);
    }
  }
  for (const boundaries of timeBoundaries.values()) {
    boundaries.sort(
      (left, right) =>
        left.elapsedSeconds - right.elapsedSeconds ||
        compareCanonical(canonicalJson(left), canonicalJson(right))
    );
  }
  for (const boundaries of qualitativeBoundaries.values()) {
    boundaries.sort(
      (left, right) =>
        left.boundaryOrdinal - right.boundaryOrdinal ||
        compareCanonical(canonicalJson(left), canonicalJson(right))
    );
  }

  const entityNodes = new Map<string, EntityNode>();
  const inventoryNodes = new Map<string, InventoryNode>();
  const temporaryHitPoints = new Map<string, TemporaryHitPointsNode>();
  const characterSelfKeys = new Set<string>();
  const entitiesOwnedByOccurrence = new Map<string, Set<string>>();
  const entitiesBackedByInventory = new Map<string, Set<string>>();
  const inventoryOwnedByOccurrence = new Map<string, Set<string>>();
  const temporaryHitPointsBySource = new Map<string, Set<string>>();

  const addTemporaryHitPoints = (holder: EntityRef, vitals: CreatureVitals): void => {
    const holderKey = entityRefKey(holder);
    const source = vitals.hitPoints.temporary.sourceOccurrence;
    const sourceKey = source ? occurrenceGenerationRefKey(source) : null;
    temporaryHitPoints.set(holderKey, {
      cleared: false,
      current: vitals.hitPoints.temporary.current,
      holderKey,
      sourceKey,
    });
    if (sourceKey) addToSetMap(temporaryHitPointsBySource, sourceKey, holderKey);
  };

  for (const document of world.documents) {
    if (document.kind === "character") {
      const self = { entityId: "self", material: document.material } satisfies EntityRef;
      characterSelfKeys.add(entityRefKey(self));
      addTemporaryHitPoints(self, document.state.vitals);
      for (const [instanceId, instance] of Object.entries(document.state.inventory)) {
        const key = inventoryGenerationKey(
          document.material,
          instanceId,
          instance.ordinal
        );
        const ownerKey = instance.ownerOccurrence
          ? occurrenceGenerationRefKey(instance.ownerOccurrence)
          : null;
        inventoryNodes.set(key, {
          activeSources: 0,
          key,
          leased: closure.inventorySourceLeases.has(key),
          ownerKey,
          quantity: instance.quantity.current,
          removed: false,
        });
        if (ownerKey) addToSetMap(inventoryOwnedByOccurrence, ownerKey, key);
      }
    }
    for (const [entityId, entity] of Object.entries(document.state.entities)) {
      // `self` is resolved by document kind, never by the entity collection.
      if (entityId === "self") continue;
      const reference = {
        entityId,
        material: document.material,
        ordinal: entity.ordinal,
      } satisfies EntityRef;
      const key = entityRefKey(reference);
      const ownerKey = entity.ownerOccurrence
        ? occurrenceGenerationRefKey(entity.ownerOccurrence)
        : null;
      const inventoryKey =
        entity.kind === "object" && entity.template.kind === "inventory-item"
          ? inventoryGenerationKey(
              entity.template.owner,
              entity.template.instanceId,
              entity.template.instanceOrdinal
            )
          : null;
      entityNodes.set(key, {
        availability: entity.availability,
        inventoryKey,
        key,
        ownerKey,
        removed: false,
      });
      if (ownerKey) addToSetMap(entitiesOwnedByOccurrence, ownerKey, key);
      if (inventoryKey) addToSetMap(entitiesBackedByInventory, inventoryKey, key);
      if (entity.kind === "creature") addTemporaryHitPoints(reference, entity.vitals);
    }
  }

  const occurrenceNodes = new Map<string, OccurrenceNode>();
  const dependents = new Map<string, Set<string>>();
  const liveEntityWatchers = new Map<string, Set<string>>();
  const temporaryHitPointWatchers = new Map<string, Set<string>>();
  const conditionInstances = new Map<string, ConditionInstance[]>();
  const activeInventorySources = new Map<string, number>();

  for (const document of world.documents) {
    const materialKey = materialRefKey(document.material);
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      const generation = {
        occurrence: { material: document.material, occurrenceId },
        ordinal: occurrence.ordinal,
      } satisfies OccurrenceGenerationRef;
      const key = occurrenceGenerationRefKey(generation);
      const source = inventoryItemSource(document.state, occurrenceId);
      const sourceInventoryKey = source ? inventorySourceKey(source) : null;
      const liveEntities = occurrenceLiveEntities(occurrence);
      occurrenceNodes.set(key, {
        dependencies: [],
        directCauses: new Map(
          (occurrence.ending?.causes ?? []).map((cause) => [
            causeKey(cause),
            structuredClone(cause),
          ])
        ),
        generation,
        key,
        liveEntities,
        materialKey,
        occurrence,
        sourceInventoryKey,
      });
      if (sourceInventoryKey) {
        activeInventorySources.set(
          sourceInventoryKey,
          (activeInventorySources.get(sourceInventoryKey) ?? 0) + 1
        );
      }
      if (occurrence.kind === "condition" && occurrence.ending === null) {
        const targetKey = entityRefKey(occurrence.target);
        const instances = conditionInstances.get(targetKey);
        const instance = {
          conditionId: occurrence.conditionId,
          identity: { kind: "occurrence", ref: generation },
          source: null,
        } satisfies ConditionInstance;
        if (instances) instances.push(instance);
        else conditionInstances.set(targetKey, [instance]);
      }
      for (const entity of liveEntities) {
        addToSetMap(liveEntityWatchers, entityRefKey(entity), key);
      }
      if (
        isEffectOccurrence(occurrence) &&
        occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty")
      ) {
        addToSetMap(temporaryHitPointWatchers, entityRefKey(occurrence.target), key);
      }
    }
  }

  const addDirectCause = (node: OccurrenceNode, cause: MechanicsEndCause): void => {
    node.directCauses.set(causeKey(cause), cause);
  };
  for (const node of occurrenceNodes.values()) {
    const dependencyNodes = [...new Set(occurrenceDependencyIds(node.occurrence))].map(
      (occurrenceId) => {
        const dependencyDocument = documents.get(node.materialKey);
        const dependencyOccurrence = dependencyDocument?.state.occurrences[occurrenceId];
        if (!dependencyOccurrence) {
          throw new TypeError(
            "Occurrence dependency disappeared from the readable basis"
          );
        }
        const dependencyKey = occurrenceGenerationRefKey({
          occurrence: {
            material: node.generation.occurrence.material,
            occurrenceId,
          },
          ordinal: dependencyOccurrence.ordinal,
        });
        const dependency = occurrenceNodes.get(dependencyKey);
        if (!dependency || dependency.occurrence.ordinal >= node.occurrence.ordinal) {
          throw new TypeError("Occurrence dependency order is invalid");
        }
        addToSetMap(dependents, dependencyKey, node.key);
        return dependency;
      }
    );
    node.dependencies = dependencyNodes;

    if (closure.endRequests.has(node.key)) {
      addDirectCause(node, { kind: "requested" });
    }
    const earliestTimeRules = new Map<string, number>();
    for (const rule of node.occurrence.endRules) {
      if (rule.kind === "time-reached") {
        const key = clockKey(rule.clock);
        earliestTimeRules.set(
          key,
          Math.min(earliestTimeRules.get(key) ?? rule.elapsedSeconds, rule.elapsedSeconds)
        );
      } else if (rule.kind === "combat-end" || rule.kind === "turn-boundary") {
        const boundary = exactBoundaries.get(canonicalJson(rule));
        if (boundary) {
          addDirectCause(node, {
            boundary: structuredClone(boundary),
            kind: "explicit-boundary",
          });
        }
      } else if (rule.kind === "rest-completed" || rule.kind === "day-phase") {
        const key =
          rule.kind === "day-phase"
            ? canonicalJson({ clock: rule.clock, kind: rule.kind, phase: rule.phase })
            : canonicalJson({
                clock: rule.clock,
                combatant: rule.combatant,
                kind: rule.kind,
                rest: rule.rest,
              });
        const boundary = qualitativeBoundaries
          .get(key)
          ?.find(({ boundaryOrdinal }) => boundaryOrdinal >= rule.minimumBoundaryOrdinal);
        if (boundary) {
          addDirectCause(node, {
            boundary: structuredClone(boundary),
            kind: "explicit-boundary",
          });
        }
      } else if (
        rule.kind === "program-phase-end" &&
        isEffectOccurrence(node.occurrence)
      ) {
        const completion = {
          execution: rule.execution,
          phaseId: rule.phaseId,
          root: node.occurrence.origin.root,
        } satisfies ProgramPhaseCompletion;
        const root = occurrenceAtGeneration(world, completion.root);
        if (
          root?.kind === "program" &&
          (root.phaseState[completion.phaseId]?.execution ?? -1) >= completion.execution
        ) {
          addDirectCause(node, {
            completion,
            kind: "program-phase-completed",
          });
        }
      }
    }
    for (const [key, earliest] of earliestTimeRules) {
      const boundaries = timeBoundaries.get(key) ?? [];
      let low = 0;
      let high = boundaries.length;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if ((boundaries[middle]?.elapsedSeconds ?? 0) < earliest) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }
      for (let index = low; index < boundaries.length; index += 1) {
        const boundary = boundaries[index];
        if (boundary) {
          addDirectCause(node, {
            boundary: structuredClone(boundary),
            kind: "explicit-boundary",
          });
        }
      }
    }
  }

  const vitalsFor = (target: EntityRef): CreatureVitals | null => {
    const document = documents.get(materialRefKey(target.material));
    if (!document) return null;
    if (target.entityId === "self") {
      return document.kind === "character" ? document.state.vitals : null;
    }
    const entity = document.state.entities[target.entityId];
    return entity !== undefined &&
      entity.ordinal === target.ordinal &&
      entity.kind === "creature"
      ? entity.vitals
      : null;
  };
  const concentrationBroken = new Map<string, boolean>();
  for (const node of occurrenceNodes.values()) {
    if (node.occurrence.kind !== "concentration") continue;
    const target = node.occurrence.target;
    const targetKey = entityRefKey(target);
    let broken = concentrationBroken.get(targetKey);
    if (broken === undefined) {
      const vitals = vitalsFor(target);
      broken =
        vitals !== null &&
        projectCreatureConditions(conditionInstances.get(targetKey) ?? [], target, vitals)
          ?.breaksConcentration === true;
      concentrationBroken.set(targetKey, broken);
    }
    if (broken) addDirectCause(node, { kind: "concentration-broken" });
  }

  for (const [key, count] of activeInventorySources) {
    const inventory = inventoryNodes.get(key);
    if (inventory) inventory.activeSources = count;
  }

  const ended = new Set<string>();
  const endQueue: string[] = [];
  const endOccurrence = (key: string): void => {
    if (!occurrenceNodes.has(key) || ended.has(key)) return;
    ended.add(key);
    endQueue.push(key);
  };
  const entityExists = (key: string): boolean =>
    characterSelfKeys.has(key) || entityNodes.get(key)?.removed === false;
  const entityIsPresent = (key: string): boolean =>
    characterSelfKeys.has(key) ||
    (entityNodes.get(key)?.removed === false &&
      entityNodes.get(key)?.availability === "present");
  const temporaryHitPointValue = (holderKey: string): number | null => {
    const temporary = temporaryHitPoints.get(holderKey);
    return temporary && entityExists(holderKey)
      ? temporary.cleared
        ? 0
        : temporary.current
      : null;
  };
  const notifyTemporaryHitPoints = (holderKey: string): void => {
    if (temporaryHitPointValue(holderKey) !== 0) return;
    for (const occurrenceKey of temporaryHitPointWatchers.get(holderKey) ?? []) {
      endOccurrence(occurrenceKey);
    }
  };
  const removeEntity = (key: string): void => {
    const entity = entityNodes.get(key);
    if (!entity || entity.removed) return;
    entity.removed = true;
    for (const occurrenceKey of liveEntityWatchers.get(key) ?? []) {
      endOccurrence(occurrenceKey);
    }
  };
  const removeInventory = (key: string): void => {
    const inventory = inventoryNodes.get(key);
    if (!inventory || inventory.removed) return;
    inventory.removed = true;
    for (const entityKey of entitiesBackedByInventory.get(key) ?? []) {
      removeEntity(entityKey);
    }
  };
  const reevaluateInventory = (key: string): void => {
    const inventory = inventoryNodes.get(key);
    if (!inventory || inventory.removed) return;
    const ownerMissing =
      inventory.ownerKey !== null &&
      (!occurrenceNodes.has(inventory.ownerKey) || ended.has(inventory.ownerKey));
    if (ownerMissing) {
      if (inventory.activeSources > 0 || inventory.leased) {
        inventory.quantity = 0;
        inventory.ownerKey = null;
      } else {
        removeInventory(key);
        return;
      }
    }
    if (inventory.quantity === 0 && inventory.activeSources === 0 && !inventory.leased) {
      removeInventory(key);
    }
  };

  // Baseline cleanup is part of every projection, even before an occurrence ends.
  for (const key of inventoryNodes.keys()) reevaluateInventory(key);
  for (const entity of entityNodes.values()) {
    if (
      (entity.ownerKey !== null && !occurrenceNodes.has(entity.ownerKey)) ||
      (entity.inventoryKey !== null &&
        inventoryNodes.get(entity.inventoryKey)?.removed !== false)
    ) {
      removeEntity(entity.key);
    }
  }
  for (const temporary of temporaryHitPoints.values()) {
    if (temporary.sourceKey && !occurrenceNodes.has(temporary.sourceKey)) {
      temporary.cleared = true;
    }
    notifyTemporaryHitPoints(temporary.holderKey);
  }
  for (const node of occurrenceNodes.values()) {
    if (node.directCauses.size > 0) endOccurrence(node.key);
    if (
      node.liveEntities.some((entity) =>
        node.occurrence.kind === "material-lifecycle"
          ? !entityExists(entityRefKey(entity))
          : !entityIsPresent(entityRefKey(entity))
      )
    ) {
      endOccurrence(node.key);
    }
    if (
      isEffectOccurrence(node.occurrence) &&
      node.occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty") &&
      temporaryHitPointValue(entityRefKey(node.occurrence.target)) === 0
    ) {
      endOccurrence(node.key);
    }
  }

  for (let cursor = 0; cursor < endQueue.length; cursor += 1) {
    const key = endQueue[cursor];
    if (!key) throw new RangeError("Closure queue overflow");
    const node = occurrenceNodes.get(key);
    if (!node) throw new TypeError("Discovered occurrence disappeared");
    for (const dependentKey of dependents.get(key) ?? []) {
      endOccurrence(dependentKey);
    }
    if (node.sourceInventoryKey) {
      const inventory = inventoryNodes.get(node.sourceInventoryKey);
      if (inventory && inventory.activeSources > 0) {
        inventory.activeSources -= 1;
        reevaluateInventory(inventory.key);
      }
    }
    for (const inventoryKey of inventoryOwnedByOccurrence.get(key) ?? []) {
      reevaluateInventory(inventoryKey);
    }
    for (const entityKey of entitiesOwnedByOccurrence.get(key) ?? []) {
      removeEntity(entityKey);
    }
    for (const holderKey of temporaryHitPointsBySource.get(key) ?? []) {
      const temporary = temporaryHitPoints.get(holderKey);
      if (!temporary || temporary.cleared) continue;
      temporary.cleared = true;
      notifyTemporaryHitPoints(holderKey);
    }
  }

  // Encounter pruning and clock detachment cannot add a cause: explicit rules use
  // the immutable basis. The finalizer applies those terminal material mutations.
  const canonicalCauses = (values: readonly MechanicsEndCause[]) =>
    [...new Map(values.map((cause) => [causeKey(cause), cause])).entries()]
      .sort(([left], [right]) => compareCanonical(left, right))
      .map(([, cause]) => cause);
  const depths = new Map<string, number>();
  const endedNodes = [...ended].map((key) => {
    const node = occurrenceNodes.get(key);
    if (!node) throw new TypeError("Discovered occurrence disappeared");
    return node;
  });
  endedNodes.sort(
    (left, right) =>
      compareCanonical(left.materialKey, right.materialKey) ||
      left.occurrence.ordinal - right.occurrence.ordinal ||
      compareCanonical(left.key, right.key)
  );
  for (const node of endedNodes) {
    let depth = 0;
    for (const dependency of node.dependencies) {
      if (!ended.has(dependency.key)) continue;
      const dependencyDepth = depths.get(dependency.key);
      if (dependencyDepth === undefined) {
        throw new TypeError("Occurrence dependency order is invalid");
      }
      depth = Math.max(depth, dependencyDepth + 1);
    }
    depths.set(node.key, depth);
  }

  const candidates = endedNodes.map((node) => {
    const causes = [...node.directCauses.values()];
    for (const dependency of node.dependencies) {
      if (ended.has(dependency.key)) {
        causes.push({
          dependency: structuredClone(dependency.generation),
          kind: "dependency-ended",
        });
      }
    }
    if (
      isEffectOccurrence(node.occurrence) &&
      node.occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty") &&
      temporaryHitPointValue(entityRefKey(node.occurrence.target)) === 0
    ) {
      causes.push({ kind: "temporary-hit-points-empty" });
    }
    for (const entity of node.liveEntities) {
      const resolves =
        node.occurrence.kind === "material-lifecycle"
          ? entityExists(entityRefKey(entity))
          : entityIsPresent(entityRefKey(entity));
      if (!resolves) {
        causes.push({
          entity: structuredClone(entity),
          kind: "live-entity-missing",
        });
      }
    }
    const canonical = canonicalCauses(causes);
    if (canonical.length === 0) {
      throw new TypeError("Ended occurrence has no final cause");
    }
    return { causes: canonical, occurrence: node.generation };
  });
  candidates.sort(
    (left, right) =>
      (depths.get(candidateKey(right)) ?? 0) - (depths.get(candidateKey(left)) ?? 0) ||
      compareCanonical(candidateKey(left), candidateKey(right))
  );
  const result = freezeDeep(structuredClone(candidates));
  canonicalJson(result);
  return result;
}

function normalizedClosureRequest(
  request: MechanicsClosureRequest
): Required<MechanicsClosureRequest> {
  return {
    boundaries: [...(request.boundaries ?? [])].sort((left, right) =>
      compareCanonical(canonicalJson(left), canonicalJson(right))
    ),
    endRequests: [...(request.endRequests ?? [])].sort((left, right) =>
      compareCanonical(
        occurrenceGenerationRefKey(left),
        occurrenceGenerationRefKey(right)
      )
    ),
    inventorySourceLeases: [...(request.inventorySourceLeases ?? [])].sort(
      (left, right) => compareCanonical(canonicalJson(left), canonicalJson(right))
    ),
  };
}

function mergeClosureRequests(
  left: Required<MechanicsClosureRequest>,
  right: Required<MechanicsClosureRequest>
): Required<MechanicsClosureRequest> {
  const merge = <Value>(
    values: readonly Value[],
    additions: readonly Value[],
    key: (value: Value) => string
  ): Value[] => [
    ...new Map([...values, ...additions].map((value) => [key(value), value])).values(),
  ];
  return normalizedClosureRequest({
    boundaries: merge(left.boundaries, right.boundaries, canonicalJson),
    endRequests: merge(left.endRequests, right.endRequests, occurrenceGenerationRefKey),
    inventorySourceLeases: merge(
      left.inventorySourceLeases,
      right.inventorySourceLeases,
      canonicalJson
    ),
  });
}

/** Discover the exact causal end wave for one readable world without removing sources. */
export function discoverMechanicsEndWave(
  value: Readonly<MechanicsWorld>,
  request: MechanicsClosureRequest = {}
): MechanicsEndDiscoveryResult {
  const parsed = parseMechanicsWorldStructure(value);
  if (!parsed.ok) return { reason: "invalid-world", status: "rejected", world: value };
  let normalized: Required<MechanicsClosureRequest>;
  let closure: NonNullable<ReturnType<typeof parseClosureRequest>>;
  try {
    if (!isClosureRequestShape(request)) {
      return { reason: "invalid-boundary", status: "rejected", world: parsed.value };
    }
    normalized = normalizedClosureRequest(request);
    const parsedClosure = parseClosureRequest(parsed.value, normalized);
    if (!parsedClosure) {
      return { reason: "invalid-boundary", status: "rejected", world: parsed.value };
    }
    closure = parsedClosure;
  } catch {
    return { reason: "invalid-boundary", status: "rejected", world: parsed.value };
  }
  try {
    const wave = freezeDeep({
      basis: canonicalFingerprint(parsed.value),
      candidates: discoverCandidates(parsed.value, closure),
      request: normalized,
      schema: 1 as const,
    });
    canonicalJson(wave);
    return {
      status: "discovered",
      wave,
      world: parsed.value,
    };
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      return { reason: "overflow", status: "rejected", world: parsed.value };
    }
    return { reason: "invalid-end-wave", status: "rejected", world: parsed.value };
  }
}

function discoverHistoricalMechanicsEndWave(
  basis: Readonly<MechanicsWorld>,
  value: Readonly<MechanicsWorld>,
  request: Required<MechanicsClosureRequest>
): MechanicsEndDiscoveryResult {
  const parsedBasis = parseMechanicsWorldStructure(basis);
  const parsed = parseMechanicsWorldStructure(value);
  if (!parsedBasis.ok || !parsed.ok) {
    return { reason: "invalid-world", status: "rejected", world: value };
  }
  const closure = parseClosureRequest(parsed.value, request, parsedBasis.value);
  if (!closure) {
    return { reason: "invalid-boundary", status: "rejected", world: parsed.value };
  }
  try {
    const wave = freezeDeep({
      basis: canonicalFingerprint(parsed.value),
      candidates: discoverCandidates(parsed.value, closure),
      request,
      schema: 1 as const,
    });
    canonicalJson(wave);
    return { status: "discovered", wave, world: parsed.value };
  } catch (error) {
    return {
      reason:
        error instanceof RangeError || error instanceof TypeError
          ? "overflow"
          : "invalid-end-wave",
      status: "rejected",
      world: parsed.value,
    };
  }
}

function isPlainDataTree(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && !Object.is(value, -0);
  }
  if (typeof value !== "object") return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  if (Array.isArray(value)) {
    if (!isDenseArray(value)) return false;
    const valid = value.every((entry) => isPlainDataTree(entry, ancestors));
    ancestors.delete(value);
    return valid;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const valid = Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || UNSAFE_KEYS.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor?.enumerable === true &&
      "value" in descriptor &&
      isPlainDataTree(descriptor.value, ancestors)
    );
  });
  ancestors.delete(value);
  return valid;
}

function isOccurrenceGenerationRefValue(
  value: unknown
): value is OccurrenceGenerationRef {
  return conformOccurrenceGenerationRef(value) !== null;
}

function isEndCause(value: unknown): value is MechanicsEndCause {
  if (!isPlainDataTree(value) || typeof value !== "object" || value === null) {
    return false;
  }
  const kind = Object.getOwnPropertyDescriptor(value, "kind")?.value as unknown;
  if (
    kind === "requested" ||
    kind === "concentration-broken" ||
    kind === "temporary-hit-points-empty"
  ) {
    return isExactRecord(value, ["kind"]);
  }
  if (kind === "explicit-boundary") {
    return (
      isExactRecord(value, ["kind", "boundary"]) &&
      conformObservedMechanicsBoundary(value.boundary) !== null
    );
  }
  if (kind === "dependency-ended") {
    return (
      isExactRecord(value, ["kind", "dependency"]) &&
      isOccurrenceGenerationRefValue(value.dependency)
    );
  }
  if (kind === "program-phase-completed") {
    return (
      isExactRecord(value, ["kind", "completion"]) &&
      conformProgramPhaseCompletion(value.completion) !== null
    );
  }
  return (
    kind === "live-entity-missing" &&
    isExactRecord(value, ["kind", "entity"]) &&
    conformEntityRef(value.entity) !== null
  );
}

function isEndCandidate(value: unknown): value is MechanicsEndCandidate {
  if (
    !isPlainDataTree(value) ||
    !isExactRecord(value, ["occurrence", "causes"]) ||
    !isOccurrenceGenerationRefValue(value.occurrence) ||
    !isDenseArray(value.causes) ||
    value.causes.length === 0 ||
    !value.causes.every(isEndCause)
  ) {
    return false;
  }
  let previous: string | null = null;
  for (const cause of value.causes) {
    const key = causeKey(cause);
    if (previous !== null && previous >= key) return false;
    previous = key;
  }
  return true;
}

function isEndWaveReceipt(value: unknown): value is MechanicsEndWaveReceipt {
  if (
    !isPlainDataTree(value) ||
    !isExactRecord(value, ["basis", "candidates", "request", "schema"]) ||
    value.schema !== 1 ||
    conformCanonicalFingerprint(value.basis) === null ||
    !isDenseArray(value.candidates) ||
    !value.candidates.every(isEndCandidate) ||
    !isExactRecord(value.request, ["boundaries", "endRequests", "inventorySourceLeases"])
  ) {
    return false;
  }
  try {
    if (
      canonicalJson(value.request) !==
        canonicalJson(normalizedClosureRequest(value.request)) ||
      canonicalJson(value).length === 0
    ) {
      return false;
    }
  } catch {
    return false;
  }
  const keys = value.candidates.map(candidateKey);
  return new Set(keys).size === keys.length;
}

/** Prove that one hostile receipt is the exact complete wave for this readable world. */
export function isMechanicsEndWaveReceiptForWorld(
  value: unknown,
  wave: unknown
): wave is Readonly<MechanicsEndWaveReceipt> {
  try {
    const parsed = parseMechanicsWorldStructure(value);
    if (
      !parsed.ok ||
      !isEndWaveReceipt(wave) ||
      wave.basis !== canonicalFingerprint(parsed.value)
    ) {
      return false;
    }
    const closure = parseClosureRequest(parsed.value, wave.request);
    if (!closure) return false;
    return (
      canonicalJson(discoverCandidates(parsed.value, closure)) ===
      canonicalJson(wave.candidates)
    );
  } catch {
    return false;
  }
}

function isMechanicsEndWaveReceiptForHistoricalWorld(
  basis: Readonly<MechanicsWorld>,
  value: unknown,
  wave: unknown
): wave is Readonly<MechanicsEndWaveReceipt> {
  try {
    const parsedBasis = parseMechanicsWorldStructure(basis);
    const parsed = parseMechanicsWorldStructure(value);
    if (
      !parsedBasis.ok ||
      !parsed.ok ||
      !isEndWaveReceipt(wave) ||
      wave.basis !== canonicalFingerprint(parsed.value)
    ) {
      return false;
    }
    const closure = parseClosureRequest(parsed.value, wave.request, parsedBasis.value);
    return (
      closure !== null &&
      canonicalJson(discoverCandidates(parsed.value, closure)) ===
        canonicalJson(wave.candidates)
    );
  } catch {
    return false;
  }
}

function latchedEndingsMatchWave(
  world: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>
): boolean {
  const candidates = new Map(
    wave.candidates.map((candidate) => [candidateKey(candidate), candidate])
  );
  let endingCount = 0;
  for (const document of world.documents) {
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      if (occurrence.ending === null) continue;
      endingCount += 1;
      const key = occurrenceGenerationRefKey({
        occurrence: { material: document.material, occurrenceId },
        ordinal: occurrence.ordinal,
      });
      const candidate = candidates.get(key);
      if (
        !candidate ||
        canonicalJson(occurrence.ending.causes) !== canonicalJson(candidate.causes)
      ) {
        return false;
      }
    }
  }
  return endingCount === wave.candidates.length;
}

/**
 * Purely latch one exact current wave into its occurrence generations. The
 * returned world remains readable but is intentionally invalid at the closed
 * persistence boundary until the wave is finalized.
 */
export function latchMechanicsEndWave(
  value: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>
): MechanicsEndWaveLatchResult {
  return latchVerifiedMechanicsEndWave(value, wave, (world, receipt) =>
    isMechanicsEndWaveReceiptForWorld(world, receipt)
  );
}

function latchHistoricalMechanicsEndWave(
  basis: Readonly<MechanicsWorld>,
  value: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>
): MechanicsEndWaveLatchResult {
  return latchVerifiedMechanicsEndWave(value, wave, (world, receipt) =>
    isMechanicsEndWaveReceiptForHistoricalWorld(basis, world, receipt)
  );
}

function latchVerifiedMechanicsEndWave(
  value: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>,
  verify: (
    world: Readonly<MechanicsWorld>,
    wave: Readonly<MechanicsEndWaveReceipt>
  ) => boolean
): MechanicsEndWaveLatchResult {
  const parsed = parseMechanicsWorldStructure(value);
  if (!parsed.ok) return rejected(value, "invalid-world");
  if (!verify(parsed.value, wave)) {
    return rejected(parsed.value, "invalid-end-wave");
  }
  const candidate = mutableWorld(parsed.value);
  let changed = false;
  for (const ending of wave.candidates) {
    const reference = ending.occurrence;
    const document = documentFor(candidate, reference.occurrence.material);
    const occurrence = document?.state.occurrences[reference.occurrence.occurrenceId];
    if (!occurrence || occurrence.ordinal !== reference.ordinal) {
      return rejected(parsed.value, "invalid-end-wave");
    }
    const nextEnding = { causes: [...structuredClone(ending.causes)] };
    if (canonicalJson(occurrence.ending) !== canonicalJson(nextEnding)) {
      occurrence.ending = nextEnding;
      changed = true;
    }
  }
  const latched = parseMechanicsWorldStructure(candidate);
  if (!latched.ok) return rejected(parsed.value, "invalid-end-wave");
  return changed
    ? { status: "latched", world: latched.value }
    : { status: "already-latched", world: latched.value };
}

/** Apply one exact latched wave, then perform material cleanup once. */
export function finalizeMechanicsEndWave(
  value: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>
): MechanicsWorldSimulationResult {
  return finalizeVerifiedMechanicsEndWave(
    value,
    wave,
    (world, receipt) => isMechanicsEndWaveReceiptForWorld(world, receipt),
    null,
    null
  );
}

function finalizeHistoricalMechanicsEndWave(
  basis: Readonly<MechanicsWorld>,
  value: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>,
  currentRemoval: Readonly<CurrentCombatantRemovalAuthorization> | null
): MechanicsWorldSimulationResult {
  return finalizeVerifiedMechanicsEndWave(
    value,
    wave,
    (world, receipt) =>
      isMechanicsEndWaveReceiptForHistoricalWorld(basis, world, receipt),
    basis,
    currentRemoval
  );
}

function finalizeVerifiedMechanicsEndWave(
  value: Readonly<MechanicsWorld>,
  wave: Readonly<MechanicsEndWaveReceipt>,
  verify: (
    world: Readonly<MechanicsWorld>,
    wave: Readonly<MechanicsEndWaveReceipt>
  ) => boolean,
  historicalBasis: Readonly<MechanicsWorld> | null,
  currentRemoval: Readonly<CurrentCombatantRemovalAuthorization> | null
): MechanicsWorldSimulationResult {
  const parsed = parseMechanicsWorldStructure(value);
  if (!parsed.ok) return rejected(value, "invalid-world");
  if (!verify(parsed.value, wave) || !latchedEndingsMatchWave(parsed.value, wave)) {
    return rejected(parsed.value, "invalid-end-wave");
  }
  const parsedHistoricalBasis = historicalBasis
    ? parseMechanicsWorldStructure(historicalBasis)
    : null;
  if (parsedHistoricalBasis && !parsedHistoricalBasis.ok) {
    return rejected(parsed.value, "invalid-end-wave");
  }
  const closure = parseClosureRequest(
    parsed.value,
    wave.request,
    parsedHistoricalBasis?.ok ? parsedHistoricalBasis.value : null
  );
  if (!closure) return rejected(parsed.value, "invalid-end-wave");
  const candidate = mutableWorld(parsed.value);
  for (const ending of wave.candidates) {
    const reference = ending.occurrence;
    const document = documentFor(candidate, reference.occurrence.material);
    if (
      !document ||
      document.state.occurrences[reference.occurrence.occurrenceId]?.ordinal !==
        reference.ordinal
    ) {
      return rejected(parsed.value, "invalid-end-wave");
    }
    Reflect.deleteProperty(document.state.occurrences, reference.occurrence.occurrenceId);
  }
  try {
    cleanEndedMaterial(candidate, closure.inventorySourceLeases, currentRemoval);
  } catch (error) {
    if (error instanceof RangeError) return rejected(parsed.value, "overflow");
    if (error instanceof CurrentCombatantRemovalRequiresBoundary) {
      return rejected(parsed.value, "encounter-conflict");
    }
    return rejected(parsed.value, "invalid-end-wave");
  }
  return finalize(parsed.value, candidate, closure.inventorySourceLeases);
}

/**
 * Collect only material made unreachable by already-finalized causal removals.
 * This never discovers or ends an active occurrence, so it is safe as the last
 * transaction step after every source-end delivery has been compiled.
 */
export function finalizeMechanicsMaterialCleanup(
  value: Readonly<MechanicsWorld>
): MechanicsWorldSimulationResult {
  const structured = parseMechanicsWorldStructure(value);
  if (!structured.ok) return rejected(value, "invalid-world");
  const candidate = mutableWorld(structured.value);
  try {
    cleanEndedMaterial(candidate, new Set());
  } catch (error) {
    if (error instanceof RangeError) return rejected(structured.value, "overflow");
    if (error instanceof CurrentCombatantRemovalRequiresBoundary) {
      return rejected(structured.value, "encounter-conflict");
    }
    return rejected(structured.value, "invalid-transition");
  }
  return finalize(structured.value, candidate);
}

/** Finalize one active causal wave without losing or invalidating its frame stack. */
export function finalizeMechanicsCausalEndWave(
  stateValue: unknown
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  if (!state) return { ok: false, reason: "invalid-end-wave" };
  if (state.context.endWave === null) return { ok: true, value: state };
  if (state.context.pendingFrames.some(({ selectedEvent }) => selectedEvent)) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const finalized = finalizeMechanicsEndWave(state.world, state.context.endWave.wave);
  if (finalized.status === "rejected") {
    return { ok: false, reason: finalized.reason };
  }
  const pendingFrames = conformPendingFrames(
    finalized.world,
    state.context.pendingFrames
  );
  if (!pendingFrames || !exactEqual(pendingFrames, state.context.pendingFrames)) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const request = normalizedClosureRequest({
    boundaries: state.context.request.boundaries,
    inventorySourceLeases: state.context.request.inventorySourceLeases,
  });
  const discovery = discoverMechanicsEndWave(finalized.world, request);
  if (discovery.status === "rejected") {
    return { ok: false, reason: discovery.reason };
  }
  const latched = latchAndRediscoverEndWave(
    discovery.world,
    discovery.wave,
    null,
    null,
    pendingFrames
  );
  if (!latched.ok) return latched;
  const reproved = conformPendingFrames(latched.value.world, pendingFrames);
  if (!reproved || !exactEqual(reproved, pendingFrames)) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  return {
    ok: true,
    value: kernelCausalState(latched.value.world, {
      endWave: latched.value.wave.candidates.length === 0 ? null : latched.value,
      pendingFrames: reproved,
      request: latched.value.wave.request,
    }),
  };
}

/** Run terminal material cleanup while preserving every active program root. */
export function finalizeMechanicsCausalMaterialCleanup(
  stateValue: unknown
): MechanicsCausalStateResult {
  const state = exactCausalState(stateValue);
  if (!state || state.context.endWave !== null) {
    return { ok: false, reason: "invalid-end-wave" };
  }
  const candidate = mutableWorld(state.world);
  try {
    cleanEndedMaterial(candidate, new Set());
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof RangeError
          ? "overflow"
          : error instanceof CurrentCombatantRemovalRequiresBoundary
            ? "encounter-conflict"
            : "invalid-transition",
    };
  }
  const cleaned = finalize(
    state.world,
    candidate,
    new Set(),
    state.context.pendingFrames
  );
  return cleaned.status === "rejected"
    ? { ok: false, reason: cleaned.reason }
    : rebaseMechanicsCausalStateWithFrames(
        cleaned.world,
        state,
        [],
        [],
        state.context.pendingFrames
      );
}

function currentTurnBoundary(
  document: MechanicsDocument,
  phase: "end" | "start"
): ObservedMechanicsBoundary | null {
  const encounter = document.state.encounter;
  if (
    !encounter ||
    encounter.phase !== "turns" ||
    encounter.currentCombatantId === null
  ) {
    return null;
  }
  const participant = encounter.participants[encounter.currentCombatantId];
  return participant
    ? {
        clock: { epoch: encounter.epoch, material: document.material },
        combatant: participant.combatant,
        kind: "turn-boundary",
        phase,
        round: encounter.round,
      }
    : null;
}

function boundaryRejected(
  reason: MechanicsWorldSimulationRejection
): MechanicsBoundaryResult {
  return { reason, status: "rejected" };
}

function finishBoundary(
  basis: Readonly<MechanicsWorld>,
  current: Readonly<MechanicsWorld>,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[],
  request: Required<MechanicsClosureRequest>
): MechanicsBoundaryResult {
  const cleanup = finalizeMechanicsCausalMaterialCleanup(
    kernelCausalState(current, { endWave: null, pendingFrames, request })
  );
  if (!cleanup.ok) {
    return boundaryRejected(cleanup.reason);
  }
  const terminal = finalize(
    basis,
    mutableWorld(cleanup.value.world),
    leaseSet(request),
    cleanup.value.context.pendingFrames
  );
  if (terminal.status === "rejected") return boundaryRejected(terminal.reason);
  const state = kernelCausalState(terminal.world, {
    endWave: null,
    pendingFrames: cleanup.value.context.pendingFrames,
    request: cleanup.value.context.request,
  });
  return exactCausalState(state)
    ? { outcome: terminal.status, state, status: "complete" }
    : boundaryRejected("invalid-transition");
}

function participantCursor(
  participantId: string,
  participant: EncounterState["participants"][string]
): MechanicsBoundaryParticipantCursor {
  return {
    combatant: structuredClone(participant.combatant),
    participantId,
    participantOrdinal: participant.ordinal,
  };
}

function encounterCursor(
  encounter: EncounterState
): Readonly<MechanicsBoundaryEncounterCursor> {
  return freezeDeep({
    currentCombatantId: encounter.currentCombatantId,
    epoch: encounter.epoch,
    order: [...encounter.order],
    participants: Object.entries(encounter.participants)
      .map(([participantId, participant]) =>
        participantCursor(participantId, participant)
      )
      .sort((left, right) => compareCanonical(left.participantId, right.participantId)),
    phase: encounter.phase,
    round: encounter.round,
  });
}

function conformBoundaryParticipantCursor(
  value: unknown
): Readonly<MechanicsBoundaryParticipantCursor> | null {
  if (
    !isExactRecord(value, ["combatant", "participantId", "participantOrdinal"]) ||
    !isId(value.participantId) ||
    !isPositiveCounter(value.participantOrdinal)
  ) {
    return null;
  }
  const combatant = conformEntityRef(value.combatant);
  return combatant
    ? freezeDeep({
        combatant,
        participantId: value.participantId,
        participantOrdinal: value.participantOrdinal,
      })
    : null;
}

function conformBoundaryEncounterCursor(
  value: unknown
): Readonly<MechanicsBoundaryEncounterCursor> | null {
  if (
    !isExactRecord(value, [
      "currentCombatantId",
      "epoch",
      "order",
      "participants",
      "phase",
      "round",
    ]) ||
    !(value.currentCombatantId === null || isId(value.currentCombatantId)) ||
    !isPositiveCounter(value.epoch) ||
    !isPositiveCounter(value.round) ||
    (value.phase !== "initiative" && value.phase !== "turns") ||
    !isDenseArray(value.order) ||
    !value.order.every(isId) ||
    new Set(value.order).size !== value.order.length ||
    !isDenseArray(value.participants)
  ) {
    return null;
  }
  const participants: MechanicsBoundaryParticipantCursor[] = [];
  let previous: string | null = null;
  for (const entry of value.participants) {
    const participant = conformBoundaryParticipantCursor(entry);
    if (!participant || (previous !== null && previous >= participant.participantId)) {
      return null;
    }
    previous = participant.participantId;
    participants.push(participant);
  }
  const ids = new Set(participants.map(({ participantId }) => participantId));
  if (
    !value.order.every((participantId) => ids.has(participantId)) ||
    (value.currentCombatantId !== null && !ids.has(value.currentCombatantId))
  ) {
    return null;
  }
  return freezeDeep({
    currentCombatantId: value.currentCombatantId,
    epoch: value.epoch,
    order: [...value.order],
    participants,
    phase: value.phase,
    round: value.round,
  });
}

function conformBoundaryCursor(value: unknown): Readonly<MechanicsBoundaryCursor> | null {
  if (isExactRecord(value, ["kind"]) && value.kind === "finish") {
    return freezeDeep({ kind: "finish" });
  }
  if (
    isExactRecord(value, [
      "encounter",
      "excludeCurrent",
      "expectedRound",
      "expectedTimelineSeconds",
      "kind",
      "lastSelected",
      "phase",
      "scanOffset",
      "selected",
    ]) &&
    value.kind === "complete-turn" &&
    isPositiveCounter(value.expectedRound) &&
    isCounter(value.expectedTimelineSeconds) &&
    (value.phase === "after-end" ||
      value.phase === "after-time" ||
      value.phase === "after-start") &&
    isPositiveCounter(value.scanOffset)
  ) {
    const encounter = conformBoundaryEncounterCursor(value.encounter);
    const excludeCurrent =
      value.excludeCurrent === null ? null : conformEntityRef(value.excludeCurrent);
    const lastSelected =
      value.lastSelected === null
        ? null
        : conformBoundaryParticipantCursor(value.lastSelected);
    const selected =
      value.selected === null ? null : conformBoundaryParticipantCursor(value.selected);
    if (
      !encounter ||
      (value.excludeCurrent !== null &&
        (!excludeCurrent || excludeCurrent.entityId === "self")) ||
      (value.lastSelected !== null && !lastSelected) ||
      (value.selected !== null && !selected) ||
      (value.phase === "after-start") !== (selected !== null)
    ) {
      return null;
    }
    return freezeDeep<MechanicsBoundaryCursor>({
      encounter,
      excludeCurrent: excludeCurrent as MaterialEntityRef | null,
      expectedRound: value.expectedRound,
      expectedTimelineSeconds: value.expectedTimelineSeconds,
      kind: value.kind,
      lastSelected,
      phase: value.phase,
      scanOffset: value.scanOffset,
      selected,
    });
  }
  if (
    isExactRecord(value, [
      "characterMaterials",
      "kind",
      "nextIndex",
      "pendingEncounter",
    ]) &&
    value.kind === "start-shared-encounter" &&
    isDenseArray(value.characterMaterials) &&
    isCounter(value.nextIndex) &&
    value.nextIndex < value.characterMaterials.length
  ) {
    const materials: CharacterMaterialRef[] = [];
    let previous: string | null = null;
    for (const entry of value.characterMaterials) {
      if (!isMaterialRef(entry) || entry.kind !== "character-play") return null;
      const key = materialRefKey(entry);
      if (previous !== null && previous >= key) return null;
      previous = key;
      materials.push(structuredClone(entry));
    }
    const pendingEncounter = conformBoundaryEncounterCursor(value.pendingEncounter);
    if (!pendingEncounter) {
      return null;
    }
    return freezeDeep({
      characterMaterials: materials,
      kind: value.kind,
      nextIndex: value.nextIndex,
      pendingEncounter,
    });
  }
  if (isExactRecord(value, ["encounter", "kind"]) && value.kind === "end-encounter") {
    const encounter = conformBoundaryEncounterCursor(value.encounter);
    return encounter ? freezeDeep({ encounter, kind: value.kind }) : null;
  }
  return null;
}

function sameParticipantCursor(
  participant: EncounterState["participants"][string],
  cursor: MechanicsBoundaryParticipantCursor
): boolean {
  return (
    participant.ordinal === cursor.participantOrdinal &&
    sameEntity(participant.combatant, cursor.combatant)
  );
}

function encounterIdentityCompatible(
  encounter: EncounterState,
  cursor: MechanicsBoundaryEncounterCursor
): boolean {
  if (encounter.epoch !== cursor.epoch) return false;
  const expected = new Map(
    cursor.participants.map((participant) => [participant.participantId, participant])
  );
  for (const [participantId, participant] of Object.entries(encounter.participants)) {
    const prior = expected.get(participantId);
    if (!prior || !sameParticipantCursor(participant, prior)) return false;
  }
  return encounter.order.every((participantId) => expected.has(participantId));
}

function sameDocumentSet(
  left: Readonly<MechanicsWorld>,
  right: Readonly<MechanicsWorld>
): boolean {
  return (
    sameMaterial(left.scope, right.scope) &&
    left.documents.length === right.documents.length &&
    left.documents.every((document, index) => {
      const candidate = right.documents[index];
      return (
        candidate !== undefined &&
        candidate.kind === document.kind &&
        sameMaterial(candidate.material, document.material)
      );
    })
  );
}

function protectedJournalsMatch(
  left: Readonly<MechanicsWorld>,
  right: Readonly<MechanicsWorld>
): boolean {
  return (
    sameDocumentSet(left, right) &&
    left.documents.every((document) => {
      const candidate = documentFor(right, document.material);
      return (
        candidate !== null &&
        candidate.state.epoch === document.state.epoch &&
        candidate.state.revision === document.state.revision &&
        canonicalJson(candidate.state.actions) ===
          canonicalJson(document.state.actions) &&
        (document.kind !== "character" ||
          (candidate.kind === "character" &&
            candidate.state.buildRevision === document.state.buildRevision))
      );
    })
  );
}

function boundaryOwnedFactsMatch(
  left: Readonly<MechanicsWorld>,
  right: Readonly<MechanicsWorld>
): boolean {
  return (
    sameDocumentSet(left, right) &&
    left.documents.every((document) => {
      const candidate = documentFor(right, document.material);
      if (!candidate || candidate.kind !== document.kind) return false;
      const shared =
        canonicalJson(candidate.state.timeline) ===
          canonicalJson(document.state.timeline) &&
        canonicalJson(candidate.state.encounter) ===
          canonicalJson(document.state.encounter) &&
        candidate.state.nextEncounterEpoch === document.state.nextEncounterEpoch;
      return (
        shared &&
        (document.kind === "shared" ||
          (candidate.kind === "character" &&
            canonicalJson(candidate.state.clockBinding) ===
              canonicalJson(document.state.clockBinding)))
      );
    })
  );
}

function checkpointStateValid(
  checkpoint: unknown,
  historicalBasis: Readonly<MechanicsWorld> | null = null
): checkpoint is Readonly<MechanicsBoundaryCheckpoint> {
  if (
    !isExactRecord(checkpoint, ["boundary", "ordinal", "state", "wave"]) ||
    !isCounter(checkpoint.ordinal) ||
    !isExactRecord(checkpoint.state, ["context", "world"])
  ) {
    return false;
  }
  if (historicalBasis) {
    if (
      !isMechanicsEndWaveReceiptForHistoricalWorld(
        historicalBasis,
        checkpoint.state.world,
        checkpoint.wave
      )
    ) {
      return false;
    }
  } else if (
    !isMechanicsEndWaveReceiptForWorld(checkpoint.state.world, checkpoint.wave)
  ) {
    return false;
  }
  const boundary =
    checkpoint.boundary === null
      ? null
      : conformObservedMechanicsBoundary(checkpoint.boundary);
  if (
    (checkpoint.boundary !== null &&
      (!boundary || canonicalJson(boundary) !== canonicalJson(checkpoint.boundary))) ||
    (checkpoint.ordinal === 0 && boundary === null)
  ) {
    return false;
  }
  const wave: Readonly<MechanicsEndWaveReceipt> = checkpoint.wave;
  const state = checkpoint.state as unknown as Readonly<MechanicsCausalState>;
  if (!isExactRecord(state.context, ["endWave", "pendingFrames", "request"])) {
    return false;
  }
  const pendingFrames = conformPendingFrames(state.world, state.context.pendingFrames);
  if (
    !pendingCapabilityValid(state) ||
    !pendingFrames ||
    !exactEqual(pendingFrames, state.context.pendingFrames) ||
    validateReadableCausalWorld(
      state.world,
      leaseSet(state.context.request),
      pendingFrames
    ) !== null ||
    canonicalJson(state.context.request) !== canonicalJson(wave.request) ||
    (boundary !== null &&
      !wave.request.boundaries.some(
        (candidate) => canonicalJson(candidate) === canonicalJson(boundary)
      ))
  ) {
    return false;
  }
  if (wave.candidates.length === 0) {
    return state.context.endWave === null;
  }
  return (
    isExactRecord(state.context.endWave, ["wave", "world"]) &&
    canonicalJson(state.context.endWave.wave) === canonicalJson(wave) &&
    canonicalJson(state.context.endWave.world) === canonicalJson(state.world) &&
    latchedEndingsMatchWave(state.world, wave)
  );
}

function completionStateValid(
  checkpoint: Readonly<MechanicsBoundaryCheckpoint>,
  state: Readonly<MechanicsCausalState>,
  historicalBasis: Readonly<MechanicsWorld>
): boolean {
  if (
    !isExactRecord(state, ["context", "world"]) ||
    !isExactRecord(state.context, ["endWave", "pendingFrames", "request"]) ||
    !pendingCapabilityValid(state) ||
    !exactEqual(state.context.pendingFrames, checkpoint.state.context.pendingFrames)
  ) {
    return false;
  }
  const parsed = parseMechanicsWorldStructure(state.world);
  const pendingFrames = parsed.ok
    ? conformPendingFrames(parsed.value, state.context.pendingFrames)
    : null;
  if (
    !parsed.ok ||
    !pendingFrames ||
    !exactEqual(pendingFrames, state.context.pendingFrames) ||
    canonicalJson(parsed.value) !== canonicalJson(state.world) ||
    !protectedJournalsMatch(checkpoint.state.world, parsed.value) ||
    !boundaryOwnedFactsMatch(checkpoint.state.world, parsed.value) ||
    !preservesLatchedEndings(checkpoint.state.world, parsed.value, true)
  ) {
    return false;
  }
  let cumulative: Required<MechanicsClosureRequest>;
  try {
    cumulative = mergeClosureRequests(checkpoint.wave.request, state.context.request);
    if (
      canonicalJson(cumulative) !== canonicalJson(state.context.request) ||
      canonicalJson(state.context.request.boundaries) !==
        canonicalJson(checkpoint.wave.request.boundaries)
    ) {
      return false;
    }
  } catch {
    return false;
  }
  const leases = normalizeInventorySourceLeases(parsed.value, [
    ...checkpoint.state.context.request.inventorySourceLeases,
    ...state.context.request.inventorySourceLeases,
  ]);
  if (
    !leases ||
    canonicalJson(leases) !== canonicalJson(state.context.request.inventorySourceLeases)
  ) {
    return false;
  }
  if (
    validateReadableCausalWorld(
      parsed.value,
      new Set(leases.map(leaseKey)),
      pendingFrames
    )
  ) {
    return false;
  }
  if (state.context.endWave === null) {
    return checkpoint.wave.candidates.length === 0;
  }
  if (
    !isExactRecord(state.context.endWave, ["wave", "world"]) ||
    canonicalJson(state.context.endWave.world) !== canonicalJson(parsed.value) ||
    !isMechanicsEndWaveReceiptForHistoricalWorld(
      historicalBasis,
      parsed.value,
      state.context.endWave.wave
    ) ||
    !latchedEndingsMatchWave(parsed.value, state.context.endWave.wave)
  ) {
    return false;
  }
  try {
    return (
      canonicalJson(cumulative) === canonicalJson(state.context.request) &&
      canonicalJson(state.context.endWave.wave.request) ===
        canonicalJson(state.context.request)
    );
  } catch {
    return false;
  }
}

function cursorMatchesCommand(
  command: MechanicsBoundaryCommand,
  cursor: MechanicsBoundaryCursor
): boolean {
  if (command.kind === "complete-turn") {
    return (
      cursor.kind === "complete-turn" &&
      ((command.excludeCurrent === null && cursor.excludeCurrent === null) ||
        (command.excludeCurrent !== null &&
          cursor.excludeCurrent !== null &&
          sameEntity(command.excludeCurrent, cursor.excludeCurrent)))
    );
  }
  if (command.kind === "end-encounter") return cursor.kind === "end-encounter";
  if (command.kind === "start-encounter") {
    return cursor.kind === "finish" || cursor.kind === "start-shared-encounter";
  }
  return cursor.kind === "finish";
}

function currentCombatantRemovalAuthorization(
  command: Readonly<MechanicsBoundaryCommand>,
  cursor: Readonly<MechanicsBoundaryCursor>
): Readonly<CurrentCombatantRemovalAuthorization> | null {
  if (
    command.kind !== "complete-turn" ||
    cursor.kind !== "complete-turn" ||
    cursor.phase === "after-start" ||
    cursor.encounter.currentCombatantId === null
  ) {
    return null;
  }
  const current = cursor.encounter.participants.find(
    ({ participantId }) => participantId === cursor.encounter.currentCombatantId
  );
  return current
    ? {
        combatant: structuredClone(current.combatant),
        encounterEpoch: cursor.encounter.epoch,
        material: structuredClone(command.material),
      }
    : null;
}

function continuationValid(
  value: unknown
): value is Readonly<MechanicsBoundaryContinuation> {
  if (!isExactRecord(value, ["basis", "checkpoint", "command", "cursor", "request"])) {
    return false;
  }
  const basis = parseMechanicsWorldStructure(value.basis);
  const command = conformMechanicsBoundaryCommand(value.command);
  const cursor = conformBoundaryCursor(value.cursor);
  if (
    !basis.ok ||
    !isExactRecord(value.checkpoint, ["boundary", "ordinal", "state", "wave"]) ||
    !isExactRecord(value.checkpoint.state, ["context", "world"]) ||
    !isExactRecord(value.checkpoint.state.context, [
      "endWave",
      "pendingFrames",
      "request",
    ]) ||
    !pendingCapabilityValid(
      value.checkpoint.state as unknown as Readonly<MechanicsCausalState>
    ) ||
    !command ||
    !cursor ||
    !cursorMatchesCommand(command, cursor)
  ) {
    return false;
  }
  const basisPendingFrames = conformPendingFrames(
    basis.value,
    value.checkpoint.state.context.pendingFrames
  );
  if (
    !basisPendingFrames ||
    !exactEqual(basisPendingFrames, value.checkpoint.state.context.pendingFrames) ||
    validateClosedTurnState(basis.value)
  ) {
    return false;
  }
  if (!checkpointStateValid(value.checkpoint, basis.value)) return false;
  if (
    validateWorldInvariants(
      basis.value,
      leaseSet(value.checkpoint.state.context.request),
      false,
      basisPendingFrames
    )
  ) {
    return false;
  }
  try {
    const normalized = normalizedClosureRequest(value.request as MechanicsClosureRequest);
    return (
      isExactRecord(value.request, [
        "boundaries",
        "endRequests",
        "inventorySourceLeases",
      ]) &&
      normalized.endRequests.length === 0 &&
      canonicalJson(normalized) === canonicalJson(value.request) &&
      canonicalJson(value.request.boundaries) ===
        canonicalJson(value.checkpoint.wave.request.boundaries) &&
      canonicalJson(value.request.inventorySourceLeases) ===
        canonicalJson(value.checkpoint.wave.request.inventorySourceLeases) &&
      protectedJournalsMatch(basis.value, value.checkpoint.state.world)
    );
  } catch {
    return false;
  }
}

function emitBoundaryCheckpoint(
  basis: Readonly<MechanicsWorld>,
  current: Readonly<MechanicsWorld>,
  command: Readonly<MechanicsBoundaryCommand>,
  cursor: Readonly<MechanicsBoundaryCursor>,
  priorRequest: Required<MechanicsClosureRequest>,
  boundary: Readonly<ObservedMechanicsBoundary>,
  ordinal: number,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): MechanicsBoundaryResult {
  let request: Required<MechanicsClosureRequest>;
  try {
    request = mergeClosureRequests(
      priorRequest,
      normalizedClosureRequest({ boundaries: [boundary] })
    );
  } catch {
    return boundaryRejected("invalid-boundary");
  }
  const discovery = discoverHistoricalMechanicsEndWave(basis, current, request);
  if (discovery.status === "rejected") {
    return boundaryRejected(discovery.reason);
  }
  const latched = latchAndRediscoverEndWave(
    discovery.world,
    discovery.wave,
    basis,
    currentCombatantRemovalAuthorization(command, cursor),
    pendingFrames
  );
  if (!latched.ok) return boundaryRejected(latched.reason);
  const reprovedPendingFrames = conformPendingFrames(latched.value.world, pendingFrames);
  const invariantProblem = reprovedPendingFrames
    ? validateReadableCausalWorld(
        latched.value.world,
        leaseSet(latched.value.wave.request),
        reprovedPendingFrames
      )
    : "invalid-program-origin";
  if (
    !reprovedPendingFrames ||
    !exactEqual(reprovedPendingFrames, pendingFrames) ||
    invariantProblem
  ) {
    return boundaryRejected("invalid-transition");
  }
  const state = kernelCausalState(latched.value.world, {
    endWave:
      latched.value.wave.candidates.length === 0
        ? null
        : { wave: latched.value.wave, world: latched.value.world },
    pendingFrames: reprovedPendingFrames,
    request: latched.value.wave.request,
  });
  const checkpoint = freezeDeep({
    boundary: structuredClone(boundary),
    ordinal,
    state,
    wave: latched.value.wave,
  });
  const continuation = freezeDeep({
    basis,
    checkpoint,
    command,
    cursor,
    request: latched.value.wave.request,
  }) as unknown as Readonly<MechanicsBoundaryContinuation>;
  return { checkpoint, continuation, status: "checkpoint" };
}

function leaseSet(request: Required<MechanicsClosureRequest>): ReadonlySet<string> {
  return new Set(request.inventorySourceLeases.map(leaseKey));
}

function completionWorld(
  continuation: Readonly<MechanicsBoundaryContinuation>,
  state: Readonly<MechanicsCausalState>
):
  | {
      readonly ok: true;
      readonly request: Required<MechanicsClosureRequest>;
      readonly state: Readonly<MechanicsCausalState>;
    }
  | {
      readonly ok: "checkpoint";
      readonly state: Readonly<MechanicsCausalState>;
    }
  | {
      readonly ok: false;
      readonly reason: MechanicsWorldSimulationRejection;
      readonly world: Readonly<MechanicsWorld>;
    } {
  const leases = normalizeInventorySourceLeases(state.world, [
    ...continuation.request.inventorySourceLeases,
    ...state.context.request.inventorySourceLeases,
    ...(state.context.endWave?.wave.request.inventorySourceLeases ?? []),
  ]);
  if (!leases) return { ok: false, reason: "invalid-end-wave", world: state.world };
  const request = mergeClosureRequests(
    continuation.request,
    normalizedClosureRequest({
      boundaries: state.context.request.boundaries,
      endRequests: state.context.request.endRequests,
      inventorySourceLeases: leases,
    })
  );
  if (state.context.endWave !== null) {
    const nextWave = state.context.endWave.wave;
    if (canonicalJson(nextWave) !== canonicalJson(continuation.checkpoint.wave)) {
      return { ok: "checkpoint", state };
    }
  }
  if (state.context.endWave === null) {
    const discovery = discoverHistoricalMechanicsEndWave(
      continuation.basis,
      state.world,
      request
    );
    if (discovery.status === "rejected") {
      return { ok: false, reason: discovery.reason, world: state.world };
    }
    if (discovery.wave.candidates.length === 0) {
      const nextRequest = normalizedClosureRequest({
        boundaries: request.boundaries,
        inventorySourceLeases: request.inventorySourceLeases,
      });
      return {
        ok: true,
        request: nextRequest,
        state: kernelCausalState(discovery.world, {
          endWave: null,
          pendingFrames: state.context.pendingFrames,
          request: nextRequest,
        }),
      };
    }
    const latched = latchAndRediscoverEndWave(
      discovery.world,
      discovery.wave,
      continuation.basis,
      currentCombatantRemovalAuthorization(continuation.command, continuation.cursor),
      state.context.pendingFrames
    );
    if (!latched.ok) {
      return { ok: false, reason: latched.reason, world: discovery.world };
    }
    const pendingFrames = conformPendingFrames(
      latched.value.world,
      state.context.pendingFrames
    );
    if (!pendingFrames || !exactEqual(pendingFrames, state.context.pendingFrames)) {
      return { ok: false, reason: "invalid-end-wave", world: latched.value.world };
    }
    return {
      ok: "checkpoint",
      state: kernelCausalState(latched.value.world, {
        endWave: latched.value,
        pendingFrames,
        request: latched.value.wave.request,
      }),
    };
  }
  const wave = state.context.endWave.wave;
  try {
    const expected = mergeClosureRequests(request, wave.request);
    if (canonicalJson(expected) !== canonicalJson(wave.request)) {
      return { ok: false, reason: "invalid-end-wave", world: state.world };
    }
  } catch {
    return { ok: false, reason: "invalid-end-wave", world: state.world };
  }
  const finalized = finalizeHistoricalMechanicsEndWave(
    continuation.basis,
    state.world,
    wave,
    currentCombatantRemovalAuthorization(continuation.command, continuation.cursor)
  );
  if (finalized.status === "rejected") {
    return { ok: false, reason: finalized.reason, world: finalized.world };
  }
  const pendingFrames = conformPendingFrames(
    finalized.world,
    state.context.pendingFrames
  );
  if (!pendingFrames || !exactEqual(pendingFrames, state.context.pendingFrames)) {
    return { ok: false, reason: "invalid-end-wave", world: finalized.world };
  }
  const nextRequest = normalizedClosureRequest({
    boundaries: request.boundaries,
    inventorySourceLeases: request.inventorySourceLeases,
  });
  return {
    ok: true,
    request: nextRequest,
    state: kernelCausalState(finalized.world, {
      endWave: null,
      pendingFrames,
      request: nextRequest,
    }),
  };
}

function nextParticipant(
  cursor: Extract<MechanicsBoundaryCursor, { kind: "complete-turn" }>,
  encounter: EncounterState
):
  | {
      readonly offset: number;
      readonly participant: MechanicsBoundaryParticipantCursor;
      readonly wraps: boolean;
    }
  | { readonly conflict: true }
  | null {
  const currentId = cursor.encounter.currentCombatantId;
  if (currentId === null) return null;
  const currentIndex = cursor.encounter.order.indexOf(currentId);
  if (currentIndex < 0) return null;
  const byId = new Map(
    cursor.encounter.participants.map((participant) => [
      participant.participantId,
      participant,
    ])
  );
  for (
    let offset = cursor.scanOffset;
    offset <= cursor.encounter.order.length;
    offset += 1
  ) {
    const index = (currentIndex + offset) % cursor.encounter.order.length;
    const participantId = cursor.encounter.order[index];
    if (!participantId || !encounter.order.includes(participantId)) continue;
    const participant = encounter.participants[participantId];
    const expected = byId.get(participantId);
    if (!participant || !expected) continue;
    if (!sameParticipantCursor(participant, expected)) return { conflict: true };
    if (
      cursor.excludeCurrent !== null &&
      sameEntity(cursor.excludeCurrent, participant.combatant)
    ) {
      continue;
    }
    return {
      offset,
      participant: expected,
      wraps: currentIndex + offset >= cursor.encounter.order.length,
    };
  }
  return null;
}

function setBetweenTurns(
  encounter: EncounterState,
  cursor: MechanicsBoundaryParticipantCursor | null
): boolean {
  if (!cursor) return true;
  const participant = encounter.participants[cursor.participantId];
  if (!participant) return true;
  if (!sameParticipantCursor(participant, cursor)) return false;
  participant.economy = { ...participant.economy, phase: "between-turns" };
  return true;
}

function continueCompleteTurn(
  basis: Readonly<MechanicsWorld>,
  current: Readonly<MechanicsWorld>,
  command: Extract<MechanicsBoundaryCommand, { kind: "complete-turn" }>,
  cursorValue: Extract<MechanicsBoundaryCursor, { kind: "complete-turn" }>,
  request: Required<MechanicsClosureRequest>,
  ordinal: number,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): MechanicsBoundaryResult {
  let world = current;
  let cursor = cursorValue;
  const leases = leaseSet(request);
  const afterCheckpoint = documentFor(world, command.material);
  const afterEncounter = afterCheckpoint?.state.encounter;
  if (
    !afterCheckpoint ||
    !afterEncounter ||
    afterEncounter.epoch !== cursor.encounter.epoch ||
    afterEncounter.round !== cursor.expectedRound ||
    afterCheckpoint.state.timeline.elapsedSeconds !== cursor.expectedTimelineSeconds ||
    !encounterIdentityCompatible(afterEncounter, cursor.encounter)
  ) {
    return boundaryRejected("invalid-transition");
  }
  if (cursor.phase === "after-start") {
    const selected = cursor.selected;
    if (!selected) return boundaryRejected("invalid-transition");
    const live = afterEncounter.participants[selected.participantId];
    if (live && !sameParticipantCursor(live, selected)) {
      return boundaryRejected("invalid-transition");
    }
    if (live) {
      const candidate = mutableWorld(world);
      const encounter = documentFor(candidate, command.material)?.state.encounter;
      if (!encounter) return boundaryRejected("invalid-transition");
      if (encounter.phase === "initiative") {
        encounter.order = cursor.encounter.order.filter((participantId) => {
          const participant = encounter.participants[participantId];
          return participant !== undefined && !participant.skipped;
        });
        if (!encounter.order.includes(selected.participantId)) {
          return boundaryRejected("invalid-transition");
        }
        encounter.phase = "turns";
      } else if (!encounter.order.includes(selected.participantId)) {
        return boundaryRejected("invalid-transition");
      }
      for (const participant of Object.values(encounter.participants)) {
        participant.economy = { ...participant.economy, phase: "between-turns" };
      }
      const mutableSelected = encounter.participants[selected.participantId];
      if (!mutableSelected || !sameParticipantCursor(mutableSelected, selected)) {
        return boundaryRejected("invalid-transition");
      }
      encounter.currentCombatantId = selected.participantId;
      mutableSelected.economy = ownTurnEconomy(
        encounter.epoch,
        encounter.round,
        mutableSelected.ordinal
      );
      const committed = finalize(world, candidate, leases, pendingFrames);
      return committed.status === "rejected"
        ? boundaryRejected(committed.reason)
        : finishBoundary(basis, committed.world, pendingFrames, request);
    }
    const skippedCandidate = mutableWorld(world);
    const skippedEncounter = documentFor(skippedCandidate, command.material)?.state
      .encounter;
    if (!skippedEncounter || !setBetweenTurns(skippedEncounter, selected)) {
      return boundaryRejected("invalid-transition");
    }
    if (skippedEncounter.phase === "initiative") {
      skippedEncounter.order = cursor.encounter.order.filter((participantId) => {
        const participant = skippedEncounter.participants[participantId];
        return participant !== undefined && !participant.skipped;
      });
      const placeholder =
        (cursor.encounter.currentCombatantId !== null &&
        skippedEncounter.order.includes(cursor.encounter.currentCombatantId)
          ? cursor.encounter.currentCombatantId
          : skippedEncounter.order[0]) ?? null;
      if (placeholder === null) {
        return finishBoundary(basis, world, pendingFrames, request);
      }
      skippedEncounter.currentCombatantId = placeholder;
      skippedEncounter.phase = "turns";
    }
    const cleaned = projectBoundaryMutation(
      world,
      skippedCandidate,
      leases,
      pendingFrames
    );
    if (cleaned.status === "rejected") {
      return boundaryRejected(cleaned.reason);
    }
    world = cleaned.world;
    cursor = {
      ...cursor,
      lastSelected: selected,
      phase: "after-time",
      selected: null,
    };
  }

  while (cursor.scanOffset <= cursor.encounter.order.length) {
    const before = documentFor(world, command.material);
    const encounter = before?.state.encounter;
    if (
      !before ||
      !encounter ||
      encounter.epoch !== cursor.encounter.epoch ||
      encounter.round !== cursor.expectedRound ||
      before.state.timeline.elapsedSeconds !== cursor.expectedTimelineSeconds ||
      !encounterIdentityCompatible(encounter, cursor.encounter)
    ) {
      return boundaryRejected("invalid-transition");
    }
    if (encounter.phase === "initiative") {
      return finishBoundary(basis, world, pendingFrames, request);
    }
    const next = nextParticipant(cursor, encounter);
    if (!next) {
      if (cursor.excludeCurrent === null) {
        return boundaryRejected("encounter-conflict");
      }
      const candidate = mutableWorld(world);
      const document = documentFor(candidate, command.material);
      const mutableEncounter = document?.state.encounter;
      if (!document || !mutableEncounter) {
        return boundaryRejected("invalid-transition");
      }
      for (const participant of Object.values(mutableEncounter.participants)) {
        participant.economy = { ...participant.economy, phase: "between-turns" };
      }
      mutableEncounter.currentCombatantId = null;
      mutableEncounter.order = [];
      mutableEncounter.phase = "initiative";
      const suspended = finalize(world, candidate, leases, pendingFrames);
      return suspended.status === "rejected"
        ? boundaryRejected(suspended.reason)
        : finishBoundary(basis, suspended.world, pendingFrames, request);
    }
    if ("conflict" in next) return boundaryRejected("invalid-transition");

    if (next.wraps && cursor.expectedRound === cursor.encounter.round) {
      if (
        cursor.expectedRound === Number.MAX_SAFE_INTEGER ||
        cursor.expectedTimelineSeconds > Number.MAX_SAFE_INTEGER - 6
      ) {
        return boundaryRejected("overflow");
      }
      const candidate = mutableWorld(world);
      const document = documentFor(candidate, command.material);
      const mutableEncounter = document?.state.encounter;
      const originalCurrent = cursor.encounter.currentCombatantId;
      const original = cursor.encounter.participants.find(
        ({ participantId }) => participantId === originalCurrent
      );
      if (
        !document ||
        !mutableEncounter ||
        !setBetweenTurns(mutableEncounter, original ?? null) ||
        !setBetweenTurns(mutableEncounter, cursor.lastSelected)
      ) {
        return boundaryRejected("invalid-transition");
      }
      mutableEncounter.round += 1;
      document.state.timeline.elapsedSeconds += 6;
      const advanced = projectBoundaryMutation(world, candidate, leases, pendingFrames);
      if (advanced.status === "rejected") {
        return boundaryRejected(advanced.reason);
      }
      const nextCursor = freezeDeep({
        ...cursor,
        expectedRound: mutableEncounter.round,
        expectedTimelineSeconds: document.state.timeline.elapsedSeconds,
        phase: "after-time" as const,
        selected: null,
      });
      return emitBoundaryCheckpoint(
        basis,
        advanced.world,
        command,
        nextCursor,
        request,
        {
          clock: timelineClock(document),
          elapsedSeconds: document.state.timeline.elapsedSeconds,
          kind: "time-reached",
        },
        ordinal,
        pendingFrames
      );
    }

    const candidate = mutableWorld(world);
    const document = documentFor(candidate, command.material);
    const mutableEncounter = document?.state.encounter;
    const selected = mutableEncounter?.participants[next.participant.participantId];
    const originalCurrent = cursor.encounter.currentCombatantId;
    const original = cursor.encounter.participants.find(
      ({ participantId }) => participantId === originalCurrent
    );
    if (
      !document ||
      !mutableEncounter ||
      !selected ||
      !sameParticipantCursor(selected, next.participant) ||
      !setBetweenTurns(mutableEncounter, original ?? null) ||
      !setBetweenTurns(mutableEncounter, cursor.lastSelected)
    ) {
      return boundaryRejected("invalid-transition");
    }
    for (const participant of Object.values(mutableEncounter.participants)) {
      participant.economy = { ...participant.economy, phase: "between-turns" };
    }
    mutableEncounter.currentCombatantId = null;
    mutableEncounter.order = [];
    mutableEncounter.phase = "initiative";
    const started = finalize(world, candidate, leases, pendingFrames);
    if (started.status === "rejected") {
      return boundaryRejected(started.reason);
    }
    return emitBoundaryCheckpoint(
      basis,
      started.world,
      command,
      freezeDeep({
        ...cursor,
        phase: "after-start" as const,
        scanOffset: next.offset + 1,
        selected: next.participant,
      }),
      request,
      {
        clock: { epoch: mutableEncounter.epoch, material: document.material },
        combatant: structuredClone(next.participant.combatant),
        kind: "turn-boundary",
        phase: "start",
        round: mutableEncounter.round,
      },
      ordinal,
      pendingFrames
    );
  }
  return boundaryRejected("encounter-conflict");
}

function startSharedEncounter(
  basis: Readonly<MechanicsWorld>,
  current: Readonly<MechanicsWorld>,
  command: Extract<MechanicsBoundaryCommand, { kind: "start-encounter" }>,
  characterMaterials: readonly CharacterMaterialRef[],
  nextIndex: number,
  request: Required<MechanicsClosureRequest>,
  ordinal: number,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): MechanicsBoundaryResult {
  const leases = leaseSet(request);
  for (let index = nextIndex; index < characterMaterials.length; index += 1) {
    const characterMaterial = characterMaterials[index];
    if (!characterMaterial) return boundaryRejected("invalid-transition");
    const character = documentFor(current, characterMaterial);
    if (!character || character.kind !== "character") {
      return boundaryRejected("missing-document");
    }
    if (character.state.clockBinding.timeline.material.kind === "shared-combat") {
      return boundaryRejected("encounter-conflict");
    }
    const localClock = encounterClock(character);
    if (!localClock) continue;
    const localEncounter = character.state.encounter;
    if (!localEncounter) return boundaryRejected("encounter-conflict");
    return emitBoundaryCheckpoint(
      basis,
      current,
      command,
      freezeDeep({
        characterMaterials: [...characterMaterials],
        kind: "start-shared-encounter" as const,
        nextIndex: index,
        pendingEncounter: encounterCursor(localEncounter),
      }),
      request,
      { clock: localClock, kind: "combat-end" },
      ordinal,
      pendingFrames
    );
  }

  const candidate = mutableWorld(current);
  const mutableShared = documentFor(candidate, command.material);
  if (!mutableShared || mutableShared.kind !== "shared") {
    return boundaryRejected("missing-document");
  }
  const sharedEncounterClock = startEncounterOnDocument(mutableShared, command.seed);
  if (!sharedEncounterClock || !mutableShared.state.encounter) {
    return boundaryRejected("encounter-conflict");
  }
  normalizeEncounter(candidate, mutableShared.material, mutableShared.state.encounter);
  if (
    mutableShared.state.encounter.phase === "turns" &&
    mutableShared.state.encounter.currentCombatantId !== null
  ) {
    const active =
      mutableShared.state.encounter.participants[
        mutableShared.state.encounter.currentCombatantId
      ];
    if (!active) return boundaryRejected("encounter-conflict");
    active.economy = ownTurnEconomy(
      mutableShared.state.encounter.epoch,
      mutableShared.state.encounter.round,
      active.ordinal
    );
  }
  const sharedTimeline = {
    clock: timelineClock(mutableShared),
    elapsedSeconds: mutableShared.state.timeline.elapsedSeconds,
    nextBoundaryOrdinal: mutableShared.state.timeline.nextBoundaryOrdinal,
  };
  try {
    for (const characterMaterial of leasedCharacterMaterials(
      mutableShared.state.encounter
    )) {
      const character = documentFor(candidate, characterMaterial);
      if (
        !character ||
        character.kind !== "character" ||
        character.state.encounter !== null ||
        character.state.clockBinding.encounter !== null ||
        character.state.clockBinding.timeline.material.kind === "shared-combat"
      ) {
        return boundaryRejected("encounter-conflict");
      }
      const sourceTimeline = {
        clock: timelineClock(character),
        elapsedSeconds: character.state.timeline.elapsedSeconds,
        nextBoundaryOrdinal: character.state.timeline.nextBoundaryOrdinal,
      };
      rebaseTimelineRules(character.state, sourceTimeline, sharedTimeline);
      character.state.clockBinding = {
        timeline: sharedTimeline.clock,
        encounter: sharedEncounterClock,
      };
    }
  } catch (error) {
    if (error instanceof RangeError) return boundaryRejected("overflow");
    throw error;
  }
  const started = finalize(current, candidate, leases, pendingFrames);
  if (started.status === "rejected") {
    return boundaryRejected(started.reason);
  }
  const startedDocument = documentFor(started.world, command.material);
  const boundary = startedDocument ? currentTurnBoundary(startedDocument, "start") : null;
  return boundary
    ? emitBoundaryCheckpoint(
        basis,
        started.world,
        command,
        { kind: "finish" },
        request,
        boundary,
        ordinal,
        pendingFrames
      )
    : finishBoundary(basis, started.world, pendingFrames, request);
}

function resumeStartSharedEncounter(
  basis: Readonly<MechanicsWorld>,
  current: Readonly<MechanicsWorld>,
  command: Extract<MechanicsBoundaryCommand, { kind: "start-encounter" }>,
  cursor: Extract<MechanicsBoundaryCursor, { kind: "start-shared-encounter" }>,
  request: Required<MechanicsClosureRequest>,
  ordinal: number,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): MechanicsBoundaryResult {
  if (
    command.material.kind !== "shared-combat" ||
    canonicalJson(leasedCharacterMaterials(command.seed)) !==
      canonicalJson(cursor.characterMaterials)
  ) {
    return boundaryRejected("invalid-transition");
  }
  const pendingMaterial = cursor.characterMaterials[cursor.nextIndex];
  if (!pendingMaterial) return boundaryRejected("invalid-transition");
  const character = documentFor(current, pendingMaterial);
  const encounter = character?.state.encounter;
  if (
    !character ||
    character.kind !== "character" ||
    !encounter ||
    !encounterIdentityCompatible(encounter, cursor.pendingEncounter) ||
    encounter.epoch !== cursor.pendingEncounter.epoch
  ) {
    return boundaryRejected("invalid-transition");
  }
  const candidate = mutableWorld(current);
  const cleared = documentFor(candidate, pendingMaterial);
  if (!cleared || cleared.kind !== "character") {
    return boundaryRejected("missing-document");
  }
  cleared.state.encounter = null;
  cleared.state.clockBinding.encounter = null;
  const clearedResult = finalize(current, candidate, leaseSet(request), pendingFrames);
  return clearedResult.status === "rejected"
    ? boundaryRejected(clearedResult.reason)
    : startSharedEncounter(
        basis,
        clearedResult.world,
        command,
        cursor.characterMaterials,
        cursor.nextIndex + 1,
        request,
        ordinal,
        pendingFrames
      );
}

function resumeEndEncounter(
  basis: Readonly<MechanicsWorld>,
  current: Readonly<MechanicsWorld>,
  command: Extract<MechanicsBoundaryCommand, { kind: "end-encounter" }>,
  cursor: Extract<MechanicsBoundaryCursor, { kind: "end-encounter" }>,
  request: Required<MechanicsClosureRequest>,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): MechanicsBoundaryResult {
  const after = documentFor(current, command.material);
  const encounter = after?.state.encounter;
  if (
    !after ||
    !encounter ||
    encounter.epoch !== cursor.encounter.epoch ||
    !encounterIdentityCompatible(encounter, cursor.encounter)
  ) {
    return boundaryRejected("invalid-transition");
  }
  const candidate = mutableWorld(current);
  const mutable = documentFor(candidate, command.material);
  if (!mutable) return boundaryRejected("missing-document");
  if (mutable.kind === "character") {
    mutable.state.encounter = null;
    mutable.state.clockBinding.encounter = null;
  } else {
    const sharedTimeline = {
      clock: timelineClock(mutable),
      elapsedSeconds: mutable.state.timeline.elapsedSeconds,
      nextBoundaryOrdinal: mutable.state.timeline.nextBoundaryOrdinal,
    };
    mutable.state.encounter = null;
    try {
      for (const character of candidate.documents) {
        if (
          character.kind !== "character" ||
          !sameClock(character.state.clockBinding.timeline, sharedTimeline.clock)
        ) {
          continue;
        }
        const localTimeline = {
          clock: timelineClock(character),
          elapsedSeconds: character.state.timeline.elapsedSeconds,
          nextBoundaryOrdinal: character.state.timeline.nextBoundaryOrdinal,
        };
        rebaseTimelineRules(character.state, sharedTimeline, localTimeline);
        character.state.clockBinding = {
          timeline: localTimeline.clock,
          encounter: null,
        };
      }
    } catch (error) {
      if (error instanceof RangeError) return boundaryRejected("overflow");
      throw error;
    }
  }
  const cleared = finalize(current, candidate, leaseSet(request), pendingFrames);
  return cleared.status === "rejected"
    ? boundaryRejected(cleared.reason)
    : finishBoundary(basis, cleared.world, pendingFrames, request);
}

/** Start one table boundary from a closed hostile world. */
export function beginMechanicsBoundary(
  value: Readonly<MechanicsWorld>,
  commandValue: unknown
): MechanicsBoundaryResult {
  const begun = beginMechanicsCausalState(value);
  if (!begun.ok) return boundaryRejected(begun.reason);
  return beginMechanicsBoundaryFromState(begun.value, commandValue);
}

/** Start a boundary inside one active causal action without dropping its frame stack. */
export function beginMechanicsBoundaryFromCausalState(
  stateValue: unknown,
  commandValue: unknown
): MechanicsBoundaryResult {
  const state = exactCausalState(stateValue);
  return !state || state.context.endWave !== null
    ? boundaryRejected("invalid-end-wave")
    : beginMechanicsBoundaryFromState(state, commandValue);
}

function beginMechanicsBoundaryFromState(
  state: Readonly<MechanicsCausalState>,
  commandValue: unknown
): MechanicsBoundaryResult {
  const basis = state.world;
  const command = conformMechanicsBoundaryCommand(commandValue);
  if (!command) return boundaryRejected("invalid-transition");
  const request = state.context.request;
  const pendingFrames = state.context.pendingFrames;

  if (command.kind === "complete-rest") {
    const allocated = allocateTimelineBoundary(basis, command.input.clock, pendingFrames);
    if (!allocated) {
      return boundaryRejected(
        clockResolves(basis, command.input.clock, "timeline")
          ? "overflow"
          : "clock-conflict"
      );
    }
    return emitBoundaryCheckpoint(
      basis,
      allocated.world,
      command,
      { kind: "finish" },
      request,
      {
        boundaryOrdinal: allocated.boundaryOrdinal,
        kind: "rest-completed",
        ...command.input,
      },
      0,
      pendingFrames
    );
  }
  if (command.kind === "observe-day-phase") {
    const allocated = allocateTimelineBoundary(basis, command.input.clock, pendingFrames);
    if (!allocated) {
      return boundaryRejected(
        clockResolves(basis, command.input.clock, "timeline")
          ? "overflow"
          : "clock-conflict"
      );
    }
    return emitBoundaryCheckpoint(
      basis,
      allocated.world,
      command,
      { kind: "finish" },
      request,
      {
        boundaryOrdinal: allocated.boundaryOrdinal,
        kind: "day-phase",
        ...command.input,
      },
      0,
      pendingFrames
    );
  }
  if (command.kind === "advance-time") {
    if (!clockResolves(basis, command.clock, "timeline")) {
      return boundaryRejected("clock-conflict");
    }
    const candidate = mutableWorld(basis);
    const document = documentFor(candidate, command.clock.material);
    if (!document) return boundaryRejected("missing-document");
    if (
      document.state.timeline.elapsedSeconds >
      Number.MAX_SAFE_INTEGER - command.elapsedSeconds
    ) {
      return boundaryRejected("overflow");
    }
    document.state.timeline.elapsedSeconds += command.elapsedSeconds;
    const projected = projectBoundaryMutation(basis, candidate, new Set(), pendingFrames);
    if (projected.status === "rejected") {
      return boundaryRejected(projected.reason);
    }
    return emitBoundaryCheckpoint(
      basis,
      projected.world,
      command,
      { kind: "finish" },
      request,
      {
        clock: command.clock,
        elapsedSeconds: document.state.timeline.elapsedSeconds,
        kind: "time-reached",
      },
      0,
      pendingFrames
    );
  }
  if (command.kind === "complete-turn") {
    const document = documentFor(basis, command.material);
    const boundary = document ? currentTurnBoundary(document, "end") : null;
    const encounter = document?.state.encounter;
    const current =
      encounter?.currentCombatantId === null ||
      encounter?.currentCombatantId === undefined
        ? null
        : encounter.participants[encounter.currentCombatantId];
    if (
      !document ||
      !boundary ||
      !encounter ||
      !current ||
      (command.excludeCurrent !== null &&
        !sameEntity(command.excludeCurrent, current.combatant))
    ) {
      return boundaryRejected("encounter-conflict");
    }
    return emitBoundaryCheckpoint(
      basis,
      basis,
      command,
      {
        encounter: encounterCursor(encounter),
        excludeCurrent: structuredClone(command.excludeCurrent),
        expectedRound: encounter.round,
        expectedTimelineSeconds: document.state.timeline.elapsedSeconds,
        kind: "complete-turn",
        lastSelected: null,
        phase: "after-end",
        scanOffset: 1,
        selected: null,
      },
      request,
      boundary,
      0,
      pendingFrames
    );
  }
  if (command.kind === "start-encounter") {
    const document = documentFor(basis, command.material);
    if (!document || document.state.encounter !== null) {
      return boundaryRejected("encounter-conflict");
    }
    if (document.kind === "shared") {
      const materials = leasedCharacterMaterials(command.seed);
      return startSharedEncounter(
        basis,
        basis,
        command,
        materials,
        0,
        request,
        0,
        pendingFrames
      );
    }
    if (
      document.state.clockBinding.encounter !== null ||
      !sameMaterial(document.state.clockBinding.timeline.material, command.material)
    ) {
      return boundaryRejected("encounter-conflict");
    }
    const candidate = mutableWorld(basis);
    const mutable = documentFor(candidate, command.material);
    if (!mutable || mutable.kind !== "character") {
      return boundaryRejected("missing-document");
    }
    const clock = startEncounterOnDocument(mutable, command.seed);
    if (!clock) return boundaryRejected("encounter-conflict");
    mutable.state.clockBinding.encounter = clock;
    const started = finalize(basis, candidate, new Set(), pendingFrames);
    if (started.status === "rejected") {
      return boundaryRejected(started.reason);
    }
    const startedDocument = documentFor(started.world, command.material);
    const boundary = startedDocument
      ? currentTurnBoundary(startedDocument, "start")
      : null;
    return boundary
      ? emitBoundaryCheckpoint(
          basis,
          started.world,
          command,
          { kind: "finish" },
          request,
          boundary,
          0,
          pendingFrames
        )
      : finishBoundary(basis, started.world, pendingFrames, request);
  }
  const document = documentFor(basis, command.material);
  const clock = document ? encounterClock(document) : null;
  const encounter = document?.state.encounter;
  if (!document || !clock || !encounter) {
    return boundaryRejected("encounter-conflict");
  }
  return emitBoundaryCheckpoint(
    basis,
    basis,
    command,
    { encounter: encounterCursor(encounter), kind: "end-encounter" },
    request,
    { clock, kind: "combat-end" },
    0,
    pendingFrames
  );
}

/** Brand one causally valid completion for one exact process-local checkpoint. */
export function completeMechanicsBoundaryCheckpoint(
  continuationValue: unknown,
  stateValue: unknown
): Readonly<MechanicsBoundaryCompletion> | null {
  try {
    if (!continuationValid(continuationValue)) return null;
    const state = stateValue as Readonly<MechanicsCausalState>;
    if (
      !completionStateValid(continuationValue.checkpoint, state, continuationValue.basis)
    ) {
      return null;
    }
    return freezeDeep({
      continuation: canonicalFingerprint(continuationValue),
      state,
    }) as unknown as Readonly<MechanicsBoundaryCompletion>;
  } catch {
    return null;
  }
}

/** Advance only the exact checkpoint named by one coordinator-issued completion. */
export function advanceMechanicsBoundary(
  continuationValue: Readonly<MechanicsBoundaryContinuation>,
  completionValue: Readonly<MechanicsBoundaryCompletion>
): MechanicsBoundaryResult {
  try {
    if (
      !continuationValid(continuationValue) ||
      !isExactRecord(completionValue, ["continuation", "state"]) ||
      conformCanonicalFingerprint(completionValue.continuation) === null ||
      completionValue.continuation !== canonicalFingerprint(continuationValue) ||
      !completionStateValid(
        continuationValue.checkpoint,
        completionValue.state,
        continuationValue.basis
      )
    ) {
      return boundaryRejected("invalid-transition");
    }
    const completed = completionWorld(continuationValue, completionValue.state);
    if (completed.ok === "checkpoint") {
      const ordinal = continuationValue.checkpoint.ordinal + 1;
      if (!Number.isSafeInteger(ordinal)) {
        return boundaryRejected("overflow");
      }
      const wave = completed.state.context.endWave?.wave;
      if (!wave) {
        return boundaryRejected("invalid-end-wave");
      }
      const checkpoint = freezeDeep({
        boundary: null,
        ordinal,
        state: completed.state,
        wave,
      });
      const continuation = freezeDeep({
        ...continuationValue,
        checkpoint,
        request: normalizedClosureRequest({
          boundaries: completed.state.context.request.boundaries,
          inventorySourceLeases: completed.state.context.request.inventorySourceLeases,
        }),
      }) as unknown as Readonly<MechanicsBoundaryContinuation>;
      return { checkpoint, continuation, status: "checkpoint" };
    }
    if (!completed.ok) {
      return boundaryRejected(completed.reason);
    }
    const nextOrdinal = continuationValue.checkpoint.ordinal + 1;
    if (!Number.isSafeInteger(nextOrdinal)) {
      return boundaryRejected("overflow");
    }
    const { basis, command, cursor } = continuationValue;
    if (cursor.kind === "finish") {
      return finishBoundary(
        basis,
        completed.state.world,
        completed.state.context.pendingFrames,
        completed.request
      );
    }
    if (cursor.kind === "complete-turn" && command.kind === "complete-turn") {
      return continueCompleteTurn(
        basis,
        completed.state.world,
        command,
        cursor,
        completed.request,
        nextOrdinal,
        completed.state.context.pendingFrames
      );
    }
    if (cursor.kind === "start-shared-encounter" && command.kind === "start-encounter") {
      return resumeStartSharedEncounter(
        basis,
        completed.state.world,
        command,
        cursor,
        completed.request,
        nextOrdinal,
        completed.state.context.pendingFrames
      );
    }
    if (cursor.kind === "end-encounter" && command.kind === "end-encounter") {
      return resumeEndEncounter(
        basis,
        completed.state.world,
        command,
        cursor,
        completed.request,
        completed.state.context.pendingFrames
      );
    }
    return boundaryRejected("invalid-transition");
  } catch {
    return { reason: "invalid-transition", status: "rejected" };
  }
}

function encounterClock(document: MechanicsDocument | MutableDocument): ClockRef | null {
  return document.state.encounter
    ? { material: document.material, epoch: document.state.encounter.epoch }
    : null;
}

function timelineClock(document: MechanicsDocument | MutableDocument): ClockRef {
  return { material: document.material, epoch: document.state.timeline.epoch };
}

function allocateTimelineBoundary(
  basis: Readonly<MechanicsWorld>,
  clock: Readonly<ClockRef>,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): {
  readonly boundaryOrdinal: number;
  readonly world: Readonly<MechanicsWorld>;
} | null {
  if (!clockResolves(basis, clock, "timeline")) return null;
  const candidate = mutableWorld(basis);
  const document = documentFor(candidate, clock.material);
  if (
    !document ||
    document.state.timeline.nextBoundaryOrdinal === Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  const boundaryOrdinal = document.state.timeline.nextBoundaryOrdinal;
  document.state.timeline.nextBoundaryOrdinal += 1;
  const projected = projectBoundaryMutation(basis, candidate, new Set(), pendingFrames);
  return projected.status === "rejected"
    ? null
    : { boundaryOrdinal, world: projected.world };
}

function seedEncounter(epoch: number, seed: EncounterSeed): EncounterState | null {
  try {
    const participants = Object.fromEntries(
      Object.entries(seed.participants).map(([participantId, participant]) => [
        participantId,
        {
          ...structuredClone(participant),
          economy:
            seed.phase === "turns" && seed.currentCombatantId === participantId
              ? ownTurnEconomy(epoch, seed.round, participant.ordinal)
              : betweenTurnsEconomy(epoch, participant.ordinal),
        },
      ])
    );
    return structuredClone({ epoch, ...seed, order: [...seed.order], participants });
  } catch {
    return null;
  }
}

function rebaseTimelineRules(
  state: CharacterMaterialState,
  source: { clock: ClockRef; elapsedSeconds: number; nextBoundaryOrdinal: number },
  target: { clock: ClockRef; elapsedSeconds: number; nextBoundaryOrdinal: number }
): boolean {
  let changed = false;
  for (const occurrence of Object.values(state.occurrences)) {
    occurrence.endRules = occurrence.endRules.map((rule) => {
      if (
        (rule.kind !== "time-reached" &&
          rule.kind !== "rest-completed" &&
          rule.kind !== "day-phase") ||
        !sameClock(rule.clock, source.clock)
      ) {
        return rule;
      }
      changed = true;
      if (rule.kind !== "time-reached") {
        return {
          ...rule,
          clock: target.clock,
          minimumBoundaryOrdinal: target.nextBoundaryOrdinal,
        };
      }
      const remaining = rule.elapsedSeconds - source.elapsedSeconds;
      if (!Number.isSafeInteger(remaining) || remaining <= 0) {
        throw new RangeError("Clock rebase deadline is not future");
      }
      const deadline = target.elapsedSeconds + remaining;
      if (!Number.isSafeInteger(deadline)) throw new RangeError("Clock rebase overflow");
      return { ...rule, clock: target.clock, elapsedSeconds: deadline };
    });
  }
  return changed;
}

function startEncounterOnDocument(
  document: MutableDocument,
  seed: EncounterSeed
): ClockRef | null {
  if (
    document.state.encounter !== null ||
    document.state.nextEncounterEpoch === Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }
  const epoch = document.state.nextEncounterEpoch;
  const encounter = seedEncounter(epoch, seed);
  if (!encounter) return null;
  document.state.nextEncounterEpoch += 1;
  document.state.encounter = encounter;
  return { material: document.material, epoch };
}

function leasedCharacterMaterials(
  encounter: Pick<EncounterSeed, "participants">
): CharacterMaterialRef[] {
  const byKey = new Map<string, CharacterMaterialRef>();
  for (const participant of Object.values(encounter.participants)) {
    if (participant.combatant.material.kind !== "character-play") continue;
    byKey.set(
      materialRefKey(participant.combatant.material),
      participant.combatant.material
    );
  }
  return [...byKey.values()].sort((left, right) =>
    compareCanonical(materialRefKey(left), materialRefKey(right))
  );
}
