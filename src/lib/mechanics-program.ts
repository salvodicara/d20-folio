/** Pure MechanicsProgram requirement, review and planning runtime. */

import {
  conformActionFactGuard,
  entityRefKey,
  materialRefKey,
} from "@/lib/action-journal";
import { canonicalJson } from "@/lib/canonical-fingerprint";
import {
  conformD20TestObservation,
  conformD20TestRequest,
  evaluateD20Test,
  reviewD20Test,
} from "@/lib/d20-test";
import {
  countAuthorizedDiceReplacementUses,
  conformDiceObservation,
  evaluateDiceReplacementPolicy,
  evaluateDiceFormula,
  resolveDiceObservation,
} from "@/lib/dice-formula";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import { conformMechanicsExecutionFrame } from "@/lib/mechanics-command-boundary";
import {
  isAuthenticMechanicsEventEmission,
  issueMechanicsSubscriberSelection,
  mechanicsSubscriberSelectionFiber,
} from "@/lib/mechanics-event-selection";
import {
  conformEntityRef,
  occurrenceGenerationRefKey,
} from "@/lib/mechanics-reference-schema";
import {
  MECHANICS_ANSWERS_SCHEMA,
  MECHANICS_INTENT_SCHEMA,
  type MechanicsProgramSchemaCustomTypes,
} from "@/lib/mechanics-program-schema";
import { type MechanicsD20RequestSpec } from "@/lib/mechanics-program-authoring";
import { locateResolvedMaterialResource } from "@/lib/material-resource";
import {
  conformMechanicsCausalState,
  projectMechanicsTransactionWorld,
  pushMechanicsSelectedEventPendingFrame,
} from "@/lib/mechanics-world";
import { mechanicsTransactionProjectionFiber } from "@/lib/mechanics-transaction-projection";
import { conformResourceRef, resourceRefKey } from "@/lib/resources";
import type { JournalActorRef } from "@/types/action-journal";
import type { D20TestObservation, D20TestRequest, D20TestResult } from "@/types/d20-test";
import type {
  DiceObservation,
  ResolvedDiceReplacementRule,
  ResolvedDiceTrail,
} from "@/types/dice-formula";
import type {
  MechanicsEvent,
  MechanicsSubscriberDispatchResult,
  MechanicsSubscriberSelection,
  MechanicsSubscriberSelectionResult,
} from "@/types/mechanics-execution";
import type {
  EffectOccurrence,
  MechanicOccurrence,
  ProgramOccurrence,
  StandingFact,
} from "@/types/mechanic-occurrence";
import type {
  CharacterMaterialRef,
  EntityRef,
  MaterialRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import type {
  MechanicsAnswer,
  MechanicsAnswers,
  MechanicsRequestIdentity,
  MechanicsD20Requirement,
  MechanicsDiceRequirement,
  MechanicsIntent,
  MechanicsPaymentRequirement,
  MechanicsProgramCompilationContext,
  MechanicsProgramCompilationPreparation,
  MechanicsRequirement,
  MechanicsRequirementsRejection,
  MechanicsRequirementsResult,
  MechanicsReviewRejection,
  MechanicsReviewResult,
  MechanicsRoles,
  ResolvedMechanicsAnswer,
  ReviewedMechanicsIntent,
  ReviewedMechanicsPayment,
} from "@/types/mechanics-program";
import type { MechanicsTransactionProjection } from "@/types/mechanics-operation";
import type {
  MechanicsAmountSpec,
  MechanicsEntitySelector,
  MechanicsInput,
  MechanicsPredicate,
  MechanicsProgram,
  MechanicsProgramPhase,
  MechanicsRole,
  MechanicsStep,
} from "@/types/mechanics-program-authoring";
import type { InventoryInstance, MaterialEntity } from "@/types/material-state";
import type { MechanicsTriggerEvidence } from "@/types/mechanics-trigger";
import type {
  MechanicsDocument,
  MechanicsPendingFrame,
  MechanicsWorld,
} from "@/types/mechanics-world";
import type { ResourceRef, ResourceSelector, ResourceTerm } from "@/types/resource";

export type {
  ManualInstruction,
  MechanicsAnswer,
  MechanicsAnswers,
  MechanicsRequestIdentity,
  MechanicsD20Requirement,
  MechanicsDiceRequirement,
  MechanicsIntent,
  MechanicsRequirement,
  MechanicsRequirementActivation,
  MechanicsRequirementsRejection,
  MechanicsRequirementsResult,
  MechanicsReviewRejection,
  MechanicsReviewResult,
  MechanicsRoles,
  MechanicsTriggerEvidence,
  ResolvedMechanicsAnswer,
  ReviewedMechanicsIntent,
  ReviewedMechanicsPayment,
} from "@/types/mechanics-program";

const MAX_FACT_GUARDS = 128;
const MAX_PROGRAM_NODES = 512;
const MAX_BINDINGS = 256;
const MAX_TARGETS = 256;
const MAX_PAYMENTS = 64;
const MAX_RESOURCE_AMOUNT = 1_000_000_000;
const MAX_EVENT_SUBSCRIBERS = 2_048;
const ROLES = new Set<MechanicsRole>([
  "owner",
  "source",
  "target",
  "caster",
  "activator",
  "triggering-attacker",
  "victim",
]);
/**
 * Possession proofs for kernel-issued reviews. A reviewed intent's mutable
 * eligibility (payment affordability, target liveness) is proved exactly once
 * against the closed basis that reviewed it; later compile segments authenticate
 * the same frozen value instead of re-deriving truths the action itself has
 * legitimately consumed. A cloned or reconstructed review re-derives fully.
 */
const authenticReviewedIntents = new WeakSet<object>();

const mechanicsEventSubscriberAudiences = new WeakMap<
  object,
  Readonly<MechanicsSubscriberSelectionResult>
>();

function freezeDeep<T>(value: T): Readonly<T> {
  const visited = new WeakSet<object>();
  const visit = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || visited.has(entry)) return;
    visited.add(entry);
    Object.values(entry).forEach(visit);
    if (!Object.isFrozen(entry)) Object.freeze(entry);
  };
  visit(value);
  return value;
}

function safeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER): number | null {
  return Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    (value as number) >= minimum
    ? (value as number)
    : null;
}

function characterMaterialRef(value: unknown): CharacterMaterialRef | null {
  const reference = conformEntityRef({ material: value, entityId: "self" });
  return reference?.material.kind === "character-play" ? reference.material : null;
}

const PROGRAM_SCHEMA_CONTEXT: ExactSchemaContext<
  MechanicsProgramSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "action-fact": conformActionFactGuard,
    "character-material-ref": characterMaterialRef,
    "d20-observation": conformD20TestObservation,
    "dice-observation": conformDiceObservation,
    "entity-ref": conformEntityRef,
    id: (value) =>
      typeof value === "string" && value.length > 0 && value.trim() === value
        ? value
        : null,
    "mechanics-execution-frame": conformMechanicsExecutionFrame,
    "positive-integer": (value) => safeInteger(value, 1),
    "resource-ref": conformResourceRef,
    "signed-integer": (value) => safeInteger(value),
  },
  refs: {},
};
const conformIntentStructure = exactConformer(
  MECHANICS_INTENT_SCHEMA,
  PROGRAM_SCHEMA_CONTEXT
);
const conformAnswersStructure = exactConformer(
  MECHANICS_ANSWERS_SCHEMA,
  PROGRAM_SCHEMA_CONTEXT
);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function conformMechanicsIntent(value: unknown): Readonly<MechanicsIntent> | null {
  const intent = conformIntentStructure(value);
  return intent && intent.factGuards.length <= MAX_FACT_GUARDS ? intent : null;
}

function conformMechanicsAnswers(value: unknown): Readonly<MechanicsAnswers> | null {
  const answers = conformAnswersStructure(value);
  return answers &&
    answers.length <= MAX_PROGRAM_NODES &&
    answers.every(
      (answer) =>
        (answer.kind !== "entities" || answer.targets.length <= MAX_TARGETS) &&
        ((answer.kind !== "d20" && answer.kind !== "dice") ||
          (answer.requests.length <= MAX_TARGETS &&
            answer.requests.every((request) => request.payments.length <= MAX_PAYMENTS)))
    )
    ? answers
    : null;
}

function exactEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface MechanicsExecutionContext {
  readonly actor: JournalActorRef;
  readonly authority: MechanicsIntent["frame"]["authority"];
  readonly bindings: Readonly<Record<string, number>>;
  readonly execution: number;
  readonly intent: Readonly<MechanicsIntent>;
  readonly phaseId: string;
  readonly program: MechanicsProgram;
  readonly roles: MechanicsRoles;
  readonly rootOccurrence: OccurrenceGenerationRef;
  readonly rootReceipt: MechanicsIntent["frame"]["rootReceipt"];
  readonly trigger: MechanicsTriggerEvidence;
  readonly triggerEventId: string | null;
}

function derivedRoles(
  authority: MechanicsIntent["frame"]["authority"],
  trigger: MechanicsTriggerEvidence
): MechanicsRoles {
  return {
    ...authority.anchors,
    "triggering-attacker": trigger.kind === "damage-taken" ? trigger.attacker : null,
    victim:
      trigger.kind === "damage-taken"
        ? trigger.resolution.packet.target
        : trigger.kind === "hit-points-zero"
          ? trigger.target
          : null,
  };
}

function executionContext(
  intent: Readonly<MechanicsIntent>
): MechanicsExecutionContext | null {
  const { authority, rootReceipt, trigger } = intent.frame;
  const program = authority.snapshot.program;
  const bindingKeys = Object.keys(authority.staticBindings);
  if (
    !program ||
    bindingKeys.length > MAX_BINDINGS ||
    bindingKeys.some(
      (key) =>
        key.startsWith("trigger.") ||
        key.startsWith("register.") ||
        key.startsWith("phase.") ||
        key === "input-total"
    )
  ) {
    return null;
  }
  return {
    actor: authority.installation.owner,
    authority,
    bindings: authority.staticBindings,
    execution: rootReceipt.next.execution,
    intent,
    phaseId: rootReceipt.next.phaseId,
    program,
    roles: derivedRoles(authority, trigger),
    rootOccurrence: rootReceipt.root,
    rootReceipt,
    trigger,
    triggerEventId: rootReceipt.next.triggerEventId,
  };
}

