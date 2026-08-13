import { describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { resolveDamage } from "@/lib/damage";
import { addOccurrence } from "@/lib/mechanic-occurrences";
import {
  analyzeResolutionGroup,
  conformOrderingObservation,
  conformResolutionGroup,
  deriveMechanicsEndWaveEvents,
  deriveMechanicsPostEvents,
  orderResolutionPartitions,
  planResolutionGroup,
} from "@/lib/mechanics-execution";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import { parseMechanicsWorld } from "@/lib/mechanics-world";
import type { MechanicsInvocationRef } from "@/types/mechanics-authority-ref";
import type { EntityRef } from "@/types/mechanics-reference";
import type {
  MechanicsOperation,
  MechanicsOperationCause,
} from "@/types/mechanics-operation";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsWorld } from "@/types/mechanics-world";
import type { ResourceRef, ResourceSpec } from "@/types/resource";
import type { CreatureVitals } from "@/types/vitals";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const SELF = { entityId: "self", material: MATERIAL } as const satisfies EntityRef;
const FIRST = { entityId: "first", material: MATERIAL } as const satisfies EntityRef;
const SECOND = { entityId: "second", material: MATERIAL } as const satisfies EntityRef;
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

function operationCause(
  authority: MechanicsProgramAuthorityReceipt,
  invocation: MechanicsInvocationRef
): MechanicsOperationCause {
  return {
    authority,
    causeId: canonicalFingerprint({ authority, invocation }),
    invocation,
  };
}

function installedCause(
  authority: MechanicsProgramAuthorityReceipt
): MechanicsOperationCause {
  return operationCause(authority, {
    installation: authority.installation,
    kind: "installed-capability",
  });
}

