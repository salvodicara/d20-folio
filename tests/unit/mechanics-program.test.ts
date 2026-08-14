import { describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { resolveDamage } from "@/lib/damage";
import { addOccurrence } from "@/lib/mechanic-occurrences";
import {
  mechanicsOperationCauseId,
  projectMechanicsTransaction,
} from "@/lib/mechanics-operation";
import {
  deriveMechanicsRequirements,
  prepareMechanicsProgramCompilation,
  refreshMechanicsProgramCompilationContext,
  refreshMechanicsProgramProjectedCompilationContext,
  reviewMechanicsIntent,
} from "@/lib/mechanics-program";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import {
  beginMechanicsCausalState,
  parseMechanicsWorld,
  pushMechanicsPendingFrame,
  rebaseMechanicsCausalState,
} from "@/lib/mechanics-world";
import type { ProgramPhaseState } from "@/types/mechanic-occurrence";
import type { MechanicsExecutionFrame } from "@/types/mechanics-command";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsIntent } from "@/types/mechanics-program";
import type { MechanicsProgram } from "@/types/mechanics-program-authoring";
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
const ROOT = {
  occurrence: { material: HERO, occurrenceId: "root-1" },
  ordinal: 1,
} as const;
const SOURCE_CHILD = {
  occurrence: { material: HERO, occurrenceId: "source-child" },
  ordinal: 2,
} as const;
const FIXED_ONE = { kind: "fixed", value: 1 } as const;
const ROLL_8D6 = {
  terms: [
    {
      count: { kind: "fixed", value: 8 },
      kind: "dice",
      operation: "add",
      sides: 6,
      termId: "fire",
    },
  ],
} as const;

function authorityReceipt(
  program: MechanicsProgram,
  overrides: Partial<MechanicsProgramAuthorityReceipt> = {}
): MechanicsProgramAuthorityReceipt {
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
    ...overrides,
  };
}

