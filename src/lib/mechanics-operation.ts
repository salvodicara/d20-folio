/** Pure low-level kernel for ordered mechanics-world operations. */

import {
  conformActionFactGuard,
  entityRefKey,
  journalActorRefKey,
  materialRefKey,
} from "@/lib/action-journal";
import {
  canonicalFingerprint,
  canonicalJson,
  conformCanonicalFingerprint,
  type CanonicalFingerprint,
} from "@/lib/canonical-fingerprint";
import { gainExhaustion, removeExhaustion } from "@/lib/condition";
import { projectResolvedEntityConditions } from "@/lib/condition-projection";
import { conformDamageResolution } from "@/lib/damage";
import { conformDiceObservation } from "@/lib/dice-formula";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { conformIntegerBindings } from "@/lib/integer-expression";
import {
  insertResolvedMaterialResource,
  locateResolvedMaterialResource,
  removeResolvedMaterialResource,
  replaceResolvedMaterialResource,
  resourceDefinitionFactGuard,
} from "@/lib/material-resource";
import {
  conformInventoryInstance,
  conformNewInventoryInstance,
  conformNewMaterialEntity,
} from "@/lib/material-state";
import {
  addOccurrence,
  addTransitionedProgramOccurrence,
  conformEndRule,
  conformNewMechanicOccurrence,
  conformProgramStepOccurrenceOrigin,
} from "@/lib/mechanic-occurrences";
import {
  MECHANIC_OCCURRENCE_SCHEMA_REFS,
  type MechanicOccurrenceSchemaRefTypes,
} from "@/lib/mechanic-occurrence-schema";
import { conformMechanicsInvocationRef } from "@/lib/mechanics-authority-ref";
import {
  conformMechanicsAuthoritySnapshot,
  resolveInstalledMechanicsCapability,
  resolveMechanicsProgramAuthorityReceipt,
} from "@/lib/mechanics-authority";
import {
  MATERIAL_REF_SCHEMA,
  conformEntityRef,
  conformInventoryGenerationRef,
  conformMaterialEntityId,
  conformOccurrenceGenerationRef,
  inventoryGenerationRefKey,
} from "@/lib/mechanics-reference-schema";
import {
  acceptMechanicsPendingFramePhaseTransition,
  conformMechanicsCausalState,
  projectMechanicsTransactionWorld,
  rebaseMechanicsCausalState,
  reconcileMechanicsEncounterMembership,
} from "@/lib/mechanics-world";
import { issueMechanicsTransactionProjection } from "@/lib/mechanics-transaction-projection";
import {
  conformResourceOperation,
  conformResourceRef,
  conformResourceSpec,
  initializeResource,
  reduceResource,
} from "@/lib/resources";
import {
  conformTurnEconomyClaimCommand,
  conformTurnEconomyProjection,
  reduceTurnEconomy,
  turnEconomyProjectionFactGuard,
} from "@/lib/turn-economy";
import {
  applyCreatureDamage,
  applyDeathSaveOutcome,
  applyObjectDamage,
  clearTemporaryHitPoints,
  grantTemporaryHitPoints,
  healCreature,
  killCreature,
  reduceCreatureToZeroHitPoints,
  repairObject,
  reviveCreature,
  stabilizeCreature,
  synchronizeCreatureHitPointMaximum,
  synchronizeObjectHitPointMaximum,
} from "@/lib/vitals";
import type { ActionFactGuard, JournalActorRef } from "@/types/action-journal";
import type { ExhaustionLevel } from "@/types/condition";
import type { EndRule, NewMechanicOccurrence } from "@/types/mechanic-occurrence";
import type {
  EntityRef,
  InventoryGenerationRef,
  MaterialEntityRef,
  MaterialRef,
  OccurrenceGenerationRef,
  OccurrenceRef,
} from "@/types/mechanics-reference";
import type {
  CreatureMaterialEntity,
  EncounterParticipant,
  InventoryInstance,
  MaterialEntity,
  ObjectMaterialEntity,
} from "@/types/material-state";
import {
  HIT_POINT_MAXIMUM_FACT_ADDRESS,
  MECHANICS_OPERATION_CAUSE_SCHEMA,
  MECHANICS_OPERATION_SCHEMA,
  MECHANICS_TRANSACTION_SCHEMA,
  type HitPointMaximumEvidence,
  type HitPointMaximumSource,
  type MechanicsOperation,
  type MechanicsOperationCause,
  type MechanicsOperationConsequence,
  type MechanicsOperationExecution,
  type MechanicsOperationNoChange,
  type MechanicsOperationNoChangeReasonByKind,
  type MechanicsOperationRejection,
  type MechanicsOperationSchemaCustomTypes,
  type MechanicsOperationStage,
  type MechanicsTransaction,
  type MechanicsTransactionProjectionResult,
  type MechanicsTransactionSimulationContext,
  type MechanicsTransactionSimulationResult,
} from "@/types/mechanics-operation";
import type {
  MechanicsBoundaryCommand,
  MechanicsCausalState,
  MechanicsDocument,
  MechanicsWorld,
} from "@/types/mechanics-world";
import type { MechanicsAuthoritySnapshot } from "@/types/mechanics-authority";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { ProgramOccurrence } from "@/types/mechanic-occurrence";
import type { ResourceRef } from "@/types/resource";
import type {
  CreatureVitals,
  ObjectVitals,
  VitalsRejection,
  VitalsTransitionResult,
} from "@/types/vitals";

const MAX_ID_LENGTH = 256;
const MAX_HIT_POINTS = 1_000_000_000;
const MAX_TRANSACTION_CAUSES = 512;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

type UnknownRecord = Record<string, unknown>;

function identifier(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function integer(value: unknown, minimum: number): number | null {
  return Number.isSafeInteger(value) &&
    typeof value === "number" &&
    value >= minimum &&
    value <= MAX_HIT_POINTS &&
    !Object.is(value, -0)
    ? value
    : null;
}

const MATERIAL_REF_CONTEXT: ExactSchemaContext<
  { readonly id: string },
  Record<never, never>
> = { customs: { id: identifier }, refs: {} };
const conformMaterialRef = exactConformer(MATERIAL_REF_SCHEMA, MATERIAL_REF_CONTEXT);

function exactRecord(value: unknown, keys: readonly string[]): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function conformMaterialEntityRef(value: unknown): Readonly<MaterialEntityRef> | null {
  const reference = conformEntityRef(value);
  return reference?.entityId === "self" ? null : reference;
}

function journalActor(value: unknown): JournalActorRef | null {
  const entity = conformEntityRef(value);
  if (entity) return entity;
  if (
    !exactRecord(value, ["kind", "material", "authority"]) ||
    value.kind !== "material-authority" ||
    (value.authority !== "table" && value.authority !== "environment")
  ) {
    return null;
  }
  const material = conformMaterialRef(value.material);
  return material
    ? { authority: value.authority, kind: "material-authority", material }
    : null;
}

type MechanicsOperationCauseSchemaCustomTypes = Pick<
  MechanicsOperationSchemaCustomTypes,
  "canonical-fingerprint" | "mechanics-invocation-ref"
>;

const CAUSE_CONTEXT: ExactSchemaContext<
  MechanicsOperationCauseSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "canonical-fingerprint": conformCanonicalFingerprint,
    "mechanics-invocation-ref": conformMechanicsInvocationRef,
  },
  refs: {},
};
const conformCauseStructure = exactConformer(
  MECHANICS_OPERATION_CAUSE_SCHEMA,
  CAUSE_CONTEXT
);

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function conformMechanicsOperationCause(
  value: unknown
): Readonly<MechanicsOperationCause> | null {
  return conformCauseStructure(value);
}

const OPERATION_CONTEXT: ExactSchemaContext<
  MechanicsOperationSchemaCustomTypes,
  MechanicOccurrenceSchemaRefTypes
> = {
  customs: {
    "action-fact": conformActionFactGuard,
    "damage-resolution": conformDamageResolution,
    "dice-observation": conformDiceObservation,
    "entity-ref": conformEntityRef,
    id: identifier,
    "integer-bindings": conformIntegerBindings,
    "inventory-generation-ref": conformInventoryGenerationRef,
    "journal-actor": journalActor,
    "material-entity-ref": conformMaterialEntityRef,
    "material-ref": conformMaterialRef,
    "material-entity-id": conformMaterialEntityId,
    "canonical-fingerprint": conformCanonicalFingerprint,
    "mechanics-invocation-ref": conformMechanicsInvocationRef,
    "mechanics-operation-cause": conformMechanicsOperationCause,
    "new-effect-occurrence": (value) => {
      const occurrence = conformNewMechanicOccurrence(value);
      return occurrence?.kind === "program" ? null : occurrence;
    },
    "new-material-entity": conformNewMaterialEntity,
    "new-inventory-instance": conformNewInventoryInstance,
    "end-rule": conformEndRule,
    "nonnegative-integer": (value) => integer(value, 0),
    "occurrence-generation-ref": conformOccurrenceGenerationRef,
    "positive-integer": (value) => integer(value, 1),
    "program-step-occurrence-origin": conformProgramStepOccurrenceOrigin,
    "resource-operation": conformResourceOperation,
    "resource-ref": conformResourceRef,
    "resource-spec": conformResourceSpec,
    "turn-economy-command": conformTurnEconomyClaimCommand,
    "turn-economy-projection": conformTurnEconomyProjection,
  },
  refs: MECHANIC_OCCURRENCE_SCHEMA_REFS,
};

const conformOperationStructure = exactConformer(
  MECHANICS_OPERATION_SCHEMA,
  OPERATION_CONTEXT
);
const conformTransactionStructure = exactConformer(
  MECHANICS_TRANSACTION_SCHEMA,
  OPERATION_CONTEXT
);

/** Exact hostile-input boundary for every terminal vitality operation. */
export function conformMechanicsOperation(
  value: unknown
): Readonly<MechanicsOperation> | null {
  const operation = conformOperationStructure(value);
  if (
    operation?.kind === "program-phase-transition" &&
    (operation.expected.phaseId !== operation.next.phaseId ||
      operation.next.execution !== operation.expected.execution + 1 ||
      !Number.isSafeInteger(operation.next.execution) ||
      (operation.expected.execution === 0) !==
        (operation.expected.triggerEventId === null) ||
      (operation.next.triggerEventId === null
        ? operation.expected.execution !== 0
        : operation.next.triggerEventId === operation.expected.triggerEventId))
  ) {
    return null;
  }
  if (
    operation &&
    (operation.kind === "creature-damage" || operation.kind === "object-damage") &&
    operation.criticalHit &&
    operation.damage.packet.delivery !== "attack"
  ) {
    return null;
  }
  return operation;
}

function transactionCausesAreValid(transaction: Readonly<MechanicsTransaction>): boolean {
  const rootCreates = transaction.operations.filter(
    (operation) => operation.kind === "program-root-create"
  );
  if (
    rootCreates.length > 1 ||
    (rootCreates[0] &&
      (transaction.operations[0] !== rootCreates[0] ||
        transaction.operations.length !== 1))
  ) {
    return false;
  }
  const phaseTransitions = transaction.operations.filter(
    (operation) => operation.kind === "program-phase-transition"
  );
  if (
    phaseTransitions.length > 1 ||
    (phaseTransitions[0] && transaction.operations.at(-1) !== phaseTransitions[0])
  ) {
    return false;
  }
  if (
    transaction.operations.length !== 1 &&
    transaction.operations.some(({ kind }) => kind === "occurrence-end")
  ) {
    return false;
  }
  if (transaction.causes.length > MAX_TRANSACTION_CAUSES) return false;
  const causesById = new Map<string, Readonly<MechanicsOperationCause>>();
  let previousCauseId: string | null = null;
  for (const cause of transaction.causes) {
    if (
      (previousCauseId !== null && previousCauseId >= cause.causeId) ||
      causesById.has(cause.causeId)
    ) {
      return false;
    }
    causesById.set(cause.causeId, cause);
    previousCauseId = cause.causeId;
  }

  const usedCauseIds = new Set<string>();
  for (const operation of transaction.operations) {
    const cause = causesById.get(operation.causeId);
    if (!cause) return false;
    usedCauseIds.add(operation.causeId);
    if (operation.kind === "program-root-create") {
      if (cause.invocation.kind !== "installed-capability") return false;
    }
    if (operation.kind === "program-phase-transition") {
      if (
        cause.invocation.kind !== "program-root" ||
        !sameCanonical(cause.invocation.occurrence, operation.root)
      ) {
        return false;
      }
    }
  }
  return usedCauseIds.size === transaction.causes.length;
}

