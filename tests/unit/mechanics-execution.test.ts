import { describe, expect, it, vi } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { compileMechanicsFrame } from "@/lib/mechanics-compiler";
import { resolveDamage } from "@/lib/damage";
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
  analyzeResolutionGroup,
  conformOrderingObservation,
  conformResolutionGroup,
  deriveMechanicsPostEventEmissions,
  deriveMechanicsSourceEndingEvents,
  mechanicsOperationAccessFootprint,
  orderResolutionPartitions,
  simulateResolutionGroup,
} from "@/lib/mechanics-execution";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import { simulateMechanicsTransaction } from "@/lib/mechanics-operation";
import {
  deriveMechanicsRequirements,
  dispatchMechanicsEventSubscriber,
  reviewMechanicsIntent,
  selectMechanicsEventSubscribers,
} from "@/lib/mechanics-program";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { createTurnEconomyState } from "@/lib/turn-economy";
import {
  advanceMechanicsPendingFrameStep,
  beginMechanicsCausalState,
  discoverMechanicsEndWave,
  finalizeMechanicsCausalEndWave,
  finalizeMechanicsEndWave,
  latchMechanicsEndWave,
  parseMechanicsWorld,
  popMechanicsPendingFrame,
  pushMechanicsPendingFrame,
  pushMechanicsSelectedEventPendingFrame,
  rebaseMechanicsCausalState,
  topMechanicsPendingFrame,
} from "@/lib/mechanics-world";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type { ProgramStepOccurrenceOrigin } from "@/types/mechanic-occurrence";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
} from "@/types/mechanics-operation";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  MechanicsCausalState,
  MechanicsEndWaveReceipt,
  MechanicsWorld,
} from "@/types/mechanics-world";
import type { ResourceRef, ResourceSpec } from "@/types/resource";
import type { TurnEconomyProjection } from "@/types/turn-economy";
import type { CreatureVitals } from "@/types/vitals";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const SHARED = { campaignId: "campaign-1", kind: "shared-combat" } as const;
const SELF = { entityId: "self", material: MATERIAL } as const satisfies EntityRef;
const FIRST = {
  entityId: "first",
  material: MATERIAL,
  ordinal: 1,
} as const satisfies EntityRef;
const SECOND = {
  entityId: "second",
  material: MATERIAL,
  ordinal: 2,
} as const satisfies EntityRef;
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
const MECHANICS_REVISION = canonicalFingerprint({ fixture: "mechanics-execution" });
const CAPABILITY = {
  capabilityId: "execution",
  definition: {
    catalogueKind: "system",
    entityId: "system.mechanics-execution",
    kind: "catalogue",
    mechanicsRevision: MECHANICS_REVISION,
  },
  kind: "program",
} as const;
const INSTALLATION = {
  capability: CAPABILITY,
  generation: 1,
  installationId: "execution-installation",
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

function authoritySnapshotFor(
  causes: readonly Readonly<MechanicsOperationCause>[]
): MechanicsAuthoritySnapshot {
  const definitions = [
    ...new Map(
      causes.flatMap((cause) => {
        if (cause.invocation.kind !== "installed-capability") return [];
        const authority = AUTHORITIES_BY_CAUSE.get(cause.causeId);
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

function operationCause(
  authority: MechanicsProgramAuthorityReceipt,
  invocation: MechanicsInvocationRef
): MechanicsOperationCause {
  const cause: MechanicsOperationCause = {
    causeId: canonicalFingerprint({ authority, invocation }),
    invocation,
  };
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

function programRootCause(occurrence: OccurrenceGenerationRef): MechanicsOperationCause {
  return operationCause(AUTHORITY, {
    kind: "program-root",
    occurrence,
  });
}

const INSTALLED_CAUSE = installedCause(AUTHORITY);
const SPEC = {
  capacity: { kind: "unbounded" },
  id: "focus",
  initial: { kind: "empty" },
  kind: "count",
  recoveries: [],
} as const satisfies ResourceSpec;
const RESOURCE = {
  kind: "pool",
  owner: SELF,
  resourceId: "focus",
} as const satisfies ResourceRef;

function alive(current = 10): CreatureVitals {
  return {
    hitPoints: {
      current,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  };
}

function world(): Readonly<MechanicsWorld> {
  const state = createEmptyCharacterMaterialState(1, MATERIAL, alive());
  const creature = (id: string, ordinal: number) => ({
    availability: "present" as const,
    controller: null,
    exhaustion: 0 as const,
    kind: "creature" as const,
    label: id,
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
      kind: "catalogue-monster" as const,
      monsterId: id,
    },
    vitals: alive(),
  });
  const parsed = parseMechanicsWorld({
    documents: [
      {
        kind: "character",
        material: MATERIAL,
        state: {
          ...state,
          entities: { first: creature("first", 1), second: creature("second", 2) },
          nextEntityOrdinal: 3,
        },
      },
    ],
    scope: MATERIAL,
  });
  if (!parsed.ok) throw new Error(`invalid fixture: ${parsed.reason}`);
  return parsed.value;
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

function turnEconomyOperation(
  operationId: string,
  claimId: string,
  combatant: EntityRef = SELF
): Extract<MechanicsOperation, { readonly kind: "turn-economy-transition" }> {
  return {
    causeId: INSTALLED_CAUSE.causeId,
    combatant,
    command: { action: { kind: "magic" }, claimId, kind: "claim-action" },
    kind: "turn-economy-transition",
    operationId,
    projection: turnProjection(),
  };
}

function entityAvailabilityOperation(
  operationId: string,
  target: Exclude<EntityRef, { readonly entityId: "self" }>
): Extract<MechanicsOperation, { readonly kind: "entity-availability" }> {
  return {
    availability: "dismissed",
    causeId: INSTALLED_CAUSE.causeId,
    kind: "entity-availability",
    operationId,
    target,
  };
}

function programStepOrigin(
  stepId: (typeof STEP_IDS)[keyof typeof STEP_IDS],
  options: {
    execution?: number;
    root?: OccurrenceGenerationRef;
    slot?: number;
  } = {}
): ProgramStepOccurrenceOrigin {
  return {
    execution: options.execution ?? 1,
    kind: "program-step",
    phaseId: "invoke",
    root:
      options.root ??
      ({
        occurrence: { material: MATERIAL, occurrenceId: "root" },
        ordinal: 1,
      } as const),
    slot: options.slot ?? 1,
    stepId,
  };
}

function entityCreateOperation(
  operationId: string,
  target: Exclude<EntityRef, { readonly entityId: "self" }>,
  lifecycleOrdinal: number
): Extract<MechanicsOperation, { readonly kind: "entity-create" }> {
  return {
    causeId: INSTALLED_CAUSE.causeId,
    endRules: [],
    entity: target,
    kind: "entity-create",
    lifecycle: {
      occurrence: {
        material: target.material,
        occurrenceId: `${target.entityId}-lifecycle`,
      },
      ordinal: lifecycleOrdinal,
    },
    operationId,
    origin: programStepOrigin(STEP_IDS.entity, {
      root: {
        occurrence: { material: target.material, occurrenceId: "root" },
        ordinal: 1,
      },
    }),
    parent: {
      occurrence: { material: target.material, occurrenceId: "root" },
      ordinal: 1,
    },
    value: {
      controller: null,
      exhaustion: 0,
      kind: "creature",
      label: target.entityId,
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
        monsterId: target.entityId,
      },
      vitals: alive(),
    },
  };
}

function occurrenceCreateOperation(
  operationId: string,
  occurrenceId: string,
  ordinal: number
): Extract<MechanicsOperation, { readonly kind: "occurrence-create" }> {
  return {
    causeId: INSTALLED_CAUSE.causeId,
    conditionImmunityOverride: null,
    created: {
      occurrence: { material: MATERIAL, occurrenceId },
      ordinal,
    },
    kind: "occurrence-create",
    occurrence: {
      endRules: [],
      fact: { key: `fact-${occurrenceId}`, kind: "active-key" },
      kind: "standing",
      origin: programStepOrigin(STEP_IDS.standing),
      parentId: "root",
      target: FIRST,
    },
    operationId,
    parent: {
      occurrence: { material: MATERIAL, occurrenceId: "root" },
      ordinal: 1,
    },
  };
}

function encounterWorld(combatant: EntityRef = SELF): Readonly<MechanicsWorld> {
  const basis = world();
  const document = basis.documents[0];
  const economy = createTurnEconomyState("turn:1:1:1");
  if (document?.kind !== "character" || !economy) {
    throw new Error("encounter fixture");
  }
  const parsed = parseMechanicsWorld({
    ...basis,
    documents: [
      {
        ...document,
        state: {
          ...document.state,
          clockBinding: {
            ...document.state.clockBinding,
            encounter: { epoch: 1, material: MATERIAL },
          },
          encounter: {
            currentCombatantId: "hero",
            epoch: 1,
            nextCombatantOrdinal: 2,
            order: ["hero"],
            participants: {
              hero: {
                combatant,
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
        },
      },
    ],
  });
  if (!parsed.ok) throw new Error(`invalid encounter fixture: ${parsed.reason}`);
  return parsed.value;
}

function worldWithProgramRoot(nextOccurrenceOrdinal = 1): Readonly<MechanicsWorld> {
  const basis = world();
  const document = basis.documents[0];
  if (document?.kind !== "character") throw new Error("character fixture");
  const occurrences = addOccurrence(
    {
      nextOccurrenceOrdinal,
      occurrences: document.state.occurrences,
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
  const invoked = structuredClone(occurrences);
  const root = invoked.occurrences.root;
  if (!root || root.kind !== "program") throw new Error("program-root fixture");
  root.phaseState.invoke = { execution: 1, lastTriggerEventId: null };
  const parsed = parseMechanicsWorld({
    ...basis,
    documents: [{ ...document, state: { ...document.state, ...invoked } }],
  });
  if (!parsed.ok) throw new Error("program-root fixture");
  return parsed.value;
}

function worldWithAuthorityProgramRoot(
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  nextOccurrenceOrdinal = 1
): Readonly<MechanicsWorld> {
  const basis = world();
  const document = basis.documents[0];
  const program = authority.snapshot.program;
  if (document?.kind !== "character" || !program) {
    throw new Error("authority program-root fixture");
  }
  const occurrences = addOccurrence(
    {
      nextOccurrenceOrdinal,
      occurrences: document.state.occurrences,
    },
    "root",
    {
      authority,
      endRules: [],
      kind: "program",
      phaseState: Object.fromEntries(
        program.phases.map(({ phaseId }) => [
          phaseId,
          { execution: 0, lastTriggerEventId: null },
        ])
      ),
      registers: Object.fromEntries(
        program.registers.map(({ initial, registerId }) => [registerId, initial])
      ),
    }
  );
  const invoked = structuredClone(occurrences);
  const root = invoked.occurrences.root;
  const invocationPhase = program.phases.find(
    ({ trigger }) => trigger.kind === "invocation"
  );
  if (!root || root.kind !== "program" || !invocationPhase) {
    throw new Error("authority program invocation fixture");
  }
  root.phaseState[invocationPhase.phaseId] = {
    execution: 1,
    lastTriggerEventId: null,
  };
  const parsed = parseMechanicsWorld({
    ...basis,
    documents: [{ ...document, state: { ...document.state, ...invoked } }],
  });
  if (!parsed.ok) throw new Error(`authority program-root: ${parsed.reason}`);
  return parsed.value;
}

function authorityWithReactivePhase(
  trigger: Exclude<
    NonNullable<
      MechanicsProgramAuthorityReceipt["snapshot"]["program"]
    >["phases"][number]["trigger"],
    { readonly kind: "invocation" }
  >
): MechanicsProgramAuthorityReceipt {
  const program = conformMechanicsProgram({
    ...AUTHORITY.snapshot.program,
    phases: [
      ...AUTHORITY.snapshot.program.phases,
      { inputs: [], phaseId: "react", steps: [], trigger },
    ],
  });
  if (!program) throw new Error("reactive program fixture");
  return {
    ...AUTHORITY,
    anchors: { ...AUTHORITY.anchors, target: FIRST },
    snapshot: {
      ...AUTHORITY.snapshot,
      program,
    },
  };
}

function worldWithZeroedProgramRoot(): Readonly<MechanicsWorld> {
  const basis = world();
  const document = basis.documents[0];
  if (document?.kind !== "character") throw new Error("character fixture");
  const occurrences = addOccurrence(
    {
      nextOccurrenceOrdinal: document.state.nextOccurrenceOrdinal,
      occurrences: document.state.occurrences,
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
  const parsed = parseMechanicsWorld({
    ...basis,
    documents: [{ ...document, state: { ...document.state, ...occurrences } }],
  });
  if (!parsed.ok) throw new Error("zeroed program-root fixture");
  return parsed.value;
}

function occurrenceGeneration(
  value: Readonly<MechanicsWorld>,
  occurrenceId: string
): OccurrenceGenerationRef {
  const occurrence = value.documents[0]?.state.occurrences[occurrenceId];
  if (!occurrence) throw new Error("occurrence fixture");
  return {
    occurrence: { material: MATERIAL, occurrenceId },
    ordinal: occurrence.ordinal,
  };
}

function requestedRootWave(
  value: Readonly<MechanicsWorld>
): Readonly<MechanicsEndWaveReceipt> {
  const discovery = discoverMechanicsEndWave(value, {
    endRequests: [occurrenceGeneration(value, "root")],
  });
  if (discovery.status !== "discovered") throw new Error("end-wave fixture");
  return discovery.wave;
}

function dueRootWorld(): {
  readonly due: Readonly<MechanicsWorld>;
  readonly wave: Readonly<MechanicsEndWaveReceipt>;
} {
  const due = structuredClone(worldWithProgramRoot());
  const root = due.documents[0]?.state.occurrences.root;
  if (!root) throw new Error("program-root fixture");
  const boundary = {
    clock: { epoch: 0, material: MATERIAL },
    elapsedSeconds: 0,
    kind: "time-reached",
  } as const;
  root.endRules = [boundary];
  const discovery = discoverMechanicsEndWave(due, { boundaries: [boundary] });
  if (discovery.status !== "discovered") throw new Error("deadline-wave fixture");
  return { due: discovery.world, wave: discovery.wave };
}

function damageOperation(
  operationId: string,
  target: EntityRef,
  packetId = `packet-${operationId}`,
  amounts: readonly number[] = [3],
  options: {
    readonly attacker?: EntityRef | null;
    readonly criticalHit?: boolean;
    readonly delivery?: "attack" | "automatic" | "saving-throw";
  } = {}
): Extract<MechanicsOperation, { kind: "creature-damage" }> {
  const resolved = resolveDamage(
    {
      delivery: options.delivery ?? "saving-throw",
      packetId,
      parts: amounts.map((amount, index) => ({
        amount,
        damageType: index === 0 ? "fire" : "force",
        partId: `part-${index}`,
      })),
      target,
      traits: ["spell"],
    },
    { damageThreshold: null, rules: [] },
    []
  );
  if (!resolved || resolved.kind !== "resolved") throw new Error("damage fixture");
  return {
    attacker: options.attacker ?? null,
    causeId: INSTALLED_CAUSE.causeId,
    criticalHit: options.criticalHit ?? false,
    damage: resolved.resolution,
    kind: "creature-damage",
    maximumHitPoints: { kind: "material" },
    operationId,
    zeroHitPointsPolicy: "dying",
  };
}

function resourceOperation(
  operationId: string,
  kind: "gain" | "spend",
  amount: number
): Extract<MechanicsOperation, { kind: "resource-transition" }> {
  return {
    bindings: {},
    causeId: INSTALLED_CAUSE.causeId,
    kind: "resource-transition",
    operationId,
    resource: RESOURCE,
    spec: SPEC,
    transition: { amount, kind },
  };
}

function group(
  proposals: readonly {
    operation: MechanicsOperation;
    proposalId: string;
  }[]
) {
  return { groupId: "group-1", proposals };
}

function causalState(value: unknown = world()): Readonly<MechanicsCausalState> {
  const result = beginMechanicsCausalState(value);
  if (!result.ok) throw new Error(`invalid causal fixture: ${result.reason}`);
  return result.value;
}

function createFrame(
  value: Readonly<MechanicsWorld>,
  root: Readonly<OccurrenceGenerationRef>
): Readonly<MechanicsExecutionFrame> {
  const document = value.documents.find(
    ({ material }) =>
      JSON.stringify(material) === JSON.stringify(root.occurrence.material)
  );
  if (!document) throw new Error("program-frame material fixture");
  return {
    authority: AUTHORITY,
    invocation: {
      installation: AUTHORITY.installation,
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

function pushedFrame(
  state: Readonly<MechanicsCausalState>,
  root: Readonly<OccurrenceGenerationRef>
) {
  const frame = createFrame(state.world, root);
  const pushed = pushMechanicsPendingFrame(state, frame);
  if (!pushed.ok) throw new Error(`pending-frame fixture: ${pushed.reason}`);
  return { frame, state: pushed.value } as const;
}

function pendingAtStep(
  state: Readonly<MechanicsCausalState>,
  frame: Readonly<MechanicsExecutionFrame>,
  stepId: string
): Readonly<MechanicsCausalState> {
  const phase = frame.authority.snapshot.program?.phases.find(
    ({ phaseId }) => phaseId === frame.rootReceipt.next.phaseId
  );
  const target = phase?.steps.findIndex((step) => step.stepId === stepId) ?? -1;
  if (!phase || target < 0) throw new Error(`missing authored step: ${stepId}`);
  let current = state;
  for (let index = 0; index < target; index += 1) {
    const advanced = advanceMechanicsPendingFrameStep(current, frame);
    if (!advanced.ok) throw new Error(`pending-step fixture: ${advanced.reason}`);
    current = advanced.value;
  }
  return current;
}

function pendingAtPhaseTransition(
  state: Readonly<MechanicsCausalState>,
  frame: Readonly<MechanicsExecutionFrame>
): Readonly<MechanicsCausalState> {
  let current = state;
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

function context(
  ordering: unknown = null,
  causes: readonly MechanicsOperationCause[] = [INSTALLED_CAUSE],
  overrides: {
    readonly authoritySnapshot?: Readonly<MechanicsAuthoritySnapshot>;
    readonly state?: Readonly<MechanicsCausalState>;
  } = {}
) {
  return {
    actionId: "action-1",
    actor: SELF,
    authoritySnapshot: overrides.authoritySnapshot ?? authoritySnapshotFor(causes),
    causes,
    factGuards: [],
    ordering,
    state: overrides.state ?? causalState(),
  };
}

function emitDamage(state: Readonly<MechanicsCausalState>, operationId: string) {
  const result = simulateResolutionGroup(
    {
      groupId: `emit-${operationId}`,
      proposals: [
        {
          operation: damageOperation(operationId, FIRST),
          proposalId: operationId,
        },
      ],
    },
    context(null, [INSTALLED_CAUSE], { state })
  );
  if (result.status !== "simulated") throw new Error("damage emission fixture");
  const emission = result.emissions.find(({ event }) => event.kind === "damage-taken");
  if (!emission) throw new Error("damage emission fixture");
  return { emission, state: result.state } as const;
}

function programRootCreateOperation(
  occurrenceId = "root"
): Extract<MechanicsOperation, { kind: "program-root-create" }> {
  return {
    causeId: INSTALLED_CAUSE.causeId,
    endRules: [],
    kind: "program-root-create",
    materialEpoch: 0,
    operationId: `create-${occurrenceId}`,
    root: {
      occurrence: { material: MATERIAL, occurrenceId },
      ordinal: 1,
    },
  };
}

function programPhaseTransitionOperation(
  root: OccurrenceGenerationRef
): Extract<MechanicsOperation, { kind: "program-phase-transition" }> {
  const cause = programRootCause(root);
  return {
    causeId: cause.causeId,
    expected: { execution: 0, phaseId: "invoke", triggerEventId: null },
    kind: "program-phase-transition",
    next: { execution: 1, phaseId: "invoke", triggerEventId: null },
    operationId: "commit-invoke",
    root,
  };
}

describe("simultaneous resolution groups", () => {
  it("keeps Fireball targets disjoint against one immutable basis", () => {
    const basis = world();
    const value = {
      groupId: "fireball",
      proposals: [
        { operation: damageOperation("damage-a", FIRST), proposalId: "target-a" },
        { operation: damageOperation("damage-b", SECOND), proposalId: "target-b" },
      ],
    };
    const result = analyzeResolutionGroup(value);
    expect(result.kind).toBe("disjoint");
    expect(JSON.stringify(basis)).toBe(JSON.stringify(world()));
  });

  it("collides turn claims on the one combatant ledger and emits no post-event", () => {
    const first = turnEconomyOperation("turn-a", "cast-a");
    const second = turnEconomyOperation("turn-b", "cast-b");
    expect(
      analyzeResolutionGroup(
        group([
          { operation: first, proposalId: "a" },
          { operation: second, proposalId: "b" },
        ])
      )
    ).toMatchObject({
      kind: "needs-ordering",
      partitions: [{ proposalIds: ["a", "b"] }],
    });

    const basis = encounterWorld();
    const result = simulateResolutionGroup(
      group([{ operation: first, proposalId: "a" }]),
      context(null, [INSTALLED_CAUSE], { state: causalState(basis) })
    );
    expect(result).toMatchObject({ emissions: [], status: "simulated" });
  });

  it("orders a null-controller entity creation before a link to that generation", () => {
    const created = {
      entityId: "created",
      material: MATERIAL,
      ordinal: 3,
    } as const;
    const create = entityCreateOperation("create-null-controller", created, 2);
    const link = {
      causeId: INSTALLED_CAUSE.causeId,
      controller: SELF,
      kind: "entity-controller",
      operationId: "link-created",
      target: created,
    } as const satisfies MechanicsOperation;

    expect(
      analyzeResolutionGroup(
        group([
          { operation: create, proposalId: "create" },
          { operation: link, proposalId: "link" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
  });

  it("orders damage and turn claims against dismissal dependencies", () => {
    const dismissal = entityAvailabilityOperation("dismiss-first", FIRST);
    expect(
      analyzeResolutionGroup(
        group([
          { operation: damageOperation("damage-first", FIRST), proposalId: "damage" },
          { operation: dismissal, proposalId: "dismiss" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
    expect(
      analyzeResolutionGroup(
        group([
          {
            operation: turnEconomyOperation("turn-first", "claim-first", FIRST),
            proposalId: "claim",
          },
          { operation: dismissal, proposalId: "dismiss" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
  });

  it("orders shared-lease dismissal against persistent clock-bound creation", () => {
    const dismissal = entityAvailabilityOperation("dismiss-shared-participant", FIRST);
    const timed = occurrenceCreateOperation("create-timed", "timed-effect", 2);
    const timedCreate = {
      ...timed,
      occurrence: {
        ...timed.occurrence,
        endRules: [
          {
            clock: { epoch: 1, material: SHARED },
            elapsedSeconds: 60,
            kind: "time-reached",
          },
        ],
      },
    } as const satisfies MechanicsOperation;
    expect(
      analyzeResolutionGroup(
        group([
          { operation: dismissal, proposalId: "dismiss" },
          { operation: timedCreate, proposalId: "create" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
  });

  it("propagates the exact complete-turn boundary before current dismissal", () => {
    const basis = encounterWorld(FIRST);
    const result = simulateResolutionGroup(
      group([
        {
          operation: entityAvailabilityOperation("dismiss-current", FIRST),
          proposalId: "dismiss-current",
        },
      ]),
      context(null, [INSTALLED_CAUSE], { state: causalState(basis) })
    );
    expect(result).toMatchObject({
      boundary: { excludeCurrent: FIRST, kind: "complete-turn", material: MATERIAL },
      operationId: "dismiss-current",
      orderedProposalIds: ["dismiss-current"],
      status: "needs-boundary",
    });
  });

  it("keeps shared availability reads disjoint when their write slots differ", () => {
    const damage = damageOperation("damage-reader", FIRST);
    const claim = turnEconomyOperation("turn-reader", "claim-reader", FIRST);
    const damageAccess = mechanicsOperationAccessFootprint(damage);
    const claimAccess = mechanicsOperationAccessFootprint(claim);
    expect(
      damageAccess.reads.filter((key) => claimAccess.reads.includes(key))
    ).not.toHaveLength(0);
    expect(
      damageAccess.semanticWrites.filter((key) =>
        claimAccess.semanticWrites.includes(key)
      )
    ).toEqual([]);

    expect(
      analyzeResolutionGroup(
        group([
          { operation: damage, proposalId: "damage-reader" },
          { operation: claim, proposalId: "turn-reader" },
        ])
      )
    ).toMatchObject({ collisionKeys: [], kind: "disjoint" });
  });

  it("canonically orders allocator writes without requesting a table decision", () => {
    const first = programRootCreateOperation("first-root");
    const second = {
      ...programRootCreateOperation("second-root"),
      root: {
        occurrence: { material: MATERIAL, occurrenceId: "second-root" },
        ordinal: 2,
      },
    } as const satisfies MechanicsOperation;
    const result = analyzeResolutionGroup(
      group([
        { operation: second, proposalId: "z-second" },
        { operation: first, proposalId: "a-first" },
      ])
    );
    expect(result).toMatchObject({
      kind: "disjoint",
      partitions: [
        {
          proposalIds: ["a-first", "z-second"],
        },
      ],
    });

    const effects = analyzeResolutionGroup(
      group([
        {
          operation: occurrenceCreateOperation("effect-second", "effect-second", 3),
          proposalId: "z-effect-second",
        },
        {
          operation: occurrenceCreateOperation("effect-first", "effect-first", 2),
          proposalId: "a-effect-first",
        },
      ])
    );
    expect(effects).toMatchObject({
      kind: "disjoint",
      partitions: [
        {
          proposalIds: ["a-effect-first", "z-effect-second"],
        },
      ],
    });
    if (effects.kind !== "disjoint") return;
    expect(effects.partitions[0]?.collisionKeys).toHaveLength(1);
  });

  it("keeps allocator precedence inside a mixed semantic component", () => {
    const first = occurrenceCreateOperation("create-a", "effect-a", 2);
    const second = occurrenceCreateOperation("create-b", "effect-b", 3);
    const endFirst = {
      causeId: INSTALLED_CAUSE.causeId,
      kind: "occurrence-end",
      occurrence: first.created,
      operationId: "end-a",
    } as const satisfies MechanicsOperation;
    const value = group([
      { operation: second, proposalId: "create-b" },
      { operation: endFirst, proposalId: "end-a" },
      { operation: first, proposalId: "create-a" },
    ]);
    const pending = analyzeResolutionGroup(value);
    expect(pending.kind).toBe("needs-ordering");
    if (pending.kind !== "needs-ordering") return;
    expect(pending.partitions).toHaveLength(1);
    expect(pending.partitions[0]).toMatchObject({
      orderingPartitions: [{ proposalIds: ["create-a", "end-a"] }],
      technicalPrecedence: [
        { afterProposalId: "create-b", beforeProposalId: "create-a" },
      ],
    });
    expect(pending.requestId).toBeDefined();

    const request = pending.partitions[0]?.orderingPartitions[0];
    if (!request) return;
    const valid = orderResolutionPartitions(pending, {
      kind: "ordering",
      partitions: [
        { collisionKey: request.collisionKey, proposalIds: ["create-a", "end-a"] },
      ],
      requestId: pending.requestId,
    });
    expect(valid?.[0]?.proposalIds).toEqual(["create-a", "create-b", "end-a"]);

    const reversedSemantic = orderResolutionPartitions(pending, {
      kind: "ordering",
      partitions: [
        { collisionKey: request.collisionKey, proposalIds: ["end-a", "create-a"] },
      ],
      requestId: pending.requestId,
    });
    expect(reversedSemantic?.[0]?.proposalIds).toEqual(["end-a", "create-a", "create-b"]);
    expect(
      orderResolutionPartitions(pending, {
        kind: "ordering",
        partitions: [
          {
            collisionKey: request.collisionKey,
            proposalIds: ["create-b", "create-a", "end-a"],
          },
        ],
        requestId: pending.requestId,
      })
    ).toBeNull();
  });

  it("orders effect creators that inspect or rewrite the same target projection", () => {
    const create = (
      operationId: string,
      occurrenceId: string,
      ordinal: number,
      kind: "condition" | "concentration" | "polymorph-form"
    ): Extract<MechanicsOperation, { readonly kind: "occurrence-create" }> => ({
      causeId: INSTALLED_CAUSE.causeId,
      conditionImmunityOverride: null,
      created: {
        occurrence: { material: MATERIAL, occurrenceId },
        ordinal,
      },
      kind: "occurrence-create",
      occurrence:
        kind === "condition"
          ? {
              conditionId: "poisoned",
              endRules: [],
              kind,
              origin: programStepOrigin(STEP_IDS.condition),
              parentId: "root",
              target: FIRST,
            }
          : kind === "polymorph-form"
            ? {
                endRules: [],
                formId: occurrenceId,
                kind,
                origin: programStepOrigin(STEP_IDS.polymorph),
                parentId: "root",
                target: FIRST,
              }
            : {
                endRules: [],
                kind,
                origin: programStepOrigin(STEP_IDS.concentration),
                parentId: "root",
                target: FIRST,
              },
      operationId,
      parent: {
        occurrence: { material: MATERIAL, occurrenceId: "root" },
        ordinal: 1,
      },
    });
    for (const pair of [
      [
        create("condition", "condition", 2, "condition"),
        create("concentration", "concentration", 3, "concentration"),
      ],
      [
        create("form-a", "form-a", 2, "polymorph-form"),
        create("form-b", "form-b", 3, "polymorph-form"),
      ],
    ] as const) {
      expect(
        analyzeResolutionGroup(
          group([
            { operation: pair[0], proposalId: "a" },
            { operation: pair[1], proposalId: "b" },
          ])
        )
      ).toMatchObject({ kind: "needs-ordering" });
    }
  });

  it("models temporary-hit-point sources and the whole enchantment graph", () => {
    const source = {
      occurrence: { material: MATERIAL, occurrenceId: "source" },
      ordinal: 4,
    } as const;
    const grant = {
      causeId: INSTALLED_CAUSE.causeId,
      grant: { amount: 5, decision: "replace", sourceOccurrence: source },
      kind: "temporary-hit-points-grant",
      operationId: "grant-thp",
      target: FIRST,
    } as const satisfies MechanicsOperation;
    const sourceEnd = {
      causeId: INSTALLED_CAUSE.causeId,
      kind: "occurrence-end",
      occurrence: source,
      operationId: "end-source",
    } as const satisfies MechanicsOperation;
    const sourceCreate = {
      ...occurrenceCreateOperation("create-thp-source", "source", 4),
      occurrence: {
        ...occurrenceCreateOperation("create-thp-source", "source", 4).occurrence,
        endRules: [{ kind: "temporary-hp-empty" }],
      },
    } as const satisfies MechanicsOperation;
    expect(
      analyzeResolutionGroup(
        group([
          { operation: sourceCreate, proposalId: "create" },
          { operation: grant, proposalId: "grant" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
    expect(
      analyzeResolutionGroup(
        group([
          { operation: grant, proposalId: "grant" },
          { operation: sourceEnd, proposalId: "end" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });

    const item = (instanceId: string, instanceOrdinal: number) => ({
      instanceId,
      instanceOrdinal,
      owner: MATERIAL,
    });
    const transition = (
      operationId: string,
      target: ReturnType<typeof item>,
      bearer: ReturnType<typeof item> | null,
      value: number
    ) =>
      ({
        causeId: INSTALLED_CAUSE.causeId,
        change: { kind: "quantity", value },
        enchantmentBearer: bearer,
        item: target,
        kind: "inventory-transition",
        operationId,
      }) as const satisfies MechanicsOperation;
    const endX = transition("end-x", item("x", 1), item("y", 2), 0);
    const mutateY = transition("mutate-y", item("y", 2), null, 2);
    const equipY = {
      ...mutateY,
      change: { kind: "equipped", value: true },
      operationId: "equip-y",
    } as const satisfies MechanicsOperation;
    expect(
      analyzeResolutionGroup(
        group([
          { operation: endX, proposalId: "end-x" },
          { operation: mutateY, proposalId: "mutate-y" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
    expect(
      analyzeResolutionGroup(
        group([
          { operation: endX, proposalId: "end-x" },
          { operation: equipY, proposalId: "equip-y" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
  });

  it("models exact sources embedded in newly created entities", () => {
    const source = {
      occurrence: { material: MATERIAL, occurrenceId: "entity-thp-source" },
      ordinal: 4,
    } as const;
    const creature = entityCreateOperation(
      "create-sourced-creature",
      {
        entityId: "sourced-creature",
        material: MATERIAL,
        ordinal: 3,
      },
      5
    );
    const sourcedCreature = {
      ...creature,
      value: {
        ...creature.value,
        vitals: {
          ...creature.value.vitals,
          hitPoints: {
            ...creature.value.vitals.hitPoints,
            temporary: { current: 3, sourceOccurrence: source },
          },
        },
      },
    } as const satisfies MechanicsOperation;
    const endSource = {
      causeId: INSTALLED_CAUSE.causeId,
      kind: "occurrence-end",
      occurrence: source,
      operationId: "end-entity-thp-source",
    } as const satisfies MechanicsOperation;
    expect(
      analyzeResolutionGroup(
        group([
          { operation: sourcedCreature, proposalId: "create-creature" },
          { operation: endSource, proposalId: "end-source" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });

    const linkedItem = {
      instanceId: "animated-item",
      instanceOrdinal: 9,
      owner: MATERIAL,
    } as const;
    const linkedObject = {
      ...entityCreateOperation(
        "create-linked-object",
        { entityId: "linked-object", material: MATERIAL, ordinal: 3 },
        5
      ),
      value: {
        controller: null,
        kind: "object",
        label: "linked-object",
        overrides: {
          armorClass: null,
          damageDefenseProfile: null,
          hitPointMaximum: null,
          magical: null,
          materials: null,
          size: null,
        },
        resources: {},
        template: { kind: "inventory-item", ...linkedItem },
        vitals: { hitPoints: { current: 5 } },
      },
    } as const satisfies MechanicsOperation;
    const mutateItem = {
      causeId: INSTALLED_CAUSE.causeId,
      change: { kind: "equipped", value: true },
      enchantmentBearer: null,
      item: linkedItem,
      kind: "inventory-transition",
      operationId: "equip-animated-item",
    } as const satisfies MechanicsOperation;
    expect(
      analyzeResolutionGroup(
        group([
          { operation: linkedObject, proposalId: "create-object" },
          { operation: mutateItem, proposalId: "mutate-item" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
  });

  it("orders every controller graph rewrite, including distinct target writes", () => {
    const controller = SELF;
    const change = (
      operationId: string,
      target: EntityRef
    ): Extract<MechanicsOperation, { kind: "entity-controller" }> => {
      if (target.entityId === "self") throw new Error("material target fixture");
      return {
        causeId: INSTALLED_CAUSE.causeId,
        controller,
        kind: "entity-controller",
        operationId,
        target,
      };
    };
    expect(
      analyzeResolutionGroup(
        group([
          { operation: change("first-controller", FIRST), proposalId: "first" },
          { operation: change("second-controller", SECOND), proposalId: "second" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
    expect(
      analyzeResolutionGroup(
        group([
          { operation: change("first-controller-a", FIRST), proposalId: "a" },
          { operation: change("first-controller-b", FIRST), proposalId: "b" },
        ])
      )
    ).toMatchObject({ kind: "needs-ordering" });
  });

  it("orders Unicode partitions by code unit without consulting the host locale", () => {
    const value = group([
      {
        operation: damageOperation("danno-é", { ...FIRST, entityId: "éclair" }),
        proposalId: "bersaglio-é",
      },
      {
        operation: damageOperation("danno-Ω", { ...SECOND, entityId: "Ωmega" }),
        proposalId: "bersaglio-Ω",
      },
    ]);
    const localeCompare = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(() => {
        throw new Error("locale collation must not order mechanics receipts");
      });
    try {
      const result = analyzeResolutionGroup(value);
      expect(result.kind).toBe("disjoint");
      if (result.kind !== "disjoint") return;
      const collisionKeys = result.partitions.map(
        ({ collisionKeys: [collisionKey] }) => collisionKey
      );
      expect(collisionKeys).toEqual([...collisionKeys].sort());
    } finally {
      localeCompare.mockRestore();
    }
  });

  it("simulates a disjoint group without drafting an action or cleaning its world", () => {
    const basis = world();
    const result = simulateResolutionGroup(
      {
        groupId: "fireball",
        proposals: [
          { operation: damageOperation("damage-a", FIRST), proposalId: "target-a" },
          { operation: damageOperation("damage-b", SECOND), proposalId: "target-b" },
        ],
      },
      context(null, [INSTALLED_CAUSE], { state: causalState(basis) })
    );
    expect(result).toMatchObject({ status: "simulated" });
    if (result.status !== "simulated") return;
    expect(result).not.toHaveProperty("action");
    expect(result.stages).toHaveLength(2);
    expect(result.transaction.causes).toEqual([INSTALLED_CAUSE]);
    expect(
      result.transaction.operations.every(
        ({ causeId }) => causeId === INSTALLED_CAUSE.causeId
      )
    ).toBe(true);
    const damageEvents = result.emissions
      .map(({ event }) => event)
      .filter((event) => event.kind === "damage-taken");
    expect(
      damageEvents.map(({ resolution }) => resolution.packet.target.entityId).sort()
    ).toEqual(["first", "second"]);
    expect(JSON.stringify(basis)).toBe(JSON.stringify(world()));
  });

  it("creates a zeroed program root and emits only the separate phase commit event", () => {
    const createRoot = programRootCreateOperation();
    const phase = programPhaseTransitionOperation(createRoot.root);
    const rootCause = programRootCause(createRoot.root);
    const allocation = simulateMechanicsTransaction(
      {
        actionId: "program-root-create",
        actor: SELF,
        causes: [INSTALLED_CAUSE],
        factGuards: [],
        operations: [createRoot],
      },
      {
        authoritySnapshot: authoritySnapshotFor([INSTALLED_CAUSE]),
        state: causalState(),
      }
    );
    expect(allocation.status).toBe("simulated");
    if (allocation.status !== "simulated") return;
    expect(deriveMechanicsPostEventEmissions(allocation.stages)).toEqual([]);
    expect(allocation.state.world.documents[0]?.state.occurrences.root).toMatchObject({
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
    });

    const pending = pushedFrame(allocation.state, createRoot.root);
    const phaseState = pendingAtPhaseTransition(pending.state, pending.frame);
    const result = simulateMechanicsTransaction(
      {
        actionId: "program-phase",
        actor: SELF,
        causes: [rootCause],
        factGuards: [],
        operations: [phase],
      },
      {
        authoritySnapshot: authoritySnapshotFor([rootCause]),
        state: phaseState,
      }
    );
    expect(result).toMatchObject({ status: "simulated" });
    if (result.status !== "simulated") return;
    expect(allocation.stages[0]?.execution).toMatchObject({
      facts: { root: createRoot.root },
      kind: "program-root-create",
    });
    expect(
      deriveMechanicsPostEventEmissions(result.stages).map(({ event }) => event)
    ).toEqual([
      {
        eventId: `event:${canonicalFingerprint({
          kind: "program-phase-end",
          operationId: phase.operationId,
          subject: {
            execution: 1,
            occurrence: createRoot.root,
            phaseId: "invoke",
          },
        })}`,
        execution: 1,
        kind: "program-phase-end",
        occurrence: createRoot.root,
        operationId: phase.operationId,
        phaseId: "invoke",
      },
    ]);
    const root = result.state.world.documents[0]?.state.occurrences.root;
    expect(root).toMatchObject({
      authority: AUTHORITY,
      kind: "program",
      phaseState: { invoke: { execution: 1, lastTriggerEventId: null } },
      registers: {},
    });
    expect(root).not.toHaveProperty("target");
    expect(topMechanicsPendingFrame(result.state)?.cursor).toEqual({
      stage: "phase-complete",
    });
    expect(popMechanicsPendingFrame(result.state, pending.frame).ok).toBe(true);
  });

  it("keeps a phase child readable through its exact phase commit", () => {
    const createRoot = programRootCreateOperation();
    const rootCause = programRootCause(createRoot.root);
    const phase = programPhaseTransitionOperation(createRoot.root);
    const baseChild = occurrenceCreateOperation("create-phase-child", "phase-child", 2);
    const createChild = {
      ...baseChild,
      causeId: rootCause.causeId,
    } as const satisfies MechanicsOperation;
    const allocation = simulateMechanicsTransaction(
      {
        actionId: "phase-child-root",
        actor: SELF,
        causes: [INSTALLED_CAUSE],
        factGuards: [],
        operations: [createRoot],
      },
      {
        authoritySnapshot: authoritySnapshotFor([INSTALLED_CAUSE]),
        state: causalState(),
      }
    );
    expect(allocation.status).toBe("simulated");
    if (allocation.status !== "simulated") return;
    const pending = pushedFrame(allocation.state, createRoot.root);
    const childState = pendingAtStep(pending.state, pending.frame, STEP_IDS.standing);
    const childResult = simulateMechanicsTransaction(
      {
        actionId: "phase-child",
        actor: SELF,
        causes: [rootCause],
        factGuards: [],
        operations: [createChild],
      },
      {
        authoritySnapshot: authoritySnapshotFor([rootCause]),
        state: childState,
      }
    );
    expect(childResult.status).toBe("simulated");
    if (childResult.status !== "simulated") return;
    expect(
      childResult.state.world.documents[0]?.state.occurrences["phase-child"]?.ending
    ).toBeNull();
    const phaseState = pendingAtPhaseTransition(childResult.state, pending.frame);
    const result = simulateMechanicsTransaction(
      {
        actionId: "phase-child-commit",
        actor: SELF,
        causes: [rootCause],
        factGuards: [],
        operations: [phase],
      },
      {
        authoritySnapshot: authoritySnapshotFor([rootCause]),
        state: phaseState,
      }
    );
    expect(result).toMatchObject({ status: "simulated" });
    if (result.status !== "simulated") return;
    expect(
      result.state.world.documents[0]?.state.occurrences["phase-child"]?.ending
    ).toBeNull();
  });

  it("returns an exact occurrence-end consequence without removing or announcing the source", () => {
    const basis = worldWithProgramRoot();
    const occurrence = occurrenceGeneration(basis, "root");
    const operation = {
      causeId: INSTALLED_CAUSE.causeId,
      kind: "occurrence-end",
      occurrence,
      operationId: "request-root-end",
    } as const satisfies MechanicsOperation;
    const result = simulateResolutionGroup(
      {
        groupId: "request-root-end",
        proposals: [{ operation, proposalId: "root-end" }],
      },
      context(null, [INSTALLED_CAUSE], { state: causalState(basis) })
    );

    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    expect(result).not.toHaveProperty("action");
    const definition = authorityDefinition(AUTHORITY);
    expect(result.actionFacts).toEqual([
      ...definition.definitionGuards,
      ...definition.installationGuards,
    ]);
    expect(result.consequences).toEqual([
      {
        causeId: INSTALLED_CAUSE.causeId,
        kind: "occurrence-end",
        occurrence,
        operationId: "request-root-end",
      },
    ]);
    expect(result.emissions).toEqual([]);
    expect(occurrenceGeneration(result.state.world, "root")).toEqual(occurrence);
  });

  it("does not invent an event for a condition projection change", () => {
    const basis = worldWithZeroedProgramRoot();
    const cause = programRootCause(occurrenceGeneration(basis, "root"));
    const operation = {
      causeId: cause.causeId,
      conditionImmunityOverride: null,
      created: {
        occurrence: { material: MATERIAL, occurrenceId: "blind-first" },
        ordinal: 2,
      },
      kind: "occurrence-create",
      occurrence: {
        conditionId: "blinded",
        endRules: [],
        kind: "condition",
        origin: programStepOrigin(STEP_IDS.condition, {
          root: occurrenceGeneration(basis, "root"),
        }),
        parentId: "root",
        target: FIRST,
      },
      operationId: "create-blind-first",
      parent: occurrenceGeneration(basis, "root"),
    } as const satisfies MechanicsOperation;
    const pending = pushedFrame(causalState(basis), occurrenceGeneration(basis, "root"));
    const result = simulateResolutionGroup(
      {
        groupId: "condition-effect",
        proposals: [{ operation, proposalId: "condition" }],
      },
      context(null, [cause], {
        state: pendingAtStep(pending.state, pending.frame, STEP_IDS.condition),
      })
    );
    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    expect(result.emissions).toEqual([]);
  });

  it("requires ordering for two damage packets against the same target", () => {
    const result = analyzeResolutionGroup(
      group([
        { operation: damageOperation("damage-a", FIRST), proposalId: "a" },
        { operation: damageOperation("damage-b", FIRST), proposalId: "b" },
      ])
    );
    expect(result.kind).toBe("needs-ordering");
    if (result.kind !== "needs-ordering") return;
    const collision = result.partitions.find(({ proposalIds }) => proposalIds.length > 1);
    expect(collision).toBeDefined();
    const observation = {
      kind: "ordering" as const,
      partitions: [
        { collisionKey: collision?.collisionKeys[0] ?? "", proposalIds: ["b", "a"] },
      ],
      requestId: result.requestId,
    };
    expect(orderResolutionPartitions(result, observation)?.[0]?.proposalIds).toEqual([
      "b",
      "a",
    ]);
  });

  it("suspends before a collision and applies only the exact observed order", () => {
    const value = group([
      { operation: damageOperation("damage-a", FIRST), proposalId: "a" },
      { operation: damageOperation("damage-b", FIRST), proposalId: "b" },
    ]);
    const pending = simulateResolutionGroup(value, context());
    expect(pending.status).toBe("needs-ordering");
    if (pending.status !== "needs-ordering") return;
    const ordering = {
      kind: "ordering" as const,
      partitions: pending.request.partitions.map((partition) => ({
        collisionKey: partition.collisionKey,
        proposalIds: ["b", "a"],
      })),
      requestId: pending.request.requestId,
    };
    const simulated = simulateResolutionGroup(value, context(ordering));
    expect(simulated.status).toBe("simulated");
    if (simulated.status !== "simulated") return;
    expect(simulated.orderedProposalIds).toEqual(["b", "a"]);
    expect(simulated.emissions.map(({ event }) => event.operationId)).toEqual([
      "damage-b",
      "damage-a",
    ]);
  });

  it("rejects unsolicited ordering and aborts an invalid group without changing its basis", () => {
    const disjoint = group([
      { operation: damageOperation("damage-a", FIRST), proposalId: "a" },
    ]);
    expect(
      simulateResolutionGroup(
        disjoint,
        context({ kind: "ordering", partitions: [], requestId: "stale" })
      )
    ).toMatchObject({ reason: "unexpected-ordering", status: "rejected" });

    const basis = world();
    const missing = {
      entityId: "missing",
      material: MATERIAL,
      ordinal: 99,
    } as const satisfies EntityRef;
    expect(
      simulateResolutionGroup(
        {
          groupId: "atomic-rejection",
          proposals: [
            { operation: damageOperation("valid", FIRST), proposalId: "valid" },
            { operation: damageOperation("invalid", missing), proposalId: "invalid" },
          ],
        },
        context(null, [INSTALLED_CAUSE], { state: causalState(basis) })
      )
    ).toMatchObject({ reason: "missing-target", status: "rejected" });
    expect(JSON.stringify(basis)).toBe(JSON.stringify(world()));
  });

  it("rejects missing, forged, excess, and unused authority causes at the context boundary", () => {
    const operation = damageOperation("damage", FIRST);
    const value = group([{ operation, proposalId: "damage" }]);
    const missingCauses = { ...context(), causes: undefined };
    expect(simulateResolutionGroup(value, missingCauses)).toMatchObject({
      reason: "invalid-context",
      status: "rejected",
    });
    expect(simulateResolutionGroup(value, { ...context(), causes: [] })).toMatchObject({
      reason: "invalid-context",
      status: "rejected",
    });
    expect(
      simulateResolutionGroup(value, {
        ...context(),
        causes: [
          {
            ...INSTALLED_CAUSE,
            causeId: canonicalFingerprint({ forged: true }),
          },
        ],
      })
    ).toMatchObject({ reason: "invalid-context", status: "rejected" });
    expect(
      simulateResolutionGroup(value, { ...context(), unexpected: true })
    ).toMatchObject({
      reason: "invalid-context",
      status: "rejected",
    });

    const unused = installedCause({
      ...AUTHORITY,
      staticBindings: { unused: 1 },
    });
    const causes = [INSTALLED_CAUSE, unused].sort((left, right) =>
      compareCodeUnits(left.causeId, right.causeId)
    );
    expect(simulateResolutionGroup(value, context(null, causes))).toMatchObject({
      reason: "invalid-context",
      status: "rejected",
    });
  });

  it("rejects an installed cause when the trusted authority snapshot is empty", () => {
    const operation = damageOperation("damage", FIRST);
    expect(
      simulateResolutionGroup(
        group([{ operation, proposalId: "damage" }]),
        context(null, [INSTALLED_CAUSE], {
          authoritySnapshot: { definitions: [] },
        })
      )
    ).toMatchObject({
      operationId: operation.operationId,
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("keeps one multipart damage packet as one proposal", () => {
    const result = analyzeResolutionGroup(
      group([
        {
          operation: damageOperation("mixed", FIRST, "mixed-packet", [3, 4]),
          proposalId: "mixed",
        },
      ])
    );
    expect(result).toMatchObject({
      kind: "disjoint",
      partitions: [{ proposalIds: ["mixed"] }],
    });
  });

  it("emits one authentic damage event from its exact transaction stage", () => {
    const basis = world();
    const operation = damageOperation("mixed", FIRST, "mixed-packet", [3, 4]);
    const simulationContext = context();
    const result = simulateResolutionGroup(
      {
        groupId: "mixed-damage",
        proposals: [{ operation, proposalId: "mixed" }],
      },
      { ...simulationContext, state: causalState(basis) }
    );

    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    expect(result.stages).toHaveLength(1);
    const stage = result.stages[0];
    expect(stage).toBeDefined();
    if (!stage) return;
    expect(stage.execution).toBe(result.executions[0]);
    expect(stage.before).toEqual(basis);
    expect(stage.after).toEqual(result.state.world);
    expect(stage.before).not.toEqual(stage.after);
    expect(stage.before).toEqual(result.stages[0]?.before);
    expect(stage.after).toEqual(result.state.world);
    expect(result.emissions.map(({ event }) => event)).toMatchObject([
      {
        attacker: null,
        criticalHit: false,
        kind: "damage-taken",
        resolution: {
          packet: {
            packetId: "mixed-packet",
            target: FIRST,
          },
        },
      },
    ]);
  });

  it("derives phase completion after every ordinary event in the exact segment sequence", () => {
    const createRoot = programRootCreateOperation();
    const phase = programPhaseTransitionOperation(createRoot.root);
    const rootCause = programRootCause(createRoot.root);
    const allocation = simulateMechanicsTransaction(
      {
        actionId: "root-allocate",
        actor: SELF,
        causes: [INSTALLED_CAUSE],
        factGuards: [],
        operations: [createRoot],
      },
      {
        authoritySnapshot: authoritySnapshotFor([INSTALLED_CAUSE]),
        state: causalState(),
      }
    );
    expect(allocation.status).toBe("simulated");
    if (allocation.status !== "simulated") return;
    const pending = pushedFrame(allocation.state, createRoot.root);
    const damage = damageOperation("damage-after-root", FIRST);
    const damaged = simulateMechanicsTransaction(
      {
        actionId: "damage-after-root",
        actor: SELF,
        causes: [INSTALLED_CAUSE],
        factGuards: [],
        operations: [damage],
      },
      {
        authoritySnapshot: authoritySnapshotFor([INSTALLED_CAUSE]),
        state: pending.state,
      }
    );
    expect(damaged.status).toBe("simulated");
    if (damaged.status !== "simulated") return;
    const phaseState = pendingAtPhaseTransition(damaged.state, pending.frame);
    const simulation = simulateMechanicsTransaction(
      {
        actionId: "commit-root",
        actor: SELF,
        causes: [rootCause],
        factGuards: [],
        operations: [phase],
      },
      {
        authoritySnapshot: authoritySnapshotFor([rootCause]),
        state: phaseState,
      }
    );
    expect(simulation.status).toBe("simulated");
    if (simulation.status !== "simulated") return;
    const stages = [...allocation.stages, ...damaged.stages, ...simulation.stages];
    expect(stages.map(({ execution }) => execution.kind)).toEqual([
      "program-root-create",
      "creature-damage",
      "program-phase-transition",
    ]);

    const emissions = deriveMechanicsPostEventEmissions(stages);
    expect(emissions.map(({ event }) => event.kind)).toEqual([
      "damage-taken",
      "program-phase-end",
    ]);
    expect(emissions.at(-1)?.event).toEqual({
      eventId: `event:${canonicalFingerprint({
        kind: "program-phase-end",
        operationId: phase.operationId,
        subject: {
          execution: 1,
          occurrence: createRoot.root,
          phaseId: "invoke",
        },
      })}`,
      execution: 1,
      kind: "program-phase-end",
      occurrence: createRoot.root,
      operationId: phase.operationId,
      phaseId: "invoke",
    });
    expect(Object.isFrozen(emissions)).toBe(true);
    expect(emissions[0]?.emissionWorld).toBe(damaged.stages[0]?.after);
    expect(emissions[1]?.emissionWorld).toBe(simulation.stages[0]?.after);
  });

  it("carries authoritative attacker/critical evidence into one damage event", () => {
    const operation = damageOperation("strike", FIRST, "strike-packet", [5], {
      attacker: SECOND,
      criticalHit: true,
      delivery: "attack",
    });
    const result = simulateResolutionGroup(
      {
        groupId: "strike-damage",
        proposals: [{ operation, proposalId: "strike" }],
      },
      context()
    );
    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    expect(result.emissions.map(({ event }) => event)).toEqual([
      expect.objectContaining({
        attacker: SECOND,
        criticalHit: true,
        kind: "damage-taken",
      }),
    ]);
  });

  it("binds damage event identity to the full resolution, attacker, and critical fact", () => {
    const damageEventId = (
      operation: Extract<MechanicsOperation, { kind: "creature-damage" }>
    ): string => {
      const result = simulateResolutionGroup(
        {
          groupId: "damage-event-identity",
          proposals: [{ operation, proposalId: "damage" }],
        },
        context()
      );
      if (result.status !== "simulated") throw new Error("damage must simulate");
      const event = result.emissions
        .map(({ event }) => event)
        .find(({ kind }) => kind === "damage-taken");
      if (!event) throw new Error("damage event must exist");
      return event.eventId;
    };

    const identities = [
      damageEventId(
        damageOperation("same-operation", FIRST, "same-packet", [5], {
          delivery: "attack",
        })
      ),
      damageEventId(
        damageOperation("same-operation", FIRST, "same-packet", [5], {
          attacker: SECOND,
          delivery: "attack",
        })
      ),
      damageEventId(
        damageOperation("same-operation", FIRST, "same-packet", [5], {
          criticalHit: true,
          delivery: "attack",
        })
      ),
      damageEventId(
        damageOperation("same-operation", FIRST, "same-packet", [6], {
          delivery: "attack",
        })
      ),
    ];

    expect(new Set(identities).size).toBe(identities.length);
  });

  it("freezes a canonical subscriber audience on the event's own emission world", () => {
    const authority = authorityWithReactivePhase({
      kind: "damage-taken",
      target: "target",
    });
    const basis = worldWithAuthorityProgramRoot(authority);
    const result = simulateResolutionGroup(
      {
        groupId: "freeze-damage-audience",
        proposals: [
          {
            operation: damageOperation("audience-damage", FIRST),
            proposalId: "damage",
          },
        ],
      },
      context(null, [INSTALLED_CAUSE], { state: causalState(basis) })
    );
    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    const emission = result.emissions.find(({ event }) => event.kind === "damage-taken");
    expect(emission?.emissionWorld).toBe(result.stages[0]?.after);
    if (!emission) return;

    const audience = selectMechanicsEventSubscribers(emission);
    expect(audience).toMatchObject({
      selections: [
        {
          eventId: emission.event.eventId,
          phaseId: "react",
          root: occurrenceGeneration(basis, "root"),
        },
      ],
      status: "selected",
    });
    if (audience.status !== "selected" || !audience.selections[0]) return;
    const reread = selectMechanicsEventSubscribers(emission);
    expect(reread).toBe(audience);
    const selection = audience.selections[0];
    for (const hostile of [
      structuredClone(selection),
      {
        eventId: selection.eventId,
        phaseId: selection.phaseId,
        root: selection.root,
      },
    ]) {
      expect(dispatchMechanicsEventSubscriber(hostile, result.state)).toEqual({
        reason: "invalid-selection",
        status: "rejected",
      });
    }
    const dispatched = dispatchMechanicsEventSubscriber(selection, result.state);
    expect(dispatched).toMatchObject({
      frame: {
        rootReceipt: {
          expected: { execution: 0, triggerEventId: null },
          next: { execution: 1, triggerEventId: emission.event.eventId },
        },
      },
      state: {
        context: {
          pendingFrames: [{ selectedEvent: true }],
        },
      },
      status: "dispatched",
    });
    if (dispatched.status !== "dispatched") return;
    expect(
      pushMechanicsSelectedEventPendingFrame(result.state, dispatched.frame, selection)
    ).toEqual({ ok: false, reason: "invalid-transition" });
    expect(
      dispatchMechanicsEventSubscriber(
        reread.status === "selected" ? reread.selections[0] : null,
        result.state
      )
    ).toEqual({ reason: "invalid-selection", status: "rejected" });
    expect(selectMechanicsEventSubscribers(structuredClone(emission))).toEqual({
      reason: "invalid-emission",
      status: "rejected",
    });
  });

  it("event audience adversarial: dispatches after the selected root becomes readable-ending", () => {
    const authority = authorityWithReactivePhase({
      kind: "damage-taken",
      target: "target",
    });
    const emitted = emitDamage(
      causalState(worldWithAuthorityProgramRoot(authority)),
      "ending-after-emission"
    );
    const audience = selectMechanicsEventSubscribers(emitted.emission);
    if (audience.status !== "selected" || !audience.selections[0]) {
      throw new Error("event audience fixture");
    }
    const root = audience.selections[0].root;
    const latched = rebaseMechanicsCausalState(
      emitted.state.world,
      emitted.state,
      [],
      [root]
    );
    if (!latched.ok) throw new Error("readable-ending fixture");
    expect(
      latched.value.world.documents[0]?.state.occurrences.root?.ending
    ).not.toBeNull();

    expect(
      dispatchMechanicsEventSubscriber(audience.selections[0], latched.value)
    ).toMatchObject({
      frame: {
        rootReceipt: {
          next: { triggerEventId: emitted.emission.event.eventId },
          root,
        },
      },
      state: { context: { pendingFrames: [{ selectedEvent: true }] } },
      status: "dispatched",
    });
  });

  it("event audience adversarial: rejects a selected root generation after ABA replacement", () => {
    const authority = authorityWithReactivePhase({
      kind: "damage-taken",
      target: "target",
    });
    const emitted = emitDamage(
      causalState(worldWithAuthorityProgramRoot(authority)),
      "before-root-aba"
    );
    const audience = selectMechanicsEventSubscribers(emitted.emission);
    if (audience.status !== "selected" || !audience.selections[0]) {
      throw new Error("event audience fixture");
    }
    const replacement = worldWithAuthorityProgramRoot(authority, 2);
    expect(occurrenceGeneration(replacement, "root").ordinal).toBe(2);

    expect(
      dispatchMechanicsEventSubscriber(audience.selections[0], causalState(replacement))
    ).toEqual({ reason: "stale-subscriber", status: "rejected" });
  });

  it("event audience adversarial: allocates successive live phase CAS receipts", () => {
    const authority = authorityWithReactivePhase({
      kind: "damage-taken",
      target: "target",
    });
    const firstEmission = emitDamage(
      causalState(worldWithAuthorityProgramRoot(authority)),
      "phase-cas-first"
    );
    const secondEmission = emitDamage(firstEmission.state, "phase-cas-second");
    const firstAudience = selectMechanicsEventSubscribers(firstEmission.emission);
    const secondAudience = selectMechanicsEventSubscribers(secondEmission.emission);
    if (
      firstAudience.status !== "selected" ||
      secondAudience.status !== "selected" ||
      !firstAudience.selections[0] ||
      !secondAudience.selections[0]
    ) {
      throw new Error("event audience fixture");
    }

    const first = dispatchMechanicsEventSubscriber(
      firstAudience.selections[0],
      secondEmission.state
    );
    if (first.status !== "dispatched") throw new Error("first dispatch fixture");
    expect(first.frame.rootReceipt).toMatchObject({
      expected: { execution: 0, triggerEventId: null },
      next: { execution: 1, triggerEventId: firstEmission.emission.event.eventId },
    });
    const reviewed = reviewMechanicsIntent(
      { actionId: "complete-first-subscriber", factGuards: [], frame: first.frame },
      [],
      first.state
    );
    if (reviewed.status !== "reviewed") throw new Error("first review fixture");
    const committed = compileMechanicsFrame({
      authoritySnapshot: { definitions: [] },
      continuation: null,
      facts: [],
      turnEconomy: [],
      responses: [],
      reviewed: reviewed.reviewed,
      state: first.state,
    });
    if (committed.status !== "compiled") throw new Error("first commit fixture");
    const popped = popMechanicsPendingFrame(committed.segment.state, first.frame);
    if (!popped.ok) throw new Error("first pop fixture");

    const second = dispatchMechanicsEventSubscriber(
      secondAudience.selections[0],
      popped.value
    );
    expect(second).toMatchObject({
      frame: {
        rootReceipt: {
          expected: {
            execution: 1,
            triggerEventId: firstEmission.emission.event.eventId,
          },
          next: {
            execution: 2,
            triggerEventId: secondEmission.emission.event.eventId,
          },
        },
      },
      status: "dispatched",
    });
  });

  it("event audience adversarial: excludes a root installed only after emission", () => {
    const authority = authorityWithReactivePhase({
      kind: "damage-taken",
      target: "target",
    });
    const emitted = emitDamage(causalState(), "before-subscriber-install");
    const audience = selectMechanicsEventSubscribers(emitted.emission);
    expect(audience).toMatchObject({ selections: [], status: "selected" });
    const cause = installedCause(authority);
    const installed = simulateMechanicsTransaction(
      {
        actionId: "install-after-emission",
        actor: SELF,
        causes: [cause],
        factGuards: [],
        operations: [{ ...programRootCreateOperation(), causeId: cause.causeId }],
      },
      {
        authoritySnapshot: authoritySnapshotFor([cause]),
        state: emitted.state,
      }
    );
    expect(installed.status).toBe("simulated");
    if (installed.status !== "simulated") return;
    expect(installed.state.world.documents[0]?.state.occurrences.root).toBeDefined();
    expect(selectMechanicsEventSubscribers(emitted.emission)).toBe(audience);
    expect(audience).toMatchObject({ selections: [], status: "selected" });
  });

  it("keeps emission-time eligibility after an earlier mutation invalidates the live predicate", () => {
    const authority = authorityWithReactivePhase({
      kind: "hit-points-zero",
      target: "target",
    });
    const basis = worldWithAuthorityProgramRoot(authority);
    const damaged = simulateResolutionGroup(
      {
        groupId: "zero-before-heal",
        proposals: [
          {
            operation: damageOperation("drop-target", FIRST, "drop-packet", [10]),
            proposalId: "damage",
          },
        ],
      },
      context(null, [INSTALLED_CAUSE], { state: causalState(basis) })
    );
    expect(damaged.status).toBe("simulated");
    if (damaged.status !== "simulated") return;
    const emission = damaged.emissions.find(
      ({ event }) => event.kind === "hit-points-zero"
    );
    if (!emission) throw new Error("zero-hit-point emission fixture");
    const audience = selectMechanicsEventSubscribers(emission);
    expect(audience.status).toBe("selected");
    if (audience.status !== "selected" || !audience.selections[0]) return;

    const healed = simulateMechanicsTransaction(
      {
        actionId: "heal-before-subscriber",
        actor: SELF,
        causes: [INSTALLED_CAUSE],
        factGuards: [],
        operations: [
          {
            causeId: INSTALLED_CAUSE.causeId,
            input: { amount: 1, maximumHitPoints: 10 },
            kind: "creature-healing",
            maximumHitPointsSource: { kind: "fact" },
            operationId: "heal-target",
            target: FIRST,
          },
        ],
      },
      {
        authoritySnapshot: authoritySnapshotFor([INSTALLED_CAUSE]),
        state: damaged.state,
      }
    );
    expect(healed.status).toBe("simulated");
    if (healed.status !== "simulated") return;

    const dispatched = dispatchMechanicsEventSubscriber(
      audience.selections[0],
      healed.state
    );
    expect(dispatched).toMatchObject({
      state: { context: { pendingFrames: [{ selectedEvent: true }] } },
      status: "dispatched",
    });
    if (dispatched.status !== "dispatched") return;
    const subscriberIntent = {
      actionId: "zero-subscriber",
      factGuards: [],
      frame: dispatched.frame,
    } as const;
    expect(deriveMechanicsRequirements(subscriberIntent, dispatched.state)).toMatchObject(
      { status: "derived" }
    );
    expect(reviewMechanicsIntent(subscriberIntent, [], dispatched.state)).toMatchObject({
      status: "reviewed",
    });
  });

  it("selects the owning root's source-end phase while that root is readable-ending", () => {
    const authority = authorityWithReactivePhase({ kind: "source-end" });
    const before = worldWithAuthorityProgramRoot(authority);
    const root = occurrenceGeneration(before, "root");
    const latched = rebaseMechanicsCausalState(before, causalState(before), [], [root]);
    expect(latched.ok).toBe(true);
    if (!latched.ok || !latched.value.context.endWave) return;
    const derived = deriveMechanicsSourceEndingEvents(
      latched.value.world,
      latched.value.context.endWave.wave,
      "source-end-audience"
    );
    expect(derived.status).toBe("derived");
    if (derived.status !== "derived") return;
    const emission = derived.emissions[0];
    expect(emission?.emissionWorld).toBe(latched.value.world);
    if (!emission) return;

    const audience = selectMechanicsEventSubscribers(emission);
    expect(audience).toMatchObject({
      selections: [
        {
          eventId: emission.event.eventId,
          phaseId: "react",
          root,
        },
      ],
      status: "selected",
    });
    if (audience.status !== "selected" || !audience.selections[0]) return;
    const dispatched = dispatchMechanicsEventSubscriber(
      audience.selections[0],
      latched.value
    );
    expect(dispatched).toMatchObject({
      state: {
        context: { pendingFrames: [{ selectedEvent: true }] },
      },
      status: "dispatched",
    });
    if (dispatched.status !== "dispatched") return;
    if (dispatched.frame.rootReceipt.kind !== "advance") {
      throw new Error("event subscriber must advance an existing root");
    }
    expect(finalizeMechanicsCausalEndWave(dispatched.state)).toEqual({
      ok: false,
      reason: "invalid-end-wave",
    });

    const subscriberIntent = {
      actionId: "source-end-handler",
      factGuards: [],
      frame: dispatched.frame,
    } as const;
    const reviewed = reviewMechanicsIntent(subscriberIntent, [], dispatched.state);
    expect(reviewed.status).toBe("reviewed");
    if (reviewed.status !== "reviewed") return;
    const committed = compileMechanicsFrame({
      authoritySnapshot: { definitions: [] },
      continuation: null,
      facts: [],
      turnEconomy: [],
      responses: [],
      reviewed: reviewed.reviewed,
      state: dispatched.state,
    });
    expect(committed.status).toBe("compiled");
    if (committed.status !== "compiled") return;
    expect(topMechanicsPendingFrame(committed.segment.state)).toMatchObject({
      cursor: { stage: "phase-complete" },
      selectedEvent: true,
    });
    expect(finalizeMechanicsCausalEndWave(committed.segment.state)).toEqual({
      ok: false,
      reason: "invalid-end-wave",
    });
    const popped = popMechanicsPendingFrame(committed.segment.state, dispatched.frame);
    expect(popped.ok).toBe(true);
    if (!popped.ok) return;
    const finalized = finalizeMechanicsCausalEndWave(popped.value);
    expect(finalized.ok).toBe(true);
    if (!finalized.ok) return;
    expect(finalized.value.world.documents[0]?.state.occurrences).not.toHaveProperty(
      "root"
    );
  });

  it("event audience adversarial: routes an ending child to its active owning root", () => {
    const authority = authorityWithReactivePhase({ kind: "source-end" });
    const basis = worldWithAuthorityProgramRoot(authority);
    const document = basis.documents[0];
    if (document?.kind !== "character") throw new Error("child source fixture");
    const childState = addOccurrence(
      {
        nextOccurrenceOrdinal: document.state.nextOccurrenceOrdinal,
        occurrences: document.state.occurrences,
      },
      "ending-child",
      occurrenceCreateOperation("create-ending-child", "ending-child", 2).occurrence
    );
    const parsed = parseMechanicsWorld({
      ...basis,
      documents: [{ ...document, state: { ...document.state, ...childState } }],
    });
    if (!parsed.ok) throw new Error("child source fixture");
    const root = occurrenceGeneration(parsed.value, "root");
    const child = occurrenceGeneration(parsed.value, "ending-child");
    const latched = rebaseMechanicsCausalState(
      parsed.value,
      causalState(parsed.value),
      [],
      [child]
    );
    if (!latched.ok || !latched.value.context.endWave) {
      throw new Error("child ending fixture");
    }
    expect(latched.value.world.documents[0]?.state.occurrences.root?.ending).toBeNull();
    expect(
      latched.value.world.documents[0]?.state.occurrences["ending-child"]?.ending
    ).not.toBeNull();
    const derived = deriveMechanicsSourceEndingEvents(
      latched.value.world,
      latched.value.context.endWave.wave,
      "ending-child-wave"
    );
    if (derived.status !== "derived" || !derived.emissions[0]) {
      throw new Error("child source emission fixture");
    }
    expect(derived.emissions[0].event.occurrence).toEqual(child);

    expect(selectMechanicsEventSubscribers(derived.emissions[0])).toMatchObject({
      selections: [{ phaseId: "react", root }],
      status: "selected",
    });
  });

  it("delivers source-ending while readable before exact finalization", () => {
    const before = worldWithProgramRoot();
    const occurrence = occurrenceGeneration(before, "root");
    const wave = requestedRootWave(before);
    const sourceEnding = deriveMechanicsSourceEndingEvents(before, wave, "end-wave");
    expect(sourceEnding).toMatchObject({
      emissions: [
        {
          event: {
            kind: "source-ending",
            occurrence,
            operationId: "end-wave",
          },
        },
      ],
      status: "derived",
    });
    expect(before.documents[0]?.state.occurrences.root).toBeDefined();
    const latched = latchMechanicsEndWave(before, wave);
    expect(latched.status).toBe("latched");
    if (latched.status === "rejected") return;
    const current = discoverMechanicsEndWave(latched.world, wave.request);
    expect(current.status).toBe("discovered");
    if (current.status === "rejected") return;
    const finalized = finalizeMechanicsEndWave(latched.world, current.wave);
    expect(finalized.status).toBe("applied");
    if (finalized.status === "rejected") return;
    expect(finalized.world.documents[0]?.state.occurrences).not.toHaveProperty("root");
  });

  it("derives source-ending from a proved readable checkpoint that is not a closed world", () => {
    const { due, wave } = dueRootWorld();
    expect(parseMechanicsWorld(due)).toMatchObject({
      ok: false,
      reason: "invalid-clock",
    });

    expect(deriveMechanicsSourceEndingEvents(due, wave, "deadline-wave")).toMatchObject({
      emissions: [
        {
          event: {
            kind: "source-ending",
            occurrence: occurrenceGeneration(due, "root"),
          },
        },
      ],
      status: "derived",
    });
    expect(due.documents[0]?.state.occurrences.root).toBeDefined();
  });

  it("does not accept a caller-serialized causal context in place of kernel state", () => {
    const { due, wave } = dueRootWorld();
    const operation = damageOperation("damage-during-ending", FIRST);
    const serialized = {
      ...context(),
      causal: {
        endWave: { wave, world: due },
        request: wave.request,
      },
    };
    Reflect.deleteProperty(serialized, "state");
    expect(
      simulateResolutionGroup(
        {
          groupId: "damage-during-ending",
          proposals: [{ operation, proposalId: "damage" }],
        },
        serialized
      )
    ).toMatchObject({ reason: "invalid-context", status: "rejected" });
  });

  it("refuses raw, forged, excess, and stale end-wave evidence", () => {
    const before = worldWithProgramRoot();
    const wave = requestedRootWave(before);
    const forged = {
      ...wave,
      candidates: wave.candidates.map((candidate) => ({
        ...candidate,
        causes: [{ kind: "concentration-broken" as const }],
      })),
    };

    for (const hostile of [wave.candidates, forged, { ...wave, excess: true }]) {
      expect(
        deriveMechanicsSourceEndingEvents(before, hostile, "end-wave")
      ).toMatchObject({ reason: "invalid-end-wave", status: "rejected" });
    }
    expect(
      deriveMechanicsSourceEndingEvents(worldWithProgramRoot(2), wave, "end-wave")
    ).toMatchObject({ reason: "invalid-end-wave", status: "rejected" });
  });

  it("binds delayed event ids to the exact occurrence ordinal", () => {
    const first = worldWithProgramRoot(1);
    const second = worldWithProgramRoot(2);
    const firstEvents = deriveMechanicsSourceEndingEvents(
      first,
      requestedRootWave(first),
      "end-wave"
    );
    const secondEvents = deriveMechanicsSourceEndingEvents(
      second,
      requestedRootWave(second),
      "end-wave"
    );
    expect(firstEvents.status).toBe("derived");
    expect(secondEvents.status).toBe("derived");
    if (firstEvents.status !== "derived" || secondEvents.status !== "derived") return;
    expect(firstEvents.emissions[0]?.event).toMatchObject({
      occurrence: { ordinal: 1 },
    });
    expect(secondEvents.emissions[0]?.event).toMatchObject({
      occurrence: { ordinal: 2 },
    });
    expect(firstEvents.emissions[0]?.event.eventId).not.toBe(
      secondEvents.emissions[0]?.event.eventId
    );
  });

  it("requires table ordering even when colliding resource arithmetic commutes", () => {
    expect(
      analyzeResolutionGroup(
        group([
          { operation: resourceOperation("spend-a", "spend", 1), proposalId: "a" },
          { operation: resourceOperation("spend-b", "spend", 2), proposalId: "b" },
        ])
      ).kind
    ).toBe("needs-ordering");
    expect(
      analyzeResolutionGroup(
        group([
          { operation: resourceOperation("spend", "spend", 1), proposalId: "a" },
          { operation: resourceOperation("gain", "gain", 1), proposalId: "b" },
        ])
      ).kind
    ).toBe("needs-ordering");
  });

  it("rejects invalid ordering permutations", () => {
    const request = {
      partitions: [
        {
          collisionKey: "vitals:x",
          proposalIds: ["a", "b"],
        },
      ],
      requestId: "ordering-request",
    };
    expect(
      conformOrderingObservation(
        {
          kind: "ordering",
          partitions: [{ collisionKey: "vitals:x", proposalIds: ["a", "a"] }],
          requestId: "ordering-request",
        },
        request
      )
    ).toBeNull();
    expect(
      conformOrderingObservation(
        {
          kind: "ordering",
          partitions: [{ collisionKey: "vitals:x", proposalIds: ["a", "b"] }],
          requestId: "wrong",
        },
        request
      )
    ).toBeNull();
  });

  it("rejects hostile excess, prototype, sparse, duplicate, and excessive inputs", () => {
    const operation = damageOperation("damage", FIRST);
    expect(
      conformResolutionGroup({
        ...group([{ operation, proposalId: "a" }]),
        excess: true,
      })
    ).toBeNull();
    const hostile = Object.create(null) as Record<string, unknown>;
    hostile.groupId = "group";
    hostile.proposals = [{ operation, proposalId: "a" }];
    expect(conformResolutionGroup(hostile)).toBeNull();
    const sparse = Array(1) as unknown[];
    expect(conformResolutionGroup({ groupId: "group", proposals: sparse })).toBeNull();
    const proposalGetter = vi.fn(() => ({ operation, proposalId: "a" }));
    const hostileProposals = Array(1) as unknown[];
    Object.defineProperty(hostileProposals, "0", {
      enumerable: true,
      get: proposalGetter,
    });
    expect(
      conformResolutionGroup({ groupId: "group", proposals: hostileProposals })
    ).toBeNull();
    expect(proposalGetter).not.toHaveBeenCalled();
    expect(
      conformResolutionGroup(
        group([
          { operation, proposalId: "same" },
          { operation: damageOperation("other", SECOND), proposalId: "same" },
        ])
      )
    ).toBeNull();
    expect(
      conformResolutionGroup({
        groupId: "group",
        proposals: Array.from({ length: 513 }, (_, index) => ({
          operation: damageOperation(`damage-${index}`, FIRST),
          proposalId: `proposal-${index}`,
        })),
      })
    ).toBeNull();
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile group proxy");
        },
      }
    );
    expect(conformResolutionGroup(proxy)).toBeNull();
    expect(analyzeResolutionGroup(proxy)).toEqual({
      kind: "rejected",
      reason: "invalid-group",
    });
    expect(simulateResolutionGroup(proxy, context())).toEqual({
      operationId: null,
      reason: "invalid-group",
      status: "rejected",
    });
    const groupGet = vi.fn((_target: object, property: PropertyKey) =>
      property === "proposals"
        ? Array.from({ length: 513 }, (_, index) => ({
            operation: damageOperation(`proxy-damage-${index}`, FIRST),
            proposalId: `proxy-proposal-${index}`,
          }))
        : (Reflect.get(_target, property) as unknown)
    );
    const stableGroup = new Proxy(group([{ operation, proposalId: "a" }]), {
      get: groupGet,
    });
    expect(conformResolutionGroup(stableGroup)).not.toBeNull();
    expect(groupGet).not.toHaveBeenCalled();
    expect(
      simulateResolutionGroup(
        group([{ operation, proposalId: "a" }]),
        new Proxy(
          {},
          {
            ownKeys() {
              throw new Error("hostile context proxy");
            },
          }
        )
      )
    ).toEqual({ operationId: null, reason: "invalid-context", status: "rejected" });
  });

  it("rejects hostile ordering arrays without invoking accessors", () => {
    const request = {
      partitions: [
        {
          collisionKey: "vitals:x",
          proposalIds: ["a", "b"],
        },
      ],
      requestId: "ordering-request",
    };
    const partitionGetter = vi.fn(() => ({
      collisionKey: "vitals:x",
      proposalIds: ["a", "b"],
    }));
    const hostilePartitions = Array(1) as unknown[];
    Object.defineProperty(hostilePartitions, "0", {
      enumerable: true,
      get: partitionGetter,
    });
    expect(
      conformOrderingObservation(
        {
          kind: "ordering",
          partitions: hostilePartitions,
          requestId: request.requestId,
        },
        request
      )
    ).toBeNull();
    expect(partitionGetter).not.toHaveBeenCalled();

    const proposalIdGetter = vi.fn(() => "a");
    const hostileProposalIds = ["a", "b"] as unknown[];
    Object.defineProperty(hostileProposalIds, "0", {
      enumerable: true,
      get: proposalIdGetter,
    });
    expect(
      conformOrderingObservation(
        {
          kind: "ordering",
          partitions: [{ collisionKey: "vitals:x", proposalIds: hostileProposalIds }],
          requestId: request.requestId,
        },
        request
      )
    ).toBeNull();
    expect(proposalIdGetter).not.toHaveBeenCalled();

    const getTrap = vi.fn((_target: object, property: PropertyKey) =>
      property === "proposalIds"
        ? ["b", "a"]
        : (Reflect.get(_target, property) as unknown)
    );
    const mutableView = new Proxy(
      { collisionKey: "vitals:x", proposalIds: ["a", "b"] },
      { get: getTrap }
    );
    expect(
      conformOrderingObservation(
        {
          kind: "ordering",
          partitions: [mutableView],
          requestId: request.requestId,
        },
        request
      )
    ).toEqual({
      kind: "ordering",
      partitions: [{ collisionKey: "vitals:x", proposalIds: ["a", "b"] }],
      requestId: request.requestId,
    });
    expect(getTrap).not.toHaveBeenCalled();
  });

  it("rejects a hostile nested ordering entry without invoking its getter", () => {
    const value = group([
      { operation: damageOperation("damage-a", FIRST), proposalId: "a" },
      { operation: damageOperation("damage-b", FIRST), proposalId: "b" },
    ]);
    const pending = simulateResolutionGroup(value, context());
    expect(pending.status).toBe("needs-ordering");
    if (pending.status !== "needs-ordering") return;
    const getter = vi.fn(() => {
      throw new Error("hostile nested getter");
    });
    const hostile = {} as Record<string, unknown>;
    Object.defineProperty(hostile, "collisionKey", {
      enumerable: true,
      get: getter,
    });
    Object.defineProperty(hostile, "proposalIds", {
      enumerable: true,
      value: ["a", "b"],
    });
    const result = simulateResolutionGroup(
      value,
      context({
        kind: "ordering",
        partitions: [hostile],
        requestId: pending.request.requestId,
      })
    );
    expect(result).toMatchObject({ reason: "invalid-ordering", status: "rejected" });
    expect(getter).not.toHaveBeenCalled();

    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile nested proxy");
        },
      }
    );
    expect(
      simulateResolutionGroup(
        value,
        context({
          kind: "ordering",
          partitions: [proxy],
          requestId: pending.request.requestId,
        })
      )
    ).toMatchObject({ reason: "invalid-ordering", status: "rejected" });
  });

  it("returns a stable deterministic analysis", () => {
    const value = group([
      { operation: damageOperation("second", SECOND), proposalId: "z" },
      { operation: damageOperation("first", FIRST), proposalId: "a" },
    ]);
    expect(analyzeResolutionGroup(value)).toEqual(
      analyzeResolutionGroup(structuredClone(value))
    );
  });
});
