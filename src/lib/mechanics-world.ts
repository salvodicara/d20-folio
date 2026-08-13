import { materialRefKey } from "@/lib/action-journal";
import { canonicalJson } from "@/lib/canonical-fingerprint";
import { projectCreatureConditions } from "@/lib/condition";
import {
  isEffectOccurrence,
  resolveOccurrenceAuthority,
} from "@/lib/mechanic-occurrences";
import {
  parseCharacterMaterialState,
  parseSharedMaterialState,
} from "@/lib/material-state";
import {
  createBetweenTurnsEconomyState,
  createTurnEconomyState,
} from "@/lib/turn-economy";
import type { EndRule, MechanicOccurrence } from "@/types/mechanic-occurrence";
import type { MechanicsSourceRef } from "@/types/mechanics-authority-ref";
import type {
  ClockRef,
  EntityRef,
  MaterialRef,
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
  MechanicsBoundaryCommand,
  MechanicsClosureRequest,
  MechanicsClosureResolver,
  MechanicsDocument,
  MechanicsEndCandidate,
  MechanicsEndCause,
  MechanicsEndDiscoveryResult,
  MechanicsWorld,
  MechanicsWorldInvalidReason,
  MechanicsWorldParseResult,
  MechanicsWorldSimulationRejection,
  MechanicsWorldSimulationResult,
  ObservedMechanicsBoundary,
} from "@/types/mechanics-world";
import type {
  CharacterMaterialRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_ID_LENGTH = 256;

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

function sameMaterial(left: MaterialRef, right: MaterialRef): boolean {
  return materialRefKey(left) === materialRefKey(right);
}

function entityRefKey(value: EntityRef): string {
  return JSON.stringify([materialRefKey(value.material), value.entityId]);
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

function occurrenceFor(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  reference: OccurrenceRef
): MechanicOccurrence | null {
  return (
    documentFor(world, reference.material)?.state.occurrences[reference.occurrenceId] ??
    null
  );
}

function entityPresent(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  entityRef: EntityRef
): boolean {
  const document = documentFor(world, entityRef.material);
  if (!document) return false;
  if (entityRef.entityId === "self") return document.kind === "character";
  const entity = document.state.entities[entityRef.entityId];
  return entity?.availability === "present";
}

function creaturePresent(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  entityRef: EntityRef
): boolean {
  const document = documentFor(world, entityRef.material);
  if (!document) return false;
  if (entityRef.entityId === "self") return document.kind === "character";
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
  return `${materialRefKey(source.owner)}\u0000${source.instanceId}\u0000${source.instanceOrdinal}`;
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
      if (rule.kind !== "time-reached") return true;
      const document = documentFor(world, rule.clock.material);
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

function holderMatchesOccurrence(
  world: MechanicsWorld,
  reference: OccurrenceRef,
  holder: EntityRef
): boolean {
  const occurrence = occurrenceFor(world, reference);
  return (
    occurrence !== null &&
    isEffectOccurrence(occurrence) &&
    sameEntity(occurrence.target, holder)
  );
}

function temporaryHitPointSourceValid(
  world: MechanicsWorld,
  vitals: CreatureVitals,
  holder: EntityRef
): boolean {
  const reference = vitals.hitPoints.temporary.sourceOccurrence;
  return reference === null || holderMatchesOccurrence(world, reference, holder);
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
  inventorySourceLeases: ReadonlySet<string> = new Set()
): MechanicsWorldInvalidReason | null {
  const concentrations = new Set<string>();
  const polymorphs = new Set<string>();
  const activeItemSources = activeInventorySourceKeys(world);
  for (const document of world.documents) {
    const self = { material: document.material, entityId: "self" } satisfies EntityRef;
    if (document.kind === "character") {
      if (!temporaryHitPointSourceValid(world, document.state.vitals, self)) {
        return "missing-reference";
      }
      for (const [instanceId, instance] of Object.entries(document.state.inventory)) {
        if (
          instance.ownerOccurrence !== null &&
          !holderMatchesOccurrence(world, instance.ownerOccurrence, self)
        ) {
          return "missing-reference";
        }
        if (
          instance.quantity.current === 0 &&
          !inventorySourceLeases.has(
            `${materialRefKey(document.material)}\u0000${instanceId}\u0000${instance.ordinal}`
          ) &&
          !activeItemSources.has(
            `${materialRefKey(document.material)}\u0000${instanceId}\u0000${instance.ordinal}`
          )
        ) {
          return "missing-reference";
        }
      }
    }
    for (const [entityId, entity] of Object.entries(document.state.entities)) {
      const holder = { material: document.material, entityId } satisfies EntityRef;
      const linkedInventory =
        entity.kind === "object" && entity.template.kind === "inventory-item"
          ? documentFor(world, entity.template.owner)
          : null;
      if (
        (entity.ownerOccurrence !== null &&
          !holderMatchesOccurrence(world, entity.ownerOccurrence, holder)) ||
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
    }
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      if (!occurrenceLiveEntities(occurrence).every((ref) => entityPresent(world, ref))) {
        return "missing-reference";
      }
      if (!occurrenceClocksResolve(world, occurrence)) return "invalid-clock";
      if (!occurrenceCreatureSemanticsValid(world, occurrence)) {
        return "missing-reference";
      }
      const itemSource = inventoryItemSource(document.state, occurrenceId);
      if (itemSource && !inventorySourceResolves(world, itemSource)) {
        return "missing-reference";
      }
      if (occurrence.kind === "concentration") {
        const targetKey = entityRefKey(occurrence.target);
        if (concentrations.has(targetKey)) return "duplicate-exclusive-state";
        concentrations.add(targetKey);
      } else if (occurrence.kind === "polymorph-form") {
        const targetKey = entityRefKey(occurrence.target);
        if (polymorphs.has(targetKey)) return "duplicate-exclusive-state";
        polymorphs.add(targetKey);
      }
    }
    const encounter = document.state.encounter;
    if (
      encounter &&
      !Object.values(encounter.participants).every((participant) =>
        creaturePresent(world, participant.combatant)
      )
    ) {
      return "missing-reference";
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

function validateWorldInvariants(
  world: MechanicsWorld,
  inventorySourceLeases: ReadonlySet<string> = new Set()
): MechanicsWorldInvalidReason | null {
  return validateReferences(world, inventorySourceLeases) ?? validateLeases(world);
}

/** Parse exact physical documents without assuming their causal closure already ran. */
function parseMechanicsWorldStructure(value: unknown): MechanicsWorldParseResult {
  if (
    !isExactRecord(value, ["scope", "documents"]) ||
    !isMaterialRef(value.scope) ||
    !isDenseArray(value.documents) ||
    value.documents.length === 0
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
  return { ok: true, value: freezeDeep(world) };
}

/** Parse and prove a complete, causally closed mechanics transaction snapshot. */
export function parseMechanicsWorld(value: unknown): MechanicsWorldParseResult {
  const structured = parseMechanicsWorldStructure(value);
  if (!structured.ok) return structured;
  const world = structured.value;
  const invalid = validateWorldInvariants(world);
  return invalid ? { ok: false, reason: invalid } : { ok: true, value: world };
}

export function isMechanicsWorld(value: unknown): value is MechanicsWorld {
  return parseMechanicsWorld(value).ok;
}

function rejected(
  world: Readonly<MechanicsWorld>,
  reason: MechanicsWorldSimulationRejection
): MechanicsWorldSimulationResult {
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
export function isEndRuleDue(rule: EndRule, boundary: EndRule): boolean {
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
  if (rule.kind === "rest-completed" && boundary.kind === "rest-completed") {
    return (
      sameClock(rule.clock, boundary.clock) &&
      sameEntity(rule.combatant, boundary.combatant) &&
      rule.rest === boundary.rest
    );
  }
  if (rule.kind === "day-phase" && boundary.kind === "day-phase") {
    return sameClock(rule.clock, boundary.clock) && rule.phase === boundary.phase;
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
    if (!clockResolves(world, boundary.clock, "encounter")) return false;
    if (boundary.kind === "turn-boundary") {
      return (
        creaturePresent(world, boundary.combatant) &&
        Number.isSafeInteger(boundary.round) &&
        boundary.round > 0
      );
    }
    return true;
  }
  if (boundary.kind === "rest-completed") {
    return (
      clockResolves(world, boundary.clock, "timeline") &&
      creaturePresent(world, boundary.combatant)
    );
  }
  return clockResolves(world, boundary.clock, "timeline");
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

function temporaryHitPointsFor(world: MutableWorld, target: EntityRef): number | null {
  return creatureVitalsFor(world, target)?.hitPoints.temporary.current ?? null;
}

function creatureVitalsFor(
  world: Pick<MechanicsWorld, "documents"> | MutableWorld,
  target: EntityRef
): CreatureVitals | null {
  const document = documentFor(world, target.material);
  if (!document) return null;
  if (target.entityId === "self") {
    return document.kind === "character" ? document.state.vitals : null;
  }
  const entity = document.state.entities[target.entityId];
  return entity?.kind === "creature" ? entity.vitals : null;
}

function conditionInstancesFor(
  world: MutableWorld,
  target: EntityRef
): ConditionInstance[] {
  const targetKey = entityRefKey(target);
  const instances: ConditionInstance[] = [];
  for (const document of world.documents) {
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      if (
        occurrence.kind === "condition" &&
        entityRefKey(occurrence.target) === targetKey
      ) {
        instances.push({
          conditionId: occurrence.conditionId,
          identity: {
            kind: "occurrence",
            ref: { material: document.material, occurrenceId },
          },
          source: null,
        });
      }
    }
  }
  return instances;
}

function breaksConcentration(world: MutableWorld, target: EntityRef): boolean {
  const vitals = creatureVitalsFor(world, target);
  return (
    vitals !== null &&
    projectCreatureConditions(conditionInstancesFor(world, target), target, vitals)
      ?.breaksConcentration === true
  );
}

function withoutMissingTemporaryHitPointSource(
  world: MutableWorld,
  vitals: CreatureVitals
): CreatureVitals | null {
  const temporary = vitals.hitPoints.temporary;
  const reference = temporary.sourceOccurrence;
  if (reference === null || occurrenceFor(world, reference) !== null) return null;
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

function normalizeEncounter(world: MutableWorld, encounter: EncounterState): boolean {
  let changed = false;
  const priorOrder = [...encounter.order];
  const priorCurrentId = encounter.currentCombatantId;
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
    };
    const localTimeline = {
      clock: timelineClock(document),
      elapsedSeconds: document.state.timeline.elapsedSeconds,
    };
    rebaseTimelineRules(document.state, sharedTimeline, localTimeline);
    document.state.clockBinding = { timeline: localTimeline.clock, encounter: null };
    changed = true;
  }
  return changed;
}

function cleanEndedMaterial(
  world: MutableWorld,
  inventorySourceLeases: ReadonlySet<string>
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
            occurrenceFor(world, instance.ownerOccurrence) === null
          ) {
            const sourceKey = `${materialRefKey(document.material)}\u0000${instanceId}\u0000${instance.ordinal}`;
            if (instance.quantity.current === 0 && activeItemSources.has(sourceKey)) {
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
              `${materialRefKey(document.material)}\u0000${instanceId}\u0000${instance.ordinal}`
            ) &&
            !activeItemSources.has(
              `${materialRefKey(document.material)}\u0000${instanceId}\u0000${instance.ordinal}`
            )
          ) {
            Reflect.deleteProperty(document.state.inventory, instanceId);
            changed = true;
          }
        }
        for (const instance of Object.values(document.state.inventory)) {
          if (
            instance.enchantInstanceId !== null &&
            !document.state.inventory[instance.enchantInstanceId]
          ) {
            instance.enchantInstanceId = null;
            changed = true;
          }
        }
      }
      for (const [entityId, entity] of Object.entries(document.state.entities)) {
        if (
          entity.ownerOccurrence !== null &&
          occurrenceFor(world, entity.ownerOccurrence) === null
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
        normalizeEncounter(world, document.state.encounter)
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
  requireCausalClosure: boolean
): MechanicsWorldSimulationResult {
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
    validateWorldInvariants(parsed.value, inventorySourceLeases)
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
  inventorySourceLeases: ReadonlySet<string> = new Set()
): MechanicsWorldSimulationResult {
  return projectWorld(original, candidate, inventorySourceLeases, true);
}

function projectBoundaryMutation(
  original: Readonly<MechanicsWorld>,
  candidate: MutableWorld
): MechanicsWorldSimulationResult {
  return projectWorld(original, candidate, new Set(), false);
}

function parseClosureRequest(
  world: MechanicsWorld,
  request: MechanicsClosureRequest
): {
  boundaries: ObservedMechanicsBoundary[];
  inventorySourceLeases: Set<string>;
  removals: Map<string, Set<string>>;
} | null {
  if (
    !isExactRecord(request, ["boundaries", "inventorySourceLeases", "removals"]) ||
    !isDenseArray(request.boundaries) ||
    !request.boundaries.every((boundary) =>
      observedBoundaryValid(world, boundary as ObservedMechanicsBoundary)
    ) ||
    !isDenseArray(request.inventorySourceLeases) ||
    !isDenseArray(request.removals)
  ) {
    return null;
  }
  const inventorySourceLeases = new Set<string>();
  for (const entry of request.inventorySourceLeases) {
    if (
      !isExactRecord(entry, ["material", "instanceId", "instanceOrdinal"]) ||
      !isMaterialRef(entry.material) ||
      entry.material.kind !== "character-play" ||
      !isId(entry.instanceId) ||
      !isCounter(entry.instanceOrdinal) ||
      entry.instanceOrdinal === 0
    ) {
      return null;
    }
    const document = documentFor(world, entry.material);
    if (
      document?.kind !== "character" ||
      document.state.inventory[entry.instanceId]?.ordinal !== entry.instanceOrdinal
    ) {
      return null;
    }
    const key = `${materialRefKey(entry.material)}\u0000${entry.instanceId}\u0000${entry.instanceOrdinal}`;
    if (inventorySourceLeases.has(key)) return null;
    inventorySourceLeases.add(key);
  }
  const removals = new Map<string, Set<string>>();
  for (const entry of request.removals) {
    if (
      !isExactRecord(entry, ["material", "occurrenceIds"]) ||
      !isMaterialRef(entry.material) ||
      !documentFor(world, entry.material) ||
      !isDenseArray(entry.occurrenceIds) ||
      !entry.occurrenceIds.every(isId)
    ) {
      return null;
    }
    const ids = new Set(entry.occurrenceIds);
    if (ids.size !== entry.occurrenceIds.length) return null;
    const key = materialRefKey(entry.material);
    if (removals.has(key)) return null;
    removals.set(key, ids);
  }
  return {
    boundaries: [...(request.boundaries as ObservedMechanicsBoundary[])],
    inventorySourceLeases,
    removals,
  };
}

/**
 * Parse an intermediate transaction snapshot while exact inventory tombstones
 * are leased by the causal authority that is still executing. Such a snapshot
 * must never escape as persisted state.
 */
export function parseMechanicsWorldTransactionState(
  value: unknown,
  inventorySourceLeases: readonly InventorySourceLease[] = []
): MechanicsWorldParseResult {
  const structured = parseMechanicsWorldStructure(value);
  if (!structured.ok) return structured;
  const closure = parseClosureRequest(structured.value, {
    boundaries: [],
    inventorySourceLeases,
    removals: [],
  });
  if (!closure) return { ok: false, reason: "invalid-lease" };
  const invalid = validateWorldInvariants(
    structured.value,
    closure.inventorySourceLeases
  );
  return invalid ? { ok: false, reason: invalid } : { ok: true, value: structured.value };
}

function occurrenceRefKey(reference: OccurrenceRef): string {
  return `${materialRefKey(reference.material)}\u0000${reference.occurrenceId}`;
}

function causeKey(cause: MechanicsEndCause): string {
  return canonicalJson(cause);
}

function causesForOccurrence(
  basisWorld: Readonly<MechanicsWorld>,
  projectedWorld: Readonly<MechanicsWorld>,
  material: MaterialRef,
  occurrenceId: string,
  occurrence: MechanicOccurrence,
  closure: NonNullable<ReturnType<typeof parseClosureRequest>>,
  ended: ReadonlySet<string>
): MechanicsEndCause[] {
  const causes: MechanicsEndCause[] = [];
  if (closure.removals.get(materialRefKey(material))?.has(occurrenceId)) {
    causes.push({ kind: "requested" });
  }
  for (const rule of occurrence.endRules) {
    for (const boundary of closure.boundaries) {
      if (isEndRuleDue(rule, boundary)) {
        causes.push({ boundary: structuredClone(boundary), kind: "explicit-boundary" });
      }
    }
  }
  if (
    occurrence.kind === "concentration" &&
    breaksConcentration(basisWorld as MutableWorld, occurrence.target)
  ) {
    causes.push({ kind: "concentration-broken" });
  }
  for (const dependencyId of occurrenceDependencyIds(occurrence)) {
    const dependency = { material, occurrenceId: dependencyId } satisfies OccurrenceRef;
    const dependencyDocument = documentFor(basisWorld, material);
    if (
      !dependencyDocument?.state.occurrences[dependencyId] ||
      ended.has(occurrenceRefKey(dependency))
    ) {
      causes.push({ dependency: structuredClone(dependency), kind: "dependency-ended" });
    }
  }
  if (
    occurrence.endRules.some((rule) => rule.kind === "temporary-hp-empty") &&
    isEffectOccurrence(occurrence) &&
    temporaryHitPointsFor(projectedWorld as MutableWorld, occurrence.target) === 0
  ) {
    causes.push({ kind: "temporary-hit-points-empty" });
  }
  for (const entity of occurrenceLiveEntities(occurrence)) {
    if (!entityPresent(projectedWorld, entity)) {
      causes.push({ entity: structuredClone(entity), kind: "live-entity-missing" });
    }
  }
  return [...new Map(causes.map((cause) => [causeKey(cause), cause])).values()].sort(
    (left, right) => causeKey(left).localeCompare(causeKey(right))
  );
}

function candidateKey(candidate: MechanicsEndCandidate): string {
  return occurrenceRefKey(candidate.occurrence);
}

function discoverCandidates(
  world: Readonly<MechanicsWorld>,
  closure: NonNullable<ReturnType<typeof parseClosureRequest>>
): readonly MechanicsEndCandidate[] {
  const ended = new Set<string>();
  const causes = new Map<string, MechanicsEndCause[]>();
  let changed = true;
  while (changed) {
    changed = false;
    const projectedWorld = mutableWorld(world);
    for (const key of ended) {
      for (const document of projectedWorld.documents) {
        for (const occurrenceId of Object.keys(document.state.occurrences)) {
          if (occurrenceRefKey({ material: document.material, occurrenceId }) === key) {
            Reflect.deleteProperty(document.state.occurrences, occurrenceId);
          }
        }
      }
    }
    cleanEndedMaterial(projectedWorld, closure.inventorySourceLeases);
    for (const document of world.documents) {
      for (const [occurrenceId, occurrence] of Object.entries(
        document.state.occurrences
      )) {
        const occurrenceRef = { material: document.material, occurrenceId };
        const key = occurrenceRefKey(occurrenceRef);
        const found = causesForOccurrence(
          world,
          projectedWorld,
          document.material,
          occurrenceId,
          occurrence,
          closure,
          ended
        );
        if (found.length === 0) continue;
        if (!ended.has(key)) {
          ended.add(key);
          changed = true;
        }
        causes.set(key, found);
      }
    }
  }

  const projectedWorld = mutableWorld(world);
  for (const document of projectedWorld.documents) {
    for (const occurrenceId of Object.keys(document.state.occurrences)) {
      if (ended.has(occurrenceRefKey({ material: document.material, occurrenceId }))) {
        Reflect.deleteProperty(document.state.occurrences, occurrenceId);
      }
    }
  }
  cleanEndedMaterial(projectedWorld, closure.inventorySourceLeases);
  for (const document of world.documents) {
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      const key = occurrenceRefKey({ material: document.material, occurrenceId });
      if (!ended.has(key)) continue;
      causes.set(
        key,
        causesForOccurrence(
          world,
          projectedWorld,
          document.material,
          occurrenceId,
          occurrence,
          closure,
          ended
        )
      );
    }
  }

  const candidates = [...ended].map((key) => {
    for (const document of world.documents) {
      for (const occurrenceId of Object.keys(document.state.occurrences)) {
        const occurrence = { material: document.material, occurrenceId };
        if (occurrenceRefKey(occurrence) === key) {
          return { causes: causes.get(key) ?? [], occurrence };
        }
      }
    }
    throw new TypeError("Discovered occurrence disappeared from immutable world");
  });
  const dependentDepth = (candidate: MechanicsEndCandidate): number => {
    const occurrence = occurrenceFor(world, candidate.occurrence);
    if (!occurrence) return 0;
    return occurrenceDependencyIds(occurrence).reduce((depth, dependencyId) => {
      const dependencyKey = occurrenceRefKey({
        material: candidate.occurrence.material,
        occurrenceId: dependencyId,
      });
      const dependency = candidates.find(
        (entry) => candidateKey(entry) === dependencyKey
      );
      return dependency ? Math.max(depth, dependentDepth(dependency) + 1) : depth;
    }, 0);
  };
  candidates.sort(
    (left, right) =>
      dependentDepth(right) - dependentDepth(left) ||
      candidateKey(left).localeCompare(candidateKey(right))
  );
  return freezeDeep(structuredClone(candidates));
}

function normalizedClosureRequest(
  request: MechanicsClosureRequest
): MechanicsClosureRequest {
  return {
    boundaries: request.boundaries ?? [],
    inventorySourceLeases: request.inventorySourceLeases ?? [],
    removals: request.removals ?? [],
  };
}

/** Discover the complete causal end wave without mutating or removing its sources. */
export function discoverMechanicsEndWave(
  value: Readonly<MechanicsWorld>,
  request: MechanicsClosureRequest = { boundaries: [], removals: [] }
): MechanicsEndDiscoveryResult {
  const parsed = parseMechanicsWorldStructure(value);
  if (!parsed.ok) return { reason: "invalid-world", status: "rejected", world: value };
  const closure = parseClosureRequest(parsed.value, normalizedClosureRequest(request));
  if (!closure) {
    return { reason: "invalid-boundary", status: "rejected", world: parsed.value };
  }
  try {
    return {
      candidates: discoverCandidates(parsed.value, closure),
      status: "discovered",
      world: parsed.value,
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return { reason: "overflow", status: "rejected", world: parsed.value };
    }
    throw error;
  }
}

function candidatesEqual(
  left: readonly MechanicsEndCandidate[],
  right: readonly MechanicsEndCandidate[]
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function isPlainDataTree(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== "object") return true;
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

function isOccurrenceRefValue(value: unknown): value is OccurrenceRef {
  return (
    isExactRecord(value, ["material", "occurrenceId"]) &&
    isMaterialRef(value.material) &&
    isId(value.occurrenceId)
  );
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
    return isExactRecord(value, ["kind", "boundary"]);
  }
  if (kind === "dependency-ended") {
    return (
      isExactRecord(value, ["kind", "dependency"]) &&
      isOccurrenceRefValue(value.dependency)
    );
  }
  return (
    kind === "live-entity-missing" &&
    isExactRecord(value, ["kind", "entity"]) &&
    isExactRecord(value.entity, ["material", "entityId"]) &&
    isMaterialRef(value.entity.material) &&
    isId(value.entity.entityId)
  );
}

function isEndCandidate(value: unknown): value is MechanicsEndCandidate {
  if (
    !isPlainDataTree(value) ||
    !isExactRecord(value, ["occurrence", "causes"]) ||
    !isOccurrenceRefValue(value.occurrence) ||
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

/** Apply one exact previously discovered wave, then perform material cleanup. */
export function finalizeMechanicsEndWave(
  value: Readonly<MechanicsWorld>,
  request: MechanicsClosureRequest,
  orderedCandidates: readonly MechanicsEndCandidate[]
): MechanicsWorldSimulationResult {
  const parsed = parseMechanicsWorldStructure(value);
  if (!parsed.ok) return rejected(value, "invalid-world");
  const closure = parseClosureRequest(parsed.value, normalizedClosureRequest(request));
  if (
    !closure ||
    !isDenseArray(orderedCandidates) ||
    !orderedCandidates.every(isEndCandidate)
  ) {
    return rejected(parsed.value, "invalid-end-wave");
  }
  const expected = discoverCandidates(parsed.value, closure);
  if (!candidatesEqual(expected, orderedCandidates)) {
    return rejected(parsed.value, "invalid-end-wave");
  }
  const candidate = mutableWorld(parsed.value);
  for (const ending of expected) {
    const document = documentFor(candidate, ending.occurrence.material);
    if (!document) return rejected(parsed.value, "invalid-end-wave");
    Reflect.deleteProperty(document.state.occurrences, ending.occurrence.occurrenceId);
  }
  try {
    cleanEndedMaterial(candidate, closure.inventorySourceLeases);
  } catch (error) {
    if (error instanceof RangeError) return rejected(parsed.value, "overflow");
    throw error;
  }
  return finalize(parsed.value, candidate, closure.inventorySourceLeases);
}

/** Deterministic fixed-point removal across every loaded mechanics document. */
export function closeMechanicsWorld(
  value: Readonly<MechanicsWorld>,
  request: MechanicsClosureRequest = { boundaries: [], removals: [] }
): MechanicsWorldSimulationResult {
  const discovery = discoverMechanicsEndWave(value, request);
  if (discovery.status === "rejected") {
    return rejected(discovery.world, discovery.reason);
  }
  return finalizeMechanicsEndWave(discovery.world, request, discovery.candidates);
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
  cleanEndedMaterial(candidate, new Set());
  return finalize(structured.value, candidate);
}

function resolveBoundaryCheckpoint(
  world: Readonly<MechanicsWorld>,
  request: MechanicsClosureRequest,
  ordinal: number,
  resolveClosure: MechanicsClosureResolver
): MechanicsWorldSimulationResult {
  const discovery = discoverMechanicsEndWave(world, request);
  if (discovery.status === "rejected") {
    return rejected(discovery.world, discovery.reason);
  }
  const resolution = resolveClosure({
    candidates: discovery.candidates,
    ordinal,
    request: normalizedClosureRequest(request),
    world: discovery.world,
  });
  if (resolution.status === "rejected") {
    return rejected(discovery.world, resolution.reason);
  }
  const parsed = parseMechanicsWorld(resolution.world);
  if (!parsed.ok) return rejected(discovery.world, "invalid-transition");
  if (
    discovery.candidates.some(
      (candidate) => occurrenceFor(parsed.value, candidate.occurrence) !== null
    )
  ) {
    return rejected(discovery.world, "invalid-end-wave");
  }
  return finalize(discovery.world, mutableWorld(parsed.value));
}

function finishBoundary(
  original: Readonly<MechanicsWorld>,
  current: Readonly<MechanicsWorld>
): MechanicsWorldSimulationResult {
  return finalize(original, mutableWorld(current));
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

/**
 * Sole causal entry for table-clock and encounter boundaries. Checkpoints are
 * resolved while every ending source and referenced clock remains readable.
 */
export function applyMechanicsBoundary(
  value: Readonly<MechanicsWorld>,
  command: Readonly<MechanicsBoundaryCommand>,
  resolveClosure: MechanicsClosureResolver
): MechanicsWorldSimulationResult {
  const parsed = parseMechanicsWorld(value);
  if (!parsed.ok) return rejected(value, "invalid-world");
  if (command.kind === "complete-rest") {
    return resolveBoundaryCheckpoint(
      parsed.value,
      { boundaries: [{ kind: "rest-completed", ...command.input }], removals: [] },
      0,
      resolveClosure
    );
  }
  if (command.kind === "observe-day-phase") {
    return resolveBoundaryCheckpoint(
      parsed.value,
      { boundaries: [{ kind: "day-phase", ...command.input }], removals: [] },
      0,
      resolveClosure
    );
  }
  if (command.kind === "advance-time") {
    if (!isCounter(command.elapsedSeconds) || command.elapsedSeconds === 0) {
      return rejected(parsed.value, "invalid-transition");
    }
    if (!clockResolves(parsed.value, command.clock, "timeline")) {
      return rejected(parsed.value, "clock-conflict");
    }
    const candidate = mutableWorld(parsed.value);
    const document = documentFor(candidate, command.clock.material);
    if (!document) return rejected(parsed.value, "missing-document");
    if (
      document.state.timeline.elapsedSeconds >
      Number.MAX_SAFE_INTEGER - command.elapsedSeconds
    ) {
      return rejected(parsed.value, "overflow");
    }
    document.state.timeline.elapsedSeconds += command.elapsedSeconds;
    const projected = projectBoundaryMutation(parsed.value, candidate);
    if (projected.status === "rejected") return projected;
    const resolved = resolveBoundaryCheckpoint(
      projected.world,
      {
        boundaries: [
          {
            clock: command.clock,
            elapsedSeconds: document.state.timeline.elapsedSeconds,
            kind: "time-reached",
          },
        ],
        removals: [],
      },
      0,
      resolveClosure
    );
    return resolved.status === "rejected"
      ? resolved
      : finishBoundary(parsed.value, resolved.world);
  }
  if (command.kind === "complete-turn") {
    const document = documentFor(parsed.value, command.material);
    const end = document ? currentTurnBoundary(document, "end") : null;
    if (!document || !end) return rejected(parsed.value, "encounter-conflict");
    const priorEncounter = document.state.encounter;
    if (!priorEncounter || priorEncounter.currentCombatantId === null) {
      return rejected(parsed.value, "encounter-conflict");
    }
    const priorOrder = [...priorEncounter.order];
    const priorCurrentId = priorEncounter.currentCombatantId;
    const priorTimelineSeconds = document.state.timeline.elapsedSeconds;
    const checkpoint = resolveBoundaryCheckpoint(
      parsed.value,
      { boundaries: [end], removals: [] },
      0,
      resolveClosure
    );
    if (checkpoint.status === "rejected") return checkpoint;
    const live = documentFor(checkpoint.world, command.material);
    const encounter = live?.state.encounter;
    if (
      !live ||
      !encounter ||
      encounter.epoch !== priorEncounter.epoch ||
      encounter.round !== priorEncounter.round ||
      live.state.timeline.elapsedSeconds !== priorTimelineSeconds
    ) {
      return rejected(checkpoint.world, "invalid-transition");
    }
    if (encounter.phase === "initiative") {
      return finishBoundary(parsed.value, checkpoint.world);
    }
    let world = checkpoint.world;
    let ordinal = 1;
    let scanOffset = 1;
    let roundAdvanced = false;
    let expectedRound = encounter.round;
    let expectedTimelineSeconds = priorTimelineSeconds;
    let lastSelectedId: string | null = null;

    while (scanOffset <= priorOrder.length) {
      const beforeStart = documentFor(world, command.material);
      const beforeStartEncounter = beforeStart?.state.encounter;
      if (
        !beforeStart ||
        !beforeStartEncounter ||
        beforeStartEncounter.epoch !== priorEncounter.epoch ||
        beforeStartEncounter.round !== expectedRound ||
        beforeStart.state.timeline.elapsedSeconds !== expectedTimelineSeconds
      ) {
        return rejected(world, "invalid-transition");
      }
      if (beforeStartEncounter.phase === "initiative") {
        return finishBoundary(parsed.value, world);
      }

      const nextTurn = nextSurvivingParticipant(
        priorOrder,
        priorCurrentId,
        beforeStartEncounter,
        scanOffset
      );
      if (!nextTurn) return rejected(world, "encounter-conflict");

      if (nextTurn.wraps && !roundAdvanced) {
        if (
          expectedRound === Number.MAX_SAFE_INTEGER ||
          expectedTimelineSeconds > Number.MAX_SAFE_INTEGER - 6
        ) {
          return rejected(world, "overflow");
        }
        const wrapCandidate = mutableWorld(world);
        const mutableWrap = documentFor(wrapCandidate, command.material);
        const wrapEncounter = mutableWrap?.state.encounter;
        if (!mutableWrap || !wrapEncounter) {
          return rejected(world, "encounter-conflict");
        }
        const prior = wrapEncounter.participants[priorCurrentId];
        if (prior) prior.economy = { ...prior.economy, phase: "between-turns" };
        if (lastSelectedId !== null) {
          const lastSelected = wrapEncounter.participants[lastSelectedId];
          if (lastSelected) {
            lastSelected.economy = {
              ...lastSelected.economy,
              phase: "between-turns",
            };
          }
        }
        wrapEncounter.round += 1;
        mutableWrap.state.timeline.elapsedSeconds += 6;
        expectedRound = wrapEncounter.round;
        expectedTimelineSeconds = mutableWrap.state.timeline.elapsedSeconds;
        const advanced = projectBoundaryMutation(world, wrapCandidate);
        if (advanced.status === "rejected") return advanced;
        const timed = resolveBoundaryCheckpoint(
          advanced.world,
          {
            boundaries: [
              {
                clock: timelineClock(mutableWrap),
                elapsedSeconds: expectedTimelineSeconds,
                kind: "time-reached",
              },
            ],
            removals: [],
          },
          ordinal,
          resolveClosure
        );
        if (timed.status === "rejected") return timed;
        world = timed.world;
        ordinal += 1;
        roundAdvanced = true;
        continue;
      }

      const startCandidate = mutableWorld(world);
      const mutableStart = documentFor(startCandidate, command.material);
      const startEncounter = mutableStart?.state.encounter;
      const next = startEncounter?.participants[nextTurn.participantId];
      if (!startEncounter || !next) return rejected(world, "encounter-conflict");
      const prior = startEncounter.participants[priorCurrentId];
      if (prior) prior.economy = { ...prior.economy, phase: "between-turns" };
      if (lastSelectedId !== null) {
        const lastSelected = startEncounter.participants[lastSelectedId];
        if (lastSelected) {
          lastSelected.economy = {
            ...lastSelected.economy,
            phase: "between-turns",
          };
        }
      }
      startEncounter.currentCombatantId = nextTurn.participantId;
      next.economy = ownTurnEconomy(
        startEncounter.epoch,
        startEncounter.round,
        next.ordinal
      );
      const started = finalize(world, startCandidate);
      if (started.status === "rejected") return started;
      const startedDocument = documentFor(started.world, command.material);
      const start = startedDocument
        ? currentTurnBoundary(startedDocument, "start")
        : null;
      if (!start) return rejected(started.world, "encounter-conflict");
      const resolvedStart = resolveBoundaryCheckpoint(
        started.world,
        { boundaries: [start], removals: [] },
        ordinal,
        resolveClosure
      );
      if (resolvedStart.status === "rejected") return resolvedStart;
      ordinal += 1;

      const afterStart = documentFor(resolvedStart.world, command.material);
      const afterStartEncounter = afterStart?.state.encounter;
      if (
        !afterStart ||
        !afterStartEncounter ||
        afterStartEncounter.epoch !== priorEncounter.epoch ||
        afterStartEncounter.round !== expectedRound ||
        afterStart.state.timeline.elapsedSeconds !== expectedTimelineSeconds
      ) {
        return rejected(resolvedStart.world, "invalid-transition");
      }
      if (afterStartEncounter.phase === "initiative") {
        return finishBoundary(parsed.value, resolvedStart.world);
      }
      const selectedSurvives =
        afterStartEncounter.order.includes(nextTurn.participantId) &&
        afterStartEncounter.participants[nextTurn.participantId] !== undefined;
      if (selectedSurvives) {
        if (afterStartEncounter.currentCombatantId !== nextTurn.participantId) {
          return rejected(resolvedStart.world, "invalid-transition");
        }
        return finishBoundary(parsed.value, resolvedStart.world);
      }

      const skippedCandidate = mutableWorld(resolvedStart.world);
      const skipped = documentFor(skippedCandidate, command.material)?.state.encounter
        ?.participants[nextTurn.participantId];
      if (skipped) {
        skipped.economy = { ...skipped.economy, phase: "between-turns" };
      }
      const cleaned = projectBoundaryMutation(resolvedStart.world, skippedCandidate);
      if (cleaned.status === "rejected") return cleaned;
      world = cleaned.world;
      lastSelectedId = nextTurn.participantId;
      scanOffset = nextTurn.offset + 1;
    }
    return rejected(world, "encounter-conflict");
  }
  if (command.kind === "start-encounter") {
    const document = documentFor(parsed.value, command.material);
    if (!document || document.state.encounter !== null) {
      return rejected(parsed.value, "encounter-conflict");
    }
    if (document.kind === "character") {
      if (
        document.state.clockBinding.encounter !== null ||
        !sameMaterial(document.state.clockBinding.timeline.material, command.material)
      ) {
        return rejected(parsed.value, "encounter-conflict");
      }
      const candidate = mutableWorld(parsed.value);
      const mutable = documentFor(candidate, command.material);
      if (!mutable || mutable.kind !== "character") {
        return rejected(parsed.value, "missing-document");
      }
      const clock = startEncounterOnDocument(mutable, command.seed);
      if (!clock) return rejected(parsed.value, "encounter-conflict");
      mutable.state.clockBinding.encounter = clock;
      const started = finalize(parsed.value, candidate);
      if (started.status === "rejected") return started;
      const startedDocument = documentFor(started.world, command.material);
      const boundary = startedDocument
        ? currentTurnBoundary(startedDocument, "start")
        : null;
      if (!boundary) return started;
      const resolved = resolveBoundaryCheckpoint(
        started.world,
        { boundaries: [boundary], removals: [] },
        0,
        resolveClosure
      );
      return resolved.status === "rejected"
        ? resolved
        : finishBoundary(parsed.value, resolved.world);
    }

    let current = parsed.value;
    let ordinal = 0;
    const prospectiveLeases = leasedCharacterMaterials(command.seed);
    for (const characterMaterial of prospectiveLeases) {
      const character = documentFor(current, characterMaterial);
      if (!character || character.kind !== "character") {
        return rejected(current, "missing-document");
      }
      if (character.state.clockBinding.timeline.material.kind === "shared-combat") {
        return rejected(current, "encounter-conflict");
      }
      const localClock = encounterClock(character);
      if (!localClock) continue;
      const ended = resolveBoundaryCheckpoint(
        current,
        { boundaries: [{ clock: localClock, kind: "combat-end" }], removals: [] },
        ordinal,
        resolveClosure
      );
      if (ended.status === "rejected") return ended;
      ordinal += 1;
      const after = documentFor(ended.world, characterMaterial);
      if (
        !after ||
        after.kind !== "character" ||
        !after.state.encounter ||
        after.state.encounter.epoch !== localClock.epoch
      ) {
        return rejected(ended.world, "invalid-transition");
      }
      const clearedCandidate = mutableWorld(ended.world);
      const cleared = documentFor(clearedCandidate, characterMaterial);
      if (!cleared || cleared.kind !== "character") {
        return rejected(ended.world, "missing-document");
      }
      cleared.state.encounter = null;
      cleared.state.clockBinding.encounter = null;
      const clearedResult = finalize(ended.world, clearedCandidate);
      if (clearedResult.status === "rejected") return clearedResult;
      current = clearedResult.world;
    }

    const candidate = mutableWorld(current);
    const mutableShared = documentFor(candidate, command.material);
    if (!mutableShared || mutableShared.kind !== "shared") {
      return rejected(current, "missing-document");
    }
    const sharedEncounterClock = startEncounterOnDocument(mutableShared, command.seed);
    if (!sharedEncounterClock || !mutableShared.state.encounter) {
      return rejected(current, "encounter-conflict");
    }
    normalizeEncounter(candidate, mutableShared.state.encounter);
    if (
      mutableShared.state.encounter.phase === "turns" &&
      mutableShared.state.encounter.currentCombatantId !== null
    ) {
      const currentParticipant =
        mutableShared.state.encounter.participants[
          mutableShared.state.encounter.currentCombatantId
        ];
      if (!currentParticipant) return rejected(current, "encounter-conflict");
      currentParticipant.economy = ownTurnEconomy(
        mutableShared.state.encounter.epoch,
        mutableShared.state.encounter.round,
        currentParticipant.ordinal
      );
    }
    const sharedTimeline = {
      clock: timelineClock(mutableShared),
      elapsedSeconds: mutableShared.state.timeline.elapsedSeconds,
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
          return rejected(current, "encounter-conflict");
        }
        const sourceTimeline = {
          clock: timelineClock(character),
          elapsedSeconds: character.state.timeline.elapsedSeconds,
        };
        rebaseTimelineRules(character.state, sourceTimeline, sharedTimeline);
        character.state.clockBinding = {
          timeline: sharedTimeline.clock,
          encounter: sharedEncounterClock,
        };
      }
    } catch (error) {
      if (error instanceof RangeError) return rejected(current, "overflow");
      throw error;
    }
    const started = finalize(current, candidate);
    if (started.status === "rejected") return started;
    const startedDocument = documentFor(started.world, command.material);
    const boundary = startedDocument
      ? currentTurnBoundary(startedDocument, "start")
      : null;
    if (!boundary) return finishBoundary(parsed.value, started.world);
    const resolved = resolveBoundaryCheckpoint(
      started.world,
      { boundaries: [boundary], removals: [] },
      ordinal,
      resolveClosure
    );
    return resolved.status === "rejected"
      ? resolved
      : finishBoundary(parsed.value, resolved.world);
  }
  const document = documentFor(parsed.value, command.material);
  const clock = document ? encounterClock(document) : null;
  if (!document || !clock) return rejected(parsed.value, "encounter-conflict");
  const ended = resolveBoundaryCheckpoint(
    parsed.value,
    { boundaries: [{ clock, kind: "combat-end" }], removals: [] },
    0,
    resolveClosure
  );
  if (ended.status === "rejected") return ended;
  const after = documentFor(ended.world, command.material);
  if (!after || !after.state.encounter || after.state.encounter.epoch !== clock.epoch) {
    return rejected(ended.world, "invalid-transition");
  }
  const candidate = mutableWorld(ended.world);
  const mutable = documentFor(candidate, command.material);
  if (!mutable) return rejected(ended.world, "missing-document");
  if (mutable.kind === "character") {
    mutable.state.encounter = null;
    mutable.state.clockBinding.encounter = null;
  } else {
    const sharedTimeline = {
      clock: timelineClock(mutable),
      elapsedSeconds: mutable.state.timeline.elapsedSeconds,
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
        };
        rebaseTimelineRules(character.state, sharedTimeline, localTimeline);
        character.state.clockBinding = {
          timeline: localTimeline.clock,
          encounter: null,
        };
      }
    } catch (error) {
      if (error instanceof RangeError) return rejected(ended.world, "overflow");
      throw error;
    }
  }
  const cleared = finalize(ended.world, candidate);
  return cleared.status === "rejected"
    ? cleared
    : finishBoundary(parsed.value, cleared.world);
}

function encounterClock(document: MechanicsDocument | MutableDocument): ClockRef | null {
  return document.state.encounter
    ? { material: document.material, epoch: document.state.encounter.epoch }
    : null;
}

function timelineClock(document: MechanicsDocument | MutableDocument): ClockRef {
  return { material: document.material, epoch: document.state.timeline.epoch };
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
    return structuredClone({ epoch, ...seed, participants });
  } catch {
    return null;
  }
}

function rebaseTimelineRules(
  state: CharacterMaterialState,
  source: { clock: ClockRef; elapsedSeconds: number },
  target: { clock: ClockRef; elapsedSeconds: number }
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
      if (rule.kind !== "time-reached") return { ...rule, clock: target.clock };
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
  encounter: Pick<EncounterState, "participants">
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
    materialRefKey(left).localeCompare(materialRefKey(right))
  );
}