/** Exact transaction boundary plus stable causal and per-operation identities. */
export function conformMechanicsTransaction(
  value: unknown
): Readonly<MechanicsTransaction> | null {
  const transaction = conformTransactionStructure(value);
  if (!transaction || !transactionCausesAreValid(transaction)) return null;
  const operationIds = transaction.operations.map(({ operationId }) => operationId);
  return new Set(operationIds).size === operationIds.length ? transaction : null;
}

function sameMaterial(left: MaterialRef, right: MaterialRef): boolean {
  return materialRefKey(left) === materialRefKey(right);
}

function documentFor(
  world: MechanicsWorld,
  material: MaterialRef
): { readonly document: MechanicsDocument; readonly index: number } | null {
  const key = materialRefKey(material);
  const index = world.documents.findIndex(
    (document) => materialRefKey(document.material) === key
  );
  const document = world.documents[index];
  return index >= 0 && document ? { document, index } : null;
}

function boundaryRulesUseCurrentAllocation(
  world: Readonly<MechanicsWorld>,
  rules: readonly Readonly<EndRule>[]
): boolean {
  return rules.every((rule) => {
    if (rule.kind !== "rest-completed" && rule.kind !== "day-phase") return true;
    const document = documentFor(world, rule.clock.material)?.document;
    return (
      document !== undefined &&
      document.state.timeline.epoch === rule.clock.epoch &&
      rule.minimumBoundaryOrdinal === document.state.timeline.nextBoundaryOrdinal &&
      rule.minimumBoundaryOrdinal !== Number.MAX_SAFE_INTEGER
    );
  });
}

type LocatedTarget =
  | {
      readonly documentIndex: number;
      readonly kind: "creature";
      readonly location: "self";
      readonly vitals: Readonly<CreatureVitals>;
    }
  | {
      readonly documentIndex: number;
      readonly entity: Readonly<CreatureMaterialEntity>;
      readonly entityId: string;
      readonly kind: "creature";
      readonly location: "entity";
      readonly vitals: Readonly<CreatureVitals>;
    }
  | {
      readonly documentIndex: number;
      readonly entity: Readonly<ObjectMaterialEntity>;
      readonly entityId: string;
      readonly kind: "object";
      readonly location: "entity";
      readonly vitals: Readonly<ObjectVitals>;
    };

type TargetLookup =
  | { readonly status: "found"; readonly target: LocatedTarget }
  | {
      readonly status: "rejected";
      readonly reason: "missing-target" | "target-unavailable";
    };

function locateTarget(
  world: MechanicsWorld,
  target: MechanicsOperationTarget
): TargetLookup {
  const locatedDocument = documentFor(world, target.material);
  if (!locatedDocument) return { reason: "missing-target", status: "rejected" };
  const { document, index } = locatedDocument;
  if (target.entityId === "self") {
    return document.kind === "character"
      ? {
          status: "found",
          target: {
            documentIndex: index,
            kind: "creature",
            location: "self",
            vitals: document.state.vitals,
          },
        }
      : { reason: "missing-target", status: "rejected" };
  }
  const entity = document.state.entities[target.entityId];
  if (!entity || entity.ordinal !== target.ordinal) {
    return { reason: "missing-target", status: "rejected" };
  }
  if (entity.availability !== "present") {
    return { reason: "target-unavailable", status: "rejected" };
  }
  return entity.kind === "creature"
    ? {
        status: "found",
        target: {
          documentIndex: index,
          entity,
          entityId: target.entityId,
          kind: "creature",
          location: "entity",
          vitals: entity.vitals,
        },
      }
    : {
        status: "found",
        target: {
          documentIndex: index,
          entity,
          entityId: target.entityId,
          kind: "object",
          location: "entity",
          vitals: entity.vitals,
        },
      };
}

function entityExists(world: MechanicsWorld, actor: JournalActorRef): boolean {
  if (!("entityId" in actor)) return sameMaterial(actor.material, world.scope);
  const document = documentFor(world, actor.material)?.document;
  if (!document) return false;
  if (actor.entityId === "self") return document.kind === "character";
  const entity = document.state.entities[actor.entityId];
  return entity?.ordinal === actor.ordinal && entity.availability === "present";
}

function occurrenceAtAddress(
  world: Readonly<MechanicsWorld>,
  reference: Readonly<OccurrenceRef>
) {
  return documentFor(world, reference.material)?.document.state.occurrences[
    reference.occurrenceId
  ];
}

function occurrenceAtGeneration(
  world: Readonly<MechanicsWorld>,
  reference: Readonly<OccurrenceGenerationRef>
) {
  const occurrence = occurrenceAtAddress(world, reference.occurrence);
  return occurrence?.ordinal === reference.ordinal ? occurrence : undefined;
}

interface ResolvedOperationCause {
  readonly authority: Readonly<MechanicsProgramAuthorityReceipt>;
  readonly factGuards: readonly Readonly<ActionFactGuard>[];
}

/** One cause id always binds both the independently resolved authority and invocation. */
export function mechanicsOperationCauseId(
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  invocation: Readonly<MechanicsOperationCause["invocation"]>
): CanonicalFingerprint {
  return canonicalFingerprint({ authority, invocation });
}

function resolveOperationCause(
  world: Readonly<MechanicsWorld>,
  snapshot: Readonly<MechanicsAuthoritySnapshot>,
  cause: Readonly<MechanicsOperationCause>,
  actor: Readonly<JournalActorRef>
): Readonly<ResolvedOperationCause> | null {
  let authority: Readonly<MechanicsProgramAuthorityReceipt> | null;
  let factGuards: readonly Readonly<ActionFactGuard>[];
  if (cause.invocation.kind === "program-root") {
    const root = occurrenceAtGeneration(world, cause.invocation.occurrence);
    if (root?.kind !== "program") return null;
    authority = root.authority;
    factGuards = [];
  } else {
    const definition = resolveInstalledMechanicsCapability(snapshot, cause.invocation);
    if (!definition) return null;
    authority = resolveMechanicsProgramAuthorityReceipt(definition);
    factGuards = [...definition.definitionGuards, ...definition.installationGuards];
  }
  if (
    !authority ||
    !sameCanonical(authority.installation.owner, actor) ||
    cause.causeId !== mechanicsOperationCauseId(authority, cause.invocation)
  ) {
    return null;
  }
  const source = authority.source;
  if (source.kind !== "inventory-item") return { authority, factGuards };
  const document = documentFor(world, source.owner)?.document;
  const instance =
    document?.kind === "character"
      ? document.state.inventory[source.instanceId]
      : undefined;
  return instance?.ordinal === source.instanceOrdinal &&
    (cause.invocation.kind === "program-root" || instance.quantity.current > 0)
    ? { authority, factGuards }
    : null;
}

function causeAuthorizedByPendingTop(
  cause: Readonly<MechanicsOperationCause>,
  resolved: Readonly<ResolvedOperationCause>,
  state: Readonly<MechanicsCausalState>
): boolean {
  if (cause.invocation.kind !== "program-root") return true;
  const top = state.context.pendingFrames.at(-1);
  return (
    top !== undefined &&
    sameCanonical(top.frame.rootReceipt.root, cause.invocation.occurrence) &&
    sameCanonical(top.frame.authority, resolved.authority)
  );
}

function newProgramOrigin(operation: Readonly<MechanicsOperation>): Readonly<{
  readonly origin: Readonly<
    NonNullable<ReturnType<typeof conformProgramStepOccurrenceOrigin>>
  >;
  readonly parent: Readonly<OccurrenceGenerationRef>;
}> | null {
  if (operation.kind === "occurrence-create") {
    return { origin: operation.occurrence.origin, parent: operation.parent };
  }
  if (operation.kind === "entity-create" || operation.kind === "inventory-create") {
    return { origin: operation.origin, parent: operation.parent };
  }
  return null;
}

function newProgramOriginAuthorizedByPendingTop(
  operation: Readonly<MechanicsOperation>,
  cause: Readonly<MechanicsOperationCause>,
  state: Readonly<MechanicsCausalState>,
  expectedSlot: number | null,
  authoredStepId: string | null
): boolean {
  const created = newProgramOrigin(operation);
  if (created === null) return true;
  const top = state.context.pendingFrames.at(-1);
  if (
    cause.invocation.kind !== "program-root" ||
    top?.cursor.stage !== "step" ||
    !sameCanonical(top.frame.rootReceipt.root, cause.invocation.occurrence) ||
    !sameCanonical(created.parent, cause.invocation.occurrence) ||
    !sameCanonical(created.origin.root, cause.invocation.occurrence)
  ) {
    return false;
  }
  const phase = top.frame.authority.snapshot.program?.phases.find(
    ({ phaseId }) => phaseId === top.frame.rootReceipt.next.phaseId
  );
  const step = phase?.steps[top.cursor.stepIndex];
  return (
    step !== undefined &&
    created.origin.execution === top.frame.rootReceipt.next.execution &&
    created.origin.phaseId === top.frame.rootReceipt.next.phaseId &&
    authoredStepId === step.stepId &&
    created.origin.stepId === authoredStepId &&
    expectedSlot !== null &&
    created.origin.slot === expectedSlot
  );
}

function programRegisterAuthorizedByPendingTop(
  operation: Readonly<MechanicsOperation>,
  state: Readonly<MechanicsCausalState>
): boolean {
  if (operation.kind !== "program-register-transition") return true;
  const top = state.context.pendingFrames.at(-1);
  if (top?.cursor.stage !== "step") return false;
  const phase = top.frame.authority.snapshot.program?.phases.find(
    ({ phaseId }) => phaseId === top.frame.rootReceipt.next.phaseId
  );
  const step = phase?.steps[top.cursor.stepIndex];
  return (
    step?.kind === "register" &&
    step.registerId === operation.registerId &&
    sameCanonical(top.frame.rootReceipt.root, operation.root)
  );
}

function inventorySourceLease(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): Readonly<InventoryGenerationRef> | null {
  const source = authority.source;
  return source.kind === "inventory-item"
    ? {
        instanceId: source.instanceId,
        instanceOrdinal: source.instanceOrdinal,
        owner: source.owner,
      }
    : null;
}

type MechanicsOperationTarget = MechanicsOperation extends infer Operation
  ? Operation extends { readonly target: infer Target }
    ? Target
    : Operation extends {
          readonly damage: { readonly computed: { readonly target: infer Target } };
        }
      ? Target
      : never
  : never;

function operationTarget(
  operation: Readonly<MechanicsOperation>
): MechanicsOperationTarget {
  if (operation.kind === "creature-damage" || operation.kind === "object-damage") {
    return operation.damage.computed.target;
  }
  if ("target" in operation) return operation.target;
  throw new TypeError("Operation has no vitality target");
}

