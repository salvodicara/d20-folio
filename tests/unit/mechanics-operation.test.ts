import { describe, expect, it } from "vitest";

import { materialRefKey } from "@/lib/action-journal";
import { canonicalFingerprint, canonicalJson } from "@/lib/canonical-fingerprint";
import { resolveDamage, withDamageTableOverride } from "@/lib/damage";
import { evaluateDiceFormula } from "@/lib/dice-formula";
import { addOccurrence } from "@/lib/mechanic-occurrences";
import {
  mechanicsAuthorityDefinitionFingerprint,
  mechanicsAuthorityDefinitionKey,
} from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import {
  locateResolvedMaterialResource,
  resourceDefinitionFactGuard,
} from "@/lib/material-resource";
import {
  createEmptyCharacterMaterialState,
  createEmptySharedMaterialState,
} from "@/lib/material-state";
import {
  conformMechanicsOperation,
  conformMechanicsTransaction,
  projectMechanicsTransaction as projectKernelTransaction,
  simulateMechanicsTransaction as simulateKernelTransaction,
} from "@/lib/mechanics-operation";
import {
  advanceMechanicsPendingFrameSlot,
  advanceMechanicsPendingFrameStep,
  advanceMechanicsBoundary,
  beginMechanicsCausalState,
  beginMechanicsBoundary,
  completeMechanicsBoundaryCheckpoint,
  discoverMechanicsEndWave,
  parseMechanicsWorld,
  popMechanicsPendingFrame,
  pushMechanicsPendingFrame,
  topMechanicsPendingFrame,
} from "@/lib/mechanics-world";
import {
  createBetweenTurnsEconomyState,
  createTurnEconomyState,
  reduceTurnEconomy,
  turnEconomyProjectionFactGuard,
} from "@/lib/turn-economy";
import type { ActionFactGuard } from "@/types/action-journal";
import type { DamageDefenseRule, DamagePart, DamageResolution } from "@/types/damage";
import type { DiceFormula, DiceObservation } from "@/types/dice-formula";
import type { ProgramStepOccurrenceOrigin } from "@/types/mechanic-occurrence";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type {
  EntityRef,
  InventoryGenerationRef,
  OccurrenceGenerationRef,
} from "@/types/mechanics-reference";
import type {
  CreatureMaterialEntity,
  EncounterState,
  InventoryInstance,
  MaterialEntity,
  ObjectMaterialEntity,
} from "@/types/material-state";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
  MechanicsTransaction,
  MechanicsTransactionSimulationResult,
} from "@/types/mechanics-operation";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  MechanicsBoundaryCommand,
  MechanicsCausalState,
  MechanicsWorld,
} from "@/types/mechanics-world";
import type {
  ResourceInitializationObservations,
  ResourceRef,
  ResourceSpec,
} from "@/types/resource";
import type {
  TurnEconomyClaimCommand,
  TurnEconomyProjection,
} from "@/types/turn-economy";
import type { CreatureVitals } from "@/types/vitals";

