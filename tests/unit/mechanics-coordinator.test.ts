import { describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import {
  beginMechanicsCausalState,
  parseMechanicsWorld,
  pushMechanicsPendingFrame,
} from "@/lib/mechanics-world";
import type {
  MechanicsAuthorityDefinition,
  MechanicsAuthoritySnapshot,
} from "@/types/mechanics-authority";
import type { MechanicsCoordinationInput } from "@/types/mechanics-coordinator";
import type { MechanicOccurrence } from "@/types/mechanic-occurrence";
import type { MechanicsAnswer, MechanicsIntent } from "@/types/mechanics-program";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsCausalState, MechanicsWorld } from "@/types/mechanics-world";

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

function world(occurrences: Record<string, MechanicOccurrence> = {}): MechanicsWorld {
  const base = createEmptyCharacterMaterialState(5, HERO, {
    hitPoints: {
      current: 20,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  });
  const nextOccurrenceOrdinal =
    Math.max(0, ...Object.values(occurrences).map(({ ordinal }) => ordinal)) + 1;
  const parsed = parseMechanicsWorld({
    documents: [
      {
        kind: "character",
        material: HERO,
        state: { ...base, nextOccurrenceOrdinal, occurrences },
      },
    ],
    scope: HERO,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function causalState(snapshot: MechanicsWorld): Readonly<MechanicsCausalState> {
  const begun = beginMechanicsCausalState(snapshot);
  if (!begun.ok) throw new Error(`causal fixture was rejected: ${begun.reason}`);
  return begun.value;
}

function createIntent(
  program: MechanicsProgram,
  firstPhaseId: string,
  authority = authorityReceipt(program)
): MechanicsIntent {
  return {
    actionId: "coordinated-action",
    factGuards: [],
    frame: {
      authority,
      invocation: { installation: authority.installation, kind: "installed-capability" },
      rootReceipt: {
        kind: "create",
        materialEpoch: 0,
        next: { execution: 1, phaseId: firstPhaseId, triggerEventId: null },
        root: ROOT,
      },
      trigger: { kind: "invocation" },
    },
  };
}

function actionInput(
  program: MechanicsProgram,
  snapshot: MechanicsWorld,
  overrides: Partial<MechanicsCoordinationInput> = {}
): MechanicsCoordinationInput {
  const authority = authorityReceipt(program);
  return {
    answers: [],
    authoritySnapshot: authoritySnapshot(authority),
    facts: [],
    frameAnswers: [],
    intent: createIntent(program, program.phases[0].phaseId, authority),
    responses: [],
    state: causalState(snapshot),
    ...overrides,
  };
}

function heroState(state: Readonly<MechanicsCausalState>) {
  const document = state.world.documents[0];
  if (!document || document.kind !== "character") throw new Error("state fixture");
  return document.state;
}

const CASCADE_PROGRAM = {
  id: "coordinated-cascade",
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
          stepId: "apply-poison",
          target: { kind: "role", role: "target" },
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
          fact: { key: "pulse-standing", kind: "active-key" },
          kind: "standing",
          lifetime: { kind: "manual" },
          operation: "start",
          stepId: "start-standing",
          target: { kind: "role", role: "target" },
          when: null,
        },
      ],
      trigger: { kind: "program-phase-end", phaseId: "resolve" },
    },
  ],
  registers: [],
  version: 1,
} as const;