function documentFor(
  world: Pick<MechanicsWorld, "documents">,
  material: MaterialRef
): MechanicsDocument | null {
  const key = materialRefKey(material);
  return (
    world.documents.find((document) => materialRefKey(document.material) === key) ?? null
  );
}

type WorldEntity =
  | {
      readonly document: Extract<MechanicsDocument, { readonly kind: "character" }>;
      readonly entity: null;
      readonly kind: "creature";
      readonly ref: EntityRef;
    }
  | {
      readonly document: MechanicsDocument;
      readonly entity: MaterialEntity;
      readonly kind: MaterialEntity["kind"];
      readonly ref: EntityRef;
    };

function worldEntity(world: MechanicsWorld, ref: EntityRef): WorldEntity | null {
  const document = documentFor(world, ref.material);
  if (!document) return null;
  if (ref.entityId === "self") {
    return document.kind === "character"
      ? { document, entity: null, kind: "creature", ref }
      : null;
  }
  const entity = document.state.entities[ref.entityId];
  return entity !== undefined &&
    entity.ordinal === ref.ordinal &&
    entity.availability === "present"
    ? { document, entity, kind: entity.kind, ref }
    : null;
}

function occurrenceFor(
  world: MechanicsWorld,
  reference: OccurrenceGenerationRef
): MechanicOccurrence | null {
  const occurrence =
    documentFor(world, reference.occurrence.material)?.state.occurrences[
      reference.occurrence.occurrenceId
    ] ?? null;
  return occurrence?.ordinal === reference.ordinal ? occurrence : null;
}

function resolvedProgramRootGeneration(
  world: MechanicsWorld,
  reference: OccurrenceGenerationRef
): OccurrenceGenerationRef | null {
  const occurrence = occurrenceFor(world, reference);
  if (!occurrence) return null;
  if (occurrence.kind === "program") return reference;
  const rootOccurrence = {
    material: reference.occurrence.material,
    occurrenceId: occurrence.parentId,
  };
  const root = documentFor(world, rootOccurrence.material)?.state.occurrences[
    rootOccurrence.occurrenceId
  ];
  return root?.kind === "program"
    ? { occurrence: rootOccurrence, ordinal: root.ordinal }
    : null;
}

function roleEntity(
  intent: MechanicsExecutionContext,
  role: MechanicsRole
): EntityRef | null {
  return intent.roles[role];
}

function requestIdentities(
  bindings: readonly EntityRef[]
): readonly MechanicsRequestIdentity[] {
  const ordinalByBinding = new Map<string, number>();
  return bindings.map((binding) => {
    const key = entityRefKey(binding);
    const ordinal = (ordinalByBinding.get(key) ?? 0) + 1;
    ordinalByBinding.set(key, ordinal);
    return { binding, ordinal };
  });
}

function resolveTargets(
  selector: MechanicsEntitySelector,
  intent: MechanicsExecutionContext,
  resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>,
  bindings: Readonly<Record<string, number>>
): readonly MechanicsRequestIdentity[] | null {
  if (selector.kind === "role") {
    const target = roleEntity(intent, selector.role);
    return target ? [{ binding: target, ordinal: 1 }] : null;
  }
  const answer = resolved[selector.inputId];
  if (selector.kind === "input") {
    return answer?.kind === "entities" ? requestIdentities(answer.targets) : null;
  }
  if (selector.kind === "dice-total") {
    if (answer?.kind !== "dice") return null;
    const value = evaluateIntegerExpression(selector.value, bindings);
    if (value === null) return null;
    const groups = new Map<
      string,
      { readonly binding: EntityRef; readonly requests: typeof answer.requests }
    >();
    for (const request of answer.requests) {
      const key = entityRefKey(request.identity.binding);
      const group = groups.get(key);
      groups.set(
        key,
        group
          ? { ...group, requests: [...group.requests, request] }
          : { binding: request.identity.binding, requests: [request] }
      );
    }
    const targets: MechanicsRequestIdentity[] = [];
    for (const { binding, requests } of groups.values()) {
      const matches = requests.map(({ resolution }) =>
        comparison(resolution.total, selector.comparison, value)
      );
      if (quantifies(matches, selector.quantifier) !== true) continue;
      if (selector.cardinality === "unique-entity") {
        targets.push({ binding, ordinal: 1 });
      } else {
        requests.forEach((request, index) => {
          if (matches[index]) targets.push(request.identity);
        });
      }
    }
    return targets;
  }
  if (answer?.kind !== "d20") return null;
  const groups = new Map<
    string,
    {
      readonly binding: EntityRef;
      readonly requests: typeof answer.requests;
    }
  >();
  for (const request of answer.requests) {
    const key = entityRefKey(request.identity.binding);
    const group = groups.get(key);
    if (group) {
      groups.set(key, { ...group, requests: [...group.requests, request] });
    } else {
      groups.set(key, { binding: request.identity.binding, requests: [request] });
    }
  }
  const targets: MechanicsRequestIdentity[] = [];
  for (const { binding, requests } of groups.values()) {
    const matches = requests.map((request) =>
      selector.outcomeIds.some((id) => id === request.result.outcome.outcomeId)
    );
    if (quantifies(matches, selector.quantifier) !== true) continue;
    if (selector.cardinality === "unique-entity") {
      targets.push({ binding, ordinal: 1 });
    } else {
      requests.forEach((request, index) => {
        if (matches[index]) targets.push(request.identity);
      });
    }
  }
  return targets;
}

function entityHitPoints(entity: WorldEntity): number {
  return entity.entity === null
    ? entity.document.state.vitals.hitPoints.current
    : entity.entity.vitals.hitPoints.current;
}

function quantifies(
  values: readonly boolean[],
  quantifier: "any" | "all"
): boolean | null {
  if (values.length === 0) return null;
  return quantifier === "any" ? values.some(Boolean) : values.every(Boolean);
}

function comparison(
  left: number,
  operator: "eq" | "ne" | "lt" | "lte" | "gt" | "gte",
  right: number
): boolean {
  switch (operator) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
  }
}

function sourceInventoryItem(execution: MechanicsExecutionContext): {
  readonly instanceId: string;
  readonly instanceOrdinal: number;
  readonly owner: CharacterMaterialRef;
} | null {
  return execution.authority.source.kind === "inventory-item"
    ? execution.authority.source
    : null;
}

function itemFor(
  world: MechanicsWorld,
  owner: CharacterMaterialRef,
  instanceId: string,
  instanceOrdinal: number
): InventoryInstance | null {
  const document = documentFor(world, owner);
  const item =
    document?.kind === "character"
      ? (document.state.inventory[instanceId] ?? null)
      : null;
  return item?.ordinal === instanceOrdinal ? item : null;
}

function selectorItem(
  selector: Extract<
    ResourceSelector,
    { readonly kind: "item-resource" | "item-quantity" }
  >,
  intent: MechanicsExecutionContext,
  resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>
): {
  readonly instanceId: string;
  readonly instanceOrdinal: number;
  readonly owner: CharacterMaterialRef;
} | null {
  if (selector.item.kind === "source-item") {
    return sourceInventoryItem(intent);
  }
  const answer = resolved[selector.item.inputId];
  return answer?.kind === "item"
    ? {
        instanceId: answer.instanceId,
        instanceOrdinal: answer.instanceOrdinal,
        owner: answer.owner,
      }
    : null;
}

function resourceCandidates(
  selector: ResourceSelector,
  intent: MechanicsExecutionContext,
  resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>,
  world: MechanicsWorld
): readonly ResourceRef[] | null {
  const owner = roleEntity(intent, selector.owner);
  if (!owner || !worldEntity(world, owner)) return null;
  if (selector.kind === "pool") {
    return [{ kind: "pool", owner, resourceId: selector.resourceId }];
  }
  if (selector.kind === "spell-slot") {
    if (owner.entityId !== "self" || owner.material.kind !== "character-play") {
      return null;
    }
    const ownerMaterial = owner.material;
    const character = documentFor(world, ownerMaterial);
    if (character?.kind !== "character") return null;
    const standard = Object.keys(character.state.resources.standardSpellSlots)
      .map(Number)
      .filter(
        (level) =>
          Number.isSafeInteger(level) &&
          level >= selector.level.value &&
          (selector.level.kind === "minimum" || level === selector.level.value)
      )
      .sort((left, right) => left - right)
      .map(
        (level) =>
          ({
            character: ownerMaterial,
            kind: "standard-spell-slot",
            level,
          }) as const
      );
    const pact = character.state.resources.pactSpellSlot
      ? ([{ character: ownerMaterial, kind: "pact-spell-slot" }] as const)
      : [];
    return selector.pool === "standard"
      ? standard
      : selector.pool === "pact"
        ? pact
        : [...standard, ...pact];
  }
  if (selector.kind === "hit-die") {
    if (owner.entityId !== "self" || owner.material.kind !== "character-play") {
      return null;
    }
    const ownerMaterial = owner.material;
    const character = documentFor(world, ownerMaterial);
    if (character?.kind !== "character") return null;
    const dice = Object.keys(character.state.resources.hitDice).filter(
      (die): die is "d4" | "d6" | "d8" | "d10" | "d12" =>
        ["d4", "d6", "d8", "d10", "d12"].includes(die) &&
        (selector.die.kind === "any" || selector.die.value === die)
    );
    return dice.map((die) => ({ character: ownerMaterial, die, kind: "hit-die" }));
  }
  if (selector.kind === "currency") {
    if (owner.entityId !== "self" || owner.material.kind !== "character-play") {
      return null;
    }
    const ownerMaterial = owner.material;
    return [
      {
        character: ownerMaterial,
        denomination: selector.denomination,
        kind: "currency",
      },
    ];
  }
  const item = selectorItem(selector, intent, resolved);
  if (
    !item ||
    owner.entityId !== "self" ||
    !exactEqual(owner.material, item.owner) ||
    !itemFor(world, item.owner, item.instanceId, item.instanceOrdinal)
  ) {
    return null;
  }
  return selector.kind === "item-resource"
    ? [
        {
          character: item.owner,
          instanceId: item.instanceId,
          instanceOrdinal: item.instanceOrdinal,
          kind: "item-resource",
          resourceId: selector.resourceId,
        },
      ]
    : [
        {
          character: item.owner,
          instanceId: item.instanceId,
          instanceOrdinal: item.instanceOrdinal,
          kind: "item-quantity",
        },
      ];
}

