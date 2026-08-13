import { describe, expect, it } from "vitest";

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
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import {
  conformMechanicsOperation,
  conformMechanicsTransaction,
  simulateMechanicsTransaction as simulateKernelTransaction,
} from "@/lib/mechanics-operation";
import {
  beginMechanicsCausalState,
  discoverMechanicsEndWave,
  parseMechanicsWorld,
} from "@/lib/mechanics-world";
import type { ActionFactGuard } from "@/types/action-journal";
import type { DamageDefenseRule, DamagePart, DamageResolution } from "@/types/damage";
import type { DiceFormula, DiceObservation } from "@/types/dice-formula";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type {
  CreatureMaterialEntity,
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
import type { MechanicsWorld } from "@/types/mechanics-world";
import type {
  ResourceInitializationObservations,
  ResourceRef,
  ResourceSpec,
} from "@/types/resource";
import type { CreatureVitals } from "@/types/vitals";

const CHARACTER = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const SELF = { entityId: "self", material: CHARACTER } as const satisfies EntityRef;
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
          steps: [],
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
          steps: [],
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
    parentId: "root",
    target: SELF,
  });
  return parsedCharacterState({ ...state, ...occurrences });
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
    parentId?: string;
    parentOrdinal?: number;
  } = {}
): MechanicsOperation {
  const cause = options.cause ?? INSTALLED_CAUSE;
  const parentId = options.parentId ?? "root";
  return {
    causeId: cause.causeId,
    conditionImmunityOverride,
    kind: "occurrence-create",
    material: CHARACTER,
    occurrence: {
      conditionId,
      endRules: [],
      kind: "condition",
      parentId,
      target: SELF,
    },
    occurrenceId,
    operationId,
    parent: occurrenceGeneration(parentId, options.parentOrdinal ?? 1),
  };
}

function programCreate(
  operationId: string,
  occurrenceId: string,
  cause: MechanicsOperationCause
): Extract<MechanicsOperation, { readonly kind: "occurrence-create" }> {
  return {
    causeId: cause.causeId,
    kind: "occurrence-create",
    material: CHARACTER,
    occurrence: {
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    },
    occurrenceId,
    operationId,
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
    kind: "occurrence-create",
    material: CHARACTER,
    occurrence: {
      endRules: [],
      fact: { key: occurrenceId, kind: "active-key" },
      kind: "standing",
      parentId,
      target: SELF,
    },
    occurrenceId,
    operationId,
    parent: occurrenceGeneration(parentId, parentOrdinal),
  };
}

