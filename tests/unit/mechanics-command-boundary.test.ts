import { describe, expect, it } from "vitest";

import { materialRefKey } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  authorizeMechanicsRequester,
  conformMechanicsCommand,
  conformMechanicsCommandAnswer,
  conformMechanicsCommandRequester,
  conformMechanicsCommandResume,
  conformMechanicsCommandSuspension,
  conformMechanicsExecutionFrame,
  mechanicsCommandSuspensionId,
} from "@/lib/mechanics-command-boundary";
import type {
  MechanicsCommandSuspension,
  MechanicsDocumentFence,
  MechanicsExecutionFrame,
  MechanicsObservationKey,
  ProgramRootReceipt,
  ResolvedMechanicsRequesterDefinition,
} from "@/types/mechanics-command";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  MechanicsProgram,
  MechanicsRole,
} from "@/types/mechanics-program-authoring";
import type { EntityRef } from "@/types/mechanics-reference";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const OTHER_MATERIAL = {
  characterId: "character-2",
  kind: "character-play",
  uid: "user-2",
} as const;
const SHARED_MATERIAL = {
  campaignId: "campaign-1",
  kind: "shared-combat",
} as const;
const OWNER = { entityId: "self", material: MATERIAL } as const;
const TARGET = { entityId: "target-1", material: MATERIAL, ordinal: 1 } as const;
const OTHER_OWNER = { entityId: "self", material: OTHER_MATERIAL } as const;
const ROOT = {
  occurrence: { material: MATERIAL, occurrenceId: "root-1" },
  ordinal: 4,
} as const;
const OTHER_ROOT = {
  occurrence: { material: OTHER_MATERIAL, occurrenceId: "root-1" },
  ordinal: 4,
} as const;
const REVISION = canonicalFingerprint({ catalogue: "spell.test-program" });
const OBSERVATION_KEY = canonicalFingerprint({ observation: "request-1" });
const CAPABILITY = {
  capabilityId: "primary",
  definition: {
    catalogueKind: "spell",
    entityId: "spell.test-program",
    kind: "catalogue",
    mechanicsRevision: REVISION,
  },
  kind: "program",
} as const;
const INSTALLATION = {
  capability: CAPABILITY,
  generation: 1,
  installationId: "installation-1",
  owner: OWNER,
} as const;
const INSTALLED_INVOCATION = {
  installation: INSTALLATION,
  kind: "installed-capability",
} as const;
const PROGRAM_ROOT_INVOCATION = {
  kind: "program-root",
  occurrence: ROOT,
} as const;
const RESOURCE = {
  kind: "pool",
  owner: OWNER,
  resourceId: "spell-points",
} as const;
const DICE_OBSERVATION = { aggregates: [], trails: [] } as const;
const D20_OBSERVATION = {
  d20: null,
  enteredModifiers: [],
  tableOverride: null,
} as const;

type SuspensionBody = Omit<MechanicsCommandSuspension, "suspensionId">;
type CreateRootReceipt = Extract<ProgramRootReceipt, { kind: "create" }>;
type AdvanceRootReceipt = Extract<ProgramRootReceipt, { kind: "advance" }>;

function authoredProgram(zeroTarget: MechanicsRole = "target"): MechanicsProgram {
  return {
    id: CAPABILITY.capabilityId,
    phases: [
      {
        inputs: [],
        phaseId: "invoke",
        steps: [],
        trigger: { kind: "invocation" },
      },
      {
        inputs: [],
        phaseId: "on-zero",
        steps: [],
        trigger: { kind: "hit-points-zero", target: zeroTarget },
      },
    ],
    registers: [],
    version: 1,
  };
}