function canonicalResourceCandidates(
  candidates: readonly Readonly<ResourceRef>[]
): readonly ResourceRef[] {
  return [
    ...new Map(
      candidates.map((candidate) => [resourceRefKey(candidate), candidate])
    ).entries(),
  ]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([, candidate]) => candidate);
}

function resourceRemaining(world: MechanicsWorld, ref: ResourceRef): number | null {
  const cell = locateResolvedMaterialResource(world, ref)?.cell ?? null;
  if (!cell || cell.disabled) return cell ? 0 : null;
  return cell.kind === "count" ? cell.current : cell.values.length;
}

/** The chosen spell-slot level of every resolved resource answer, as bindings. */
function resolvedResourceLevelBindings(
  resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>
): Readonly<Record<string, number>> {
  const bindings: Record<string, number> = {};
  for (const answer of Object.values(resolved)) {
    if (answer.kind === "resource" && answer.resource.kind === "standard-spell-slot") {
      bindings[`input.${answer.inputId}.level`] = answer.resource.level;
    }
  }
  return bindings;
}

function bindingsFor(
  intent: MechanicsExecutionContext,
  root: ProgramOccurrence | null
): Readonly<Record<string, number>> | null {
  const bindings: Record<string, number> = { ...intent.bindings };
  if (intent.trigger.kind === "damage-taken") {
    bindings["trigger.damage"] = intent.trigger.resolution.effective.amount;
    bindings["trigger.raw-damage"] = intent.trigger.resolution.computed.rawTotal;
  }
  const registers =
    root?.registers ??
    Object.fromEntries(
      intent.program.registers.map((register) => [register.registerId, register.initial])
    );
  for (const [registerId, value] of Object.entries(registers)) {
    if (typeof value === "number" && Number.isSafeInteger(value)) {
      bindings[`register.${registerId}`] = value;
    }
  }
  for (const phase of intent.program.phases) {
    bindings[`phase.${phase.phaseId}.executions`] =
      root?.phaseState[phase.phaseId]?.execution ?? 0;
  }
  return bindings;
}

function evaluatedAmount(
  expression: unknown,
  bindings: Readonly<Record<string, number>>
) {
  const value = evaluateIntegerExpression(expression, bindings);
  return value !== null && value >= 0 && value <= MAX_RESOURCE_AMOUNT ? value : null;
}

type ProgramRootLookup =
  | {
      readonly kind: "absent";
      readonly materialEpoch: number;
      readonly nextOccurrenceOrdinal: number;
      readonly root: null;
    }
  | { readonly kind: "present"; readonly root: ProgramOccurrence }
  | { readonly kind: "invalid"; readonly root: null };

type MechanicsExecutionMode = "new" | "replay" | "selected-event";

function phaseStateMatches(
  state: ProgramOccurrence["phaseState"][string],
  receipt: MechanicsExecutionContext["rootReceipt"]["next"]
): boolean {
  return (
    state.execution === receipt.execution &&
    state.lastTriggerEventId === receipt.triggerEventId
  );
}

function programRoot(
  intent: MechanicsExecutionContext,
  world: MechanicsWorld
): ProgramRootLookup {
  const document = documentFor(world, intent.rootOccurrence.occurrence.material);
  if (!document) return { kind: "invalid", root: null };
  const occurrence =
    document.state.occurrences[intent.rootOccurrence.occurrence.occurrenceId];
  if (!occurrence) {
    return {
      kind: "absent",
      materialEpoch: document.state.epoch,
      nextOccurrenceOrdinal: document.state.nextOccurrenceOrdinal,
      root: null,
    };
  }
  return occurrence.kind === "program"
    ? { kind: "present", root: occurrence }
    : { kind: "invalid", root: null };
}

function rootIdentityMatches(
  intent: MechanicsExecutionContext,
  root: ProgramOccurrence
): boolean {
  if (!exactEqual(root.authority, intent.authority)) return false;
  const phaseIds = intent.program.phases.map((phase) => phase.phaseId).sort();
  const registerIds = intent.program.registers
    .map((register) => register.registerId)
    .sort();
  return (
    exactEqual(Object.keys(root.phaseState).sort(), phaseIds) &&
    exactEqual(Object.keys(root.registers).sort(), registerIds)
  );
}

function executionMode(
  intent: MechanicsExecutionContext,
  phase: MechanicsProgramPhase,
  lookup: ProgramRootLookup,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[]
): MechanicsExecutionMode | null {
  const receipt = intent.rootReceipt;
  const top = pendingFrames.at(-1) ?? null;
  const topMatches = top !== null && exactEqual(top.frame, intent.intent.frame);
  if (top !== null && !topMatches) return null;
  if (receipt.kind === "create") {
    if (lookup.kind === "absent") {
      return top === null &&
        lookup.materialEpoch === receipt.materialEpoch &&
        lookup.nextOccurrenceOrdinal === receipt.root.ordinal
        ? "new"
        : null;
    }
    if (
      lookup.kind !== "present" ||
      lookup.root.ordinal !== receipt.root.ordinal ||
      !rootIdentityMatches(intent, lookup.root)
    ) {
      return null;
    }
    const state = lookup.root.phaseState[phase.phaseId];
    if (!state) return null;
    if (phaseStateMatches(state, receipt.next)) return "replay";
    return topMatches &&
      top.cursor.stage !== "phase-complete" &&
      phaseStateMatches(state, {
        execution: 0,
        phaseId: receipt.next.phaseId,
        triggerEventId: null,
      })
      ? "new"
      : null;
  }

  if (
    lookup.kind !== "present" ||
    lookup.root.ordinal !== receipt.root.ordinal ||
    !rootIdentityMatches(intent, lookup.root)
  ) {
    return null;
  }
  const state = lookup.root.phaseState[phase.phaseId];
  if (!state) return null;
  if (
    topMatches &&
    top.cursor.stage !== "phase-complete" &&
    phaseStateMatches(state, receipt.expected)
  ) {
    return top.selectedEvent ? "selected-event" : "new";
  }
  return phaseStateMatches(state, receipt.next) ? "replay" : null;
}

function resolvedPhase(intent: MechanicsExecutionContext): MechanicsProgramPhase | null {
  return intent.program.phases.find((phase) => phase.phaseId === intent.phaseId) ?? null;
}

function resourceRefMatchesSelector(
  ref: ResourceRef,
  selector: ResourceSelector,
  intent: MechanicsExecutionContext,
  resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>,
  world: MechanicsWorld
): boolean {
  const candidates = resourceCandidates(selector, intent, resolved, world);
  return (
    candidates?.some((candidate) => resourceRefKey(candidate) === resourceRefKey(ref)) ??
    false
  );
}

function triggerMatches(
  intent: MechanicsExecutionContext,
  phase: MechanicsProgramPhase,
  world: MechanicsWorld
): boolean {
  const trigger = phase.trigger;
  const evidence = intent.trigger;
  if (trigger.kind !== evidence.kind) return false;
  switch (trigger.kind) {
    case "invocation":
      return evidence.kind === "invocation";
    case "turn-boundary": {
      if (evidence.kind !== "turn-boundary" || trigger.phase !== evidence.phase) {
        return false;
      }
      const combatant = roleEntity(intent, trigger.combatant);
      return combatant !== null && exactEqual(combatant, evidence.combatant);
    }
    case "resource-depleted":
      return (
        evidence.kind === "resource-depleted" &&
        resourceRefMatchesSelector(
          evidence.resource,
          trigger.resource,
          intent,
          {},
          world
        ) &&
        resourceRemaining(world, evidence.resource) === 0
      );
    case "hit-points-zero": {
      if (evidence.kind !== "hit-points-zero") return false;
      const target = roleEntity(intent, trigger.target);
      const entity = target ? worldEntity(world, target) : null;
      return (
        target !== null &&
        entity !== null &&
        entity.kind === "creature" &&
        exactEqual(target, evidence.target) &&
        entityHitPoints(entity) === 0
      );
    }
    case "damage-taken": {
      if (evidence.kind !== "damage-taken") return false;
      const target = roleEntity(intent, trigger.target);
      const triggeringAttacker = roleEntity(intent, "triggering-attacker");
      return (
        target !== null &&
        exactEqual(target, evidence.resolution.packet.target) &&
        (!evidence.criticalHit || evidence.resolution.packet.delivery === "attack") &&
        exactEqual(triggeringAttacker, evidence.attacker)
      );
    }
    case "rest-completed": {
      if (evidence.kind !== "rest-completed" || trigger.rest !== evidence.rest) {
        return false;
      }
      const combatant = roleEntity(intent, trigger.combatant);
      return combatant !== null && exactEqual(combatant, evidence.combatant);
    }
    case "day-phase":
      return evidence.kind === "day-phase" && trigger.phase === evidence.phase;
    case "source-end":
      return (
        evidence.kind === "source-end" &&
        exactEqual(
          resolvedProgramRootGeneration(world, evidence.occurrence),
          intent.rootOccurrence
        )
      );
    case "program-phase-end":
      if (
        evidence.kind !== "program-phase-end" ||
        trigger.phaseId !== evidence.phaseId ||
        !exactEqual(evidence.occurrence, intent.rootOccurrence)
      ) {
        return false;
      } else {
        const sourceProgram = occurrenceFor(world, evidence.occurrence);
        return (
          sourceProgram?.kind === "program" &&
          evidence.execution > 0 &&
          sourceProgram.phaseState[evidence.phaseId]?.execution === evidence.execution
        );
      }
    case "area-boundary": {
      const area =
        evidence.kind === "area-boundary" ? occurrenceFor(world, evidence.area) : null;
      if (
        evidence.kind !== "area-boundary" ||
        trigger.boundary !== evidence.boundary ||
        area?.kind !== "standing" ||
        area.fact.kind !== "program-fact" ||
        area.fact.factId !== trigger.areaId
      ) {
        return false;
      }
      const entity = roleEntity(intent, trigger.entity);
      return entity !== null && exactEqual(entity, evidence.entity);
    }
    case "manual-table-event":
      return (
        evidence.kind === "manual-table-event" &&
        trigger.eventId === evidence.eventId &&
        "kind" in intent.actor &&
        intent.actor.authority === evidence.authority
      );
    // The root's possessor declares the pulse (the player applies the zone's
    // event the physical table just adjudicated); advance CAS on the exact
    // execution + trigger event id makes each declaration single-use.
    case "root-pulse":
      return evidence.kind === "root-pulse" && trigger.eventId === evidence.eventId;
  }
}