const CHARACTER = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const SHARED = {
  campaignId: "campaign-1",
  kind: "shared-combat",
} as const;
const SELF = { entityId: "self", material: CHARACTER } as const satisfies EntityRef;
const STEP_IDS = {
  concentration: "start-concentration",
  condition: "apply-condition",
  entity: "create-entity",
  inventory: "create-inventory",
  polymorph: "start-polymorph",
  standing: "start-standing",
} as const;
const PROGRAM_STEPS = [
  {
    conditionId: "poisoned",
    kind: "condition",
    lifetime: { kind: "manual" },
    operation: "apply",
    stepId: STEP_IDS.condition,
    target: { kind: "role", role: "target" },
    when: null,
  },
  {
    fact: { key: "fixture-standing", kind: "active-key" },
    kind: "standing",
    lifetime: { kind: "manual" },
    operation: "start",
    stepId: STEP_IDS.standing,
    target: { kind: "role", role: "target" },
    when: null,
  },
  {
    kind: "concentration",
    lifetime: { kind: "manual" },
    operation: "start",
    stepId: STEP_IDS.concentration,
    when: null,
  },
  {
    formId: "fixture-form",
    kind: "polymorph",
    lifetime: { kind: "manual" },
    operation: "start",
    stepId: STEP_IDS.polymorph,
    target: { kind: "role", role: "target" },
    when: null,
  },
  {
    controller: null,
    entityKey: "fixture-entity",
    kind: "entity-create",
    lifetime: { kind: "manual" },
    stepId: STEP_IDS.entity,
    template: { kind: "monster", monsterId: "fixture-monster" },
    when: null,
  },
  {
    instanceKey: "fixture-inventory",
    itemId: "fixture-item",
    kind: "inventory-create",
    lifetime: { kind: "manual" },
    owner: "owner",
    quantity: { kind: "fixed", value: 1 },
    stepId: STEP_IDS.inventory,
    when: null,
  },
] as const;
const MECHANICS_REVISION = canonicalFingerprint({ fixture: "mechanics-operation" });
const CAPABILITY = {
  capabilityId: "operation",
  definition: {
    catalogueKind: "system",
    entityId: "system.mechanics-operation",
    kind: "catalogue",
    mechanicsRevision: MECHANICS_REVISION,
  },
  kind: "program",
} as const;
const INSTALLATION = {
  capability: CAPABILITY,
  generation: 1,
  installationId: "operation-installation",
  owner: SELF,
} as const;
const AUTHORITY = {
  anchors: {
    activator: SELF,
    caster: SELF,
    owner: SELF,
    source: SELF,
    target: SELF,
  },
  installation: INSTALLATION,
  schema: 1,
  snapshot: {
    grantGroups: {},
    program: {
      id: CAPABILITY.capabilityId,
      phases: [
        {
          inputs: [],
          phaseId: "invoke",
          steps: PROGRAM_STEPS,
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    },
    ref: CAPABILITY,
    resources: {},
    schema: 1,
  },
  source: { capability: CAPABILITY, kind: "capability", owner: SELF },
  staticBindings: {},
} as const satisfies MechanicsProgramAuthorityReceipt;

const TABLE_OWNER = {
  authority: "table",
  kind: "material-authority",
  material: CHARACTER,
} as const;
const TABLE_DEFINITION = {
  authority: "table",
  declarationId: "condition-immunity-override",
  generation: 1,
  kind: "table-declaration",
  material: CHARACTER,
} as const;
const TABLE_CAPABILITY = {
  capabilityId: "condition-immunity-override",
  definition: TABLE_DEFINITION,
  kind: "program",
} as const;
const TABLE_AUTHORITY = {
  anchors: {
    activator: null,
    caster: null,
    owner: null,
    source: null,
    target: null,
  },
  installation: {
    capability: TABLE_CAPABILITY,
    generation: 1,
    installationId: "condition-immunity-override",
    owner: TABLE_OWNER,
  },
  schema: 1,
  snapshot: {
    grantGroups: {},
    program: {
      id: TABLE_CAPABILITY.capabilityId,
      phases: [
        {
          inputs: [],
          phaseId: "invoke",
          steps: PROGRAM_STEPS,
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    },
    ref: TABLE_CAPABILITY,
    resources: {},
    schema: 1,
  },
  source: TABLE_DEFINITION,
  staticBindings: {},
} as const satisfies MechanicsProgramAuthorityReceipt;

const AUTHORITIES_BY_CAUSE = new Map<
  string,
  Readonly<MechanicsProgramAuthorityReceipt>
>();

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function authorityDefinition(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): MechanicsAuthorityDefinition {
  const definition: MechanicsAuthorityDefinition = {
    actorSpec: { kind: "role", role: "owner" },
    anchors: authority.anchors,
    definitionGuards: [
      {
        address: mechanicsDefinitionFactAddress(authority.snapshot.ref.definition),
        expected: {
          present: true,
          value: mechanicsCapabilitySnapshotFingerprint(authority.snapshot),
        },
        lifecycle: "commit",
        owner: authority.installation.owner,
      },
    ],
    installation: authority.installation,
    installationGuards: [],
    owner: authority.installation.owner,
    snapshot: authority.snapshot,
    source: authority.source,
    staticBindings: authority.staticBindings,
  };
  return {
    ...definition,
    installationGuards: [
      {
        address: mechanicsInstallationFactAddress(authority.installation),
        expected: {
          present: true,
          value: mechanicsAuthorityDefinitionFingerprint(definition),
        },
        lifecycle: "commit",
        owner: authority.installation.owner,
      },
    ],
  };
}

function expectedInstalledFacts(
  facts: readonly Readonly<ActionFactGuard>[] = [],
  authority: Readonly<MechanicsProgramAuthorityReceipt> = AUTHORITY
): readonly Readonly<ActionFactGuard>[] {
  const definition = authorityDefinition(authority);
  return [
    ...facts,
    ...definition.definitionGuards,
    ...definition.installationGuards,
  ].sort((left, right) =>
    compareCodeUnits(
      `${canonicalJson(left.owner)}\u0000${canonicalJson(left.address)}`,
      `${canonicalJson(right.owner)}\u0000${canonicalJson(right.address)}`
    )
  );
}

function authoritySnapshotFor(transactionValue: unknown): MechanicsAuthoritySnapshot {
  const causeValues =
    typeof transactionValue === "object" && transactionValue !== null
      ? (transactionValue as Record<string, unknown>).causes
      : null;
  const causes: readonly unknown[] = Array.isArray(causeValues)
    ? (causeValues as readonly unknown[])
    : [];
  const definitions = [
    ...new Map(
      causes.flatMap((cause) => {
        if (typeof cause !== "object" || cause === null || !("causeId" in cause)) {
          return [];
        }
        if (
          !("invocation" in cause) ||
          cause.invocation.kind !== "installed-capability"
        ) {
          return [];
        }
        const causeId = cause.causeId;
        if (typeof causeId !== "string") return [];
        const authority = AUTHORITIES_BY_CAUSE.get(causeId);
        if (!authority) return [];
        const definition = authorityDefinition(authority);
        return [[mechanicsAuthorityDefinitionKey(definition), definition] as const];
      })
    ).values(),
  ].sort((left, right) =>
    compareCodeUnits(
      mechanicsAuthorityDefinitionKey(left),
      mechanicsAuthorityDefinitionKey(right)
    )
  );
  return { definitions };
}

function causalState(worldValue: unknown) {
  const result = beginMechanicsCausalState(worldValue);
  if (!result.ok) throw new Error(`Invalid causal-state fixture: ${result.reason}`);
  return result.value;
}

function createProgramFrame(
  world: Readonly<MechanicsWorld>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  root: Readonly<OccurrenceGenerationRef>
): Readonly<MechanicsExecutionFrame> {
  const document = world.documents.find(
    ({ material }) => canonicalJson(material) === canonicalJson(root.occurrence.material)
  );
  if (!document) throw new Error("program-frame material fixture");
  return {
    authority,
    invocation: {
      installation: authority.installation,
      kind: "installed-capability",
    },
    rootReceipt: {
      kind: "create",
      materialEpoch: document.state.epoch,
      next: { execution: 1, phaseId: "invoke", triggerEventId: null },
      root,
    },
    trigger: { kind: "invocation" },
  };
}

function pushProgramFrame(
  stateValue: Readonly<MechanicsCausalState>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  root: Readonly<OccurrenceGenerationRef>
): {
  readonly frame: Readonly<MechanicsExecutionFrame>;
  readonly state: Readonly<MechanicsCausalState>;
} {
  const frame = createProgramFrame(stateValue.world, authority, root);
  const pushed = pushMechanicsPendingFrame(stateValue, frame);
  if (!pushed.ok) throw new Error(`pending-frame fixture: ${pushed.reason}`);
  return { frame, state: pushed.value };
}

function pendingAtStep(
  stateValue: Readonly<MechanicsCausalState>,
  frame: Readonly<MechanicsExecutionFrame>,
  stepId: string,
  nextSlot = 1
): Readonly<MechanicsCausalState> {
  const phase = frame.authority.snapshot.program?.phases.find(
    ({ phaseId }) => phaseId === frame.rootReceipt.next.phaseId
  );
  const targetIndex = phase?.steps.findIndex((step) => step.stepId === stepId) ?? -1;
  if (!phase || targetIndex < 0) throw new Error(`missing authored step: ${stepId}`);
  let current = stateValue;
  for (let index = 0; index < targetIndex; index += 1) {
    const advanced = advanceMechanicsPendingFrameStep(current, frame);
    if (!advanced.ok) throw new Error(`pending-step fixture: ${advanced.reason}`);
    current = advanced.value;
  }
  for (let slot = 1; slot < nextSlot; slot += 1) {
    const advanced = advanceMechanicsPendingFrameSlot(current, frame);
    if (!advanced.ok) throw new Error(`pending-slot fixture: ${advanced.reason}`);
    current = advanced.value;
  }
  return current;
}

function pendingAtPhaseTransition(
  stateValue: Readonly<MechanicsCausalState>,
  frame: Readonly<MechanicsExecutionFrame>
): Readonly<MechanicsCausalState> {
  let current = stateValue;
  let remaining = 64;
  while (topMechanicsPendingFrame(current)?.cursor.stage === "step" && remaining > 0) {
    const advanced = advanceMechanicsPendingFrameStep(current, frame);
    if (!advanced.ok) throw new Error(`pending-phase fixture: ${advanced.reason}`);
    current = advanced.value;
    remaining -= 1;
  }
  if (topMechanicsPendingFrame(current)?.cursor.stage !== "phase-transition") {
    throw new Error("pending phase-transition fixture");
  }
  return current;
}

function pendingProgramContext(
  world: Readonly<MechanicsWorld>,
  transactionValue: Readonly<MechanicsTransaction>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  root: Readonly<OccurrenceGenerationRef>,
  options: {
    readonly basis?: Readonly<MechanicsCausalState>;
    readonly nextSlot?: number;
    readonly stepId?: string;
  } = {}
) {
  const pushed = pushProgramFrame(options.basis ?? causalState(world), authority, root);
  return {
    authoritySnapshot: authoritySnapshotFor(transactionValue),
    state:
      options.stepId === undefined
        ? pushed.state
        : pendingAtStep(pushed.state, pushed.frame, options.stepId, options.nextSlot),
  } as const;
}

function simulationContext(worldValue: unknown, transactionValue: unknown) {
  return {
    authoritySnapshot: authoritySnapshotFor(transactionValue),
    state: causalState(worldValue),
  } as const;
}

function simulateMechanicsTransaction(
  worldValue: unknown,
  transactionValue: unknown,
  contextValue: unknown = simulationContext(worldValue, transactionValue)
): MechanicsTransactionSimulationResult {
  return simulateKernelTransaction(
    transactionValue,
    contextValue as Parameters<typeof simulateKernelTransaction>[1]
  );
}

function completeBoundary(
  world: Readonly<MechanicsWorld>,
  command: Readonly<MechanicsBoundaryCommand>
): Readonly<MechanicsWorld> {
  let result = beginMechanicsBoundary(world, command);
  let remaining = 16;
  while (result.status === "checkpoint" && remaining > 0) {
    const completion = completeMechanicsBoundaryCheckpoint(
      result.continuation,
      result.checkpoint.state
    );
    if (!completion) throw new Error("Invalid boundary-completion fixture");
    result = advanceMechanicsBoundary(result.continuation, completion);
    remaining -= 1;
  }
  if (result.status !== "complete") {
    throw new Error(`Boundary fixture failed: ${JSON.stringify(result)}`);
  }
  return result.state.world;
}

function operationCause(
  authority: MechanicsProgramAuthorityReceipt,
  invocation: MechanicsInvocationRef
): MechanicsOperationCause {
  const cause = { causeId: canonicalFingerprint({ authority, invocation }), invocation };
  AUTHORITIES_BY_CAUSE.set(cause.causeId, authority);
  return cause;
}

function installedCause(
  authority: MechanicsProgramAuthorityReceipt
): MechanicsOperationCause {
  return operationCause(authority, {
    installation: authority.installation,
    kind: "installed-capability",
  });
}

function programRootCause(
  authority: MechanicsProgramAuthorityReceipt,
  occurrenceId: string,
  ordinal = 1
): MechanicsOperationCause {
  return operationCause(authority, {
    kind: "program-root",
    occurrence: occurrenceGeneration(occurrenceId, ordinal),
  });
}

function occurrenceGeneration(
  occurrenceId: string,
  ordinal: number
): OccurrenceGenerationRef {
  return {
    occurrence: { material: CHARACTER, occurrenceId },
    ordinal,
  };
}

function programStepOrigin(
  stepId: (typeof STEP_IDS)[keyof typeof STEP_IDS],
  options: {
    execution?: number;
    rootId?: string;
    rootOrdinal?: number;
    slot?: number;
  } = {}
): ProgramStepOccurrenceOrigin {
  return {
    execution: options.execution ?? 1,
    kind: "program-step",
    phaseId: "invoke",
    root: occurrenceGeneration(options.rootId ?? "root", options.rootOrdinal ?? 1),
    slot: options.slot ?? 1,
    stepId,
  };
}

function inventoryAuthority(
  instanceId: string,
  instanceOrdinal: number
): MechanicsProgramAuthorityReceipt {
  return {
    ...AUTHORITY,
    source: {
      instanceId,
      instanceOrdinal,
      kind: "inventory-item",
      owner: CHARACTER,
    },
  };
}

function authorityVariant(seed: number): MechanicsProgramAuthorityReceipt {
  return { ...AUTHORITY, staticBindings: { seed } };
}

function orderedCauses(
  left: MechanicsOperationCause,
  right: MechanicsOperationCause
): [MechanicsOperationCause, MechanicsOperationCause] {
  return left.causeId < right.causeId ? [left, right] : [right, left];
}

const INSTALLED_CAUSE = installedCause(AUTHORITY);
function emptyAuthorityContext(worldValue: unknown) {
  return {
    authoritySnapshot: { definitions: [] },
    state: causalState(worldValue),
  } as const;
}
const SELECTOR = {
  damageTypes: [],
  deliveries: [],
  forbiddenTraits: [],
  requiredTraits: [],
} as const;
const COUNT_RESOURCE_SPEC = {
  capacity: { kind: "unbounded" },
  id: "focus",
  initial: { kind: "empty" },
  kind: "count",
  recoveries: [],
} as const satisfies ResourceSpec;
const BOUNDED_RESOURCE_SPEC = {
  capacity: { amount: { kind: "fixed", value: 3 }, kind: "bounded" },
  id: "focus",
  initial: { kind: "full" },
  kind: "count",
  recoveries: [],
} as const satisfies ResourceSpec;
const D4_FORMULA = {
  terms: [
    {
      count: { kind: "fixed", value: 1 },
      kind: "dice",
      operation: "add",
      sides: 4,
      termId: "resource-die",
    },
  ],
} as const satisfies DiceFormula;

function diceObservation(face: number): DiceObservation {
  const requirement = evaluateDiceFormula(D4_FORMULA, {});
  const trail = requirement?.trails[0];
  if (!requirement || !trail || requirement.trails.length !== 1) {
    throw new Error("dice observation fixture");
  }
  return {
    aggregates: [],
    trails: [{ initialFace: face, steps: [], trailId: trail.trailId }],
  };
}

function alive(current: number, temporary = 0): CreatureVitals {
  return {
    hitPoints: {
      current,
      temporary: { current: temporary, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  };
}

function countResource(current: number) {
  return {
    capacity: { base: { kind: "unbounded" as const }, override: null },
    current,
    disabled: false,
    kind: "count" as const,
  };
}

function dying(failures = 0): CreatureVitals {
  return {
    hitPoints: {
      current: 0,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: { failures, kind: "dying", successes: 0 },
  };
}

function dead(): CreatureVitals {
  return {
    hitPoints: {
      current: 0,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: { kind: "dead" },
  };
}

function creature(
  vitals: CreatureVitals,
  present = true,
  ordinal = 1
): CreatureMaterialEntity {
  return {
    availability: present ? "present" : "dismissed",
    controller: null,
    exhaustion: 0,
    kind: "creature",
    label: "",
    ordinal,
    ownerOccurrence: null,
    overrides: {
      armorClass: null,
      hitPointMaximum: 10,
      initiativeBonus: null,
      speedFt: null,
    },
    resources: {},
    template: {
      creatureTypeOverride: null,
      kind: "catalogue-monster",
      monsterId: "monster-1",
    },
    vitals,
  };
}

function object(current = 7, ordinal = 1): ObjectMaterialEntity {
  return {
    availability: "present",
    controller: null,
    kind: "object",
    label: "",
    ordinal,
    ownerOccurrence: null,
    overrides: {
      armorClass: null,
      damageDefenseProfile: null,
      hitPointMaximum: null,
      magical: null,
      materials: null,
      size: null,
    },
    resources: {},
    template: {
      definition: {
        armorClass: 15,
        damageDefenseProfile: { damageThreshold: null, rules: [] },
        hitPointMaximum: 7,
        magical: false,
        materials: [{ kind: "wood" }],
        name: "Training target",
        size: "Medium",
      },
      kind: "custom",
    },
    vitals: { hitPoints: { current } },
  };
}

function parsedWorld(
  vitals: CreatureVitals,
  entities: Record<string, MaterialEntity> = {}
): Readonly<MechanicsWorld> {
  const state = createEmptyCharacterMaterialState(1, CHARACTER, vitals);
  const nextEntityOrdinal =
    Math.max(0, ...Object.values(entities).map(({ ordinal }) => ordinal)) + 1;
  const result = parseMechanicsWorld({
    documents: [
      {
        kind: "character",
        material: CHARACTER,
        state: { ...state, entities, nextEntityOrdinal },
      },
    ],
    scope: CHARACTER,
  });
  if (!result.ok) throw new Error(`Invalid fixture: ${result.reason}`);
  return result.value;
}

function parsedCharacterState(
  state: Readonly<ReturnType<typeof createEmptyCharacterMaterialState>>
): Readonly<MechanicsWorld> {
  const result = parseMechanicsWorld({
    documents: [{ kind: "character", material: CHARACTER, state }],
    scope: CHARACTER,
  });
  if (!result.ok) throw new Error(`Invalid fixture: ${result.reason}`);
  return result.value;
}

function resourceWorld(current = 3): Readonly<MechanicsWorld> {
  const material = structuredClone(
    createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
  );
  material.resources.pools.focus = countResource(current);
  return parsedCharacterState(material);
}

function turnProjection(): TurnEconomyProjection {
  return {
    actions: { extraSlots: [], override: null },
    attacks: { options: [], perAttackAction: { base: 1, override: null } },
    bonusActions: {
      dualWielder: false,
      limit: { base: 1, override: null },
      requirements: [],
    },
    freeInteractions: { limit: { base: 1, override: null } },
    incapacitated: false,
    movement: {
      costPerFoot: { base: 1, override: null },
      modes: [{ mode: "walk", speedFt: { base: 30, override: null } }],
      requirements: [],
    },
    reactions: { limit: { base: 1, override: null }, requirements: [] },
  };
}

function encounterWorld(): Readonly<MechanicsWorld> {
  const material = createEmptyCharacterMaterialState(1, CHARACTER, alive(10));
  const economy = createTurnEconomyState("turn:1:1:1");
  if (!economy) throw new Error("turn-economy fixture");
  return parsedCharacterState({
    ...material,
    clockBinding: {
      ...material.clockBinding,
      encounter: { epoch: 1, material: CHARACTER },
    },
    encounter: {
      currentCombatantId: "hero",
      epoch: 1,
      nextCombatantOrdinal: 2,
      order: ["hero"],
      participants: {
        hero: {
          combatant: SELF,
          economy,
          initiativeRoll: 15,
          ordinal: 1,
          skipped: false,
        },
      },
      phase: "turns",
      round: 1,
    },
    nextEncounterEpoch: 2,
  });
}

function entityEncounterWorld(
  currentCombatantId: "ally" | "hero" | null,
  location: "local" | "shared",
  includeHero = true
): Readonly<MechanicsWorld> {
  const character = {
    ...structuredClone(createEmptyCharacterMaterialState(1, CHARACTER, alive(10))),
  };
  character.entities = { ally: creature(alive(8)) };
  character.nextEntityOrdinal = 2;
  const own = (turnId: string) => {
    const economy = createTurnEconomyState(turnId);
    if (!economy) throw new Error("own-turn fixture");
    return economy;
  };
  const waiting = (turnId: string) => {
    const economy = createBetweenTurnsEconomyState(turnId);
    if (!economy) throw new Error("between-turns fixture");
    return economy;
  };
  const participants: EncounterState["participants"] = {
    ...(includeHero
      ? {
          hero: {
            combatant: SELF,
            economy:
              currentCombatantId === "hero" ? own("hero-turn") : waiting("hero-wait"),
            initiativeRoll: 15,
            ordinal: 1,
            skipped: false,
          },
        }
      : {}),
    ally: {
      combatant: { entityId: "ally", material: CHARACTER, ordinal: 1 },
      economy: currentCombatantId === "ally" ? own("ally-turn") : waiting("ally-wait"),
      initiativeRoll: 10,
      ordinal: includeHero ? 2 : 1,
      skipped: false,
    },
  };
  const encounter: EncounterState = {
    currentCombatantId,
    epoch: 1,
    nextCombatantOrdinal: includeHero ? 3 : 2,
    order: currentCombatantId === null ? [] : includeHero ? ["hero", "ally"] : ["ally"],
    participants,
    phase: currentCombatantId === null ? "initiative" : "turns",
    round: 1,
  };
  if (location === "local") {
    character.clockBinding = {
      ...character.clockBinding,
      encounter: { epoch: 1, material: CHARACTER },
    };
    character.encounter = encounter;
    character.nextEncounterEpoch = 2;
    return parsedCharacterState(character);
  }
  character.clockBinding = {
    encounter: { epoch: 1, material: SHARED },
    timeline: { epoch: 0, material: SHARED },
  };
  const shared = { ...structuredClone(createEmptySharedMaterialState()) };
  shared.encounter = encounter;
  shared.nextEncounterEpoch = 2;
  const documents = [
    { kind: "character" as const, material: CHARACTER, state: character },
    { kind: "shared" as const, material: SHARED, state: shared },
  ].sort((left, right) => {
    const leftKey = materialRefKey(left.material);
    const rightKey = materialRefKey(right.material);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const parsed = parseMechanicsWorld({ documents, scope: CHARACTER });
  if (!parsed.ok) throw new Error(`Invalid shared encounter fixture: ${parsed.reason}`);
  return parsed.value;
}

function turnEconomyOperation(
  command: Readonly<TurnEconomyClaimCommand>,
  projection: Readonly<TurnEconomyProjection> = turnProjection()
): Extract<MechanicsOperation, { readonly kind: "turn-economy-transition" }> {
  return {
    causeId: INSTALLED_CAUSE.causeId,
    combatant: SELF,
    command,
    kind: "turn-economy-transition",
    operationId: "turn-economy",
    projection,
  };
}

function resourceDefinitionFact(
  world: Readonly<MechanicsWorld>,
  resource: Readonly<ResourceRef>,
  spec: Readonly<ResourceSpec> = COUNT_RESOURCE_SPEC,
  bindings: Readonly<Record<string, number>> = {}
): ActionFactGuard {
  const location = locateResolvedMaterialResource(world, resource);
  if (!location) throw new Error("resource fixture missing");
  return resourceDefinitionFactGuard(location, spec, bindings);
}

function initializeOperation(
  operationId: string,
  resource: Readonly<ResourceRef>,
  spec: Readonly<ResourceSpec> = BOUNDED_RESOURCE_SPEC,
  observations: Readonly<ResourceInitializationObservations> = {}
): MechanicsOperation {
  return {
    bindings: {},
    causeId: INSTALLED_CAUSE.causeId,
    kind: "resource-initialize",
    observations,
    operationId,
    resource,
    spec,
  };
}

function concentratingWorld(vitals: CreatureVitals): Readonly<MechanicsWorld> {
  const state = structuredClone(createEmptyCharacterMaterialState(1, CHARACTER, vitals));
  const root = addOccurrence(
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    },
    "root",
    {
      authority: AUTHORITY,
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    }
  );
  const occurrences = addOccurrence(root, "focus", {
    endRules: [],
    kind: "concentration",
    origin: programStepOrigin(STEP_IDS.concentration),
    parentId: "root",
    target: SELF,
  });
  const invoked = structuredClone(occurrences);
  const program = invoked.occurrences.root;
  if (!program || program.kind !== "program") throw new Error("root fixture");
  program.phaseState.invoke = { execution: 1, lastTriggerEventId: null };
  return parsedCharacterState({ ...state, ...invoked });
}

function damage(
  target: EntityRef,
  parts: readonly DamagePart[],
  rules: readonly DamageDefenseRule[] = []
): Readonly<DamageResolution> {
  const result = resolveDamage(
    {
      delivery: "attack",
      packetId: `packet-${target.entityId}`,
      parts,
      target,
      traits: [],
    },
    { damageThreshold: null, rules },
    []
  );
  if (!result || result.kind !== "resolved") throw new Error("damage fixture");
  return result.resolution;
}

function creatureDamage(
  operationId: string,
  target: EntityRef,
  amount: number,
  options: {
    criticalHit?: boolean;
    maximumHitPoints?: { kind: "material" } | { kind: "fact"; value: number };
    rules?: readonly DamageDefenseRule[];
  } = {}
): Extract<MechanicsOperation, { readonly kind: "creature-damage" }> {
  return {
    attacker: null,
    causeId: INSTALLED_CAUSE.causeId,
    criticalHit: options.criticalHit ?? false,
    damage: damage(
      target,
      [{ amount, damageType: "force", partId: `part-${operationId}` }],
      options.rules
    ),
    kind: "creature-damage",
    maximumHitPoints: options.maximumHitPoints ?? { kind: "material" },
    operationId,
    zeroHitPointsPolicy: "dying",
  };
}

function conditionCreate(
  operationId: string,
  occurrenceId: string,
  conditionId: "paralyzed" | "poisoned",
  conditionImmunityOverride: { reasonId: string } | null = null,
  options: {
    cause?: MechanicsOperationCause;
    createdOrdinal?: number;
    parentId?: string;
    parentOrdinal?: number;
  } = {}
): MechanicsOperation {
  const cause = options.cause ?? INSTALLED_CAUSE;
  const parentId = options.parentId ?? "root";
  return {
    causeId: cause.causeId,
    conditionImmunityOverride,
    created: occurrenceGeneration(occurrenceId, options.createdOrdinal ?? 3),
    kind: "occurrence-create",
    occurrence: {
      conditionId,
      endRules: [],
      kind: "condition",
      origin: programStepOrigin(STEP_IDS.condition, {
        rootId: parentId,
        rootOrdinal: options.parentOrdinal ?? 1,
      }),
      parentId,
      target: SELF,
    },
    operationId,
    parent: occurrenceGeneration(parentId, options.parentOrdinal ?? 1),
  };
}

function programCreate(
  operationId: string,
  occurrenceId: string,
  cause: MechanicsOperationCause
): Extract<MechanicsOperation, { readonly kind: "program-root-create" }> {
  return {
    causeId: cause.causeId,
    endRules: [],
    kind: "program-root-create",
    materialEpoch: 0,
    operationId,
    root: occurrenceGeneration(occurrenceId, 1),
  };
}

function programPhaseTransition(
  operationId: string,
  cause: MechanicsOperationCause,
  root: OccurrenceGenerationRef,
  triggerEventId: string | null = null
): Extract<MechanicsOperation, { readonly kind: "program-phase-transition" }> {
  return {
    causeId: cause.causeId,
    expected: { execution: 0, phaseId: "invoke", triggerEventId: null },
    kind: "program-phase-transition",
    next: { execution: 1, phaseId: "invoke", triggerEventId },
    operationId,
    root,
  };
}

function programRegister(
  operationId: string,
  cause: MechanicsOperationCause,
  root: OccurrenceGenerationRef,
  registerId: string,
  expected: string | number | boolean | null,
  next: string | number | boolean | null
): Extract<MechanicsOperation, { readonly kind: "program-register-transition" }> {
  return {
    causeId: cause.causeId,
    expected,
    kind: "program-register-transition",
    next,
    operationId,
    registerId,
    root,
  };
}

function authorityWithRegister(
  registerId: string,
  initial: string | number | boolean | null
): MechanicsProgramAuthorityReceipt {
  return {
    ...AUTHORITY,
    snapshot: {
      ...AUTHORITY.snapshot,
      program: {
        ...AUTHORITY.snapshot.program,
        phases: [
          {
            ...AUTHORITY.snapshot.program.phases[0],
            steps: [
              {
                kind: "register",
                operation: {
                  kind: "set-scalar",
                  value: initial,
                },
                registerId,
                stepId: `set-${registerId}`,
                when: null,
              },
            ],
          },
        ],
        registers: [{ initial, registerId }],
      },
    },
  };
}

function standingCreate(
  operationId: string,
  occurrenceId: string,
  parentId: string,
  cause: MechanicsOperationCause,
  parentOrdinal = 1
): Extract<MechanicsOperation, { readonly kind: "occurrence-create" }> {
  return {
    causeId: cause.causeId,
    conditionImmunityOverride: null,
    created: occurrenceGeneration(occurrenceId, 2),
    kind: "occurrence-create",
    occurrence: {
      endRules: [],
      fact: { key: occurrenceId, kind: "active-key" },
      kind: "standing",
      origin: programStepOrigin(STEP_IDS.standing, {
        rootId: parentId,
        rootOrdinal: parentOrdinal,
      }),
      parentId,
      target: SELF,
    },
    operationId,
    parent: occurrenceGeneration(parentId, parentOrdinal),
  };
}

function worldWithZeroedRoots(
  roots: readonly (readonly [string, MechanicsProgramAuthorityReceipt])[]
): Readonly<MechanicsWorld> {
  const state = structuredClone(
    createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
  );
  const initial = roots.reduce(
    (current, [occurrenceId, authority]) =>
      addOccurrence(current, occurrenceId, {
        authority,
        endRules: [],
        kind: "program",
        phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
        registers: {},
      }),
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    }
  );
  return parsedCharacterState({ ...state, ...initial });
}

function appendZeroedRoot(
  world: Readonly<MechanicsWorld>,
  occurrenceId: string,
  authority: Readonly<MechanicsProgramAuthorityReceipt> = AUTHORITY
): {
  readonly root: Readonly<OccurrenceGenerationRef>;
  readonly world: Readonly<MechanicsWorld>;
} {
  const material = structuredClone(state(world));
  const ordinal = material.nextOccurrenceOrdinal;
  const occurrences = addOccurrence(
    {
      nextOccurrenceOrdinal: material.nextOccurrenceOrdinal,
      occurrences: material.occurrences,
    },
    occurrenceId,
    {
      authority,
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: Object.fromEntries(
        (authority.snapshot.program?.registers ?? []).map(({ initial, registerId }) => [
          registerId,
          initial,
        ])
      ),
    }
  );
  return {
    root: occurrenceGeneration(occurrenceId, ordinal),
    world: parsedCharacterState({ ...material, ...occurrences }),
  };
}

function transaction(
  operations: readonly [MechanicsOperation, ...MechanicsOperation[]],
  options: {
    actionId?: string;
    actor?: MechanicsTransaction["actor"];
    causes?: readonly [MechanicsOperationCause, ...MechanicsOperationCause[]];
    factGuards?: readonly ActionFactGuard[];
  } = {}
): MechanicsTransaction {
  return {
    actionId: options.actionId ?? "action-1",
    actor: options.actor ?? SELF,
    causes: options.causes ?? [INSTALLED_CAUSE],
    factGuards: options.factGuards ?? [],
    operations,
  };
}

function simulated(
  result: MechanicsTransactionSimulationResult
): Extract<MechanicsTransactionSimulationResult, { status: "simulated" }> {
  if (result.status !== "simulated") {
    throw new Error(`Expected simulation, got ${JSON.stringify(result)}`);
  }
  return result;
}

function state(world: Readonly<MechanicsWorld>) {
  const document = world.documents[0];
  if (!document || document.kind !== "character") throw new Error("fixture");
  return document.state;
}

function entityCreateOperation(
  cause: MechanicsOperationCause,
  ordinal = 1,
  lifecycleOrdinal = 2
): Extract<MechanicsOperation, { readonly kind: "entity-create" }> {
  const value = creature(alive(8));
  const newEntity = {
    controller: value.controller,
    exhaustion: value.exhaustion,
    kind: value.kind,
    label: value.label,
    overrides: value.overrides,
    resources: value.resources,
    template: value.template,
    vitals: value.vitals,
  };
  return {
    causeId: cause.causeId,
    endRules: [],
    entity: { entityId: "summon", material: CHARACTER, ordinal },
    kind: "entity-create",
    lifecycle: occurrenceGeneration("summon-lifecycle", lifecycleOrdinal),
    operationId: "create-summon",
    origin: programStepOrigin(STEP_IDS.entity),
    parent: occurrenceGeneration("root", 1),
    value: newEntity,
  };
}

function inventoryRef(instanceId: string, instanceOrdinal: number) {
  return {
    instanceId,
    instanceOrdinal,
    owner: CHARACTER,
  } as const satisfies InventoryGenerationRef;
}

function inventoryInstance(
  ordinal: number,
  quantity = 1,
  overrides: Partial<InventoryInstance> = {}
): InventoryInstance {
  return {
    attuned: false,
    definition: { itemId: `item-${ordinal}`, kind: "catalogue" },
    disposition: "magical",
    enchantment: null,
    equipped: false,
    notes: "",
    ordinal,
    overrides: {
      armorClass: null,
      attackBonus: null,
      damageFormula: null,
      damageType: null,
      name: null,
    },
    ownerOccurrence: null,
    quantity: countResource(quantity),
    resources: {},
    tags: [],
    ...overrides,
  };
}

function inventoryCreateOperation(
  cause: MechanicsOperationCause,
  instanceId = "summoned-item",
  instanceOrdinal = 1,
  lifecycleOrdinal = 2
): Extract<MechanicsOperation, { readonly kind: "inventory-create" }> {
  const value = inventoryInstance(instanceOrdinal);
  const instance = {
    attuned: value.attuned,
    definition: value.definition,
    disposition: value.disposition,
    enchantment: value.enchantment,
    equipped: value.equipped,
    notes: value.notes,
    overrides: value.overrides,
    quantity: value.quantity,
    resources: value.resources,
    tags: value.tags,
  };
  return {
    causeId: cause.causeId,
    endRules: [],
    instance,
    item: inventoryRef(instanceId, instanceOrdinal),
    kind: "inventory-create",
    lifecycle: occurrenceGeneration(`${instanceId}-lifecycle`, lifecycleOrdinal),
    operationId: `create-${instanceId}`,
    origin: programStepOrigin(STEP_IDS.inventory),
    parent: occurrenceGeneration("root", 1),
  };
}

describe("atomic mechanics transactions", () => {
  it("creates one inventory generation and lifecycle atomically with exact replay", () => {
    const rootCause = programRootCause(AUTHORITY, "root");
    const operation = inventoryCreateOperation(rootCause);
    expect(conformMechanicsOperation(operation)).toEqual(operation);
    expect(conformMechanicsOperation({ ...operation, extra: true })).toBeNull();
    expect(
      conformMechanicsOperation({
        ...operation,
        instance: { ...operation.instance, ownerOccurrence: null },
      })
    ).toBeNull();

    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const create = transaction([operation], { causes: [rootCause] });
    const created = simulated(
      simulateMechanicsTransaction(
        before,
        create,
        pendingProgramContext(
          before,
          create,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.inventory }
        )
      )
    );
    expect(state(created.state.world)).toMatchObject({
      nextInventoryOrdinal: 2,
      nextOccurrenceOrdinal: 3,
      inventory: {
        "summoned-item": {
          ordinal: 1,
          ownerOccurrence: operation.lifecycle,
          quantity: { current: 1 },
        },
      },
      occurrences: {
        "summoned-item-lifecycle": {
          kind: "material-lifecycle",
          ordinal: 2,
          parentId: "root",
          target: SELF,
        },
      },
    });
    expect(created.executions[0]).toMatchObject({
      facts: {
        created: operation.item,
        lifecycle: operation.lifecycle,
      },
      kind: "inventory-create",
      status: "applied",
    });
    expect(
      simulateMechanicsTransaction(created.state.world, create, {
        authoritySnapshot: authoritySnapshotFor(create),
        state: created.state,
      })
    ).toMatchObject({
      executions: [{ kind: "inventory-create", reason: "inventory-already-created" }],
      status: "no-change",
    });
  });

  it("rejects stale inventory allocation state and partial collisions atomically", () => {
    const rootCause = programRootCause(AUTHORITY, "root");
    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const operation = inventoryCreateOperation(rootCause);
    const stale = transaction(
      [{ ...operation, item: inventoryRef("summoned-item", 2) }],
      { causes: [rootCause] }
    );
    expect(
      simulateMechanicsTransaction(
        before,
        stale,
        pendingProgramContext(before, stale, AUTHORITY, occurrenceGeneration("root", 1), {
          stepId: STEP_IDS.inventory,
        })
      )
    ).toEqual({
      operationId: operation.operationId,
      reason: "stale-allocation-state",
      status: "rejected",
    });
    expect(state(before).inventory).toEqual({});

    const material = structuredClone(state(before));
    material.inventory[operation.item.instanceId] = inventoryInstance(1);
    material.nextInventoryOrdinal = 2;
    const collided = parsedCharacterState(material);
    const collision = transaction([operation], { causes: [rootCause] });
    expect(
      simulateMechanicsTransaction(
        collided,
        collision,
        pendingProgramContext(
          collided,
          collision,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.inventory }
        )
      )
    ).toEqual({
      operationId: operation.operationId,
      reason: "inventory-collision",
      status: "rejected",
    });
  });

  it("uses one desired-state reducer for quantity, equipment, and attunement", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.item = inventoryInstance(1);
    material.nextInventoryOrdinal = 2;
    const before = parsedCharacterState(material);
    const change = (
      operationId: string,
      desired: Extract<
        Extract<MechanicsOperation, { kind: "inventory-transition" }>["change"],
        { kind: "quantity" | "equipped" | "attuned" }
      >
    ): Extract<MechanicsOperation, { kind: "inventory-transition" }> => ({
      causeId: INSTALLED_CAUSE.causeId,
      change: desired,
      enchantmentBearer: null,
      item: inventoryRef("item", 1),
      kind: "inventory-transition",
      operationId,
    });

    const equipped = simulated(
      simulateMechanicsTransaction(
        before,
        transaction([change("equip", { kind: "equipped", value: true })])
      )
    );
    expect(state(equipped.state.world).inventory.item?.equipped).toBe(true);
    const attuned = simulated(
      simulateMechanicsTransaction(
        equipped.state.world,
        transaction([change("attune", { kind: "attuned", value: true })])
      )
    );
    expect(state(attuned.state.world).inventory.item?.attuned).toBe(true);
    expect(
      simulateMechanicsTransaction(
        attuned.state.world,
        transaction([change("stack", { kind: "quantity", value: 2 })])
      )
    ).toEqual({
      operationId: "stack",
      reason: "invalid-transition",
      status: "rejected",
    });

    const plain = structuredClone(material);
    plain.inventory.item = inventoryInstance(1, 1, { disposition: "nonmagical" });
    expect(
      simulateMechanicsTransaction(
        parsedCharacterState(plain),
        transaction([change("attune-plain", { kind: "attuned", value: true })])
      )
    ).toEqual({
      operationId: "attune-plain",
      reason: "invalid-transition",
      status: "rejected",
    });
    const stacked = simulated(
      simulateMechanicsTransaction(
        before,
        transaction([change("stack-clean", { kind: "quantity", value: 3 })])
      )
    );
    expect(state(stacked.state.world).inventory.item?.quantity.current).toBe(3);
  });

  it("zeroes an item under an exact lease, keeps ownership, and requests lifecycle end", () => {
    const rootCause = programRootCause(AUTHORITY, "root");
    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const create = transaction([inventoryCreateOperation(rootCause)], {
      causes: [rootCause],
    });
    const created = simulated(
      simulateMechanicsTransaction(
        before,
        create,
        pendingProgramContext(
          before,
          create,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.inventory }
        )
      )
    );
    const operation = {
      causeId: rootCause.causeId,
      change: { kind: "quantity", value: 0 },
      enchantmentBearer: null,
      item: inventoryRef("summoned-item", 1),
      kind: "inventory-transition",
      operationId: "consume-summoned-item",
    } as const satisfies MechanicsOperation;
    const ended = simulated(
      simulateMechanicsTransaction(
        created.state.world,
        transaction([operation], { causes: [rootCause] }),
        {
          authoritySnapshot: authoritySnapshotFor(
            transaction([operation], { causes: [rootCause] })
          ),
          state: created.state,
        }
      )
    );
    expect(state(ended.state.world).inventory["summoned-item"]).toMatchObject({
      ownerOccurrence: occurrenceGeneration("summoned-item-lifecycle", 2),
      quantity: { current: 0 },
    });
    expect(ended.state.context.request.inventorySourceLeases).toEqual([operation.item]);
    expect(ended.state.context.request.endRequests).toEqual([
      occurrenceGeneration("summoned-item-lifecycle", 2),
    ]);
    expect(
      state(ended.state.world).occurrences["summoned-item-lifecycle"]?.ending
    ).toEqual({ causes: [{ kind: "requested" }] });
    expect(ended.consequences).toEqual([
      {
        causeId: operation.causeId,
        kind: "occurrence-end",
        occurrence: occurrenceGeneration("summoned-item-lifecycle", 2),
        operationId: operation.operationId,
      },
    ]);
  });

  it("CAS-detaches the exact inbound enchantment bearer and rejects stale or omitted bearers", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    const enchantment = inventoryRef("rune", 2);
    material.inventory.weapon = inventoryInstance(1, 1, { enchantment });
    material.inventory.rune = inventoryInstance(2);
    material.nextInventoryOrdinal = 3;
    const before = parsedCharacterState(material);
    const operation = {
      causeId: INSTALLED_CAUSE.causeId,
      enchantmentBearer: inventoryRef("weapon", 1),
      item: enchantment,
      kind: "inventory-end",
      operationId: "end-rune",
    } as const satisfies MechanicsOperation;
    expect(conformMechanicsOperation(operation)).toEqual(operation);
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([{ ...operation, enchantmentBearer: null }])
      )
    ).toEqual({
      operationId: operation.operationId,
      reason: "invalid-transition",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([{ ...operation, enchantmentBearer: inventoryRef("weapon", 99) }])
      )
    ).toEqual({
      operationId: operation.operationId,
      reason: "invalid-transition",
      status: "rejected",
    });

    const ended = simulated(
      simulateMechanicsTransaction(before, transaction([operation]))
    );
    expect(state(ended.state.world).inventory.weapon?.enchantment).toBeNull();
    expect(state(ended.state.world).inventory.rune?.quantity.current).toBe(0);
    expect(ended.executions[0]).toMatchObject({
      facts: { detachedFrom: operation.enchantmentBearer },
      kind: "inventory-end",
    });
  });

  it("creates one entity generation and its lifecycle atomically with exact replay", () => {
    const rootCause = programRootCause(AUTHORITY, "root");
    const operation = entityCreateOperation(rootCause);
    expect(conformMechanicsOperation(operation)).toEqual(operation);
    expect(conformMechanicsOperation({ ...operation, ordinal: 1 })).toBeNull();
    expect(
      conformMechanicsOperation({
        ...operation,
        value: { ...operation.value, availability: "present" },
      })
    ).toBeNull();

    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const create = transaction([operation], { causes: [rootCause] });
    const created = simulated(
      simulateMechanicsTransaction(
        before,
        create,
        pendingProgramContext(
          before,
          create,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.entity }
        )
      )
    );
    expect(created.executions).toEqual([
      {
        facts: { entity: operation.entity, lifecycle: operation.lifecycle },
        kind: "entity-create",
        operation,
        operationId: operation.operationId,
        status: "applied",
      },
    ]);
    expect(state(created.state.world)).toMatchObject({
      entities: {
        summon: {
          availability: "present",
          ordinal: 1,
          ownerOccurrence: operation.lifecycle,
        },
      },
      nextEntityOrdinal: 2,
      nextOccurrenceOrdinal: 3,
      occurrences: {
        "summon-lifecycle": {
          ending: null,
          kind: "material-lifecycle",
          ordinal: 2,
          parentId: "root",
          target: operation.entity,
        },
      },
    });

    expect(
      simulateMechanicsTransaction(created.state.world, create, {
        authoritySnapshot: authoritySnapshotFor(create),
        state: created.state,
      })
    ).toMatchObject({
      executions: [
        {
          kind: "entity-create",
          operationId: operation.operationId,
          reason: "entity-already-created",
          status: "no-change",
        },
      ],
      status: "no-change",
    });
  });

  it("rejects stale entity allocation, partial collisions, and invalid controllers", () => {
    const rootCause = programRootCause(AUTHORITY, "root");
    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const stale = entityCreateOperation(rootCause, 2, 2);
    const staleTransaction = transaction([stale], { causes: [rootCause] });
    expect(
      simulateMechanicsTransaction(
        before,
        staleTransaction,
        pendingProgramContext(
          before,
          staleTransaction,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.entity }
        )
      )
    ).toEqual({
      operationId: stale.operationId,
      reason: "stale-allocation-state",
      status: "rejected",
    });

    const collisionState = structuredClone(state(before));
    collisionState.entities.summon = creature(alive(8));
    collisionState.nextEntityOrdinal = 2;
    const collisionWorld = parsedCharacterState(collisionState);
    const collision = entityCreateOperation(rootCause);
    const collisionTransaction = transaction([collision], { causes: [rootCause] });
    expect(
      simulateMechanicsTransaction(
        collisionWorld,
        collisionTransaction,
        pendingProgramContext(
          collisionWorld,
          collisionTransaction,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.entity }
        )
      )
    ).toEqual({
      operationId: collision.operationId,
      reason: "entity-collision",
      status: "rejected",
    });

    const missingController = {
      ...entityCreateOperation(rootCause),
      value: {
        ...entityCreateOperation(rootCause).value,
        controller: { entityId: "missing", material: CHARACTER, ordinal: 99 },
      },
    } as const satisfies MechanicsOperation;
    const missingControllerTransaction = transaction([missingController], {
      causes: [rootCause],
    });
    expect(
      simulateMechanicsTransaction(
        before,
        missingControllerTransaction,
        pendingProgramContext(
          before,
          missingControllerTransaction,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.entity }
        )
      )
    ).toEqual({
      operationId: missingController.operationId,
      reason: "missing-controller",
      status: "rejected",
    });

    const selfControlled = {
      ...entityCreateOperation(rootCause),
      value: {
        ...entityCreateOperation(rootCause).value,
        controller: entityCreateOperation(rootCause).entity,
      },
    } as const satisfies MechanicsOperation;
    const selfControlledTransaction = transaction([selfControlled], {
      causes: [rootCause],
    });
    expect(
      simulateMechanicsTransaction(
        before,
        selfControlledTransaction,
        pendingProgramContext(
          before,
          selfControlledTransaction,
          AUTHORITY,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.entity }
        )
      )
    ).toEqual({
      operationId: selfControlled.operationId,
      reason: "controller-cycle",
      status: "rejected",
    });
  });

  it("updates availability and controller on exact dismissed generations", () => {
    const summon = creature(alive(8), false);
    const ally = creature(alive(8), true, 2);
    const before = parsedWorld(alive(10), { ally, summon });
    const target = { entityId: "summon", material: CHARACTER, ordinal: 1 } as const;
    const controller = { entityId: "ally", material: CHARACTER, ordinal: 2 } as const;
    const setController = {
      causeId: INSTALLED_CAUSE.causeId,
      controller,
      kind: "entity-controller",
      operationId: "set-controller",
      target,
    } as const satisfies MechanicsOperation;
    const present = {
      availability: "present",
      causeId: INSTALLED_CAUSE.causeId,
      kind: "entity-availability",
      operationId: "present-summon",
      target,
    } as const satisfies MechanicsOperation;
    const result = simulated(
      simulateMechanicsTransaction(before, transaction([setController, present]))
    );
    expect(result.executions).toMatchObject([
      { facts: { after: controller, before: null }, status: "applied" },
      { facts: { after: "present", before: "dismissed" }, status: "applied" },
    ]);
    expect(state(result.state.world).entities.summon).toMatchObject({
      availability: "present",
      controller,
    });

    const cycle = {
      ...setController,
      controller: target,
      operationId: "self-cycle",
      target: controller,
    } as const satisfies MechanicsOperation;
    expect(
      simulateMechanicsTransaction(result.state.world, transaction([cycle]))
    ).toEqual({
      operationId: cycle.operationId,
      reason: "controller-cycle",
      status: "rejected",
    });
  });

  it.each(["local", "shared"] as const)(
    "atomically removes a dismissed non-current participant from a %s encounter",
    (location) => {
      const before = entityEncounterWorld("hero", location);
      const dismiss = {
        availability: "dismissed",
        causeId: INSTALLED_CAUSE.causeId,
        kind: "entity-availability",
        operationId: `dismiss-${location}-noncurrent`,
        target: { entityId: "ally", material: CHARACTER, ordinal: 1 },
      } as const satisfies MechanicsOperation;
      const result = simulated(
        simulateMechanicsTransaction(before, transaction([dismiss]))
      );
      const character = result.state.world.documents.find(
        (document) => document.kind === "character"
      );
      const encounterDocument = result.state.world.documents.find(
        (document) => document.kind === (location === "local" ? "character" : "shared")
      );
      expect(character?.state.entities.ally?.availability).toBe("dismissed");
      expect(encounterDocument?.state.encounter).toMatchObject({
        currentCombatantId: "hero",
        order: ["hero"],
        participants: { hero: {} },
      });
      expect(encounterDocument?.state.encounter?.participants).not.toHaveProperty("ally");
      expect(encounterDocument?.state.encounter?.participants.hero?.economy.phase).toBe(
        "own-turn"
      );
    }
  );

  it.each([
    ["local", CHARACTER],
    ["shared", SHARED],
  ] as const)(
    "requires the authoritative %s turn boundary before dismissing the current participant",
    (location, encounterMaterial) => {
      const before = entityEncounterWorld("ally", location);
      const dismiss = {
        availability: "dismissed",
        causeId: INSTALLED_CAUSE.causeId,
        kind: "entity-availability",
        operationId: `dismiss-${location}-current`,
        target: { entityId: "ally", material: CHARACTER, ordinal: 1 },
      } as const satisfies MechanicsOperation;
      const suspended = simulateMechanicsTransaction(before, transaction([dismiss]));
      expect(suspended).toMatchObject({
        boundary: {
          excludeCurrent: dismiss.target,
          kind: "complete-turn",
          material: encounterMaterial,
        },
        operationId: dismiss.operationId,
        status: "needs-boundary",
      });
      const character = before.documents.find(
        (document) => document.kind === "character"
      );
      expect(character?.state.entities.ally?.availability).toBe("present");
      if (suspended.status !== "needs-boundary") throw new Error("boundary fixture");
      const afterBoundary = completeBoundary(before, suspended.boundary);
      const boundaryCharacter = afterBoundary.documents.find(
        (document) => document.kind === "character"
      );
      const boundaryEncounter = afterBoundary.documents.find(
        (document) => document.kind === (location === "local" ? "character" : "shared")
      )?.state.encounter;
      expect(boundaryCharacter?.state.entities.ally?.availability).toBe("present");
      expect(boundaryEncounter).toMatchObject({ currentCombatantId: "hero" });
      expect(boundaryEncounter?.participants).toHaveProperty("ally");

      const retried = simulated(
        simulateMechanicsTransaction(afterBoundary, transaction([dismiss]))
      );
      const retriedCharacter = retried.state.world.documents.find(
        (document) => document.kind === "character"
      );
      const retriedEncounter = retried.state.world.documents.find(
        (document) => document.kind === (location === "local" ? "character" : "shared")
      )?.state.encounter;
      expect(retriedCharacter?.state.entities.ally?.availability).toBe("dismissed");
      expect(retriedEncounter).toMatchObject({ currentCombatantId: "hero" });
      expect(retriedEncounter?.participants).not.toHaveProperty("ally");
      expect(retriedEncounter?.participants.hero?.economy.phase).toBe("own-turn");
    }
  );

  it.each(["local", "shared"] as const)(
    "converges when dismissing the sole current participant from a %s encounter",
    (location) => {
      const before = entityEncounterWorld("ally", location, false);
      const dismiss = {
        availability: "dismissed",
        causeId: INSTALLED_CAUSE.causeId,
        kind: "entity-availability",
        operationId: `dismiss-${location}-sole-current`,
        target: { entityId: "ally", material: CHARACTER, ordinal: 1 },
      } as const satisfies MechanicsOperation;
      const suspended = simulateMechanicsTransaction(before, transaction([dismiss]));
      if (suspended.status !== "needs-boundary") throw new Error("boundary fixture");

      const afterBoundary = completeBoundary(before, suspended.boundary);
      const boundaryCharacter = afterBoundary.documents.find(
        (document) => document.kind === "character"
      );
      const boundaryEncounter = afterBoundary.documents.find(
        (document) => document.kind === (location === "local" ? "character" : "shared")
      )?.state.encounter;
      expect(boundaryCharacter?.state.entities.ally?.availability).toBe("present");
      expect(boundaryEncounter).toMatchObject({
        currentCombatantId: null,
        order: [],
        phase: "initiative",
      });
      expect(boundaryEncounter?.participants).toHaveProperty("ally");

      const retried = simulated(
        simulateMechanicsTransaction(afterBoundary, transaction([dismiss]))
      );
      const retriedCharacter = retried.state.world.documents.find(
        (document) => document.kind === "character"
      );
      const retriedEncounter = retried.state.world.documents.find(
        (document) => document.kind === (location === "local" ? "character" : "shared")
      )?.state.encounter;
      expect(retriedCharacter?.state.entities.ally?.availability).toBe("dismissed");
      expect(retriedEncounter).toMatchObject({
        currentCombatantId: null,
        order: [],
        participants: {},
        phase: "initiative",
      });
      if (location === "shared") {
        expect(retriedCharacter?.state.clockBinding).toEqual({
          encounter: null,
          timeline: { epoch: 0, material: CHARACTER },
        });
      }
    }
  );

  it("releases a shared encounter lease when dismissal removes its last participant", () => {
    const before = entityEncounterWorld(null, "shared", false);
    const dismiss = {
      availability: "dismissed",
      causeId: INSTALLED_CAUSE.causeId,
      kind: "entity-availability",
      operationId: "dismiss-last-shared-participant",
      target: { entityId: "ally", material: CHARACTER, ordinal: 1 },
    } as const satisfies MechanicsOperation;
    const result = simulated(
      simulateMechanicsTransaction(before, transaction([dismiss]))
    );
    const character = result.state.world.documents.find(
      (document) => document.kind === "character"
    );
    const shared = result.state.world.documents.find(
      (document) => document.kind === "shared"
    );
    expect(character?.state.clockBinding).toEqual({
      encounter: null,
      timeline: { epoch: 0, material: CHARACTER },
    });
    expect(shared?.state.encounter).toMatchObject({
      currentCombatantId: null,
      order: [],
      participants: {},
      phase: "initiative",
    });
  });

  it("orders controller graph rewrites because breaking then linking is causal", () => {
    const firstRef = {
      entityId: "first",
      material: CHARACTER,
      ordinal: 1,
    } as const;
    const secondRef = {
      entityId: "second",
      material: CHARACTER,
      ordinal: 2,
    } as const;
    const first = { ...creature(alive(8)), controller: secondRef };
    const second = creature(alive(8), true, 2);
    const before = parsedWorld(alive(10), { first, second });
    const breakLink = {
      causeId: INSTALLED_CAUSE.causeId,
      controller: null,
      kind: "entity-controller",
      operationId: "break-first-controller",
      target: firstRef,
    } as const satisfies MechanicsOperation;
    const reverseLink = {
      causeId: INSTALLED_CAUSE.causeId,
      controller: firstRef,
      kind: "entity-controller",
      operationId: "link-second-to-first",
      target: secondRef,
    } as const satisfies MechanicsOperation;
    const ordered = simulated(
      simulateMechanicsTransaction(before, transaction([breakLink, reverseLink]))
    );
    expect(state(ordered.state.world).entities).toMatchObject({
      first: { controller: null },
      second: { controller: firstRef },
    });
    expect(
      simulateMechanicsTransaction(before, transaction([reverseLink, breakLink]))
    ).toEqual({
      operationId: reverseLink.operationId,
      reason: "controller-cycle",
      status: "rejected",
    });
  });

  it("accepts only the exact envelope and unique operation identities", () => {
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });
    expect(conformMechanicsOperation(operation)).toEqual(operation);
    const missingAttacker: Record<string, unknown> = { ...operation };
    delete missingAttacker.attacker;
    expect(conformMechanicsOperation(missingAttacker)).toBeNull();
    expect(
      conformMechanicsOperation({ ...operation, actionId: "duplicated" })
    ).toBeNull();
    expect(conformMechanicsTransaction(transaction([operation]))).not.toBeNull();
    expect(conformMechanicsTransaction(transaction([operation, operation]))).toBeNull();
    expect(
      conformMechanicsTransaction({ ...transaction([operation]), extra: true })
    ).toBeNull();
  });

  it("rejects hostile custom operation payloads without invoking accessors", () => {
    const rootCause = programRootCause(AUTHORITY, "root");
    const entity = entityCreateOperation(rootCause);
    let entityGetterCalls = 0;
    const hostileEntity = structuredClone(entity) as unknown as Record<string, unknown>;
    const hostileEntityValue = hostileEntity.value as Record<string, unknown>;
    Object.defineProperty(hostileEntityValue, "label", {
      enumerable: true,
      get() {
        entityGetterCalls += 1;
        return "hostile";
      },
    });
    expect(conformMechanicsOperation(hostileEntity)).toBeNull();
    expect(entityGetterCalls).toBe(0);

    const inventory = inventoryCreateOperation(rootCause);
    let inventoryGetterCalls = 0;
    const hostileInventory = structuredClone(inventory) as unknown as Record<
      string,
      unknown
    >;
    const hostileInstance = hostileInventory.instance as Record<string, unknown>;
    Object.defineProperty(hostileInstance, "notes", {
      enumerable: true,
      get() {
        inventoryGetterCalls += 1;
        return "hostile";
      },
    });
    expect(conformMechanicsOperation(hostileInventory)).toBeNull();
    expect(inventoryGetterCalls).toBe(0);
  });

  it("conforms one exact turn-economy payload through the canonical boundaries", () => {
    const operation = turnEconomyOperation({
      action: { kind: "magic" },
      claimId: "cast",
      kind: "claim-action",
    });
    expect(conformMechanicsOperation(operation)).toEqual(operation);
    expect(conformMechanicsOperation({ ...operation, amount: 1 })).toBeNull();
    expect(
      conformMechanicsOperation({
        ...operation,
        command: { ...operation.command, amount: 1 },
      })
    ).toBeNull();
    expect(
      conformMechanicsOperation({
        ...operation,
        projection: { ...operation.projection, incapacitated: "false" },
      })
    ).toBeNull();
  });

  it("applies only the canonical turn reducer and guards its complete projection", () => {
    const before = encounterWorld();
    const projection = turnProjection();
    const operation = turnEconomyOperation(
      { action: { kind: "magic" }, claimId: "cast", kind: "claim-action" },
      projection
    );
    const beforeEconomy = state(before).encounter?.participants.hero?.economy;
    if (!beforeEconomy) throw new Error("encounter fixture");
    const reduced = reduceTurnEconomy(beforeEconomy, projection, operation.command);
    if (reduced.status !== "planned") throw new Error("turn transition fixture");

    const result = simulated(
      simulateMechanicsTransaction(before, transaction([operation]))
    );
    expect(state(result.state.world).encounter?.participants.hero?.economy).toEqual(
      reduced.after
    );
    expect(result.executions).toEqual([
      {
        facts: { after: reduced.after, before: beforeEconomy },
        kind: "turn-economy-transition",
        operation,
        operationId: operation.operationId,
        status: "applied",
      },
    ]);
    expect(result.actionFacts).toEqual(
      expectedInstalledFacts([turnEconomyProjectionFactGuard(SELF, projection)])
    );
  });

  it("rejects forged turn boundaries and propagates rejection and missing generations", () => {
    const before = encounterWorld();
    const validOperation = turnEconomyOperation({
      action: { kind: "magic" },
      claimId: "cast",
      kind: "claim-action",
    });
    const forgedBoundary = {
      ...validOperation,
      command: { kind: "start-turn", turnId: "turn:1:1:1" },
    } as const;
    expect(conformMechanicsOperation(forgedBoundary)).toBeNull();
    expect(
      simulateMechanicsTransaction(before, {
        ...transaction([validOperation]),
        operations: [forgedBoundary],
      })
    ).toEqual({
      operationId: null,
      reason: "invalid-transaction",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          turnEconomyOperation({
            claimId: "reaction",
            kind: "claim-reaction",
            reaction: { kind: "program", requirementId: "missing" },
          }),
        ])
      )
    ).toEqual({
      operationId: "turn-economy",
      reason: "reaction-requirement-unavailable",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          {
            ...turnEconomyOperation({
              action: { kind: "magic" },
              claimId: "cast",
              kind: "claim-action",
            }),
            combatant: { entityId: "missing", material: CHARACTER, ordinal: 1 },
          },
        ])
      )
    ).toEqual({
      operationId: "turn-economy",
      reason: "missing-target",
      status: "rejected",
    });
  });

  it("rejects forged, unordered, duplicate, unused, missing, and excessive causes", () => {
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });
    const first = installedCause(authorityVariant(1));
    const second = installedCause(authorityVariant(2));
    const [lower, higher] = orderedCauses(first, second);
    const operationFor = (
      cause: MechanicsOperationCause,
      operationId: string
    ): MechanicsOperation => ({ ...operation, causeId: cause.causeId, operationId });

    expect(
      conformMechanicsTransaction({
        ...transaction([operation]),
        causes: [{ ...INSTALLED_CAUSE, causeId: canonicalFingerprint({ forged: true }) }],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operationFor(lower, "lower"), operationFor(higher, "higher")]),
        causes: [higher, lower],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operation]),
        causes: [INSTALLED_CAUSE, INSTALLED_CAUSE],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operationFor(lower, "lower")]),
        causes: [lower, higher],
      })
    ).toBeNull();
    expect(
      conformMechanicsTransaction({
        ...transaction([operation]),
        causes: [first],
      })
    ).toBeNull();

    const many = Array.from({ length: 513 }, (_, seed) =>
      installedCause(authorityVariant(seed + 1))
    ).sort((left, right) => compareCodeUnits(left.causeId, right.causeId));
    expect(
      conformMechanicsTransaction({
        ...transaction(
          many.map((cause, index) => operationFor(cause, `operation-${index}`)) as [
            MechanicsOperation,
            ...MechanicsOperation[],
          ]
        ),
        causes: many,
      })
    ).toBeNull();
  });

  it("binds installed invocation to its exact receipt installation", () => {
    const mismatchedInvocation = {
      installation: { ...INSTALLATION, generation: 2 },
      kind: "installed-capability",
    } as const;
    const mismatched = operationCause(AUTHORITY, mismatchedInvocation);
    const operation = {
      ...creatureDamage("damage", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: mismatched.causeId,
    };
    const value = {
      ...transaction([operation]),
      causes: [mismatched],
    };
    expect(conformMechanicsTransaction(value)).toEqual(value);
    expect(simulateMechanicsTransaction(parsedWorld(alive(10)), value)).toEqual({
      operationId: "damage",
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("authenticates installed causes from the independent authority snapshot", () => {
    const before = parsedWorld(alive(10));
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });
    const value = transaction([operation]);

    expect(simulateKernelTransaction(value, emptyAuthorityContext(before))).toEqual({
      operationId: "damage",
      reason: "invalid-cause",
      status: "rejected",
    });

    const exactContext = {
      authoritySnapshot: { definitions: [authorityDefinition(AUTHORITY)] },
      state: causalState(before),
    } as const;
    const exact = simulated(simulateKernelTransaction(value, exactContext));
    expect(exact.actionFacts).toEqual(
      expectedInstalledFacts([
        {
          address: ["hit-point-maximum"],
          expected: { present: true, value: 10 },
          lifecycle: "commit-redo",
          owner: SELF,
        },
      ])
    );

    const foe = { entityId: "foe", material: CHARACTER, ordinal: 1 } as const;
    const foeWorld = parsedWorld(alive(10), { foe: creature(alive(10)) });
    expect(
      simulateKernelTransaction(transaction([operation], { actor: foe }), {
        authoritySnapshot: exactContext.authoritySnapshot,
        state: causalState(foeWorld),
      })
    ).toEqual({
      operationId: "damage",
      reason: "invalid-cause",
      status: "rejected",
    });

    const fabricatedAuthority = authorityVariant(70_001);
    const fabricatedCause = installedCause(fabricatedAuthority);
    const fabricatedOperation = {
      ...operation,
      causeId: fabricatedCause.causeId,
    };
    expect(
      simulateKernelTransaction(
        transaction([fabricatedOperation], { causes: [fabricatedCause] }),
        exactContext
      )
    ).toEqual({
      operationId: "damage",
      reason: "invalid-cause",
      status: "rejected",
    });

    expect(
      conformMechanicsTransaction({
        ...value,
        causes: [{ ...INSTALLED_CAUSE, authority: AUTHORITY }],
      })
    ).toBeNull();
  });

  it("rejects caller facts that conflict with injected authority guards", () => {
    const definition = authorityDefinition(AUTHORITY);
    const guard = definition.definitionGuards[0];
    if (!guard) throw new Error("authority definition guard fixture");
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });

    expect(
      simulateKernelTransaction(
        transaction([operation], {
          factGuards: [
            {
              ...guard,
              expected: { present: true, value: "forged-definition" },
            },
          ],
        }),
        {
          authoritySnapshot: { definitions: [definition] },
          state: causalState(parsedWorld(alive(10))),
        }
      )
    ).toEqual({ operationId: null, reason: "fact-conflict", status: "rejected" });
  });

  it("resolves program-root authority only at the exact occurrence generation", () => {
    const original = state(worldWithZeroedRoots([["root", AUTHORITY]]));
    const root = original.occurrences.root;
    if (!root || root.kind !== "program") throw new Error("program root fixture");
    const recreated = parsedCharacterState({
      ...structuredClone(original),
      nextOccurrenceOrdinal: 3,
      occurrences: {
        ...structuredClone(original.occurrences),
        root: { ...root, ordinal: 2 },
      },
    });
    const exactCause = programRootCause(AUTHORITY, "root", 2);
    const exactOperation = {
      ...creatureDamage("exact-root", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: exactCause.causeId,
    };
    const exactTransaction = transaction([exactOperation], { causes: [exactCause] });
    expect(
      simulateKernelTransaction(
        exactTransaction,
        pendingProgramContext(
          recreated,
          exactTransaction,
          AUTHORITY,
          occurrenceGeneration("root", 2)
        )
      )
    ).toMatchObject({ status: "simulated" });

    const foe = { entityId: "foe", material: CHARACTER, ordinal: 1 } as const;
    const recreatedWithFoe = parsedCharacterState({
      ...structuredClone(state(recreated)),
      entities: { foe: creature(alive(10)) },
      nextEntityOrdinal: 2,
    });
    const foeTransaction = transaction([exactOperation], {
      actor: foe,
      causes: [exactCause],
    });
    expect(
      simulateKernelTransaction(
        foeTransaction,
        pendingProgramContext(
          recreatedWithFoe,
          foeTransaction,
          AUTHORITY,
          occurrenceGeneration("root", 2)
        )
      )
    ).toEqual({
      operationId: "exact-root",
      reason: "invalid-cause",
      status: "rejected",
    });

    const staleCause = programRootCause(AUTHORITY, "root", 1);
    const staleTransaction = transaction(
      [{ ...exactOperation, causeId: staleCause.causeId }],
      { causes: [staleCause] }
    );
    expect(
      simulateKernelTransaction(
        staleTransaction,
        pendingProgramContext(
          recreated,
          staleTransaction,
          AUTHORITY,
          occurrenceGeneration("root", 2)
        )
      )
    ).toEqual({
      operationId: "exact-root",
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("keeps only an exact pending program root authoritative after its actor leaves", () => {
    const actor = {
      entityId: "source",
      material: CHARACTER,
      ordinal: 1,
    } as const;
    const otherActor = {
      entityId: "other",
      material: CHARACTER,
      ordinal: 2,
    } as const;
    const authority = {
      ...inventoryAuthority("focus", 1),
      anchors: {
        activator: actor,
        caster: actor,
        owner: actor,
        source: actor,
        target: SELF,
      },
      installation: { ...INSTALLATION, owner: actor },
    } as const satisfies MechanicsProgramAuthorityReceipt;
    const rootCause = programRootCause(authority, "source-root");
    const installed = installedCause(authority);
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.entities.source = creature(alive(10), false);
    material.entities.other = creature(alive(10), true, 2);
    material.nextEntityOrdinal = 3;
    material.inventory.focus = inventoryInstance(1);
    material.nextInventoryOrdinal = 2;
    const sourceRoot = addOccurrence(
      {
        nextOccurrenceOrdinal: material.nextOccurrenceOrdinal,
        occurrences: material.occurrences,
      },
      "source-root",
      {
        authority,
        endRules: [],
        kind: "program",
        phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
        registers: {},
      }
    );
    const roots = addOccurrence(sourceRoot, "target-root", {
      authority: AUTHORITY,
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    });
    const before = parsedCharacterState({ ...material, ...roots });
    const endTarget = {
      causeId: rootCause.causeId,
      kind: "occurrence-end",
      occurrence: occurrenceGeneration("target-root", 2),
      operationId: "end-from-pending-source",
    } as const satisfies MechanicsOperation;
    const endTargetTransaction = transaction([endTarget], {
      actor,
      causes: [rootCause],
    });
    const ended = simulated(
      simulateMechanicsTransaction(
        before,
        endTargetTransaction,
        pendingProgramContext(
          before,
          endTargetTransaction,
          authority,
          occurrenceGeneration("source-root", 1)
        )
      )
    );
    expect(state(ended.state.world).occurrences["source-root"]?.ending).toBeNull();
    expect(state(ended.state.world).occurrences["target-root"]?.ending).toEqual({
      causes: [{ kind: "requested" }],
    });
    expect(ended.state.context.request.inventorySourceLeases).toContainEqual(
      inventoryRef("focus", 1)
    );

    const installedOperation = { ...endTarget, causeId: installed.causeId };
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([installedOperation], { actor, causes: [installed] })
      )
    ).toEqual({ operationId: null, reason: "missing-actor", status: "rejected" });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([endTarget], { actor: otherActor, causes: [rootCause] }),
        pendingProgramContext(
          before,
          transaction([endTarget], { actor: otherActor, causes: [rootCause] }),
          authority,
          occurrenceGeneration("source-root", 1)
        )
      )
    ).toEqual({
      operationId: endTarget.operationId,
      reason: "invalid-cause",
      status: "rejected",
    });

    const staleCause = programRootCause(authority, "source-root", 99);
    const staleTransaction = transaction(
      [{ ...endTarget, causeId: staleCause.causeId }],
      { actor, causes: [staleCause] }
    );
    expect(
      simulateMechanicsTransaction(
        before,
        staleTransaction,
        pendingProgramContext(
          before,
          staleTransaction,
          authority,
          occurrenceGeneration("source-root", 1)
        )
      )
    ).toEqual({
      operationId: endTarget.operationId,
      reason: "invalid-cause",
      status: "rejected",
    });

    const withoutSource = structuredClone(state(before));
    delete withoutSource.occurrences["source-root"];
    expect(
      simulateMechanicsTransaction(
        parsedCharacterState(withoutSource),
        transaction([endTarget], { actor, causes: [rootCause] })
      )
    ).toEqual({
      operationId: endTarget.operationId,
      reason: "invalid-cause",
      status: "rejected",
    });

    const present = structuredClone(state(before));
    const presentActor = present.entities.source;
    if (!presentActor) throw new Error("actor fixture");
    presentActor.availability = "present";
    expect(
      simulateMechanicsTransaction(
        parsedCharacterState(present),
        transaction([installedOperation], { actor, causes: [installed] })
      )
    ).toMatchObject({ status: "simulated" });
  });

  it("derives durable root authority from an installed cause before creating effects", () => {
    const authority = authorityVariant(7);
    const installed = installedCause(authority);
    const rootCause = programRootCause(authority, "root");
    const root = programCreate("create-root", "root", installed);
    expect(root).not.toHaveProperty("authority");
    expect(root).not.toHaveProperty("occurrence");
    expect(root).not.toHaveProperty("conditionImmunityOverride");
    expect(
      conformMechanicsOperation({
        ...root,
        authority,
      })
    ).toBeNull();
    expect(
      conformMechanicsOperation({
        ...root,
        root: { ...root.root, authority },
      })
    ).toBeNull();
    const effect = standingCreate("create-effect", "effect", "root", rootCause);
    const phase = programPhaseTransition(
      "commit-invocation",
      rootCause,
      occurrenceGeneration("root", 1)
    );
    expect(conformMechanicsOperation(effect)).toEqual(effect);
    const missingParent: Record<string, unknown> = { ...effect };
    delete missingParent.parent;
    expect(conformMechanicsOperation(missingParent)).toBeNull();

    const allocated = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([root], { causes: [installed] })
      )
    );
    expect(
      simulateMechanicsTransaction(
        allocated.state.world,
        transaction([root], { causes: [installed] })
      )
    ).toMatchObject({
      executions: [{ reason: "program-root-already-created", status: "no-change" }],
      status: "no-change",
    });

    expect(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([root, effect, phase], {
          causes: orderedCauses(installed, rootCause),
        })
      )
    ).toEqual({
      operationId: null,
      reason: "invalid-transaction",
      status: "rejected",
    });

    const effectTransaction = transaction([effect], { causes: [rootCause] });
    const pending = pushProgramFrame(allocated.state, authority, root.root);
    const effectState = pendingAtStep(pending.state, pending.frame, STEP_IDS.standing);
    const effected = simulated(
      simulateMechanicsTransaction(allocated.state.world, effectTransaction, {
        authoritySnapshot: authoritySnapshotFor(effectTransaction),
        state: effectState,
      })
    );
    expect(state(effected.state.world).occurrences.root).toMatchObject({ authority });
    expect(state(effected.state.world).occurrences.effect).toMatchObject({
      parentId: "root",
    });
    expect(allocated.executions[0]).toMatchObject({
      facts: { root: occurrenceGeneration("root", 1) },
      kind: "program-root-create",
    });

    const phaseState = pendingAtPhaseTransition(effected.state, pending.frame);
    const phaseTransaction = transaction([phase], { causes: [rootCause] });
    const committed = simulated(
      simulateMechanicsTransaction(effected.state.world, phaseTransaction, {
        authoritySnapshot: authoritySnapshotFor(phaseTransaction),
        state: phaseState,
      })
    );
    expect(topMechanicsPendingFrame(committed.state)?.cursor).toEqual({
      stage: "phase-complete",
    });
    const popped = popMechanicsPendingFrame(committed.state, pending.frame);
    expect(popped.ok).toBe(true);
    expect(state(committed.state.world).occurrences.root).toMatchObject({
      phaseState: { invoke: { execution: 1, lastTriggerEventId: null } },
      registers: {},
    });

    expect(
      simulateMechanicsTransaction(committed.state.world, phaseTransaction, {
        authoritySnapshot: authoritySnapshotFor(phaseTransaction),
        state: committed.state,
      })
    ).toMatchObject({
      executions: [{ reason: "program-phase-already-committed", status: "no-change" }],
      status: "no-change",
    });

    const staleEffect = {
      ...effect,
      created: occurrenceGeneration("stale-effect", 3),
      operationId: "stale-effect",
      occurrence: {
        ...effect.occurrence,
        fact: { key: "stale-effect", kind: "active-key" },
      },
    } as const satisfies MechanicsOperation;
    const staleWorld = worldWithZeroedRoots([["root", authority]]);
    const staleTransaction = transaction([staleEffect], { causes: [rootCause] });
    expect(
      simulateMechanicsTransaction(
        staleWorld,
        staleTransaction,
        pendingProgramContext(
          staleWorld,
          staleTransaction,
          authority,
          occurrenceGeneration("root", 1),
          { stepId: STEP_IDS.standing }
        )
      )
    ).toEqual({
      operationId: "stale-effect",
      reason: "stale-allocation-state",
      status: "rejected",
    });
  });

  it("creates a root, applies register steps in authored order, and exposes each exact transition", () => {
    const authority = authorityWithRegister("tally", 0);
    const installed = installedCause(authority);
    const rootCause = programRootCause(authority, "root");
    const root = occurrenceGeneration("root", 1);
    const allocation = transaction([programCreate("create-root", "root", installed)], {
      causes: [installed],
    });
    const allocated = simulated(
      simulateMechanicsTransaction(parsedWorld(alive(10)), allocation)
    );
    const body = transaction(
      [
        programRegister("tally-one", rootCause, root, "tally", 0, 1),
        programRegister("tally-three", rootCause, root, "tally", 1, 3),
      ],
      { causes: [rootCause] }
    );
    const result = simulated(
      simulateMechanicsTransaction(
        allocated.state.world,
        body,
        pendingProgramContext(allocated.state.world, body, authority, root, {
          basis: allocated.state,
          stepId: `set-tally`,
        })
      )
    );

    expect(state(result.state.world).occurrences.root).toMatchObject({
      registers: { tally: 3 },
    });
    expect(result.executions).toMatchObject([
      {
        facts: {
          after: 1,
          before: 0,
          registerId: "tally",
          root,
        },
        kind: "program-register-transition",
        status: "applied",
      },
      {
        facts: {
          after: 3,
          before: 1,
          registerId: "tally",
          root,
        },
        kind: "program-register-transition",
        status: "applied",
      },
    ]);
  });

  it("applies register steps before the phase commit and rejects stale or reordered state", () => {
    const authority = authorityWithRegister("tally", 0);
    const rootCause = programRootCause(authority, "root");
    const base = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    const occurrences = addOccurrence(
      {
        nextOccurrenceOrdinal: base.nextOccurrenceOrdinal,
        occurrences: base.occurrences,
      },
      "root",
      {
        authority,
        endRules: [],
        kind: "program",
        phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
        registers: { tally: 0 },
      }
    );
    const world = parsedCharacterState({ ...base, ...occurrences });
    const root = occurrenceGeneration("root", 1);
    const register = programRegister("tally-one", rootCause, root, "tally", 0, 1);
    const advance = programPhaseTransition("advance-root", rootCause, root);
    const registerTransaction = transaction([register], { causes: [rootCause] });
    const pending = pushProgramFrame(causalState(world), authority, root);
    const registerState = pendingAtStep(pending.state, pending.frame, `set-tally`);

    const result = simulated(
      simulateMechanicsTransaction(world, registerTransaction, {
        authoritySnapshot: authoritySnapshotFor(registerTransaction),
        state: registerState,
      })
    );
    expect(state(result.state.world).occurrences.root).toMatchObject({
      phaseState: {
        invoke: { execution: 0, lastTriggerEventId: null },
      },
      registers: { tally: 1 },
    });
    expect(
      conformMechanicsTransaction(
        transaction([advance, register], { causes: [rootCause] })
      )
    ).toBeNull();
    const phaseState = pendingAtPhaseTransition(result.state, pending.frame);
    const phaseTransaction = transaction([advance], { causes: [rootCause] });
    const committed = simulated(
      simulateMechanicsTransaction(result.state.world, phaseTransaction, {
        authoritySnapshot: authoritySnapshotFor(phaseTransaction),
        state: phaseState,
      })
    );
    expect(state(committed.state.world).occurrences.root).toMatchObject({
      phaseState: {
        invoke: { execution: 1, lastTriggerEventId: null },
      },
      registers: { tally: 1 },
    });
    const staleTransaction = transaction(
      [programRegister("stale", rootCause, root, "tally", 1, 2)],
      { causes: [rootCause] }
    );
    expect(
      simulateMechanicsTransaction(world, staleTransaction, {
        authoritySnapshot: authoritySnapshotFor(staleTransaction),
        state: registerState,
      })
    ).toEqual({
      operationId: "stale",
      reason: "stale-program-state",
      status: "rejected",
    });
  });

  it("accepts consecutive one-ahead origins only at the exact top cursor slots", () => {
    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const root = occurrenceGeneration("root", 1);
    const cause = programRootCause(AUTHORITY, "root");
    const first = standingCreate("standing-one", "standing-one", "root", cause);
    const second = {
      ...standingCreate("standing-two", "standing-two", "root", cause),
      created: occurrenceGeneration("standing-two", 3),
      occurrence: {
        ...standingCreate("standing-two", "standing-two", "root", cause).occurrence,
        fact: { key: "standing-two", kind: "active-key" },
        origin: programStepOrigin(STEP_IDS.standing, { slot: 2 }),
      },
    } as const satisfies MechanicsOperation;
    const body = transaction([first, second], { causes: [cause] });
    const result = simulated(
      simulateMechanicsTransaction(
        before,
        body,
        pendingProgramContext(before, body, AUTHORITY, root, {
          stepId: STEP_IDS.standing,
        })
      )
    );

    expect(state(result.state.world).occurrences).toHaveProperty("standing-one");
    expect(state(result.state.world).occurrences).toHaveProperty("standing-two");
    expect(topMechanicsPendingFrame(result.state)?.cursor).toEqual({
      nextSlot: 1,
      stage: "step",
      stepIndex: 1,
    });
  });

  it.each([
    ["gap", 1, 3, "standing-two"],
    ["duplicate", 1, 1, "standing-two"],
    ["reverse", 2, 1, "standing-one"],
  ] as const)(
    "rejects a %s in one-ahead authored slots",
    (_case, firstSlot, secondSlot, rejectedOperationId) => {
      const before = worldWithZeroedRoots([["root", AUTHORITY]]);
      const cause = programRootCause(AUTHORITY, "root");
      const create = (
        operationId: string,
        occurrenceId: string,
        ordinal: number,
        slot: number
      ) => {
        const base = standingCreate(operationId, occurrenceId, "root", cause);
        return {
          ...base,
          created: occurrenceGeneration(occurrenceId, ordinal),
          occurrence: {
            ...base.occurrence,
            fact: { key: occurrenceId, kind: "active-key" },
            origin: programStepOrigin(STEP_IDS.standing, { slot }),
          },
        } as const satisfies MechanicsOperation;
      };
      const body = transaction(
        [
          create("standing-one", "standing-one", 2, firstSlot),
          create("standing-two", "standing-two", 3, secondSlot),
        ],
        { causes: [cause] }
      );

      expect(
        simulateMechanicsTransaction(
          before,
          body,
          pendingProgramContext(
            before,
            body,
            AUTHORITY,
            occurrenceGeneration("root", 1),
            { stepId: STEP_IDS.standing }
          )
        )
      ).toEqual({
        operationId: rejectedOperationId,
        reason: "invalid-cause",
        status: "rejected",
      });
    }
  );

  it("rejects a non-top program cause while a nested frame owns execution", () => {
    const before = worldWithZeroedRoots([
      ["parent-root", AUTHORITY],
      ["nested-root", AUTHORITY],
    ]);
    const parentRoot = occurrenceGeneration("parent-root", 1);
    const nestedRoot = occurrenceGeneration("nested-root", 2);
    const parentCause = programRootCause(AUTHORITY, "parent-root", 1);
    const operation = standingCreate(
      "parent-effect",
      "parent-effect",
      "parent-root",
      parentCause
    );
    const body = transaction([operation], { causes: [parentCause] });
    const parent = pushProgramFrame(causalState(before), AUTHORITY, parentRoot);
    const nested = pushProgramFrame(parent.state, AUTHORITY, nestedRoot);

    expect(
      simulateMechanicsTransaction(before, body, {
        authoritySnapshot: authoritySnapshotFor(body),
        state: nested.state,
      })
    ).toEqual({
      operationId: operation.operationId,
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("does not let an installed cause mint program-step provenance", () => {
    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const operation = standingCreate(
      "installed-effect",
      "installed-effect",
      "root",
      INSTALLED_CAUSE
    );
    const body = transaction([operation]);

    expect(
      simulateMechanicsTransaction(
        before,
        body,
        pendingProgramContext(before, body, AUTHORITY, occurrenceGeneration("root", 1), {
          stepId: STEP_IDS.standing,
        })
      )
    ).toEqual({
      operationId: operation.operationId,
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("commits the exact phase CAS atomically and only then exposes phase-complete", () => {
    const initial = worldWithZeroedRoots([["root", AUTHORITY]]);
    const root = occurrenceGeneration("root", 1);
    const cause = programRootCause(AUTHORITY, "root");
    const childOperation = standingCreate("create-child", "phase-child", "root", cause);
    const create = transaction(
      [
        {
          ...childOperation,
          occurrence: {
            ...childOperation.occurrence,
            endRules: [
              {
                execution: 1,
                kind: "program-phase-end",
                occurrenceId: "root",
                phaseId: "invoke",
              },
            ],
            fact: { key: "phase-child", kind: "active-key" },
          },
        },
      ],
      { causes: [cause] }
    );
    const pushed = pushProgramFrame(causalState(initial), AUTHORITY, root);
    const created = simulated(
      simulateKernelTransaction(create, {
        authoritySnapshot: authoritySnapshotFor(create),
        state: pendingAtStep(pushed.state, pushed.frame, STEP_IDS.standing),
      })
    );
    const phaseState = pendingAtPhaseTransition(created.state, pushed.frame);
    const operation = programPhaseTransition("commit-root", cause, root);
    const commit = transaction([operation], { causes: [cause] });
    const context = {
      authoritySnapshot: authoritySnapshotFor(commit),
      state: phaseState,
    } as const;
    const projected = projectKernelTransaction(commit, context);
    expect(projected.status).toBe("projected");
    if (projected.status !== "projected") return;
    expect(state(projected.projection.world).occurrences.root).toMatchObject({
      phaseState: { invoke: { execution: 1, lastTriggerEventId: null } },
    });
    expect(
      state(projected.projection.world).occurrences["phase-child"]?.ending
    ).toBeNull();
    expect(state(phaseState.world).occurrences.root).toMatchObject({
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
    });
    expect(topMechanicsPendingFrame(phaseState)?.cursor).toEqual({
      stage: "phase-transition",
    });
    expect(phaseState.context.endWave).toBeNull();

    const result = simulated(
      simulateMechanicsTransaction(phaseState.world, commit, context)
    );

    expect(state(phaseState.world).occurrences.root).toMatchObject({
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
    });
    expect(state(result.state.world).occurrences.root).toMatchObject({
      phaseState: { invoke: { execution: 1, lastTriggerEventId: null } },
    });
    expect(topMechanicsPendingFrame(result.state)?.cursor).toEqual({
      stage: "phase-complete",
    });
    expect(result.state.context.endWave?.wave.candidates).toEqual([
      {
        causes: [
          {
            completion: { execution: 1, phaseId: "invoke", root },
            kind: "program-phase-completed",
          },
        ],
        occurrence: occurrenceGeneration("phase-child", 2),
      },
    ]);
  });

  it("rejects the legacy root-create plus body batch", () => {
    const installed = installedCause(AUTHORITY);
    const rootCause = programRootCause(AUTHORITY, "root");
    const create = programCreate("create-root", "root", installed);
    const body = standingCreate("create-effect", "effect", "root", rootCause);

    expect(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([create, body], {
          causes: orderedCauses(installed, rootCause),
        })
      )
    ).toEqual({
      operationId: null,
      reason: "invalid-transaction",
      status: "rejected",
    });
  });

  it.each([
    ["past", 1],
    ["future", 3],
  ] as const)(
    "rejects %s qualitative minima on newly created effects, entities, and inventory",
    (_position, minimumBoundaryOrdinal) => {
      const rootCause = programRootCause(AUTHORITY, "root");
      const material = structuredClone(
        state(worldWithZeroedRoots([["root", AUTHORITY]]))
      );
      material.timeline.nextBoundaryOrdinal = 2;
      const before = parsedCharacterState(material);
      const endRules = [
        {
          clock: { material: CHARACTER, epoch: 0 },
          kind: "day-phase",
          minimumBoundaryOrdinal,
          phase: "dawn",
        },
      ] as const;
      const effect = standingCreate("create-effect", "effect", "root", rootCause);
      const creations = [
        { ...effect, occurrence: { ...effect.occurrence, endRules } },
        { ...entityCreateOperation(rootCause), endRules },
        { ...inventoryCreateOperation(rootCause), endRules },
      ] as const satisfies readonly MechanicsOperation[];

      for (const operation of creations) {
        const operationTransaction = transaction([operation], {
          causes: [rootCause],
        });
        const stepId =
          operation.kind === "entity-create"
            ? STEP_IDS.entity
            : operation.kind === "inventory-create"
              ? STEP_IDS.inventory
              : STEP_IDS.standing;
        expect(
          simulateMechanicsTransaction(
            before,
            operationTransaction,
            pendingProgramContext(
              before,
              operationTransaction,
              AUTHORITY,
              occurrenceGeneration("root", 1),
              { stepId }
            )
          )
        ).toEqual({
          operationId: operation.operationId,
          reason: "invalid-transition",
          status: "rejected",
        });
      }
    }
  );

  it("rejects child-before-root, root creation from a root, and unrelated parents", () => {
    const cause = installedCause(AUTHORITY);
    expect(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction(
          [
            standingCreate("child-first", "effect", "root", cause),
            programCreate("root-second", "root", cause),
          ],
          { causes: [cause] }
        )
      )
    ).toEqual({
      operationId: null,
      reason: "invalid-transaction",
      status: "rejected",
    });

    const rooted = worldWithZeroedRoots([["root", AUTHORITY]]);
    const rootCause = programRootCause(AUTHORITY, "root");
    expect(
      simulateMechanicsTransaction(
        rooted,
        transaction([programCreate("forged-root", "second-root", rootCause)], {
          causes: [rootCause],
        })
      )
    ).toEqual({
      operationId: null,
      reason: "invalid-transaction",
      status: "rejected",
    });

    const wrongParentMaterial = {
      ...standingCreate("wrong-material", "effect", "root", cause),
      parent: {
        occurrence: {
          material: { campaignId: "campaign-1", kind: "shared-combat" },
          occurrenceId: "root",
        },
        ordinal: 1,
      },
    } as const;
    expect(
      simulateMechanicsTransaction(
        rooted,
        transaction([wrongParentMaterial], { causes: [cause] })
      )
    ).toEqual({
      operationId: "wrong-material",
      reason: "invalid-cause",
      status: "rejected",
    });

    const unrelated = installedCause(authorityVariant(8));
    expect(
      simulateMechanicsTransaction(
        rooted,
        transaction([standingCreate("unrelated", "effect", "root", unrelated)], {
          causes: [unrelated],
        })
      )
    ).toEqual({
      operationId: "unrelated",
      reason: "invalid-cause",
      status: "rejected",
    });

    expect(
      simulateMechanicsTransaction(
        rooted,
        transaction([standingCreate("stale-parent", "effect", "root", cause, 2)], {
          causes: [cause],
        })
      )
    ).toEqual({
      operationId: "stale-parent",
      reason: "invalid-cause",
      status: "rejected",
    });

    expect(
      conformMechanicsTransaction(
        transaction(
          [
            programCreate("first-root", "first", cause),
            programCreate("second-root", "second", cause),
          ],
          { causes: [cause] }
        )
      )
    ).toBeNull();
  });

  it("requires exact root generations and emits readable end requests", () => {
    const otherAuthority = authorityVariant(9);
    const before = worldWithZeroedRoots([
      ["causing-root", AUTHORITY],
      ["other-root", otherAuthority],
    ]);
    const cause = programRootCause(AUTHORITY, "causing-root");
    const endOther = transaction(
      [
        {
          causeId: cause.causeId,
          kind: "occurrence-end",
          occurrence: occurrenceGeneration("other-root", 2),
          operationId: "dispel-other",
        },
      ],
      { causes: [cause] }
    );
    const ended = simulated(
      simulateMechanicsTransaction(
        before,
        endOther,
        pendingProgramContext(
          before,
          endOther,
          AUTHORITY,
          occurrenceGeneration("causing-root", 1)
        )
      )
    );
    expect(state(ended.state.world).occurrences).toHaveProperty("causing-root");
    expect(state(ended.state.world).occurrences).toHaveProperty("other-root");
    expect(state(ended.state.world).occurrences["causing-root"]?.ending).toBeNull();
    expect(state(ended.state.world).occurrences["other-root"]?.ending).toEqual({
      causes: [{ kind: "requested" }],
    });
    expect(ended.state.context.request.endRequests).toEqual([
      occurrenceGeneration("other-root", 2),
    ]);
    expect(ended.transaction.operations[0].causeId).toBe(cause.causeId);
    expect(ended.executions[0]).toMatchObject({
      facts: { requested: occurrenceGeneration("other-root", 2) },
      status: "applied",
    });
    expect(ended.consequences).toEqual([
      {
        causeId: cause.causeId,
        kind: "occurrence-end",
        occurrence: occurrenceGeneration("other-root", 2),
        operationId: "dispel-other",
      },
    ]);
    expect(ended.stages[0]?.after).toBe(ended.stages[0]?.before);
    expect(ended).not.toHaveProperty("action");

    const mismatched = programRootCause(otherAuthority, "causing-root");
    expect(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            {
              causeId: mismatched.causeId,
              kind: "occurrence-end",
              occurrence: occurrenceGeneration("other-root", 2),
              operationId: "forged-dispatch",
            },
          ],
          { causes: [mismatched] }
        )
      )
    ).toEqual({
      operationId: "forged-dispatch",
      reason: "invalid-cause",
      status: "rejected",
    });

    const staleCause = programRootCause(AUTHORITY, "causing-root", 3);
    expect(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            {
              causeId: staleCause.causeId,
              kind: "occurrence-end",
              occurrence: occurrenceGeneration("other-root", 2),
              operationId: "stale-cause",
            },
          ],
          { causes: [staleCause] }
        )
      )
    ).toEqual({
      operationId: "stale-cause",
      reason: "invalid-cause",
      status: "rejected",
    });

    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          {
            causeId: INSTALLED_CAUSE.causeId,
            kind: "occurrence-end",
            occurrence: occurrenceGeneration("other-root", 1),
            operationId: "stale-end",
          },
        ])
      )
    ).toMatchObject({
      executions: [{ reason: "occurrence-not-active", status: "no-change" }],
      state: { world: before },
      status: "no-change",
    });
  });

  it("plans multi-target damage as one kernel batch and aborts atomically", () => {
    const first = { entityId: "first", material: CHARACTER, ordinal: 1 } as const;
    const second = { entityId: "second", material: CHARACTER, ordinal: 2 } as const;
    const before = parsedWorld(alive(10), {
      first: creature(alive(10)),
      second: creature(alive(10, 2), true, 2),
    });
    const snapshot = JSON.stringify(before);
    const result = simulated(
      simulateMechanicsTransaction(
        before,
        transaction([
          creatureDamage("first-hit", first, 4),
          creatureDamage("second-hit", second, 5),
        ])
      )
    );

    expect(
      result.executions.map(({ operationId, status }) => [operationId, status])
    ).toEqual([
      ["first-hit", "applied"],
      ["second-hit", "applied"],
    ]);
    expect(state(result.state.world).entities.first?.vitals.hitPoints.current).toBe(6);
    expect(state(result.state.world).entities.second?.vitals.hitPoints).toMatchObject({
      current: 7,
      temporary: { current: 0 },
    });
    expect(result.stages).toHaveLength(2);
    expect(result.consequences).toEqual([]);
    expect(result).not.toHaveProperty("action");
    expect(JSON.stringify(before)).toBe(snapshot);

    const missing = { entityId: "missing", material: CHARACTER, ordinal: 99 } as const;
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          creatureDamage("would-apply", first, 4),
          creatureDamage("must-abort", missing, 1),
        ])
      )
    ).toEqual({
      operationId: "must-abort",
      reason: "missing-target",
      status: "rejected",
    });
    expect(JSON.stringify(before)).toBe(snapshot);

    const staleFirst = { ...first, ordinal: 99 } as const;
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([creatureDamage("stale-generation", staleFirst, 1)])
      )
    ).toEqual({
      operationId: "stale-generation",
      reason: "missing-target",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([creatureDamage("stale-actor", second, 1)], {
          actor: staleFirst,
        })
      )
    ).toEqual({
      operationId: null,
      reason: "missing-actor",
      status: "rejected",
    });
  });

  it("simulates ordered operations and retains no-change receipts", () => {
    const immunity: DamageDefenseRule = {
      kind: "immunity",
      selector: SELECTOR,
      sourceId: "immunity",
    };
    const before = parsedWorld(alive(10));
    const result = simulated(
      simulateMechanicsTransaction(
        before,
        transaction([
          creatureDamage("immune", SELF, 20, {
            maximumHitPoints: { kind: "fact", value: 10 },
            rules: [immunity],
          }),
          creatureDamage("landed", SELF, 4, {
            maximumHitPoints: { kind: "fact", value: 10 },
          }),
          {
            input: { amount: 3, maximumHitPoints: 10 },
            kind: "creature-healing",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "heal",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );

    expect(result.executions.map(({ status }) => status)).toEqual([
      "no-change",
      "applied",
      "applied",
    ]);
    expect(state(result.state.world).vitals.hitPoints.current).toBe(9);
    expect(result.stages).toHaveLength(2);
    expect(result.actionFacts).toEqual(
      expectedInstalledFacts([
        {
          address: ["hit-point-maximum"],
          expected: { present: true, value: 10 },
          lifecycle: "commit-redo",
          owner: SELF,
        },
      ])
    );

    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          creatureDamage("immune", SELF, 20, {
            maximumHitPoints: { kind: "fact", value: 10 },
            rules: [immunity],
          }),
        ])
      )
    ).toMatchObject({ state: { world: before }, status: "no-change" });
  });

  it("uses the effective table override while retaining computed damage evidence", () => {
    const computed = damage(SELF, [{ amount: 8, damageType: "fire", partId: "fire" }]);
    const overridden = withDamageTableOverride(computed, {
      amount: 2,
      kind: "net-total",
      reasonId: "table-ruling",
    });
    if (!overridden) throw new Error("fixture");
    const result = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10, 3)),
        transaction([
          {
            attacker: null,
            criticalHit: false,
            damage: overridden,
            kind: "creature-damage",
            maximumHitPoints: { kind: "fact", value: 10 },
            operationId: "overridden",
            causeId: INSTALLED_CAUSE.causeId,
            zeroHitPointsPolicy: "dying",
          },
        ])
      )
    );
    const execution = result.executions[0];
    expect(execution?.status).toBe("applied");
    if (execution?.status !== "applied") return;
    expect(execution.operation).toMatchObject({ damage: overridden });
    expect(execution.facts).toMatchObject({
      damageTaken: 2,
      hitPointsLost: 0,
      temporaryHitPointsLost: 2,
    });
    expect(state(result.state.world).vitals.hitPoints.temporary.current).toBe(1);
  });

  it("covers every terminal creature and object vitality transition", () => {
    const heal = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(4)),
        transaction([
          {
            input: { amount: 20, maximumHitPoints: 10 },
            kind: "creature-healing",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "heal",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(heal.state.world).vitals.hitPoints.current).toBe(10);

    const granted = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([
          {
            grant: { amount: 6, decision: "replace", sourceOccurrence: null },
            kind: "temporary-hit-points-grant",
            operationId: "grant-thp",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(granted.state.world).vitals.hitPoints.temporary.current).toBe(6);
    const cleared = simulated(
      simulateMechanicsTransaction(
        granted.state.world,
        transaction([
          {
            clear: { kind: "all" },
            kind: "temporary-hit-points-clear",
            operationId: "clear-thp",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(cleared.state.world).vitals.hitPoints.temporary.current).toBe(0);

    const stable = simulated(
      simulateMechanicsTransaction(
        parsedWorld(dying(1)),
        transaction([
          {
            kind: "creature-stabilize",
            operationId: "stabilize",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(stable.state.world).vitals.zeroHitPoints).toEqual({ kind: "stable" });

    const killed = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10, 4)),
        transaction([
          {
            kind: "creature-kill",
            operationId: "kill",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(killed.state.world).vitals).toEqual({
      hitPoints: {
        current: 0,
        temporary: { current: 4, sourceOccurrence: null },
      },
      zeroHitPoints: { kind: "dead" },
    });

    const reduced = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(5, 2)),
        transaction([
          {
            input: { maximumHitPoints: 10, zeroHitPointsPolicy: "dying" },
            kind: "creature-reduce-to-zero",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "reduce",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(reduced.state.world).vitals).toEqual({
      hitPoints: {
        current: 0,
        temporary: { current: 2, sourceOccurrence: null },
      },
      zeroHitPoints: { failures: 0, kind: "dying", successes: 0 },
    });

    const revived = simulated(
      simulateMechanicsTransaction(
        parsedWorld(dead()),
        transaction([
          {
            input: { hitPoints: 50, maximumHitPoints: 12 },
            kind: "creature-revive",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "revive",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(revived.state.world).vitals).toEqual(alive(12));

    const deathSave = simulated(
      simulateMechanicsTransaction(
        parsedWorld(dying()),
        transaction([
          {
            kind: "creature-death-save",
            operationId: "death-save",
            outcome: "critical-success",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(deathSave.state.world).vitals).toEqual(alive(1));

    const creatureSync = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(12, 3)),
        transaction([
          {
            input: { maximumHitPoints: 7 },
            kind: "creature-maximum-sync",
            operationId: "creature-sync",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(creatureSync.state.world).vitals.hitPoints.current).toBe(7);

    const door = { entityId: "door", material: CHARACTER, ordinal: 1 } as const;
    const objectResult = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10), { door: object(7) }),
        transaction([
          {
            attacker: null,
            criticalHit: false,
            damage: damage(door, [
              { amount: 20, damageType: "bludgeoning", partId: "impact" },
            ]),
            kind: "object-damage",
            maximumHitPoints: { kind: "material" },
            operationId: "object-damage",
            causeId: INSTALLED_CAUSE.causeId,
          },
          {
            input: { amount: 3, maximumHitPoints: 7 },
            kind: "object-repair",
            maximumHitPointsSource: { kind: "material" },
            operationId: "object-repair",
            causeId: INSTALLED_CAUSE.causeId,
            target: door,
          },
          {
            input: { maximumHitPoints: 0 },
            kind: "object-maximum-sync",
            operationId: "object-sync",
            causeId: INSTALLED_CAUSE.causeId,
            target: door,
          },
        ])
      )
    );
    expect(state(objectResult.state.world).entities.door?.vitals).toEqual({
      hitPoints: { current: 0 },
    });
    expect(objectResult.executions).toHaveLength(3);
  });

  it("discovers end rules only after the complete atomic transaction", () => {
    const rootCause = programRootCause(AUTHORITY, "root");
    const source = occurrenceGeneration("temporary-hit-points", 2);
    const createSource = {
      causeId: rootCause.causeId,
      conditionImmunityOverride: null,
      created: source,
      kind: "occurrence-create",
      occurrence: {
        endRules: [{ kind: "temporary-hp-empty" }],
        fact: { key: "temporary-hit-points", kind: "active-key" },
        kind: "standing",
        origin: programStepOrigin(STEP_IDS.standing),
        parentId: "root",
        target: SELF,
      },
      operationId: "create-temporary-hit-points-source",
      parent: occurrenceGeneration("root", 1),
    } as const satisfies MechanicsOperation;
    const grant = {
      causeId: rootCause.causeId,
      grant: { amount: 6, decision: "replace", sourceOccurrence: source },
      kind: "temporary-hit-points-grant",
      operationId: "grant-sourced-temporary-hit-points",
      target: SELF,
    } as const satisfies MechanicsOperation;
    const before = worldWithZeroedRoots([["root", AUTHORITY]]);
    const applyTransaction = transaction([createSource, grant], {
      causes: [rootCause],
    });
    const pending = pendingProgramContext(
      before,
      applyTransaction,
      AUTHORITY,
      occurrenceGeneration("root", 1),
      { stepId: STEP_IDS.standing }
    );
    const prefix = projectKernelTransaction(
      transaction([createSource], { causes: [rootCause] }),
      pending
    );
    expect(prefix.status).toBe("projected");
    if (prefix.status !== "projected") return;
    expect(
      state(prefix.projection.world).occurrences["temporary-hit-points"]
    ).toMatchObject({ ending: null });
    expect(state(prefix.projection.world).vitals.hitPoints.temporary).toEqual({
      current: 0,
      sourceOccurrence: null,
    });

    const completeProjection = projectKernelTransaction(applyTransaction, pending);
    expect(completeProjection.status).toBe("projected");
    if (completeProjection.status !== "projected") return;
    expect(
      state(completeProjection.projection.world).occurrences["temporary-hit-points"]
    ).toMatchObject({ ending: null });
    expect(state(completeProjection.projection.world).vitals.hitPoints.temporary).toEqual(
      {
        current: 6,
        sourceOccurrence: source,
      }
    );

    const result = simulated(
      simulateMechanicsTransaction(before, applyTransaction, pending)
    );

    expect(
      state(result.stages[0]?.after ?? before).occurrences["temporary-hit-points"]
    ).toMatchObject({ ending: null });
    expect(state(result.stages[0]?.after ?? before).vitals.hitPoints.temporary).toEqual({
      current: 0,
      sourceOccurrence: null,
    });
    expect(state(result.state.world).vitals.hitPoints.temporary).toEqual({
      current: 6,
      sourceOccurrence: source,
    });
    expect(state(result.state.world).occurrences["temporary-hit-points"]).toMatchObject({
      ending: null,
    });
    expect(result.state.context.endWave).toBeNull();

    expect(
      simulateMechanicsTransaction(
        before,
        transaction([grant, createSource], { causes: [rootCause] }),
        pending
      )
    ).toEqual({
      operationId: "grant-sourced-temporary-hit-points",
      reason: "invalid-after",
      status: "rejected",
    });
  });

  it("models damage at zero, critical failures, and instant death from raw damage", () => {
    const target = { entityId: "foe", material: CHARACTER, ordinal: 1 } as const;
    const critical = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10), { foe: creature(dying(1)) }),
        transaction([creatureDamage("critical", target, 1, { criticalHit: true })])
      )
    );
    expect(state(critical.state.world).entities.foe?.vitals).toEqual(dead());

    const instant = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10), { foe: creature(dying()) }),
        transaction([creatureDamage("instant", target, 10)])
      )
    );
    expect(state(instant.state.world).entities.foe?.vitals).toEqual(dead());
  });

  it("keeps Concentration readable until its causal end wave is delivered", () => {
    const replacementRoot = appendZeroedRoot(
      concentratingWorld(alive(3)),
      "replacement-root"
    );
    const result = simulated(
      simulateMechanicsTransaction(
        replacementRoot.world,
        transaction([
          creatureDamage("drop", SELF, 3, {
            maximumHitPoints: { kind: "fact", value: 10 },
          }),
        ])
      )
    );

    expect(state(result.state.world).vitals.zeroHitPoints?.kind).toBe("dying");
    expect(state(result.state.world).occurrences).toHaveProperty("root");
    expect(state(result.state.world).occurrences).toHaveProperty("focus");
    expect(result).not.toHaveProperty("action");
    expect(result.state.context.endWave).toMatchObject({
      wave: {
        candidates: [
          {
            causes: [{ kind: "concentration-broken" }],
            occurrence: occurrenceGeneration("focus", 2),
          },
        ],
      },
      world: result.state.world,
    });
    const withoutCheckpoint = transaction([
      creatureDamage("without-checkpoint", SELF, 1),
    ]);
    expect(
      simulateKernelTransaction(withoutCheckpoint, {
        authoritySnapshot: authoritySnapshotFor(withoutCheckpoint),
        state: result.state.world as never,
      })
    ).toEqual({
      operationId: null,
      reason: "invalid-world",
      status: "rejected",
    });
    expect(discoverMechanicsEndWave(result.state.world)).toMatchObject({
      status: "discovered",
      wave: {
        candidates: [
          {
            causes: [{ kind: "concentration-broken" }],
            occurrence: occurrenceGeneration("focus", 2),
          },
        ],
      },
    });

    const rootCause = programRootCause(AUTHORITY, "replacement-root", 3);
    const replacement = {
      causeId: rootCause.causeId,
      conditionImmunityOverride: null,
      created: occurrenceGeneration("replacement-focus", 4),
      kind: "occurrence-create",
      occurrence: {
        endRules: [],
        kind: "concentration",
        origin: programStepOrigin(STEP_IDS.concentration, {
          rootId: "replacement-root",
          rootOrdinal: 3,
        }),
        parentId: "replacement-root",
        target: SELF,
      },
      operationId: "replace-latched-focus",
      parent: replacementRoot.root,
    } as const satisfies MechanicsOperation;
    const replaceTransaction = transaction(
      [
        {
          causeId: INSTALLED_CAUSE.causeId,
          input: { amount: 1, maximumHitPoints: 10 },
          kind: "creature-healing",
          maximumHitPointsSource: { kind: "fact" },
          operationId: "heal-before-replacement",
          target: SELF,
        },
        replacement,
      ],
      { causes: orderedCauses(INSTALLED_CAUSE, rootCause) }
    );
    const replaced = simulated(
      simulateMechanicsTransaction(result.state.world, replaceTransaction, {
        authoritySnapshot: authoritySnapshotFor(replaceTransaction),
        state: pendingAtStep(
          pushProgramFrame(result.state, AUTHORITY, replacementRoot.root).state,
          createProgramFrame(result.state.world, AUTHORITY, replacementRoot.root),
          STEP_IDS.concentration
        ),
      })
    );
    expect(state(replaced.state.world).occurrences.focus).toHaveProperty("ending");
    expect(state(replaced.state.world).occurrences["replacement-focus"]).toMatchObject({
      ending: null,
      kind: "concentration",
    });

    const followup = transaction([
      {
        causeId: INSTALLED_CAUSE.causeId,
        grant: { amount: 2, decision: "replace", sourceOccurrence: null },
        kind: "temporary-hit-points-grant",
        operationId: "grant-while-ending-is-readable",
        target: SELF,
      },
    ]);
    const continued = simulated(
      simulateMechanicsTransaction(result.state.world, followup, {
        authoritySnapshot: authoritySnapshotFor(followup),
        state: result.state,
      })
    );
    expect(state(continued.state.world).vitals.hitPoints.temporary.current).toBe(2);
    expect(continued.state.context.endWave).toMatchObject({
      wave: {
        candidates: [
          {
            occurrence: occurrenceGeneration("focus", 2),
          },
        ],
      },
    });
  });

  it("creates universal occurrences and defers their causal closure", () => {
    const conditionRoot = appendZeroedRoot(
      concentratingWorld(alive(10)),
      "condition-root"
    );
    const conditionCause = programRootCause(AUTHORITY, "condition-root", 3);
    const paralyze = conditionCreate("paralyze", "paralysis", "paralyzed", null, {
      cause: conditionCause,
      createdOrdinal: 4,
      parentId: "condition-root",
      parentOrdinal: 3,
    });
    const paralyzeTransaction = transaction([paralyze], {
      causes: [conditionCause],
    });
    const paralyzed = simulated(
      simulateMechanicsTransaction(
        conditionRoot.world,
        paralyzeTransaction,
        pendingProgramContext(
          conditionRoot.world,
          paralyzeTransaction,
          AUTHORITY,
          conditionRoot.root,
          { stepId: STEP_IDS.condition }
        )
      )
    );
    expect(Object.keys(state(paralyzed.state.world).occurrences)).toEqual([
      "root",
      "focus",
      "condition-root",
      "paralysis",
    ]);
    const paralyzeExecution = paralyzed.executions[0];
    expect(paralyzeExecution?.status).toBe("applied");
    if (paralyzeExecution?.status !== "applied") return;
    expect(paralyzeExecution.facts).toEqual({
      created: occurrenceGeneration("paralysis", 4),
    });
    expect(paralyzed.state.context.endWave).toMatchObject({
      wave: {
        candidates: [
          {
            causes: [{ kind: "concentration-broken" }],
            occurrence: occurrenceGeneration("focus", 2),
          },
        ],
      },
      world: paralyzed.state.world,
    });
    expect(discoverMechanicsEndWave(paralyzed.state.world)).toMatchObject({
      status: "discovered",
      wave: {
        candidates: [
          {
            causes: [{ kind: "concentration-broken" }],
            occurrence: occurrenceGeneration("focus", 2),
          },
        ],
      },
    });

    const immuneState = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    const immuneRoot = addOccurrence(
      {
        nextOccurrenceOrdinal: immuneState.nextOccurrenceOrdinal,
        occurrences: immuneState.occurrences,
      },
      "root",
      {
        authority: AUTHORITY,
        endRules: [],
        kind: "program",
        phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
        registers: {},
      }
    );
    const immuneOccurrence = addOccurrence(immuneRoot, "poison-immunity", {
      endRules: [],
      fact: { conditionId: "poisoned", kind: "condition-immunity" },
      kind: "standing",
      origin: programStepOrigin(STEP_IDS.standing),
      parentId: "root",
      target: SELF,
    });
    const tableRoot = addOccurrence(immuneOccurrence, "table-root", {
      authority: TABLE_AUTHORITY,
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    });
    const immunityTestRoot = addOccurrence(tableRoot, "condition-root", {
      authority: AUTHORITY,
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    });
    const closed = structuredClone(immunityTestRoot);
    const program = closed.occurrences.root;
    if (!program || program.kind !== "program") throw new Error("root fixture");
    program.phaseState.invoke = { execution: 1, lastTriggerEventId: null };
    const immuneWorld = parsedCharacterState({ ...immuneState, ...closed });
    const immunityTestCause = programRootCause(AUTHORITY, "condition-root", 4);
    const immuneOperation = conditionCreate("poison", "poisoned", "poisoned", null, {
      cause: immunityTestCause,
      createdOrdinal: 5,
      parentId: "condition-root",
      parentOrdinal: 4,
    });
    const immuneTransaction = transaction([immuneOperation], {
      causes: [immunityTestCause],
    });
    expect(
      simulateMechanicsTransaction(
        immuneWorld,
        immuneTransaction,
        pendingProgramContext(
          immuneWorld,
          immuneTransaction,
          AUTHORITY,
          occurrenceGeneration("condition-root", 4),
          { stepId: STEP_IDS.condition }
        )
      )
    ).toMatchObject({
      executions: [{ reason: "condition-immune", status: "no-change" }],
      status: "no-change",
    });

    const invalidOverride = conditionCreate(
      "poison-override",
      "poisoned",
      "poisoned",
      { reasonId: "table-overrides-immunity" },
      {
        cause: immunityTestCause,
        createdOrdinal: 5,
        parentId: "condition-root",
        parentOrdinal: 4,
      }
    );
    const invalidOverrideTransaction = transaction([invalidOverride], {
      causes: [immunityTestCause],
    });
    expect(
      simulateMechanicsTransaction(
        immuneWorld,
        invalidOverrideTransaction,
        pendingProgramContext(
          immuneWorld,
          invalidOverrideTransaction,
          AUTHORITY,
          occurrenceGeneration("condition-root", 4),
          { stepId: STEP_IDS.condition }
        )
      )
    ).toEqual({
      operationId: "poison-override",
      reason: "invalid-override",
      status: "rejected",
    });

    const tableCause = programRootCause(TABLE_AUTHORITY, "table-root", 3);
    const tableOverride = conditionCreate(
      "table-poison-override",
      "poisoned",
      "poisoned",
      { reasonId: "table-overrides-immunity" },
      {
        cause: tableCause,
        createdOrdinal: 5,
        parentId: "table-root",
        parentOrdinal: 3,
      }
    );
    const tableTransaction = transaction([tableOverride], {
      actor: TABLE_OWNER,
      causes: [tableCause],
    });
    const overridden = simulated(
      simulateMechanicsTransaction(
        immuneWorld,
        tableTransaction,
        pendingProgramContext(
          immuneWorld,
          tableTransaction,
          TABLE_AUTHORITY,
          occurrenceGeneration("table-root", 3),
          { stepId: STEP_IDS.condition }
        )
      )
    );
    expect(state(overridden.state.world).occurrences).toHaveProperty("poisoned");
  });

  it("does not let a latched standing immunity block a new condition", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10, 1))
    );
    const root = addOccurrence(
      {
        nextOccurrenceOrdinal: material.nextOccurrenceOrdinal,
        occurrences: material.occurrences,
      },
      "root",
      {
        authority: AUTHORITY,
        endRules: [],
        kind: "program",
        phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
        registers: {},
      }
    );
    const immunity = addOccurrence(root, "poison-immunity", {
      endRules: [{ kind: "temporary-hp-empty" }],
      fact: { conditionId: "poisoned", kind: "condition-immunity" },
      kind: "standing",
      origin: programStepOrigin(STEP_IDS.standing),
      parentId: "root",
      target: SELF,
    });
    const applyRoot = addOccurrence(immunity, "apply-root", {
      authority: AUTHORITY,
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    });
    const invoked = structuredClone(applyRoot);
    const program = invoked.occurrences.root;
    if (!program || program.kind !== "program") throw new Error("root fixture");
    program.phaseState.invoke = { execution: 1, lastTriggerEventId: null };
    const before = parsedCharacterState({ ...material, ...invoked });
    const clear = transaction([
      {
        causeId: INSTALLED_CAUSE.causeId,
        clear: { kind: "all" },
        kind: "temporary-hit-points-clear",
        operationId: "expire-immunity",
        target: SELF,
      },
    ]);
    const latched = simulated(simulateMechanicsTransaction(before, clear));
    expect(state(latched.state.world).occurrences["poison-immunity"]).toMatchObject({
      ending: { causes: [{ kind: "temporary-hit-points-empty" }] },
    });

    const applyCause = programRootCause(AUTHORITY, "apply-root", 3);
    const apply = transaction(
      [
        conditionCreate("poison-after-immunity", "poisoned", "poisoned", null, {
          cause: applyCause,
          createdOrdinal: 4,
          parentId: "apply-root",
          parentOrdinal: 3,
        }),
      ],
      { causes: [applyCause] }
    );
    const pending = pushProgramFrame(
      latched.state,
      AUTHORITY,
      occurrenceGeneration("apply-root", 3)
    );
    const applied = simulated(
      simulateMechanicsTransaction(latched.state.world, apply, {
        authoritySnapshot: authoritySnapshotFor(apply),
        state: pendingAtStep(pending.state, pending.frame, STEP_IDS.condition),
      })
    );
    expect(state(applied.state.world).occurrences.poisoned).toMatchObject({
      ending: null,
      kind: "condition",
    });
  });

  it("latches occurrence closure while deferring final cleanup", () => {
    const replacementRoot = appendZeroedRoot(
      concentratingWorld(alive(10)),
      "replacement-root"
    );
    const replacementCause = programRootCause(AUTHORITY, "replacement-root", 3);
    const replacement: MechanicsOperation = {
      causeId: replacementCause.causeId,
      conditionImmunityOverride: null,
      created: occurrenceGeneration("new-focus", 4),
      kind: "occurrence-create",
      occurrence: {
        endRules: [],
        kind: "concentration",
        origin: programStepOrigin(STEP_IDS.concentration, {
          rootId: "replacement-root",
          rootOrdinal: 3,
        }),
        parentId: "replacement-root",
        target: SELF,
      },
      operationId: "replace-focus",
      parent: replacementRoot.root,
    };
    const concentrating = replacementRoot.world;
    const replacementTransaction = transaction([replacement], {
      causes: [replacementCause],
    });
    expect(
      simulateMechanicsTransaction(
        concentrating,
        replacementTransaction,
        pendingProgramContext(
          concentrating,
          replacementTransaction,
          AUTHORITY,
          replacementRoot.root,
          { stepId: STEP_IDS.concentration }
        )
      )
    ).toEqual({
      operationId: "replace-focus",
      reason: "concentration-replacement-required",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        concentrating,
        transaction(
          [
            {
              causeId: INSTALLED_CAUSE.causeId,
              kind: "occurrence-end",
              occurrence: occurrenceGeneration("focus", 2),
              operationId: "end-old-focus",
            },
            replacement,
          ],
          { causes: orderedCauses(INSTALLED_CAUSE, replacementCause) }
        )
      )
    ).toEqual({
      operationId: null,
      reason: "invalid-transaction",
      status: "rejected",
    });

    const rootState = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    const root = addOccurrence(
      {
        nextOccurrenceOrdinal: rootState.nextOccurrenceOrdinal,
        occurrences: rootState.occurrences,
      },
      "root",
      {
        authority: AUTHORITY,
        endRules: [],
        kind: "program",
        phaseState: {
          invoke: { execution: 0, lastTriggerEventId: null },
        },
        registers: {},
      }
    );
    const child = addOccurrence(root, "child", {
      endRules: [],
      fact: { key: "child", kind: "active-key" },
      kind: "standing",
      origin: programStepOrigin(STEP_IDS.standing),
      parentId: "root",
      target: SELF,
    });
    const invoked = structuredClone(child);
    const program = invoked.occurrences.root;
    if (!program || program.kind !== "program") throw new Error("root fixture");
    program.phaseState.invoke = { execution: 1, lastTriggerEventId: null };
    const cascadeWorld = parsedCharacterState({ ...rootState, ...invoked });
    const endTransaction = transaction([
      {
        causeId: INSTALLED_CAUSE.causeId,
        kind: "occurrence-end",
        occurrence: occurrenceGeneration("root", 1),
        operationId: "end-root",
      },
    ]);
    const projected = projectKernelTransaction(
      endTransaction,
      simulationContext(cascadeWorld, endTransaction)
    );
    expect(projected.status).toBe("projected");
    if (projected.status !== "projected") return;
    expect(state(projected.projection.world).occurrences.root?.ending).toBeNull();
    expect(state(projected.projection.world).occurrences.child?.ending).toBeNull();
    expect(projected.consequences).toEqual([
      {
        causeId: INSTALLED_CAUSE.causeId,
        kind: "occurrence-end",
        occurrence: occurrenceGeneration("root", 1),
        operationId: "end-root",
      },
    ]);

    const ended = simulated(simulateMechanicsTransaction(cascadeWorld, endTransaction));
    expect(ended.stages[0]?.after).toBe(ended.stages[0]?.before);
    expect(Object.keys(state(ended.state.world).occurrences)).toEqual(["root", "child"]);
    expect(state(ended.state.world).occurrences.root?.ending).toEqual({
      causes: [{ kind: "requested" }],
    });
    expect(state(ended.state.world).occurrences.child?.ending).toEqual({
      causes: [
        {
          dependency: occurrenceGeneration("root", 1),
          kind: "dependency-ended",
        },
      ],
    });
    expect(ended.state.context.request.endRequests).toEqual([
      occurrenceGeneration("root", 1),
    ]);
    const endExecution = ended.executions[0];
    expect(endExecution?.status).toBe("applied");
    if (endExecution?.status !== "applied") return;
    expect(endExecution.facts).toEqual({
      requested: occurrenceGeneration("root", 1),
    });
    expect(ended.consequences).toEqual([
      {
        causeId: INSTALLED_CAUSE.causeId,
        kind: "occurrence-end",
        occurrence: occurrenceGeneration("root", 1),
        operationId: "end-root",
      },
    ]);
    expect(ended).not.toHaveProperty("action");
  });

  it("kills at Exhaustion 6 and permits ordered removal before revival", () => {
    const exhaustedState = {
      ...structuredClone(createEmptyCharacterMaterialState(1, CHARACTER, alive(10))),
      exhaustion: 5 as const,
    };
    const exhaustedWorld = parsedCharacterState(exhaustedState);
    const killed = simulated(
      simulateMechanicsTransaction(
        exhaustedWorld,
        transaction([
          {
            kind: "exhaustion-transition",
            operationId: "gain-exhaustion",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
            transition: { amount: 1, kind: "gain" },
          },
        ])
      )
    );
    expect(state(killed.state.world)).toMatchObject({
      exhaustion: 6,
      vitals: { zeroHitPoints: { kind: "dead" } },
    });

    const restored = simulated(
      simulateMechanicsTransaction(
        killed.state.world,
        transaction([
          {
            kind: "exhaustion-transition",
            operationId: "remove-exhaustion",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
            transition: { amount: 1, kind: "remove" },
          },
          {
            input: { hitPoints: 4, maximumHitPoints: 10 },
            kind: "creature-revive",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "revive",
            causeId: INSTALLED_CAUSE.causeId,
            target: SELF,
          },
        ])
      )
    );
    expect(state(restored.state.world)).toMatchObject({
      exhaustion: 5,
      vitals: { hitPoints: { current: 4 }, zeroHitPoints: null },
    });
  });

  it("spends one physical resource sequentially with definition CAS evidence", () => {
    const before = resourceWorld();
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const result = simulated(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend-one",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 1, kind: "spend" },
            },
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend-rest",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 2, kind: "spend" },
            },
          ],
          { factGuards: [resourceDefinitionFact(before, resource)] }
        )
      )
    );

    expect(state(result.state.world).resources.pools.focus).toMatchObject({ current: 0 });
    expect(result.executions.map(({ status }) => status)).toEqual(["applied", "applied"]);
    const facts = result.executions.flatMap((execution) =>
      execution.status === "applied" && execution.kind === "resource-transition"
        ? [execution.facts]
        : []
    );
    expect(facts).toEqual([
      {
        afterRemaining: 2,
        becameEmpty: false,
        beforeRemaining: 3,
        recoveryResolution: null,
        spentResolution: null,
      },
      {
        afterRemaining: 0,
        becameEmpty: true,
        beforeRemaining: 2,
        recoveryResolution: null,
        spentResolution: null,
      },
    ]);
    expect(result.stages).toHaveLength(2);

    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          {
            bindings: {},
            kind: "resource-transition",
            operationId: "unguarded",
            resource,
            causeId: INSTALLED_CAUSE.causeId,
            spec: COUNT_RESOURCE_SPEC,
            transition: { amount: 1, kind: "spend" },
          },
        ])
      )
    ).toEqual({
      operationId: null,
      reason: "missing-resource-definition-fact",
      status: "rejected",
    });
  });

  it("exposes resource definition facts without drafting a journal action", () => {
    const before = resourceWorld();
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const definition = resourceDefinitionFact(before, resource);
    const result = simulated(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 1, kind: "spend" },
            },
          ],
          { factGuards: [definition] }
        )
      )
    );
    expect(result.actionFacts).toEqual(
      expectedInstalledFacts([{ ...definition, lifecycle: "commit" }])
    );
    expect(result).not.toHaveProperty("action");
  });

  it("aborts cumulative resource overdraw and propagates missing roll input", () => {
    const before = resourceWorld(2);
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const fact = resourceDefinitionFact(before, resource);
    const spend = (operationId: string): MechanicsOperation => ({
      bindings: {},
      kind: "resource-transition",
      operationId,
      resource,
      causeId: INSTALLED_CAUSE.causeId,
      spec: COUNT_RESOURCE_SPEC,
      transition: { amount: 2, kind: "spend" },
    });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([spend("first"), spend("overdraw")], {
          factGuards: [fact],
        })
      )
    ).toEqual({
      operationId: "overdraw",
      reason: "resource-overdraw",
      status: "rejected",
    });
    expect(state(before).resources.pools.focus).toMatchObject({ current: 2 });

    const recoverySpec = {
      ...COUNT_RESOURCE_SPEC,
      recoveries: [
        {
          amount: {
            formula: {
              terms: [
                {
                  count: { kind: "fixed", value: 1 },
                  kind: "dice",
                  operation: "add",
                  sides: 6,
                  termId: "recovery",
                },
              ],
            },
            kind: "formula",
          },
          trigger: { kind: "manual" },
        },
      ],
    } as const satisfies ResourceSpec;
    const recovery = simulateMechanicsTransaction(
      before,
      transaction(
        [
          {
            bindings: {},
            kind: "resource-transition",
            operationId: "recover",
            resource,
            causeId: INSTALLED_CAUSE.causeId,
            spec: recoverySpec,
            transition: { kind: "recover", trigger: { kind: "manual" } },
          },
        ],
        {
          factGuards: [resourceDefinitionFact(before, resource, recoverySpec)],
        }
      )
    );
    expect(recovery).toMatchObject({
      boundary: "recovery",
      operationId: "recover",
      status: "needs-observation",
    });
    expect(recovery).not.toHaveProperty("action");
  });

  it("accepts only exact resource lifecycle commands and observations", () => {
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "new-focus",
    } as const satisfies ResourceRef;
    const initialize = initializeOperation("initialize", resource);
    const remove = {
      kind: "resource-remove",
      operationId: "remove",
      resource,
      causeId: INSTALLED_CAUSE.causeId,
    } as const satisfies MechanicsOperation;

    expect(conformMechanicsOperation(initialize)).toEqual(initialize);
    expect(conformMechanicsOperation(remove)).toEqual(remove);
    expect(conformMechanicsOperation({ ...initialize, legacyCurrent: 3 })).toBeNull();
    expect(
      conformMechanicsOperation({
        ...initialize,
        observations: {
          capacity: { aggregates: [], legacyRoll: 3, trails: [] },
        },
      })
    ).toBeNull();
    expect(conformMechanicsOperation({ ...remove, observations: {} })).toBeNull();
  });

  it("fails closed on lifecycle collisions, missing state, and fixed-shape cells", () => {
    const before = resourceWorld();
    const snapshot = structuredClone(before);
    const focus = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const missing = { ...focus, resourceId: "missing" } as const satisfies ResourceRef;
    const currency = {
      character: CHARACTER,
      denomination: "gp",
      kind: "currency",
    } as const satisfies ResourceRef;
    const quantity = {
      character: CHARACTER,
      instanceId: "missing-item",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;

    expect(
      simulateMechanicsTransaction(
        before,
        transaction([initializeOperation("collision", focus)])
      )
    ).toEqual({
      operationId: "collision",
      reason: "resource-collision",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          {
            kind: "resource-remove",
            operationId: "missing",
            resource: missing,
            causeId: INSTALLED_CAUSE.causeId,
          },
        ])
      )
    ).toEqual({
      operationId: "missing",
      reason: "resource-missing",
      status: "rejected",
    });
    for (const [operationId, operation] of [
      ["initialize-currency", initializeOperation("initialize-currency", currency)],
      [
        "remove-quantity",
        {
          kind: "resource-remove",
          operationId: "remove-quantity",
          resource: quantity,
          causeId: INSTALLED_CAUSE.causeId,
        } satisfies MechanicsOperation,
      ],
    ] as const) {
      expect(simulateMechanicsTransaction(before, transaction([operation]))).toEqual({
        operationId,
        reason: "resource-fixed-shape",
        status: "rejected",
      });
    }
    expect(before).toEqual(snapshot);
  });

  it("suspends formula initialization at each physical observation boundary", () => {
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "rolled-capacity",
    } as const satisfies ResourceRef;
    const spec = {
      capacity: { formula: D4_FORMULA, kind: "formula" },
      id: "rolled-capacity",
      initial: { formula: D4_FORMULA, kind: "formula" },
      kind: "count",
      recoveries: [],
    } as const satisfies ResourceSpec;
    const before = parsedWorld(alive(10));
    const snapshot = structuredClone(before);

    const capacity = simulateMechanicsTransaction(
      before,
      transaction([initializeOperation("initialize", resource, spec)])
    );
    expect(capacity).toMatchObject({
      boundary: "capacity",
      operationId: "initialize",
      status: "needs-observation",
    });
    expect(capacity).not.toHaveProperty("action");
    expect(capacity).not.toHaveProperty("world");

    const initial = simulateMechanicsTransaction(
      before,
      transaction([
        initializeOperation("initialize", resource, spec, {
          capacity: diceObservation(4),
        }),
      ])
    );
    expect(initial).toMatchObject({
      boundary: "initial",
      operationId: "initialize",
      status: "needs-observation",
    });

    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          initializeOperation("invalid-roll", resource, spec, {
            capacity: diceObservation(5),
            initial: diceObservation(2),
          }),
        ])
      )
    ).toEqual({
      operationId: "invalid-roll",
      reason: "resource-invalid-observation",
      status: "rejected",
    });

    const result = simulated(
      simulateMechanicsTransaction(
        before,
        transaction([
          initializeOperation("initialize", resource, spec, {
            capacity: diceObservation(4),
            initial: diceObservation(2),
          }),
        ])
      )
    );
    expect(state(result.state.world).resources.pools[resource.resourceId]).toMatchObject({
      capacity: { base: { kind: "formula", resolution: { total: 4 } } },
      current: 2,
    });
    expect(result.executions[0]).toMatchObject({
      facts: {
        cell: { current: 2, kind: "count" },
        observations: {
          capacity: diceObservation(4),
          initial: diceObservation(2),
        },
      },
      status: "applied",
    });
    expect(before).toEqual(snapshot);
  });

  it("aborts earlier consequences when initialization still needs a roll", () => {
    const before = parsedWorld(alive(10));
    const snapshot = structuredClone(before);
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "formula-resource",
    } as const satisfies ResourceRef;
    const spec = {
      ...BOUNDED_RESOURCE_SPEC,
      capacity: { formula: D4_FORMULA, kind: "formula" },
      id: "formula-resource",
      initial: { kind: "empty" },
    } as const satisfies ResourceSpec;
    const result = simulateMechanicsTransaction(
      before,
      transaction([
        creatureDamage("would-apply", SELF, 3, {
          maximumHitPoints: { kind: "fact", value: 10 },
        }),
        initializeOperation("needs-roll", resource, spec),
      ])
    );

    expect(result).toMatchObject({
      boundary: "capacity",
      operationId: "needs-roll",
      status: "needs-observation",
    });
    expect(result).not.toHaveProperty("action");
    expect(result).not.toHaveProperty("world");
    expect(before).toEqual(snapshot);
    expect(state(before).vitals.hitPoints.current).toBe(10);
  });

  it("chains initialize then transition, and transition then removal, atomically", () => {
    const resource = {
      kind: "pool",
      owner: SELF,
      resourceId: "focus",
    } as const satisfies ResourceRef;
    const emptyWorld = parsedWorld(alive(10));
    const initializedAndSpent = simulated(
      simulateMechanicsTransaction(
        emptyWorld,
        transaction([
          initializeOperation("initialize", resource),
          {
            bindings: {},
            kind: "resource-transition",
            operationId: "spend",
            resource,
            causeId: INSTALLED_CAUSE.causeId,
            spec: BOUNDED_RESOURCE_SPEC,
            transition: { amount: 1, kind: "spend" },
          },
        ])
      )
    );
    expect(state(initializedAndSpent.state.world).resources.pools.focus).toMatchObject({
      current: 2,
    });
    expect(
      initializedAndSpent.executions.map(({ kind, status }) => [kind, status])
    ).toEqual([
      ["resource-initialize", "applied"],
      ["resource-transition", "applied"],
    ]);

    const populatedWorld = resourceWorld();
    const transitionedAndRemoved = simulated(
      simulateMechanicsTransaction(
        populatedWorld,
        transaction(
          [
            {
              bindings: {},
              kind: "resource-transition",
              operationId: "spend",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
              spec: COUNT_RESOURCE_SPEC,
              transition: { amount: 1, kind: "spend" },
            },
            {
              kind: "resource-remove",
              operationId: "remove",
              resource,
              causeId: INSTALLED_CAUSE.causeId,
            },
          ],
          { factGuards: [resourceDefinitionFact(populatedWorld, resource)] }
        )
      )
    );
    expect(state(transitionedAndRemoved.state.world).resources.pools).not.toHaveProperty(
      "focus"
    );
    expect(transitionedAndRemoved.executions[1]).toMatchObject({
      facts: { removed: { current: 2, kind: "count" } },
      kind: "resource-remove",
      status: "applied",
    });
    expect(transitionedAndRemoved.stages).toHaveLength(2);
    expect(state(populatedWorld).resources.pools.focus).toMatchObject({ current: 3 });
  });

  it("leaves final item cleanup to the higher-level executor", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.potion = {
      attuned: false,
      definition: { itemId: "potion-of-healing", kind: "catalogue" },
      disposition: "magical",
      enchantment: null,
      equipped: false,
      notes: "",
      ordinal: 1,
      overrides: {
        armorClass: null,
        attackBonus: null,
        damageFormula: null,
        damageType: null,
        name: null,
      },
      ownerOccurrence: null,
      quantity: countResource(1),
      resources: {},
      tags: [],
    };
    material.nextInventoryOrdinal = 2;
    const before = parsedCharacterState(material);
    const itemCause = installedCause(inventoryAuthority("potion", 1));
    const resource = {
      character: CHARACTER,
      instanceId: "potion",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;
    const quantitySpec = {
      ...COUNT_RESOURCE_SPEC,
      id: "item-quantity",
    } as const satisfies ResourceSpec;
    const spend = transaction(
      [
        {
          bindings: {},
          causeId: itemCause.causeId,
          kind: "resource-transition",
          operationId: "drink-potion",
          resource,
          spec: quantitySpec,
          transition: { amount: 1, kind: "spend" },
        },
      ],
      {
        causes: [itemCause],
        factGuards: [resourceDefinitionFact(before, resource, quantitySpec)],
      }
    );
    const basis = causalState(before);
    const context = {
      authoritySnapshot: authoritySnapshotFor(spend),
      state: basis,
    } as const;
    const projected = projectKernelTransaction(spend, context);
    expect(projected.status).toBe("projected");
    if (projected.status !== "projected") return;
    expect(state(projected.projection.world).inventory.potion?.quantity.current).toBe(0);
    expect(projected.projection.inventorySourceLeases).toEqual([
      inventoryRef("potion", 1),
    ]);
    expect(state(basis.world).inventory.potion?.quantity.current).toBe(1);
    expect(basis.context.request.inventorySourceLeases).toEqual([]);

    const result = simulated(simulateMechanicsTransaction(before, spend, context));
    expect(state(result.state.world).inventory.potion?.quantity.current).toBe(0);
    expect(state(result.state.world).inventory).toHaveProperty("potion");
    expect(result).not.toHaveProperty("action");
  });

  it("authenticates every installed cause against the shared action basis", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.potion = inventoryInstance(1);
    material.nextInventoryOrdinal = 2;
    const before = parsedCharacterState(material);
    const primaryAuthority = inventoryAuthority("potion", 1);
    const secondaryCapability = {
      ...primaryAuthority.snapshot.ref,
      capabilityId: "secondary-item-capability",
      definition: {
        catalogueKind: "system",
        entityId: "system.secondary-item-capability",
        kind: "catalogue",
        mechanicsRevision: canonicalFingerprint({ fixture: "secondary-item-capability" }),
      },
    };
    const secondaryAuthority = {
      ...primaryAuthority,
      installation: {
        ...primaryAuthority.installation,
        capability: secondaryCapability,
        installationId: "secondary-item-installation",
      },
      snapshot: {
        ...primaryAuthority.snapshot,
        program: primaryAuthority.snapshot.program
          ? {
              ...primaryAuthority.snapshot.program,
              id: secondaryCapability.capabilityId,
            }
          : null,
        ref: secondaryCapability,
      },
    } as const satisfies MechanicsProgramAuthorityReceipt;
    const spendCause = installedCause(primaryAuthority);
    const effectCause = installedCause(secondaryAuthority);
    const causes = orderedCauses(spendCause, effectCause);
    const resource = {
      character: CHARACTER,
      instanceId: "potion",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;
    const quantitySpec = {
      ...COUNT_RESOURCE_SPEC,
      id: "item-quantity",
    } as const satisfies ResourceSpec;
    const spend = {
      bindings: {},
      causeId: spendCause.causeId,
      kind: "resource-transition",
      operationId: "spend-final-item",
      resource,
      spec: quantitySpec,
      transition: { amount: 1, kind: "spend" },
    } as const satisfies MechanicsOperation;
    const effect = {
      ...creatureDamage("apply-item-effect", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: effectCause.causeId,
    } as const satisfies MechanicsOperation;
    const options = {
      causes,
      factGuards: [resourceDefinitionFact(before, resource, quantitySpec)],
    } as const;

    const spendFirst = simulated(
      simulateMechanicsTransaction(before, transaction([spend, effect], options))
    );
    expect(state(spendFirst.state.world).inventory.potion?.quantity.current).toBe(0);
    expect(state(spendFirst.state.world).vitals.hitPoints.current).toBe(9);

    const effectFirst = simulated(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            { ...effect, operationId: "apply-item-effect-first" },
            { ...spend, operationId: "spend-final-item-second" },
          ],
          { ...options, actionId: "effect-before-spend" }
        )
      )
    );
    expect(state(effectFirst.state.world).inventory.potion?.quantity.current).toBe(0);
    expect(state(effectFirst.state.world).vitals.hitPoints.current).toBe(9);
  });

  it("rejects ABA reuse when one inventory id names a new physical ordinal", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.wand = {
      attuned: false,
      definition: { itemId: "wand-of-magic-missiles", kind: "catalogue" },
      disposition: "magical",
      enchantment: null,
      equipped: false,
      notes: "",
      ordinal: 2,
      overrides: {
        armorClass: null,
        attackBonus: null,
        damageFormula: null,
        damageType: null,
        name: null,
      },
      ownerOccurrence: null,
      quantity: countResource(1),
      resources: {},
      tags: [],
    };
    material.nextInventoryOrdinal = 3;
    const before = parsedCharacterState(material);
    const staleCause = installedCause(inventoryAuthority("wand", 1));
    const operation = {
      ...creatureDamage("stale-wand", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: staleCause.causeId,
    };
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([operation], { causes: [staleCause] })
      )
    ).toEqual({
      operationId: "stale-wand",
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("leases a final consumable through cost and effects, then rejects reuse", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.potion = {
      attuned: false,
      definition: { itemId: "potion-of-speed", kind: "catalogue" },
      disposition: "magical",
      enchantment: null,
      equipped: false,
      notes: "",
      ordinal: 1,
      overrides: {
        armorClass: null,
        attackBonus: null,
        damageFormula: null,
        damageType: null,
        name: null,
      },
      ownerOccurrence: null,
      quantity: countResource(1),
      resources: {},
      tags: [],
    };
    material.nextInventoryOrdinal = 2;
    const before = parsedCharacterState(material);
    const authority = inventoryAuthority("potion", 1);
    const itemCause = installedCause(authority);
    const rootCause = programRootCause(authority, "potion-root");
    const potionRoot = occurrenceGeneration("potion-root", 1);
    const resource = {
      character: CHARACTER,
      instanceId: "potion",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;
    const quantitySpec = {
      ...COUNT_RESOURCE_SPEC,
      id: "item-quantity",
    } as const satisfies ResourceSpec;
    const allocate = transaction(
      [programCreate("create-root", "potion-root", itemCause)],
      { causes: [itemCause] }
    );
    const allocated = simulated(simulateMechanicsTransaction(before, allocate));
    const pending = pushProgramFrame(allocated.state, authority, potionRoot);
    const spend = transaction(
      [
        {
          bindings: {},
          causeId: itemCause.causeId,
          kind: "resource-transition",
          operationId: "drink",
          resource,
          spec: quantitySpec,
          transition: { amount: 1, kind: "spend" },
        },
      ],
      {
        causes: [itemCause],
        factGuards: [resourceDefinitionFact(before, resource, quantitySpec)],
      }
    );
    const spent = simulated(
      simulateMechanicsTransaction(allocated.state.world, spend, {
        authoritySnapshot: authoritySnapshotFor(spend),
        state: pending.state,
      })
    );
    const effect = {
      causeId: rootCause.causeId,
      conditionImmunityOverride: null,
      created: occurrenceGeneration("potion-effect", 2),
      kind: "occurrence-create",
      occurrence: {
        endRules: [],
        fact: { key: "haste", kind: "active-key" },
        kind: "standing",
        origin: programStepOrigin(STEP_IDS.standing, {
          rootId: "potion-root",
        }),
        parentId: "potion-root",
        target: SELF,
      },
      operationId: "apply-effect",
      parent: potionRoot,
    } as const satisfies MechanicsOperation;
    const effectTransaction = transaction([effect], { causes: [rootCause] });
    const effectState = pendingAtStep(spent.state, pending.frame, STEP_IDS.standing);
    const effected = simulated(
      simulateMechanicsTransaction(spent.state.world, effectTransaction, {
        authoritySnapshot: authoritySnapshotFor(effectTransaction),
        state: effectState,
      })
    );
    const phase = programPhaseTransition("commit-potion", rootCause, potionRoot);
    const phaseTransaction = transaction([phase], { causes: [rootCause] });
    const activated = simulated(
      simulateMechanicsTransaction(effected.state.world, phaseTransaction, {
        authoritySnapshot: authoritySnapshotFor(phaseTransaction),
        state: pendingAtPhaseTransition(effected.state, pending.frame),
      })
    );
    expect(state(activated.state.world).inventory.potion?.quantity.current).toBe(0);
    expect(state(activated.state.world).occurrences).toHaveProperty("potion-root");
    expect(state(activated.state.world).occurrences).toHaveProperty("potion-effect");

    expect(
      simulateMechanicsTransaction(
        activated.state.world,
        transaction(
          [
            {
              ...creatureDamage("reuse-empty-potion", SELF, 1, {
                maximumHitPoints: { kind: "fact", value: 10 },
              }),
              causeId: itemCause.causeId,
            },
          ],
          { actionId: "reuse-empty-potion", causes: [itemCause] }
        )
      )
    ).toEqual({
      operationId: "reuse-empty-potion",
      reason: "invalid-cause",
      status: "rejected",
    });

    const endTransaction = transaction(
      [
        {
          causeId: rootCause.causeId,
          kind: "occurrence-end",
          occurrence: occurrenceGeneration("potion-root", 1),
          operationId: "end-potion-effect",
        },
      ],
      { actionId: "end-potion-effect", causes: [rootCause] }
    );
    expect(
      simulateMechanicsTransaction(activated.state.world, endTransaction, {
        authoritySnapshot: { definitions: [] },
        state: activated.state,
      })
    ).toEqual({
      operationId: "end-potion-effect",
      reason: "invalid-after",
      status: "rejected",
    });
    const popped = popMechanicsPendingFrame(activated.state, pending.frame);
    expect(popped.ok).toBe(true);
    if (!popped.ok) return;
    expect(
      simulateMechanicsTransaction(popped.value.world, endTransaction, {
        authoritySnapshot: { definitions: [] },
        state: popped.value,
      })
    ).toEqual({
      operationId: "end-potion-effect",
      reason: "invalid-cause",
      status: "rejected",
    });
    expect(state(popped.value.world).inventory.potion?.quantity.current).toBe(0);
  });

  it("rejects bad authority, targets, kinds, and maximum evidence", () => {
    const before = parsedWorld(alive(10), {
      dismissed: creature(alive(5), false),
      door: object(7, 2),
    });
    const missingActor = {
      entityId: "missing",
      material: CHARACTER,
      ordinal: 99,
    } as const;
    expect(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            creatureDamage("damage", SELF, 1, {
              maximumHitPoints: { kind: "fact", value: 10 },
            }),
          ],
          { actor: missingActor }
        )
      )
    ).toEqual({ operationId: null, reason: "missing-actor", status: "rejected" });

    const missingAuthority = inventoryAuthority("missing", 1);
    const missingCause = installedCause(missingAuthority);
    const missingAuthorityOperation: MechanicsOperation = {
      ...creatureDamage("source", SELF, 1, {
        maximumHitPoints: { kind: "fact", value: 10 },
      }),
      causeId: missingCause.causeId,
    };
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([missingAuthorityOperation], { causes: [missingCause] })
      )
    ).toEqual({
      operationId: "source",
      reason: "invalid-cause",
      status: "rejected",
    });

    const unavailable = {
      entityId: "dismissed",
      material: CHARACTER,
      ordinal: 1,
    } as const;
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([creatureDamage("unavailable", unavailable, 1)])
      )
    ).toEqual({
      operationId: "unavailable",
      reason: "target-unavailable",
      status: "rejected",
    });

    const door = { entityId: "door", material: CHARACTER, ordinal: 2 } as const;
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([creatureDamage("wrong-kind", door, 1)])
      )
    ).toEqual({
      operationId: "wrong-kind",
      reason: "wrong-target-kind",
      status: "rejected",
    });

    expect(
      simulateMechanicsTransaction(
        before,
        transaction([
          creatureDamage("stale", SELF, 1, {
            maximumHitPoints: { kind: "fact", value: 5 },
          }),
        ])
      )
    ).toEqual({
      operationId: "stale",
      reason: "stale-hit-point-maximum",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        before,
        transaction([creatureDamage("missing-max", SELF, 1)])
      )
    ).toEqual({
      operationId: "missing-max",
      reason: "missing-hit-point-maximum",
      status: "rejected",
    });
  });

  it("deduplicates equal semantic facts and rejects conflicting facts", () => {
    const maximum: ActionFactGuard = {
      address: ["hit-point-maximum"],
      expected: { present: true, value: 10 },
      lifecycle: "commit-redo",
      owner: SELF,
    };
    const operation = creatureDamage("damage", SELF, 1, {
      maximumHitPoints: { kind: "fact", value: 10 },
    });
    const result = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([operation], { factGuards: [maximum] })
      )
    );
    expect(result.actionFacts).toEqual(expectedInstalledFacts([maximum]));

    expect(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([operation], {
          factGuards: [
            {
              ...maximum,
              expected: { present: true, value: 9 },
            },
          ],
        })
      )
    ).toEqual({ operationId: null, reason: "fact-conflict", status: "rejected" });

    expect(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([operation], {
          factGuards: [{ ...maximum, lifecycle: "commit" }],
        })
      )
    ).toEqual({ operationId: null, reason: "fact-conflict", status: "rejected" });
  });

  it("returns ordered stages and raw action facts without a journal draft", () => {
    const before = parsedWorld(alive(10));
    const result = simulated(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            creatureDamage("damage", SELF, 4, {
              maximumHitPoints: { kind: "fact", value: 10 },
            }),
            {
              input: { amount: 1, maximumHitPoints: 10 },
              kind: "creature-healing",
              maximumHitPointsSource: { kind: "fact" },
              operationId: "heal",
              causeId: INSTALLED_CAUSE.causeId,
              target: SELF,
            },
          ],
          { actionId: "whole-action" }
        )
      )
    );
    expect(
      result.stages.map(({ after, before: stageBefore }) => [
        state(stageBefore).vitals.hitPoints.current,
        state(after).vitals.hitPoints.current,
      ])
    ).toEqual([
      [10, 6],
      [6, 7],
    ]);
    expect(result.actionFacts).toEqual(
      expectedInstalledFacts([
        {
          address: ["hit-point-maximum"],
          expected: { present: true, value: 10 },
          lifecycle: "commit-redo",
          owner: SELF,
        },
      ])
    );
    expect(result).not.toHaveProperty("action");
  });
});