function operationTargetKind(
  operation: Readonly<MechanicsOperation>
): LocatedTarget["kind"] {
  switch (operation.kind) {
    case "object-damage":
    case "object-repair":
    case "object-maximum-sync":
      return "object";
    case "creature-damage":
    case "creature-healing":
    case "temporary-hit-points-grant":
    case "temporary-hit-points-clear":
    case "creature-stabilize":
    case "creature-kill":
    case "creature-reduce-to-zero":
    case "creature-revive":
    case "creature-death-save":
    case "creature-maximum-sync":
    case "exhaustion-transition":
      return "creature";
    case "turn-economy-transition":
    case "entity-create":
    case "entity-availability":
    case "entity-controller":
    case "inventory-create":
    case "inventory-transition":
    case "inventory-end":
    case "program-root-create":
    case "program-phase-transition":
    case "program-register-transition":
    case "occurrence-create":
    case "occurrence-end":
    case "resource-initialize":
    case "resource-remove":
    case "resource-transition":
      throw new TypeError("Operation has no vitality target kind");
  }
}

function materialMaximum(target: LocatedTarget): number | null {
  if (target.location === "self") return null;
  if (target.entity.overrides.hitPointMaximum !== null) {
    return target.entity.overrides.hitPointMaximum;
  }
  return target.entity.template.kind === "custom"
    ? target.entity.template.definition.hitPointMaximum
    : null;
}

function maximumFact(target: MechanicsOperationTarget, value: number): ActionFactGuard {
  return {
    address: HIT_POINT_MAXIMUM_FACT_ADDRESS,
    expected: { present: true, value },
    lifecycle: "commit-redo",
    owner: target,
  };
}

type MaximumResolution =
  | {
      readonly fact: ActionFactGuard | null;
      readonly maximumHitPoints: number;
      readonly status: "resolved";
    }
  | { readonly status: "missing" | "stale" };

function resolveDamageMaximum(
  evidence: Readonly<HitPointMaximumEvidence>,
  targetRef: MechanicsOperationTarget,
  target: LocatedTarget
): MaximumResolution {
  if (evidence.kind === "fact") {
    return {
      fact: maximumFact(targetRef, evidence.value),
      maximumHitPoints: evidence.value,
      status: "resolved",
    };
  }
  const maximumHitPoints = materialMaximum(target);
  return maximumHitPoints === null
    ? { status: "missing" }
    : { fact: null, maximumHitPoints, status: "resolved" };
}

function resolveInputMaximum(
  source: Readonly<HitPointMaximumSource>,
  suppliedMaximum: number,
  targetRef: MechanicsOperationTarget,
  target: LocatedTarget
): MaximumResolution {
  if (source.kind === "fact") {
    return {
      fact: maximumFact(targetRef, suppliedMaximum),
      maximumHitPoints: suppliedMaximum,
      status: "resolved",
    };
  }
  const maximumHitPoints = materialMaximum(target);
  if (maximumHitPoints === null) return { status: "missing" };
  return maximumHitPoints === suppliedMaximum
    ? { fact: null, maximumHitPoints, status: "resolved" }
    : { status: "stale" };
}

function maximumRejection(
  maximum: MaximumResolution
): MechanicsOperationRejection | null {
  return maximum.status === "missing"
    ? "missing-hit-point-maximum"
    : maximum.status === "stale"
      ? "stale-hit-point-maximum"
      : null;
}

type TerminalTransition = VitalsTransitionResult<CreatureVitals | ObjectVitals, unknown>;
type NoChangeReason =
  MechanicsOperationNoChangeReasonByKind[keyof MechanicsOperationNoChangeReasonByKind];

type TerminalExecution =
  | {
      readonly actionFacts: readonly ActionFactGuard[];
      readonly noChangeReason: NoChangeReason | null;
      readonly status: "transition";
      readonly transition: TerminalTransition;
    }
  | {
      readonly reason: NoChangeReason;
      readonly status: "no-change";
    }
  | {
      readonly reason: MechanicsOperationRejection;
      readonly status: "rejected";
    };

function execution(
  transition: TerminalTransition,
  noChangeReason: NoChangeReason | null,
  fact: ActionFactGuard | null = null
): TerminalExecution {
  return {
    actionFacts: fact ? [fact] : [],
    noChangeReason,
    status: "transition",
    transition,
  };
}

function maximumExecution(
  maximum: MaximumResolution,
  run: (maximumHitPoints: number) => TerminalTransition,
  noChangeReason: NoChangeReason | null
): TerminalExecution {
  switch (maximum.status) {
    case "missing":
      return { reason: "missing-hit-point-maximum", status: "rejected" };
    case "stale":
      return { reason: "stale-hit-point-maximum", status: "rejected" };
    case "resolved":
      return execution(run(maximum.maximumHitPoints), noChangeReason, maximum.fact);
  }
}

function executeOperation(
  operation: Readonly<MechanicsOperation>,
  targetRef: MechanicsOperationTarget,
  target: LocatedTarget
): TerminalExecution {
  switch (operation.kind) {
    case "creature-damage": {
      const maximum = resolveDamageMaximum(operation.maximumHitPoints, targetRef, target);
      const maximumError = maximumRejection(maximum);
      if (maximumError) return { reason: maximumError, status: "rejected" };
      if (maximum.status !== "resolved") {
        return { reason: "invalid-transition", status: "rejected" };
      }
      if (operation.damage.effective.amount === 0) {
        return { reason: "zero-effective-damage", status: "no-change" };
      }
      return execution(
        applyCreatureDamage(target.vitals, {
          amount: operation.damage.effective.amount,
          criticalHit: operation.criticalHit,
          maximumHitPoints: maximum.maximumHitPoints,
          zeroHitPointsPolicy: operation.zeroHitPointsPolicy,
        }),
        null,
        maximum.fact
      );
    }
    case "object-damage": {
      const maximum = resolveDamageMaximum(operation.maximumHitPoints, targetRef, target);
      const maximumError = maximumRejection(maximum);
      if (maximumError) return { reason: maximumError, status: "rejected" };
      if (maximum.status !== "resolved") {
        return { reason: "invalid-transition", status: "rejected" };
      }
      if (operation.damage.effective.amount === 0) {
        return { reason: "zero-effective-damage", status: "no-change" };
      }
      return execution(
        applyObjectDamage(target.vitals, {
          amount: operation.damage.effective.amount,
          maximumHitPoints: maximum.maximumHitPoints,
        }),
        "already-destroyed",
        maximum.fact
      );
    }
    case "creature-healing":
      return maximumExecution(
        resolveInputMaximum(
          operation.maximumHitPointsSource,
          operation.input.maximumHitPoints,
          targetRef,
          target
        ),
        () => healCreature(target.vitals, operation.input),
        "hit-points-full"
      );
    case "object-repair":
      return maximumExecution(
        resolveInputMaximum(
          operation.maximumHitPointsSource,
          operation.input.maximumHitPoints,
          targetRef,
          target
        ),
        () => repairObject(target.vitals, operation.input),
        "hit-points-full"
      );
    case "temporary-hit-points-grant":
      return execution(
        grantTemporaryHitPoints(target.vitals, operation.grant),
        operation.grant.decision === "keep"
          ? "temporary-hit-points-kept"
          : "temporary-hit-points-unchanged"
      );
    case "temporary-hit-points-clear":
      return execution(
        clearTemporaryHitPoints(target.vitals, operation.clear),
        "no-matching-temporary-hit-points"
      );
    case "creature-stabilize":
      return execution(stabilizeCreature(target.vitals), "already-stable");
    case "creature-kill":
      return execution(killCreature(target.vitals), "already-dead");
    case "creature-reduce-to-zero":
      return maximumExecution(
        resolveInputMaximum(
          operation.maximumHitPointsSource,
          operation.input.maximumHitPoints,
          targetRef,
          target
        ),
        () => reduceCreatureToZeroHitPoints(target.vitals, operation.input),
        "already-zero"
      );
    case "creature-revive":
      return maximumExecution(
        resolveInputMaximum(
          operation.maximumHitPointsSource,
          operation.input.maximumHitPoints,
          targetRef,
          target
        ),
        () => reviveCreature(target.vitals, operation.input),
        null
      );
    case "creature-death-save":
      return execution(applyDeathSaveOutcome(target.vitals, operation.outcome), null);
    case "creature-maximum-sync":
      return execution(
        synchronizeCreatureHitPointMaximum(target.vitals, operation.input),
        "maximum-already-synchronized",
        maximumFact(targetRef, operation.input.maximumHitPoints)
      );
    case "object-maximum-sync":
      return execution(
        synchronizeObjectHitPointMaximum(target.vitals, operation.input),
        "maximum-already-synchronized",
        maximumFact(targetRef, operation.input.maximumHitPoints)
      );
    case "inventory-create":
    case "inventory-transition":
    case "inventory-end":
    case "program-root-create":
    case "program-phase-transition":
    case "program-register-transition":
    case "occurrence-create":
    case "occurrence-end":
    case "exhaustion-transition":
    case "resource-initialize":
    case "resource-remove":
    case "resource-transition":
      throw new TypeError("Operation has no terminal vitality transition");
  }
}

function withTargetVitals(
  world: MechanicsWorld,
  target: LocatedTarget,
  vitals: Readonly<CreatureVitals> | Readonly<ObjectVitals>
): unknown {
  const documents = world.documents.map((document, index) => {
    if (index !== target.documentIndex) return document;
    if (target.location === "self") {
      return { ...document, state: { ...document.state, vitals } };
    }
    const entity: MaterialEntity = { ...target.entity, vitals } as MaterialEntity;
    return {
      ...document,
      state: {
        ...document.state,
        entities: { ...document.state.entities, [target.entityId]: entity },
      },
    };
  });
  return { documents, scope: world.scope };
}

function validatedTransactionCandidate(
  value: unknown,
  priorWorld: Readonly<MechanicsWorld>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): Readonly<MechanicsWorld> | null {
  const parsed = projectMechanicsTransactionWorld(
    value,
    priorWorld,
    inventorySourceLeases,
    causalState
  );
  return parsed.ok ? parsed.value : null;
}

function withOccurrence(
  world: Readonly<MechanicsWorld>,
  material: Readonly<MaterialRef>,
  occurrenceId: string,
  occurrence: Readonly<NewMechanicOccurrence>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): Readonly<MechanicsWorld> | null {
  const located = documentFor(world, material);
  if (!located) return null;
  let occurrenceState;
  try {
    occurrenceState = addOccurrence(
      {
        nextOccurrenceOrdinal: located.document.state.nextOccurrenceOrdinal,
        occurrences: located.document.state.occurrences,
      },
      occurrenceId,
      structuredClone(occurrence)
    );
  } catch {
    return null;
  }
  const candidate = {
    scope: world.scope,
    documents: world.documents.map((document, index) =>
      index === located.index
        ? { ...document, state: { ...document.state, ...occurrenceState } }
        : document
    ),
  };
  return validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
}

function effectiveConditionImmunities(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): ReadonlySet<string> {
  const targetKey = entityRefKey(target);
  const immunities = new Set<string>();
  for (const document of world.documents) {
    for (const occurrence of Object.values(document.state.occurrences)) {
      if (
        occurrence.kind === "standing" &&
        occurrence.ending === null &&
        entityRefKey(occurrence.target) === targetKey &&
        occurrence.fact.kind === "condition-immunity"
      ) {
        immunities.add(occurrence.fact.conditionId);
      }
    }
  }
  const projected = projectResolvedEntityConditions(world, target);
  for (const { effect } of projected?.projection.deterministicEffects ?? []) {
    if (effect.kind === "condition-immunity") immunities.add(effect.conditionId);
  }
  return immunities;
}

function isTableOverrideAuthority(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): boolean {
  const owner = authority.installation.owner;
  return (
    "kind" in owner && owner.kind === "material-authority" && owner.authority === "table"
  );
}