function world(nextOccurrenceOrdinal = 1, materialEpoch = 0): MechanicsWorld {
  const state = {
    ...createEmptyCharacterMaterialState(5, HERO, {
      hitPoints: {
        current: 20,
        temporary: { current: 0, sourceOccurrence: null },
      },
      zeroHitPoints: null,
    }),
    epoch: materialEpoch,
    nextOccurrenceOrdinal,
  };
  const parsed = parseMechanicsWorld({
    documents: [{ kind: "character", material: HERO, state }],
    scope: HERO,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function worldWithFamiliar(ordinal: number): MechanicsWorld {
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
          entities: {
            familiar: {
              availability: "present",
              controller: null,
              exhaustion: 0,
              kind: "creature",
              label: "",
              ordinal,
              overrides: {
                armorClass: null,
                hitPointMaximum: null,
                initiativeBonus: null,
                speedFt: null,
              },
              ownerOccurrence: null,
              resources: {},
              template: {
                kind: "catalogue-companion",
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
          nextEntityOrdinal: ordinal + 1,
        },
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
  materialEpoch = 0,
  authority = authorityReceipt(program),
  ordinal = 1
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
          actions: [],
          epoch: materialEpoch,
          nextOccurrenceOrdinal: 2,
          occurrences: {
            "root-1": {
              authority,
              endRules: [],
              ending: null,
              kind: "program",
              ordinal,
              phaseState,
              registers: Object.fromEntries(
                program.registers.map((register) => [
                  register.registerId,
                  register.initial,
                ])
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

function causalState(snapshot: Readonly<MechanicsWorld>): Readonly<MechanicsCausalState> {
  const begun = beginMechanicsCausalState(snapshot);
  if (!begun.ok) throw new Error(`causal fixture: ${begun.reason}`);
  return begun.value;
}

function withPendingFrame(
  state: Readonly<MechanicsCausalState>,
  frame: Readonly<MechanicsExecutionFrame>
): Readonly<MechanicsCausalState> {
  const pushed = pushMechanicsPendingFrame(state, frame);
  if (!pushed.ok) throw new Error(`pending frame fixture: ${pushed.reason}`);
  return pushed.value;
}

function pendingState(
  snapshot: Readonly<MechanicsWorld>,
  frame: Readonly<MechanicsExecutionFrame>
): Readonly<MechanicsCausalState> {
  return withPendingFrame(causalState(snapshot), frame);
}

function intent(
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
  expected = { execution: 0, phaseId, triggerEventId: null as string | null },
  authority = authorityReceipt(program)
): MechanicsIntent {
  return {
    actionId: "action-1",
    factGuards: [],
    frame: {
      authority,
      invocation: { kind: "program-root", occurrence: ROOT },
      rootReceipt: {
        expected,
        kind: "advance",
        next: {
          execution: expected.execution + 1,
          phaseId,
          triggerEventId: trigger.triggerEventId,
        },
        root: ROOT,
      },
      trigger,
    },
  };
}

function withFrame(
  value: MechanicsIntent,
  overrides: Partial<MechanicsExecutionFrame>
): MechanicsIntent {
  return { ...value, frame: { ...value.frame, ...overrides } };
}

function conformed(value: unknown): MechanicsProgram {
  const result = conformMechanicsProgram(value);
  if (!result) throw new Error("program fixture did not conform");
  return result;
}

function phaseLifetimeProgram(
  phases: readonly {
    readonly phaseId: string;
    readonly trigger: MechanicsProgram["phases"][number]["trigger"];
  }[],
  creatorPhaseId: string,
  targetPhaseId: string
): Readonly<MechanicsProgram> | null {
  return conformMechanicsProgram({
    id: "phase-lifetime",
    phases: phases.map((phase) => ({
      inputs: [],
      phaseId: phase.phaseId,
      steps:
        phase.phaseId === creatorPhaseId
          ? [
              {
                fact: { key: "phase-child", kind: "active-key" },
                kind: "standing",
                lifetime: { kind: "program-phase-end", phaseId: targetPhaseId },
                operation: "start",
                stepId: "start-phase-child",
                target: { kind: "role", role: "target" },
                when: null,
              },
            ]
          : [],
      trigger: phase.trigger,
    })),
    registers: [],
    version: 1,
  });
}

function sourceEndCausalState(program: MechanicsProgram): Readonly<MechanicsCausalState> {
  const initial = structuredClone(
    worldWithProgramRoot(program, {
      cleanup: { execution: 0, lastTriggerEventId: null },
      resolve: { execution: 1, lastTriggerEventId: null },
    })
  );
  const document = initial.documents[0];
  const root = document?.state.occurrences["root-1"];
  if (document?.kind !== "character" || root?.kind !== "program") {
    throw new Error("source-end fixture");
  }
  const occurrences = addOccurrence(
    {
      nextOccurrenceOrdinal: document.state.nextOccurrenceOrdinal,
      occurrences: document.state.occurrences,
    },
    "source-child",
    {
      endRules: [{ kind: "temporary-hp-empty" }],
      fact: { key: "source-child", kind: "active-key" },
      kind: "standing",
      origin: {
        execution: 1,
        kind: "program-step",
        phaseId: "resolve",
        root: ROOT,
        slot: 1,
        stepId: "install-source-child",
      },
      parentId: "root-1",
      target: SELF,
    }
  );
  document.state.nextOccurrenceOrdinal = occurrences.nextOccurrenceOrdinal;
  document.state.occurrences = structuredClone(occurrences.occurrences);
  document.state.vitals.hitPoints.temporary = {
    current: 1,
    sourceOccurrence: SOURCE_CHILD,
  };
  const closed = parseMechanicsWorld(initial);
  if (!closed.ok) throw new Error(`source-end fixture: ${closed.reason}`);
  const begun = beginMechanicsCausalState(closed.value);
  if (!begun.ok) throw new Error(`source-end fixture: ${begun.reason}`);
  const ending = structuredClone(begun.value.world);
  const endingDocument = ending.documents[0];
  if (endingDocument?.kind !== "character") throw new Error("source-end fixture");
  endingDocument.state.vitals.hitPoints.temporary = {
    current: 0,
    sourceOccurrence: null,
  };
  const rebased = rebaseMechanicsCausalState(ending, begun.value);
  if (!rebased.ok) throw new Error(`source-end fixture: ${rebased.reason}`);
  return rebased.value;
}

describe("MechanicsProgram terminal kernel", () => {
  it("rejects an entity answer from a replaced physical generation", () => {
    const program = conformed({
      id: "exact-entity-answer",
      phases: [
        {
          inputs: [
            {
              eligibility: "creature",
              inputId: "target",
              kind: "entities",
              maximum: FIXED_ONE,
              minimum: FIXED_ONE,
              multiplicity: "set",
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = causalState(worldWithFamiliar(2));
    const request = intent(program);
    const answer = {
      inputId: "target",
      kind: "entities" as const,
      targets: [{ entityId: "familiar", material: HERO, ordinal: 1 }],
    };

    expect(reviewMechanicsIntent(request, [answer], snapshot)).toMatchObject({
      reason: "invalid-answer",
      status: "rejected",
    });
    expect(
      reviewMechanicsIntent(
        request,
        [{ ...answer, targets: [{ ...answer.targets[0], ordinal: 2 }] }],
        snapshot
      ).status
    ).toBe("reviewed");
  });

  it("is exact, canonical, frozen, bounded and rejects dangling dice references", () => {
    const authored = {
      id: "exact-program",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: { key: "source-child", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "temporary-hit-points-empty" },
              operation: "start",
              stepId: "install-source-child",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 3,
    };
    const result = conformMechanicsProgram(authored);
    expect(result).not.toBe(authored);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.phases)).toBe(true);
    if (!result) return;
    const snapshot = causalState(world());
    const requirements = deriveMechanicsRequirements(intent(result), snapshot);
    expect(Object.isFrozen(requirements)).toBe(true);
    const review = reviewMechanicsIntent(intent(result), [], snapshot);
    expect(Object.isFrozen(review)).toBe(true);
    if (review.status === "reviewed") {
      expect(Object.isFrozen(review.reviewed)).toBe(true);
    }
    expect(conformMechanicsProgram({ ...authored, legacy: true })).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [{ ...authored.phases[0], trigger: { kind: "source-end" } }],
      })
    ).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          authored.phases[0],
          {
            inputs: [],
            phaseId: "cycle-a",
            steps: [],
            trigger: { kind: "program-phase-end", phaseId: "cycle-b" },
          },
          {
            inputs: [],
            phaseId: "cycle-b",
            steps: [],
            trigger: { kind: "program-phase-end", phaseId: "cycle-a" },
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          ...authored.phases,
          {
            inputs: [],
            phaseId: "second-invocation",
            steps: [],
            trigger: { kind: "invocation" },
          },
        ],
      })
    ).toBeNull();
    expect(
      deriveMechanicsRequirements(
        withFrame(intent(result), {
          rootReceipt: {
            ...intent(result).frame.rootReceipt,
            next: {
              execution: 1,
              phaseId: "resolve",
              triggerEventId: "forged-invocation-event",
            },
          },
        }),
        snapshot
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    expect(
      deriveMechanicsRequirements({ ...intent(result), extra: true }, snapshot)
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(intent(result), {
          rootReceipt: {
            ...intent(result).frame.rootReceipt,
            materialEpoch: -1,
          } as never,
        }),
        snapshot
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            inputs: [],
            phaseId: "resolve",
            steps: [
              {
                conditionId: "exhaustion",
                kind: "condition",
                lifetime: { kind: "manual" },
                operation: "apply",
                stepId: "invalid-exhaustion-condition",
                target: { kind: "role", role: "target" },
                when: null,
              },
            ],
            trigger: { kind: "invocation" },
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            inputs: [],
            phaseId: "resolve",
            steps: [
              {
                amount: FIXED_ONE,
                kind: "exhaustion-change",
                operation: "gain",
                stepId: "gain-exhaustion",
                target: { kind: "role", role: "target" },
                when: null,
              },
            ],
            trigger: { kind: "invocation" },
          },
        ],
      })
    ).not.toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            inputs: [],
            phaseId: "resolve",
            steps: [
              {
                amount: {
                  cardinality: "shared",
                  inputId: "missing-roll",
                  kind: "dice-input",
                  transform: { bindingId: "input-total", kind: "binding" },
                },
                kind: "heal",
                stepId: "heal",
                target: { kind: "role", role: "target" },
                when: null,
              },
            ],
            trigger: { kind: "invocation" },
          },
        ],
      })
    ).toBeNull();
  });

  it("accepts only targetless concentration steps", () => {
    const step = {
      kind: "concentration",
      lifetime: { kind: "manual" },
      operation: "start",
      stepId: "start-concentration",
      when: null,
    } as const;
    const authored = {
      id: "caster-owned-concentration",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [step],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    } as const;

    expect(conformMechanicsProgram(authored)?.phases[0]?.steps[0]).toEqual(step);
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            ...authored.phases[0],
            steps: [
              {
                ...step,
                target: { kind: "role", role: "target" },
              },
            ],
          },
        ],
      })
    ).toBeNull();
  });

  it("uses one exact direct child-step occurrence-end grammar across phases", () => {
    const producer = {
      conditionId: "poisoned",
      kind: "condition",
      lifetime: { kind: "manual" },
      operation: "apply",
      stepId: "apply-condition",
      target: { kind: "role", role: "target" },
      when: null,
    } as const;
    const ending = {
      childStepId: "apply-condition",
      kind: "occurrence-end",
      stepId: "end-applied-conditions",
      when: null,
    } as const;
    const authored = {
      id: "exact-occurrence-end",
      phases: [
        {
          inputs: [],
          phaseId: "seed",
          steps: [producer],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "cleanup",
          steps: [ending],
          trigger: { kind: "program-phase-end", phaseId: "seed" },
        },
      ],
      registers: [],
      version: 1,
    } as const;

    expect(conformMechanicsProgram(authored)?.phases[1]?.steps[0]).toEqual(ending);
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          authored.phases[0],
          {
            ...authored.phases[1],
            steps: [{ ...ending, unknown: true }],
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          authored.phases[0],
          {
            ...authored.phases[1],
            steps: [
              {
                kind: "occurrence-end",
                stepId: ending.stepId,
                when: null,
              },
            ],
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          authored.phases[0],
          {
            ...authored.phases[1],
            steps: [{ ...ending, childStepId: "missing-producer" }],
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            ...authored.phases[0],
            steps: [{ ...producer, lifetime: null, operation: "remove" }],
          },
          authored.phases[1],
        ],
      })
    ).toBeNull();
  });

  it("accepts same-phase and strict-downstream one-shot lifetimes", () => {
    const resolve = { phaseId: "resolve", trigger: { kind: "invocation" } } as const;
    const finish = {
      phaseId: "finish",
      trigger: { kind: "program-phase-end", phaseId: "resolve" },
    } as const;

    expect(phaseLifetimeProgram([resolve], "resolve", "resolve")).not.toBeNull();
    expect(phaseLifetimeProgram([resolve, finish], "resolve", "finish")).not.toBeNull();
  });

  it("rejects upstream and sibling one-shot lifetimes", () => {
    const resolve = { phaseId: "resolve", trigger: { kind: "invocation" } } as const;
    const left = {
      phaseId: "left",
      trigger: { kind: "program-phase-end", phaseId: "resolve" },
    } as const;
    const right = {
      phaseId: "right",
      trigger: { kind: "program-phase-end", phaseId: "resolve" },
    } as const;

    expect(phaseLifetimeProgram([resolve, left], "left", "resolve")).toBeNull();
    expect(phaseLifetimeProgram([resolve, left, right], "left", "right")).toBeNull();
  });

  it("accepts source-end recurrence that waits for a future external drain", () => {
    expect(
      phaseLifetimeProgram(
        [
          { phaseId: "resolve", trigger: { kind: "invocation" } },
          {
            phaseId: "pulse",
            trigger: {
              combatant: "owner",
              kind: "turn-boundary",
              phase: "start",
            },
          },
          { phaseId: "cleanup", trigger: { kind: "source-end" } },
        ],
        "cleanup",
        "pulse"
      )
    ).not.toBeNull();
  });

  it("rejects source-end lifetimes drained by the same phase chain", () => {
    const resolve = { phaseId: "resolve", trigger: { kind: "invocation" } } as const;
    const cleanup = { phaseId: "cleanup", trigger: { kind: "source-end" } } as const;
    const finish = {
      phaseId: "finish",
      trigger: { kind: "program-phase-end", phaseId: "cleanup" },
    } as const;

    expect(phaseLifetimeProgram([resolve, cleanup], "cleanup", "cleanup")).toBeNull();
    expect(
      phaseLifetimeProgram([resolve, cleanup, finish], "cleanup", "finish")
    ).toBeNull();
  });

  it("keeps hostile world review closed while causal review reads an ending source", () => {
    const program = conformed({
      id: "source-end-review",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              fact: { key: "source-child", kind: "active-key" },
              kind: "standing",
              lifetime: { kind: "temporary-hit-points-empty" },
              operation: "start",
              stepId: "install-source-child",
              target: { kind: "role", role: "target" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [],
          phaseId: "cleanup",
          steps: [],
          trigger: { kind: "source-end" },
        },
      ],
      registers: [],
      version: 1,
    });
    const state = sourceEndCausalState(program);
    const proposed = advanceIntent(program, "cleanup", {
      kind: "source-end",
      occurrence: SOURCE_CHILD,
      triggerEventId: "source-end.root-1.1",
    });

    expect(deriveMechanicsRequirements(proposed, state.world)).toMatchObject({
      reason: "invalid-world",
      status: "rejected",
    });
    expect(reviewMechanicsIntent(proposed, [], state.world)).toMatchObject({
      reason: "invalid-world",
      status: "rejected",
    });
    const pending = withPendingFrame(state, proposed.frame);
    expect(deriveMechanicsRequirements(proposed, pending).status).toBe("derived");
    expect(reviewMechanicsIntent(proposed, [], pending).status).toBe("reviewed");
    expect(
      deriveMechanicsRequirements(proposed, {
        ...pending,
        context: {
          ...pending.context,
          request: { ...pending.context.request, extra: [] },
        },
      })
    ).toMatchObject({ reason: "invalid-world", status: "rejected" });
  });

  it("makes invocation creation and retries exact without retaining a ledger", () => {
    const program = conformed({
      id: "invocation-retry",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              instructionId: "move-owner",
              kind: "manual-relocation",
              mode: "teleport",
              stepId: "move-owner",
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
    const proposed = intent(program);
    const before = world();
    const review = reviewMechanicsIntent(proposed, [], causalState(before));
    expect(review.status).toBe("reviewed");
    if (review.status !== "reviewed") return;
    const after = worldWithProgramRoot(program, {
      resolve: { execution: 1, lastTriggerEventId: null },
    });
    expect(deriveMechanicsRequirements(proposed, causalState(after)).status).toBe(
      "derived"
    );
    expect(
      deriveMechanicsRequirements(
        proposed,
        causalState(
          worldWithProgramRoot(program, {
            resolve: { execution: 0, lastTriggerEventId: null },
          })
        )
      )
    ).toMatchObject({ reason: "invalid-root-occurrence", status: "rejected" });

    // Once the allocation cursor advances, an absent root is a closed/stale
    // invocation, not permission to recreate a completed program occurrence.
    expect(deriveMechanicsRequirements(proposed, causalState(world(2)))).toMatchObject({
      reason: "invalid-root-occurrence",
      status: "rejected",
    });
    expect(deriveMechanicsRequirements(proposed, causalState(world(1, 1)))).toMatchObject(
      {
        reason: "invalid-root-occurrence",
        status: "rejected",
      }
    );
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          rootReceipt: {
            ...proposed.frame.rootReceipt,
            root: { ...proposed.frame.rootReceipt.root, ordinal: 2 },
          },
        }),
        causalState(after)
      )
    ).toMatchObject({ reason: "invalid-root-occurrence", status: "rejected" });
  });

  it("executes a created phase-zero root only under its exact issued top frame", () => {
    const program = conformed({
      id: "pending-create",
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
    const proposed = intent(program);
    const reviewed = reviewMechanicsIntent(proposed, [], causalState(world()));
    expect(reviewed.status).toBe("reviewed");
    if (reviewed.status !== "reviewed") return;

    const initial = causalState(world());
    expect(prepareMechanicsProgramCompilation(reviewed.reviewed, initial).status).toBe(
      "ready"
    );

    const createdWorld = worldWithProgramRoot(program, {
      resolve: { execution: 0, lastTriggerEventId: null },
    });
    const unissued = causalState(createdWorld);
    expect(deriveMechanicsRequirements(proposed, unissued)).toMatchObject({
      reason: "invalid-root-occurrence",
      status: "rejected",
    });
    expect(prepareMechanicsProgramCompilation(reviewed.reviewed, unissued)).toMatchObject(
      {
        reason: "invalid-root-occurrence",
        status: "rejected",
      }
    );
    expect(
      refreshMechanicsProgramCompilationContext(reviewed.reviewed, unissued)
    ).toBeNull();

    const pending = withPendingFrame(unissued, proposed.frame);
    expect(deriveMechanicsRequirements(proposed, pending).status).toBe("derived");
    expect(reviewMechanicsIntent(proposed, [], pending).status).toBe("reviewed");
    expect(prepareMechanicsProgramCompilation(reviewed.reviewed, pending).status).toBe(
      "ready"
    );
    expect(
      refreshMechanicsProgramCompilationContext(reviewed.reviewed, pending)
    ).not.toBeNull();

    const cloned = { ...pending };
    expect(prepareMechanicsProgramCompilation(reviewed.reviewed, cloned)).toMatchObject({
      reason: "invalid-state",
      status: "rejected",
    });
    const activeFrame = pending.context.pendingFrames[0];
    if (!activeFrame) throw new Error("pending frame fixture");
    const forgedCursor = {
      ...pending,
      context: {
        ...pending.context,
        pendingFrames: [
          {
            ...activeFrame,
            cursor: { nextSlot: 2, stage: "step", stepIndex: 0 },
          },
        ],
      },
    };
    expect(
      prepareMechanicsProgramCompilation(reviewed.reviewed, forgedCursor)
    ).toMatchObject({ reason: "invalid-state", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          rootReceipt: {
            ...proposed.frame.rootReceipt,
            root: { ...proposed.frame.rootReceipt.root, ordinal: 2 },
          },
        }),
        pending
      )
    ).toMatchObject({ reason: "invalid-root-occurrence", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          rootReceipt: {
            ...proposed.frame.rootReceipt,
            next: { ...proposed.frame.rootReceipt.next, phaseId: "other" },
          },
        }),
        pending
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
  });

  it("refreshes compiler context only from an authentic transaction projection", () => {
    const program = conformed({
      id: "projection-authenticity",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [
            {
              kind: "register",
              operation: { kind: "set-scalar", value: 1 },
              registerId: "counter",
              stepId: "set-counter",
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [{ initial: 0, registerId: "counter" }],
      version: 1,
    });
    const proposed = intent(program);
    const pending = pendingState(
      worldWithProgramRoot(program, {
        resolve: { execution: 0, lastTriggerEventId: null },
      }),
      proposed.frame
    );
    const reviewed = reviewMechanicsIntent(proposed, [], pending);
    expect(reviewed.status).toBe("reviewed");
    if (reviewed.status !== "reviewed") return;

    const invocation = { kind: "program-root", occurrence: ROOT } as const;
    const cause = {
      causeId: mechanicsOperationCauseId(proposed.frame.authority, invocation),
      invocation,
    } as const;
    const transaction = {
      actionId: "projection-authenticity",
      actor: SELF,
      causes: [cause],
      factGuards: [],
      operations: [
        {
          causeId: cause.causeId,
          expected: 0,
          kind: "program-register-transition",
          next: 1,
          operationId: "set-counter",
          registerId: "counter",
          root: ROOT,
        },
      ],
    } as const;
    const result = projectMechanicsTransaction(transaction, {
      authoritySnapshot: { definitions: [] },
      state: pending,
    });
    expect(result.status).toBe("projected");
    if (result.status !== "projected") return;

    expect(
      refreshMechanicsProgramProjectedCompilationContext(
        reviewed.reviewed,
        result.projection
      )
    ).not.toBeNull();
    expect(
      refreshMechanicsProgramProjectedCompilationContext(reviewed.reviewed, {
        ...result.projection,
      })
    ).toBeNull();
    expect(
      refreshMechanicsProgramProjectedCompilationContext(
        reviewed.reviewed,
        structuredClone(result.projection)
      )
    ).toBeNull();
    const forged = {
      inventorySourceLeases: result.projection.inventorySourceLeases,
      world: result.projection.world,
    } as unknown as Parameters<
      typeof refreshMechanicsProgramProjectedCompilationContext
    >[1];
    expect(
      refreshMechanicsProgramProjectedCompilationContext(reviewed.reviewed, forged)
    ).toBeNull();
  });

  it("admits only the pending stack top and treats the exact committed receipt as replay", () => {
    const program = conformed({
      id: "pending-advance",
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
          steps: [],
          trigger: { combatant: "owner", kind: "turn-boundary", phase: "start" },
        },
      ],
      registers: [],
      version: 1,
    });
    const outer = intent(program);
    const inner = advanceIntent(program, "pulse", {
      clock: { epoch: 0, material: HERO },
      combatant: SELF,
      kind: "turn-boundary",
      phase: "start",
      round: 1,
      triggerEventId: "turn.hero.1.start",
    });
    const expectedWorld = worldWithProgramRoot(program, {
      pulse: { execution: 0, lastTriggerEventId: null },
      resolve: { execution: 0, lastTriggerEventId: null },
    });
    const outerPending = pendingState(expectedWorld, outer.frame);
    const nested = withPendingFrame(outerPending, inner.frame);

    expect(deriveMechanicsRequirements(outer, nested)).toMatchObject({
      reason: "invalid-root-occurrence",
      status: "rejected",
    });
    expect(deriveMechanicsRequirements(inner, nested).status).toBe("derived");
    const reviewed = reviewMechanicsIntent(inner, [], nested);
    expect(reviewed.status).toBe("reviewed");
    if (reviewed.status !== "reviewed") return;
    expect(prepareMechanicsProgramCompilation(reviewed.reviewed, nested).status).toBe(
      "ready"
    );

    const committed = causalState(
      worldWithProgramRoot(program, {
        pulse: { execution: 1, lastTriggerEventId: "turn.hero.1.start" },
        resolve: { execution: 0, lastTriggerEventId: null },
      })
    );
    expect(prepareMechanicsProgramCompilation(reviewed.reviewed, committed)).toEqual({
      status: "replay",
    });
  });

  it("freezes program-phase trigger evidence to one source execution", () => {
    const program = conformed({
      id: "phase-chain",
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
          steps: [],
          trigger: { kind: "program-phase-end", phaseId: "resolve" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = worldWithProgramRoot(program, {
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

    const pending = pendingState(snapshot, proposed.frame);
    expect(deriveMechanicsRequirements(proposed, pending).status).toBe("derived");
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          invocation: {
            kind: "program-root",
            occurrence: { ...ROOT, ordinal: 2 },
          },
          rootReceipt: {
            ...proposed.frame.rootReceipt,
            root: { ...ROOT, ordinal: 2 },
          },
          trigger: {
            ...proposed.frame.trigger,
            occurrence: { ...ROOT, ordinal: 2 },
          },
        }),
        pending
      )
    ).toMatchObject({ reason: "invalid-root-occurrence", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          trigger: { ...proposed.frame.trigger, execution: 2 },
        }),
        pending
      )
    ).toMatchObject({ reason: "invalid-root-occurrence", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          trigger: { ...proposed.frame.trigger, execution: 0 },
        }),
        pending
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          trigger: {
            kind: "program-phase-end",
            occurrence: ROOT,
            phaseId: "resolve",
            triggerEventId: "program.root-1.resolve.1",
          },
        } as never),
        pending
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
  });

  it("models one shared physical roll for two targets and full/half-floor damage", () => {
    const program = conformed({
      id: "shared-fireball-roll",
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
            {
              acceptancePolicy: [],
              expansion: { binding: "target", kind: "single" },
              formula: ROLL_8D6,
              inputId: "damage-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "damage-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "fire",
                  partId: "full",
                },
              ],
              stepId: "failed-save",
              target: { inputId: "targets", kind: "input" },
              traits: ["spell"],
              when: null,
            },
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "damage-roll",
                    kind: "dice-input",
                    transform: {
                      dividend: { bindingId: "input-total", kind: "binding" },
                      divisor: { kind: "fixed", value: 2 },
                      kind: "divide",
                      rounding: "floor",
                    },
                  },
                  damageType: "fire",
                  partId: "half-floor",
                },
              ],
              stepId: "successful-save",
              target: { inputId: "targets", kind: "input" },
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
    expect(
      program.phases[0].inputs.filter((input) => input.kind === "dice")
    ).toHaveLength(1);
    expect(
      program.phases[0].steps.map((step) =>
        step.kind === "damage" ? step.parts[0].amount : null
      )
    ).toEqual([
      {
        cardinality: "shared",
        inputId: "damage-roll",
        kind: "dice-input",
        transform: { bindingId: "input-total", kind: "binding" },
      },
      {
        cardinality: "shared",
        inputId: "damage-roll",
        kind: "dice-input",
        transform: {
          dividend: { bindingId: "input-total", kind: "binding" },
          divisor: { kind: "fixed", value: 2 },
          kind: "divide",
          rounding: "floor",
        },
      },
    ]);
  });

  it("preserves duplicate-target request identity and rejects cross-domain dice pairing", () => {
    const targets = {
      eligibility: "creature",
      inputId: "targets",
      kind: "entities",
      maximum: { kind: "fixed", value: 2 },
      minimum: { kind: "fixed", value: 2 },
      multiplicity: "slots",
      when: null,
    } as const;
    const rolls = {
      acceptancePolicy: [],
      expansion: { inputId: "targets", kind: "entities" },
      formula: {
        terms: [
          {
            count: FIXED_ONE,
            kind: "dice",
            operation: "add",
            sides: 6,
            termId: "ray",
          },
        ],
      },
      inputId: "ray-rolls",
      kind: "dice",
      payments: [],
      replacementPolicy: [],
      when: null,
    } as const;
    const damage = {
      delivery: "automatic",
      kind: "damage",
      parts: [
        {
          amount: {
            cardinality: "per-target-request",
            inputId: "ray-rolls",
            kind: "dice-input",
            transform: { bindingId: "input-total", kind: "binding" },
          },
          damageType: "force",
          partId: "ray",
        },
      ],
      stepId: "ray-damage",
      target: { inputId: "targets", kind: "input" },
      traits: ["spell"],
      when: null,
    } as const;
    const relocation = {
      instructionId: "move-rays",
      kind: "manual-relocation",
      mode: "teleport",
      stepId: "move-ray-targets",
      target: { inputId: "targets", kind: "input" },
      when: null,
    } as const;
    const authored = {
      id: "duplicate-target-rays",
      phases: [
        {
          inputs: [targets, rolls],
          phaseId: "resolve",
          steps: [damage, relocation],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    } as const;
    const program = conformed(authored);
    const snapshot = causalState(world());
    const review = reviewMechanicsIntent(
      intent(program),
      [
        { inputId: "targets", kind: "entities", targets: [SELF, SELF] },
        {
          inputId: "ray-rolls",
          kind: "dice",
          requests: [1, 2].map((ordinal) => ({
            identity: { binding: SELF, ordinal },
            observation: {
              aggregates: [],
              trails: [
                {
                  initialFace: ordinal + 2,
                  steps: [],
                  trailId: "5:trail3:ray1:0",
                },
              ],
            },
            payments: [],
          })),
        },
      ],
      snapshot
    );
    if (review.status !== "reviewed") throw new Error(JSON.stringify(review));
    const otherTargets = { ...targets, inputId: "other-targets" } as const;
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            ...authored.phases[0],
            inputs: [
              targets,
              otherTargets,
              {
                ...rolls,
                expansion: { inputId: "other-targets", kind: "entities" },
              },
            ],
          },
        ],
      })
    ).toBeNull();

    const attacks = {
      expansion: { bind: "target", inputId: "targets", kind: "entities" },
      inputId: "attacks",
      kind: "d20",
      payments: [],
      request: {
        actor: "caster",
        armorClass: { kind: "fixed", value: 15 },
        automaticCriticalSourceIds: [],
        criticalThreshold: { kind: "fixed", value: 20 },
        enteredModifiers: [],
        kind: "attack",
        modifiers: [],
        resolution: { kind: "rolled" },
        rollRules: {
          advantageSourceIds: [],
          disadvantageSourceIds: [],
          extraD20SourceIds: [],
          faceFloors: [],
          replacements: [],
          substitutions: [],
          totalFloors: [],
        },
        target: "target",
        testId: "rays",
      },
      when: null,
    } as const;
    const filteredRolls = {
      ...rolls,
      expansion: {
        inputId: "attacks",
        kind: "d20-outcomes",
        outcomeIds: ["hit"],
      },
    } as const;
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            ...authored.phases[0],
            inputs: [targets, attacks, filteredRolls],
            steps: [damage],
          },
        ],
      })
    ).toBeNull();
    expect(
      conformMechanicsProgram({
        ...authored,
        phases: [
          {
            ...authored.phases[0],
            inputs: [targets, attacks, filteredRolls],
            steps: [
              {
                ...damage,
                target: {
                  cardinality: "per-request",
                  inputId: "attacks",
                  kind: "d20-outcome",
                  outcomeIds: ["hit"],
                  quantifier: "any",
                },
              },
            ],
          },
        ],
      })
    ).not.toBeNull();
  });

  it("reserves one resource across every staged input before accepting the review", () => {
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
              currency: {
                ...base.resources.currency,
                gp: { ...base.resources.currency.gp, current: 1 },
              },
            },
          },
        },
      ],
      scope: HERO,
    });
    if (!parsed.ok) throw new Error(parsed.reason);
    const term = {
      amount: FIXED_ONE,
      selector: { denomination: "gp", kind: "currency", owner: "owner" },
    } as const;
    const program = conformed({
      id: "aggregate-resource-reservation",
      phases: [
        {
          inputs: [
            { inputId: "first", kind: "resource", term, when: null },
            { inputId: "second", kind: "resource", term, when: null },
          ],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const gp = { character: HERO, denomination: "gp", kind: "currency" } as const;
    expect(
      reviewMechanicsIntent(
        intent(program),
        [
          { inputId: "first", kind: "resource", resource: gp },
          { inputId: "second", kind: "resource", resource: gp },
        ],
        causalState(parsed.value)
      )
    ).toMatchObject({
      reason: "invalid-answer",
      referenceId: "second",
      status: "rejected",
    });
  });

  it("expands exact per-target saves while preserving one shared damage roll", () => {
    const saveRequest = {
      actor: "target",
      ability: "DEX",
      difficultyClass: { kind: "fixed", value: 15 },
      enteredModifiers: [],
      kind: "saving-throw",
      modifiers: [],
      resolution: { kind: "rolled" },
      rollRules: {
        advantageSourceIds: [],
        disadvantageSourceIds: [],
        extraD20SourceIds: [],
        faceFloors: [],
        replacements: [],
        substitutions: [],
        totalFloors: [],
      },
      target: "caster",
      testId: "area-save",
    } as const;
    const program = conformed({
      id: "area-save-batch",
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
            {
              expansion: { bind: "actor", inputId: "targets", kind: "entities" },
              inputId: "saves",
              kind: "d20",
              payments: [],
              request: saveRequest,
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "target", kind: "single" },
              formula: ROLL_8D6,
              inputId: "damage-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [
            {
              delivery: "saving-throw",
              kind: "damage",
              parts: [
                {
                  amount: {
                    cardinality: "shared",
                    inputId: "damage-roll",
                    kind: "dice-input",
                    transform: { bindingId: "input-total", kind: "binding" },
                  },
                  damageType: "fire",
                  partId: "full",
                },
              ],
              stepId: "failed-saves",
              target: {
                cardinality: "per-request",
                inputId: "saves",
                kind: "d20-outcome",
                outcomeIds: ["failure"],
                quantifier: "any",
              },
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
    const snapshot = causalState(world());
    const staged = reviewMechanicsIntent(
      intent(program),
      [
        { inputId: "targets", kind: "entities", targets: [SELF, SELF] },
        {
          inputId: "saves",
          kind: "d20",
          requests: [
            {
              identity: { binding: SELF, ordinal: 1 },
              observation: {
                d20: {
                  aggregates: [],
                  trails: [{ initialFace: 18, steps: [], trailId: "5:trail3:d201:0" }],
                },
                enteredModifiers: [],
                tableOverride: null,
              },
              payments: [],
            },
            {
              identity: { binding: SELF, ordinal: 2 },
              observation: {
                d20: {
                  aggregates: [],
                  trails: [{ initialFace: 4, steps: [], trailId: "5:trail3:d201:0" }],
                },
                enteredModifiers: [],
                tableOverride: null,
              },
              payments: [],
            },
          ],
        },
        {
          inputId: "damage-roll",
          kind: "dice",
          requests: [
            {
              identity: { binding: SELF, ordinal: 1 },
              observation: {
                aggregates: [],
                trails: Array.from({ length: 8 }, (_, index) => ({
                  initialFace: 3,
                  steps: [],
                  trailId: `5:trail4:fire1:${index}`,
                })),
              },
              payments: [],
            },
          ],
        },
      ],
      snapshot
    );
    expect(staged.status).toBe("reviewed");
    if (staged.status !== "reviewed") return;
    const saves = staged.reviewed.resolved.saves;
    expect(saves?.kind).toBe("d20");
    if (saves?.kind !== "d20") return;
    expect(saves.requests.map(({ identity }) => identity.ordinal)).toEqual([1, 2]);
    expect(saves.requests.map(({ result }) => result.outcome.outcomeId)).toEqual([
      "success",
      "failure",
    ]);
  });

  it("asks exactly one conditional crit/noncrit formula and reviews physical evidence", () => {
    const attackRequest = {
      actor: "caster",
      armorClass: { kind: "fixed", value: 15 },
      automaticCriticalSourceIds: [],
      criticalThreshold: { kind: "fixed", value: 20 },
      enteredModifiers: [],
      kind: "attack",
      modifiers: [],
      resolution: { kind: "rolled" },
      rollRules: {
        advantageSourceIds: [],
        disadvantageSourceIds: [],
        extraD20SourceIds: [],
        faceFloors: [],
        replacements: [],
        substitutions: [],
        totalFloors: [],
      },
      target: "target",
      testId: "attack",
    } as const;
    const d6 = {
      terms: [
        {
          count: FIXED_ONE,
          kind: "dice",
          operation: "add",
          sides: 6,
          termId: "weapon",
        },
      ],
    } as const;
    const program = conformed({
      id: "critical-branch",
      phases: [
        {
          inputs: [
            {
              inputId: "attack",
              kind: "d20",
              expansion: { binding: "target", kind: "single" },
              payments: [],
              request: attackRequest,
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "target", kind: "single" },
              formula: d6,
              inputId: "ordinary-damage",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: {
                inputId: "attack",
                kind: "answer-d20",
                outcomeId: "hit",
                quantifier: "any",
              },
            },
            {
              acceptancePolicy: [],
              expansion: { binding: "target", kind: "single" },
              formula: {
                terms: [{ ...d6.terms[0], count: { kind: "fixed", value: 2 } }],
              },
              inputId: "critical-damage",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: {
                inputId: "attack",
                kind: "answer-d20",
                outcomeId: "critical-hit",
                quantifier: "any",
              },
            },
          ],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = causalState(world());
    const request = intent(program);
    const requirements = deriveMechanicsRequirements(request, snapshot);
    expect(requirements.status).toBe("derived");
    if (requirements.status !== "derived") return;
    expect(
      requirements.requirements.map(({ activation, inputId }) => [inputId, activation])
    ).toEqual([
      ["attack", "required"],
      ["ordinary-damage", "conditional"],
      ["critical-damage", "conditional"],
    ]);

    const reviewed = reviewMechanicsIntent(
      request,
      [
        {
          inputId: "attack",
          kind: "d20",
          requests: [
            {
              identity: { binding: SELF, ordinal: 1 },
              observation: {
                d20: {
                  aggregates: [],
                  trails: [
                    {
                      initialFace: 18,
                      steps: [],
                      trailId: "5:trail3:d201:0",
                    },
                  ],
                },
                enteredModifiers: [],
                tableOverride: null,
              },
              payments: [],
            },
          ],
        },
        {
          inputId: "ordinary-damage",
          kind: "dice",
          requests: [
            {
              identity: { binding: SELF, ordinal: 1 },
              observation: {
                aggregates: [],
                trails: [
                  {
                    initialFace: 4,
                    steps: [],
                    trailId: "5:trail6:weapon1:0",
                  },
                ],
              },
              payments: [],
            },
          ],
        },
      ],
      snapshot
    );
    expect(reviewed.status).toBe("reviewed");
    if (reviewed.status !== "reviewed") return;
    expect(Object.keys(reviewed.reviewed.resolved)).toEqual([
      "attack",
      "ordinary-damage",
    ]);
  });

  it("authorizes generic die replacements cumulatively with the neutral policy", () => {
    const program = conformed({
      id: "replacement-policy",
      phases: [
        {
          inputs: [
            {
              acceptancePolicy: [],
              expansion: { binding: "target", kind: "single" },
              formula: {
                terms: [
                  {
                    count: { kind: "fixed", value: 2 },
                    kind: "dice",
                    operation: "add",
                    sides: 6,
                    termId: "damage",
                  },
                ],
              },
              inputId: "damage-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [
                {
                  faces: [1],
                  kind: "faces",
                  maximumUses: FIXED_ONE,
                  sourceId: "reroll-ones",
                },
              ],
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = causalState(world());
    const request = intent(program);
    const requirements = deriveMechanicsRequirements(request, snapshot);
    expect(requirements.status).toBe("derived");
    if (requirements.status !== "derived") return;
    const roll = requirements.requirements[0];
    if (roll?.kind !== "dice") throw new Error("missing dice requirement");
    const [firstTrail, secondTrail] = roll.requests[0]?.roll.trails ?? [];
    if (!firstTrail || !secondTrail) throw new Error("missing physical trails");

    const answer = (secondReplacement: boolean) => [
      {
        inputId: "damage-roll",
        kind: "dice" as const,
        requests: [
          {
            identity: { binding: SELF, ordinal: 1 },
            observation: {
              aggregates: [],
              trails: [
                {
                  initialFace: 1,
                  steps: [{ face: 4, kind: "replacement", sourceId: "reroll-ones" }],
                  trailId: firstTrail.trailId,
                },
                {
                  initialFace: secondReplacement ? 1 : 3,
                  steps: secondReplacement
                    ? [{ face: 5, kind: "replacement", sourceId: "reroll-ones" }]
                    : [],
                  trailId: secondTrail.trailId,
                },
              ],
            },
            payments: [],
          },
        ],
      },
    ];
    expect(reviewMechanicsIntent(request, answer(true), snapshot)).toMatchObject({
      reason: "invalid-answer",
      status: "rejected",
    });
    expect(reviewMechanicsIntent(request, answer(false), snapshot).status).toBe(
      "reviewed"
    );
  });

  it("delegates mandatory reroll-until-accepted evidence to the neutral dice kernel", () => {
    const program = conformed({
      id: "mandatory-table-reroll",
      phases: [
        {
          inputs: [
            {
              acceptancePolicy: [
                {
                  kind: "reroll-faces-until-accepted",
                  rejectedFaces: [8],
                  ruleId: "reject-eight",
                  termIds: ["table"],
                },
              ],
              expansion: { binding: "target", kind: "single" },
              formula: {
                terms: [
                  {
                    count: FIXED_ONE,
                    kind: "dice",
                    operation: "add",
                    sides: 8,
                    termId: "table",
                  },
                ],
              },
              inputId: "table-roll",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = causalState(world());
    const request = intent(program);
    const requirement = deriveMechanicsRequirements(request, snapshot);
    if (requirement.status !== "derived") throw new Error("requirement rejected");
    const roll = requirement.requirements[0];
    if (roll?.kind !== "dice") throw new Error("missing dice requirement");
    const trailId = roll.requests[0]?.roll.trails[0]?.trailId;
    if (!trailId) throw new Error("missing trail");
    const review = (steps: readonly unknown[]) =>
      reviewMechanicsIntent(
        request,
        [
          {
            inputId: "table-roll",
            kind: "dice",
            requests: [
              {
                identity: { binding: SELF, ordinal: 1 },
                observation: {
                  aggregates: [],
                  trails: [{ initialFace: 8, steps, trailId }],
                },
                payments: [],
              },
            ],
          },
        ],
        snapshot
      );
    expect(review([])).toMatchObject({ reason: "invalid-answer", status: "rejected" });
    expect(
      review([{ face: 5, kind: "required-reroll", ruleId: "reject-eight" }]).status
    ).toBe("reviewed");
  });

  it("expands later dice only for prior per-request totals that match", () => {
    const program = conformed({
      id: "conditional-ray-expansion",
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
            {
              acceptancePolicy: [],
              expansion: { inputId: "targets", kind: "entities" },
              formula: {
                terms: [
                  {
                    count: FIXED_ONE,
                    kind: "dice",
                    operation: "add",
                    sides: 8,
                    termId: "primary",
                  },
                ],
              },
              inputId: "primary-rays",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
            {
              acceptancePolicy: [],
              expansion: {
                comparison: "eq",
                inputId: "primary-rays",
                kind: "dice-totals",
                value: { kind: "fixed", value: 8 },
              },
              formula: {
                terms: [
                  {
                    count: FIXED_ONE,
                    kind: "dice",
                    operation: "add",
                    sides: 8,
                    termId: "secondary",
                  },
                ],
              },
              inputId: "secondary-rays",
              kind: "dice",
              payments: [],
              replacementPolicy: [],
              when: null,
            },
          ],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [],
      version: 1,
    });
    const snapshot = causalState(world());
    const request = intent(program);
    const derived = deriveMechanicsRequirements(request, snapshot);
    if (derived.status !== "derived") throw new Error("requirements rejected");
    const targetRequirement = derived.requirements[0];
    if (targetRequirement?.kind !== "entities") {
      throw new Error("missing targets requirement");
    }
    const stagedTargets = {
      inputId: "targets",
      kind: "entities" as const,
      targets: [SELF, SELF],
    };
    const first = reviewMechanicsIntent(request, [stagedTargets], snapshot);
    expect(first).toMatchObject({
      reason: "missing-answer",
      requirement: { kind: "dice", requests: [{}, {}] },
      status: "rejected",
    });
    const primaryRequirement = program.phases[0].inputs[1];
    if (primaryRequirement?.kind !== "dice") throw new Error("missing primary input");
    const primaryRoll = derived.requirements.find(
      (requirement) => requirement.kind === "dice"
    );
    if (primaryRoll?.kind !== "dice" || primaryRoll.requests.length !== 0) {
      throw new Error("unstaged batch should be pending");
    }
    const oneDie = "5:trail7:primary1:0";
    const review = reviewMechanicsIntent(
      request,
      [
        stagedTargets,
        {
          inputId: "primary-rays",
          kind: "dice",
          requests: [1, 2].map((ordinal, index) => ({
            identity: { binding: SELF, ordinal },
            observation: {
              aggregates: [],
              trails: [
                {
                  initialFace: index === 0 ? 8 : 3,
                  steps: [],
                  trailId: oneDie,
                },
              ],
            },
            payments: [],
          })),
        },
        {
          inputId: "secondary-rays",
          kind: "dice",
          requests: [
            {
              identity: { binding: SELF, ordinal: 1 },
              observation: {
                aggregates: [],
                trails: [{ initialFace: 4, steps: [], trailId: "5:trail9:secondary1:0" }],
              },
              payments: [],
            },
          ],
        },
      ],
      snapshot
    );
    if (review.status !== "reviewed") throw new Error(JSON.stringify(review));
    const secondary = review.reviewed.resolved["secondary-rays"];
    expect(secondary?.kind === "dice" ? secondary.requests : []).toHaveLength(1);
    expect(
      secondary?.kind === "dice" ? secondary.requests[0]?.identity.ordinal : null
    ).toBe(1);
  });

  it("rejects forged trigger evidence and never accepts arbitrary path mutations", () => {
    const program = conformed({
      id: "manual",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
      ],
      registers: [{ initial: 0, registerId: "uses" }],
      version: 7,
    });
    expect(
      deriveMechanicsRequirements(
        {
          ...intent(program),
          trigger: { eventId: "forged", kind: "manual-table-event" },
        },
        causalState(world())
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    expect(
      conformMechanicsProgram({
        ...program,
        phases: [
          {
            inputs: [],
            phaseId: "resolve",
            steps: [
              {
                kind: "mutation",
                path: ["revision"],
                stepId: "escape",
                value: 1,
                when: null,
              },
            ],
            trigger: { kind: "invocation" },
          },
        ],
      })
    ).toBeNull();
  });

  it("derives damage-trigger facts solely from the exact resolved packet", () => {
    const program = conformed({
      id: "damage-trigger",
      phases: [
        {
          inputs: [],
          phaseId: "resolve",
          steps: [],
          trigger: { kind: "invocation" },
        },
        {
          inputs: [
            {
              inputId: "matching-damage",
              kind: "boolean",
              when: {
                kind: "all",
                predicates: [
                  { delivery: "attack", kind: "trigger-damage-delivery" },
                  {
                    kind: "trigger-damage-trait",
                    present: true,
                    trait: "weapon",
                  },
                  { damageType: "fire", kind: "trigger-damage-type" },
                  {
                    comparison: "gte",
                    kind: "trigger-damage",
                    value: { kind: "fixed", value: 5 },
                  },
                  { equals: true, kind: "trigger-critical-hit" },
                ],
              },
            },
          ],
          phaseId: "react",
          steps: [],
          trigger: { kind: "damage-taken", target: "owner" },
        },
      ],
      registers: [],
      version: 1,
    });
    const attempt = resolveDamage(
      {
        delivery: "attack",
        packetId: "trigger-packet",
        parts: [{ amount: 5, damageType: "fire", partId: "flame" }],
        target: SELF,
        traits: ["weapon", "magical"],
      },
      { damageThreshold: null, rules: [] },
      []
    );
    if (!attempt || attempt.kind !== "resolved") {
      throw new Error("damage trigger fixture must resolve");
    }
    const before = worldWithProgramRoot(program, {
      react: { execution: 0, lastTriggerEventId: null },
      resolve: { execution: 1, lastTriggerEventId: null },
    });
    const proposed = advanceIntent(program, "react", {
      attacker: SELF,
      criticalHit: true,
      kind: "damage-taken",
      resolution: attempt.resolution,
      triggerEventId: "damage-event-1",
    });

    const pending = pendingState(before, proposed.frame);
    const result = deriveMechanicsRequirements(proposed, pending);
    expect(result.status).toBe("derived");
    if (result.status !== "derived") return;
    expect(result.requirements).toMatchObject([
      { activation: "required", inputId: "matching-damage" },
    ]);
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          trigger: {
            ...proposed.frame.trigger,
            packet: attempt.resolution.packet,
          } as never,
        }),
        pending
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          trigger: {
            ...proposed.frame.trigger,
            resolution: {
              ...attempt.resolution,
              packet: {
                ...attempt.resolution.packet,
                parts: [{ ...attempt.resolution.packet.parts[0], amount: 6 }],
              },
            },
          },
        }),
        pending
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
  });

  it("requires a producer-stable execution ordinal across retries and contention", () => {
    const program = conformed({
      id: "turn-pulse",
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
          steps: [],
          trigger: { combatant: "owner", kind: "turn-boundary", phase: "start" },
        },
      ],
      registers: [],
      version: 1,
    });
    const before = worldWithProgramRoot(program, {
      pulse: { execution: 0, lastTriggerEventId: null },
      resolve: { execution: 1, lastTriggerEventId: null },
    });
    const proposed = advanceIntent(program, "pulse", {
      clock: { epoch: 0, material: HERO },
      combatant: SELF,
      kind: "turn-boundary",
      phase: "start",
      round: 1,
      triggerEventId: "turn.hero.1.start",
    });
    expect(
      deriveMechanicsRequirements(
        withFrame(proposed, {
          rootReceipt: {
            ...proposed.frame.rootReceipt,
            next: {
              ...proposed.frame.rootReceipt.next,
              triggerEventId: null,
            },
          },
        }),
        causalState(before)
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    const first = { ...proposed, actionId: "pulse-a" };
    const contender = { ...proposed, actionId: "pulse-b" };

    const active = pendingState(before, first.frame);
    expect(deriveMechanicsRequirements(first, active).status).toBe("derived");
    expect(deriveMechanicsRequirements(contender, active).status).toBe("derived");
    const reviewed = reviewMechanicsIntent(first, [], active);
    expect(reviewed.status).toBe("reviewed");
    if (reviewed.status !== "reviewed") return;
    // The winning CAS set the exact receipt. Same event+ordinal is an idempotent
    // replay even after journal eviction, so no body work can repeat.
    const after = worldWithProgramRoot(program, {
      pulse: { execution: 1, lastTriggerEventId: "turn.hero.1.start" },
      resolve: { execution: 1, lastTriggerEventId: null },
    });
    expect(after.documents[0]?.state.actions).toEqual([]);
    const committed = causalState(after);
    expect(deriveMechanicsRequirements(first, committed).status).toBe("derived");
    expect(deriveMechanicsRequirements(contender, committed).status).toBe("derived");
    // The same evidence cannot acquire a fresh event identity through its CAS receipt.
    expect(
      deriveMechanicsRequirements(
        withFrame(
          { ...proposed, actionId: "collision-a" },
          {
            rootReceipt: {
              ...proposed.frame.rootReceipt,
              next: {
                ...proposed.frame.rootReceipt.next,
                triggerEventId: "turn.hero.2.start",
              },
            },
          }
        ),
        committed
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    expect(
      deriveMechanicsRequirements(
        withFrame(
          { ...proposed, actionId: "collision-b" },
          {
            rootReceipt: {
              ...proposed.frame.rootReceipt,
              next: { ...proposed.frame.rootReceipt.next, execution: 2 },
            },
          }
        ),
        committed
      )
    ).toMatchObject({ reason: "invalid-intent", status: "rejected" });
    const next = advanceIntent(
      program,
      "pulse",
      {
        clock: { epoch: 0, material: HERO },
        combatant: SELF,
        kind: "turn-boundary",
        phase: "start",
        round: 2,
        triggerEventId: "turn.hero.2.start",
      },
      {
        execution: 1,
        phaseId: "pulse",
        triggerEventId: "turn.hero.1.start",
      }
    );
    expect(
      deriveMechanicsRequirements(next, pendingState(after, next.frame)).status
    ).toBe("derived");
  });
});
