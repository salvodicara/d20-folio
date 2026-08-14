import { describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import {
  compileMechanicsFrame,
  isMechanicsCompilerContinuationFor,
} from "@/lib/mechanics-compiler";
import { simulateMechanicsTransaction } from "@/lib/mechanics-operation";
import { reviewMechanicsIntent } from "@/lib/mechanics-program";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { mechanicsProgramEffectOccurrenceId } from "@/lib/mechanics-program-effects";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import {
  beginMechanicsCausalState,
  parseMechanicsWorld,
  pushMechanicsPendingFrame,
  rebaseMechanicsCausalState,
  topMechanicsPendingFrame,
} from "@/lib/mechanics-world";
import type {
  CompileMechanicsFrameInput,
  MechanicsCompiledSegment,
  MechanicsCompilerResponse,
  MechanicsFrameCompileResult,
} from "@/types/mechanics-compiler";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type { MechanicOccurrenceSchemaShape } from "@/lib/mechanic-occurrence-schema";
import type { MechanicOccurrence, ProgramPhaseState } from "@/types/mechanic-occurrence";
import type {
  MechanicsOperationCause,
  MechanicsTransaction,
} from "@/types/mechanics-operation";
import type {
  MechanicsAnswer,
  MechanicsIntent,
  ReviewedMechanicsIntent,
} from "@/types/mechanics-program";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { EntityRef, OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type { MechanicsTriggerEvidence } from "@/types/mechanics-trigger";
import type { MechanicsCausalState, MechanicsWorld } from "@/types/mechanics-world";

type EmittedMechanicsTriggerEvidence = Exclude<
  MechanicsTriggerEvidence,
  { readonly kind: "invocation" }
>;

const HERO = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const SELF = { entityId: "self", material: HERO } as const;
const FAMILIAR = { entityId: "familiar", material: HERO, ordinal: 1 } as const;
const ROOT = {
  occurrence: { material: HERO, occurrenceId: "root-1" },
  ordinal: 1,
} as const;
const OTHER_ROOT = {
  occurrence: { material: HERO, occurrenceId: "root-2" },
  ordinal: 2,
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

function world(nextOccurrenceOrdinal = 1, withFamiliar = false): MechanicsWorld {
  const base = createEmptyCharacterMaterialState(5, HERO, {
    hitPoints: {
      current: 20,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  });
  const state = withFamiliar
    ? {
        ...base,
        entities: {
          familiar: {
            availability: "present" as const,
            controller: null,
            exhaustion: 0,
            kind: "creature" as const,
            label: "",
            ordinal: FAMILIAR.ordinal,
            overrides: {
              armorClass: null,
              hitPointMaximum: null,
              initiativeBonus: null,
              speedFt: null,
            },
            ownerOccurrence: null,
            resources: {},
            template: {
              kind: "catalogue-companion" as const,
              sourceId: "familiar",
              variantId: "owl",
            },
            vitals: {
              hitPoints: {
                current: 1,
                temporary: { current: 0, sourceOccurrence: null },
              },
              zeroHitPoints: null,
            },
          },
        },
        nextEntityOrdinal: 2,
        nextOccurrenceOrdinal,
      }
    : { ...base, nextOccurrenceOrdinal };
  const parsed = parseMechanicsWorld({
    documents: [{ kind: "character", material: HERO, state }],
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

function programOccurrence(
  program: MechanicsProgram,
  ordinal: number,
  authority = authorityReceipt(program)
): Extract<MechanicOccurrence, { readonly kind: "program" }> {
  return {
    authority,
    endRules: [],
    ending: null,
    kind: "program",
    ordinal,
    phaseState: Object.fromEntries(
      program.phases.map(({ phaseId }) => [
        phaseId,
        { execution: phaseId === "seed" ? 1 : 0, lastTriggerEventId: null },
      ])
    ),
    registers: Object.fromEntries(
      program.registers.map(({ initial, registerId }) => [registerId, initial])
    ),
  };
}

function effectBase(
  ordinal: number,
  stepId: string,
  root: Readonly<OccurrenceGenerationRef> = ROOT,
  target: Readonly<EntityRef> = SELF
) {
  return {
    endRules: [],
    ending: null,
    ordinal,
    origin: {
      execution: 1,
      kind: "program-step" as const,
      phaseId: "seed",
      root,
      slot: ordinal,
      stepId,
    },
    parentId: root.occurrence.occurrenceId,
    target,
  } as const;
}

function withOccurrences(
  snapshot: Readonly<MechanicsWorld>,
  occurrences: Readonly<
    Record<string, MechanicOccurrence | MechanicOccurrenceSchemaShape>
  >
): MechanicsWorld {
  const candidate = structuredClone(snapshot);
  const document = candidate.documents[0];
  if (document?.kind !== "character") throw new Error("occurrence fixture");
  const merged: Record<string, MechanicOccurrence | MechanicOccurrenceSchemaShape> = {
    ...document.state.occurrences,
    ...occurrences,
  };
  const parsed = parseMechanicsWorld({
    ...candidate,
    documents: [
      {
        ...document,
        state: {
          ...document.state,
          occurrences: merged,
          nextOccurrenceOrdinal:
            Math.max(...Object.values(merged).map(({ ordinal }) => ordinal)) + 1,
        },
      },
      ...candidate.documents.slice(1),
    ],
  });
  if (!parsed.ok) throw new Error(`occurrence fixture: ${parsed.reason}`);
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
  trigger: EmittedMechanicsTriggerEvidence,
  authority = authorityReceipt(program)
): MechanicsIntent {
  return {
    actionId: "action-2",
    factGuards: [],
    frame: {
      authority,
      invocation: { kind: "program-root", occurrence: ROOT },
      rootReceipt: {
        expected: { execution: 0, phaseId, triggerEventId: null },
        kind: "advance",
        next: { execution: 1, phaseId, triggerEventId: trigger.triggerEventId },
        root: ROOT,
      },
      trigger,
    },
  };
}

function reviewed(
  intent: Readonly<MechanicsIntent>,
  snapshot: Readonly<MechanicsWorld>,
  answers: readonly Readonly<MechanicsAnswer>[] = []
): Readonly<ReviewedMechanicsIntent> {
  const state = beginMechanicsCausalState(snapshot);
  if (!state.ok) throw new Error(`causal fixture was rejected: ${state.reason}`);
  const result = reviewMechanicsIntent(intent, answers, state.value);
  if (result.status !== "reviewed") {
    throw new Error(`intent fixture was rejected: ${JSON.stringify(result)}`);
  }
  return result.reviewed;
}

function rootCreatedState(
  value: Readonly<ReviewedMechanicsIntent>,
  state: Readonly<MechanicsCausalState>
): Readonly<MechanicsCausalState> {
  const frame = value.intent.frame;
  if (frame.rootReceipt.kind !== "create") return state;
  const cause: MechanicsOperationCause = {
    causeId: canonicalFingerprint({
      authority: frame.authority,
      invocation: frame.invocation,
    }),
    invocation: frame.invocation,
  };
  const transaction: MechanicsTransaction = {
    actionId: value.intent.actionId,
    actor: frame.authority.installation.owner,
    causes: [cause],
    factGuards: value.intent.factGuards,
    operations: [
      {
        causeId: cause.causeId,
        endRules: [],
        kind: "program-root-create",
        materialEpoch: frame.rootReceipt.materialEpoch,
        operationId: `root-create:${canonicalFingerprint(frame.rootReceipt)}`,
        root: frame.rootReceipt.root,
      },
    ],
  };
  const result = simulateMechanicsTransaction(transaction, {
    authoritySnapshot: authoritySnapshot(frame.authority),
    state,
  });
  if (result.status !== "simulated" && result.status !== "no-change") {
    throw new Error(`root create fixture was rejected: ${JSON.stringify(result)}`);
  }
  return result.state;
}

function pendingCompilationInput(
  value: Readonly<ReviewedMechanicsIntent>,
  snapshot: Readonly<MechanicsWorld>,
  responses: readonly Readonly<MechanicsCompilerResponse>[] = []
): CompileMechanicsFrameInput {
  const begun = beginMechanicsCausalState(snapshot);
  if (!begun.ok) throw new Error(`causal fixture was rejected: ${begun.reason}`);
  const created = rootCreatedState(value, begun.value);
  const pushed = pushMechanicsPendingFrame(created, value.intent.frame);
  if (!pushed.ok) throw new Error(`pending fixture was rejected: ${pushed.reason}`);
  return {
    authoritySnapshot: authoritySnapshot(value.intent.frame.authority),
    continuation: null,
    facts: [],
    turnEconomy: [],
    responses,
    reviewed: value,
    state: pushed.value,
  };
}

function rawCompilationInput(
  value: Readonly<ReviewedMechanicsIntent>,
  snapshot: Readonly<MechanicsWorld>
): CompileMechanicsFrameInput {
  const begun = beginMechanicsCausalState(snapshot);
  if (!begun.ok) throw new Error(`causal fixture was rejected: ${begun.reason}`);
  return {
    authoritySnapshot: authoritySnapshot(value.intent.frame.authority),
    continuation: null,
    facts: [],
    turnEconomy: [],
    responses: [],
    reviewed: value,
    state: begun.value,
  };
}

function pendingAdvanceInput(
  intent: Readonly<MechanicsIntent>,
  snapshot: Readonly<MechanicsWorld>,
  answers: readonly Readonly<MechanicsAnswer>[] = []
): CompileMechanicsFrameInput {
  const begun = beginMechanicsCausalState(snapshot);
  if (!begun.ok) throw new Error(`causal fixture was rejected: ${begun.reason}`);
  const pushed = pushMechanicsPendingFrame(begun.value, intent.frame);
  if (!pushed.ok) throw new Error(`pending fixture was rejected: ${pushed.reason}`);
  const result = reviewMechanicsIntent(intent, answers, pushed.value);
  if (result.status !== "reviewed") {
    throw new Error(`intent fixture was rejected: ${JSON.stringify(result)}`);
  }
  return {
    authoritySnapshot: authoritySnapshot(intent.frame.authority),
    continuation: null,
    facts: [],
    turnEconomy: [],
    responses: [],
    reviewed: result.reviewed,
    state: pushed.value,
  };
}

function pendingInputFromState(
  intent: Readonly<MechanicsIntent>,
  state: Readonly<MechanicsCausalState>,
  answers: readonly Readonly<MechanicsAnswer>[] = []
): CompileMechanicsFrameInput {
  const pushed = pushMechanicsPendingFrame(state, intent.frame);
  if (!pushed.ok) throw new Error(`pending fixture was rejected: ${pushed.reason}`);
  const result = reviewMechanicsIntent(intent, answers, pushed.value);
  if (result.status !== "reviewed") {
    throw new Error(`intent fixture was rejected: ${JSON.stringify(result)}`);
  }
  return {
    authoritySnapshot: authoritySnapshot(intent.frame.authority),
    continuation: null,
    facts: [],
    turnEconomy: [],
    responses: [],
    reviewed: result.reviewed,
    state: pushed.value,
  };
}

function withState(
  input: Readonly<CompileMechanicsFrameInput>,
  state: Readonly<MechanicsCausalState>
): CompileMechanicsFrameInput {
  return { ...input, state };
}

function phaseEndCausalState(
  program: MechanicsProgram,
  authority = authorityReceipt(program)
): Readonly<MechanicsCausalState> {
  const initial = structuredClone(
    worldWithProgramRoot(
      program,
      {
        after: { execution: 0, lastTriggerEventId: null },
        pulse: { execution: 0, lastTriggerEventId: null },
        resolve: { execution: 1, lastTriggerEventId: null },
      },
      authority
    )
  );
  const document = initial.documents[0];
  if (document?.kind !== "character") throw new Error("phase-end fixture");
  document.state = { ...document.state, nextOccurrenceOrdinal: 3 };
  document.state.occurrences.child = {
    endRules: [
      {
        execution: 1,
        kind: "program-phase-end",
        occurrenceId: "root-1",
        phaseId: "pulse",
      },
    ],
    ending: null,
    fact: { key: "phase-child", kind: "active-key" },
    kind: "standing",
    ordinal: 2,
    origin: {
      execution: 1,
      kind: "program-step",
      phaseId: "resolve",
      root: ROOT,
      slot: 1,
      stepId: "install-child",
    },
    parentId: "root-1",
    target: SELF,
  };
  const closed = parseMechanicsWorld(initial);
  if (!closed.ok) throw new Error(`phase-end fixture: ${closed.reason}`);
  const begun = beginMechanicsCausalState(closed.value);
  if (!begun.ok) throw new Error(`phase-end fixture: ${begun.reason}`);
  const ending = structuredClone(begun.value.world);
  const root = ending.documents[0]?.state.occurrences["root-1"];
  if (root?.kind !== "program") throw new Error("phase-end fixture");
  root.phaseState.pulse = { execution: 1, lastTriggerEventId: "pulse-event-1" };
  const rebased = rebaseMechanicsCausalState(ending, begun.value);
  if (!rebased.ok) throw new Error(`phase-end fixture: ${rebased.reason}`);
  return rebased.value;
}

function compiled(
  result: Readonly<MechanicsFrameCompileResult>
): Readonly<MechanicsCompiledSegment> {
  expect(result.status).toBe("compiled");
  if (result.status !== "compiled") throw new Error(JSON.stringify(result));
  return result.segment;
}

describe("compileMechanicsFrame segmented SSOT", () => {
  it("rejects every call without the exact top pending frame", () => {
    const program = conformed({
      id: "compiler-top-required",
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
    const before = world();
    const value = reviewed(createIntent(program), before);

    expect(compileMechanicsFrame(rawCompilationInput(value, before))).toEqual({
      operationId: null,
      phaseId: "resolve",
      reason: "invalid-state",
      referenceId: "pending-frame",
      status: "rejected",
      stepId: null,
    });
  });

  it("uses the pending cursor as the sole progress truth across steps and phase CAS", () => {
    const program = conformed({
      id: "compiler-segmented-registers",
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
    let input = pendingCompilationInput(reviewed(createIntent(program), before), before);

    const firstResult = compileMechanicsFrame(input);
    const first = compiled(firstResult);
    expect(Object.keys(firstResult)).toEqual(["segment", "status"]);
    expect(first.transaction?.operations).toMatchObject([
      {
        expected: 0,
        kind: "program-register-transition",
        next: 1,
        registerId: "tally",
      },
    ]);
    expect(
      first.transaction?.operations.some(({ kind }) => kind === "program-root-create")
    ).toBe(false);
    expect(first.trace).toMatchObject([{ status: "compiled", stepId: "set-tally" }]);
    expect(topMechanicsPendingFrame(first.state)?.cursor).toEqual({
      nextSlot: 1,
      stage: "step",
      stepIndex: 1,
    });
    expect("world" in first).toBe(false);
    expect("simulation" in first).toBe(false);
    expect("projection" in first).toBe(false);

    input = withState(input, first.state);
    const second = compiled(compileMechanicsFrame(input));
    expect(second.transaction?.operations).toMatchObject([
      {
        expected: 1,
        kind: "program-register-transition",
        next: 3,
        registerId: "tally",
      },
    ]);
    expect(topMechanicsPendingFrame(second.state)?.cursor).toEqual({
      stage: "phase-transition",
    });

    input = withState(input, second.state);
    const phase = compiled(compileMechanicsFrame(input));
    expect(phase.transaction?.operations).toMatchObject([
      {
        expected: { execution: 0, phaseId: "resolve", triggerEventId: null },
        kind: "program-phase-transition",
        next: { execution: 1, phaseId: "resolve", triggerEventId: null },
      },
    ]);
    expect(phase.transaction?.operations).toHaveLength(1);
    expect(topMechanicsPendingFrame(phase.state)?.cursor).toEqual({
      stage: "phase-complete",
    });
    expect(phase.emissions.map(({ event }) => event)).toMatchObject([
      {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "resolve",
      },
    ]);

    expect(compileMechanicsFrame(withState(input, phase.state))).toMatchObject({
      reason: "invalid-state",
      referenceId: "pending-frame",
      status: "rejected",
    });
  });

  it("compiles every expansion slot of one step into one authentic transaction", () => {
    const program = conformed({
      id: "compiler-multi-slot-condition",
      phases: [
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 2 },
              minimum: { kind: "fixed", value: 2 },
              multiplicity: "set",
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              conditionId: "poisoned",
              kind: "condition",
              lifetime: { kind: "manual" },
              operation: "apply",
              stepId: "apply-condition",
              target: { inputId: "targets", kind: "input" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = world(1, true);
    const intent = createIntent(program);
    const value = reviewed(intent, before, [
      { inputId: "targets", kind: "entities", targets: [SELF, FAMILIAR] },
    ]);
    const segment = compiled(
      compileMechanicsFrame(pendingCompilationInput(value, before))
    );
    const operations = segment.transaction?.operations ?? [];

    expect(operations).toHaveLength(2);
    expect(operations.map(({ kind }) => kind)).toEqual([
      "occurrence-create",
      "occurrence-create",
    ]);
    expect(
      operations.map((operation) =>
        operation.kind === "occurrence-create" ? operation.occurrence.origin.slot : null
      )
    ).toEqual([1, 2]);
    expect(
      operations.map((operation) =>
        operation.kind === "occurrence-create" ? operation.created.ordinal : null
      )
    ).toEqual([2, 3]);
    expect(segment.trace[0]?.executions).toHaveLength(2);
    expect(topMechanicsPendingFrame(segment.state)?.cursor).toEqual({
      stage: "phase-transition",
    });
  });

  it("advances manual and exact zero-match steps without fake transactions", () => {
    const manualProgram = conformed({
      id: "compiler-manual-cursor-only",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              instructionId: "move",
              kind: "manual-relocation",
              mode: "teleport",
              stepId: "manual-move",
              target: { kind: "role", role: "owner" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const manualWorld = world();
    const manual = compiled(
      compileMechanicsFrame(
        pendingCompilationInput(
          reviewed(createIntent(manualProgram), manualWorld),
          manualWorld
        )
      )
    );
    expect(manual.transaction).toBeNull();
    expect(manual.actionFacts).toEqual([]);
    expect(manual.consequences).toEqual([]);
    expect(manual.emissions).toEqual([]);
    expect(manual.manual).toEqual([
      {
        instructionId: "move",
        kind: "relocation",
        mode: "teleport",
        stepId: "manual-move",
        targets: [{ binding: SELF, ordinal: 1 }],
      },
    ]);
    expect(topMechanicsPendingFrame(manual.state)?.cursor).toEqual({
      stage: "phase-transition",
    });

    const noMatchProgram = conformed({
      id: "compiler-no-match-cursor-only",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              conditionId: "poisoned",
              kind: "condition",
              lifetime: null,
              operation: "remove",
              stepId: "remove-absent",
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
    const noMatchWorld = world();
    const noMatch = compiled(
      compileMechanicsFrame(
        pendingCompilationInput(
          reviewed(createIntent(noMatchProgram), noMatchWorld),
          noMatchWorld
        )
      )
    );
    expect(noMatch.transaction).toBeNull();
    expect(noMatch.manual).toEqual([]);
    expect(noMatch.trace).toEqual([
      {
        executions: [],
        operationIds: [],
        status: "compiled",
        stepId: "remove-absent",
      },
    ]);
  });

  it("returns a null segment and an opaque cursor-bound continuation at barriers", () => {
    const program = conformed({
      id: "compiler-exact-barrier",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [
            {
              kind: "concentration",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "prior-concentration",
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
              kind: "concentration",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "replace-concentration",
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    });
    const authority = authorityReceipt(program);
    const before = withOccurrences(
      worldWithProgramRoot(
        program,
        {
          pulse: { execution: 0, lastTriggerEventId: null },
          seed: { execution: 1, lastTriggerEventId: null },
        },
        authority
      ),
      {
        concentration: {
          endRules: [],
          ending: null,
          kind: "concentration",
          ordinal: 2,
          origin: {
            execution: 1,
            kind: "program-step",
            phaseId: "seed",
            root: ROOT,
            slot: 1,
            stepId: "prior-concentration",
          },
          parentId: "root-1",
          target: SELF,
        },
      }
    );
    const trigger = {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "seed",
      triggerEventId: "event.seed.1",
    } as const;
    const input = pendingAdvanceInput(
      advanceIntent(program, "pulse", trigger, authority),
      before
    );
    const result = compileMechanicsFrame(input);

    expect(result).toEqual({
      coordination: {
        kind: "concentration-replacement",
        occurrences: [
          {
            occurrence: { material: HERO, occurrenceId: "concentration" },
            ordinal: 2,
          },
        ],
      },
      segment: null,
      status: "needs-coordination",
    });
    if (result.status !== "needs-coordination") return;
    expect(Object.isFrozen(result.coordination)).toBe(true);

    const response: MechanicsCompilerResponse = {
      kind: "damage-override",
      override: null,
      requestId: "future-response",
    };
    expect(compileMechanicsFrame({ ...input, responses: [response] })).toMatchObject({
      reason: "invalid-response",
      referenceId: "unauthentic-continuation",
      status: "rejected",
    });
    const forged = Object.freeze({}) as CompileMechanicsFrameInput["continuation"];
    expect(
      compileMechanicsFrame({ ...input, continuation: forged, responses: [response] })
    ).toMatchObject({
      reason: "invalid-response",
      referenceId: "unauthentic-continuation",
      status: "rejected",
    });
    expect(isMechanicsCompilerContinuationFor(forged, input)).toBe(false);
    expect(compileMechanicsFrame({ ...input, continuation: forged })).toMatchObject({
      reason: "invalid-response",
      referenceId: "unused-continuation",
      status: "rejected",
    });
  });

  it("preserves unspent occurrence ordinals across immune no-changes and the next segment", () => {
    const program = conformed({
      id: "compiler-condition-immunity-segments",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: { conditionId: "poisoned", kind: "condition-immunity" },
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "grant-immunity",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 2 },
              minimum: { kind: "fixed", value: 2 },
              multiplicity: "slots",
              when: null,
            },
          ],
          phaseId: "pulse",
          steps: [
            {
              conditionId: "poisoned",
              kind: "condition",
              lifetime: { kind: "manual" },
              operation: "apply",
              stepId: "apply-immune-condition",
              target: { inputId: "targets", kind: "input" },
              when: null,
            },
            {
              fact: { key: "after-immunity", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "start-after-immunity",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "resolve" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = withOccurrences(
      worldWithProgramRoot(program, {
        pulse: { execution: 0, lastTriggerEventId: null },
        resolve: { execution: 1, lastTriggerEventId: null },
      }),
      {
        immunity: {
          endRules: [],
          ending: null,
          fact: { conditionId: "poisoned", kind: "condition-immunity" },
          kind: "standing",
          ordinal: 2,
          origin: {
            execution: 1,
            kind: "program-step",
            phaseId: "resolve",
            root: ROOT,
            slot: 1,
            stepId: "grant-immunity",
          },
          parentId: "root-1",
          target: SELF,
        },
      }
    );
    const intent = advanceIntent(program, "pulse", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "resolve",
      triggerEventId: "event.resolve.1",
    });
    let input = pendingAdvanceInput(intent, before, [
      { inputId: "targets", kind: "entities", targets: [SELF, SELF] },
    ]);
    const immune = compiled(compileMechanicsFrame(input));
    const immuneCreates = immune.transaction?.operations.flatMap((operation) =>
      operation.kind === "occurrence-create" ? [operation] : []
    );
    expect(immuneCreates?.map(({ created }) => created.ordinal)).toEqual([3, 3]);
    expect(immune.trace[0]?.executions).toMatchObject([
      { reason: "condition-immune", status: "no-change" },
      { reason: "condition-immune", status: "no-change" },
    ]);
    const afterImmuneDocument = immune.state.world.documents[0];
    expect(afterImmuneDocument?.state.nextOccurrenceOrdinal).toBe(3);

    input = withState(input, immune.state);
    const following = compiled(compileMechanicsFrame(input));
    expect(following.transaction?.operations).toMatchObject([
      { created: { ordinal: 3 }, kind: "occurrence-create" },
    ]);
    expect(following.state.world.documents[0]?.state.nextOccurrenceOrdinal).toBe(4);
  });

  it("coordinates concentration and polymorph replacement and rejects duplicate targets", () => {
    for (const scenario of [
      {
        coordinationKind: "concentration-replacement",
        effectKind: "concentration",
        occurrenceId: "existing-concentration",
      },
      {
        coordinationKind: "occurrence-end",
        effectKind: "polymorph",
        occurrenceId: "existing-polymorph",
      },
    ] as const) {
      const existingStep =
        scenario.effectKind === "concentration"
          ? {
              kind: "concentration" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "existing",
              when: null,
            }
          : {
              formId: "brown-bear",
              kind: "polymorph" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "existing",
              target: { kind: "role" as const, role: "target" as const },
              when: null,
            };
      const nextStep =
        scenario.effectKind === "concentration"
          ? { ...existingStep, stepId: "replace" }
          : { ...existingStep, formId: "wolf", stepId: "replace" };
      const program = conformed({
        id: `compiler-${scenario.effectKind}-replacement`,
        phases: [
          {
            inputs: [],
            phaseId: "resolve",
            steps: [existingStep],
            trigger: { kind: "invocation" },
          },
          {
            inputs: [],
            phaseId: "pulse",
            steps: [nextStep],
            trigger: { kind: "program-phase-end", phaseId: "resolve" },
          },
        ],
        registers: [],
        version: 1,
      });
      const common = effectBase(2, "existing");
      const occurrence: MechanicOccurrenceSchemaShape =
        scenario.effectKind === "concentration"
          ? {
              ...common,
              kind: "concentration",
              origin: { ...common.origin, phaseId: "resolve" },
            }
          : {
              ...common,
              formId: "brown-bear",
              kind: "polymorph-form",
              origin: { ...common.origin, phaseId: "resolve" },
            };
      const before = withOccurrences(
        worldWithProgramRoot(program, {
          pulse: { execution: 0, lastTriggerEventId: null },
          resolve: { execution: 1, lastTriggerEventId: null },
        }),
        { [scenario.occurrenceId]: occurrence }
      );
      const input = pendingAdvanceInput(
        advanceIntent(program, "pulse", {
          execution: 1,
          kind: "program-phase-end",
          occurrence: ROOT,
          phaseId: "resolve",
          triggerEventId: "event.resolve.1",
        }),
        before
      );
      expect(compileMechanicsFrame(input)).toMatchObject({
        coordination: {
          kind: scenario.coordinationKind,
          occurrences: [
            {
              occurrence: { material: HERO, occurrenceId: scenario.occurrenceId },
              ordinal: 2,
            },
          ],
        },
        segment: null,
        status: "needs-coordination",
      });
    }

    const duplicateProgram = conformed({
      id: "compiler-polymorph-duplicate-target",
      phases: [
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "targets",
              kind: "entities",
              maximum: { kind: "fixed", value: 2 },
              minimum: { kind: "fixed", value: 2 },
              multiplicity: "slots",
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              formId: "wolf",
              kind: "polymorph",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "start-polymorph",
              target: { inputId: "targets", kind: "input" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const duplicateWorld = world();
    const duplicate = pendingCompilationInput(
      reviewed(createIntent(duplicateProgram), duplicateWorld, [
        { inputId: "targets", kind: "entities", targets: [SELF, SELF] },
      ]),
      duplicateWorld
    );
    expect(compileMechanicsFrame(duplicate)).toMatchObject({
      reason: "unresolved-step",
      referenceId: "duplicate-exclusive-target",
      status: "rejected",
      stepId: "start-polymorph",
    });
  });

  it("rejects same-frame exclusive replacement on the following authentic segment", () => {
    for (const kind of ["concentration", "polymorph"] as const) {
      const step = (suffix: string) =>
        kind === "concentration"
          ? {
              kind: "concentration" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: `${suffix}-concentration`,
              when: null,
            }
          : {
              formId: suffix === "first" ? "brown-bear" : "wolf",
              kind: "polymorph" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: `${suffix}-polymorph`,
              target: { kind: "role" as const, role: "target" as const },
              when: null,
            };
      const program = conformed({
        id: `compiler-${kind}-same-frame`,
        phases: [
          {
            inputs: [],
            phaseId: "resolve",
            steps: [step("first"), step("second")],
            trigger: { kind: "invocation" },
          },
        ],
        registers: [],
        version: 1,
      });
      const before = world();
      let input = pendingCompilationInput(
        reviewed(createIntent(program), before),
        before
      );
      const first = compiled(compileMechanicsFrame(input));
      input = withState(input, first.state);
      expect(compileMechanicsFrame(input)).toMatchObject({
        reason: "unresolved-step",
        referenceId: "same-frame-exclusive-replacement",
        status: "rejected",
        stepId: `second-${kind}`,
      });
    }
  });

  it("selects condition ends globally but standing and exclusive ends by exact root/fact", () => {
    const conditionProgram = conformed({
      id: "compiler-global-condition-end",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [
            {
              conditionId: "poisoned",
              kind: "condition",
              lifetime: { kind: "manual" },
              operation: "apply",
              stepId: "seed-poisoned",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              conditionId: "poisoned",
              kind: "condition",
              lifetime: null,
              operation: "remove",
              stepId: "remove-poisoned",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    });
    const currentRoot = programOccurrence(conditionProgram, ROOT.ordinal);
    const otherRoot = programOccurrence(conditionProgram, OTHER_ROOT.ordinal);
    const conditionWorld = withOccurrences(world(1, true), {
      "root-1": currentRoot,
      "root-2": otherRoot,
      earlier: {
        ...effectBase(3, "seed-poisoned", OTHER_ROOT),
        conditionId: "poisoned",
        kind: "condition",
      },
      later: {
        ...effectBase(6, "seed-poisoned"),
        conditionId: "poisoned",
        kind: "condition",
      },
      wrongCondition: {
        ...effectBase(4, "seed-poisoned"),
        conditionId: "prone",
        kind: "condition",
      },
      wrongTarget: {
        ...effectBase(5, "seed-poisoned", ROOT, FAMILIAR),
        conditionId: "poisoned",
        kind: "condition",
      },
    });
    const conditionInput = pendingAdvanceInput(
      advanceIntent(conditionProgram, "resolve", {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "seed",
        triggerEventId: "event.seed.1",
      }),
      conditionWorld
    );
    expect(compileMechanicsFrame(conditionInput)).toMatchObject({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          { occurrence: { occurrenceId: "earlier" }, ordinal: 3 },
          { occurrence: { occurrenceId: "later" }, ordinal: 6 },
        ],
      },
      status: "needs-coordination",
    });

    const mark = {
      kind: "target-mark" as const,
      markId: "quarry",
      marked: { kind: "role" as const, role: "source" as const },
    };
    const standingProgram = conformed({
      id: "compiler-root-scoped-standing-end",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [
            {
              fact: mark,
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "seed-mark",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: mark,
              kind: "standing",
              lifetime: null,
              operation: "end",
              stepId: "end-mark",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    });
    const standingWorld = withOccurrences(
      worldWithProgramRoot(standingProgram, {
        resolve: { execution: 0, lastTriggerEventId: null },
        seed: { execution: 1, lastTriggerEventId: null },
      }),
      {
        "root-2": programOccurrence(standingProgram, OTHER_ROOT.ordinal),
        exact: {
          ...effectBase(3, "seed-mark"),
          fact: { kind: "target-mark", markId: "quarry", marked: SELF },
          kind: "standing",
        },
        otherFact: {
          ...effectBase(4, "seed-mark"),
          fact: { key: "quarry", kind: "active-key" },
          kind: "standing",
        },
        otherRoot: {
          ...effectBase(5, "seed-mark", OTHER_ROOT),
          fact: { kind: "target-mark", markId: "quarry", marked: SELF },
          kind: "standing",
        },
      }
    );
    const standingInput = pendingAdvanceInput(
      advanceIntent(standingProgram, "resolve", {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "seed",
        triggerEventId: "event.seed.1",
      }),
      standingWorld
    );
    expect(compileMechanicsFrame(standingInput)).toMatchObject({
      coordination: {
        kind: "occurrence-end",
        occurrences: [{ occurrence: { occurrenceId: "exact" }, ordinal: 3 }],
      },
      status: "needs-coordination",
    });

    for (const scenario of [
      { formId: null, kind: "concentration", target: FAMILIAR },
      { formId: "wolf", kind: "polymorph", target: SELF },
    ] as const) {
      const start =
        scenario.kind === "concentration"
          ? {
              kind: "concentration" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "seed-exclusive",
              when: null,
            }
          : {
              formId: "wolf",
              kind: "polymorph" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "seed-exclusive",
              target: { kind: "role" as const, role: "target" as const },
              when: null,
            };
      const end =
        scenario.kind === "concentration"
          ? { ...start, lifetime: null, operation: "end" as const, stepId: "end" }
          : { ...start, lifetime: null, operation: "end" as const, stepId: "end" };
      const program = conformed({
        id: `compiler-${scenario.kind}-exact-end`,
        phases: [
          {
            inputs: [],
            phaseId: "seed",
            steps: [start],
            trigger: { kind: "invocation" },
          },
          {
            inputs: [],
            phaseId: "resolve",
            steps: [end],
            trigger: { kind: "program-phase-end", phaseId: "seed" },
          },
        ],
        registers: [],
        version: 1,
      });
      const baseAuthority = authorityReceipt(program);
      const authority =
        scenario.kind === "concentration"
          ? { ...baseAuthority, anchors: { ...baseAuthority.anchors, caster: FAMILIAR } }
          : baseAuthority;
      const occurrence: MechanicOccurrenceSchemaShape =
        scenario.kind === "concentration"
          ? {
              ...effectBase(2, "seed-exclusive", ROOT, scenario.target),
              kind: "concentration",
            }
          : {
              ...effectBase(2, "seed-exclusive", ROOT, scenario.target),
              formId: "wolf",
              kind: "polymorph-form",
            };
      const exactWorld = withOccurrences(world(1, true), {
        "root-1": programOccurrence(program, ROOT.ordinal, authority),
        existing: occurrence,
      });
      const intent = advanceIntent(
        program,
        "resolve",
        {
          execution: 1,
          kind: "program-phase-end",
          occurrence: ROOT,
          phaseId: "seed",
          triggerEventId: "event.seed.1",
        },
        authority
      );
      expect(
        compileMechanicsFrame(pendingAdvanceInput(intent, exactWorld))
      ).toMatchObject({
        coordination: {
          occurrences: [{ occurrence: { occurrenceId: "existing" }, ordinal: 2 }],
        },
        status: "needs-coordination",
      });

      const otherBase = effectBase(3, "seed-exclusive", OTHER_ROOT, scenario.target);
      const otherOccurrence: MechanicOccurrenceSchemaShape =
        scenario.kind === "concentration"
          ? { ...otherBase, kind: "concentration" }
          : { ...otherBase, formId: "wolf", kind: "polymorph-form" };
      const otherRootWorld = withOccurrences(world(1, true), {
        "root-1": programOccurrence(program, ROOT.ordinal, authority),
        "root-2": programOccurrence(program, OTHER_ROOT.ordinal, authority),
        existing: otherOccurrence,
      });
      const noMatch = compiled(
        compileMechanicsFrame(pendingAdvanceInput(intent, otherRootWorld))
      );
      expect(noMatch.transaction).toBeNull();
      expect(noMatch.trace[0]).toMatchObject({ status: "compiled", stepId: "end" });

      if (occurrence.kind === "polymorph-form") {
        const wrongFormWorld = withOccurrences(world(), {
          "root-1": programOccurrence(program, ROOT.ordinal, authority),
          existing: { ...occurrence, formId: "brown-bear" },
        });
        expect(
          compiled(compileMechanicsFrame(pendingAdvanceInput(intent, wrongFormWorld)))
            .transaction
        ).toBeNull();
      }
    }
  });

  it("selects exact direct children across executions, targets, and lifecycle kinds", () => {
    const producer = {
      conditionId: "poisoned",
      kind: "condition" as const,
      lifetime: { kind: "manual" as const },
      operation: "apply" as const,
      stepId: "apply-condition",
      target: { kind: "role" as const, role: "target" as const },
      when: null,
    };
    const program = conformed({
      id: "compiler-direct-children",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [producer, { ...producer, stepId: "other-step" }],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              childStepId: producer.stepId,
              kind: "occurrence-end",
              stepId: "end-produced",
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    });
    const root = programOccurrence(program, ROOT.ordinal);
    root.phaseState.seed = { execution: 2, lastTriggerEventId: null };
    const firstBase = effectBase(4, producer.stepId);
    const secondBase = effectBase(3, producer.stepId, ROOT, FAMILIAR);
    const before = withOccurrences(world(1, true), {
      "root-1": root,
      "root-2": programOccurrence(program, OTHER_ROOT.ordinal),
      first: { ...firstBase, conditionId: "poisoned", kind: "condition" },
      otherRoot: {
        ...effectBase(7, producer.stepId, OTHER_ROOT),
        conditionId: "poisoned",
        kind: "condition",
      },
      second: {
        ...secondBase,
        conditionId: "poisoned",
        kind: "condition",
        origin: { ...secondBase.origin, execution: 2, slot: 1 },
      },
      wrongStep: {
        ...effectBase(6, "other-step"),
        conditionId: "poisoned",
        kind: "condition",
      },
    });
    const intent = advanceIntent(program, "resolve", {
      execution: 2,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "seed",
      triggerEventId: "event.seed.2",
    });
    const result = compileMechanicsFrame(pendingAdvanceInput(intent, before));
    expect(result).toMatchObject({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          { occurrence: { occurrenceId: "first" }, ordinal: 4 },
          { occurrence: { occurrenceId: "second" }, ordinal: 3 },
        ],
      },
      status: "needs-coordination",
    });
    expect(
      result.status === "needs-coordination" &&
        result.coordination.kind !== "boundary" &&
        Object.isFrozen(result.coordination.occurrences)
    ).toBe(true);

    const emptyRoot = programOccurrence(program, ROOT.ordinal);
    emptyRoot.phaseState.seed = { execution: 2, lastTriggerEventId: null };
    const empty = withOccurrences(world(), { "root-1": emptyRoot });
    const noMatch = compiled(compileMechanicsFrame(pendingAdvanceInput(intent, empty)));
    expect(noMatch.transaction).toBeNull();
    expect(noMatch.trace[0]).toMatchObject({
      status: "compiled",
      stepId: "end-produced",
    });

    const lifecycleProgram = conformed({
      id: "compiler-lifecycle-child",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [
            {
              controller: null,
              entityKey: "wolf",
              kind: "entity-create",
              lifetime: { kind: "manual" },
              stepId: "create-wolf",
              template: { kind: "monster", monsterId: "wolf" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              childStepId: "create-wolf",
              kind: "occurrence-end",
              stepId: "dismiss-wolf",
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    });
    const lifecycleWorld = withOccurrences(world(), {
      "root-1": programOccurrence(lifecycleProgram, ROOT.ordinal),
      lifecycle: { ...effectBase(2, "create-wolf"), kind: "material-lifecycle" },
    });
    const lifecycleIntent = advanceIntent(lifecycleProgram, "resolve", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "seed",
      triggerEventId: "event.seed.1",
    });
    expect(
      compileMechanicsFrame(pendingAdvanceInput(lifecycleIntent, lifecycleWorld))
    ).toMatchObject({
      coordination: {
        occurrences: [{ occurrence: { occurrenceId: "lifecycle" }, ordinal: 2 }],
      },
      status: "needs-coordination",
    });
  });

  it("selects effects and direct children created by a prior authentic segment", () => {
    const program = conformed({
      id: "compiler-segment-child-selection",
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
            {
              childStepId: "apply-condition",
              kind: "occurrence-end",
              stepId: "end-condition",
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
    let input = pendingCompilationInput(reviewed(createIntent(program), before), before);
    const created = compiled(compileMechanicsFrame(input));
    expect(created.transaction?.operations).toMatchObject([
      { kind: "occurrence-create" },
    ]);
    input = withState(input, created.state);
    const barrier = compileMechanicsFrame(input);
    const origin = {
      execution: 1,
      kind: "program-step" as const,
      phaseId: "resolve",
      root: ROOT,
      slot: 1,
      stepId: "apply-condition",
    };
    expect(barrier).toMatchObject({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          {
            occurrence: {
              occurrenceId: mechanicsProgramEffectOccurrenceId(origin),
            },
            ordinal: 2,
          },
        ],
      },
      segment: null,
      status: "needs-coordination",
    });

    const standingProgram = conformed({
      id: "compiler-segment-standing-end",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: { key: "ward", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "start-ward",
              target: { kind: "role", role: "target" },
              when: null,
            },
            {
              fact: { key: "ward", kind: "active-key" },
              kind: "standing",
              lifetime: null,
              operation: "end",
              stepId: "end-ward",
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
    const standingWorld = world();
    let standingInput = pendingCompilationInput(
      reviewed(createIntent(standingProgram), standingWorld),
      standingWorld
    );
    const standingCreated = compiled(compileMechanicsFrame(standingInput));
    standingInput = withState(standingInput, standingCreated.state);
    const standingOrigin = {
      execution: 1,
      kind: "program-step" as const,
      phaseId: "resolve",
      root: ROOT,
      slot: 1,
      stepId: "start-ward",
    };
    expect(compileMechanicsFrame(standingInput)).toMatchObject({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          {
            occurrence: {
              occurrenceId: mechanicsProgramEffectOccurrenceId(standingOrigin),
            },
            ordinal: 2,
          },
        ],
      },
      segment: null,
      status: "needs-coordination",
    });
  });

  it("broadcasts and zips standing target marks across exact slots", () => {
    const program = conformed({
      id: "compiler-standing-target-mark",
      phases: [
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "holders",
              kind: "entities",
              maximum: { kind: "fixed", value: 2 },
              minimum: { kind: "fixed", value: 2 },
              multiplicity: "set",
              when: null,
            },
            {
              eligibility: "creature",
              inputId: "marks",
              kind: "entities",
              maximum: { kind: "fixed", value: 2 },
              minimum: FIXED_ONE,
              multiplicity: "set",
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              fact: {
                kind: "target-mark",
                markId: "quarry",
                marked: { inputId: "marks", kind: "input" },
              },
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "mark-targets",
              target: { inputId: "holders", kind: "input" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = world(1, true);
    for (const scenario of [
      { expected: [FAMILIAR, FAMILIAR], marks: [FAMILIAR] },
      { expected: [FAMILIAR, SELF], marks: [FAMILIAR, SELF] },
    ] as const) {
      const value = reviewed(createIntent(program), before, [
        { inputId: "holders", kind: "entities", targets: [SELF, FAMILIAR] },
        { inputId: "marks", kind: "entities", targets: scenario.marks },
      ]);
      const segment = compiled(
        compileMechanicsFrame(pendingCompilationInput(value, before))
      );
      const creates = segment.transaction?.operations.flatMap((operation) =>
        operation.kind === "occurrence-create" ? [operation] : []
      );
      expect(
        creates?.map(({ created, occurrence }) => ({
          fact: occurrence.kind === "standing" ? occurrence.fact : null,
          ordinal: created.ordinal,
          slot: occurrence.origin.slot,
          target: occurrence.target,
        }))
      ).toEqual(
        [FAMILIAR, SELF].map((target, index) => ({
          fact: {
            kind: "target-mark",
            markId: "quarry",
            marked: scenario.expected[index],
          },
          ordinal: index + 2,
          slot: index + 1,
          target,
        }))
      );
    }
  });

  it("derives concentration ownership exclusively from the caster anchor", () => {
    const program = conformed({
      id: "compiler-concentration-owner",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              kind: "concentration",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "start-concentration",
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const base = authorityReceipt(program);
    const authority = { ...base, anchors: { ...base.anchors, caster: FAMILIAR } };
    const before = world(1, true);
    const segment = compiled(
      compileMechanicsFrame(
        pendingCompilationInput(
          reviewed(createIntent(program, authority), before),
          before
        )
      )
    );
    expect(segment.transaction?.operations).toMatchObject([
      { occurrence: { kind: "concentration", target: FAMILIAR } },
    ]);
  });

  it("compiles an advance register step and final receipt in separate segments", () => {
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
    let input = pendingAdvanceInput(
      advanceIntent(program, "pulse", {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "resolve",
        triggerEventId: "event.resolve.1",
      }),
      before
    );
    const register = compiled(compileMechanicsFrame(input));
    expect(register.transaction?.operations).toMatchObject([
      {
        expected: 0,
        kind: "program-register-transition",
        next: 2,
        registerId: "tally",
      },
    ]);
    expect(topMechanicsPendingFrame(register.state)?.cursor).toEqual({
      stage: "phase-transition",
    });

    input = withState(input, register.state);
    const phase = compiled(compileMechanicsFrame(input));
    expect(phase.transaction?.operations).toMatchObject([
      {
        expected: { execution: 0, phaseId: "pulse", triggerEventId: null },
        kind: "program-phase-transition",
        next: {
          execution: 1,
          phaseId: "pulse",
          triggerEventId: "event.resolve.1",
        },
      },
    ]);
    expect(topMechanicsPendingFrame(phase.state)?.cursor).toEqual({
      stage: "phase-complete",
    });
  });

  it("atomically latches a child made due by the final phase CAS", () => {
    const program = conformed({
      id: "compiler-phase-cas-lifetime",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: { key: "phase-child", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "program-phase-end", phaseId: "pulse" },
              operation: "start",
              stepId: "install-child",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "pulse",
          steps: [],
          trigger: { kind: "program-phase-end", phaseId: "resolve" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = withOccurrences(
      worldWithProgramRoot(program, {
        pulse: { execution: 0, lastTriggerEventId: null },
        resolve: { execution: 1, lastTriggerEventId: null },
      }),
      {
        child: {
          endRules: [
            {
              execution: 1,
              kind: "program-phase-end",
              occurrenceId: "root-1",
              phaseId: "pulse",
            },
          ],
          ending: null,
          fact: { key: "phase-child", kind: "active-key" },
          kind: "standing",
          ordinal: 2,
          origin: {
            execution: 1,
            kind: "program-step",
            phaseId: "resolve",
            root: ROOT,
            slot: 1,
            stepId: "install-child",
          },
          parentId: "root-1",
          target: SELF,
        },
      }
    );
    const input = pendingAdvanceInput(
      advanceIntent(program, "pulse", {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "resolve",
        triggerEventId: "event.resolve.1",
      }),
      before
    );

    const phase = compiled(compileMechanicsFrame(input));

    expect(topMechanicsPendingFrame(phase.state)?.cursor).toEqual({
      stage: "phase-complete",
    });
    expect(phase.state.context.endWave?.wave.candidates).toEqual([
      {
        causes: [
          {
            completion: {
              execution: 1,
              phaseId: "pulse",
              root: ROOT,
            },
            kind: "program-phase-completed",
          },
        ],
        occurrence: {
          occurrence: { material: HERO, occurrenceId: "child" },
          ordinal: 2,
        },
      },
    ]);
  });

  it("compiles a phase-end subscriber from the exact latched causal state", () => {
    const program = conformed({
      id: "compiler-latched-phase-end",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: { key: "phase-child", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "program-phase-end", phaseId: "pulse" },
              operation: "start",
              stepId: "install-child",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "pulse",
          steps: [],
          trigger: { kind: "program-phase-end", phaseId: "resolve" },
        },
        {
          inputs: [],
          phaseId: "after",
          steps: [
            {
              kind: "register",
              operation: { kind: "add", value: FIXED_ONE },
              registerId: "tally",
              stepId: "count-after",
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "pulse" },
        },
      ],
      registers: [{ initial: 0, registerId: "tally" }],
      version: 1,
    });
    const authority = authorityReceipt(program);
    const state = phaseEndCausalState(program, authority);
    const intent = advanceIntent(
      program,
      "after",
      {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "pulse",
        triggerEventId: "pulse-event-1",
      },
      authority
    );
    expect(reviewMechanicsIntent(intent, [], state.world)).toMatchObject({
      reason: "invalid-world",
      status: "rejected",
    });
    const input = pendingInputFromState(intent, state);
    const segment = compiled(compileMechanicsFrame(input));
    expect(segment.transaction?.operations).toMatchObject([
      { kind: "program-register-transition", registerId: "tally" },
    ]);
    expect(segment.state.context.endWave?.wave.candidates).toMatchObject([
      { occurrence: { occurrence: { occurrenceId: "child" }, ordinal: 2 } },
    ]);

    const forged = {
      ...input.state,
      context: {
        ...input.state.context,
        request: { ...input.state.context.request, extra: [] },
      },
    } as unknown as MechanicsCausalState;
    expect(compileMechanicsFrame(withState(input, forged))).toMatchObject({
      reason: "invalid-state",
      status: "rejected",
    });
  });

  it("keeps unguarded turn claims fail-closed at the exact current step", () => {
    const program = conformed({
      id: "compiler-unsupported",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              claim: {
                claimId: "dodge-claim",
                action: { kind: "dodge" },
                kind: "claim-action",
              },
              combatant: "owner",
              kind: "turn-claim",
              stepId: "claim-dodge",
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
    const input = pendingCompilationInput(
      reviewed(createIntent(program), before),
      before
    );

    expect(compileMechanicsFrame(input)).toEqual({
      operationId: null,
      phaseId: "resolve",
      reason: "missing-compiler-fact",
      referenceId: "turn-economy-projection",
      status: "rejected",
      stepId: "claim-dodge",
    });
    expect(topMechanicsPendingFrame(input.state)?.cursor).toEqual({
      nextSlot: 1,
      stage: "step",
      stepIndex: 0,
    });
  });

  it("compiles an empty phase as only the final CAS and leaves popping to the coordinator", () => {
    const program = conformed({
      id: "compiler-empty-phase",
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
    const before = world();
    const input = pendingCompilationInput(
      reviewed(createIntent(program), before),
      before
    );
    expect(topMechanicsPendingFrame(input.state)?.cursor).toEqual({
      stage: "phase-transition",
    });

    const segment = compiled(compileMechanicsFrame(input));
    expect(segment.transaction?.operations).toHaveLength(1);
    expect(segment.transaction?.operations[0]).toMatchObject({
      kind: "program-phase-transition",
    });
    expect(segment.trace).toEqual([]);
    expect(topMechanicsPendingFrame(segment.state)?.cursor).toEqual({
      stage: "phase-complete",
    });
  });
});