function eventTriggerEvidence(
  event: Readonly<MechanicsEvent>
): Readonly<MechanicsTriggerEvidence> {
  switch (event.kind) {
    case "damage-taken":
      return freezeDeep({
        attacker: event.attacker,
        criticalHit: event.criticalHit,
        kind: event.kind,
        resolution: event.resolution,
        triggerEventId: event.eventId,
      });
    case "hit-points-zero":
      return freezeDeep({
        kind: event.kind,
        target: event.target,
        triggerEventId: event.eventId,
      });
    case "resource-depleted":
      return freezeDeep({
        kind: event.kind,
        resource: event.resource,
        triggerEventId: event.eventId,
      });
    case "program-phase-end":
      return freezeDeep({
        execution: event.execution,
        kind: event.kind,
        occurrence: event.occurrence,
        phaseId: event.phaseId,
        triggerEventId: event.eventId,
      });
    case "source-ending":
      return freezeDeep({
        kind: "source-end" as const,
        occurrence: event.occurrence,
        triggerEventId: event.eventId,
      });
  }
}

function eventSelectionContext(
  root: Readonly<ProgramOccurrence>,
  rootRef: Readonly<OccurrenceGenerationRef>,
  phase: Readonly<MechanicsProgramPhase>,
  evidence: Readonly<MechanicsTriggerEvidence>,
  eventId: string
): MechanicsExecutionContext | null {
  const expected = root.phaseState[phase.phaseId];
  if (!expected || expected.execution >= Number.MAX_SAFE_INTEGER) return null;
  const intent = conformMechanicsIntent({
    actionId: eventId,
    factGuards: [],
    frame: {
      authority: root.authority,
      invocation: { kind: "program-root", occurrence: rootRef },
      rootReceipt: {
        expected: {
          execution: expected.execution,
          phaseId: phase.phaseId,
          triggerEventId: expected.lastTriggerEventId,
        },
        kind: "advance",
        next: {
          execution: expected.execution + 1,
          phaseId: phase.phaseId,
          triggerEventId: eventId,
        },
        root: rootRef,
      },
      trigger: evidence,
    },
  });
  return intent ? executionContext(intent) : null;
}

/**
 * Freeze the complete emission-time subscriber audience. Only root generation
 * and phase identity survive selection; the execution CAS is allocated later
 * when the depth-first dispatcher reaches that member.
 */
export function selectMechanicsEventSubscribers(
  emissionValue: unknown
): Readonly<MechanicsSubscriberSelectionResult> {
  if (!isAuthenticMechanicsEventEmission(emissionValue)) {
    return freezeDeep({
      reason: "invalid-emission" as const,
      status: "rejected" as const,
    });
  }
  const emission = emissionValue;
  const existing = mechanicsEventSubscriberAudiences.get(emission);
  if (existing) return existing;
  const evidence = eventTriggerEvidence(emission.event);
  const selected: {
    readonly key: string;
    readonly phaseId: string;
    readonly root: OccurrenceGenerationRef;
  }[] = [];

  for (const document of emission.emissionWorld.documents) {
    for (const [occurrenceId, occurrence] of Object.entries(document.state.occurrences)) {
      if (
        occurrence.kind !== "program" ||
        (occurrence.ending !== null && emission.event.kind !== "source-ending")
      ) {
        continue;
      }
      const root = {
        occurrence: { material: document.material, occurrenceId },
        ordinal: occurrence.ordinal,
      } as const;
      for (const phase of occurrence.authority.snapshot.program?.phases ?? []) {
        const context = eventSelectionContext(
          occurrence,
          root,
          phase,
          evidence,
          emission.event.eventId
        );
        if (!context || !triggerMatches(context, phase, emission.emissionWorld)) {
          continue;
        }
        selected.push({
          key: `${occurrenceGenerationRefKey(root)}\u0000${phase.phaseId}`,
          phaseId: phase.phaseId,
          root,
        });
        if (selected.length > MAX_EVENT_SUBSCRIBERS) {
          const result = freezeDeep({
            reason: "subscriber-overflow" as const,
            status: "rejected" as const,
          });
          mechanicsEventSubscriberAudiences.set(emission, result);
          return result;
        }
      }
    }
  }

  selected.sort((left, right) => compareCodeUnits(left.key, right.key));
  const selections = selected.map(({ phaseId, root }) => {
    const occurrence = occurrenceFor(emission.emissionWorld, root);
    return occurrence?.kind === "program"
      ? issueMechanicsSubscriberSelection(emission, {
          authority: occurrence.authority,
          eventId: emission.event.eventId,
          evidence,
          phaseId,
          root,
        })
      : null;
  });
  if (selections.some((selection) => selection === null)) {
    const result = freezeDeep({
      reason: "invalid-emission" as const,
      status: "rejected" as const,
    });
    mechanicsEventSubscriberAudiences.set(emission, result);
    return result;
  }
  const result = freezeDeep({
    selections: selections as readonly Readonly<MechanicsSubscriberSelection>[],
    status: "selected" as const,
  });
  mechanicsEventSubscriberAudiences.set(emission, result);
  return result;
}

/**
 * Consume one frozen audience member and allocate its phase CAS against the
 * current causal world. Emission-time trigger membership is not re-evaluated;
 * exact root generation and current phase state still are.
 */
export function dispatchMechanicsEventSubscriber(
  selectionValue: unknown,
  stateValue: unknown
): Readonly<MechanicsSubscriberDispatchResult> {
  if (typeof selectionValue !== "object" || selectionValue === null) {
    return freezeDeep({
      reason: "invalid-selection" as const,
      status: "rejected" as const,
    });
  }
  const fiber = mechanicsSubscriberSelectionFiber(selectionValue);
  if (!fiber) {
    return freezeDeep({
      reason: "invalid-selection" as const,
      status: "rejected" as const,
    });
  }
  const conformed = conformMechanicsCausalState(stateValue);
  if (!conformed.ok) {
    return freezeDeep({ reason: "invalid-state" as const, status: "rejected" as const });
  }
  const state = conformed.value;
  const root = occurrenceFor(state.world, fiber.root);
  if (root?.kind !== "program" || !exactEqual(root.authority, fiber.authority)) {
    return freezeDeep({
      reason: "stale-subscriber" as const,
      status: "rejected" as const,
    });
  }
  const phase = root.authority.snapshot.program?.phases.find(
    ({ phaseId }) => phaseId === fiber.phaseId
  );
  const expected = root.phaseState[fiber.phaseId];
  if (!phase || !expected) {
    return freezeDeep({
      reason: "stale-subscriber" as const,
      status: "rejected" as const,
    });
  }
  if (expected.execution >= Number.MAX_SAFE_INTEGER) {
    return freezeDeep({
      reason: "execution-overflow" as const,
      status: "rejected" as const,
    });
  }
  if (expected.lastTriggerEventId === fiber.eventId) {
    return freezeDeep({
      reason: "stale-subscriber" as const,
      status: "rejected" as const,
    });
  }
  if (
    fiber.evidence.kind === "source-end" &&
    (occurrenceFor(state.world, fiber.evidence.occurrence) === null ||
      !exactEqual(
        resolvedProgramRootGeneration(state.world, fiber.evidence.occurrence),
        fiber.root
      ))
  ) {
    return freezeDeep({
      reason: "stale-subscriber" as const,
      status: "rejected" as const,
    });
  }
  const frame = conformMechanicsExecutionFrame({
    authority: fiber.authority,
    invocation: { kind: "program-root", occurrence: fiber.root },
    rootReceipt: {
      expected: {
        execution: expected.execution,
        phaseId: fiber.phaseId,
        triggerEventId: expected.lastTriggerEventId,
      },
      kind: "advance",
      next: {
        execution: expected.execution + 1,
        phaseId: fiber.phaseId,
        triggerEventId: fiber.eventId,
      },
      root: fiber.root,
    },
    trigger: fiber.evidence,
  });
  if (!frame) {
    return freezeDeep({
      reason: "stale-subscriber" as const,
      status: "rejected" as const,
    });
  }
  const pushed = pushMechanicsSelectedEventPendingFrame(state, frame, selectionValue);
  if (!pushed.ok) {
    return freezeDeep({
      reason: "stale-subscriber" as const,
      status: "rejected" as const,
    });
  }
  return freezeDeep({ frame, state: pushed.value, status: "dispatched" as const });
}

type ValidatedMechanicsIntent = {
  readonly bindings: Readonly<Record<string, number>>;
  readonly execution: MechanicsExecutionContext;
  readonly executionMode: MechanicsExecutionMode;
  readonly intent: Readonly<MechanicsIntent>;
  readonly phase: MechanicsProgramPhase;
  readonly root: ProgramOccurrence | null;
  readonly world: Readonly<MechanicsWorld>;
};

type MechanicsIntentValidation =
  | ValidatedMechanicsIntent
  | {
      readonly reason: MechanicsRequirementsRejection;
      readonly referenceId: string | null;
    };

function validateIntentAgainstReadableWorld(
  intentValue: unknown,
  world: Readonly<MechanicsWorld>,
  pendingFrames: readonly Readonly<MechanicsPendingFrame>[] = []
): MechanicsIntentValidation {
  const intent = conformMechanicsIntent(intentValue);
  if (!intent) return { reason: "invalid-intent", referenceId: null };
  const execution = executionContext(intent);
  if (!execution) return { reason: "invalid-intent", referenceId: "frame" };
  const phase = resolvedPhase(execution);
  if (!phase) return { reason: "missing-phase", referenceId: execution.phaseId };
  if (execution.roles.owner === null) {
    return { reason: "missing-role", referenceId: "owner" };
  }
  const lookup = programRoot(execution, world);
  const mode = executionMode(execution, phase, lookup, pendingFrames);
  if (mode === null) {
    return {
      reason: "invalid-root-occurrence",
      referenceId: execution.rootOccurrence.occurrence.occurrenceId,
    };
  }
  const root = lookup.root;
  if (mode !== "selected-event") {
    for (const role of ROLES) {
      const entity = roleEntity(execution, role);
      if (entity !== null && !worldEntity(world, entity)) {
        return { reason: "missing-entity", referenceId: role };
      }
    }
    if (mode === "new" && !triggerMatches(execution, phase, world)) {
      return { reason: "trigger-mismatch", referenceId: phase.phaseId };
    }
  }
  const bindings = bindingsFor(execution, root);
  if (!bindings) return { reason: "invalid-intent", referenceId: "bindings" };
  return { bindings, execution, executionMode: mode, intent, phase, root, world };
}