function sameNewOccurrence(
  existing: Readonly<import("@/types/mechanic-occurrence").MechanicOccurrence>,
  expected: Readonly<NewMechanicOccurrence>
): boolean {
  if (existing.ending !== null) return false;
  const body = structuredClone(existing) as unknown as UnknownRecord;
  Reflect.deleteProperty(body, "ending");
  Reflect.deleteProperty(body, "ordinal");
  return canonicalJson(body) === canonicalJson(expected);
}

function rejectedTransition(reason: VitalsRejection): MechanicsOperationRejection {
  if (reason === "maximum-conflict") return "stale-hit-point-maximum";
  if (reason === "dead") return "target-dead";
  if (reason === "not-dead") return "target-not-dead";
  if (reason === "not-dying") return "target-not-dying";
  return "invalid-transition";
}

function visibleFacts(
  operation: Readonly<MechanicsOperation>,
  facts: unknown
): MechanicsOperationExecution["facts"] {
  switch (operation.kind) {
    case "temporary-hit-points-grant":
    case "temporary-hit-points-clear":
    case "creature-stabilize":
    case "creature-kill":
    case "creature-reduce-to-zero":
    case "creature-death-save":
      return null;
    case "creature-damage":
    case "object-damage":
    case "creature-healing":
    case "object-repair":
    case "creature-revive":
    case "creature-maximum-sync":
    case "object-maximum-sync":
      return facts as MechanicsOperationExecution["facts"];
    case "entity-create":
    case "entity-availability":
    case "entity-controller":
    case "inventory-create":
    case "inventory-transition":
    case "inventory-end":
    case "program-root-create":
    case "program-phase-transition":
    case "program-register-transition":
    case "occurrence-create":
    case "occurrence-end":
    case "exhaustion-transition":
    case "resource-initialize":
    case "resource-remove":
    case "resource-transition":
      throw new TypeError("Operation has no terminal vitality facts");
  }
}

type OperationSimulation =
  | {
      readonly actionFacts: readonly ActionFactGuard[];
      readonly consequences?: readonly Readonly<MechanicsOperationConsequence>[];
      readonly execution: MechanicsOperationExecution;
      readonly world: Readonly<MechanicsWorld>;
      readonly status: "applied";
    }
  | {
      readonly execution: MechanicsOperationNoChange;
      readonly status: "no-change";
    }
  | {
      readonly boundary: "capacity" | "initial" | "record-roll" | "recovery";
      readonly requirement: Readonly<import("@/types/dice-formula").DiceRollRequirement>;
      readonly status: "needs-observation";
    }
  | {
      readonly boundary: Readonly<
        Extract<MechanicsBoundaryCommand, { readonly kind: "complete-turn" }>
      >;
      readonly status: "needs-boundary";
    }
  | { readonly reason: MechanicsOperationRejection; readonly status: "rejected" };

function noChangeExecution(
  operation: Readonly<MechanicsOperation>,
  reason: MechanicsOperationNoChange["reason"]
): OperationSimulation {
  return {
    execution: {
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      reason,
      status: "no-change",
    } as MechanicsOperationNoChange,
    status: "no-change",
  };
}

function concentrationsForTarget(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): OccurrenceRef[] {
  const key = entityRefKey(target);
  const references: OccurrenceRef[] = [];
  for (const document of world.documents) {
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      if (
        occurrence.kind === "concentration" &&
        occurrence.ending === null &&
        entityRefKey(occurrence.target) === key
      ) {
        references.push({ material: document.material, occurrenceId });
      }
    }
  }
  return references;
}

interface LocatedEncounterParticipant {
  readonly documentIndex: number;
  readonly participant: Readonly<EncounterParticipant>;
  readonly participantId: string;
}

function locateEncounterParticipant(
  world: Readonly<MechanicsWorld>,
  combatant: Readonly<EntityRef>
):
  | { readonly located: LocatedEncounterParticipant; readonly status: "found" }
  | {
      readonly reason: "invalid-world" | "missing-target";
      readonly status: "rejected";
    } {
  const combatantKey = entityRefKey(combatant);
  let located: LocatedEncounterParticipant | null = null;
  for (const [documentIndex, document] of world.documents.entries()) {
    const encounter = document.state.encounter;
    if (!encounter) continue;
    for (const [participantId, participant] of Object.entries(encounter.participants)) {
      if (entityRefKey(participant.combatant) !== combatantKey) continue;
      if (located) return { reason: "invalid-world", status: "rejected" };
      located = { documentIndex, participant, participantId };
    }
  }
  return located
    ? { located, status: "found" }
    : { reason: "missing-target", status: "rejected" };
}

function withParticipantEconomy(
  world: Readonly<MechanicsWorld>,
  located: Readonly<LocatedEncounterParticipant>,
  economy: Readonly<EncounterParticipant["economy"]>
): unknown {
  return {
    scope: world.scope,
    documents: world.documents.map((document, index) => {
      if (index !== located.documentIndex) return document;
      const encounter = document.state.encounter;
      if (!encounter) return null;
      return {
        ...document,
        state: {
          ...document.state,
          encounter: {
            ...encounter,
            participants: {
              ...encounter.participants,
              [located.participantId]: {
                ...located.participant,
                economy: structuredClone(economy),
              },
            },
          },
        },
      };
    }),
  };
}

function simulateTurnEconomyTransition(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "turn-economy-transition" }>
  >,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const lookup = locateEncounterParticipant(world, operation.combatant);
  if (lookup.status === "rejected") return lookup;
  const before = lookup.located.participant.economy;
  const transition = reduceTurnEconomy(before, operation.projection, operation.command);
  if (transition.status === "rejected") return transition;
  if (transition.status === "no-change") {
    return noChangeExecution(operation, transition.reason);
  }
  const after = validatedTransactionCandidate(
    withParticipantEconomy(world, lookup.located, transition.after),
    world,
    causalState,
    inventorySourceLeases
  );
  if (!after) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [
      turnEconomyProjectionFactGuard(operation.combatant, operation.projection),
    ],
    execution: {
      facts: { after: transition.after, before },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value).sort(compareCodeUnits);
  const canonicalExpected = [...expected].sort(compareCodeUnits);
  return sameCanonical(keys, canonicalExpected);
}

function programPhaseEntry(receipt: {
  readonly execution: number;
  readonly triggerEventId: string | null;
}) {
  return {
    execution: receipt.execution,
    lastTriggerEventId: receipt.triggerEventId,
  } as const;
}

function programRootIdentityMatches(
  root: Readonly<ProgramOccurrence>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): boolean {
  const program = authority.snapshot.program;
  return (
    program !== null &&
    sameCanonical(root.authority, authority) &&
    exactKeys(
      root.phaseState,
      program.phases.map(({ phaseId }) => phaseId)
    ) &&
    exactKeys(
      root.registers,
      program.registers.map(({ registerId }) => registerId)
    )
  );
}

function withProgramOccurrence(
  world: Readonly<MechanicsWorld>,
  reference: Readonly<OccurrenceGenerationRef>,
  occurrence: Readonly<ProgramOccurrence>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): Readonly<MechanicsWorld> | null {
  const located = documentFor(world, reference.occurrence.material);
  if (!located) return null;
  const candidate = {
    scope: world.scope,
    documents: world.documents.map((document, index) =>
      index === located.index
        ? {
            ...document,
            state: {
              ...document.state,
              occurrences: {
                ...document.state.occurrences,
                [reference.occurrence.occurrenceId]: structuredClone(occurrence),
              },
            },
          }
        : document
    ),
  };
  return validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
}

function withCreatedProgramOccurrence(
  world: Readonly<MechanicsWorld>,
  reference: Readonly<OccurrenceGenerationRef>,
  occurrence: Omit<ProgramOccurrence, "ending" | "ordinal">,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): Readonly<MechanicsWorld> | null {
  const located = documentFor(world, reference.occurrence.material);
  if (!located) return null;
  let occurrenceState;
  try {
    occurrenceState = addTransitionedProgramOccurrence(
      {
        nextOccurrenceOrdinal: located.document.state.nextOccurrenceOrdinal,
        occurrences: located.document.state.occurrences,
      },
      reference.occurrence.occurrenceId,
      structuredClone(occurrence)
    );
  } catch {
    return null;
  }
  const candidate = {
    scope: world.scope,
    documents: world.documents.map((document, index) =>
      index === located.index
        ? { ...document, state: { ...document.state, ...occurrenceState } }
        : document
    ),
  };
  return validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
}

