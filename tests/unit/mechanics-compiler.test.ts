import { describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { compileMechanicsFrame } from "@/lib/mechanics-compiler";
import { deriveMechanicsPostEvents } from "@/lib/mechanics-execution";
import { mechanicsProgramEffectOccurrenceId } from "@/lib/mechanics-program-effects";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import {
  reviewMechanicsIntent,
  reviewMechanicsIntentFromCausalState,
} from "@/lib/mechanics-program";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import {
  beginMechanicsCausalState,
  parseMechanicsWorld,
  rebaseMechanicsCausalState,
} from "@/lib/mechanics-world";
import type { MechanicOccurrence, ProgramPhaseState } from "@/types/mechanic-occurrence";
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
import type {
  MechanicsAnswer,
  MechanicsIntent,
  ReviewedMechanicsIntent,
} from "@/types/mechanics-program";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
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

function withOccurrences(
  snapshot: Readonly<MechanicsWorld>,
  occurrences: Readonly<Record<string, Readonly<MechanicOccurrence>>>
): MechanicsWorld {
  const candidate = structuredClone(snapshot);
  const document = candidate.documents[0];
  if (document?.kind !== "character") throw new Error("occurrence fixture");
  document.state.occurrences = { ...document.state.occurrences, ...occurrences };
  document.state.nextOccurrenceOrdinal =
    Math.max(...Object.values(document.state.occurrences).map(({ ordinal }) => ordinal)) +
    1;
  const parsed = parseMechanicsWorld(candidate);
  if (!parsed.ok) throw new Error(`occurrence fixture: ${parsed.reason}`);
  return parsed.value;
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
  trigger: EmittedMechanicsTriggerEvidence,
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
  const result = reviewMechanicsIntent(intent, answers, snapshot);
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

function compilationInputFromState(
  value: Readonly<ReviewedMechanicsIntent>,
  state: Readonly<MechanicsCausalState>
): CompileMechanicsFrameInput {
  return {
    authoritySnapshot: authoritySnapshot(value.intent.frame.authority),
    facts: [],
    responses: [],
    reviewed: value,
    state,
  };
}

function reviewedFromState(
  intent: Readonly<MechanicsIntent>,
  state: Readonly<MechanicsCausalState>
): Readonly<ReviewedMechanicsIntent> {
  const result = reviewMechanicsIntentFromCausalState(intent, [], state);
  if (result.status !== "reviewed") {
    throw new Error(`intent fixture was rejected: ${JSON.stringify(result)}`);
  }
  return result.reviewed;
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
  document.state.nextOccurrenceOrdinal = 3;
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
    const phaseTransition = first.transaction.operations[0];
    expect(phaseTransition.kind).toBe("program-state-transition");
    expect(first.events).toEqual(deriveMechanicsPostEvents(first.simulation.stages));
    expect(first.events).toEqual([
      {
        eventId: `event:${canonicalFingerprint({
          kind: "program-phase-end",
          operationId: phaseTransition.operationId,
          subject: { execution: 1, occurrence: ROOT, phaseId: "resolve" },
        })}`,
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        operationId: phaseTransition.operationId,
        phaseId: "resolve",
      },
    ]);
  });

  it("creates exact deterministic condition occurrences with durable provenance", () => {
    const program = conformed({
      id: "compiler-condition-start",
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
    const proposed = createIntent(program);
    const input = compilationInput(
      reviewed(proposed, before, [
        { inputId: "targets", kind: "entities", targets: [SELF, FAMILIAR] },
      ]),
      before
    );

    const first = compiled(compileMechanicsFrame(input));
    const second = compileMechanicsFrame(input);
    const rootInvocation = { kind: "program-root", occurrence: ROOT } as const;
    const causeId = canonicalFingerprint({
      authority: proposed.frame.authority,
      invocation: rootInvocation,
    });
    const expected = [FAMILIAR, SELF].map((target, index) => {
      const slot = index + 1;
      const origin = {
        execution: 1,
        kind: "program-step" as const,
        phaseId: "resolve",
        root: ROOT,
        slot,
        stepId: "apply-condition",
      };
      return {
        causeId,
        conditionImmunityOverride: null,
        created: {
          occurrence: {
            material: HERO,
            occurrenceId: mechanicsProgramEffectOccurrenceId(origin),
          },
          ordinal: slot + 1,
        },
        kind: "occurrence-create",
        occurrence: {
          conditionId: "poisoned",
          endRules: [],
          kind: "condition",
          origin,
          parentId: "root-1",
          target,
        },
        operationId: canonicalFingerprint({
          actionId: "action-1",
          execution: 1,
          kind: "occurrence-create",
          phaseId: "resolve",
          root: ROOT,
          slot,
          stepId: "apply-condition",
        }),
        parent: ROOT,
      } as const;
    });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.transaction.operations.slice(1)).toEqual(expected);
    expect(first.trace).toMatchObject([
      {
        operationIds: expected.map(({ operationId }) => operationId),
        status: "compiled",
        stepId: "apply-condition",
      },
    ]);
    expect(
      first.trace[0]?.executions.map(({ kind, operationId, status }) => ({
        kind,
        operationId,
        status,
      }))
    ).toEqual(
      expected.map(({ operationId }) => ({
        kind: "occurrence-create",
        operationId,
        status: "applied",
      }))
    );
  });

  it("reuses the unspent ordinal when condition immunity makes every create a no-change", () => {
    const program = conformed({
      id: "compiler-condition-immunity",
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
    const proposed = advanceIntent(program, "pulse", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "resolve",
      triggerEventId: "program.root-1.resolve.1",
    });
    const result = compiled(
      compileMechanicsFrame(
        compilationInput(
          reviewed(proposed, before, [
            { inputId: "targets", kind: "entities", targets: [SELF, SELF] },
          ]),
          before
        )
      )
    );
    const creates = result.transaction.operations.flatMap((operation) =>
      operation.kind === "occurrence-create" && operation.occurrence.kind === "condition"
        ? [
            {
              occurrenceId: operation.created.occurrence.occurrenceId,
              ordinal: operation.created.ordinal,
            },
          ]
        : []
    );
    const following = result.transaction.operations.find(
      (operation) =>
        operation.kind === "occurrence-create" && operation.occurrence.kind === "standing"
    );

    expect(creates.map(({ ordinal }) => ordinal)).toEqual([3, 3]);
    expect(new Set(creates.map(({ occurrenceId }) => occurrenceId)).size).toBe(2);
    expect(result.trace[0]?.executions).toMatchObject([
      { reason: "condition-immune", status: "no-change" },
      { reason: "condition-immune", status: "no-change" },
    ]);
    expect(following).toMatchObject({ created: { ordinal: 3 } });
    const document = result.simulation.state.world.documents[0];
    expect(document?.state.nextOccurrenceOrdinal).toBe(4);
    expect(Object.keys(document?.state.occurrences ?? {})).toHaveLength(3);
  });

  it("returns exact replacement coordination for concentration and polymorph starts", () => {
    for (const scenario of [
      {
        coordinationKind: "concentration-replacement",
        effectKind: "concentration",
        existingFormId: null,
        occurrenceId: "existing-concentration",
      },
      {
        coordinationKind: "occurrence-end",
        effectKind: "polymorph",
        existingFormId: "brown-bear",
        occurrenceId: "existing-polymorph",
      },
    ] as const) {
      const existingStep =
        scenario.effectKind === "concentration"
          ? {
              kind: "concentration" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "start-existing-concentration",
              when: null,
            }
          : {
              formId: scenario.existingFormId,
              kind: "polymorph" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "start-existing-polymorph",
              target: { kind: "role" as const, role: "target" as const },
              when: null,
            };
      const step =
        scenario.effectKind === "concentration"
          ? {
              kind: "concentration" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "start-concentration",
              when: null,
            }
          : {
              formId: "wolf",
              kind: "polymorph" as const,
              lifetime: { kind: "manual" as const },
              operation: "start" as const,
              stepId: "start-polymorph",
              target: { kind: "role" as const, role: "target" as const },
              when: null,
            };
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
            steps: [step],
            trigger: { kind: "program-phase-end", phaseId: "resolve" },
          },
        ],
        registers: [],
        version: 1,
      });
      const common = {
        endRules: [],
        ending: null,
        ordinal: 2,
        origin: {
          execution: 1,
          kind: "program-step" as const,
          phaseId: "resolve",
          root: ROOT,
          slot: 1,
          stepId: existingStep.stepId,
        },
        parentId: "root-1",
        target: SELF,
      };
      const occurrence: MechanicOccurrence =
        scenario.effectKind === "concentration"
          ? { ...common, kind: "concentration" }
          : {
              ...common,
              formId: scenario.existingFormId,
              kind: "polymorph-form",
            };
      const before = withOccurrences(
        worldWithProgramRoot(program, {
          pulse: { execution: 0, lastTriggerEventId: null },
          resolve: { execution: 1, lastTriggerEventId: null },
        }),
        { [scenario.occurrenceId]: occurrence }
      );
      const proposed = advanceIntent(program, "pulse", {
        execution: 1,
        kind: "program-phase-end",
        occurrence: ROOT,
        phaseId: "resolve",
        triggerEventId: "program.root-1.resolve.1",
      });

      expect(
        compileMechanicsFrame(compilationInput(reviewed(proposed, before), before))
      ).toEqual({
        coordination: {
          kind: scenario.coordinationKind,
          occurrences: [
            {
              occurrence: { material: HERO, occurrenceId: scenario.occurrenceId },
              ordinal: 2,
            },
          ],
        },
        status: "needs-coordination",
      });
    }
  });

  it("rejects a second same-frame start of one exclusive effect", () => {
    for (const effectKind of ["concentration", "polymorph"] as const) {
      const steps = ["first", "second"].map((suffix) =>
        effectKind === "concentration"
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
            }
      );
      const program = conformed({
        id: `compiler-${effectKind}-same-frame-replacement`,
        phases: [
          {
            inputs: [],
            phaseId: "resolve",
            steps,
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
        reason: "unresolved-step",
        referenceId: "same-frame-exclusive-replacement",
        status: "rejected",
        stepId: `second-${effectKind}`,
      });
    }
  });

  it("rejects duplicate targets for a polymorph start", () => {
    const step = {
      formId: "wolf",
      kind: "polymorph" as const,
      lifetime: { kind: "manual" as const },
      operation: "start" as const,
      stepId: "start-polymorph",
      target: { inputId: "targets", kind: "input" as const },
      when: null,
    };
    const program = conformed({
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
          steps: [step],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = world();

    const result = compileMechanicsFrame(
      compilationInput(
        reviewed(createIntent(program), before, [
          { inputId: "targets", kind: "entities", targets: [SELF, SELF] },
        ]),
        before
      )
    );
    expect(result).toEqual({
      operationId: null,
      phaseId: "resolve",
      reason: "unresolved-step",
      referenceId: "duplicate-exclusive-target",
      status: "rejected",
      stepId: "start-polymorph",
    });
  });

  it("derives the sole concentration owner from the caster role", () => {
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
    const before = world(1, true);
    const result = compiled(
      compileMechanicsFrame(
        compilationInput(reviewed(createIntent(program), before), before)
      )
    );

    const created = result.transaction.operations.find(
      (operation) =>
        operation.kind === "occurrence-create" &&
        operation.occurrence.kind === "concentration"
    );
    expect(created?.kind).toBe("occurrence-create");
    if (created?.kind !== "occurrence-create") return;
    expect(created.occurrence).toMatchObject({ kind: "concentration", target: SELF });
  });

  it("removes exact conditions globally across roots in canonical order", () => {
    const program = conformed({
      id: "compiler-condition-remove",
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
    const before = withOccurrences(world(1, true), {
      "root-1": programOccurrence(program, ROOT.ordinal),
      "root-2": programOccurrence(program, OTHER_ROOT.ordinal),
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
      "wrong-condition": {
        ...effectBase(4, "seed-poisoned"),
        conditionId: "prone",
        kind: "condition",
      },
      "wrong-target": {
        ...effectBase(5, "seed-poisoned", ROOT, FAMILIAR),
        conditionId: "poisoned",
        kind: "condition",
      },
    });
    const proposed = advanceIntent(program, "resolve", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "seed",
      triggerEventId: "program.root-1.seed.1",
    });

    expect(
      compileMechanicsFrame(compilationInput(reviewed(proposed, before), before))
    ).toEqual({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          { occurrence: { material: HERO, occurrenceId: "earlier" }, ordinal: 3 },
          { occurrence: { material: HERO, occurrenceId: "later" }, ordinal: 6 },
        ],
      },
      status: "needs-coordination",
    });
  });

  it("ends a standing fact only for the current root and fully materialized fact", () => {
    const fact = {
      kind: "target-mark" as const,
      markId: "quarry",
      marked: { kind: "role" as const, role: "source" as const },
    };
    const program = conformed({
      id: "compiler-standing-end",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [
            {
              fact,
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
              fact,
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
    const before = withOccurrences(
      worldWithProgramRoot(program, {
        resolve: { execution: 0, lastTriggerEventId: null },
        seed: { execution: 1, lastTriggerEventId: null },
      }),
      {
        "root-2": programOccurrence(program, OTHER_ROOT.ordinal),
        exact: {
          ...effectBase(3, "seed-mark"),
          fact: { kind: "target-mark", markId: "quarry", marked: SELF },
          kind: "standing",
        },
        "other-fact": {
          ...effectBase(4, "seed-mark"),
          fact: { key: "quarry", kind: "active-key" },
          kind: "standing",
        },
        "other-root": {
          ...effectBase(5, "seed-mark", OTHER_ROOT),
          fact: { kind: "target-mark", markId: "quarry", marked: SELF },
          kind: "standing",
        },
      }
    );
    const proposed = advanceIntent(program, "resolve", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "seed",
      triggerEventId: "program.root-1.seed.1",
    });

    expect(
      compileMechanicsFrame(compilationInput(reviewed(proposed, before), before))
    ).toEqual({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          { occurrence: { material: HERO, occurrenceId: "exact" }, ordinal: 3 },
        ],
      },
      status: "needs-coordination",
    });
  });

  it("ends concentration by canonical caster and polymorph by exact form", () => {
    for (const scenario of [
      {
        end: {
          kind: "concentration" as const,
          lifetime: null,
          operation: "end" as const,
          stepId: "end-concentration",
          when: null,
        },
        existing: {
          ...effectBase(2, "seed-concentration"),
          kind: "concentration" as const,
        },
        id: "concentration",
        start: {
          kind: "concentration" as const,
          lifetime: { kind: "manual" as const },
          operation: "start" as const,
          stepId: "seed-concentration",
          when: null,
        },
      },
      {
        end: {
          formId: "wolf",
          kind: "polymorph" as const,
          lifetime: null,
          operation: "end" as const,
          stepId: "end-polymorph",
          target: { kind: "role" as const, role: "target" as const },
          when: null,
        },
        existing: {
          ...effectBase(2, "seed-polymorph"),
          formId: "wolf",
          kind: "polymorph-form" as const,
        },
        id: "polymorph",
        start: {
          formId: "wolf",
          kind: "polymorph" as const,
          lifetime: { kind: "manual" as const },
          operation: "start" as const,
          stepId: "seed-polymorph",
          target: { kind: "role" as const, role: "target" as const },
          when: null,
        },
      },
    ] as const) {
      const program = conformed({
        id: `compiler-${scenario.id}-end`,
        phases: [
          {
            inputs: [],
            phaseId: "seed",
            steps: [scenario.start],
            trigger: { kind: "invocation" },
          },
          {
            inputs: [],
            phaseId: "resolve",
            steps: [scenario.end],
            trigger: { kind: "program-phase-end", phaseId: "seed" },
          },
        ],
        registers: [],
        version: 1,
      });
      const baseAuthority = authorityReceipt(program);
      const authority =
        scenario.id === "concentration"
          ? {
              ...baseAuthority,
              anchors: { ...baseAuthority.anchors, caster: FAMILIAR },
            }
          : baseAuthority;
      const target = scenario.id === "concentration" ? FAMILIAR : SELF;
      const before = withOccurrences(world(1, scenario.id === "concentration"), {
        "root-1": programOccurrence(program, ROOT.ordinal, authority),
        existing: {
          ...scenario.existing,
          ...effectBase(2, scenario.start.stepId, ROOT, target),
        },
      });
      const proposed = advanceIntent(
        program,
        "resolve",
        {
          execution: 1,
          kind: "program-phase-end",
          occurrence: ROOT,
          phaseId: "seed",
          triggerEventId: "program.root-1.seed.1",
        },
        authority
      );

      expect(
        compileMechanicsFrame(compilationInput(reviewed(proposed, before), before))
      ).toEqual({
        coordination: {
          kind: "occurrence-end",
          occurrences: [
            { occurrence: { material: HERO, occurrenceId: "existing" }, ordinal: 2 },
          ],
        },
        status: "needs-coordination",
      });

      const otherRootOnly = withOccurrences(world(1, scenario.id === "concentration"), {
        "root-1": programOccurrence(program, ROOT.ordinal, authority),
        "root-2": programOccurrence(program, OTHER_ROOT.ordinal, authority),
        existing: {
          ...scenario.existing,
          ...effectBase(3, scenario.start.stepId, OTHER_ROOT, target),
        },
      });
      const noMatch = compiled(
        compileMechanicsFrame(
          compilationInput(reviewed(proposed, otherRootOnly), otherRootOnly)
        )
      );
      expect(noMatch.trace).toEqual([
        {
          executions: [],
          operationIds: [],
          status: "compiled",
          stepId: scenario.end.stepId,
        },
      ]);

      if (scenario.id === "polymorph") {
        const wrongForm = withOccurrences(world(), {
          "root-1": programOccurrence(program, ROOT.ordinal, authority),
          existing: {
            ...scenario.existing,
            ...effectBase(2, scenario.start.stepId),
            formId: "brown-bear",
          },
        });
        expect(
          compiled(
            compileMechanicsFrame(
              compilationInput(reviewed(proposed, wrongForm), wrongForm)
            )
          ).trace
        ).toEqual([
          {
            executions: [],
            operationIds: [],
            status: "compiled",
            stepId: scenario.end.stepId,
          },
        ]);
      }
    }
  });

  it("compiles an exact zero-match effect end as an idempotent no-op", () => {
    const program = conformed({
      id: "compiler-effect-end-no-match",
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
              stepId: "remove-absent-condition",
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
    const result = compiled(
      compileMechanicsFrame(
        compilationInput(reviewed(createIntent(program), before), before)
      )
    );

    expect(result.transaction.operations).toMatchObject([
      { kind: "program-state-transition", receipt: { kind: "create" } },
    ]);
    expect(result.trace).toEqual([
      {
        executions: [],
        operationIds: [],
        status: "compiled",
        stepId: "remove-absent-condition",
      },
    ]);
  });

  it("selects effect ends from the projected prefix before exposing the barrier", () => {
    const program = conformed({
      id: "compiler-projected-effect-end",
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
    const before = world();
    const origin = {
      execution: 1,
      kind: "program-step" as const,
      phaseId: "resolve",
      root: ROOT,
      slot: 1,
      stepId: "start-ward",
    };

    expect(
      compileMechanicsFrame(
        compilationInput(reviewed(createIntent(program), before), before)
      )
    ).toEqual({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          {
            occurrence: {
              material: HERO,
              occurrenceId: mechanicsProgramEffectOccurrenceId(origin),
            },
            ordinal: 2,
          },
        ],
      },
      status: "needs-coordination",
    });
  });

  it("freezes every active direct child across executions, slots and targets", () => {
    const producer = {
      conditionId: "poisoned",
      kind: "condition" as const,
      lifetime: { kind: "manual" as const },
      operation: "apply" as const,
      stepId: "apply-condition",
      target: { kind: "role" as const, role: "target" as const },
      when: null,
    };
    const otherProducer = { ...producer, stepId: "apply-other-condition" };
    const program = conformed({
      id: "compiler-occurrence-end-children",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [producer, otherProducer],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              childStepId: producer.stepId,
              kind: "occurrence-end",
              stepId: "end-produced-conditions",
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    });
    const firstBase = effectBase(4, producer.stepId, ROOT, SELF);
    const secondBase = effectBase(3, producer.stepId, ROOT, FAMILIAR);
    const currentRoot = programOccurrence(program, ROOT.ordinal);
    currentRoot.phaseState.seed = { execution: 2, lastTriggerEventId: null };
    const before = withOccurrences(world(1, true), {
      "root-1": currentRoot,
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
        ...effectBase(6, otherProducer.stepId),
        conditionId: "poisoned",
        kind: "condition",
      },
    });
    const proposed = advanceIntent(program, "resolve", {
      execution: 2,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "seed",
      triggerEventId: "program.root-1.seed.2",
    });
    const result = compileMechanicsFrame(
      compilationInput(reviewed(proposed, before), before)
    );

    expect(result).toEqual({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          { occurrence: { material: HERO, occurrenceId: "first" }, ordinal: 4 },
          { occurrence: { material: HERO, occurrenceId: "second" }, ordinal: 3 },
        ],
      },
      status: "needs-coordination",
    });
    expect(
      result.status === "needs-coordination" &&
        Object.isFrozen(result.coordination.occurrences)
    ).toBe(true);

    const emptyRoot = programOccurrence(program, ROOT.ordinal);
    emptyRoot.phaseState.seed = { execution: 2, lastTriggerEventId: null };
    const empty = withOccurrences(world(), { "root-1": emptyRoot });
    const noMatch = compiled(
      compileMechanicsFrame(compilationInput(reviewed(proposed, empty), empty))
    );
    expect(noMatch.trace).toEqual([
      {
        executions: [],
        operationIds: [],
        status: "compiled",
        stepId: "end-produced-conditions",
      },
    ]);
  });

  it("selects direct children created in the projected prefix", () => {
    const program = conformed({
      id: "compiler-projected-occurrence-end",
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
              stepId: "end-condition-children",
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
    const origin = {
      execution: 1,
      kind: "program-step" as const,
      phaseId: "resolve",
      root: ROOT,
      slot: 1,
      stepId: "apply-condition",
    };

    expect(
      compileMechanicsFrame(
        compilationInput(reviewed(createIntent(program), before), before)
      )
    ).toEqual({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          {
            occurrence: {
              material: HERO,
              occurrenceId: mechanicsProgramEffectOccurrenceId(origin),
            },
            ordinal: 2,
          },
        ],
      },
      status: "needs-coordination",
    });
  });

  it("selects material-lifecycle children through the same occurrence-end seam", () => {
    const program = conformed({
      id: "compiler-material-lifecycle-end",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [
            {
              controller: null,
              entityKey: "summoned-wolf",
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
              stepId: "dismiss-created-wolves",
              when: null,
            },
          ],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = withOccurrences(world(), {
      "root-1": programOccurrence(program, ROOT.ordinal),
      lifecycle: {
        ...effectBase(2, "create-wolf"),
        kind: "material-lifecycle",
      },
    });
    const proposed = advanceIntent(program, "resolve", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "seed",
      triggerEventId: "program.root-1.seed.1",
    });

    expect(
      compileMechanicsFrame(compilationInput(reviewed(proposed, before), before))
    ).toEqual({
      coordination: {
        kind: "occurrence-end",
        occurrences: [
          { occurrence: { material: HERO, occurrenceId: "lifecycle" }, ordinal: 2 },
        ],
      },
      status: "needs-coordination",
    });
  });

  it("broadcasts and zips standing target marks across compiled slots", () => {
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
      { expectedMarks: [FAMILIAR, FAMILIAR], marks: [FAMILIAR] },
      { expectedMarks: [FAMILIAR, SELF], marks: [FAMILIAR, SELF] },
    ] as const) {
      const result = compiled(
        compileMechanicsFrame(
          compilationInput(
            reviewed(createIntent(program), before, [
              {
                inputId: "holders",
                kind: "entities",
                targets: [SELF, FAMILIAR],
              },
              { inputId: "marks", kind: "entities", targets: scenario.marks },
            ]),
            before
          )
        )
      );
      const creates = result.transaction.operations.filter(
        (operation) => operation.kind === "occurrence-create"
      );

      expect(
        creates.map(({ created, occurrence }) => ({
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
            marked: scenario.expectedMarks[index],
          },
          ordinal: index + 2,
          slot: index + 1,
          target,
        }))
      );
    }
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
    const proposed = advanceIntent(program, "pulse", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "resolve",
      triggerEventId: "program.root-1.resolve.1",
    });
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
    const proposed = advanceIntent(
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
    const reviewedIntent = reviewedFromState(proposed, state);
    expect(reviewMechanicsIntent(proposed, [], state.world)).toMatchObject({
      reason: "invalid-world",
      status: "rejected",
    });

    const result = compiled(
      compileMechanicsFrame(compilationInputFromState(reviewedIntent, state))
    );
    expect(result.transaction.operations).toMatchObject([
      { kind: "program-register-transition", registerId: "tally" },
      { kind: "program-state-transition", receipt: { kind: "advance" } },
    ]);
    expect(result.simulation.state.context.endWave?.wave.candidates).toMatchObject([
      { occurrence: { occurrence: { occurrenceId: "child" }, ordinal: 2 } },
    ]);

    const forged = {
      ...state,
      context: { ...state.context, request: { ...state.context.request, extra: [] } },
    } as unknown as MechanicsCausalState;
    expect(
      compileMechanicsFrame(compilationInputFromState(reviewedIntent, forged))
    ).toMatchObject({ reason: "invalid-state", status: "rejected" });
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
              delivery: "automatic",
              kind: "damage",
              parts: [
                {
                  amount: { expression: FIXED_ONE, kind: "integer" },
                  damageType: "fire",
                  partId: "fire",
                },
              ],
              stepId: "deal-damage",
              target: { kind: "role", role: "target" },
              traits: ["spell"],
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
      referenceId: "damage",
      status: "rejected",
      stepId: "deal-damage",
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
    const proposedAdvance = advanceIntent(program, "pulse", {
      execution: 1,
      kind: "program-phase-end",
      occurrence: ROOT,
      phaseId: "resolve",
      triggerEventId: "program.root-1.resolve.1",
    });
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