type PredicateTruth = boolean | null;

interface PredicateContext {
  readonly bindings: Readonly<Record<string, number>>;
  readonly intent: MechanicsExecutionContext;
  readonly landedDamage?: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>;
  readonly root: ProgramOccurrence | null;
  readonly world: MechanicsWorld;
}

/**
 * Rebuild the compiler view from an exact causal state. An absent initial create
 * or the exact nonterminal stack top is the only executable receipt.
 */
export function refreshMechanicsProgramCompilationContext(
  reviewed: Readonly<ReviewedMechanicsIntent>,
  stateValue: unknown,
  landedDamage: Readonly<Record<string, Readonly<Record<string, number>>>> = {}
): Readonly<MechanicsProgramCompilationContext> | null {
  const state = conformMechanicsCausalState(stateValue);
  if (!state.ok) return null;
  const validated = validateIntentAgainstReadableWorld(
    reviewed.intent,
    state.value.world,
    state.value.context.pendingFrames
  );
  if ("reason" in validated || validated.executionMode === "replay") return null;
  return freezeDeep({
    bindings: {
      ...validated.bindings,
      ...resolvedResourceLevelBindings(reviewed.resolved),
    },
    execution: validated.execution.execution,
    intent: reviewed.intent,
    landedDamage,
    phase: validated.phase,
    resolved: reviewed.resolved,
    root: validated.root,
    world: state.value.world,
  });
}

/**
 * Rebuild a compiler view from an authentic transaction projection without
 * converting that transient prefix into causal state or discovering end rules.
 */
export function refreshMechanicsProgramProjectedCompilationContext(
  reviewed: Readonly<ReviewedMechanicsIntent>,
  projectionValue: Readonly<MechanicsTransactionProjection>,
  landedDamage: Readonly<Record<string, Readonly<Record<string, number>>>> = {}
): Readonly<MechanicsProgramCompilationContext> | null {
  const projection = mechanicsTransactionProjectionFiber(projectionValue);
  if (!projection) return null;
  const basis = conformMechanicsCausalState(projection.basis);
  if (!basis.ok) return null;
  const projected = projectMechanicsTransactionWorld(
    projection.world,
    basis.value.world,
    projection.inventorySourceLeases,
    basis.value
  );
  if (
    !projected.ok ||
    canonicalJson(projected.value) !== canonicalJson(projection.world)
  ) {
    return null;
  }
  const validated = validateIntentAgainstReadableWorld(
    reviewed.intent,
    projected.value,
    basis.value.context.pendingFrames
  );
  if ("reason" in validated || validated.executionMode === "replay") return null;
  return freezeDeep({
    bindings: {
      ...validated.bindings,
      ...resolvedResourceLevelBindings(reviewed.resolved),
    },
    execution: validated.execution.execution,
    intent: reviewed.intent,
    landedDamage,
    phase: validated.phase,
    resolved: reviewed.resolved,
    root: validated.root,
    world: projected.value,
  });
}

/** Re-review the exact causal basis once and distinguish replay before compiling. */
export function prepareMechanicsProgramCompilation(
  reviewedValue: Readonly<ReviewedMechanicsIntent>,
  stateValue: unknown
): Readonly<MechanicsProgramCompilationPreparation> {
  if (typeof reviewedValue !== "object" || !Object.isFrozen(reviewedValue)) {
    return freezeDeep({
      reason: "invalid-reviewed-intent" as const,
      referenceId: null,
      status: "rejected" as const,
    });
  }
  const state = conformMechanicsCausalState(stateValue);
  if (!state.ok) {
    return freezeDeep({
      reason: "invalid-state" as const,
      referenceId: null,
      status: "rejected" as const,
    });
  }
  const validated = validateIntentAgainstReadableWorld(
    reviewedValue.intent,
    state.value.world,
    state.value.context.pendingFrames
  );
  if ("reason" in validated) {
    return freezeDeep({
      reason: validated.reason,
      referenceId: validated.referenceId,
      status: "rejected" as const,
    });
  }
  if (validated.executionMode === "replay") {
    return freezeDeep({ status: "replay" as const });
  }
  if (!authenticReviewedIntents.has(reviewedValue)) {
    const rereview = reviewMechanicsIntentValidated(validated, reviewedValue.answers);
    if (rereview.status !== "reviewed" || !exactEqual(rereview.reviewed, reviewedValue)) {
      return freezeDeep({
        reason: "invalid-reviewed-intent" as const,
        referenceId: null,
        status: "rejected" as const,
      });
    }
  }
  const context = refreshMechanicsProgramCompilationContext(reviewedValue, state.value);
  return context
    ? freezeDeep({ context, state: state.value, status: "ready" as const })
    : freezeDeep({
        reason: "invalid-reviewed-intent" as const,
        referenceId: null,
        status: "rejected" as const,
      });
}

/** Evaluate one authored step against the current projected world/register view. */
export function mechanicsProgramStepIsActive(
  step: Readonly<MechanicsStep>,
  context: Readonly<MechanicsProgramCompilationContext>
): boolean | null {
  if (step.when === null) return true;
  const execution = executionContext(context.intent);
  return execution
    ? evaluatePredicate(step.when, {
        bindings: context.bindings,
        intent: execution,
        landedDamage: context.landedDamage,
        resolved: context.resolved,
        root: context.root,
        world: context.world,
      })
    : null;
}

function occurrencesForTarget(
  world: MechanicsWorld,
  target: EntityRef
): readonly EffectOccurrence[] {
  return world.documents.flatMap((document) =>
    Object.values(document.state.occurrences).filter(
      (occurrence): occurrence is EffectOccurrence =>
        occurrence.kind !== "program" &&
        occurrence.ending === null &&
        exactEqual(occurrence.target, target)
    )
  );
}

function standingMatches(
  matcher: Extract<MechanicsPredicate, { readonly kind: "standing-present" }>["fact"],
  fact: StandingFact
): boolean {
  if (matcher.kind !== fact.kind) return false;
  switch (matcher.kind) {
    case "active-key":
      return fact.kind === "active-key" && matcher.key === fact.key;
    case "condition-immunity":
      return (
        fact.kind === "condition-immunity" && matcher.conditionId === fact.conditionId
      );
    case "damage-defense":
      return fact.kind === "damage-defense" && matcher.sourceId === fact.rule.sourceId;
    case "grant-group":
      return fact.kind === "grant-group" && matcher.groupId === fact.groupId;
    case "program-fact":
      return fact.kind === "program-fact" && matcher.factId === fact.factId;
    case "target-mark":
      return fact.kind === "target-mark" && matcher.markId === fact.markId;
  }
}

function predicateExpression(
  expression: unknown,
  context: PredicateContext
): number | null {
  return evaluateIntegerExpression(expression, context.bindings);
}

function evaluatePredicate(
  predicate: MechanicsPredicate,
  context: PredicateContext
): PredicateTruth {
  switch (predicate.kind) {
    case "not": {
      const value = evaluatePredicate(predicate.predicate, context);
      return value === null ? null : !value;
    }
    case "all": {
      let unknown = false;
      for (const child of predicate.predicates) {
        const value = evaluatePredicate(child, context);
        if (value === false) return false;
        if (value === null) unknown = true;
      }
      return unknown ? null : true;
    }
    case "any": {
      let unknown = false;
      for (const child of predicate.predicates) {
        const value = evaluatePredicate(child, context);
        if (value === true) return true;
        if (value === null) unknown = true;
      }
      return unknown ? null : false;
    }
    case "answer-boolean": {
      const answer = context.resolved[predicate.inputId];
      return answer?.kind === "boolean" ? answer.value === predicate.equals : null;
    }
    case "answer-choice": {
      const answer = context.resolved[predicate.inputId];
      return answer?.kind === "choice" ? answer.choiceId === predicate.choiceId : null;
    }
    case "answer-d20": {
      const answer = context.resolved[predicate.inputId];
      return answer?.kind === "d20"
        ? quantifies(
            answer.requests.map(
              (request) => request.result.outcome.outcomeId === predicate.outcomeId
            ),
            predicate.quantifier
          )
        : null;
    }
    case "answer-dice-total": {
      const answer = context.resolved[predicate.inputId];
      const value = predicateExpression(predicate.value, context);
      return answer?.kind === "dice" && value !== null
        ? quantifies(
            answer.requests.map(({ resolution }) =>
              comparison(resolution.total, predicate.comparison, value)
            ),
            predicate.quantifier
          )
        : null;
    }
    case "answer-entity-count": {
      const answer = context.resolved[predicate.inputId];
      const value = predicateExpression(predicate.value, context);
      return answer?.kind === "entities" && value !== null
        ? comparison(answer.targets.length, predicate.comparison, value)
        : null;
    }
    case "answer-integer": {
      const answer = context.resolved[predicate.inputId];
      const value = predicateExpression(predicate.value, context);
      return answer?.kind === "integer" && value !== null
        ? comparison(answer.value, predicate.comparison, value)
        : null;
    }
    case "answer-table": {
      const answer = context.resolved[predicate.inputId];
      return answer?.kind === "table" ? answer.rowId === predicate.rowId : null;
    }
    case "binding": {
      const left = context.bindings[predicate.bindingId];
      const right = predicateExpression(predicate.value, context);
      return left === undefined || right === null
        ? null
        : comparison(left, predicate.comparison, right);
    }
    case "register": {
      const initial = context.intent.program.registers.find(
        (register) => register.registerId === predicate.registerId
      )?.initial;
      const current = context.root?.registers[predicate.registerId] ?? initial;
      const right = predicateExpression(predicate.value, context);
      return typeof current === "number" && right !== null
        ? comparison(current, predicate.comparison, right)
        : null;
    }
    case "phase-executions": {
      const current = context.root?.phaseState[predicate.phaseId]?.execution ?? 0;
      const right = predicateExpression(predicate.value, context);
      return right === null ? null : comparison(current, predicate.comparison, right);
    }
    case "entity-hit-points": {
      const targets = resolveTargets(
        predicate.target,
        context.intent,
        context.resolved,
        context.bindings
      );
      const right = predicateExpression(predicate.value, context);
      if (!targets || right === null) return null;
      const checks: boolean[] = [];
      for (const target of targets) {
        const entity = worldEntity(context.world, target.binding);
        if (!entity) return null;
        checks.push(comparison(entityHitPoints(entity), predicate.comparison, right));
      }
      return quantifies(checks, predicate.quantifier);
    }
    case "entity-kind": {
      const targets = resolveTargets(
        predicate.target,
        context.intent,
        context.resolved,
        context.bindings
      );
      if (!targets) return null;
      const checks: boolean[] = [];
      for (const target of targets) {
        const entity = worldEntity(context.world, target.binding);
        if (!entity) return null;
        checks.push(entity.kind === predicate.entityKind);
      }
      return quantifies(checks, predicate.quantifier);
    }
    case "condition-present": {
      const targets = resolveTargets(
        predicate.target,
        context.intent,
        context.resolved,
        context.bindings
      );
      if (!targets) return null;
      const checks = targets.map((target) => {
        const present = occurrencesForTarget(context.world, target.binding).some(
          (occurrence) =>
            occurrence.kind === "condition" &&
            occurrence.conditionId === predicate.conditionId
        );
        return present === predicate.present;
      });
      return quantifies(checks, predicate.quantifier);
    }
    case "standing-present": {
      const targets = resolveTargets(
        predicate.target,
        context.intent,
        context.resolved,
        context.bindings
      );
      if (!targets) return null;
      const checks = targets.map((target) => {
        const present = occurrencesForTarget(context.world, target.binding).some(
          (occurrence) =>
            occurrence.kind === "standing" &&
            standingMatches(predicate.fact, occurrence.fact)
        );
        return present === predicate.present;
      });
      return quantifies(checks, predicate.quantifier);
    }
    case "resource": {
      const candidates = resourceCandidates(
        predicate.selector,
        context.intent,
        context.resolved,
        context.world
      );
      const right = predicateExpression(predicate.value, context);
      if (!candidates || right === null) return null;
      const values = candidates
        .map((candidate) => resourceRemaining(context.world, candidate))
        .filter((value): value is number => value !== null);
      return values.length === 0
        ? false
        : comparison(Math.max(...values), predicate.comparison, right);
    }
    case "landed-damage": {
      const parts = context.landedDamage?.[predicate.stepId];
      const right = predicateExpression(predicate.value, context);
      if (!parts || right === null) return null;
      const left =
        predicate.partId === null
          ? Object.values(parts).reduce((total, value) => total + value, 0)
          : parts[predicate.partId];
      return left === undefined ? null : comparison(left, predicate.comparison, right);
    }
    case "trigger-critical-hit":
      return context.intent.trigger.kind === "damage-taken"
        ? context.intent.trigger.criticalHit === predicate.equals
        : false;
    case "trigger-damage": {
      const right = predicateExpression(predicate.value, context);
      return context.intent.trigger.kind === "damage-taken" && right !== null
        ? comparison(
            context.intent.trigger.resolution.effective.amount,
            predicate.comparison,
            right
          )
        : false;
    }
    case "trigger-damage-delivery":
      return context.intent.trigger.kind === "damage-taken"
        ? context.intent.trigger.resolution.packet.delivery === predicate.delivery
        : false;
    case "trigger-damage-trait":
      return context.intent.trigger.kind === "damage-taken"
        ? context.intent.trigger.resolution.packet.traits.includes(predicate.trait) ===
            predicate.present
        : false;
    case "trigger-damage-type":
      return context.intent.trigger.kind === "damage-taken"
        ? context.intent.trigger.resolution.packet.parts.some(
            (part) => part.damageType === predicate.damageType
          )
        : false;
  }
}