function worldWithRoots(
  roots: readonly (readonly [string, MechanicsProgramAuthorityReceipt])[]
): Readonly<MechanicsWorld> {
  const state = structuredClone(
    createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
  );
  const occurrences = roots.reduce(
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
  return parsedCharacterState({ ...state, ...occurrences });
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

describe("atomic mechanics transactions", () => {
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
    const original = state(worldWithRoots([["root", AUTHORITY]]));
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
    expect(
      simulateKernelTransaction(
        transaction([exactOperation], { causes: [exactCause] }),
        emptyAuthorityContext(recreated)
      )
    ).toMatchObject({ status: "simulated" });

    const foe = { entityId: "foe", material: CHARACTER, ordinal: 1 } as const;
    const recreatedWithFoe = parsedCharacterState({
      ...structuredClone(state(recreated)),
      entities: { foe: creature(alive(10)) },
      nextEntityOrdinal: 2,
    });
    expect(
      simulateKernelTransaction(
        transaction([exactOperation], { actor: foe, causes: [exactCause] }),
        emptyAuthorityContext(recreatedWithFoe)
      )
    ).toEqual({
      operationId: "exact-root",
      reason: "invalid-cause",
      status: "rejected",
    });

    const staleCause = programRootCause(AUTHORITY, "root", 1);
    expect(
      simulateKernelTransaction(
        transaction([{ ...exactOperation, causeId: staleCause.causeId }], {
          causes: [staleCause],
        }),
        emptyAuthorityContext(recreated)
      )
    ).toEqual({
      operationId: "exact-root",
      reason: "invalid-cause",
      status: "rejected",
    });
  });

  it("derives durable root authority from an installed cause before creating effects", () => {
    const authority = authorityVariant(7);
    const installed = installedCause(authority);
    const rootCause = programRootCause(authority, "root");
    const root = programCreate("create-root", "root", installed);
    expect(root).not.toHaveProperty("authority");
    expect(root.occurrence).not.toHaveProperty("authority");
    expect(root).not.toHaveProperty("conditionImmunityOverride");
    expect(
      conformMechanicsOperation({
        ...root,
        occurrence: { ...root.occurrence, authority },
      })
    ).toBeNull();
    expect(
      conformMechanicsOperation({ ...root, parent: occurrenceGeneration("root", 1) })
    ).toBeNull();
    const effect = standingCreate("create-effect", "effect", "root", rootCause);
    expect(conformMechanicsOperation(effect)).toEqual(effect);
    const missingParent: Record<string, unknown> = { ...effect };
    delete missingParent.parent;
    expect(conformMechanicsOperation(missingParent)).toBeNull();

    const result = simulated(
      simulateMechanicsTransaction(
        parsedWorld(alive(10)),
        transaction([root, effect], { causes: orderedCauses(installed, rootCause) })
      )
    );
    expect(state(result.state.world).occurrences.root).toMatchObject({ authority });
    expect(state(result.state.world).occurrences.effect).toMatchObject({
      parentId: "root",
    });
    expect(result.executions[0]).toMatchObject({
      facts: { created: occurrenceGeneration("root", 1) },
    });
  });

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
      operationId: "child-first",
      reason: "invalid-cause",
      status: "rejected",
    });

    const rooted = worldWithRoots([["root", AUTHORITY]]);
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
    const before = worldWithRoots([
      ["causing-root", AUTHORITY],
      ["other-root", otherAuthority],
    ]);
    const cause = programRootCause(AUTHORITY, "causing-root");
    const ended = simulated(
      simulateMechanicsTransaction(
        before,
        transaction(
          [
            {
              causeId: cause.causeId,
              kind: "occurrence-end",
              occurrence: occurrenceGeneration("other-root", 2),
              operationId: "dispel-other",
            },
          ],
          { causes: [cause] }
        )
      )
    );
    expect(ended.state.world).toEqual(before);
    expect(state(ended.state.world).occurrences).toHaveProperty("causing-root");
    expect(state(ended.state.world).occurrences).toHaveProperty("other-root");
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
    const result = simulated(
      simulateMechanicsTransaction(
        concentratingWorld(alive(3)),
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
  });

  it("creates universal occurrences and defers their causal closure", () => {
    const paralyzed = simulated(
      simulateMechanicsTransaction(
        concentratingWorld(alive(10)),
        transaction([conditionCreate("paralyze", "paralysis", "paralyzed")])
      )
    );
    expect(Object.keys(state(paralyzed.state.world).occurrences)).toEqual([
      "root",
      "focus",
      "paralysis",
    ]);
    const paralyzeExecution = paralyzed.executions[0];
    expect(paralyzeExecution?.status).toBe("applied");
    if (paralyzeExecution?.status !== "applied") return;
    expect(paralyzeExecution.facts).toEqual({
      created: occurrenceGeneration("paralysis", 3),
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
    const immuneWorld = parsedCharacterState({ ...immuneState, ...tableRoot });
    expect(
      simulateMechanicsTransaction(
        immuneWorld,
        transaction([conditionCreate("poison", "poisoned", "poisoned")])
      )
    ).toMatchObject({
      executions: [{ reason: "condition-immune", status: "no-change" }],
      status: "no-change",
    });

    expect(
      simulateMechanicsTransaction(
        immuneWorld,
        transaction([
          conditionCreate("poison-override", "poisoned", "poisoned", {
            reasonId: "table-overrides-immunity",
          }),
        ])
      )
    ).toEqual({
      operationId: "poison-override",
      reason: "invalid-override",
      status: "rejected",
    });

    const tableCause = programRootCause(TABLE_AUTHORITY, "table-root", 3);
    const overridden = simulated(
      simulateMechanicsTransaction(
        immuneWorld,
        transaction(
          [
            conditionCreate(
              "table-poison-override",
              "poisoned",
              "poisoned",
              { reasonId: "table-overrides-immunity" },
              {
                cause: tableCause,
                parentId: "table-root",
                parentOrdinal: 3,
              }
            ),
          ],
          { actor: TABLE_OWNER, causes: [tableCause] }
        )
      )
    );
    expect(state(overridden.state.world).occurrences).toHaveProperty("poisoned");
  });

  it("defers occurrence closure and material cleanup to the higher-level executor", () => {
    const replacement: MechanicsOperation = {
      causeId: INSTALLED_CAUSE.causeId,
      conditionImmunityOverride: null,
      kind: "occurrence-create",
      material: CHARACTER,
      occurrence: {
        endRules: [],
        kind: "concentration",
        parentId: "root",
        target: SELF,
      },
      occurrenceId: "new-focus",
      operationId: "replace-focus",
      parent: occurrenceGeneration("root", 1),
    };
    const concentrating = concentratingWorld(alive(10));
    expect(
      simulateMechanicsTransaction(concentrating, transaction([replacement]))
    ).toEqual({
      operationId: "replace-focus",
      reason: "concentration-replacement-required",
      status: "rejected",
    });
    expect(
      simulateMechanicsTransaction(
        concentrating,
        transaction([
          {
            causeId: INSTALLED_CAUSE.causeId,
            kind: "occurrence-end",
            occurrence: occurrenceGeneration("focus", 2),
            operationId: "end-old-focus",
          },
          replacement,
        ])
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
      parentId: "root",
      target: SELF,
    });
    const cascadeWorld = parsedCharacterState({ ...rootState, ...child });
    const ended = simulated(
      simulateMechanicsTransaction(
        cascadeWorld,
        transaction([
          {
            causeId: INSTALLED_CAUSE.causeId,
            kind: "occurrence-end",
            occurrence: occurrenceGeneration("root", 1),
            operationId: "end-root",
          },
        ])
      )
    );
    expect(ended.state.world).toEqual(cascadeWorld);
    expect(ended.stages[0]?.after).toBe(ended.stages[0]?.before);
    expect(Object.keys(state(ended.state.world).occurrences)).toEqual(["root", "child"]);
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
      enchantInstanceId: null,
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
    const result = simulated(
      simulateMechanicsTransaction(
        before,
        transaction(
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
        )
      )
    );
    expect(state(result.state.world).inventory.potion?.quantity.current).toBe(0);
    expect(state(result.state.world).inventory).toHaveProperty("potion");
    expect(result).not.toHaveProperty("action");
  });

  it("rejects ABA reuse when one inventory id names a new physical ordinal", () => {
    const material = structuredClone(
      createEmptyCharacterMaterialState(1, CHARACTER, alive(10))
    );
    material.inventory.wand = {
      attuned: false,
      definition: { itemId: "wand-of-magic-missiles", kind: "catalogue" },
      disposition: "magical",
      enchantInstanceId: null,
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
      enchantInstanceId: null,
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
    const activated = simulated(
      simulateMechanicsTransaction(
        before,
        transaction(
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
            {
              causeId: itemCause.causeId,
              kind: "occurrence-create",
              material: CHARACTER,
              occurrence: {
                endRules: [],
                kind: "program",
                phaseState: {
                  invoke: { execution: 0, lastTriggerEventId: null },
                },
                registers: {},
              },
              occurrenceId: "potion-root",
              operationId: "create-root",
            },
            {
              causeId: itemCause.causeId,
              conditionImmunityOverride: null,
              kind: "occurrence-create",
              material: CHARACTER,
              occurrence: {
                endRules: [],
                fact: { key: "haste", kind: "active-key" },
                kind: "standing",
                parentId: "potion-root",
                target: SELF,
              },
              occurrenceId: "potion-effect",
              operationId: "apply-effect",
              parent: occurrenceGeneration("potion-root", 1),
            },
          ],
          {
            causes: [itemCause],
            factGuards: [resourceDefinitionFact(before, resource, quantitySpec)],
          }
        )
      )
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

    const rootCause = programRootCause(authority, "potion-root");
    const ended = simulated(
      simulateMechanicsTransaction(
        activated.state.world,
        transaction(
          [
            {
              causeId: rootCause.causeId,
              kind: "occurrence-end",
              occurrence: occurrenceGeneration("potion-root", 1),
              operationId: "end-potion-effect",
            },
          ],
          { actionId: "end-potion-effect", causes: [rootCause] }
        )
      )
    );
    expect(ended.state.world).toEqual(activated.state.world);
    expect(ended.stages[0]?.after).toBe(ended.stages[0]?.before);
    expect(state(ended.state.world).occurrences).toHaveProperty("potion-root");
    expect(state(ended.state.world).occurrences).toHaveProperty("potion-effect");
    expect(state(ended.state.world).inventory.potion?.quantity.current).toBe(0);
    expect(ended.consequences).toEqual([
      {
        causeId: rootCause.causeId,
        kind: "occurrence-end",
        occurrence: occurrenceGeneration("potion-root", 1),
        operationId: "end-potion-effect",
      },
    ]);
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
        state(stageBefore.world).vitals.hitPoints.current,
        state(after.world).vitals.hitPoints.current,
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