describe("runMechanicsCausalAction", () => {
  it("runs a phase-end cascade to its fixed point in one action", () => {
    const program = conformed(CASCADE_PROGRAM);
    const result = runMechanicsCausalAction(actionInput(program, world()));
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const state = heroState(result.state);
    const root = state.occurrences["root-1"];
    expect(root).toMatchObject({
      kind: "program",
      phaseState: {
        pulse: { execution: 1 },
        resolve: { execution: 1, lastTriggerEventId: null },
      },
    });
    if (root?.kind !== "program") return;
    expect(root.phaseState.pulse?.lastTriggerEventId).not.toBeNull();
    const kinds = Object.values(state.occurrences)
      .map(({ kind }) => kind)
      .sort();
    expect(kinds).toEqual(["condition", "program", "standing"]);
    expect(result.state.context.pendingFrames).toEqual([]);
    expect(result.state.context.endWave).toBeNull();

    expect(
      result.trace.map(({ frame, trace }) => [
        frame.phaseId,
        ...trace.map(({ stepId }) => stepId),
      ])
    ).toEqual([
      ["resolve", "apply-poison"],
      ["pulse", "start-standing"],
    ]);

    expect(result.action).not.toBeNull();
    expect(result.action).toMatchObject({
      actor: SELF,
      id: "coordinated-action",
    });
    const mutatedPaths = result.action?.mutations.map(({ path }) => path[0]) ?? [];
    expect(mutatedPaths).toContain("occurrences");
  });

  it("replaces an older root's concentration through wave coordination", () => {
    const program = conformed({
      id: "coordinated-concentration",
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
    const oldProgram = conformed({
      id: "older-source",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              kind: "concentration",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "old-concentration",
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const oldAuthority = authorityReceipt(oldProgram);
    const snapshot = world({
      "old-root": {
        authority: oldAuthority,
        endRules: [],
        ending: null,
        kind: "program",
        ordinal: 1,
        phaseState: { resolve: { execution: 1, lastTriggerEventId: null } },
        registers: {},
      },
      "old-concentration": {
        endRules: [],
        ending: null,
        kind: "concentration",
        ordinal: 2,
        origin: {
          execution: 1,
          kind: "program-step",
          phaseId: "resolve",
          root: {
            occurrence: { material: HERO, occurrenceId: "old-root" },
            ordinal: 1,
          },
          slot: 1,
          stepId: "old-concentration",
        },
        parentId: "old-root",
        target: SELF,
      },
    });
    const intent: MechanicsIntent = {
      actionId: "coordinated-action",
      factGuards: [],
      frame: {
        authority: authorityReceipt(program),
        invocation: {
          installation: authorityReceipt(program).installation,
          kind: "installed-capability",
        },
        rootReceipt: {
          kind: "create",
          materialEpoch: 0,
          next: { execution: 1, phaseId: "resolve", triggerEventId: null },
          root: {
            occurrence: { material: HERO, occurrenceId: "new-root" },
            ordinal: 3,
          },
        },
        trigger: { kind: "invocation" },
      },
    };
    const result = runMechanicsCausalAction(actionInput(program, snapshot, { intent }));
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const state = heroState(result.state);
    expect(state.occurrences["old-concentration"]).toBeUndefined();
    expect(state.occurrences["old-root"]).toMatchObject({ kind: "program" });
    const concentrations = Object.values(state.occurrences).filter(
      ({ kind }) => kind === "concentration"
    );
    expect(concentrations).toHaveLength(1);
    expect(concentrations[0]).toMatchObject({ parentId: "new-root" });
    expect(result.state.context.endWave).toBeNull();
  });

  it("suspends on a missing root answer and completes once it is supplied", () => {
    const program = conformed({
      id: "coordinated-answer",
      phases: [
        {
          inputs: [{ inputId: "empowered", kind: "boolean", when: null }],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = world();
    const suspended = runMechanicsCausalAction(actionInput(program, snapshot));
    expect(suspended).toMatchObject({
      frame: null,
      requirement: { inputId: "empowered" },
      status: "needs-answer",
    });

    const answer: MechanicsAnswer = {
      inputId: "empowered",
      kind: "boolean",
      value: true,
    };
    const resumed = runMechanicsCausalAction(
      actionInput(program, snapshot, { answers: [answer] })
    );
    expect(resumed.status).toBe("complete");
  });

  it("rejects when the work budget is exhausted", () => {
    const program = conformed(CASCADE_PROGRAM);
    const result = runMechanicsCausalAction(
      actionInput(program, world(), { workBudget: 1 })
    );
    expect(result).toMatchObject({ reason: "work-budget", status: "rejected" });
  });

  it("rejects an entry state that already carries pending frames", () => {
    const program = conformed(CASCADE_PROGRAM);
    const input = actionInput(program, world());
    const seeded = world({
      "root-1": {
        authority: authorityReceipt(program),
        endRules: [],
        ending: null,
        kind: "program",
        ordinal: 1,
        phaseState: {
          pulse: { execution: 0, lastTriggerEventId: null },
          resolve: { execution: 0, lastTriggerEventId: null },
        },
        registers: {},
      },
    });
    const pushed = pushMechanicsPendingFrame(causalState(seeded), input.intent.frame);
    if (!pushed.ok) throw new Error("pending fixture was rejected");
    expect(runMechanicsCausalAction({ ...input, state: pushed.value })).toMatchObject({
      detail: "pending-frames",
      reason: "invalid-state",
      status: "rejected",
    });
  });
});