function compilationPredicateContext(
  context: Readonly<MechanicsProgramCompilationContext>
): PredicateContext | null {
  const intent = executionContext(context.intent);
  return intent
    ? {
        bindings: context.bindings,
        intent,
        landedDamage: context.landedDamage,
        resolved: context.resolved,
        root: context.root,
        world: context.world,
      }
    : null;
}

/** Resolve one entity selector without exposing programme-internal role derivation. */
export function resolveMechanicsProgramTargets(
  selector: Readonly<MechanicsEntitySelector>,
  context: Readonly<MechanicsProgramCompilationContext>
): readonly MechanicsRequestIdentity[] | null {
  const internal = compilationPredicateContext(context);
  if (!internal) return null;
  // Compilation always follows a complete review, which resolves every ACTIVE
  // input — so a selector referencing an absent answer points at an input whose
  // activation predicate omitted it (a save that never happened after a missed
  // attack). The selector resolves to zero targets, never to a rejection.
  if (selector.kind !== "role" && internal.resolved[selector.inputId] === undefined) {
    return [];
  }
  return resolveTargets(selector, internal.intent, internal.resolved, internal.bindings);
}

function transformedInputAmount(
  total: number,
  transform: unknown,
  bindings: Readonly<Record<string, number>>
): number | null {
  return evaluatedAmount(transform, { ...bindings, "input-total": total });
}

/** Resolve an authored amount from reviewed dice, prior landed damage or bindings. */
export function resolveMechanicsProgramAmount(
  spec: Readonly<MechanicsAmountSpec>,
  context: Readonly<MechanicsProgramCompilationContext>,
  identity: Readonly<MechanicsRequestIdentity> | null = null
): number | null {
  if (spec.kind === "integer") {
    return evaluatedAmount(spec.expression, context.bindings);
  }
  if (spec.kind === "landed-damage") {
    const parts = context.landedDamage[spec.stepId];
    const amount =
      spec.partId === null
        ? parts && Object.values(parts).reduce((total, value) => total + value, 0)
        : parts?.[spec.partId];
    return amount === undefined
      ? null
      : transformedInputAmount(amount, spec.transform, context.bindings);
  }
  const answer = context.resolved[spec.inputId];
  if (answer?.kind !== "dice") return null;
  const request =
    spec.cardinality === "shared"
      ? answer.requests.length === 1
        ? answer.requests[0]
        : undefined
      : identity === null
        ? undefined
        : answer.requests.find(({ identity: candidate }) =>
            exactEqual(candidate, identity)
          );
  return request
    ? transformedInputAmount(request.resolution.total, spec.transform, context.bindings)
    : null;
}

/** Resolve every physical resource matching one authored selector in canonical order. */
export function resolveMechanicsProgramResources(
  selector: Readonly<ResourceSelector>,
  context: Readonly<MechanicsProgramCompilationContext>
): readonly ResourceRef[] | null {
  const internal = compilationPredicateContext(context);
  if (!internal) return null;
  const candidates = resourceCandidates(
    selector,
    internal.intent,
    internal.resolved,
    internal.world
  );
  return candidates ? canonicalResourceCandidates(candidates) : null;
}

function materializeD20Request(
  spec: MechanicsD20RequestSpec,
  intent: MechanicsExecutionContext,
  binding: EntityRef | null,
  bind: "actor" | "target" | null
): Readonly<D20TestRequest> | null {
  const actor = bind === "actor" ? binding : roleEntity(intent, spec.actor);
  if (!actor) return null;
  const target =
    bind === "target"
      ? binding
      : spec.target === null
        ? null
        : roleEntity(intent, spec.target);
  if ((bind === "target" || spec.target !== null) && !target) return null;
  return conformD20TestRequest({ ...spec, actor, target });
}

function expandedD20Identities(
  input: Extract<MechanicsInput, { readonly kind: "d20" }>,
  context: PredicateContext
): {
  readonly bind: "actor" | "target" | null;
  readonly identities: readonly MechanicsRequestIdentity[];
  readonly pendingEntityInputId: string | null;
} | null {
  if (input.expansion.kind === "single") {
    const binding = roleEntity(context.intent, input.expansion.binding);
    return binding
      ? {
          bind: null,
          identities: [{ binding, ordinal: 1 }],
          pendingEntityInputId: null,
        }
      : null;
  }
  const source = context.resolved[input.expansion.inputId];
  if (!source) {
    return {
      bind: input.expansion.bind,
      identities: [],
      pendingEntityInputId: input.expansion.inputId,
    };
  }
  if (source.kind !== "entities") return null;
  return {
    bind: input.expansion.bind,
    identities: requestIdentities(source.targets),
    pendingEntityInputId: null,
  };
}

function expandedDiceIdentities(
  input: Extract<MechanicsInput, { readonly kind: "dice" }>,
  context: PredicateContext
): {
  readonly identities: readonly MechanicsRequestIdentity[];
  readonly pendingInputId: string | null;
} | null {
  if (input.expansion.kind === "single") {
    const binding = roleEntity(context.intent, input.expansion.binding);
    return binding
      ? { identities: [{ binding, ordinal: 1 }], pendingInputId: null }
      : null;
  }
  const source = context.resolved[input.expansion.inputId];
  if (!source) return { identities: [], pendingInputId: input.expansion.inputId };
  if (input.expansion.kind === "entities") {
    if (source.kind !== "entities") return null;
    return {
      identities: requestIdentities(source.targets),
      pendingInputId: null,
    };
  }
  if (input.expansion.kind === "d20-outcomes") {
    return source.kind === "d20"
      ? {
          identities: source.requests.flatMap(({ identity, result }) =>
            input.expansion.kind === "d20-outcomes" &&
            input.expansion.outcomeIds.some((id) => id === result.outcome.outcomeId)
              ? [identity]
              : []
          ),
          pendingInputId: null,
        }
      : null;
  }
  if (source.kind !== "dice") return null;
  const expansion = input.expansion;
  const value = predicateExpression(expansion.value, context);
  return value === null
    ? null
    : {
        identities: source.requests.flatMap(({ identity, resolution }) =>
          comparison(resolution.total, expansion.comparison, value) ? [identity] : []
        ),
        pendingInputId: null,
      };
}

function paymentRequirements(
  payments: readonly { readonly sourceId: string; readonly term: ResourceTerm }[],
  bindings: Readonly<Record<string, number>>
): readonly MechanicsPaymentRequirement[] | null {
  const result: MechanicsPaymentRequirement[] = [];
  for (const payment of payments) {
    const amountPerUse = evaluatedAmount(payment.term.amount, bindings);
    if (amountPerUse === null || amountPerUse < 1) return null;
    result.push({
      amountPerUse,
      selector: payment.term.selector,
      sourceId: payment.sourceId,
    });
  }
  return result;
}

function requirementActivation(
  predicate: MechanicsPredicate | null,
  context: PredicateContext
): MechanicsRequirement["activation"] {
  if (predicate === null) return "required";
  const active = evaluatePredicate(predicate, context);
  return active === null ? "conditional" : active ? "required" : "omitted";
}