function programRootCause(occurrenceId: string): MechanicsOperationCause {
  return operationCause(AUTHORITY, {
    kind: "program-root",
    occurrence: { material: MATERIAL, occurrenceId },
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

function worldWithProgramRoot(): Readonly<MechanicsWorld> {
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
  if (!parsed.ok) throw new Error("program-root fixture");
  return parsed.value;
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
  return { basis: world(), groupId: "group-1", proposals };
}

function context(
  ordering: unknown = null,
  causes: readonly MechanicsOperationCause[] = [INSTALLED_CAUSE]
) {
  return {
    actionId: "action-1",
    actor: SELF,
    causes,
    factGuards: [],
    ordering,
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
      basis,
      groupId: "fireball",
      proposals: [
        { operation: damageOperation("damage-a", FIRST), proposalId: "target-a" },
        { operation: damageOperation("damage-b", SECOND), proposalId: "target-b" },
      ],
    };
    const result = analyzeResolutionGroup(value);
    expect(result.kind).toBe("disjoint");
    expect(JSON.stringify(basis)).toBe(JSON.stringify(value.basis));
  });

  it("plans a disjoint group as one atomic action and derives each target event", () => {
    const basis = world();
    const result = planResolutionGroup(
      {
        basis,
        groupId: "fireball",
        proposals: [
          { operation: damageOperation("damage-a", FIRST), proposalId: "target-a" },
          { operation: damageOperation("damage-b", SECOND), proposalId: "target-b" },
        ],
      },
      context()
    );
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.action.id).toBe("action-1");
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
    const result = planResolutionGroup(
      {
        basis: world(),
        groupId: "program-root",
        proposals: [{ operation, proposalId: "root" }],
      },
      context()
    );
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.events).toEqual([]);
    const root = result.world.documents[0]?.state.occurrences.root;
    expect(root).toMatchObject({ authority: AUTHORITY, kind: "program" });
    expect(root).not.toHaveProperty("target");
  });

  it("derives condition events only for effect occurrences under a live program root", () => {
    const cause = programRootCause("root");
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
    } as const satisfies MechanicsOperation;
    const result = planResolutionGroup(
      {
        basis: worldWithProgramRoot(),
        groupId: "condition-effect",
        proposals: [{ operation, proposalId: "condition" }],
      },
      context(null, [cause])
    );
    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    expect(result.events).toMatchObject([
      {
        conditionId: "blinded",
        kind: "condition-changed",
        present: true,
        target: FIRST,
      },
    ]);
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
    const pending = planResolutionGroup(value, context());
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
    const planned = planResolutionGroup(value, context(ordering));
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") return;
    expect(planned.orderedProposalIds).toEqual(["b", "a"]);
    expect(planned.events.map(({ operationId }) => operationId)).toEqual([
      "damage-b",
      "damage-a",
    ]);
  });

  it("rejects unsolicited ordering and aborts an invalid group without changing its basis", () => {
    const disjoint = group([
      { operation: damageOperation("damage-a", FIRST), proposalId: "a" },
    ]);
    expect(
      planResolutionGroup(
        disjoint,
        context({ kind: "ordering", partitions: [], requestId: "stale" })
      )
    ).toMatchObject({ reason: "unexpected-ordering", status: "rejected" });

    const basis = world();
    const missing = {
      entityId: "missing",
      material: MATERIAL,
    } as const satisfies EntityRef;
    expect(
      planResolutionGroup(
        {
          basis,
          groupId: "atomic-rejection",
          proposals: [
            { operation: damageOperation("valid", FIRST), proposalId: "valid" },
            { operation: damageOperation("invalid", missing), proposalId: "invalid" },
          ],
        },
        context()
      )
    ).toMatchObject({ reason: "missing-target", status: "rejected" });
    expect(JSON.stringify(basis)).toBe(JSON.stringify(world()));
  });

  it("rejects missing, forged, excess, and unused authority causes at the context boundary", () => {
    const operation = damageOperation("damage", FIRST);
    const value = group([{ operation, proposalId: "damage" }]);
    const missingCauses = {
      actionId: "action-1",
      actor: SELF,
      factGuards: [],
      ordering: null,
    };
    expect(planResolutionGroup(value, missingCauses)).toMatchObject({
      reason: "invalid-context",
      status: "rejected",
    });
    expect(planResolutionGroup(value, { ...context(), causes: [] })).toMatchObject({
      reason: "invalid-context",
      status: "rejected",
    });
    expect(
      planResolutionGroup(value, {
        ...context(),
        causes: [
          {
            ...INSTALLED_CAUSE,
            causeId: canonicalFingerprint({ forged: true }),
          },
        ],
      })
    ).toMatchObject({ reason: "invalid-context", status: "rejected" });
    expect(planResolutionGroup(value, { ...context(), unexpected: true })).toMatchObject({
      reason: "invalid-context",
      status: "rejected",
    });

    const unused = installedCause({
      ...AUTHORITY,
      staticBindings: { unused: 1 },
    });
    const causes = [INSTALLED_CAUSE, unused].sort((left, right) =>
      left.causeId.localeCompare(right.causeId)
    );
    expect(planResolutionGroup(value, context(null, causes))).toMatchObject({
      reason: "invalid-context",
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

  it("emits one damage-taken event for one multipart packet", () => {
    const before = world();
    const operation = damageOperation("mixed", FIRST, "mixed-packet", [3, 4]);
    const result = deriveMechanicsPostEvents(before, before, [
      {
        facts: {
          becameDead: false,
          concentrationDifficultyClass: 10,
          damageTaken: 7,
          deathSaveFailuresAdded: 0,
          hitPointsLost: 7,
          instantDeath: false,
          overflowDamage: 0,
          remainedAtOne: false,
          temporaryHitPointsLost: 0,
          wouldDropToZero: false,
        },
        kind: "creature-damage",
        operation,
        operationId: operation.operationId,
        status: "applied",
      },
    ]);
    expect(result).toMatchObject({
      events: [
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
      ],
      status: "derived",
    });
  });

  it("carries authoritative attacker/critical evidence into one damage event", () => {
    const before = world();
    const operation = damageOperation("strike", FIRST, "strike-packet", [5], {
      attacker: SECOND,
      criticalHit: true,
      delivery: "attack",
    });
    const result = deriveMechanicsPostEvents(before, before, [
      {
        facts: {
          becameDead: false,
          concentrationDifficultyClass: 10,
          damageTaken: 5,
          deathSaveFailuresAdded: 0,
          hitPointsLost: 5,
          instantDeath: false,
          overflowDamage: 0,
          remainedAtOne: false,
          temporaryHitPointsLost: 0,
          wouldDropToZero: false,
        },
        kind: "creature-damage",
        operation,
        operationId: operation.operationId,
        status: "applied",
      },
    ]);
    expect(result).toMatchObject({
      events: [
        expect.objectContaining({
          attacker: SECOND,
          criticalHit: true,
          kind: "damage-taken",
        }),
      ],
      status: "derived",
    });
  });

  it("derives source-end events before the source occurrence is removed", () => {
    const before = worldWithProgramRoot();
    const result = deriveMechanicsEndWaveEvents(
      before,
      [
        {
          causes: [{ kind: "requested" }],
          occurrence: { material: MATERIAL, occurrenceId: "root" },
        },
      ],
      "end-wave"
    );
    expect(result).toMatchObject({
      events: [
        {
          kind: "source-ended",
          occurrence: { material: MATERIAL, occurrenceId: "root" },
          operationId: "end-wave",
        },
      ],
      status: "derived",
    });
    expect(before.documents[0]?.state.occurrences.root).toBeDefined();
    expect(
      deriveMechanicsEndWaveEvents(
        before,
        [
          {
            causes: [{ kind: "requested" }],
            occurrence: { material: MATERIAL, occurrenceId: "missing" },
          },
        ],
        "end-wave"
      )
    ).toBeNull();
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
    hostile.basis = world();
    hostile.groupId = "group";
    hostile.proposals = [{ operation, proposalId: "a" }];
    expect(conformResolutionGroup(hostile)).toBeNull();
    const sparse = Array(1) as unknown[];
    expect(
      conformResolutionGroup({ basis: world(), groupId: "group", proposals: sparse })
    ).toBeNull();
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
        basis: world(),
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
