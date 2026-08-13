/** Pure composition of one terminal mechanics operation into one journal plan. */

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
import { addOccurrence, conformNewMechanicOccurrence } from "@/lib/mechanic-occurrences";
import {
  MECHANIC_OCCURRENCE_SCHEMA_REFS,
  type MechanicOccurrenceSchemaRefTypes,
} from "@/lib/mechanic-occurrence-schema";
import { conformMechanicsInvocationRef } from "@/lib/mechanics-authority-ref";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import {
  MATERIAL_REF_SCHEMA,
  conformEntityRef,
  conformOccurrenceRef,
} from "@/lib/mechanics-reference-schema";
import { planMechanicsWorldAction } from "@/lib/mechanics-action";
import {
  closeMechanicsWorld,
  finalizeMechanicsMaterialCleanup,
  parseMechanicsWorld,
  parseMechanicsWorldTransactionState,
} from "@/lib/mechanics-world";
import {
  conformResourceOperation,
  conformResourceRef,
  conformResourceSpec,
  initializeResource,
  reduceResource,
} from "@/lib/resources";
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
import type { NewMechanicOccurrence } from "@/types/mechanic-occurrence";
import type { EntityRef, MaterialRef, OccurrenceRef } from "@/types/mechanics-reference";
import type {
  CreatureMaterialEntity,
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
  type MechanicsOperationExecution,
  type MechanicsOperationNoChange,
  type MechanicsOperationNoChangeReasonByKind,
  type MechanicsOperationRejection,
  type MechanicsOperationSchemaCustomTypes,
  type MechanicsOperationStage,
  type MechanicsTransaction,
  type MechanicsTransactionResult,
} from "@/types/mechanics-operation";
import type {
  InventorySourceLease,
  MechanicsDocument,
  MechanicsWorld,
} from "@/types/mechanics-world";
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
  | "canonical-fingerprint"
  | "mechanics-invocation-ref"
  | "mechanics-program-authority-receipt"
>;

const CAUSE_CONTEXT: ExactSchemaContext<
  MechanicsOperationCauseSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "canonical-fingerprint": conformCanonicalFingerprint,
    "mechanics-invocation-ref": conformMechanicsInvocationRef,
    "mechanics-program-authority-receipt": conformMechanicsProgramAuthorityReceipt,
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
  const cause = conformCauseStructure(value);
  if (
    !cause ||
    cause.causeId !==
      canonicalFingerprint({
        authority: cause.authority,
        invocation: cause.invocation,
      }) ||
    (cause.invocation.kind === "installed-capability" &&
      !sameCanonical(cause.invocation.installation, cause.authority.installation))
  ) {
    return null;
  }
  return cause;
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
    "journal-actor": journalActor,
    "material-ref": conformMaterialRef,
    "canonical-fingerprint": conformCanonicalFingerprint,
    "mechanics-invocation-ref": conformMechanicsInvocationRef,
    "mechanics-operation-cause": conformMechanicsOperationCause,
    "mechanics-program-authority-receipt": conformMechanicsProgramAuthorityReceipt,
    "new-effect-occurrence": (value) => {
      const occurrence = conformNewMechanicOccurrence(value);
      return occurrence?.kind === "program" ? null : occurrence;
    },
    "nonnegative-integer": (value) => integer(value, 0),
    "occurrence-ref": conformOccurrenceRef,
    "positive-integer": (value) => integer(value, 1),
    "resource-operation": conformResourceOperation,
    "resource-ref": conformResourceRef,
    "resource-spec": conformResourceSpec,
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
  const createdRootsByCause = new Map<string, number>();
  for (const operation of transaction.operations) {
    const cause = causesById.get(operation.causeId);
    if (!cause) return false;
    usedCauseIds.add(operation.causeId);
    if (
      operation.kind !== "occurrence-create" ||
      operation.occurrence.kind !== "program"
    ) {
      continue;
    }
    const createdRoots = (createdRootsByCause.get(operation.causeId) ?? 0) + 1;
    if (
      cause.invocation.kind !== "installed-capability" ||
      createdRoots > 1 ||
      !conformNewMechanicOccurrence({
        ...operation.occurrence,
        authority: cause.authority,
      })
    ) {
      return false;
    }
    createdRootsByCause.set(operation.causeId, createdRoots);
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
  if (!entity) return { reason: "missing-target", status: "rejected" };
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
  return document.state.entities[actor.entityId]?.availability === "present";
}

function occurrenceAt(
  world: Readonly<MechanicsWorld>,
  reference: Readonly<OccurrenceRef>
) {
  return documentFor(world, reference.material)?.document.state.occurrences[
    reference.occurrenceId
  ];
}