function simulateProgramRootCreate(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "program-root-create" }>
  >,
  cause: Readonly<MechanicsOperationCause>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const program = authority.snapshot.program;
  const ownerMaterial = authority.installation.owner.material;
  if (
    !program ||
    cause.invocation.kind !== "installed-capability" ||
    !sameMaterial(operation.root.occurrence.material, ownerMaterial)
  ) {
    return { reason: "invalid-program-state", status: "rejected" };
  }
  const located = documentFor(world, operation.root.occurrence.material);
  if (!located) return { reason: "missing-target", status: "rejected" };
  const existing =
    located.document.state.occurrences[operation.root.occurrence.occurrenceId];
  const expectedRoot = {
    authority,
    endRules: [],
    phaseState: Object.fromEntries(
      program.phases.map(({ phaseId }) => [
        phaseId,
        { execution: 0, lastTriggerEventId: null },
      ])
    ),
    registers: Object.fromEntries(
      program.registers.map(({ initial, registerId }) => [registerId, initial])
    ),
  };
  if (existing) {
    return existing.kind === "program" &&
      existing.ordinal === operation.root.ordinal &&
      existing.ending === null &&
      sameCanonical(
        {
          authority: existing.authority,
          endRules: existing.endRules,
          phaseState: existing.phaseState,
          registers: existing.registers,
        },
        expectedRoot
      )
      ? noChangeExecution(operation, "program-root-already-created")
      : { reason: "program-root-collision", status: "rejected" };
  }
  if (
    located.document.state.epoch !== operation.materialEpoch ||
    located.document.state.nextOccurrenceOrdinal !== operation.root.ordinal
  ) {
    return { reason: "stale-program-state", status: "rejected" };
  }
  if (operation.root.ordinal === Number.MAX_SAFE_INTEGER) {
    return { reason: "overflow", status: "rejected" };
  }
  const after = withCreatedProgramOccurrence(
    world,
    operation.root,
    { ...expectedRoot, kind: "program" },
    causalState,
    inventorySourceLeases
  );
  const created = after ? occurrenceAtGeneration(after, operation.root) : undefined;
  if (created?.kind !== "program") {
    return { reason: "invalid-after", status: "rejected" };
  }
  return {
    actionFacts: [],
    execution: {
      facts: { root: operation.root },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

function simulateProgramPhaseTransition(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "program-phase-transition" }>
  >,
  cause: Readonly<MechanicsOperationCause>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): OperationSimulation {
  const program = authority.snapshot.program;
  const phase = program?.phases.find(({ phaseId }) => phaseId === operation.next.phaseId);
  if (
    !program ||
    !phase ||
    cause.invocation.kind !== "program-root" ||
    !sameCanonical(cause.invocation.occurrence, operation.root) ||
    (phase.trigger.kind === "invocation") !== (operation.next.triggerEventId === null)
  ) {
    return { reason: "invalid-program-state", status: "rejected" };
  }
  const existing = occurrenceAtGeneration(world, operation.root);
  if (!existing) {
    return { reason: "missing-program-root", status: "rejected" };
  }
  if (existing.kind !== "program" || !programRootIdentityMatches(existing, authority)) {
    return { reason: "invalid-program-state", status: "rejected" };
  }
  const currentPhase = existing.phaseState[operation.next.phaseId];
  if (!currentPhase) {
    return { reason: "invalid-program-state", status: "rejected" };
  }
  const nextPhase = programPhaseEntry(operation.next);
  if (sameCanonical(currentPhase, nextPhase)) {
    return noChangeExecution(operation, "program-phase-already-committed");
  }
  if (!sameCanonical(currentPhase, programPhaseEntry(operation.expected))) {
    return { reason: "stale-program-state", status: "rejected" };
  }
  const nextRoot: ProgramOccurrence = {
    ...existing,
    phaseState: {
      ...existing.phaseState,
      [operation.next.phaseId]: nextPhase,
    },
  };
  const located = documentFor(world, operation.root.occurrence.material);
  if (!located) return { reason: "missing-program-root", status: "rejected" };
  const after = {
    scope: world.scope,
    documents: world.documents.map((document, index) =>
      index === located.index
        ? {
            ...document,
            state: {
              ...document.state,
              occurrences: {
                ...document.state.occurrences,
                [operation.root.occurrence.occurrenceId]: nextRoot,
              },
            },
          }
        : document
    ),
  };
  return {
    actionFacts: [],
    execution: {
      facts: {
        after: nextPhase,
        before: currentPhase,
        root: operation.root,
      },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

function simulateProgramRegisterTransition(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "program-register-transition" }>
  >,
  cause: Readonly<MechanicsOperationCause>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const program = authority.snapshot.program;
  if (
    !program ||
    cause.invocation.kind !== "program-root" ||
    !sameCanonical(cause.invocation.occurrence, operation.root) ||
    !program.registers.some(({ registerId }) => registerId === operation.registerId)
  ) {
    return { reason: "invalid-program-state", status: "rejected" };
  }
  const existing = occurrenceAtGeneration(world, operation.root);
  if (!existing) return { reason: "missing-program-root", status: "rejected" };
  if (existing.kind !== "program" || !programRootIdentityMatches(existing, authority)) {
    return { reason: "invalid-program-state", status: "rejected" };
  }
  const before = existing.registers[operation.registerId];
  if (!sameCanonical(before, operation.expected)) {
    return { reason: "stale-program-state", status: "rejected" };
  }
  if (sameCanonical(before, operation.next)) {
    return noChangeExecution(operation, "program-register-unchanged");
  }
  const after = withProgramOccurrence(
    world,
    operation.root,
    {
      ...existing,
      registers: {
        ...existing.registers,
        [operation.registerId]: structuredClone(operation.next),
      },
    },
    causalState,
    inventorySourceLeases
  );
  if (!after) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [],
    execution: {
      facts: {
        after: operation.next,
        before,
        registerId: operation.registerId,
        root: operation.root,
      },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

interface LocatedMaterialEntity {
  readonly documentIndex: number;
  readonly entity: Readonly<MaterialEntity>;
  readonly entityId: string;
}

function locateMaterialEntityGeneration(
  world: Readonly<MechanicsWorld>,
  reference: Readonly<MaterialEntityRef>
): LocatedMaterialEntity | null {
  const located = documentFor(world, reference.material);
  const entity = located?.document.state.entities[reference.entityId];
  return located && entity?.ordinal === reference.ordinal
    ? { documentIndex: located.index, entity, entityId: reference.entityId }
    : null;
}

function entityGenerationExists(
  world: Readonly<MechanicsWorld>,
  reference: Readonly<EntityRef>
): boolean {
  const document = documentFor(world, reference.material)?.document;
  if (!document) return false;
  if (reference.entityId === "self") return document.kind === "character";
  return document.state.entities[reference.entityId]?.ordinal === reference.ordinal;
}

function controllerWouldCycle(
  world: Readonly<MechanicsWorld>,
  target: Readonly<MaterialEntityRef>,
  controller: Readonly<EntityRef>
): boolean {
  const targetKey = entityRefKey(target);
  const seen = new Set<string>();
  let cursor: Readonly<EntityRef> | null = controller;
  while (cursor !== null) {
    const key = entityRefKey(cursor);
    if (key === targetKey) return true;
    if (seen.has(key) || cursor.entityId === "self") return false;
    seen.add(key);
    cursor = locateMaterialEntityGeneration(world, cursor)?.entity.controller ?? null;
  }
  return false;
}

function entityCandidate(
  world: Readonly<MechanicsWorld>,
  documentIndex: number,
  entityId: string,
  entity: Readonly<MaterialEntity>
): Readonly<MechanicsWorld> {
  return {
    scope: world.scope,
    documents: world.documents.map((document, index) =>
      index === documentIndex
        ? {
            ...document,
            state: {
              ...document.state,
              entities: { ...document.state.entities, [entityId]: entity },
            },
          }
        : document
    ),
  };
}

function requiredCompleteTurnBoundary(
  world: Readonly<MechanicsWorld>,
  target: Readonly<MaterialEntityRef>
): Readonly<
  Extract<MechanicsBoundaryCommand, { readonly kind: "complete-turn" }>
> | null {
  const targetKey = entityRefKey(target);
  for (const document of world.documents) {
    const encounter = document.state.encounter;
    if (encounter?.phase !== "turns" || encounter.currentCombatantId === null) {
      continue;
    }
    const current = encounter.participants[encounter.currentCombatantId];
    if (current && entityRefKey(current.combatant) === targetKey) {
      return {
        excludeCurrent: structuredClone(target),
        kind: "complete-turn",
        material: structuredClone(document.material),
      };
    }
  }
  return null;
}

function simulateEntityCreate(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<Extract<MechanicsOperation, { readonly kind: "entity-create" }>>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const material = operation.entity.material;
  const located = documentFor(world, material);
  if (!located) return { reason: "missing-target", status: "rejected" };
  if (
    !sameMaterial(operation.lifecycle.occurrence.material, material) ||
    !sameMaterial(operation.parent.occurrence.material, material) ||
    !sameCanonical(operation.origin.root, operation.parent)
  ) {
    return { reason: "invalid-transition", status: "rejected" };
  }
  const parent = occurrenceAtGeneration(world, operation.parent);
  if (
    parent?.kind !== "program" ||
    parent.ending !== null ||
    !sameCanonical(parent.authority, authority)
  ) {
    return { reason: "invalid-cause", status: "rejected" };
  }
  if (operation.value.controller !== null) {
    if (sameCanonical(operation.value.controller, operation.entity)) {
      return { reason: "controller-cycle", status: "rejected" };
    }
    if (!entityGenerationExists(world, operation.value.controller)) {
      return { reason: "missing-controller", status: "rejected" };
    }
    if (controllerWouldCycle(world, operation.entity, operation.value.controller)) {
      return { reason: "controller-cycle", status: "rejected" };
    }
  }

  const expectedEntity: MaterialEntity = {
    ...structuredClone(operation.value),
    availability: "present",
    ordinal: operation.entity.ordinal,
    ownerOccurrence: structuredClone(operation.lifecycle),
  };
  const expectedLifecycle = {
    endRules: structuredClone(operation.endRules),
    ending: null,
    kind: "material-lifecycle" as const,
    origin: structuredClone(operation.origin),
    ordinal: operation.lifecycle.ordinal,
    parentId: operation.parent.occurrence.occurrenceId,
    target: structuredClone(operation.entity),
  };
  const existingEntity = located.document.state.entities[operation.entity.entityId];
  const existingLifecycle =
    located.document.state.occurrences[operation.lifecycle.occurrence.occurrenceId];
  if (existingEntity || existingLifecycle) {
    return existingEntity &&
      existingLifecycle &&
      sameCanonical(existingEntity, expectedEntity) &&
      sameCanonical(existingLifecycle, expectedLifecycle)
      ? noChangeExecution(operation, "entity-already-created")
      : { reason: "entity-collision", status: "rejected" };
  }
  if (!boundaryRulesUseCurrentAllocation(world, operation.endRules)) {
    return { reason: "invalid-transition", status: "rejected" };
  }
  if (
    located.document.state.nextEntityOrdinal !== operation.entity.ordinal ||
    located.document.state.nextOccurrenceOrdinal !== operation.lifecycle.ordinal
  ) {
    return { reason: "stale-allocation-state", status: "rejected" };
  }
  if (
    operation.entity.ordinal === Number.MAX_SAFE_INTEGER ||
    operation.lifecycle.ordinal === Number.MAX_SAFE_INTEGER
  ) {
    return { reason: "overflow", status: "rejected" };
  }
  const candidate = {
    scope: world.scope,
    documents: world.documents.map((document, index) =>
      index === located.index
        ? {
            ...document,
            state: {
              ...document.state,
              entities: {
                ...document.state.entities,
                [operation.entity.entityId]: expectedEntity,
              },
              nextEntityOrdinal: operation.entity.ordinal + 1,
              nextOccurrenceOrdinal: operation.lifecycle.ordinal + 1,
              occurrences: {
                ...document.state.occurrences,
                [operation.lifecycle.occurrence.occurrenceId]: expectedLifecycle,
              },
            },
          }
        : document
    ),
  };
  const after = validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
  if (!after) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [],
    execution: {
      facts: { entity: operation.entity, lifecycle: operation.lifecycle },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

function simulateEntityAvailability(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "entity-availability" }>
  >,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const located = locateMaterialEntityGeneration(world, operation.target);
  if (!located) return { reason: "missing-target", status: "rejected" };
  if (located.entity.availability === operation.availability) {
    return noChangeExecution(operation, "entity-availability-unchanged");
  }
  if (operation.availability === "dismissed") {
    const boundary = requiredCompleteTurnBoundary(world, operation.target);
    if (boundary) return { boundary, status: "needs-boundary" };
  }
  const candidate = entityCandidate(world, located.documentIndex, located.entityId, {
    ...located.entity,
    availability: operation.availability,
  });
  const after = validatedTransactionCandidate(
    reconcileMechanicsEncounterMembership(candidate),
    world,
    causalState,
    inventorySourceLeases
  );
  if (!after) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [],
    execution: {
      facts: { after: operation.availability, before: located.entity.availability },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

function simulateEntityController(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "entity-controller" }>
  >,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const located = locateMaterialEntityGeneration(world, operation.target);
  if (!located) return { reason: "missing-target", status: "rejected" };
  if (sameCanonical(located.entity.controller, operation.controller)) {
    return noChangeExecution(operation, "entity-controller-unchanged");
  }
  if (operation.controller !== null) {
    if (!entityGenerationExists(world, operation.controller)) {
      return { reason: "missing-controller", status: "rejected" };
    }
    if (controllerWouldCycle(world, operation.target, operation.controller)) {
      return { reason: "controller-cycle", status: "rejected" };
    }
  }
  const after = validatedTransactionCandidate(
    entityCandidate(world, located.documentIndex, located.entityId, {
      ...located.entity,
      controller: operation.controller,
    }),
    world,
    causalState,
    inventorySourceLeases
  );
  if (!after) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [],
    execution: {
      facts: { after: operation.controller, before: located.entity.controller },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

function simulateOccurrenceCreate(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "occurrence-create" }>
  >,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const { created } = operation;
  const material = created.occurrence.material;
  const document = documentFor(world, material)?.document;
  if (!document) return { reason: "missing-target", status: "rejected" };
  if (
    !sameMaterial(operation.parent.occurrence.material, material) ||
    operation.parent.occurrence.occurrenceId !== operation.occurrence.parentId ||
    !sameCanonical(operation.occurrence.origin.root, operation.parent)
  ) {
    return { reason: "invalid-cause", status: "rejected" };
  }
  const parent = occurrenceAtGeneration(world, operation.parent);
  if (
    parent?.kind !== "program" ||
    parent.ending !== null ||
    !sameCanonical(parent.authority, authority)
  ) {
    return { reason: "invalid-cause", status: "rejected" };
  }
  const occurrence: NewMechanicOccurrence = operation.occurrence;
  const existing = document.state.occurrences[created.occurrence.occurrenceId];
  if (existing) {
    return existing.ordinal === created.ordinal && sameNewOccurrence(existing, occurrence)
      ? noChangeExecution(operation, "occurrence-already-active")
      : { reason: "occurrence-collision", status: "rejected" };
  }
  if (!boundaryRulesUseCurrentAllocation(world, occurrence.endRules)) {
    return { reason: "invalid-transition", status: "rejected" };
  }
  if (document.state.nextOccurrenceOrdinal !== created.ordinal) {
    return { reason: "stale-allocation-state", status: "rejected" };
  }
  if (created.ordinal === Number.MAX_SAFE_INTEGER) {
    return { reason: "overflow", status: "rejected" };
  }
  const target = locateTarget(world, operation.occurrence.target);
  if (target.status === "rejected") return target;
  if (
    (operation.occurrence.kind === "condition" ||
      operation.occurrence.kind === "concentration" ||
      operation.occurrence.kind === "polymorph-form") &&
    target.target.kind !== "creature"
  ) {
    return { reason: "wrong-target-kind", status: "rejected" };
  }
  if (
    operation.occurrence.kind === "condition" &&
    effectiveConditionImmunities(world, operation.occurrence.target).has(
      operation.occurrence.conditionId
    )
  ) {
    if (operation.conditionImmunityOverride === null) {
      return noChangeExecution(operation, "condition-immune");
    }
    if (!isTableOverrideAuthority(authority)) {
      return { reason: "invalid-override", status: "rejected" };
    }
  }
  if (
    operation.occurrence.kind === "concentration" &&
    projectResolvedEntityConditions(world, operation.occurrence.target)
      ?.breaksConcentration
  ) {
    return noChangeExecution(operation, "concentration-unsustainable");
  }

  const replaced =
    operation.occurrence.kind === "concentration"
      ? concentrationsForTarget(world, operation.occurrence.target)
      : [];
  if (replaced.length > 0) {
    return { reason: "concentration-replacement-required", status: "rejected" };
  }
  const after = withOccurrence(
    world,
    material,
    created.occurrence.occurrenceId,
    occurrence,
    causalState,
    inventorySourceLeases
  );
  if (!after) return { reason: "invalid-after", status: "rejected" };
  const createdOccurrence = occurrenceAtGeneration(after, created);
  if (!createdOccurrence) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [],
    execution: {
      facts: { created },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

function simulateOccurrenceEnd(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<Extract<MechanicsOperation, { readonly kind: "occurrence-end" }>>
): OperationSimulation {
  if (!occurrenceAtGeneration(world, operation.occurrence)) {
    return noChangeExecution(operation, "occurrence-not-active");
  }
  return {
    actionFacts: [],
    consequences: [
      {
        causeId: operation.causeId,
        kind: "occurrence-end",
        occurrence: operation.occurrence,
        operationId: operation.operationId,
      },
    ],
    execution: {
      facts: { requested: operation.occurrence },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world,
    status: "applied",
  };
}

function sameActiveOccurrence(
  existing: Readonly<import("@/types/mechanic-occurrence").MechanicOccurrence>,
  reference: Readonly<OccurrenceGenerationRef>,
  expected: Readonly<NewMechanicOccurrence>
): boolean {
  if (existing.ordinal !== reference.ordinal || existing.ending !== null) return false;
  const body = structuredClone(existing) as unknown as UnknownRecord;
  Reflect.deleteProperty(body, "ending");
  Reflect.deleteProperty(body, "ordinal");
  return sameCanonical(body, expected);
}

function inventoryLifecycle(
  operation: Readonly<Extract<MechanicsOperation, { readonly kind: "inventory-create" }>>
): Extract<NewMechanicOccurrence, { readonly kind: "material-lifecycle" }> {
  return {
    endRules: operation.endRules,
    kind: "material-lifecycle",
    origin: operation.origin,
    parentId: operation.parent.occurrence.occurrenceId,
    target: { entityId: "self", material: operation.item.owner },
  };
}

function simulateInventoryCreate(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<Extract<MechanicsOperation, { readonly kind: "inventory-create" }>>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const located = documentFor(world, operation.item.owner);
  if (!located || located.document.kind !== "character") {
    return { reason: "missing-target", status: "rejected" };
  }
  if (
    !sameMaterial(operation.lifecycle.occurrence.material, operation.item.owner) ||
    !sameMaterial(operation.parent.occurrence.material, operation.item.owner) ||
    !sameCanonical(operation.origin.root, operation.parent)
  ) {
    return { reason: "invalid-transition", status: "rejected" };
  }
  const parent = occurrenceAtGeneration(world, operation.parent);
  if (
    parent?.kind !== "program" ||
    parent.ending !== null ||
    !sameCanonical(parent.authority, authority)
  ) {
    return { reason: "invalid-cause", status: "rejected" };
  }

  const lifecycle = inventoryLifecycle(operation);
  const instance = conformInventoryInstance({
    ...operation.instance,
    ordinal: operation.item.instanceOrdinal,
    ownerOccurrence: operation.lifecycle,
  });
  if (!instance || instance.quantity.current === 0) {
    return { reason: "invalid-transition", status: "rejected" };
  }
  const existingInstance = located.document.state.inventory[operation.item.instanceId];
  const existingLifecycle =
    located.document.state.occurrences[operation.lifecycle.occurrence.occurrenceId];
  if (existingInstance || existingLifecycle) {
    if (
      existingInstance &&
      existingLifecycle &&
      sameCanonical(existingInstance, instance) &&
      sameActiveOccurrence(existingLifecycle, operation.lifecycle, lifecycle)
    ) {
      return noChangeExecution(operation, "inventory-already-created");
    }
    return {
      reason: existingInstance ? "inventory-collision" : "occurrence-collision",
      status: "rejected",
    };
  }
  if (!boundaryRulesUseCurrentAllocation(world, operation.endRules)) {
    return { reason: "invalid-transition", status: "rejected" };
  }
  if (
    located.document.state.nextInventoryOrdinal !== operation.item.instanceOrdinal ||
    located.document.state.nextOccurrenceOrdinal !== operation.lifecycle.ordinal
  ) {
    return { reason: "stale-allocation-state", status: "rejected" };
  }
  if (
    operation.item.instanceOrdinal === Number.MAX_SAFE_INTEGER ||
    operation.lifecycle.ordinal === Number.MAX_SAFE_INTEGER
  ) {
    return { reason: "overflow", status: "rejected" };
  }

  let occurrenceState;
  try {
    occurrenceState = addOccurrence(
      {
        nextOccurrenceOrdinal: located.document.state.nextOccurrenceOrdinal,
        occurrences: located.document.state.occurrences,
      },
      operation.lifecycle.occurrence.occurrenceId,
      lifecycle
    );
  } catch {
    return { reason: "invalid-transition", status: "rejected" };
  }
  const candidate = {
    scope: world.scope,
    documents: world.documents.map((document, index) =>
      index === located.index && document.kind === "character"
        ? {
            ...document,
            state: {
              ...document.state,
              ...occurrenceState,
              inventory: {
                ...document.state.inventory,
                [operation.item.instanceId]: instance,
              },
              nextInventoryOrdinal: document.state.nextInventoryOrdinal + 1,
            },
          }
        : document
    ),
  };
  const after = validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
  const createdDocument = after
    ? documentFor(after, operation.item.owner)?.document
    : null;
  const createdInstance =
    createdDocument?.kind === "character"
      ? createdDocument.state.inventory[operation.item.instanceId]
      : undefined;
  if (!after || !createdInstance) {
    return { reason: "invalid-after", status: "rejected" };
  }
  return {
    actionFacts: [],
    execution: {
      facts: {
        created: operation.item,
        instance: createdInstance,
        lifecycle: operation.lifecycle,
      },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: after,
    status: "applied",
  };
}

interface LocatedInventoryInstance {
  readonly documentIndex: number;
  readonly instance: Readonly<InventoryInstance>;
}

function locateInventoryInstance(
  world: Readonly<MechanicsWorld>,
  item: Readonly<InventoryGenerationRef>
): LocatedInventoryInstance | null {
  const located = documentFor(world, item.owner);
  const instance =
    located?.document.kind === "character"
      ? located.document.state.inventory[item.instanceId]
      : undefined;
  return located && instance?.ordinal === item.instanceOrdinal
    ? { documentIndex: located.index, instance }
    : null;
}

const ITEM_QUANTITY_SPEC = {
  capacity: { kind: "unbounded" },
  id: "item-quantity",
  initial: { kind: "empty" },
  kind: "count",
  recoveries: [],
} as const;

type InventoryMutationOperation = Extract<
  MechanicsOperation,
  { readonly kind: "inventory-end" | "inventory-transition" }
>;

function simulateInventoryMutation(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<InventoryMutationOperation>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const located = locateInventoryInstance(world, operation.item);
  if (!located) {
    return operation.kind === "inventory-end"
      ? noChangeExecution(operation, "inventory-not-active")
      : { reason: "missing-target", status: "rejected" };
  }
  const document = world.documents[located.documentIndex];
  if (document?.kind !== "character") {
    return { reason: "missing-target", status: "rejected" };
  }
  const before = located.instance;
  let after: InventoryInstance;
  if (operation.kind === "inventory-end" || operation.change.kind === "quantity") {
    const value = operation.kind === "inventory-end" ? 0 : operation.change.value;
    if (before.quantity.current === 0 && value > 0) {
      return { reason: "invalid-transition", status: "rejected" };
    }
    const transition = reduceResource(
      ITEM_QUANTITY_SPEC,
      before.quantity,
      {},
      { kind: "set-count", value }
    );
    if (transition.status !== "applied") {
      return { reason: "invalid-transition", status: "rejected" };
    }
    after = { ...before, quantity: transition.after as InventoryInstance["quantity"] };
  } else if (operation.change.kind === "equipped") {
    after = { ...before, equipped: operation.change.value };
  } else {
    after = { ...before, attuned: operation.change.value };
  }

  const shouldEnd =
    operation.kind === "inventory-end" ||
    (operation.change.kind === "quantity" && operation.change.value === 0);
  if (after.quantity.current === 0) {
    after = { ...after, attuned: false, enchantment: null, equipped: false };
  }
  const conformedAfter = conformInventoryInstance(after);
  if (
    !conformedAfter ||
    (conformedAfter.attuned && conformedAfter.disposition !== "magical")
  ) {
    return { reason: "invalid-transition", status: "rejected" };
  }

  let detachedFrom: InventoryGenerationRef | null = null;
  const inventory = {
    ...document.state.inventory,
    [operation.item.instanceId]: conformedAfter,
  };
  const bearer = operation.enchantmentBearer
    ? locateInventoryInstance(world, operation.enchantmentBearer)
    : null;
  const inboundBearer = Object.entries(document.state.inventory).find(([, candidate]) =>
    sameCanonical(candidate.enchantment, operation.item)
  );
  if (
    (operation.enchantmentBearer === null) !== (inboundBearer === undefined) ||
    (operation.enchantmentBearer !== null &&
      (!bearer ||
        !sameCanonical(bearer.instance.enchantment, operation.item) ||
        inboundBearer?.[0] !== operation.enchantmentBearer.instanceId))
  ) {
    return { reason: "invalid-transition", status: "rejected" };
  }
  if (
    conformedAfter.quantity.current === 0 &&
    operation.enchantmentBearer !== null &&
    bearer
  ) {
    detachedFrom = operation.enchantmentBearer;
    inventory[operation.enchantmentBearer.instanceId] = {
      ...bearer.instance,
      enchantment: null,
    };
  } else if (
    conformedAfter.quantity.current > 1 &&
    operation.enchantmentBearer !== null
  ) {
    return { reason: "invalid-transition", status: "rejected" };
  }

  const lifecycle = shouldEnd ? before.ownerOccurrence : null;
  const lifecycleOccurrence = lifecycle
    ? occurrenceAtGeneration(world, lifecycle)
    : undefined;
  const lifecycleEndRequested =
    lifecycleOccurrence?.kind === "material-lifecycle" &&
    lifecycleOccurrence.ending === null
      ? lifecycle
      : null;
  const physicalChanged = !sameCanonical(document.state.inventory, inventory);
  if (!physicalChanged && lifecycleEndRequested === null) {
    return noChangeExecution(
      operation,
      operation.kind === "inventory-end" ? "inventory-not-active" : "inventory-unchanged"
    );
  }

  const candidate = {
    scope: world.scope,
    documents: world.documents.map((entry, index) =>
      index === located.documentIndex && entry.kind === "character"
        ? { ...entry, state: { ...entry.state, inventory } }
        : entry
    ),
  };
  const parsed = validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
  if (!parsed) return { reason: "invalid-after", status: "rejected" };
  const parsedInstance = locateInventoryInstance(parsed, operation.item)?.instance;
  if (!parsedInstance) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [],
    consequences: lifecycleEndRequested
      ? [
          {
            causeId: operation.causeId,
            kind: "occurrence-end",
            occurrence: lifecycleEndRequested,
            operationId: operation.operationId,
          },
        ]
      : [],
    execution: {
      facts: {
        after: parsedInstance,
        before,
        detachedFrom,
        lifecycleEndRequested,
      },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    } as MechanicsOperationExecution,
    world: parsed,
    status: "applied",
  };
}

function exhaustionFor(
  world: Readonly<MechanicsWorld>,
  target: Readonly<EntityRef>
): ExhaustionLevel | null {
  const document = documentFor(world, target.material)?.document;
  if (!document) return null;
  if (target.entityId === "self") {
    return document.kind === "character" ? document.state.exhaustion : null;
  }
  const entity = document.state.entities[target.entityId];
  if (!entity || entity.ordinal !== target.ordinal || entity.kind !== "creature") {
    return null;
  }
  return entity.exhaustion;
}

function withTargetExhaustion(
  world: Readonly<MechanicsWorld>,
  target: LocatedTarget,
  exhaustion: ExhaustionLevel,
  vitals: Readonly<CreatureVitals>
): unknown {
  const documents = world.documents.map((document, index) => {
    if (index !== target.documentIndex) return document;
    if (target.location === "self") {
      return { ...document, state: { ...document.state, exhaustion, vitals } };
    }
    return {
      ...document,
      state: {
        ...document.state,
        entities: {
          ...document.state.entities,
          [target.entityId]: { ...target.entity, exhaustion, vitals },
        },
      },
    };
  });
  return { documents, scope: world.scope };
}

function simulateExhaustionTransition(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "exhaustion-transition" }>
  >,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const lookup = locateTarget(world, operation.target);
  if (lookup.status === "rejected") return lookup;
  if (lookup.target.kind !== "creature") {
    return { reason: "wrong-target-kind", status: "rejected" };
  }
  const before = exhaustionFor(world, operation.target);
  if (before === null) return { reason: "missing-target", status: "rejected" };
  const after =
    operation.transition.kind === "gain"
      ? gainExhaustion(before, operation.transition.amount)
      : operation.transition.kind === "remove"
        ? removeExhaustion(before, operation.transition.amount)
        : operation.transition.level;
  if (after === null) return { reason: "invalid-transition", status: "rejected" };
  if (after === before) return noChangeExecution(operation, "exhaustion-unchanged");

  let vitals = lookup.target.vitals;
  if (after === 6) {
    const death = killCreature(vitals);
    if (death.status === "rejected") {
      return { reason: rejectedTransition(death.reason), status: "rejected" };
    }
    if (death.status === "applied") vitals = death.after;
  }
  const parsed = validatedTransactionCandidate(
    withTargetExhaustion(world, lookup.target, after, vitals),
    world,
    causalState,
    inventorySourceLeases
  );
  if (!parsed) {
    return { reason: "invalid-after", status: "rejected" };
  }
  return {
    actionFacts: [],
    execution: {
      facts: {
        after,
        becameDead:
          lookup.target.vitals.zeroHitPoints?.kind !== "dead" &&
          vitals.zeroHitPoints?.kind === "dead",
        before,
      },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: parsed,
    status: "applied",
  };
}

function simulateResourceTransition(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "resource-transition" }>
  >,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  const location = locateResolvedMaterialResource(world, operation.resource);
  if (!location) return { reason: "missing-target", status: "rejected" };
  const transition = reduceResource(
    operation.spec,
    location.cell,
    operation.bindings,
    operation.transition
  );
  if (transition.status === "needs-observation") return transition;
  if (transition.status === "rejected") {
    return {
      reason: `resource-${transition.reason}`,
      status: "rejected",
    };
  }
  if (canonicalJson(location.cell) === canonicalJson(transition.after)) {
    return noChangeExecution(operation, "resource-unchanged");
  }
  const candidate = replaceResolvedMaterialResource(
    world,
    operation.resource,
    transition.after
  );
  if (!candidate) return { reason: "invalid-after", status: "rejected" };
  const parsed = validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
  if (!parsed) {
    return { reason: "invalid-after", status: "rejected" };
  }
  return {
    actionFacts: [],
    execution: {
      facts: transition.facts,
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: parsed,
    status: "applied",
  };
}

function fixedShapeResource(resource: Readonly<ResourceRef>) {
  return resource.kind === "currency" || resource.kind === "item-quantity";
}

function simulateResourceInitialize(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "resource-initialize" }>
  >,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  if (fixedShapeResource(operation.resource)) {
    return { reason: "resource-fixed-shape", status: "rejected" };
  }
  if (locateResolvedMaterialResource(world, operation.resource)) {
    return { reason: "resource-collision", status: "rejected" };
  }
  if (
    (operation.resource.kind === "standard-spell-slot" ||
      operation.resource.kind === "pact-spell-slot" ||
      operation.resource.kind === "hit-die") &&
    operation.spec.kind !== "count"
  ) {
    return { reason: "resource-wrong-kind", status: "rejected" };
  }
  const initialized = initializeResource(
    operation.spec,
    operation.bindings,
    operation.observations
  );
  if (initialized.status === "needs-observation") return initialized;
  if (initialized.status === "rejected") {
    return { reason: `resource-${initialized.reason}`, status: "rejected" };
  }
  const candidate = insertResolvedMaterialResource(
    world,
    operation.resource,
    initialized.cell
  );
  if (!candidate) return { reason: "missing-target", status: "rejected" };
  const parsed = validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
  if (!parsed) {
    return { reason: "invalid-after", status: "rejected" };
  }
  return {
    actionFacts: [],
    execution: {
      facts: {
        cell: initialized.cell,
        observations: operation.observations,
      },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: parsed,
    status: "applied",
  };
}

function simulateResourceRemove(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<Extract<MechanicsOperation, { readonly kind: "resource-remove" }>>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  if (fixedShapeResource(operation.resource)) {
    return { reason: "resource-fixed-shape", status: "rejected" };
  }
  const location = locateResolvedMaterialResource(world, operation.resource);
  if (!location) return { reason: "resource-missing", status: "rejected" };
  const candidate = removeResolvedMaterialResource(world, operation.resource);
  if (!candidate) return { reason: "invalid-after", status: "rejected" };
  const parsed = validatedTransactionCandidate(
    candidate,
    world,
    causalState,
    inventorySourceLeases
  );
  if (!parsed) {
    return { reason: "invalid-after", status: "rejected" };
  }
  return {
    actionFacts: [],
    execution: {
      facts: { removed: location.cell },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    world: parsed,
    status: "applied",
  };
}

function simulateOperation(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<MechanicsOperation>,
  cause: Readonly<MechanicsOperationCause>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  causalState: Readonly<MechanicsCausalState>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): OperationSimulation {
  if (operation.kind === "turn-economy-transition") {
    return simulateTurnEconomyTransition(
      world,
      operation,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "entity-create") {
    return simulateEntityCreate(
      world,
      operation,
      authority,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "entity-availability") {
    return simulateEntityAvailability(
      world,
      operation,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "entity-controller") {
    return simulateEntityController(world, operation, causalState, inventorySourceLeases);
  }
  if (operation.kind === "inventory-create") {
    return simulateInventoryCreate(
      world,
      operation,
      authority,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "inventory-transition" || operation.kind === "inventory-end") {
    return simulateInventoryMutation(
      world,
      operation,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "program-root-create") {
    return simulateProgramRootCreate(
      world,
      operation,
      cause,
      authority,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "program-phase-transition") {
    return simulateProgramPhaseTransition(world, operation, cause, authority);
  }
  if (operation.kind === "program-register-transition") {
    return simulateProgramRegisterTransition(
      world,
      operation,
      cause,
      authority,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "occurrence-create") {
    return simulateOccurrenceCreate(
      world,
      operation,
      authority,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "occurrence-end") {
    return simulateOccurrenceEnd(world, operation);
  }
  if (operation.kind === "exhaustion-transition") {
    return simulateExhaustionTransition(
      world,
      operation,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "resource-transition") {
    return simulateResourceTransition(
      world,
      operation,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "resource-initialize") {
    return simulateResourceInitialize(
      world,
      operation,
      causalState,
      inventorySourceLeases
    );
  }
  if (operation.kind === "resource-remove") {
    return simulateResourceRemove(world, operation, causalState, inventorySourceLeases);
  }
  const targetRef = operationTarget(operation);
  const lookup = locateTarget(world, targetRef);
  if (lookup.status === "rejected") return lookup;
  const target = lookup.target;
  if (target.kind !== operationTargetKind(operation)) {
    return { reason: "wrong-target-kind", status: "rejected" };
  }

  const executed = executeOperation(operation, targetRef, target);
  if (executed.status === "rejected") return executed;
  if (executed.status === "no-change") {
    return {
      execution: {
        kind: operation.kind,
        operation,
        operationId: operation.operationId,
        reason: executed.reason,
        status: "no-change",
      } as MechanicsOperationNoChange,
      status: "no-change",
    };
  }
  const transition = executed.transition;
  if (transition.status === "already-applied") {
    if (executed.noChangeReason === null) {
      return { reason: "invalid-transition", status: "rejected" };
    }
    return {
      execution: {
        kind: operation.kind,
        operation,
        operationId: operation.operationId,
        reason: executed.noChangeReason,
        status: "no-change",
      } as MechanicsOperationNoChange,
      status: "no-change",
    };
  }
  if (transition.status === "rejected") {
    return { reason: rejectedTransition(transition.reason), status: "rejected" };
  }

  const parsed = validatedTransactionCandidate(
    withTargetVitals(world, target, transition.after),
    world,
    causalState,
    inventorySourceLeases
  );
  if (!parsed) {
    return { reason: "invalid-after", status: "rejected" };
  }
  return {
    actionFacts: executed.actionFacts,
    execution: {
      facts: visibleFacts(operation, transition.facts),
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    } as MechanicsOperationExecution,
    world: parsed,
    status: "applied",
  };
}

function actionFactKey(fact: ActionFactGuard): string {
  return `${journalActorRefKey(fact.owner)}\u0000${canonicalJson(fact.address)}`;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mergeActionFacts(
  facts: readonly ActionFactGuard[]
): readonly ActionFactGuard[] | null {
  const byKey = new Map<string, ActionFactGuard>();
  for (const fact of facts) {
    const key = actionFactKey(fact);
    const prior = byKey.get(key);
    if (
      prior &&
      (prior.lifecycle !== fact.lifecycle ||
        canonicalJson(prior.expected) !== canonicalJson(fact.expected))
    ) {
      return null;
    }
    if (!prior) byKey.set(key, structuredClone(fact));
  }
  return [...byKey.values()].sort((left, right) =>
    compareCodeUnits(actionFactKey(left), actionFactKey(right))
  );
}

function resourceDefinitionFactsPresent(
  world: Readonly<MechanicsWorld>,
  transaction: Readonly<MechanicsTransaction>
): boolean {
  return transaction.operations.every((operation) => {
    if (operation.kind !== "resource-transition") return true;
    const location = locateResolvedMaterialResource(world, operation.resource);
    if (!location) return true;
    const expected = resourceDefinitionFactGuard(
      location,
      operation.spec,
      operation.bindings
    );
    return transaction.factGuards.some(
      (fact) => canonicalJson(fact) === canonicalJson(expected)
    );
  });
}

function rejected(
  reason: MechanicsOperationRejection,
  operationId: string | null = null
): Extract<MechanicsTransactionSimulationResult, { readonly status: "rejected" }> {
  return { operationId, reason, status: "rejected" };
}

function mergeInventorySourceLeases(
  values: readonly Readonly<InventoryGenerationRef>[],
  additions: readonly Readonly<InventoryGenerationRef>[]
): readonly Readonly<InventoryGenerationRef>[] {
  const byKey = new Map(
    [...values, ...additions].map((lease) => [
      inventoryGenerationRefKey(lease),
      structuredClone(lease),
    ])
  );
  return [...byKey.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([, lease]) => lease);
}

function operationInventorySourceLease(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<MechanicsOperation>
): Readonly<InventoryGenerationRef> | null {
  const item =
    operation.kind === "inventory-end" ||
    (operation.kind === "inventory-transition" &&
      operation.change.kind === "quantity" &&
      operation.change.value === 0)
      ? operation.item
      : null;
  return item !== null && locateInventoryInstance(world, item) !== null ? item : null;
}

/**
 * Simulate every ordered operation and expose raw facts plus causal consequences.
 * Any rejection aborts the whole transaction; no partial plan can escape.
 */
function runMechanicsTransaction(
  transactionValue: unknown,
  contextValue: Readonly<MechanicsTransactionSimulationContext>,
  projectOnly: true
): MechanicsTransactionProjectionResult;
function runMechanicsTransaction(
  transactionValue: unknown,
  contextValue: Readonly<MechanicsTransactionSimulationContext>,
  projectOnly: false
): MechanicsTransactionSimulationResult;
function runMechanicsTransaction(
  transactionValue: unknown,
  contextValue: Readonly<MechanicsTransactionSimulationContext>,
  projectOnly: boolean
): MechanicsTransactionProjectionResult | MechanicsTransactionSimulationResult {
  const transaction = conformMechanicsTransaction(transactionValue);
  if (!transaction) return rejected("invalid-transaction");
  const phaseTransition = transaction.operations.find(
    (operation) => operation.kind === "program-phase-transition"
  );
  if (phaseTransition && transaction.operations.length !== 1) {
    return rejected("invalid-transaction", phaseTransition.operationId);
  }
  if (!exactRecord(contextValue, ["authoritySnapshot", "state"])) {
    return rejected("invalid-transaction");
  }
  const authoritySnapshot = conformMechanicsAuthoritySnapshot(
    contextValue.authoritySnapshot
  );
  if (!authoritySnapshot) return rejected("invalid-cause");
  const parsedState = conformMechanicsCausalState(contextValue.state);
  if (!parsedState.ok) return rejected("invalid-world");
  const before = parsedState.value;
  let world = before.world;
  let inventorySourceLeases = before.context.request.inventorySourceLeases;
  const actorPresent = entityExists(before.world, transaction.actor);
  const causesById = new Map(
    transaction.causes.map((cause) => [cause.causeId, cause] as const)
  );
  if (
    !actorPresent &&
    transaction.causes.some(
      ({ invocation }) => invocation.kind === "installed-capability"
    )
  ) {
    return rejected("missing-actor");
  }
  if (!resourceDefinitionFactsPresent(before.world, transaction)) {
    return rejected("missing-resource-definition-fact");
  }

  let changed = false;
  const actionFacts: ActionFactGuard[] = [...transaction.factGuards];
  const consequences: MechanicsOperationConsequence[] = [];
  const executions: Array<MechanicsOperationExecution | MechanicsOperationNoChange> = [];
  const stages: MechanicsOperationStage[] = [];
  const noChanges: MechanicsOperationNoChange[] = [];
  const resolvedCauses = new Map<string, Readonly<ResolvedOperationCause>>();
  const pendingTop = before.context.pendingFrames.at(-1);
  let nextProgramOriginSlot =
    pendingTop?.cursor.stage === "step" ? pendingTop.cursor.nextSlot : null;
  let activeProgramOriginStepId: string | null = null;
  const operationForCause = (causeId: string) =>
    transaction.operations.find((operation) => operation.causeId === causeId);
  for (const cause of transaction.causes.filter(
    ({ invocation }) => invocation.kind === "installed-capability"
  )) {
    const resolved = resolveOperationCause(
      before.world,
      authoritySnapshot,
      cause,
      transaction.actor
    );
    if (!resolved) {
      const firstOperation = operationForCause(cause.causeId);
      return rejected("invalid-cause", firstOperation?.operationId ?? null);
    }
    resolvedCauses.set(cause.causeId, resolved);
    actionFacts.push(...resolved.factGuards);
  }
  for (const cause of transaction.causes.filter(
    ({ invocation }) => invocation.kind === "program-root"
  )) {
    let resolved = resolveOperationCause(
      before.world,
      authoritySnapshot,
      cause,
      transaction.actor
    );
    if (!resolved && cause.invocation.kind === "program-root") {
      const creator = transaction.operations[0];
      const creatorAuthority = resolvedCauses.get(creator.causeId)?.authority;
      if (
        creator.kind === "program-root-create" &&
        creatorAuthority &&
        sameCanonical(creator.root, cause.invocation.occurrence) &&
        sameCanonical(creatorAuthority.installation.owner, transaction.actor) &&
        cause.causeId === mechanicsOperationCauseId(creatorAuthority, cause.invocation)
      ) {
        resolved = { authority: creatorAuthority, factGuards: [] };
      }
    }
    if (!resolved) {
      return rejected(
        "invalid-cause",
        operationForCause(cause.causeId)?.operationId ?? null
      );
    }
    resolvedCauses.set(cause.causeId, resolved);
  }
  if (
    !actorPresent &&
    transaction.causes.some((cause) => {
      const resolved = resolvedCauses.get(cause.causeId);
      return (
        cause.invocation.kind !== "program-root" ||
        !resolved ||
        !sameCanonical(resolved.authority.installation.owner, transaction.actor)
      );
    })
  ) {
    return rejected("missing-actor");
  }
  for (const operation of transaction.operations) {
    const cause = causesById.get(operation.causeId);
    if (!cause) return rejected("invalid-cause", operation.operationId);
    const resolvedCause = resolvedCauses.get(cause.causeId);
    if (!resolvedCause) return rejected("invalid-cause", operation.operationId);
    if (!causeAuthorizedByPendingTop(cause, resolvedCause, before)) {
      return rejected("invalid-cause", operation.operationId);
    }
    const programOrigin = newProgramOrigin(operation);
    if (programOrigin !== null && activeProgramOriginStepId === null) {
      activeProgramOriginStepId = programOrigin.origin.stepId;
    }
    if (
      !newProgramOriginAuthorizedByPendingTop(
        operation,
        cause,
        before,
        nextProgramOriginSlot,
        activeProgramOriginStepId
      )
    ) {
      return rejected("invalid-cause", operation.operationId);
    }
    if (programOrigin !== null) {
      if (
        nextProgramOriginSlot === null ||
        nextProgramOriginSlot === Number.MAX_SAFE_INTEGER
      ) {
        return rejected("invalid-cause", operation.operationId);
      }
      nextProgramOriginSlot += 1;
    }
    if (!programRegisterAuthorizedByPendingTop(operation, before)) {
      return rejected("invalid-cause", operation.operationId);
    }
    const authorityLease = inventorySourceLease(resolvedCause.authority);
    const operationLease = operationInventorySourceLease(world, operation);
    inventorySourceLeases = mergeInventorySourceLeases(
      inventorySourceLeases,
      [authorityLease, operationLease].filter(
        (lease): lease is Readonly<InventoryGenerationRef> => lease !== null
      )
    );
    const stageBefore = projectMechanicsTransactionWorld(
      world,
      world,
      inventorySourceLeases,
      before
    );
    if (!stageBefore.ok) return rejected("invalid-after", operation.operationId);
    const result = simulateOperation(
      stageBefore.value,
      operation,
      cause,
      resolvedCause.authority,
      before,
      inventorySourceLeases
    );
    if (result.status === "rejected") {
      return rejected(result.reason, operation.operationId);
    }
    if (result.status === "needs-observation") {
      return {
        boundary: result.boundary,
        operationId: operation.operationId,
        requirement: result.requirement,
        status: "needs-observation",
        transaction,
      };
    }
    if (result.status === "needs-boundary") {
      return {
        boundary: result.boundary,
        operationId: operation.operationId,
        status: "needs-boundary",
        transaction,
      };
    }
    executions.push(result.execution);
    if (result.status === "no-change") {
      noChanges.push(result.execution);
      continue;
    }
    const stageAfter = projectMechanicsTransactionWorld(
      result.world,
      stageBefore.value,
      inventorySourceLeases,
      before
    );
    if (!stageAfter.ok) return rejected("invalid-after", operation.operationId);
    const operationChanged =
      canonicalJson(stageAfter.value) !== canonicalJson(stageBefore.value);
    const afterWorld = operationChanged ? stageAfter.value : stageBefore.value;
    stages.push({
      after: afterWorld,
      before: stageBefore.value,
      execution: result.execution,
    });
    changed ||= operationChanged;
    world = afterWorld;
    actionFacts.push(...result.actionFacts);
    consequences.push(...(result.consequences ?? []));
  }

  const facts = mergeActionFacts(actionFacts);
  if (!facts) return rejected("fact-conflict");
  if (projectOnly) {
    return {
      actionFacts: facts,
      changed: changed || consequences.length > 0,
      consequences,
      executions,
      projection: issueMechanicsTransactionProjection(
        before,
        world,
        inventorySourceLeases
      ),
      stages,
      status: "projected",
      transaction,
    };
  }
  if (!changed && consequences.length === 0) {
    return {
      actionFacts: [],
      consequences: [],
      executions: noChanges,
      stages: [],
      state: before,
      status: "no-change",
      transaction,
    };
  }
  const phaseAccepted = phaseTransition
    ? acceptMechanicsPendingFramePhaseTransition(
        world,
        before,
        before.context.pendingFrames.at(-1)?.frame,
        inventorySourceLeases,
        consequences.map(({ occurrence }) => occurrence)
      )
    : null;
  const finalState = phaseAccepted
    ? phaseAccepted
    : rebaseMechanicsCausalState(
        world,
        before,
        inventorySourceLeases,
        consequences.map(({ occurrence }) => occurrence)
      );
  if (!finalState.ok) {
    return rejected(
      "invalid-after",
      transaction.operations[transaction.operations.length - 1]?.operationId ?? null
    );
  }

  return {
    actionFacts: facts,
    consequences,
    executions,
    stages,
    state: finalState.value,
    status: "simulated",
    transaction,
  };
}

/**
 * Project a complete ordered prefix for the compiler without discovering or
 * latching causal endings. The returned world is transient and cannot persist.
 */
export function projectMechanicsTransaction(
  transactionValue: unknown,
  contextValue: Readonly<MechanicsTransactionSimulationContext>
): MechanicsTransactionProjectionResult {
  return runMechanicsTransaction(transactionValue, contextValue, true);
}

/** Simulate one complete atomic transaction and perform its sole causal rebase. */
export function simulateMechanicsTransaction(
  transactionValue: unknown,
  contextValue: Readonly<MechanicsTransactionSimulationContext>
): MechanicsTransactionSimulationResult {
  return runMechanicsTransaction(transactionValue, contextValue, false);
}
