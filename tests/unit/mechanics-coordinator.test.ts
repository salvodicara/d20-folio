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

function world(
  occurrences: Record<string, MechanicOccurrence> = {},
  pools: Record<string, number> = {}
): MechanicsWorld {
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
        state: {
          ...base,
          nextOccurrenceOrdinal,
          occurrences,
          resources: {
            ...base.resources,
            pools: Object.fromEntries(
              Object.entries(pools).map(([resourceId, current]) => [
                resourceId,
                {
                  capacity: { base: { kind: "unbounded" }, override: null },
                  current,
                  disabled: false,
                  kind: "count",
                },
              ])
            ),
          },
        },
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
    turnEconomy: [],
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
      turnEconomy: [],
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
      turnEconomy: [],
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
      turnEconomy: [],
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

describe("runMechanicsCausalAction resources", () => {
  const FOCUS_SPEC = {
    capacity: { kind: "unbounded" },
    id: "focus",
    initial: { kind: "empty" },
    kind: "count",
    recoveries: [
      {
        amount: {
          kind: "formula",
          formula: {
            terms: [
              {
                count: { kind: "fixed", value: 1 },
                kind: "dice",
                operation: "add",
                sides: 4,
                termId: "focus-die",
              },
            ],
          },
        },
        trigger: { kind: "manual" },
      },
    ],
  } as const;

  function focusAuthority(program: MechanicsProgram) {
    const authority = authorityReceipt(program);
    return {
      ...authority,
      snapshot: { ...authority.snapshot, resources: { focus: FOCUS_SPEC } },
    };
  }

  function focusInput(
    program: MechanicsProgram,
    snapshot: MechanicsWorld,
    authority: ReturnType<typeof focusAuthority>,
    overrides: Partial<MechanicsCoordinationInput> = {}
  ): MechanicsCoordinationInput {
    return {
      answers: [],
      authoritySnapshot: authoritySnapshot(authority),
      facts: [],
      frameAnswers: [],
      intent: {
        actionId: "coordinated-action",
        factGuards: [],
        frame: {
          authority,
          invocation: {
            installation: authority.installation,
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
      state: causalState(snapshot),
      turnEconomy: [],
      ...overrides,
    };
  }

  it("debits the reviewed resource payment before the first step", () => {
    const program = conformed({
      id: "coordinated-payment",
      phases: [
        {
          inputs: [
            {
              inputId: "spend-focus",
              kind: "resource",
              term: {
                amount: { kind: "fixed", value: 2 },
                selector: { kind: "pool", owner: "owner", resourceId: "focus" },
              },
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
              stepId: "apply-poison",
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
    const authority = focusAuthority(program);
    const snapshot = world({}, { focus: 3 });
    const answer: MechanicsAnswer = {
      inputId: "spend-focus",
      kind: "resource",
      resource: { kind: "pool", owner: SELF, resourceId: "focus" },
    };
    const result = runMechanicsCausalAction(
      focusInput(program, snapshot, authority, { answers: [answer] })
    );
    if (result.status === "rejected") throw new Error(JSON.stringify(result));
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const state = heroState(result.state);
    expect(state.resources.pools.focus?.current).toBe(1);
    expect(
      Object.values(state.occurrences).some(({ kind }) => kind === "condition")
    ).toBe(true);
  });

  it("spends an authored resource change and recovers through a recorded roll", () => {
    const program = conformed({
      id: "coordinated-recover",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              kind: "resource-recover",
              resource: { kind: "pool", owner: "owner", resourceId: "focus" },
              stepId: "recover-focus",
              trigger: { kind: "manual" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const authority = focusAuthority(program);
    const snapshot = world({}, { focus: 0 });
    const suspended = runMechanicsCausalAction(focusInput(program, snapshot, authority));
    expect(suspended).toMatchObject({
      request: { boundary: "recovery", kind: "resource-observation" },
      status: "needs-response",
    });
    if (
      suspended.status !== "needs-response" ||
      suspended.request.kind !== "resource-observation"
    ) {
      return;
    }

    const resumed = runMechanicsCausalAction(
      focusInput(program, snapshot, authority, {
        responses: [
          {
            kind: "resource-observation",
            observation: {
              aggregates: [],
              trails: [
                {
                  initialFace: 3,
                  steps: [],
                  trailId: suspended.request.requirement.trails[0]?.trailId ?? "",
                },
              ],
            },
            requestId: suspended.request.requestId,
          },
        ],
      })
    );
    expect(resumed.status).toBe("complete");
    if (resumed.status !== "complete") return;
    expect(heroState(resumed.state).resources.pools.focus?.current).toBe(3);
  });
});

describe("runMechanicsCausalAction reactive adjustment", () => {
  it("reduces triggering damage through the deflecting reaction", () => {
    const wardProgram = conformed({
      id: "deflecting-ward",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: { key: "deflect-ready", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "raise-guard",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "deflect",
          steps: [
            {
              amount: { expression: { kind: "fixed", value: 3 }, kind: "integer" },
              kind: "incoming-damage-adjustment",
              selector: {
                damageTypes: [],
                deliveries: [],
                forbiddenTraits: [],
                requiredTraits: [],
              },
              sourceId: "deflect",
              stepId: "deflect-blow",
              when: null,
            },
          ],
          trigger: { kind: "damage-taken", target: "target" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = world({
      "ward-root": {
        authority: authorityReceipt(wardProgram),
        endRules: [],
        ending: null,
        kind: "program",
        ordinal: 1,
        phaseState: {
          deflect: { execution: 0, lastTriggerEventId: null },
          resolve: { execution: 1, lastTriggerEventId: null },
        },
        registers: {},
      },
    });
    const program = damageProgram(
      [{ amount: 6, damageType: "fire", partId: "fire" }],
      "coordinated-deflected"
    );
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
                ordinal: 2,
              },
            },
          },
        },
      })
    );
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    const state = heroState(result.state);
    expect(state.vitals.hitPoints.current).toBe(17);
    expect(state.occurrences["ward-root"]).toMatchObject({
      phaseState: { deflect: { execution: 1 } },
    });
  });
});

describe("runMechanicsCausalAction transcribed corpus", () => {
  it("casts the transcribed fireball end-to-end with slot, saves and half damage", async () => {
    const { spells } = await import("@/data/spells");
    const { transcribeSpell, TRANSCRIPTION_BINDINGS } =
      await import("@/lib/mechanics-transcription");
    const fireball = spells.find((spell) => spell.id === "fireball");
    if (!fireball) throw new Error("fireball fixture");
    const transcription = transcribeSpell(fireball);
    if (!transcription.program) throw new Error("fireball program fixture");
    const program = transcription.program;

    const baseAuthority = authorityReceipt(program);
    const authority = {
      ...baseAuthority,
      staticBindings: { [TRANSCRIPTION_BINDINGS.saveDc]: 15 },
    };
    const snapshot = (() => {
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
              resources: {
                ...base.resources,
                standardSpellSlots: {
                  "3": {
                    capacity: { base: { kind: "unbounded" }, override: null },
                    current: 2,
                    disabled: false,
                    kind: "count",
                  },
                },
              },
            },
          },
        ],
        scope: HERO,
      });
      if (!parsed.ok) throw new Error(parsed.reason);
      return parsed.value;
    })();

    const trailIds = (value: unknown): string[] => [
      ...new Set(
        [...JSON.stringify(value).matchAll(/"trailId":"([^"]+)"/g)].map(
          (match) => match[1] ?? ""
        )
      ),
    ];
    const answers: MechanicsAnswer[] = [];
    const run = () =>
      runMechanicsCausalAction({
        answers,
        authoritySnapshot: authoritySnapshot(authority),
        facts: [MAX_HP_FACT, slotFact],
        frameAnswers: [],
        intent: {
          actionId: "cast-fireball",
          factGuards: [],
          frame: {
            authority,
            invocation: {
              installation: authority.installation,
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
        state: causalState(snapshot),
        turnEconomy: [],
      });

    const slotFact = {
      address: ["resource-definition", "resources", "standardSpellSlots", "3"],
      expected: {
        present: true,
        value: {
          bindings: {},
          spec: {
            capacity: { kind: "unbounded" },
            id: "standard-spell-slot",
            initial: { kind: "empty" },
            kind: "count",
            recoveries: [],
          },
        },
      },
      lifecycle: "commit",
      owner: SELF,
    } as const;

    let outcome = run();
    for (
      let remaining = 8;
      outcome.status === "needs-answer" && remaining > 0;
      remaining -= 1
    ) {
      const requirement = outcome.requirement;
      if (!requirement) throw new Error("missing requirement");
      if (requirement.kind === "resource") {
        answers.push({
          inputId: requirement.inputId,
          kind: "resource",
          resource: { character: HERO, kind: "standard-spell-slot", level: 3 },
        });
      } else if (requirement.kind === "entities") {
        answers.push({
          inputId: requirement.inputId,
          kind: "entities",
          targets: [SELF],
        });
      } else if (requirement.kind === "d20") {
        answers.push({
          inputId: requirement.inputId,
          kind: "d20",
          requests: requirement.requests.map(({ identity, review }) => ({
            identity,
            observation: {
              d20: {
                aggregates: [],
                trails: trailIds(review).map((trailId) => ({
                  initialFace: 12,
                  steps: [],
                  trailId,
                })),
              },
              enteredModifiers: [],
              tableOverride: null,
            },
            payments: [],
          })),
        });
      } else if (requirement.kind === "dice") {
        answers.push({
          inputId: requirement.inputId,
          kind: "dice",
          requests: requirement.requests.map(({ identity, roll }) => ({
            identity,
            observation: {
              aggregates: [],
              trails: trailIds(roll).map((trailId) => ({
                initialFace: 3,
                steps: [],
                trailId,
              })),
            },
            payments: [],
          })),
        });
      } else {
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      }
      outcome = run();
    }
    if (outcome.status === "rejected") throw new Error(JSON.stringify(outcome));
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") return;
    const state = heroState(outcome.state);
    expect(state.resources.standardSpellSlots["3"]?.current).toBe(1);
    // DC 15, save total 12 → failure → full damage: 8d6 all showing 3 = 24.
    expect(state.vitals.hitPoints.current).toBe(0);
    expect(state.vitals.zeroHitPoints).not.toBeNull();
  });

  interface AttackCastPlan {
    /** One face-list per d20 requirement (attack first, then saves), request order. */
    readonly attackFaces: readonly (readonly number[])[];
    readonly bindings: Readonly<Record<string, number>>;
    readonly slotLevel: number | null;
    readonly spellId: string;
    readonly targetSlots: number;
  }

  /** Drive one transcribed attack spell through the live protocol. */
  async function runAttackCast(plan: AttackCastPlan) {
    const { spells } = await import("@/data/spells");
    const { transcribeSpell } = await import("@/lib/mechanics-transcription");
    const spell = spells.find((entry) => entry.id === plan.spellId);
    if (!spell) throw new Error(`${plan.spellId} fixture`);
    const transcription = transcribeSpell(spell);
    if (!transcription.program) {
      throw new Error(
        `${plan.spellId} program: ${JSON.stringify(transcription.clauses)}`
      );
    }
    const authority = {
      ...authorityReceipt(transcription.program),
      staticBindings: plan.bindings,
    };
    const snapshot = (() => {
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
              resources: {
                ...base.resources,
                standardSpellSlots:
                  plan.slotLevel === null
                    ? {}
                    : {
                        [String(plan.slotLevel)]: {
                          capacity: { base: { kind: "unbounded" }, override: null },
                          current: 2,
                          disabled: false,
                          kind: "count",
                        },
                      },
              },
            },
          },
        ],
        scope: HERO,
      });
      if (!parsed.ok) throw new Error(parsed.reason);
      return parsed.value;
    })();
    const slotFacts =
      plan.slotLevel === null
        ? []
        : [
            {
              address: [
                "resource-definition",
                "resources",
                "standardSpellSlots",
                String(plan.slotLevel),
              ],
              expected: {
                present: true,
                value: {
                  bindings: {},
                  spec: {
                    capacity: { kind: "unbounded" },
                    id: "standard-spell-slot",
                    initial: { kind: "empty" },
                    kind: "count",
                    recoveries: [],
                  },
                },
              },
              lifecycle: "commit",
              owner: SELF,
            } as const,
          ];
    const trailIds = (value: unknown): string[] => [
      ...new Set(
        [...JSON.stringify(value).matchAll(/"trailId":"([^"]+)"/g)].map(
          (match) => match[1] ?? ""
        )
      ),
    ];
    const answers: MechanicsAnswer[] = [];
    const demandedDamageTrails: number[] = [];
    let d20RequirementIndex = 0;
    const run = () =>
      runMechanicsCausalAction({
        answers,
        authoritySnapshot: authoritySnapshot(authority),
        facts: [MAX_HP_FACT, ...slotFacts],
        frameAnswers: [],
        intent: {
          actionId: `cast-${plan.spellId}`,
          factGuards: [],
          frame: {
            authority,
            invocation: {
              installation: authority.installation,
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
        state: causalState(snapshot),
        turnEconomy: [],
      });
    let outcome = run();
    for (
      let remaining = 10;
      outcome.status === "needs-answer" && remaining > 0;
      remaining -= 1
    ) {
      const requirement = outcome.requirement;
      if (!requirement) throw new Error("missing requirement");
      if (requirement.kind === "resource" && plan.slotLevel !== null) {
        answers.push({
          inputId: requirement.inputId,
          kind: "resource",
          resource: {
            character: HERO,
            kind: "standard-spell-slot",
            level: plan.slotLevel,
          },
        });
      } else if (requirement.kind === "entities") {
        answers.push({
          inputId: requirement.inputId,
          kind: "entities",
          targets: Array.from({ length: plan.targetSlots }, () => SELF),
        });
      } else if (requirement.kind === "d20") {
        const faces = plan.attackFaces[d20RequirementIndex] ?? [];
        d20RequirementIndex += 1;
        answers.push({
          inputId: requirement.inputId,
          kind: "d20",
          requests: requirement.requests.map(({ identity, review }, index) => ({
            identity,
            observation: {
              d20: {
                aggregates: [],
                trails: trailIds(review).map((trailId) => ({
                  initialFace: faces[index] ?? 1,
                  steps: [],
                  trailId,
                })),
              },
              enteredModifiers: [],
              tableOverride: null,
            },
            payments: [],
          })),
        });
      } else if (requirement.kind === "dice") {
        for (const request of requirement.requests) {
          demandedDamageTrails.push(trailIds(request.roll).length);
        }
        answers.push({
          inputId: requirement.inputId,
          kind: "dice",
          requests: requirement.requests.map(({ identity, roll }) => ({
            identity,
            observation: {
              aggregates: [],
              trails: trailIds(roll).map((trailId) => ({
                initialFace: 3,
                steps: [],
                trailId,
              })),
            },
            payments: [],
          })),
        });
      } else {
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      }
      outcome = run();
    }
    if (outcome.status === "rejected") throw new Error(JSON.stringify(outcome));
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("incomplete");
    return { demandedDamageTrails, state: heroState(outcome.state) };
  }

  it("resolves scorching-ray rays independently: hit, natural-20 crit, miss", async () => {
    const { TRANSCRIPTION_BINDINGS } = await import("@/lib/mechanics-transcription");
    // Attack bonus +7 vs AC 15: 12 → 19 hits; natural 20 crits; 2 → 9 misses.
    const { demandedDamageTrails, state } = await runAttackCast({
      attackFaces: [[12, 20, 2]],
      bindings: {
        [TRANSCRIPTION_BINDINGS.attackBonus]: 7,
        [TRANSCRIPTION_BINDINGS.targetArmorClass]: 15,
      },
      slotLevel: 3,
      spellId: "scorching-ray",
      targetSlots: 3,
    });
    // Slot 3 on a level-2 spell allows 4 ray slots; three were aimed. The hit
    // ray rolls 2d6, the crit ray rolls doubled dice (4d6), the miss rolls
    // nothing — its outcome-expanded inputs resolve themselves empty.
    expect(demandedDamageTrails.sort((a, b) => a - b)).toEqual([2, 4]);
    // All faces 3: hit 6 + crit 12 = 18 damage to the (self-targeted) hero.
    expect(state.vitals.hitPoints.current).toBe(2);
    expect(state.resources.standardSpellSlots["3"]?.current).toBe(1);
  });

  it("scales fire-bolt cantrip dice by character level and needs no slot", async () => {
    const { TRANSCRIPTION_BINDINGS } = await import("@/lib/mechanics-transcription");
    const { demandedDamageTrails, state } = await runAttackCast({
      attackFaces: [[11]],
      bindings: {
        [TRANSCRIPTION_BINDINGS.attackBonus]: 7,
        [TRANSCRIPTION_BINDINGS.characterLevel]: 11,
        [TRANSCRIPTION_BINDINGS.targetArmorClass]: 15,
      },
      slotLevel: null,
      spellId: "fire-bolt",
      targetSlots: 1,
    });
    // Level 11 → 3d10 (the 5/11/17 progression); all faces 3 → 9 damage.
    expect(demandedDamageTrails).toEqual([3]);
    expect(state.vitals.hitPoints.current).toBe(11);
  });

  it("rolls each magic-missile dart on its own slot with automatic delivery", async () => {
    const { demandedDamageTrails, state } = await runAttackCast({
      attackFaces: [],
      bindings: {},
      slotLevel: 2,
      spellId: "magic-missile",
      targetSlots: 3,
    });
    // Slot 2 allows 4 darts; three aimed, each its own 1d4+1 → face 3 → 4 each.
    expect(demandedDamageTrails).toEqual([1, 1, 1]);
    expect(state.vitals.hitPoints.current).toBe(20 - 12);
  });

  it("gates ray-of-sickness: damage on the hit, condition on the failed save", async () => {
    const { TRANSCRIPTION_BINDINGS } = await import("@/lib/mechanics-transcription");
    const { state } = await runAttackCast({
      // Attack 12+7=19 vs AC 15 → hit; only then CON save 3 vs DC 15 → failure.
      attackFaces: [[12], [3]],
      bindings: {
        [TRANSCRIPTION_BINDINGS.attackBonus]: 7,
        [TRANSCRIPTION_BINDINGS.saveDc]: 15,
        [TRANSCRIPTION_BINDINGS.targetArmorClass]: 15,
      },
      slotLevel: 1,
      spellId: "ray-of-sickness",
      targetSlots: 1,
    });
    // 2d8 at face 3 → 6 damage; the failed save poisons the target.
    expect(state.vitals.hitPoints.current).toBe(14);
    const conditions = Object.values(state.occurrences).filter(
      (occurrence) =>
        occurrence.kind === "condition" && occurrence.conditionId === "poisoned"
    );
    expect(conditions).toHaveLength(1);
  });

  it("casts deferred moonbeam: slot spent, cast level recorded, pulse phase armed", async () => {
    const { TRANSCRIPTION_BINDINGS } = await import("@/lib/mechanics-transcription");
    const { state } = await runAttackCast({
      attackFaces: [],
      bindings: { [TRANSCRIPTION_BINDINGS.saveDc]: 15 },
      slotLevel: 3,
      spellId: "moonbeam",
      targetSlots: 0,
    });
    // Deferred: no damage at cast; the slot is spent, concentration is held,
    // and the pulse phase sits armed at execution 0 with the cast level saved.
    expect(state.vitals.hitPoints.current).toBe(20);
    expect(state.resources.standardSpellSlots["3"]?.current).toBe(1);
    const root = Object.values(state.occurrences).find(
      (occurrence) => occurrence.kind === "program"
    );
    if (root?.kind !== "program") throw new Error("missing program root");
    expect(root.registers["cast-level"]).toBe(3);
    expect(root.phaseState["pulse"]).toMatchObject({ execution: 0 });
    expect(
      Object.values(state.occurrences).some(
        (occurrence) => occurrence.kind === "concentration"
      )
    ).toBe(true);
  });

  it("omits the ray-of-sickness save entirely when the attack misses", async () => {
    const { TRANSCRIPTION_BINDINGS } = await import("@/lib/mechanics-transcription");
    const { demandedDamageTrails, state } = await runAttackCast({
      attackFaces: [[2]],
      bindings: {
        [TRANSCRIPTION_BINDINGS.attackBonus]: 7,
        [TRANSCRIPTION_BINDINGS.saveDc]: 15,
        [TRANSCRIPTION_BINDINGS.targetArmorClass]: 15,
      },
      slotLevel: 1,
      spellId: "ray-of-sickness",
      targetSlots: 1,
    });
    // Miss: no damage roll demanded, no save demanded, slot still spent.
    expect(demandedDamageTrails).toEqual([]);
    expect(state.vitals.hitPoints.current).toBe(20);
    const conditions = Object.values(state.occurrences).filter(
      (occurrence) => occurrence.kind === "condition"
    );
    expect(conditions).toHaveLength(0);
    expect(state.resources.standardSpellSlots["1"]?.current).toBe(1);
  });
});