function causeAuthorityResolves(
  world: Readonly<MechanicsWorld>,
  cause: Readonly<MechanicsOperationCause>
): boolean {
  if (cause.invocation.kind === "program-root") {
    const root = occurrenceAt(world, cause.invocation.occurrence);
    if (root?.kind !== "program" || !sameCanonical(root.authority, cause.authority)) {
      return false;
    }
  }

  const source = cause.authority.source;
  if (source.kind !== "inventory-item") return true;
  const document = documentFor(world, source.owner)?.document;
  const instance =
    document?.kind === "character"
      ? document.state.inventory[source.instanceId]
      : undefined;
  return (
    instance?.ordinal === source.instanceOrdinal &&
    (cause.invocation.kind === "program-root" || instance.quantity.current > 0)
  );
}

function inventorySourceLease(
  cause: Readonly<MechanicsOperationCause>
): Readonly<InventorySourceLease> | null {
  const source = cause.authority.source;
  return source.kind === "inventory-item"
    ? {
        instanceId: source.instanceId,
        instanceOrdinal: source.instanceOrdinal,
        material: source.owner,
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

function occurrenceRefKey(reference: Readonly<OccurrenceRef>): string {
  return `${materialRefKey(reference.material)}\u0000${reference.occurrenceId}`;
}

function occurrenceRefs(world: Readonly<MechanicsWorld>): Map<string, OccurrenceRef> {
  const references = new Map<string, OccurrenceRef>();
  for (const document of world.documents) {
    for (const occurrenceId of Object.keys(document.state.occurrences)) {
      const reference = { material: document.material, occurrenceId };
      references.set(occurrenceRefKey(reference), reference);
    }
  }
  return references;
}

function endedOccurrences(
  before: Readonly<MechanicsWorld>,
  after: Readonly<MechanicsWorld>,
  additionallyEnded: readonly OccurrenceRef[] = []
): readonly OccurrenceRef[] {
  const afterKeys = occurrenceRefs(after);
  const byKey = new Map<string, OccurrenceRef>();
  for (const [key, reference] of occurrenceRefs(before)) {
    if (!afterKeys.has(key)) byKey.set(key, reference);
  }
  for (const reference of additionallyEnded) {
    byKey.set(occurrenceRefKey(reference), reference);
  }
  return [...byKey.values()].sort((left, right) =>
    occurrenceRefKey(left).localeCompare(occurrenceRefKey(right))
  );
}

function withOccurrence(
  world: Readonly<MechanicsWorld>,
  material: Readonly<MaterialRef>,
  occurrenceId: string,
  occurrence: Readonly<NewMechanicOccurrence>,
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
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
  const parsed = parseMechanicsWorldTransactionState(candidate, inventorySourceLeases);
  return parsed.ok ? parsed.value : null;
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

function sameNewOccurrence(
  existing: Readonly<import("@/types/mechanic-occurrence").MechanicOccurrence>,
  expected: Readonly<NewMechanicOccurrence>
): boolean {
  const body = structuredClone(existing) as unknown as UnknownRecord;
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
      readonly execution: MechanicsOperationExecution;
      readonly status: "applied";
      readonly world: Readonly<MechanicsWorld>;
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
        entityRefKey(occurrence.target) === key
      ) {
        references.push({ material: document.material, occurrenceId });
      }
    }
  }
  return references;
}

function closeOccurrenceRefs(
  world: Readonly<MechanicsWorld>,
  references: readonly OccurrenceRef[],
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
): Readonly<MechanicsWorld> | null {
  const byMaterial = new Map<
    string,
    { material: MaterialRef; occurrenceIds: string[] }
  >();
  for (const reference of references) {
    const key = materialRefKey(reference.material);
    const entry = byMaterial.get(key) ?? {
      material: reference.material,
      occurrenceIds: [],
    };
    entry.occurrenceIds.push(reference.occurrenceId);
    byMaterial.set(key, entry);
  }
  const result = closeMechanicsWorld(world, {
    boundaries: [],
    inventorySourceLeases,
    removals: [...byMaterial.values()].map(({ material, occurrenceIds }) => ({
      material,
      occurrenceIds: [...occurrenceIds].sort(),
    })),
  });
  return result.status === "rejected" ? null : result.world;
}