function requirementForInput(
  input: MechanicsInput,
  phaseId: string,
  context: PredicateContext
): MechanicsRequirement | null {
  const base = {
    activation: requirementActivation(input.when, context),
    activeWhen: input.when,
    inputId: input.inputId,
    phaseId,
  };
  switch (input.kind) {
    case "entities": {
      const minimum = evaluatedAmount(input.minimum, context.bindings);
      const maximum = evaluatedAmount(input.maximum, context.bindings);
      return minimum !== null &&
        maximum !== null &&
        minimum <= maximum &&
        maximum <= MAX_TARGETS
        ? {
            ...base,
            eligibility: input.eligibility,
            kind: "entities",
            maximum,
            minimum,
            multiplicity: input.multiplicity,
          }
        : null;
    }
    case "d20": {
      const expansion = expandedD20Identities(input, context);
      const payments = paymentRequirements(input.payments, context.bindings);
      if (!expansion || !payments) return null;
      const requests: MechanicsD20Requirement[] = [];
      for (const identity of expansion.identities) {
        const request = materializeD20Request(
          input.request,
          context.intent,
          identity.binding,
          expansion.bind
        );
        const review = request ? reviewD20Test(request, context.bindings) : null;
        if (!review) return null;
        requests.push({ identity, payments, review });
      }
      return {
        ...base,
        kind: "d20",
        pendingEntityInputId: expansion.pendingEntityInputId,
        requests: Object.freeze(requests),
      };
    }
    case "dice": {
      const expansion = expandedDiceIdentities(input, context);
      const payments = paymentRequirements(input.payments, context.bindings);
      const roll = evaluateDiceFormula(
        input.formula,
        context.bindings,
        input.acceptancePolicy
      );
      const replacementPolicy = evaluateDiceReplacementPolicy(
        input.replacementPolicy,
        context.bindings
      );
      if (!expansion || !roll || !payments || !replacementPolicy) return null;
      const requests: MechanicsDiceRequirement[] = expansion.identities.map(
        (identity) => ({ identity, payments, replacementPolicy, roll })
      );
      return {
        ...base,
        kind: "dice",
        pendingInputId: expansion.pendingInputId,
        requests: Object.freeze(requests),
      };
    }
    case "choice":
      return { ...base, kind: "choice", options: input.options };
    case "integer": {
      const minimum = evaluateIntegerExpression(input.minimum, context.bindings);
      const maximum = evaluateIntegerExpression(input.maximum, context.bindings);
      return minimum !== null && maximum !== null && minimum <= maximum
        ? { ...base, kind: "integer", maximum, minimum }
        : null;
    }
    case "boolean":
      return { ...base, kind: "boolean" };
    case "table":
      return { ...base, kind: "table", rows: input.rows };
    case "resource": {
      const amount = evaluatedAmount(input.term.amount, context.bindings);
      return amount !== null && amount >= 1
        ? { ...base, amount, kind: "resource", term: input.term }
        : null;
    }
    case "item": {
      const owner = roleEntity(context.intent, input.owner);
      return owner?.entityId === "self" && owner.material.kind === "character-play"
        ? { ...base, kind: "item", owner }
        : null;
    }
  }
}

/**
 * Derive all table requirements without consuming answers. Conditions that depend
 * on earlier answers remain explicit `conditional` requirements in authored order.
 */
function deriveMechanicsRequirementsValidated(
  validated: ValidatedMechanicsIntent
): MechanicsRequirementsResult {
  const context: PredicateContext = {
    bindings: validated.bindings,
    intent: validated.execution,
    resolved: {},
    root: validated.root,
    world: validated.world,
  };
  const requirements: MechanicsRequirement[] = [];
  for (const input of validated.phase.inputs) {
    const requirement = requirementForInput(input, validated.phase.phaseId, context);
    if (!requirement) {
      return freezeDeep({
        reason: "invalid-requirement" as const,
        referenceId: input.inputId,
        status: "rejected",
      });
    }
    requirements.push(requirement);
  }
  return freezeDeep({
    intent: validated.intent,
    requirements: freezeDeep(requirements),
    status: "derived",
  });
}

function deriveRejected(
  validation: Exclude<MechanicsIntentValidation, ValidatedMechanicsIntent>
): MechanicsRequirementsResult {
  return freezeDeep({
    reason: validation.reason,
    referenceId: validation.referenceId,
    status: "rejected",
  });
}

export function deriveMechanicsRequirements(
  intentValue: unknown,
  stateValue: unknown
): MechanicsRequirementsResult {
  const state = conformMechanicsCausalState(stateValue);
  if (!state.ok) {
    return deriveRejected({ reason: "invalid-world", referenceId: null });
  }
  const validated = validateIntentAgainstReadableWorld(
    intentValue,
    state.value.world,
    state.value.context.pendingFrames
  );
  return "reason" in validated
    ? deriveRejected(validated)
    : deriveMechanicsRequirementsValidated(validated);
}

type RollPaymentEvidence =
  | {
      readonly kind: "d20";
      readonly observation: D20TestObservation;
      readonly payments: Extract<
        MechanicsAnswer,
        { readonly kind: "d20" }
      >["requests"][number]["payments"];
    }
  | {
      readonly kind: "dice";
      readonly observation: DiceObservation;
      readonly payments: Extract<
        MechanicsAnswer,
        { readonly kind: "dice" }
      >["requests"][number]["payments"];
    };

function resolvePayments(
  answer: RollPaymentEvidence,
  requirements: readonly MechanicsPaymentRequirement[],
  context: PredicateContext,
  usageBySource: Readonly<Record<string, number>>
): readonly ReviewedMechanicsPayment[] | null {
  if (!unique(answer.payments.map((payment) => payment.sourceId))) return null;
  const result: ReviewedMechanicsPayment[] = [];
  for (const requirement of requirements) {
    const uses = usageBySource[requirement.sourceId] ?? 0;
    const supplied = answer.payments.find(
      (payment) => payment.sourceId === requirement.sourceId
    );
    if (uses === 0) {
      if (supplied) return null;
      continue;
    }
    if (
      !supplied ||
      !resourceRefMatchesSelector(
        supplied.resource,
        requirement.selector,
        context.intent,
        context.resolved,
        context.world
      )
    ) {
      return null;
    }
    const amount = requirement.amountPerUse * uses;
    const remaining = resourceRemaining(context.world, supplied.resource);
    if (!Number.isSafeInteger(amount) || remaining === null || remaining < amount) {
      return null;
    }
    result.push({ amount, resource: supplied.resource, sourceId: requirement.sourceId });
  }
  if (
    answer.payments.some(
      (payment) => !result.some((reviewed) => reviewed.sourceId === payment.sourceId)
    )
  ) {
    return null;
  }
  return result;
}

interface MechanicsResourceDebit {
  readonly amount: number;
  readonly resource: ResourceRef;
}

function resolvedResourceDebits(
  resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>
): readonly MechanicsResourceDebit[] {
  return Object.values(resolved).flatMap((answer) => {
    if (answer.kind === "d20" || answer.kind === "dice") {
      return answer.requests.flatMap(({ payments }) => payments);
    }
    return answer.kind === "resource"
      ? [{ amount: answer.amount, resource: answer.resource }]
      : [];
  });
}

function reviewedPaymentsAreAffordable(
  payments: readonly MechanicsResourceDebit[],
  world: MechanicsWorld
): boolean {
  const totals = new Map<string, { amount: number; resource: ResourceRef }>();
  for (const payment of payments) {
    const key = resourceRefKey(payment.resource);
    const prior = totals.get(key);
    const amount = (prior?.amount ?? 0) + payment.amount;
    if (!Number.isSafeInteger(amount)) return false;
    totals.set(key, { amount, resource: payment.resource });
  }
  return [...totals.values()].every(
    ({ amount, resource }) => (resourceRemaining(world, resource) ?? -1) >= amount
  );
}

interface ReplacementAuthorizationBatch {
  readonly rules: readonly ResolvedDiceReplacementRule[];
  readonly trails: readonly ResolvedDiceTrail[];
}

function d20ReplacementAuthorizationBatches(
  result: D20TestResult
): ReplacementAuthorizationBatch[] | null {
  const batches: ReplacementAuthorizationBatch[] = [];
  const d20 = result.observation.d20;
  if (d20 && "trails" in d20 && result.review.d20Requirement) {
    const resolution = resolveDiceObservation(result.review.d20Requirement, d20);
    if (!resolution) return null;
    batches.push({
      rules: result.review.replacements.map(({ rule }) => rule),
      trails: resolution.trails,
    });
  }
  for (const modifier of result.resolvedEnteredModifiers) {
    if (modifier.kind !== "dice-formula") continue;
    batches.push({
      rules: result.review.replacements.flatMap(({ appliesTo, rule }) =>
        appliesTo === "any-die" ? [rule] : []
      ),
      trails: modifier.resolution.trails,
    });
  }
  return batches;
}