function authorityReceipt(
  program: MechanicsProgram = authoredProgram(),
  owner: EntityRef = OWNER,
  target: EntityRef = TARGET
): MechanicsProgramAuthorityReceipt {
  const installation = { ...INSTALLATION, owner };
  return {
    anchors: {
      activator: owner,
      caster: owner,
      owner,
      source: owner,
      target,
    },
    installation,
    schema: 1,
    snapshot: {
      grantGroups: {},
      program,
      ref: CAPABILITY,
      resources: {},
      schema: 1,
    },
    source: { capability: CAPABILITY, kind: "capability", owner },
    staticBindings: {},
  };
}

function createRootReceipt(
  overrides: Partial<CreateRootReceipt> = {}
): CreateRootReceipt {
  return {
    kind: "create",
    materialEpoch: 7,
    next: { execution: 1, phaseId: "invoke", triggerEventId: null },
    root: ROOT,
    ...overrides,
  };
}

function advanceRootReceipt(
  overrides: Partial<AdvanceRootReceipt> = {}
): AdvanceRootReceipt {
  return {
    expected: { execution: 0, phaseId: "on-zero", triggerEventId: null },
    kind: "advance",
    next: { execution: 1, phaseId: "on-zero", triggerEventId: "event-1" },
    root: ROOT,
    ...overrides,
  };
}

function createFrame(
  overrides: Partial<MechanicsExecutionFrame> = {}
): MechanicsExecutionFrame {
  const authority = authorityReceipt();
  return {
    authority,
    invocation: { installation: authority.installation, kind: "installed-capability" },
    rootReceipt: createRootReceipt(),
    trigger: { kind: "invocation" },
    ...overrides,
  };
}

function advanceFrame(
  overrides: Partial<MechanicsExecutionFrame> = {}
): MechanicsExecutionFrame {
  return {
    authority: authorityReceipt(),
    invocation: PROGRAM_ROOT_INVOCATION,
    rootReceipt: advanceRootReceipt(),
    trigger: {
      kind: "hit-points-zero",
      target: TARGET,
      triggerEventId: "event-1",
    },
    ...overrides,
  };
}

function phaseEndFrame(
  occurrence: MechanicsExecutionFrame["rootReceipt"]["root"] = ROOT
): MechanicsExecutionFrame {
  const authority = authorityReceipt({
    ...authoredProgram(),
    phases: [
      ...authoredProgram().phases,
      {
        inputs: [],
        phaseId: "after-invoke",
        steps: [],
        trigger: { kind: "program-phase-end", phaseId: "invoke" },
      },
    ],
  });
  return {
    authority,
    invocation: PROGRAM_ROOT_INVOCATION,
    rootReceipt: advanceRootReceipt({
      expected: {
        execution: 0,
        phaseId: "after-invoke",
        triggerEventId: null,
      },
      next: {
        execution: 1,
        phaseId: "after-invoke",
        triggerEventId: "phase-end-1",
      },
    }),
    trigger: {
      execution: 1,
      kind: "program-phase-end",
      occurrence,
      phaseId: "invoke",
      triggerEventId: "phase-end-1",
    },
  };
}

function sealSuspension(body: SuspensionBody): MechanicsCommandSuspension {
  return { ...body, suspensionId: mechanicsCommandSuspensionId(body) };
}

function createSuspension(
  overrides: Partial<SuspensionBody> = {}
): MechanicsCommandSuspension {
  const body: SuspensionBody = {
    answers: [
      {
        kind: "d20",
        observation: D20_OBSERVATION,
        payments: [{ paymentId: "payment-1", resource: RESOURCE }],
        requestId: "request-1",
      },
    ],
    commandId: "command-1",
    documentFences: [{ epoch: 7, material: MATERIAL, revision: 11 }],
    frame: createFrame(),
    observationKeys: [{ observationKey: OBSERVATION_KEY, requestId: "request-1" }],
    schema: 1,
    ...overrides,
  };
  return sealSuspension(body);
}

function advanceSuspension(
  frameOverrides: Partial<MechanicsExecutionFrame> = {},
  overrides: Partial<SuspensionBody> = {}
): MechanicsCommandSuspension {
  return createSuspension({
    answers: [],
    frame: advanceFrame(frameOverrides),
    observationKeys: [],
    ...overrides,
  });
}

