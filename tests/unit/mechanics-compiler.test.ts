import { describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { compileMechanicsFrame } from "@/lib/mechanics-compiler";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import { reviewMechanicsIntent } from "@/lib/mechanics-program";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { beginMechanicsCausalState, parseMechanicsWorld } from "@/lib/mechanics-world";
import type { ProgramPhaseState } from "@/types/mechanic-occurrence";
import type {
  CompileMechanicsFrameInput,
  MechanicsCompilerResponse,
  MechanicsFrameCompileResult,
} from "@/types/mechanics-compiler";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsIntent, ReviewedMechanicsIntent } from "@/types/mechanics-program";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
import type { MechanicsTriggerEvidence } from "@/types/mechanics-trigger";
import type { MechanicsWorld } from "@/types/mechanics-world";

const HERO = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const SELF = { entityId: "self", material: HERO } as const;
const ROOT = {
  occurrence: { material: HERO, occurrenceId: "root-1" },
  ordinal: 1,
} as const;
const FIXED_ONE = { kind: "fixed", value: 1 } as const;

function conformed(value: unknown): MechanicsProgram {
  const result = conformMechanicsProgram(value);
  if (!result) throw new Error("program fixture did not conform");
  return result;
}

function authorityReceipt(program: MechanicsProgram): MechanicsProgramAuthorityReceipt {
  const capability = {
    capabilityId: program.id,
    definition: {
      catalogueKind: "spell",
      entityId: program.id,
      kind: "catalogue",
      mechanicsRevision: canonicalFingerprint({ program }),
    },
    kind: "program",
  } as const;
  const installation = {
    capability,
    generation: 1,
    installationId: `installation.${program.id}`,
    owner: SELF,
  } as const;
  return {
    anchors: {
      activator: SELF,
      caster: SELF,
      owner: SELF,
      source: SELF,
      target: SELF,
    },
    installation,
    schema: 1,
    snapshot: {
      grantGroups: {},
      program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: SELF },
    staticBindings: {},
  };
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

function authoritySnapshot(
  authority: Readonly<MechanicsProgramAuthorityReceipt>
): MechanicsAuthoritySnapshot {
  return { definitions: [authorityDefinition(authority)] };
}

function world(nextOccurrenceOrdinal = 1): MechanicsWorld {
  const state = createEmptyCharacterMaterialState(5, HERO, {
    hitPoints: {
      current: 20,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  });
  const parsed = parseMechanicsWorld({
    documents: [
      {
        kind: "character",
        material: HERO,
        state: { ...state, nextOccurrenceOrdinal },
      },
    ],
    scope: HERO,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function worldWithProgramRoot(
  program: MechanicsProgram,
  phaseState: ProgramPhaseState,
  authority = authorityReceipt(program)
): MechanicsWorld {
  const base = createEmptyCharacterMaterialState(5, HERO, {
    hitPoints: {
      current: 20,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  });
  const parsed = parseMechanicsWorld({
    documents: [
      {
        kind: "character",
        material: HERO,
        state: {
          ...base,
          nextOccurrenceOrdinal: 2,
          occurrences: {
            "root-1": {
              authority,
              endRules: [],
              ending: null,
              kind: "program",
              ordinal: 1,
              phaseState,
              registers: Object.fromEntries(
                program.registers.map(({ initial, registerId }) => [registerId, initial])
              ),
            },
          },
        },
      },
    ],
    scope: HERO,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function createIntent(
  program: MechanicsProgram,
  authority = authorityReceipt(program)
): MechanicsIntent {
  return {
    actionId: "action-1",
    factGuards: [],
    frame: {
      authority,
      invocation: { installation: authority.installation, kind: "installed-capability" },
      rootReceipt: {
        kind: "create",
        materialEpoch: 0,
        next: { execution: 1, phaseId: "resolve", triggerEventId: null },
        root: ROOT,
      },
      trigger: { kind: "invocation" },
    },
  };
}

function advanceIntent(
  program: MechanicsProgram,
  phaseId: string,
  trigger: MechanicsTriggerEvidence,
  triggerEventId: string,
  authority = authorityReceipt(program)
): MechanicsIntent {
  return {
    actionId: "action-1",
    factGuards: [],
    frame: {
      authority,
      invocation: { kind: "program-root", occurrence: ROOT },
      rootReceipt: {
        expected: { execution: 0, phaseId, triggerEventId: null },
        kind: "advance",
        next: { execution: 1, phaseId, triggerEventId },
        root: ROOT,
      },
      trigger,
    },
  };
}

function reviewed(
  intent: Readonly<MechanicsIntent>,
  snapshot: Readonly<MechanicsWorld>
): Readonly<ReviewedMechanicsIntent> {
  const result = reviewMechanicsIntent(intent, [], snapshot);
  if (result.status !== "reviewed") {
    throw new Error(`intent fixture was rejected: ${JSON.stringify(result)}`);
  }
  return result.reviewed;
}

function compilationInput(
  value: Readonly<ReviewedMechanicsIntent>,
  snapshot: Readonly<MechanicsWorld>,
  responses: readonly Readonly<MechanicsCompilerResponse>[] = []
): CompileMechanicsFrameInput {
  const state = beginMechanicsCausalState(snapshot);
  if (!state.ok) throw new Error(`causal fixture was rejected: ${state.reason}`);
  return {
    authoritySnapshot: authoritySnapshot(value.intent.frame.authority),
    facts: [],
    responses,
    reviewed: value,
    state: state.value,
  };
}

function compiled(
  result: Readonly<MechanicsFrameCompileResult>
): Extract<MechanicsFrameCompileResult, { readonly status: "compiled" }> {
  expect(result.status).toBe("compiled");
  if (result.status !== "compiled") throw new Error(JSON.stringify(result));
  return result;
}

describe("compileMechanicsFrame", () => {
  it("creates the root before deterministic register CAS operations", () => {
    const program = conformed({
      id: "compiler-create-registers",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-integer", value: FIXED_ONE },
              registerId: "tally",
              stepId: "set-tally",
              when: null,
            },
            {
              kind: "register",
              operation: { kind: "add", value: { kind: "fixed", value: 2 } },
              registerId: "tally",
              stepId: "add-tally",
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [{ initial: 0, registerId: "tally" }],
      version: 1,
    });
    const before = world();
    const input = compilationInput(reviewed(createIntent(program), before), before);

    const first = compiled(compileMechanicsFrame(input));
    const second = compileMechanicsFrame(input);

    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.transaction.operations).toMatchObject([
      {
        expectedRegisters: null,
        kind: "program-state-transition",
        nextRegisters: { tally: 0 },
        receipt: { kind: "create" },
      },
      {
        expected: 0,
        kind: "program-register-transition",
        next: 1,
        registerId: "tally",
      },
      {
        expected: 1,
        kind: "program-register-transition",
        next: 3,
        registerId: "tally",
      },
    ]);
    expect(first.trace).toMatchObject([
      { status: "compiled", stepId: "set-tally" },
      { status: "compiled", stepId: "add-tally" },
    ]);
    expect(first.trace.map(({ operationIds }) => operationIds)).toEqual([
      [first.transaction.operations[1]?.operationId],
      [first.transaction.operations[2]?.operationId],
    ]);
    expect(first.trace.map(({ executions }) => executions)).toEqual([
      [first.simulation.executions[1]],
      [first.simulation.executions[2]],
    ]);
    expect(first.simulation).toMatchObject({
      executions: [
        { kind: "program-state-transition", status: "applied" },
        { kind: "program-register-transition", status: "applied" },
        { kind: "program-register-transition", status: "applied" },
      ],
      status: "simulated",
    });
  });

  it("advances only after register steps and guards the projected registers", () => {
    const program = conformed({
      id: "compiler-advance-register",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "pulse",
          steps: [
            {
              kind: "register",
              operation: { kind: "add", value: { kind: "fixed", value: 2 } },
              registerId: "tally",
              stepId: "add-tally",
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "resolve" },
        },
      ],
      registers: [{ initial: 0, registerId: "tally" }],
      version: 1,
    });
    const before = worldWithProgramRoot(program, {
      pulse: { execution: 0, lastTriggerEventId: null },
      resolve: { execution: 1, lastTriggerEventId: null },
    });
    const proposed = advanceIntent(
      program,
      "pulse",
      {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "resolve",
      },
      "program.root-1.resolve.1"
    );
    const result = compiled(
      compileMechanicsFrame(compilationInput(reviewed(proposed, before), before))
    );

    expect(result.transaction.operations).toMatchObject([
      {
        expected: 0,
        kind: "program-register-transition",
        next: 2,
        registerId: "tally",
      },
      {
        expectedRegisters: { tally: 2 },
        kind: "program-state-transition",
        nextRegisters: { tally: 2 },
        receipt: { kind: "advance" },
      },
    ]);
    expect(result.simulation).toMatchObject({
      executions: [
        { kind: "program-register-transition", status: "applied" },
        { kind: "program-state-transition", status: "applied" },
      ],
      status: "simulated",
    });
  });

  it("returns replay before considering supplied responses", () => {
    const program = conformed({
      id: "compiler-replay",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const proposed = createIntent(program);
    const before = world();
    const reviewedIntent = reviewed(proposed, before);
    const after = worldWithProgramRoot(
      program,
      { resolve: { execution: 1, lastTriggerEventId: null } },
      proposed.frame.authority
    );

    expect(
      compileMechanicsFrame(
        compilationInput(reviewedIntent, after, [
          {
            kind: "damage-override",
            override: null,
            requestId: "ignored-response",
          },
        ])
      )
    ).toEqual({ status: "replay" });
  });

  it("rejects an unsupported authored step without pretending it compiled", () => {
    const program = conformed({
      id: "compiler-unsupported",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              conditionId: "poisoned",
              kind: "condition",
              lifetime: { kind: "manual" },
              operation: "apply",
              stepId: "apply-condition",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = world();

    expect(
      compileMechanicsFrame(
        compilationInput(reviewed(createIntent(program), before), before)
      )
    ).toEqual({
      operationId: null,
      phaseId: "resolve",
      reason: "unsupported-step",
      referenceId: "condition",
      status: "rejected",
      stepId: "apply-condition",
    });
  });

  it("commits create and advance receipts for manual-only phases", () => {
    const program = conformed({
      id: "compiler-manual-only",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              instructionId: "move-on-create",
              kind: "manual-relocation",
              mode: "teleport",
              stepId: "manual-create",
              target: { kind: "role", role: "owner" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "pulse",
          steps: [
            {
              instructionId: "move-on-advance",
              kind: "manual-relocation",
              mode: "plane-transfer",
              stepId: "manual-advance",
              target: { kind: "role", role: "owner" },
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "resolve" },
        },
      ],
      registers: [],
      version: 1,
    });
    const createWorld = world();
    const createResult = compiled(
      compileMechanicsFrame(
        compilationInput(reviewed(createIntent(program), createWorld), createWorld)
      )
    );

    expect(createResult.transaction.operations).toMatchObject([
      { kind: "program-state-transition", receipt: { kind: "create" } },
    ]);
    expect(createResult.manual).toEqual([
      {
        instructionId: "move-on-create",
        kind: "relocation",
        mode: "teleport",
        stepId: "manual-create",
        targets: [{ binding: SELF, ordinal: 1 }],
      },
    ]);
    expect(createResult.trace).toEqual([
      {
        executions: [],
        operationIds: [],
        status: "manual",
        stepId: "manual-create",
      },
    ]);

    const advanceWorld = worldWithProgramRoot(program, {
      pulse: { execution: 0, lastTriggerEventId: null },
      resolve: { execution: 1, lastTriggerEventId: null },
    });
    const proposedAdvance = advanceIntent(
      program,
      "pulse",
      {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "resolve",
      },
      "program.root-1.resolve.1"
    );
    const advanceResult = compiled(
      compileMechanicsFrame(
        compilationInput(reviewed(proposedAdvance, advanceWorld), advanceWorld)
      )
    );

    expect(advanceResult.transaction.operations).toMatchObject([
      { kind: "program-state-transition", receipt: { kind: "advance" } },
    ]);
    expect(advanceResult.manual).toEqual([
      {
        instructionId: "move-on-advance",
        kind: "relocation",
        mode: "plane-transfer",
        stepId: "manual-advance",
        targets: [{ binding: SELF, ordinal: 1 }],
      },
    ]);
    expect(advanceResult.simulation.status).toBe("simulated");
  });
});
