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

const MAX_HP_FACT = {
  address: ["hit-point-maximum"],
  expected: { present: true, value: 20 },
  lifecycle: "commit-redo",
  owner: SELF,
} as const;

function damageProgram(
  parts: readonly { amount: number; damageType: string; partId: string }[],
  id = "coordinated-damage"
) {
  return conformed({
    id,
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            delivery: "automatic",
            kind: "damage",
            parts: parts.map((part) => ({
              amount: {
                expression: { kind: "fixed", value: part.amount },
                kind: "integer",
              },
              damageType: part.damageType,
              partId: part.partId,
            })),
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
}

function wardOccurrences(
  wardProgram: MechanicsProgram,
  rule: Record<string, unknown>
): Record<string, MechanicOccurrence> {
  return {
    "ward-root": {
      authority: authorityReceipt(wardProgram),
      endRules: [],
      ending: null,
      kind: "program",
      ordinal: 1,
      phaseState: {
        react: { execution: 0, lastTriggerEventId: null },
        resolve: { execution: 1, lastTriggerEventId: null },
      },
      registers: {},
    },
    "ward-standing": {
      endRules: [],
      ending: null,
      fact: { kind: "damage-defense", rule },
      kind: "standing",
      ordinal: 2,
      origin: {
        execution: 1,
        kind: "program-step",
        phaseId: "resolve",
        root: { occurrence: { material: HERO, occurrenceId: "ward-root" }, ordinal: 1 },
        slot: 1,
        stepId: "raise-ward",
      },
      parentId: "ward-root",
      target: SELF,
    },
  };
}

const WARD_PROGRAM_VALUE = {
  id: "damage-ward",
  phases: [
    {
      inputs: [],
      phaseId: "resolve",
      steps: [
        {
          fact: {
            kind: "damage-defense",
            rule: {
              kind: "resistance",
              selector: {
                damageTypes: ["fire"],
                deliveries: [],
                forbiddenTraits: [],
                requiredTraits: [],
              },
              sourceId: "ward",
            },
          },
          kind: "standing",
          lifetime: { kind: "manual" },
          operation: "start",
          stepId: "raise-ward",
          target: { kind: "role", role: "target" },
          when: null,
        },
      ],
      trigger: { kind: "invocation" },
    },
    {
      inputs: [],
      phaseId: "react",
      steps: [
        {
          fact: { key: "retaliation-mark", kind: "active-key" },
          kind: "standing",
          lifetime: { kind: "manual" },
          operation: "start",
          stepId: "mark-attacker",
          target: { kind: "role", role: "target" },
          when: null,
        },
      ],
      trigger: { kind: "damage-taken", target: "target" },
    },
  ],
  registers: [],
  version: 1,
};

describe("runMechanicsCausalAction vitality", () => {
  it("applies multi-part damage through standing resistance and runs the reaction", () => {
    const wardProgram = conformed(WARD_PROGRAM_VALUE);
    const snapshot = world(
      wardOccurrences(wardProgram, {
        kind: "resistance",
        selector: {
          damageTypes: ["fire"],
          deliveries: [],
          forbiddenTraits: [],
          requiredTraits: [],
        },
        sourceId: "ward",
      })
    );
    const program = damageProgram([
      { amount: 6, damageType: "fire", partId: "fire" },
      { amount: 3, damageType: "force", partId: "force" },
    ]);
    const result = runMechanicsCausalAction(
      actionInput(program, snapshot, {
        facts: [MAX_HP_FACT],
        intent: {
          ...createIntent(program, "resolve"),
          frame: {
            ...createIntent(program, "resolve").frame,
            rootReceipt: {
              kind: "create",
              materialEpoch: 0,
              next: { execution: 1, phaseId: "resolve", triggerEventId: null },
              root: {
                occurrence: { material: HERO, occurrenceId: "attack-root" },
                ordinal: 3,
              },
            },
          },
        },
      })
    );
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;

    const state = heroState(result.state);
    expect(state.vitals.hitPoints.current).toBe(14);
    expect(state.occurrences["ward-root"]).toMatchObject({
      phaseState: { react: { execution: 1 } },
    });
    const marks = Object.values(state.occurrences).filter(
      (occurrence) =>
        occurrence.kind === "standing" &&
        occurrence.fact.kind === "active-key" &&
        occurrence.fact.key === "retaliation-mark"
    );
    expect(marks).toHaveLength(1);
    expect(result.trace.map(({ frame }) => frame.phaseId)).toEqual(["resolve", "react"]);
  });

  it("suspends on damage allocation and resumes with the recorded observation", () => {
    const hemRule = {
      amount: -3,
      kind: "flat-adjustment",
      selector: {
        damageTypes: [],
        deliveries: [],
        forbiddenTraits: [],
        requiredTraits: [],
      },
      sourceId: "hem",
    } as const;
    const wardProgram = conformed({
      ...WARD_PROGRAM_VALUE,
      id: "damage-ward-hem",
      phases: [
        {
          ...WARD_PROGRAM_VALUE.phases[0],
          steps: [
            ...WARD_PROGRAM_VALUE.phases[0].steps,
            {
              fact: { kind: "damage-defense", rule: hemRule },
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "raise-hem",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
        },
        WARD_PROGRAM_VALUE.phases[1],
      ],
    });
    const base = wardOccurrences(wardProgram, {
      kind: "resistance",
      selector: {
        damageTypes: ["fire"],
        deliveries: [],
        forbiddenTraits: [],
        requiredTraits: [],
      },
      sourceId: "ward",
    });
    const wardStanding = base["ward-standing"];
    if (wardStanding?.kind !== "standing") throw new Error("ward fixture");
    const snapshot = world({
      ...base,
      "ward-hem": {
        ...wardStanding,
        fact: { kind: "damage-defense", rule: hemRule },
        ordinal: 3,
        origin: { ...wardStanding.origin, stepId: "raise-hem" },
      },
    });
    const program = damageProgram(
      [
        { amount: 6, damageType: "fire", partId: "fire" },
        { amount: 3, damageType: "force", partId: "force" },
      ],
      "coordinated-allocation"
    );
    const intent = {
      ...createIntent(program, "resolve"),
      frame: {
        ...createIntent(program, "resolve").frame,
        rootReceipt: {
          kind: "create" as const,
          materialEpoch: 0,
          next: { execution: 1, phaseId: "resolve", triggerEventId: null },
          root: {
            occurrence: { material: HERO, occurrenceId: "attack-root" },
            ordinal: 4,
          },
        },
      },
    };
    const suspended = runMechanicsCausalAction(
      actionInput(program, snapshot, { facts: [MAX_HP_FACT], intent })
    );
    expect(suspended).toMatchObject({
      request: { kind: "damage-allocation" },
      status: "needs-response",
    });
    if (suspended.status !== "needs-response") return;
    expect(suspended.request.requirement).toMatchObject({
      amount: 3,
      operation: "reduction",
      sourceId: "hem",
    });

    const resumed = runMechanicsCausalAction(
      actionInput(program, snapshot, {
        facts: [MAX_HP_FACT],
        intent,
        responses: [
          {
            kind: "damage-allocation",
            observation: {
              parts: [
                { amount: 2, partId: "fire" },
                { amount: 1, partId: "force" },
              ],
              sourceId: "hem",
            },
            requestId: suspended.request.requestId,
          },
        ],
      })
    );
    expect(resumed.status).toBe("complete");
    if (resumed.status !== "complete") return;
    expect(heroState(resumed.state).vitals.hitPoints.current).toBe(16);
  });

  it("grants source-bound temporary hit points and ends the emptied source", () => {
    const grantProgram = conformed({
      id: "coordinated-thp",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              amount: { expression: { kind: "fixed", value: 5 }, kind: "integer" },
              decision: "replace",
              kind: "temporary-hit-points",
              lifetime: { kind: "manual" },
              stepId: "grant-thp",
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
    const granted = runMechanicsCausalAction(actionInput(grantProgram, world()));
    expect(granted.status).toBe("complete");
    if (granted.status !== "complete") return;
    const afterGrant = heroState(granted.state);
    expect(afterGrant.vitals.hitPoints.temporary.current).toBe(5);
    const sourceRef = afterGrant.vitals.hitPoints.temporary.sourceOccurrence;
    expect(sourceRef).not.toBeNull();
    if (!sourceRef) return;
    expect(afterGrant.occurrences[sourceRef.occurrence.occurrenceId]).toMatchObject({
      kind: "standing",
    });

    const clearProgram = conformed({
      id: "coordinated-thp-clear",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              kind: "clear-temporary-hit-points",
              source: "all",
              stepId: "clear-thp",
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
    const clearAuthority = authorityReceipt(clearProgram);
    const cleared = runMechanicsCausalAction({
      answers: [],
      authoritySnapshot: authoritySnapshot(clearAuthority),
      facts: [],
      frameAnswers: [],
      intent: {
        actionId: "coordinated-clear",
        factGuards: [],
        frame: {
          authority: clearAuthority,
          invocation: {
            installation: clearAuthority.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: 0,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: {
              occurrence: { material: HERO, occurrenceId: "clear-root" },
              ordinal: heroState(granted.state).nextOccurrenceOrdinal,
            },
          },
          trigger: { kind: "invocation" },
        },
      },
      responses: [],
      state: granted.state,
    });
    expect(cleared.status).toBe("complete");
    if (cleared.status !== "complete") return;
    const afterClear = heroState(cleared.state);
    expect(afterClear.vitals.hitPoints.temporary).toEqual({
      current: 0,
      sourceOccurrence: null,
    });
    expect(afterClear.occurrences[sourceRef.occurrence.occurrenceId]).toBeUndefined();
  });

  it("compiles exhaustion gain and rejects damage without a maximum fact", () => {
    const exhaustProgram = conformed({
      id: "coordinated-exhaustion",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              amount: { kind: "fixed", value: 2 },
              kind: "exhaustion-change",
              operation: "gain",
              stepId: "exhaust",
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
    const exhausted = runMechanicsCausalAction(actionInput(exhaustProgram, world()));
    expect(exhausted.status).toBe("complete");
    if (exhausted.status !== "complete") return;
    expect(heroState(exhausted.state).exhaustion).toBe(2);

    const program = damageProgram(
      [{ amount: 3, damageType: "force", partId: "force" }],
      "coordinated-unguarded"
    );
    expect(runMechanicsCausalAction(actionInput(program, world()))).toMatchObject({
      reason: "missing-compiler-fact",
      status: "rejected",
    });
  });
});

describe("runMechanicsCausalAction lifecycles", () => {
  it("ends its own root through the terminal end-program step", () => {
    const program = conformed({
      id: "coordinated-one-shot",
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
                  amount: { expression: { kind: "fixed", value: 4 }, kind: "integer" },
                  damageType: "force",
                  partId: "force",
                },
              ],
              stepId: "deal-damage",
              target: { kind: "role", role: "target" },
              traits: ["spell"],
              when: null,
            },
            { kind: "end-program", stepId: "finish", when: null },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const result = runMechanicsCausalAction(
      actionInput(program, world(), { facts: [MAX_HP_FACT] })
    );
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const state = heroState(result.state);
    expect(state.vitals.hitPoints.current).toBe(16);
    expect(state.occurrences).toEqual({});
    expect(result.state.context.pendingFrames).toEqual([]);
    expect(result.action).not.toBeNull();
  });

  it("summons a closed-blueprint companion under the caster's control", () => {
    const program = conformed({
      id: "coordinated-summon",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              controller: "owner",
              entityKey: "owl",
              kind: "entity-create",
              lifetime: { kind: "manual" },
              stepId: "summon-owl",
              template: { kind: "companion", sourceId: "familiar", variantId: "owl" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const authority = authorityReceipt(program);
    const blueprint = {
      controller: null,
      exhaustion: 0,
      kind: "creature",
      label: "",
      overrides: {
        armorClass: null,
        hitPointMaximum: null,
        initiativeBonus: null,
        speedFt: null,
      },
      resources: {},
      template: { kind: "catalogue-companion", sourceId: "familiar", variantId: "owl" },
      vitals: {
        hitPoints: { current: 3, temporary: { current: 0, sourceOccurrence: null } },
        zeroHitPoints: null,
      },
    } as const;
    const withBlueprints = {
      ...authority,
      snapshot: {
        ...authority.snapshot,
        blueprints: { entities: { "companion:familiar:owl": blueprint }, items: {} },
      },
    };
    const result = runMechanicsCausalAction({
      answers: [],
      authoritySnapshot: authoritySnapshot(withBlueprints),
      facts: [],
      frameAnswers: [],
      intent: {
        actionId: "coordinated-action",
        factGuards: [],
        frame: {
          authority: withBlueprints,
          invocation: {
            installation: withBlueprints.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: 0,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: ROOT,
          },
          trigger: { kind: "invocation" },
        },
      },
      responses: [],
      state: causalState(world()),
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const state = heroState(result.state);
    const summoned = Object.entries(state.entities).find(([entityId]) =>
      entityId.startsWith("owl-")
    );
    expect(summoned?.[1]).toMatchObject({
      controller: { entityId: "self" },
      kind: "creature",
      template: { kind: "catalogue-companion", variantId: "owl" },
    });
    const lifecycles = Object.values(state.occurrences).filter(
      ({ kind }) => kind === "material-lifecycle"
    );
    expect(lifecycles).toHaveLength(1);
  });

  it("creates an owned item copy from the closed item blueprint", () => {
    const program = conformed({
      id: "coordinated-conjure-item",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              instanceKey: "conjured-blade",
              itemId: "shadow-blade",
              kind: "inventory-create",
              lifetime: { kind: "manual" },
              owner: "owner",
              quantity: { kind: "fixed", value: 1 },
              stepId: "conjure-blade",
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const authority = authorityReceipt(program);
    const itemBlueprint = {
      attuned: false,
      definition: { itemId: "shadow-blade", kind: "catalogue" },
      disposition: "magical",
      enchantment: null,
      equipped: false,
      notes: "",
      overrides: {
        armorClass: null,
        attackBonus: null,
        damageFormula: null,
        damageType: null,
        name: null,
      },
      quantity: {
        capacity: { base: { kind: "unbounded" }, override: null },
        current: 1,
        disabled: false,
        kind: "count",
      },
      resources: {},
      tags: [],
    } as const;
    const withBlueprints = {
      ...authority,
      snapshot: {
        ...authority.snapshot,
        blueprints: { entities: {}, items: { "shadow-blade": itemBlueprint } },
      },
    };
    const result = runMechanicsCausalAction({
      answers: [],
      authoritySnapshot: authoritySnapshot(withBlueprints),
      facts: [],
      frameAnswers: [],
      intent: {
        actionId: "coordinated-action",
        factGuards: [],
        frame: {
          authority: withBlueprints,
          invocation: {
            installation: withBlueprints.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: 0,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: ROOT,
          },
          trigger: { kind: "invocation" },
        },
      },
      responses: [],
      state: causalState(world()),
    });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const state = heroState(result.state);
    const copies = Object.entries(state.inventory);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.[1]).toMatchObject({
      definition: { itemId: "shadow-blade" },
      quantity: { current: 1 },
    });
  });
});