function resolvedDefinition(
  owner: ResolvedMechanicsRequesterDefinition["installation"]["owner"] = OWNER
): ResolvedMechanicsRequesterDefinition {
  const authority = authorityReceipt();
  return {
    actorSpec: { kind: "role", role: "owner" },
    anchors: authority.anchors,
    definitionGuards: [],
    installation: { ...authority.installation, owner },
    installationGuards: [],
    owner,
    snapshot: authority.snapshot,
    source: { entity: OWNER, kind: "entity" },
    staticBindings: {},
  };
}

function sortedFences(
  fences: [MechanicsDocumentFence, ...MechanicsDocumentFence[]]
): [MechanicsDocumentFence, ...MechanicsDocumentFence[]] {
  return fences.sort((left, right) =>
    materialRefKey(left.material).localeCompare(materialRefKey(right.material))
  );
}

function nonEmptyFences(
  fences: readonly MechanicsDocumentFence[]
): [MechanicsDocumentFence, ...MechanicsDocumentFence[]] {
  const [first, ...rest] = fences;
  if (!first) throw new Error("fence fixture");
  return [first, ...rest];
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectDeepFrozen(child);
}

describe("mechanics public command boundary", () => {
  it("accepts only the exact installed invoke grammar", () => {
    const input = {
      commandId: "command-1",
      invocation: INSTALLED_INVOCATION,
      kind: "invoke",
      schema: 1,
    } as const;
    const conformed = conformMechanicsCommand(input);

    expect(conformed).toEqual(input);
    expect(conformed).not.toBe(input);
    expectDeepFrozen(conformed);
    expect(
      conformMechanicsCommand({ ...input, invocation: PROGRAM_ROOT_INVOCATION })
    ).toBeNull();
    expect(conformMechanicsCommand({ ...input, schema: 2 })).toBeNull();
    expect(conformMechanicsCommand({ ...input, requester: "user-1" })).toBeNull();
    expect(
      conformMechanicsCommand({ ...input, authority: authorityReceipt() })
    ).toBeNull();
    expect(conformMechanicsCommand({ ...input, program: authoredProgram() })).toBeNull();
  });

  it("keeps requester identity exact and applies least-authority policy", () => {
    const user = { kind: "authenticated-user", uid: "user-1" } as const;
    const engine = { causeEventId: "event-1", kind: "engine" } as const;

    expect(conformMechanicsCommandRequester(user)).toEqual(user);
    expect(conformMechanicsCommandRequester(engine)).toEqual(engine);
    expectDeepFrozen(conformMechanicsCommandRequester(user));
    expect(conformMechanicsCommandRequester({ ...user, actor: OWNER })).toBeNull();
    expect(conformMechanicsCommandRequester({ kind: "authenticated-user" })).toBeNull();

    expect(authorizeMechanicsRequester(user, resolvedDefinition())).toEqual({
      basis: "installation-owner",
      status: "authorized",
    });
    expect(
      authorizeMechanicsRequester(
        { ...user, uid: "different-user" },
        resolvedDefinition()
      )
    ).toEqual({ reason: "requester-owner-mismatch", status: "denied" });
    expect(authorizeMechanicsRequester(engine, resolvedDefinition())).toEqual({
      reason: "engine-context-required",
      status: "denied",
    });
    expect(
      authorizeMechanicsRequester(engine, resolvedDefinition(), {
        kind: "trusted-engine",
      })
    ).toEqual({ basis: "trusted-engine", status: "authorized" });
    expect(
      authorizeMechanicsRequester(
        user,
        resolvedDefinition(
          /* Deliberately self-on-shared: the requester gate must deny it. */
          { entityId: "self", material: SHARED_MATERIAL } as unknown as Parameters<
            typeof resolvedDefinition
          >[0]
        )
      )
    ).toEqual({ reason: "owner-not-character-play", status: "denied" });
    expect(
      authorizeMechanicsRequester(
        engine,
        resolvedDefinition({
          authority: "table",
          kind: "material-authority",
          material: SHARED_MATERIAL,
        }),
        { kind: "trusted-engine" }
      )
    ).toEqual({
      reason: "material-authority-policy-required",
      status: "denied",
    });
  });

  it("accepts canonical resume answers and requires physical item generation", () => {
    const answers = [
      { kind: "boolean", requestId: "a", value: true },
      { choiceId: "choice-2", kind: "choice", requestId: "b" },
      { kind: "integer", requestId: "c", value: -12 },
      { instanceId: "item-1", instanceOrdinal: 3, kind: "item", requestId: "d" },
      {
        kind: "ordering",
        partitions: [
          { collisionKey: "collision-1", proposalIds: ["p2", "p1"] },
          { collisionKey: "collision-2", proposalIds: ["p3"] },
        ],
        requestId: "e",
      },
      { kind: "resource", requestId: "f", resource: RESOURCE },
      { kind: "table", requestId: "g", rowId: "row-1" },
    ] as const;
    const input = {
      answers,
      kind: "resume",
      schema: 1,
      suspensionId: canonicalFingerprint({ suspension: "public" }),
    } as const;

    expect(conformMechanicsCommand(input)).toEqual(input);
    expect(
      conformMechanicsCommand({ ...input, answers: [answers[1], answers[0]] })
    ).toBeNull();
    expect(
      conformMechanicsCommand({
        ...input,
        answers: [answers[0], { ...answers[1], requestId: "a" }],
      })
    ).toBeNull();
    expect(conformMechanicsCommand({ ...input, commandId: "caller-action" })).toBeNull();

    expect(
      conformMechanicsCommandAnswer({
        instanceId: "item-1",
        instanceOrdinal: 1,
        kind: "item",
        requestId: "item",
      })
    ).not.toBeNull();
    for (const instanceOrdinal of [undefined, 0, -1, 1.5]) {
      expect(
        conformMechanicsCommandAnswer({
          instanceId: "item-1",
          instanceOrdinal,
          kind: "item",
          requestId: "item",
        })
      ).toBeNull();
    }
  });

  it("bounds answer collections and rejects self-attested legacy fields", () => {
    const payment = { paymentId: "a", resource: RESOURCE } as const;

    expect(
      conformMechanicsCommandAnswer({
        kind: "dice",
        observation: DICE_OBSERVATION,
        payments: Array.from({ length: 65 }, (_, index) => ({
          ...payment,
          paymentId: `payment-${String(index).padStart(3, "0")}`,
        })),
        requestId: "request-1",
      })
    ).toBeNull();
    expect(
      conformMechanicsCommandAnswer({
        kind: "entities",
        requestId: "request-1",
        targets: Array.from({ length: 257 }, () => OWNER),
      })
    ).toBeNull();
    expect(
      conformMechanicsCommandAnswer({
        kind: "ordering",
        partitions: [
          {
            collisionKey: "a",
            proposalIds: Array.from({ length: 513 }, (_, index) => `proposal-${index}`),
          },
        ],
        requestId: "request-1",
      })
    ).toBeNull();
    expect(
      conformMechanicsCommand({
        answers: Array.from({ length: 513 }, (_, index) => ({
          kind: "boolean",
          requestId: `request-${String(index).padStart(3, "0")}`,
          value: true,
        })),
        kind: "resume",
        schema: 1,
        suspensionId: canonicalFingerprint({ suspension: "too-many-answers" }),
      })
    ).toBeNull();
    expect(
      conformMechanicsCommandAnswer({
        inputId: "legacy-input",
        kind: "boolean",
        requestId: "request-1",
        value: true,
      })
    ).toBeNull();
    expect(
      conformMechanicsCommandAnswer({
        instanceId: "item-1",
        instanceOrdinal: 1,
        kind: "item",
        owner: MATERIAL,
        requestId: "request-1",
      })
    ).toBeNull();
  });

  it("rejects hostile public command graphs", () => {
    const invoke = {
      commandId: "command-1",
      invocation: INSTALLED_INVOCATION,
      kind: "invoke",
      schema: 1,
    } as const;
    const accessor = structuredClone(invoke) as Record<string, unknown>;
    Object.defineProperty(accessor, "commandId", {
      enumerable: true,
      get: () => "command-1",
    });

    expect(
      conformMechanicsCommand(Object.assign(Object.create(null), invoke))
    ).toBeNull();
    expect(conformMechanicsCommand(accessor)).toBeNull();
    expect(
      conformMechanicsCommand({
        answers: Array(1),
        kind: "resume",
        schema: 1,
        suspensionId: canonicalFingerprint({ suspension: "sparse" }),
      })
    ).toBeNull();
  });
});