function resolveAnswer(
  answer: MechanicsAnswer,
  requirement: MechanicsRequirement,
  context: PredicateContext
): ResolvedMechanicsAnswer | null {
  if (answer.kind !== requirement.kind || answer.inputId !== requirement.inputId) {
    return null;
  }
  switch (requirement.kind) {
    case "entities": {
      if (answer.kind !== "entities") return null;
      if (
        answer.targets.length < requirement.minimum ||
        answer.targets.length > requirement.maximum ||
        (requirement.multiplicity === "set" && !unique(answer.targets.map(entityRefKey)))
      ) {
        return null;
      }
      for (const target of answer.targets) {
        const entity = worldEntity(context.world, target);
        if (
          !entity ||
          (requirement.eligibility !== "any" && entity.kind !== requirement.eligibility)
        ) {
          return null;
        }
      }
      const targets =
        requirement.multiplicity === "set"
          ? [...answer.targets].sort((left, right) =>
              compareCodeUnits(entityRefKey(left), entityRefKey(right))
            )
          : answer.targets;
      return { inputId: answer.inputId, kind: "entities", targets };
    }
    case "d20": {
      if (answer.kind !== "d20") return null;
      if (
        requirement.pendingEntityInputId !== null ||
        answer.requests.length !== requirement.requests.length
      ) {
        return null;
      }
      const requests: Extract<
        ResolvedMechanicsAnswer,
        { readonly kind: "d20" }
      >["requests"][number][] = [];
      const authorizationBatches: NonNullable<
        ReturnType<typeof d20ReplacementAuthorizationBatches>
      > = [];
      const paymentEvidence: Array<{
        readonly batches: readonly ReplacementAuthorizationBatch[];
        readonly evidence: RollPaymentEvidence;
        readonly requirements: readonly MechanicsPaymentRequirement[];
      }> = [];
      for (let index = 0; index < requirement.requests.length; index += 1) {
        const expected = requirement.requests[index];
        const supplied = answer.requests[index];
        if (!expected || !supplied || !exactEqual(supplied.identity, expected.identity)) {
          return null;
        }
        const result = evaluateD20Test(
          expected.review.request,
          context.bindings,
          supplied.observation
        );
        if (!result) return null;
        const batches = d20ReplacementAuthorizationBatches(result);
        if (!batches) return null;
        authorizationBatches.push(...batches);
        paymentEvidence.push({
          batches,
          evidence: {
            kind: "d20",
            observation: supplied.observation,
            payments: supplied.payments,
          },
          requirements: expected.payments,
        });
        requests.push({ identity: expected.identity, payments: [], result });
      }
      if (!countAuthorizedDiceReplacementUses(authorizationBatches)) return null;
      for (let index = 0; index < paymentEvidence.length; index += 1) {
        const evidence = paymentEvidence[index];
        const request = requests[index];
        if (!evidence || !request) return null;
        const uses = countAuthorizedDiceReplacementUses(evidence.batches);
        if (!uses) return null;
        const payments = resolvePayments(
          evidence.evidence,
          evidence.requirements,
          context,
          uses
        );
        if (!payments) return null;
        requests[index] = { ...request, payments };
      }
      return reviewedPaymentsAreAffordable(
        [
          ...resolvedResourceDebits(context.resolved),
          ...requests.flatMap(({ payments }) => payments),
        ],
        context.world
      )
        ? { inputId: answer.inputId, kind: "d20", requests }
        : null;
    }
    case "dice": {
      if (answer.kind !== "dice") return null;
      if (
        requirement.pendingInputId !== null ||
        answer.requests.length !== requirement.requests.length
      ) {
        return null;
      }
      const requests: Extract<
        ResolvedMechanicsAnswer,
        { readonly kind: "dice" }
      >["requests"][number][] = [];
      const batches: ReplacementAuthorizationBatch[] = [];
      const evidence: Array<{
        readonly answer: RollPaymentEvidence;
        readonly batch: ReplacementAuthorizationBatch;
        readonly requirements: readonly MechanicsPaymentRequirement[];
      }> = [];
      for (let index = 0; index < requirement.requests.length; index += 1) {
        const expected = requirement.requests[index];
        const supplied = answer.requests[index];
        if (!expected || !supplied || !exactEqual(supplied.identity, expected.identity)) {
          return null;
        }
        const resolution = resolveDiceObservation(expected.roll, supplied.observation);
        if (!resolution) return null;
        const batch = {
          rules: expected.replacementPolicy,
          trails: resolution.trails,
        };
        batches.push(batch);
        evidence.push({
          answer: {
            kind: "dice",
            observation: supplied.observation,
            payments: supplied.payments,
          },
          batch,
          requirements: expected.payments,
        });
        requests.push({ identity: expected.identity, payments: [], resolution });
      }
      if (!countAuthorizedDiceReplacementUses(batches)) return null;
      for (let index = 0; index < evidence.length; index += 1) {
        const current = evidence[index];
        const request = requests[index];
        if (!current || !request) return null;
        const uses = countAuthorizedDiceReplacementUses([current.batch]);
        if (!uses) return null;
        const payments = resolvePayments(
          current.answer,
          current.requirements,
          context,
          uses
        );
        if (!payments) return null;
        requests[index] = { ...request, payments };
      }
      return reviewedPaymentsAreAffordable(
        [
          ...resolvedResourceDebits(context.resolved),
          ...requests.flatMap(({ payments }) => payments),
        ],
        context.world
      )
        ? { inputId: answer.inputId, kind: "dice", requests }
        : null;
    }
    case "choice":
      return answer.kind === "choice" && requirement.options.includes(answer.choiceId)
        ? { choiceId: answer.choiceId, inputId: answer.inputId, kind: "choice" }
        : null;
    case "integer":
      return answer.kind === "integer" &&
        answer.value >= requirement.minimum &&
        answer.value <= requirement.maximum
        ? { inputId: answer.inputId, kind: "integer", value: answer.value }
        : null;
    case "boolean":
      return answer.kind === "boolean"
        ? { inputId: answer.inputId, kind: "boolean", value: answer.value }
        : null;
    case "table":
      return answer.kind === "table" && requirement.rows.includes(answer.rowId)
        ? {
            authority: answer.authority,
            inputId: answer.inputId,
            kind: "table",
            rowId: answer.rowId,
          }
        : null;
    case "resource": {
      if (
        answer.kind !== "resource" ||
        !resourceRefMatchesSelector(
          answer.resource,
          requirement.term.selector,
          context.intent,
          context.resolved,
          context.world
        ) ||
        !reviewedPaymentsAreAffordable(
          [
            ...resolvedResourceDebits(context.resolved),
            { amount: requirement.amount, resource: answer.resource },
          ],
          context.world
        )
      ) {
        return null;
      }
      return {
        amount: requirement.amount,
        inputId: answer.inputId,
        kind: "resource",
        resource: answer.resource,
      };
    }
    case "item": {
      if (
        answer.kind !== "item" ||
        !exactEqual(answer.owner, requirement.owner.material) ||
        !itemFor(context.world, answer.owner, answer.instanceId, answer.instanceOrdinal)
      ) {
        return null;
      }
      return {
        inputId: answer.inputId,
        instanceId: answer.instanceId,
        instanceOrdinal: answer.instanceOrdinal,
        kind: "item",
        owner: answer.owner,
      };
    }
  }
}

function reviewRejected(
  reason: MechanicsReviewRejection,
  referenceId: string | null,
  requirement: MechanicsRequirement | null = null
): MechanicsReviewResult {
  return freezeDeep({ reason, referenceId, requirement, status: "rejected" as const });
}

function reviewMechanicsIntentValidated(
  validated: ValidatedMechanicsIntent,
  answersValue: unknown
): MechanicsReviewResult {
  const answers = conformMechanicsAnswers(answersValue);
  if (!answers) return reviewRejected("invalid-answers", null);
  if (!unique(answers.map((answer) => answer.inputId))) {
    return reviewRejected("duplicate-answer", null);
  }
  const resolved: Record<string, ResolvedMechanicsAnswer> = {};
  const requirements: MechanicsRequirement[] = [];
  let answerIndex = 0;
  let context: PredicateContext = {
    bindings: validated.bindings,
    intent: validated.execution,
    resolved,
    root: validated.root,
    world: validated.world,
  };
  const refreshContextBindings = (): void => {
    context = {
      ...context,
      bindings: {
        ...validated.bindings,
        ...resolvedResourceLevelBindings(resolved),
      },
    };
  };

  for (const input of validated.phase.inputs) {
    const requirement = requirementForInput(input, validated.phase.phaseId, context);
    if (!requirement) return reviewRejected("invalid-requirement", input.inputId);
    const active = input.when === null ? true : evaluatePredicate(input.when, context);
    if (active === null) return reviewRejected("unresolved-predicate", input.inputId);
    const exactRequirement = {
      ...requirement,
      activation: active ? ("required" as const) : ("omitted" as const),
    };
    requirements.push(exactRequirement);
    const answer = answers[answerIndex];
    if (!active) {
      if (answer?.inputId === input.inputId) {
        return reviewRejected("unexpected-answer", input.inputId);
      }
      continue;
    }
    if (
      (exactRequirement.kind === "d20" &&
        exactRequirement.pendingEntityInputId !== null) ||
      (exactRequirement.kind === "dice" && exactRequirement.pendingInputId !== null)
    ) {
      return reviewRejected(
        "invalid-requirement",
        exactRequirement.kind === "d20"
          ? exactRequirement.pendingEntityInputId
          : exactRequirement.pendingInputId
      );
    }
    // A roll requirement whose expansion produced zero requests carries zero
    // physical information — it resolves itself without consuming an answer
    // (an outcome-expanded damage roll after an all-miss attack). An explicit
    // empty answer for it is still accepted through the ordinary path.
    if (
      (exactRequirement.kind === "d20" || exactRequirement.kind === "dice") &&
      exactRequirement.requests.length === 0 &&
      answer?.inputId !== input.inputId
    ) {
      resolved[input.inputId] =
        exactRequirement.kind === "d20"
          ? { inputId: input.inputId, kind: "d20", requests: [] }
          : { inputId: input.inputId, kind: "dice", requests: [] };
      refreshContextBindings();
      continue;
    }
    if (!answer) {
      return reviewRejected("missing-answer", input.inputId, exactRequirement);
    }
    if (answer.inputId !== input.inputId) {
      return reviewRejected("answer-order", answer.inputId);
    }
    const result = resolveAnswer(answer, exactRequirement, context);
    if (!result) {
      return reviewRejected(
        answer.kind === exactRequirement.kind ? "invalid-answer" : "answer-kind-mismatch",
        input.inputId,
        exactRequirement
      );
    }
    resolved[input.inputId] = result;
    refreshContextBindings();
    answerIndex += 1;
  }
  if (answerIndex !== answers.length) {
    return reviewRejected("unexpected-answer", answers[answerIndex]?.inputId ?? null);
  }
  const reviewed = freezeDeep({
    answers,
    intent: validated.intent,
    requirements,
    resolved,
  });
  authenticReviewedIntents.add(reviewed);
  return freezeDeep({ reviewed, status: "reviewed" });
}

/** Exact staged review against a re-proved source-readable causal state. */
export function reviewMechanicsIntent(
  intentValue: unknown,
  answersValue: unknown,
  stateValue: unknown
): MechanicsReviewResult {
  const state = conformMechanicsCausalState(stateValue);
  if (!state.ok) return reviewRejected("invalid-world", null);
  const validated = validateIntentAgainstReadableWorld(
    intentValue,
    state.value.world,
    state.value.context.pendingFrames
  );
  return "reason" in validated
    ? reviewRejected(validated.reason, validated.referenceId)
    : reviewMechanicsIntentValidated(validated, answersValue);
}