function simulateOccurrenceCreate(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "occurrence-create" }>
  >,
  cause: Readonly<MechanicsOperationCause>,
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
): OperationSimulation {
  const document = documentFor(world, operation.material)?.document;
  if (!document) return { reason: "missing-target", status: "rejected" };
  if (operation.occurrence.kind === "program") {
    if (cause.invocation.kind !== "installed-capability") {
      return { reason: "invalid-cause", status: "rejected" };
    }
  } else {
    const parent = document.state.occurrences[operation.occurrence.parentId];
    if (parent?.kind !== "program" || !sameCanonical(parent.authority, cause.authority)) {
      return { reason: "invalid-cause", status: "rejected" };
    }
  }
  const occurrence: NewMechanicOccurrence =
    operation.occurrence.kind === "program"
      ? { ...operation.occurrence, authority: cause.authority }
      : operation.occurrence;
  const existing = document.state.occurrences[operation.occurrenceId];
  if (existing) {
    return sameNewOccurrence(existing, occurrence)
      ? noChangeExecution(operation, "occurrence-already-active")
      : { reason: "occurrence-collision", status: "rejected" };
  }
  if (operation.occurrence.kind === "program") {
    const after = withOccurrence(
      world,
      operation.material,
      operation.occurrenceId,
      occurrence,
      inventorySourceLeases
    );
    if (!after) return { reason: "invalid-after", status: "rejected" };
    const created = {
      material: operation.material,
      occurrenceId: operation.occurrenceId,
    } satisfies OccurrenceRef;
    return {
      actionFacts: [],
      execution: {
        facts: {
          created,
          ended: endedOccurrences(
            world,
            after,
            occurrenceAt(after, created) ? [] : [created]
          ),
        },
        kind: operation.kind,
        operation,
        operationId: operation.operationId,
        status: "applied",
      },
      status: "applied",
      world: after,
    };
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
    operation.conditionImmunityOverride === null &&
    effectiveConditionImmunities(world, operation.occurrence.target).has(
      operation.occurrence.conditionId
    )
  ) {
    return noChangeExecution(operation, "condition-immune");
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
    operation.material,
    operation.occurrenceId,
    occurrence,
    inventorySourceLeases
  );
  if (!after) return { reason: "invalid-after", status: "rejected" };
  const created = {
    material: operation.material,
    occurrenceId: operation.occurrenceId,
  } satisfies OccurrenceRef;
  const ended = endedOccurrences(
    world,
    after,
    occurrenceAt(after, created) ? [] : [created]
  );
  return {
    actionFacts: [],
    execution: {
      facts: { created, ended },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    status: "applied",
    world: after,
  };
}

function simulateOccurrenceEnd(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<Extract<MechanicsOperation, { readonly kind: "occurrence-end" }>>,
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
): OperationSimulation {
  if (!occurrenceAt(world, operation.occurrence)) {
    return noChangeExecution(operation, "occurrence-not-active");
  }
  const after = closeOccurrenceRefs(world, [operation.occurrence], inventorySourceLeases);
  if (!after) return { reason: "invalid-after", status: "rejected" };
  return {
    actionFacts: [],
    execution: {
      facts: { created: null, ended: endedOccurrences(world, after) },
      kind: operation.kind,
      operation,
      operationId: operation.operationId,
      status: "applied",
    },
    status: "applied",
    world: after,
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
  return entity?.kind === "creature" ? entity.exhaustion : null;
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
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
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
  const parsed = parseMechanicsWorldTransactionState(
    withTargetExhaustion(world, lookup.target, after, vitals),
    inventorySourceLeases
  );
  if (!parsed.ok) {
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
    status: "applied",
    world: parsed.value,
  };
}

function simulateResourceTransition(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<
    Extract<MechanicsOperation, { readonly kind: "resource-transition" }>
  >,
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
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
  const parsed = parseMechanicsWorldTransactionState(candidate, inventorySourceLeases);
  if (!parsed.ok) {
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
    status: "applied",
    world: parsed.value,
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
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
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
  const parsed = parseMechanicsWorldTransactionState(candidate, inventorySourceLeases);
  if (!parsed.ok) {
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
    status: "applied",
    world: parsed.value,
  };
}

function simulateResourceRemove(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<Extract<MechanicsOperation, { readonly kind: "resource-remove" }>>,
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[]
): OperationSimulation {
  if (fixedShapeResource(operation.resource)) {
    return { reason: "resource-fixed-shape", status: "rejected" };
  }
  const location = locateResolvedMaterialResource(world, operation.resource);
  if (!location) return { reason: "resource-missing", status: "rejected" };
  const candidate = removeResolvedMaterialResource(world, operation.resource);
  if (!candidate) return { reason: "invalid-after", status: "rejected" };
  const parsed = parseMechanicsWorldTransactionState(candidate, inventorySourceLeases);
  if (!parsed.ok) {
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
    status: "applied",
    world: parsed.value,
  };
}

function simulateOperation(
  world: Readonly<MechanicsWorld>,
  operation: Readonly<MechanicsOperation>,
  cause: Readonly<MechanicsOperationCause>,
  inventorySourceLeases: readonly Readonly<InventorySourceLease>[] = []
): OperationSimulation {
  if (operation.kind === "occurrence-create") {
    return simulateOccurrenceCreate(world, operation, cause, inventorySourceLeases);
  }
  if (operation.kind === "occurrence-end") {
    return simulateOccurrenceEnd(world, operation, inventorySourceLeases);
  }
  if (operation.kind === "exhaustion-transition") {
    return simulateExhaustionTransition(world, operation, inventorySourceLeases);
  }
  if (operation.kind === "resource-transition") {
    return simulateResourceTransition(world, operation, inventorySourceLeases);
  }
  if (operation.kind === "resource-initialize") {
    return simulateResourceInitialize(world, operation, inventorySourceLeases);
  }
  if (operation.kind === "resource-remove") {
    return simulateResourceRemove(world, operation, inventorySourceLeases);
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

  const parsed = parseMechanicsWorldTransactionState(
    withTargetVitals(world, target, transition.after),
    inventorySourceLeases
  );
  if (!parsed.ok) {
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
    status: "applied",
    world: parsed.value,
  };
}

function actionFactKey(fact: ActionFactGuard): string {
  return `${journalActorRefKey(fact.owner)}\u0000${canonicalJson(fact.address)}`;
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
  return [...byKey.values()];
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
): MechanicsTransactionResult {
  return { operationId, reason, status: "rejected" };
}

/**
 * Simulate every ordered consequence, then diff the complete world exactly once.
 * Any rejection aborts the whole transaction; no partial plan can escape.
 */
export function planMechanicsTransaction(
  worldValue: unknown,
  transactionValue: unknown
): MechanicsTransactionResult {
  const transaction = conformMechanicsTransaction(transactionValue);
  if (!transaction) return rejected("invalid-transaction");
  const parsedWorld = parseMechanicsWorld(worldValue);
  if (!parsedWorld.ok) return rejected("invalid-world");
  const before = parsedWorld.value;
  if (!entityExists(before, transaction.actor)) return rejected("missing-actor");
  const causesById = new Map(
    transaction.causes.map((cause) => [cause.causeId, cause] as const)
  );
  for (const cause of transaction.causes) {
    if (!causeAuthorityResolves(before, cause)) {
      const operation = transaction.operations.find(
        ({ causeId }) => causeId === cause.causeId
      );
      if (!operation) return rejected("invalid-transaction");
      return rejected("invalid-cause", operation.operationId);
    }
  }
  if (!resourceDefinitionFactsPresent(before, transaction)) {
    return rejected("missing-resource-definition-fact");
  }

  const inventorySourceLeases = [
    ...new Map(
      transaction.causes.flatMap((cause) => {
        const lease = inventorySourceLease(cause);
        return lease
          ? [
              [
                `${materialRefKey(lease.material)}\u0000${lease.instanceId}\u0000${lease.instanceOrdinal}`,
                lease,
              ] as const,
            ]
          : [];
      })
    ).values(),
  ];

  let world = before;
  let changed = false;
  const actionFacts: ActionFactGuard[] = [...transaction.factGuards];
  const executions: Array<MechanicsOperationExecution | MechanicsOperationNoChange> = [];
  const stages: MechanicsOperationStage[] = [];
  const noChanges: MechanicsOperationNoChange[] = [];
  for (const operation of transaction.operations) {
    const cause = causesById.get(operation.causeId);
    if (!cause) return rejected("invalid-cause", operation.operationId);
    const result = simulateOperation(world, operation, cause, inventorySourceLeases);
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
    executions.push(result.execution);
    if (result.status === "no-change") {
      noChanges.push(result.execution);
      continue;
    }
    stages.push({ after: result.world, before: world, execution: result.execution });
    changed = true;
    world = result.world;
    actionFacts.push(...result.actionFacts);
  }

  if (changed) {
    const cleanup = finalizeMechanicsMaterialCleanup(world);
    if (cleanup.status === "rejected") return rejected("invalid-after");
    world = cleanup.world;
  }

  if (!changed) {
    return {
      executions: noChanges,
      status: "no-change",
      transaction,
      world: before,
    };
  }
  const facts = mergeActionFacts(actionFacts);
  if (!facts) return rejected("fact-conflict");
  const plan = planMechanicsWorldAction(before, world, {
    actor: transaction.actor,
    facts,
    id: transaction.actionId,
  });
  if (plan.status !== "planned") return rejected("action-planner-rejected");

  return {
    action: plan.action,
    executions,
    stages,
    status: "planned",
    transaction,
    world,
  };
}