describe("mechanics command suspension boundary", () => {
  it("matches a canonical suspension id and recovers only the stored command id", () => {
    const suspension = createSuspension();
    const command = {
      answers: [{ kind: "boolean", requestId: "request-2", value: true }],
      kind: "resume",
      schema: 1,
      suspensionId: suspension.suspensionId,
    } as const;
    const matched = conformMechanicsCommandResume(command, suspension);

    expect(suspension.suspensionId).toBe(mechanicsCommandSuspensionId(suspension));
    expect(matched?.commandId).toBe(suspension.commandId);
    expect(matched?.command).toEqual(command);
    expect(matched?.suspension).toEqual(suspension);
    expectDeepFrozen(matched);
    expect(
      conformMechanicsCommandResume(
        { ...command, suspensionId: canonicalFingerprint({ suspension: "other" }) },
        suspension
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandResume(
        { ...command, suspensionId: "legacy-suspension-id" },
        suspension
      )
    ).toBeNull();
  });

  it("preserves and deeply freezes the complete authority/program/trigger frame", () => {
    const input = createSuspension();
    const conformed = conformMechanicsCommandSuspension(input);
    if (!conformed) throw new Error("fixture must conform");

    expect(conformed).toEqual(input);
    expect(conformed).not.toBe(input);
    expect(conformed.frame).toEqual(input.frame);
    expect(conformed.frame.authority.snapshot.program).toEqual(authoredProgram());
    expect(conformed.frame.trigger).toEqual({ kind: "invocation" });
    expect(conformed.frame.rootReceipt.next).not.toHaveProperty("actionId");
    expectDeepFrozen(conformed);
  });

  it("binds create to the exact installation, root material, epoch, and invocation", () => {
    expect(conformMechanicsCommandSuspension(createSuspension())).not.toBeNull();

    const differentInstallation = {
      ...INSTALLATION,
      generation: INSTALLATION.generation + 1,
    };
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          frame: createFrame({
            invocation: {
              installation: differentInstallation,
              kind: "installed-capability",
            },
          }),
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          frame: createFrame({ rootReceipt: createRootReceipt({ root: OTHER_ROOT }) }),
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          documentFences: [{ epoch: 8, material: MATERIAL, revision: 11 }],
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          frame: createFrame({ invocation: PROGRAM_ROOT_INVOCATION }),
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          frame: createFrame({
            trigger: {
              kind: "hit-points-zero",
              target: TARGET,
              triggerEventId: "event-1",
            },
          }),
        })
      )
    ).toBeNull();
  });

  it("accepts advance from zero/null and a later exact one-step execution", () => {
    const first = advanceSuspension();
    expect(conformMechanicsCommandSuspension(first)).toEqual(first);
    expect(first.frame.rootReceipt).toMatchObject({
      expected: { execution: 0, triggerEventId: null },
      next: { execution: 1, triggerEventId: "event-1" },
    });

    const laterReceipt = advanceRootReceipt({
      expected: { execution: 8, phaseId: "on-zero", triggerEventId: "event-8" },
      next: { execution: 9, phaseId: "on-zero", triggerEventId: "event-9" },
    });
    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({
          rootReceipt: laterReceipt,
          trigger: {
            kind: "hit-points-zero",
            target: TARGET,
            triggerEventId: "event-9",
          },
        })
      )
    ).not.toBeNull();
  });

  it("rejects rebinding the same evidence to an invented receipt event", () => {
    const sameEvidence = advanceFrame();
    expect(
      conformMechanicsExecutionFrame({
        ...sameEvidence,
        rootReceipt: advanceRootReceipt({
          next: {
            ...advanceRootReceipt().next,
            triggerEventId: "invented-event",
          },
        }),
      })
    ).toBeNull();
  });

  it("rejects advance ABA, skips, phase drift, and legacy action ids", () => {
    const valid = advanceRootReceipt();

    for (const rootReceipt of [
      advanceRootReceipt({
        expected: { ...valid.expected, triggerEventId: "event-0" },
      }),
      advanceRootReceipt({
        expected: { execution: 1, phaseId: "on-zero", triggerEventId: null },
        next: { execution: 2, phaseId: "on-zero", triggerEventId: "event-2" },
      }),
      advanceRootReceipt({ next: { ...valid.next, execution: 2 } }),
      advanceRootReceipt({ next: { ...valid.next, phaseId: "invoke" } }),
      advanceRootReceipt({
        expected: { execution: 1, phaseId: "on-zero", triggerEventId: "event-1" },
        next: { execution: 2, phaseId: "on-zero", triggerEventId: "event-1" },
      }),
    ]) {
      expect(
        conformMechanicsCommandSuspension(advanceSuspension({ rootReceipt }))
      ).toBeNull();
    }

    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({
          rootReceipt: {
            ...valid,
            next: { ...valid.next, actionId: "legacy-action" },
          } as never,
        })
      )
    ).toBeNull();
  });

  it("binds advance to its root, authority, authored phase, and trigger role", () => {
    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({
          invocation: { kind: "program-root", occurrence: OTHER_ROOT },
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({
          authority: authorityReceipt(authoredProgram(), OTHER_OWNER, TARGET),
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({
          rootReceipt: advanceRootReceipt({
            expected: { execution: 0, phaseId: "missing", triggerEventId: null },
            next: { execution: 1, phaseId: "missing", triggerEventId: "event-1" },
          }),
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({
          trigger: {
            kind: "hit-points-zero",
            target: OWNER,
            triggerEventId: "event-1",
          },
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({ trigger: { kind: "invocation" } })
      )
    ).toBeNull();

    expect(
      conformMechanicsCommandSuspension(
        advanceSuspension({ authority: authorityReceipt(authoredProgram("victim")) })
      )
    ).not.toBeNull();
  });

  it("binds a phase-end trigger to the exact advancing root generation", () => {
    expect(conformMechanicsExecutionFrame(phaseEndFrame())).not.toBeNull();
    expect(
      conformMechanicsExecutionFrame(
        phaseEndFrame({
          ...ROOT,
          occurrence: { ...ROOT.occurrence, occurrenceId: "other" },
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsExecutionFrame(
        phaseEndFrame({ ...ROOT, ordinal: ROOT.ordinal + 1 })
      )
    ).toBeNull();
  });

  it("fingerprints frame, fence, and observation identity but excludes answers", () => {
    const base = createSuspension();
    const answersChanged = createSuspension({
      answers: [{ kind: "boolean", requestId: "request-2", value: false }],
    });
    const frameChanged = createSuspension({
      frame: createFrame({
        rootReceipt: createRootReceipt({ root: { ...ROOT, ordinal: 5 } }),
      }),
    });
    const fenceChanged = createSuspension({
      documentFences: [{ epoch: 7, material: MATERIAL, revision: 12 }],
    });
    const observationChanged = createSuspension({
      observationKeys: [
        {
          observationKey: canonicalFingerprint({ observation: "changed" }),
          requestId: "request-1",
        },
      ],
    });

    expect(answersChanged.suspensionId).toBe(base.suspensionId);
    expect(frameChanged.suspensionId).not.toBe(base.suspensionId);
    expect(fenceChanged.suspensionId).not.toBe(base.suspensionId);
    expect(observationChanged.suspensionId).not.toBe(base.suspensionId);
  });

  it("requires canonical bounded fences and observation keys", () => {
    const otherFence = { epoch: 2, material: OTHER_MATERIAL, revision: 3 } as const;
    const twoFences = sortedFences([
      { epoch: 7, material: MATERIAL, revision: 11 },
      otherFence,
    ]);
    expect(
      conformMechanicsCommandSuspension(createSuspension({ documentFences: twoFences }))
    ).not.toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({ documentFences: nonEmptyFences([...twoFences].reverse()) })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          documentFences: [
            { epoch: 7, material: MATERIAL, revision: 11 },
            { epoch: 8, material: MATERIAL, revision: 12 },
          ],
        })
      )
    ).toBeNull();

    const tooManyFences = sortedFences([
      { epoch: 7, material: MATERIAL, revision: 11 },
      ...Array.from({ length: 256 }, (_, index) => ({
        epoch: 0,
        material: {
          characterId: `extra-${String(index).padStart(3, "0")}`,
          kind: "character-play" as const,
          uid: "extra-user",
        },
        revision: 0,
      })),
    ]);
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({ documentFences: tooManyFences })
      )
    ).toBeNull();

    const secondObservation = {
      observationKey: canonicalFingerprint({ observation: "request-2" }),
      requestId: "request-2",
    } as const;
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          observationKeys: [
            { observationKey: OBSERVATION_KEY, requestId: "request-1" },
            secondObservation,
          ],
        })
      )
    ).not.toBeNull();
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({
          observationKeys: [
            secondObservation,
            { observationKey: OBSERVATION_KEY, requestId: "request-1" },
          ],
        })
      )
    ).toBeNull();
    expect(
      conformMechanicsCommandSuspension(createSuspension({ observationKeys: [] }))
    ).toBeNull();

    const tooManyObservations: MechanicsObservationKey[] = Array.from(
      { length: 513 },
      (_, index) => ({
        observationKey: canonicalFingerprint({ observation: index }),
        requestId: `request-${String(index).padStart(3, "0")}`,
      })
    );
    expect(
      conformMechanicsCommandSuspension(
        createSuspension({ answers: [], observationKeys: tooManyObservations })
      )
    ).toBeNull();
  });

  it("rejects stale fingerprints, legacy suspension fields, and hostile graphs", () => {
    const input = createSuspension();
    const stale = {
      ...input,
      documentFences: [{ epoch: 7, material: MATERIAL, revision: 12 }],
    };
    expect(conformMechanicsCommandSuspension(stale)).toBeNull();
    expect(
      conformMechanicsCommandSuspension({
        ...input,
        suspensionId: "legacy-suspension-id",
      })
    ).toBeNull();

    for (const legacy of [
      { authorityFingerprint: canonicalFingerprint({ authority: "legacy" }) },
      { frameId: canonicalFingerprint({ frame: "legacy" }) },
      { invocation: INSTALLED_INVOCATION },
      { rootReceipt: createRootReceipt() },
    ]) {
      expect(conformMechanicsCommandSuspension({ ...input, ...legacy })).toBeNull();
    }

    const accessor = structuredClone(input) as Record<string, unknown>;
    Object.defineProperty(accessor, "commandId", {
      enumerable: true,
      get: () => "command-1",
    });
    expect(
      conformMechanicsCommandSuspension(Object.assign(Object.create(null), input))
    ).toBeNull();
    expect(conformMechanicsCommandSuspension(accessor)).toBeNull();
  });
});
