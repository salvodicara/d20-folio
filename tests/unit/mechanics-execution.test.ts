import { describe, expect, it, vi } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
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
  deriveMechanicsSourceEndingEvents,
  finalizeMechanicsEndWaveWithEvents,
  orderResolutionPartitions,
  simulateResolutionGroup,
} from "@/lib/mechanics-execution";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import {
  beginMechanicsCausalState,
  discoverMechanicsEndWave,
  finalizeMechanicsEndWave,
  latchMechanicsEndWave,
  parseMechanicsWorld,
} from "@/lib/mechanics-world";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
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
import type { CreatureVitals } from "@/types/vitals";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
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
  const parsed = parseMechanicsWorld({
    ...basis,
    documents: [{ ...document, state: { ...document.state, ...occurrences } }],
  });
  if (!parsed.ok) throw new Error("program-root fixture");
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

function programRootCreateOperation(
  occurrenceId = "root"
): Extract<MechanicsOperation, { kind: "occurrence-create" }> {
  return {
    causeId: INSTALLED_CAUSE.causeId,
    kind: "occurrence-create",
    material: MATERIAL,
    occurrence: {
      endRules: [],
      kind: "program",
      phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
      registers: {},
    },
    occurrenceId,
    operationId: `create-${occurrenceId}`,
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
    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    expect(result).not.toHaveProperty("action");
    expect(result.stages).toHaveLength(2);
    expect(result.transaction.causes).toEqual([INSTALLED_CAUSE]);
    expect(
      result.transaction.operations.every(
        ({ causeId }) => causeId === INSTALLED_CAUSE.causeId
      )
    ).toBe(true);
    const damageEvents = result.events.filter((event) => event.kind === "damage-taken");
    expect(
      damageEvents.map(({ resolution }) => resolution.packet.target.entityId).sort()
    ).toEqual(["first", "second"]);
    expect(JSON.stringify(basis)).toBe(JSON.stringify(world()));
  });

  it("creates a program root from its exact authority cause without fabricating target events", () => {
    const operation = programRootCreateOperation();
    const result = simulateResolutionGroup(
      {
        groupId: "program-root",
        proposals: [{ operation, proposalId: "root" }],
      },
      context()
    );
    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    expect(result.events).toEqual([]);
    const root = result.state.world.documents[0]?.state.occurrences.root;
    expect(root).toMatchObject({ authority: AUTHORITY, kind: "program" });
    expect(root).not.toHaveProperty("target");
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
    expect(result.events).toEqual([]);
    expect(occurrenceGeneration(result.state.world, "root")).toEqual(occurrence);
  });

  it("does not invent an event for a condition projection change", () => {
    const basis = worldWithProgramRoot();
    const cause = programRootCause(occurrenceGeneration(basis, "root"));
    const operation = {
      causeId: cause.causeId,
      conditionImmunityOverride: null,
      kind: "occurrence-create",
      material: MATERIAL,
      occurrence: {
        conditionId: "blinded",
        endRules: [],
        kind: "condition",
        parentId: "root",
        target: FIRST,
      },
      occurrenceId: "blind-first",
      operationId: "create-blind-first",
      parent: occurrenceGeneration(basis, "root"),
    } as const satisfies MechanicsOperation;
    const result = simulateResolutionGroup(
      {
        groupId: "condition-effect",
        proposals: [{ operation, proposalId: "condition" }],
      },
      context(null, [cause], { state: causalState(basis) })
    );
    expect(result.status).toBe("simulated");
    if (result.status !== "simulated") return;
    expect(result.events).toEqual([]);
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
        collisionKey: partition.collisionKeys[0] ?? "",
        proposalIds: ["b", "a"],
      })),
      requestId: pending.request.requestId,
    };
    const simulated = simulateResolutionGroup(value, context(ordering));
    expect(simulated.status).toBe("simulated");
    if (simulated.status !== "simulated") return;
    expect(simulated.orderedProposalIds).toEqual(["b", "a"]);
    expect(simulated.events.map(({ operationId }) => operationId)).toEqual([
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
    expect(stage.before.world).toEqual(basis);
    expect(stage.after).toBe(result.state);
    expect(stage.before).not.toEqual(stage.after);
    expect(stage.before).toEqual(result.stages[0]?.before);
    expect(stage.after).toBe(result.state);
    expect(result.events).toMatchObject([
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

  it("does not expose a boundary for caller-attested execution receipts", async () => {
    const publicApi = await import("@/lib/mechanics-execution");
    expect(publicApi).not.toHaveProperty("deriveMechanicsPostEvents");
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
    expect(result.events).toEqual([
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
      const event = result.events.find(({ kind }) => kind === "damage-taken");
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

  it("delivers source-ending while readable and authenticates the exact empty finalization grammar", () => {
    expect(finalizeMechanicsEndWaveWithEvents(null, null)).toMatchObject({
      reason: "invalid-world",
      status: "rejected",
    });
    const before = worldWithProgramRoot();
    const occurrence = occurrenceGeneration(before, "root");
    const wave = requestedRootWave(before);
    const sourceEnding = deriveMechanicsSourceEndingEvents(before, wave, "end-wave");
    expect(sourceEnding).toMatchObject({
      events: [
        {
          kind: "source-ending",
          occurrence,
          operationId: "end-wave",
        },
      ],
      status: "derived",
    });
    expect(before.documents[0]?.state.occurrences.root).toBeDefined();
    expect(finalizeMechanicsEndWaveWithEvents(before, wave)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });

    const latched = latchMechanicsEndWave(before, wave);
    expect(latched.status).toBe("latched");
    if (latched.status === "rejected") return;
    const current = discoverMechanicsEndWave(latched.world, wave.request);
    expect(current.status).toBe("discovered");
    if (current.status === "rejected") return;
    const finalized = finalizeMechanicsEndWave(latched.world, current.wave);
    expect(finalized.status).toBe("applied");
    if (finalized.status === "rejected") return;
    const finalization = finalizeMechanicsEndWaveWithEvents(latched.world, current.wave);
    expect(finalization).toMatchObject({ events: [], status: "finalized" });
    if (finalization.status !== "finalized") return;
    expect(finalization.world).toEqual(finalized.world);
  });

  it("derives source-ending from a proved readable checkpoint that is not a closed world", () => {
    const { due, wave } = dueRootWorld();
    expect(parseMechanicsWorld(due)).toMatchObject({
      ok: false,
      reason: "invalid-clock",
    });

    expect(deriveMechanicsSourceEndingEvents(due, wave, "deadline-wave")).toMatchObject({
      events: [
        {
          kind: "source-ending",
          occurrence: occurrenceGeneration(due, "root"),
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
    expect(firstEvents.events[0]).toMatchObject({ occurrence: { ordinal: 1 } });
    expect(secondEvents.events[0]).toMatchObject({ occurrence: { ordinal: 2 } });
    expect(firstEvents.events[0]?.eventId).not.toBe(secondEvents.events[0]?.eventId);
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
      partitions: [{ collisionKeys: ["vitals:x"], proposalIds: ["a", "b"] }],
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
