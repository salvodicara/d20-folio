import { describe, expect, it, vi } from "vitest";

import type {
  CombatEffectLifetime,
  CombatEffectProgram,
  ConditionId,
} from "@/data/types";
import {
  atomicAddressKey,
  atomicEntityBindingKey,
  canonicalizeDamageDefenses,
  type AtomicOwner,
  type AtomicRead,
  type CombatEffectAtomicReadSetHeader,
} from "@/lib/combat-effect-atomic";
import {
  combatEffectOccurrenceChangeMatchesSnapshot,
  combatEffectOccurrenceId,
  combatEffectOccurrenceInitialHeadId,
  compileLegacyCombatEffect,
  createReviewedCombatEffectArtifact,
  deriveCombatEffectRequirements,
  interpretCombatEffectArtifact,
  isCombatEffectPersistentConsequences,
  isCombatEffectStateView,
  serializeReviewedCombatEffectArtifact,
  validateCombatEffectProgram,
  type CombatEffectEntityRef,
  type CombatEffectDisposableDraft,
  type CombatEffectDiceFact,
  type CombatEffectGeneratedMutationIntent,
  type CombatEffectGeneratedSource,
  type CombatEffectMutation,
  type CombatEffectOccurrenceChange,
  type CombatEffectOccurrenceFingerprint,
  type CombatEffectPlanningState,
  type CombatEffectProvidedAnswer,
  type CombatEffectRequirement,
  type CombatEffectStateView,
} from "@/lib/combat-effect-program";
import {
  combatTableEntityRef,
  evaluateEnteredCombatD20Test,
} from "@/lib/combat-test-context";
import { NO_DEFENSES } from "@/lib/damage-intake";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { CombatOutcomeTarget } from "@/types/combat-outcome";
import type { D20TestRequest, D20TestResult } from "@/types/d20-test";

interface MutableEntity {
  hp: number;
  maxHp: number;
  tempHp: number;
  stable: boolean;
  deathSaves: { successes: number; failures: number };
  conditions: Set<ConditionId>;
  conditionLifetimes: Record<string, CombatEffectLifetime | null>;
  standing: Set<string>;
  standingLifetimes: Record<string, CombatEffectLifetime | null>;
  resources: Record<string, number>;
  stateFlags: Record<string, boolean>;
}

function entity(overrides: Partial<MutableEntity> = {}): MutableEntity {
  const state: MutableEntity = {
    hp: 10,
    maxHp: 10,
    tempHp: 0,
    stable: false,
    deathSaves: { successes: 0, failures: 0 },
    conditions: new Set(),
    conditionLifetimes: {},
    standing: new Set(),
    standingLifetimes: {},
    resources: {},
    stateFlags: {},
    ...overrides,
  };
  for (const condition of state.conditions) {
    if (!Object.hasOwn(state.conditionLifetimes, condition)) {
      state.conditionLifetimes[condition] = null;
    }
  }
  for (const effectId of state.standing) {
    if (!Object.hasOwn(state.standingLifetimes, effectId)) {
      state.standingLifetimes[effectId] = null;
    }
  }
  return state;
}

function cloneEntity(state: MutableEntity): MutableEntity {
  return {
    ...state,
    deathSaves: { ...state.deathSaves },
    conditions: new Set(state.conditions),
    conditionLifetimes: structuredClone(state.conditionLifetimes),
    standing: new Set(state.standing),
    standingLifetimes: structuredClone(state.standingLifetimes),
    resources: { ...state.resources },
    stateFlags: { ...state.stateFlags },
  };
}

class WorkingDraft implements CombatEffectDisposableDraft {
  readonly mutations: Readonly<CombatEffectMutation>[] = [];
  readonly entities: Record<string, MutableEntity>;
  readonly programConditions = new Set<string>();
  readonly programStanding = new Set<string>();

  constructor(entities: Record<string, MutableEntity>) {
    this.entities = entities;
  }

  private refKey(ref: CombatEffectEntityRef): string {
    const id = ref.kind === "source" ? ref.id : ref.target.combatantId;
    return `${ref.kind}:${id}`;
  }

  private get(ref: CombatEffectEntityRef): MutableEntity {
    const key = this.refKey(ref);
    const state = this.entities[key];
    if (!state) throw new Error(`Missing entity ${key}`);
    return state;
  }

  atomicReadSet(header: CombatEffectAtomicReadSetHeader): unknown {
    const bindings: Array<{
      ref: CombatEffectEntityRef;
      owner: AtomicOwner;
    }> = [];
    const reads: AtomicRead[] = [];
    for (const key of Object.keys(this.entities)) {
      const kind = key.startsWith("source:") ? "source" : "target";
      const combatantId = key.slice(kind.length + 1);
      const ref: CombatEffectEntityRef =
        kind === "source" ? { kind, id: combatantId } : { kind, target: { combatantId } };
      const owner: AtomicOwner = {
        kind: "monster",
        surface: "shared",
        campaignId: "campaign:test",
        encounterEpoch: 1,
        combatantId,
      };
      bindings.push({ ref, owner });
      const state = this.read(ref);
      reads.push(
        {
          owner,
          address: { kind: "base-state" },
          expected: {
            hp: state.hp,
            tempHp: state.tempHp,
            stable: state.stable,
            deathSaves: state.deathSaves,
            conditions: [...state.conditions].sort(),
            conditionLifetimes: state.conditionLifetimes,
            standing: [...state.standing].sort(),
            standingLifetimes: state.standingLifetimes,
            resources: state.resources,
            stateFlags: state.stateFlags,
          },
        },
        { owner, address: { kind: "max-hp" }, expected: state.maxHp },
        {
          owner,
          address: { kind: "damage-defenses" },
          expected: canonicalizeDamageDefenses(NO_DEFENSES),
        },
        { owner, address: { kind: "zero-hp-floors" }, expected: [] },
        { owner, address: { kind: "occurrence-heads" }, expected: [] }
      );
      for (const [resourceId, current] of Object.entries(state.resources)) {
        reads.push({
          owner,
          address: { kind: "resource", programResourceId: resourceId },
          expected: {
            present: true,
            binding: { kind: "tracker", trackerId: resourceId },
            current,
            capacity: Number.MAX_SAFE_INTEGER,
            enabled: true,
          },
        });
      }
      for (const [stateKey, active] of Object.entries(state.stateFlags)) {
        reads.push({
          owner,
          address: { kind: "state-flag", stateKey },
          expected: {
            binding: { kind: "active-feature", activeKey: stateKey },
            active,
          },
        });
      }
    }
    const source = bindings.find(
      (binding) => binding.ref.kind === "source" && binding.ref.id === header.sourceId
    );
    if (!source) throw new TypeError("Missing source read-set fixture");
    reads.push({
      owner: source.owner,
      address: {
        kind: "document-revision",
        document: {
          kind: "shared-encounter",
          campaignId: "campaign:test",
          encounterEpoch: 1,
        },
      },
      expected: 1,
    });
    reads.push({
      owner: source.owner,
      address: { kind: "lifecycle-head", ...header },
      expected: { present: false },
    });
    bindings.sort((left, right) =>
      atomicEntityBindingKey(left).localeCompare(atomicEntityBindingKey(right))
    );
    reads.sort((left, right) =>
      atomicAddressKey(left.owner, left.address).localeCompare(
        atomicAddressKey(right.owner, right.address)
      )
    );
    return { schema: 1, bindings, reads };
  }

  read(ref: CombatEffectEntityRef): CombatEffectStateView {
    const state = this.get(ref);
    return {
      hp: state.hp,
      maxHp: state.maxHp,
      tempHp: state.tempHp,
      stable: state.stable,
      deathSaves: { ...state.deathSaves },
      conditions: [...state.conditions],
      conditionLifetimes: structuredClone(state.conditionLifetimes),
      standing: [...state.standing],
      standingLifetimes: structuredClone(state.standingLifetimes),
      resources: { ...state.resources },
      stateFlags: { ...state.stateFlags },
    };
  }

  resourceValue(ref: CombatEffectEntityRef, resourceId: string): number {
    return this.get(ref).resources[resourceId] ?? 0;
  }

  conditionPresent(
    ref: CombatEffectEntityRef,
    condition: CombatEffectStateView["conditions"][number]
  ): boolean {
    return (
      this.get(ref).conditions.has(condition) ||
      this.programConditions.has(`${this.refKey(ref)}\0${condition}`)
    );
  }

  standingPresent(ref: CombatEffectEntityRef, effectId: string): boolean {
    return (
      this.get(ref).standing.has(effectId) ||
      this.programStanding.has(`${this.refKey(ref)}\0${effectId}`)
    );
  }

  apply(mutation: Readonly<CombatEffectMutation>) {
    expect(Object.isFrozen(mutation)).toBe(true);
    this.mutations.push(mutation);
    const state = this.get(mutation.recipient);
    const before = this.read(mutation.recipient);
    let appliedAmount: number | undefined;
    let appliedComponents:
      | ReadonlyArray<{ stepId: string; appliedAmount: number }>
      | undefined;
    let persistentConsequences:
      | import("@/lib/combat-effect-program").CombatEffectPersistentConsequences
      | undefined;
    if (mutation.kind === "damage" || mutation.kind === "resolved-damage") {
      const amount =
        mutation.kind === "damage"
          ? mutation.components.reduce((sum, component) => sum + component.amount, 0)
          : mutation.amount;
      if (mutation.kind === "damage") {
        appliedComponents = mutation.components.map((component) => ({
          stepId: component.stepId,
          appliedAmount: component.amount,
        }));
      }
      appliedAmount = amount;
      const tempLoss = Math.min(state.tempHp, appliedAmount);
      state.tempHp -= tempLoss;
      const hpDamage = appliedAmount - tempLoss;
      if (state.hp === 0 && hpDamage > 0) {
        const critical =
          mutation.kind === "damage" &&
          mutation.components.some((component) => component.resolution.criticalHit);
        state.deathSaves.failures = Math.min(
          3,
          state.deathSaves.failures + (critical ? 2 : 1)
        );
      } else {
        state.hp = Math.max(0, state.hp - hpDamage);
      }
    } else if (mutation.kind === "heal") {
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + mutation.amount);
      appliedAmount = state.hp - before;
    } else if (mutation.kind === "temp-hp") {
      const before = state.tempHp;
      state.tempHp = Math.max(state.tempHp, mutation.amount);
      appliedAmount = state.tempHp - before;
    } else if (mutation.kind === "resource") {
      const before = state.resources[mutation.resourceId] ?? 0;
      const after =
        mutation.operation === "gain"
          ? before + mutation.amount
          : Math.max(0, before - mutation.amount);
      state.resources[mutation.resourceId] = after;
      appliedAmount = Math.abs(after - before);
    } else if (mutation.kind === "damage-reduction") {
      appliedAmount = Math.min(mutation.amount, mutation.triggeringDamage.amount);
    } else if (mutation.kind === "condition") {
      if (mutation.operation === "apply") {
        this.programConditions.add(
          `${this.refKey(mutation.recipient)}\0${mutation.condition}`
        );
      } else {
        this.programConditions.delete(
          `${this.refKey(mutation.recipient)}\0${mutation.condition}`
        );
      }
      persistentConsequences = {
        occurrenceChanges:
          mutation.operation === "apply"
            ? [
                {
                  effectId: combatEffectOccurrenceId(mutation),
                  provenance: mutation.provenance,
                  recipient: mutation.recipient,
                  expectedHeadOpId: null,
                  expectedActive: false,
                  active: true,
                  reason: "program-apply",
                  descriptor: {
                    kind: "condition",
                    condition: mutation.condition,
                    ...(mutation.lifetime ? { lifetime: mutation.lifetime } : {}),
                  },
                },
              ]
            : [],
      };
    } else if (mutation.kind === "standing") {
      if (mutation.operation === "start") {
        this.programStanding.add(
          `${this.refKey(mutation.recipient)}\0${mutation.effectId}`
        );
      } else {
        this.programStanding.delete(
          `${this.refKey(mutation.recipient)}\0${mutation.effectId}`
        );
      }
      persistentConsequences = {
        occurrenceChanges:
          mutation.operation === "start"
            ? [
                {
                  effectId: combatEffectOccurrenceId(mutation),
                  provenance: mutation.provenance,
                  recipient: mutation.recipient,
                  expectedHeadOpId: null,
                  expectedActive: false,
                  active: true,
                  reason: "program-start",
                  descriptor: {
                    kind: "standing",
                    effectId: mutation.effectId,
                    ...(mutation.lifetime ? { lifetime: mutation.lifetime } : {}),
                  },
                },
              ]
            : [],
      };
    } else if (mutation.kind === "state-flag") {
      if (!Object.hasOwn(state.stateFlags, mutation.stateKey)) {
        throw new Error(`Missing state flag ${mutation.stateKey}`);
      }
      state.stateFlags[mutation.stateKey] = mutation.operation === "activate";
    } else {
      state.stable = true;
      state.deathSaves = { successes: 3, failures: 0 };
    }
    return {
      before,
      after: this.read(mutation.recipient),
      ...(appliedAmount === undefined ? {} : { appliedAmount }),
      ...(appliedComponents === undefined ? {} : { appliedComponents }),
      ...(persistentConsequences === undefined ? {} : { persistentConsequences }),
    };
  }
}

class WorkingState implements CombatEffectPlanningState {
  readonly entities: Record<string, MutableEntity>;

  constructor(entities: Record<string, MutableEntity>) {
    this.entities = entities;
  }

  createDisposableDraft(): CombatEffectDisposableDraft {
    return new WorkingDraft(
      Object.fromEntries(
        Object.entries(this.entities).map(([id, state]) => [id, cloneEntity(state)])
      )
    );
  }
}

const execution = {
  occurrenceId: "cast:one",
  phaseId: "resolve",
  sourceId: "hero:one",
  effectSource: {
    kind: "spell",
    id: "spell:test",
    actionId: "spell:test",
  },
  targets: [{ combatantId: "enemy:one" }],
  instances: 1,
} as const;

function transferEffect(id = "warding-bond"): ActiveCombatEffect {
  return {
    id,
    actor: { kind: "monster", combatantId: execution.sourceId },
    target: { kind: "monster", combatantId: execution.targets[0].combatantId },
    source: {
      kind: "spell",
      id: "warding-bond",
      actionId: "spell-warding-bond",
    },
    payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
    duration: { kind: "encounter" },
  };
}

type TransferIntent = {
  mutation: Extract<CombatEffectMutation, { kind: "resolved-damage" }>;
  source: Extract<CombatEffectGeneratedSource, { kind: "effect-occurrence" }>;
};

function transferIntent(
  parent: Readonly<CombatEffectMutation>,
  overrides: Partial<TransferIntent> = {}
): TransferIntent {
  const effect = transferEffect();
  return {
    mutation: {
      kind: "resolved-damage",
      amount: 1,
      sourceEffectId: effect.id,
      transferPath: [effect.id],
      provenance: parent.provenance,
      recipient: { kind: "source", id: execution.sourceId },
    },
    source: {
      kind: "effect-occurrence",
      recipient: parent.recipient,
      effect,
      expectedHeadOpId: `apply:${effect.id}`,
      expectedActive: true,
    },
    ...overrides,
  };
}

const fixed = (value: number) => ({ kind: "fixed" as const, value });

function emptyRollRules(): D20TestRequest["rollRules"] {
  return {
    advantageSourceIds: [],
    disadvantageSourceIds: [],
    extraD20SourceIds: [],
    faceFloors: [],
    replacements: [],
    substitutions: [],
    totalFloors: [],
  };
}

function attackContext(
  target: CombatOutcomeTarget,
  testId: string,
  armorClass = 10
): D20TestRequest {
  return {
    actor: combatTableEntityRef(execution.sourceId),
    armorClass: fixed(armorClass),
    automaticCriticalSourceIds: [],
    criticalThreshold: fixed(20),
    enteredModifiers: [],
    kind: "attack",
    modifiers: [],
    resolution: { kind: "rolled" },
    rollRules: emptyRollRules(),
    target: combatTableEntityRef(target.combatantId),
    testId,
  };
}

function saveContext(
  target: CombatOutcomeTarget,
  testId: string,
  difficultyClass: number
): D20TestRequest {
  return {
    ability: "CON",
    actor: combatTableEntityRef(target.combatantId),
    difficultyClass: fixed(difficultyClass),
    enteredModifiers: [],
    kind: "saving-throw",
    modifiers: [],
    resolution: { kind: "rolled" },
    rollRules: emptyRollRules(),
    target: null,
    testId,
  };
}

function d20Result(context: D20TestRequest, ...faces: readonly number[]): D20TestResult {
  const result = evaluateEnteredCombatD20Test(context, { faces });
  if (!result) throw new Error("test D20 context did not resolve");
  return result;
}

function diceFact(
  faces: ReadonlyArray<number>,
  total = faces.reduce((a, b) => a + b, 0)
): CombatEffectDiceFact {
  return {
    dice: faces.map((face, index) => ({
      dieId: `die-${index + 1}`,
      initialFace: face,
      replacements: [],
    })),
    consumedResourceIds: [],
    total,
  };
}

function answersFor(
  requirements: ReadonlyArray<CombatEffectRequirement>,
  value: (
    requirement: CombatEffectRequirement,
    index: number
  ) => CombatEffectProvidedAnswer["value"]
): CombatEffectProvidedAnswer[] {
  return requirements.map((requirement, index) => ({
    key: requirement.key,
    value: value(requirement, index),
  }));
}

function at<T>(values: ReadonlyArray<T>, index: number): T {
  const value = values[index];
  if (value === undefined) throw new Error(`Missing test value at ${index}`);
  return value;
}

describe("combat effect program authoring", () => {
  it("rejects draft follow-ups and state changes outside the mutation trust boundary", () => {
    const program = {
      version: 1,
      id: "trust-boundary",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "impact",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 1 },
              damageType: { kind: "fixed", damageType: "force" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const artifact = createReviewedCombatEffectArtifact(program, execution, []);
    const baseEntities = () => ({
      "source:hero:one": entity(),
      "target:enemy:one": entity({ stateFlags: { "death-ward": true } }),
    });
    const wrappedState = (
      wrap: (
        result: ReturnType<WorkingDraft["apply"]>,
        mutation: Readonly<CombatEffectMutation>,
        draft: WorkingDraft
      ) => ReturnType<WorkingDraft["apply"]>
    ): CombatEffectPlanningState => ({
      createDisposableDraft: () => {
        const draft = new WorkingDraft(baseEntities());
        return {
          atomicReadSet: (header) => draft.atomicReadSet(header),
          read: (ref) => draft.read(ref),
          resourceValue: (ref, resourceId) => draft.resourceValue(ref, resourceId),
          conditionPresent: (ref, condition) => draft.conditionPresent(ref, condition),
          standingPresent: (ref, effectId) => draft.standingPresent(ref, effectId),
          apply: (mutation) => wrap(draft.apply(mutation), mutation, draft),
        };
      },
    });
    const interpretWithGenerated = (
      factory: (
        mutation: Readonly<CombatEffectMutation>
      ) => ReadonlyArray<CombatEffectGeneratedMutationIntent>
    ) =>
      interpretCombatEffectArtifact(
        artifact,
        wrappedState((result, mutation) => ({
          ...result,
          generatedMutations: factory(mutation),
        }))
      );

    expect(() =>
      interpretWithGenerated((mutation) => [
        {
          mutation: {
            kind: "heal",
            amount: 1,
            provenance: mutation.provenance,
            recipient: mutation.recipient,
          },
          source: {
            kind: "state-flag",
            recipient: mutation.recipient,
            stateKey: "death-ward",
            expectedActive: true,
            hitPoints: 9,
          },
        } as unknown as CombatEffectGeneratedMutationIntent,
      ])
    ).toThrow(/invalid deterministic follow-up/);

    expect(() =>
      interpretWithGenerated((mutation) => [
        transferIntent(mutation, {
          mutation: {
            kind: "resolved-damage",
            amount: 2,
            sourceEffectId: "warding-bond",
            transferPath: ["warding-bond"],
            provenance: mutation.provenance,
            recipient: { kind: "source", id: execution.sourceId },
          },
        }),
      ])
    ).toThrow(/must equal parent applied amount/);

    expect(() =>
      interpretWithGenerated((mutation) => [
        transferIntent(mutation),
        transferIntent(mutation),
      ])
    ).toThrow(/duplicate sibling transfer effect/);

    expect(() =>
      interpretWithGenerated((mutation) =>
        [0, 1].map(() => ({
          mutation: {
            kind: "state-flag" as const,
            operation: "deactivate" as const,
            stateKey: "death-ward",
            provenance: mutation.provenance,
            recipient: mutation.recipient,
          },
          source: {
            kind: "state-flag" as const,
            recipient: mutation.recipient,
            stateKey: "death-ward",
            expectedActive: true as const,
            hitPoints: 9,
          },
        }))
      )
    ).toThrow(/duplicate sibling state flag/);

    expect(() =>
      interpretWithGenerated((mutation) => [
        transferIntent(mutation, {
          mutation: {
            kind: "resolved-damage",
            amount: 1,
            sourceEffectId: "warding-bond",
            transferPath: ["other-effect"],
            provenance: mutation.provenance,
            recipient: { kind: "source", id: execution.sourceId },
          },
        }),
      ])
    ).toThrow(/must append one unvisited effect/);

    expect(() =>
      interpretWithGenerated((mutation) => [
        transferIntent(mutation, {
          mutation: {
            kind: "resolved-damage",
            amount: 1,
            sourceEffectId: "warding-bond",
            transferPath: ["warding-bond"],
            provenance: { ...mutation.provenance, stepId: "other-step" },
            recipient: { kind: "source", id: execution.sourceId },
          },
        }),
      ])
    ).toThrow(/provenance: must match parent/);

    expect(() =>
      interpretWithGenerated((mutation) => {
        const intent = transferIntent(mutation);
        return [
          {
            ...intent,
            source: {
              ...intent.source,
              effect: {
                ...intent.source.effect,
                actor: { kind: "monster", combatantId: "another-actor" },
              },
            },
          },
        ];
      })
    ).toThrow(/stale transfer occurrence identity/);

    expect(() =>
      interpretWithGenerated((mutation) => [
        {
          mutation: {
            kind: "state-flag",
            operation: "deactivate",
            stateKey: "death-ward",
            provenance: mutation.provenance,
            recipient: mutation.recipient,
          },
          source: {
            kind: "state-flag",
            recipient: mutation.recipient,
            stateKey: "death-ward",
            expectedActive: true,
            hitPoints: 0,
          },
        },
      ])
    ).toThrow(/stale state-floor observation/);

    expect(() =>
      interpretCombatEffectArtifact(
        artifact,
        wrappedState((result, mutation, draft) => {
          const target = draft.entities["target:enemy:one"];
          if (!target) throw new Error("expected target draft");
          target.resources.smuggled = 1;
          return { ...result, after: draft.read(mutation.recipient) };
        })
      )
    ).toThrow(/changed unowned state: resources/);

    const generatedKindGetter = vi.fn(() => ({}));
    const accessorGenerated: Record<string, unknown> = {};
    Object.defineProperty(accessorGenerated, "mutation", {
      enumerable: true,
      get: generatedKindGetter,
    });
    expect(() =>
      interpretWithGenerated(() => [
        accessorGenerated as unknown as CombatEffectGeneratedMutationIntent,
      ])
    ).toThrow(/accessors/);
    expect(generatedKindGetter).not.toHaveBeenCalled();

    let observedMutation: Readonly<CombatEffectMutation> | undefined;
    interpretCombatEffectArtifact(
      artifact,
      wrappedState((result, mutation) => {
        observedMutation = mutation;
        return result;
      })
    );
    if (!observedMutation) throw new Error("expected observed mutation");

    const occurrenceGetter = vi.fn(() => []);
    const accessorConsequences: Record<string, unknown> = {};
    Object.defineProperty(accessorConsequences, "occurrenceChanges", {
      enumerable: true,
      get: occurrenceGetter,
    });
    expect(
      isCombatEffectPersistentConsequences(accessorConsequences, observedMutation)
    ).toBe(false);
    expect(occurrenceGetter).not.toHaveBeenCalled();

    const stateGetter = vi.fn(() => 10);
    const accessorState = new WorkingDraft(baseEntities()).read({
      kind: "target",
      target: execution.targets[0],
    }) as unknown as Record<string, unknown>;
    Object.defineProperty(accessorState, "hp", {
      enumerable: true,
      get: stateGetter,
    });
    expect(isCombatEffectStateView(accessorState)).toBe(false);
    expect(stateGetter).not.toHaveBeenCalled();
  });

  it("fences persistent occurrences by exact head and immutable ownership", () => {
    const fingerprint = {
      programOwner: {
        occurrenceId: "cast:one",
        programId: "effect-program",
        phaseId: "apply",
        stepId: "apply-prone",
        operationId: "apply:prone",
        instance: 0,
        iteration: 0,
      },
      payload: { kind: "condition", conditionId: "prone" },
    } satisfies CombatEffectOccurrenceFingerprint;
    const change = {
      effectId: "program:prone",
      provenance: {
        occurrenceId: "cast:one",
        programId: "effect-program",
        phaseId: "cleanup",
        stepId: "remove-prone",
        target: execution.targets[0],
        instance: 0,
        iteration: 0,
      },
      recipient: { kind: "target", target: execution.targets[0] },
      expectedHeadOpId: "apply:prone",
      expectedEffect: fingerprint,
      expectedActive: true,
      active: false,
      reason: "program-remove",
    } satisfies CombatEffectOccurrenceChange;

    expect(
      combatEffectOccurrenceChangeMatchesSnapshot(change, {
        effectId: change.effectId,
        headOpId: "apply:prone",
        active: true,
        terminal: false,
        fingerprint,
      })
    ).toBe(true);
    expect(
      combatEffectOccurrenceChangeMatchesSnapshot(change, {
        effectId: change.effectId,
        headOpId: "reactivate:prone",
        active: true,
        terminal: false,
        fingerprint,
      })
    ).toBe(false);
    expect(
      combatEffectOccurrenceChangeMatchesSnapshot(change, {
        effectId: "program:other",
        headOpId: "apply:prone",
        active: true,
        terminal: false,
        fingerprint,
      })
    ).toBe(false);
    expect(
      combatEffectOccurrenceChangeMatchesSnapshot(change, {
        effectId: change.effectId,
        headOpId: "apply:prone",
        active: true,
        terminal: false,
        fingerprint: {
          ...fingerprint,
          payload: { kind: "condition", conditionId: "restrained" },
        },
      })
    ).toBe(false);
    expect(
      combatEffectOccurrenceChangeMatchesSnapshot(change, {
        effectId: change.effectId,
        headOpId: "apply:prone",
        active: false,
        terminal: true,
        fingerprint,
      })
    ).toBe(false);

    const create = {
      effectId: change.effectId,
      provenance: change.provenance,
      recipient: change.recipient,
      expectedHeadOpId: null,
      expectedActive: false,
      active: true,
      reason: "program-apply",
      descriptor: { kind: "condition", condition: "prone" },
      materializedEffect: {
        id: change.effectId,
        actor: { kind: "monster", combatantId: execution.sourceId },
        target: {
          kind: "monster",
          combatantId: execution.targets[0].combatantId,
        },
        source: execution.effectSource,
        payload: { kind: "condition", conditionId: "prone" },
        programOwner: {
          occurrenceId: change.provenance.occurrenceId,
          programId: change.provenance.programId,
          phaseId: change.provenance.phaseId,
          stepId: change.provenance.stepId,
          operationId: combatEffectOccurrenceInitialHeadId(change.effectId),
          instance: change.provenance.instance,
          iteration: change.provenance.iteration,
        },
        duration: { kind: "encounter" },
      },
    } satisfies CombatEffectOccurrenceChange;
    expect(combatEffectOccurrenceChangeMatchesSnapshot(create, null)).toBe(true);
    expect(
      combatEffectOccurrenceChangeMatchesSnapshot(create, {
        effectId: create.effectId,
        headOpId: "deactivate:prone",
        active: false,
        terminal: false,
        fingerprint,
      })
    ).toBe(false);
  });

  it("validates scoped authoring and derives independent target-instance facts", () => {
    const program = {
      version: 1,
      id: "multi-ray",
      gates: [
        { id: "attack-roll", kind: "attack", scope: "instance", attackType: "ranged" },
      ],
      inputs: [
        {
          id: "damage-roll",
          kind: "roll",
          scope: "instance",
          roll: {
            count: 1,
            sides: 6,
            critical: { gateId: "attack-roll", multiplier: 2 },
          },
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          targeting: { affinity: "enemy", maxTargets: 2 },
          instances: 4,
          steps: [
            {
              id: "ray-damage",
              kind: "damage",
              scope: "instance",
              subject: "target",
              amount: { kind: "input", inputId: "damage-roll" },
              damageType: { kind: "fixed", damageType: "force" },
              gate: { gateId: "attack-roll", pass: "hit", otherwise: "skip" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;

    expect(validateCombatEffectProgram(program)).toEqual({ valid: true, errors: [] });
    const targets = [{ combatantId: "enemy:one" }, { combatantId: "enemy:two" }] as const;
    const instanceTargets = [targets[0], targets[0], targets[1], targets[0]] as const;
    const invocation = {
      ...execution,
      targets,
      instances: 4,
      instanceTargets,
      gateContexts: instanceTargets.map((target, instance) => ({
        gateId: "attack-roll",
        target,
        instance,
        context: attackContext(target, `attack-${instance}`, 10),
      })),
    };
    const gates = deriveCombatEffectRequirements(program, invocation);

    expect(gates.map(({ key }) => key)).toEqual([
      "gate:attack-roll@instance:0",
      "gate:attack-roll@instance:1",
      "gate:attack-roll@instance:2",
      "gate:attack-roll@instance:3",
    ]);
    const gateAnswers = answersFor(gates, (requirement, index) => {
      if (requirement.kind !== "attack") throw new Error("expected attack gate");
      return d20Result(requirement.context, index === 0 ? 20 : 17);
    });
    const requirements = deriveCombatEffectRequirements(program, invocation, gateAnswers);
    expect(requirements.map(({ key }) => key)).toEqual([
      "gate:attack-roll@instance:0",
      "gate:attack-roll@instance:1",
      "gate:attack-roll@instance:2",
      "gate:attack-roll@instance:3",
      "input:damage-roll@instance:0",
      "input:damage-roll@instance:1",
      "input:damage-roll@instance:2",
      "input:damage-roll@instance:3",
    ]);

    const artifact = createReviewedCombatEffectArtifact(
      program,
      invocation,
      answersFor(requirements, (requirement, index) =>
        requirement.kind === "attack"
          ? at(gateAnswers, index).value
          : requirement.kind === "roll"
            ? diceFact(
                Array.from({ length: requirement.roll.count }, () => 3),
                requirement.roll.count * 3
              )
            : (() => {
                throw new Error("unexpected requirement");
              })()
      )
    );
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.answers)).toBe(true);
    expect(requirements.find((entry) => entry.kind === "roll")).toMatchObject({
      roll: { count: 2, sides: 6 },
    });
    expect(artifact.answers[0]?.value).toMatchObject({ selectedNaturalFace: 20 });
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity({ hp: 30, maxHp: 30 }),
        "target:enemy:two": entity({ hp: 30, maxHp: 30 }),
      })
    );
    const packets = plan.consequences.filter((entry) => entry.kind === "damage");
    expect(packets).toHaveLength(4);
    expect(packets.map((entry) => entry.provenance.instance)).toEqual([0, 1, 2, 3]);
    expect(packets.map((entry) => entry.provenance.target?.combatantId)).toEqual([
      "enemy:one",
      "enemy:one",
      "enemy:two",
      "enemy:one",
    ]);
    expect(packets[0]?.components[0]?.resolution).toMatchObject({
      kind: "gate",
      gateKind: "attack",
      result: "critical-hit",
      disposition: "full",
      criticalHit: true,
    });
  });

  it("derives authored instance cardinality from character level and rejects caller drift", () => {
    const program = {
      version: 1,
      id: "level-scaled-beams",
      gates: [{ id: "beam-attack", kind: "attack", scope: "instance" }],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          instances: {
            base: 1,
            byCharacterLevel: [
              { minLevel: 5, value: 2 },
              { minLevel: 11, value: 3 },
              { minLevel: 17, value: 4 },
            ],
          },
          steps: [
            {
              id: "beam-hit",
              kind: "condition",
              scope: "instance",
              subject: "target",
              operation: "apply",
              condition: "prone",
              when: { kind: "gate", gateId: "beam-attack", result: "hit" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const target = execution.targets[0];
    const invocationAt = (characterLevel: number, instances: number) => ({
      ...execution,
      characterLevel,
      instances,
      instanceTargets: Array.from({ length: instances }, () => target),
      gateContexts: Array.from({ length: instances }, (_, instance) => ({
        gateId: "beam-attack",
        target,
        instance,
        context: attackContext(target, `beam-${characterLevel}-${instance}`),
      })),
    });

    for (const [level, count] of [
      [1, 1],
      [5, 2],
      [11, 3],
      [17, 4],
    ] as const) {
      expect(
        deriveCombatEffectRequirements(program, invocationAt(level, count))
      ).toHaveLength(count);
    }
    expect(() => deriveCombatEffectRequirements(program, invocationAt(11, 2))).toThrow(
      /expected authored phase count 3/
    );
  });

  it("binds a reviewed STR-or-DEX save choice to one universal D20 requirement", () => {
    const program = {
      version: 1,
      id: "grapple-save",
      gates: [
        {
          id: "escape",
          kind: "save",
          scope: "target",
          ability: ["STR", "DEX"],
          dc: 15,
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "grapple",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "grappled",
              when: { kind: "gate", gateId: "escape", result: "failure" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const context = saveContext(execution.targets[0], "grapple", 15);
    const dexInvocation = {
      ...execution,
      gateContexts: [
        {
          gateId: "escape",
          target: execution.targets[0],
          ability: "DEX" as const,
          context,
        },
      ],
    };
    expect(deriveCombatEffectRequirements(program, dexInvocation)).toMatchObject([
      { kind: "save", ability: "DEX", context },
    ]);
    expect(() =>
      deriveCombatEffectRequirements(program, {
        ...dexInvocation,
        gateContexts: [
          {
            gateId: "escape",
            target: execution.targets[0],
            ability: "CON",
            context,
          },
        ],
      })
    ).toThrow(/choice is not authored/);
    expect(() =>
      deriveCombatEffectRequirements(program, {
        ...dexInvocation,
        gateContexts: [
          {
            gateId: "escape",
            target: execution.targets[0],
            context,
          },
        ],
      })
    ).toThrow(/reviewed choice is required/);
  });

  it("stages conditional nested table rolls and never asks for a false branch", () => {
    const branch = { kind: "table-roll", inputId: "prism", min: 8, max: 8 } as const;
    const program = {
      version: 1,
      id: "nested-table",
      inputs: [
        {
          id: "prism",
          kind: "table-roll",
          scope: "instance",
          roll: { count: 1, sides: 8 },
        },
        {
          id: "second-prism",
          kind: "table-roll",
          scope: "instance",
          roll: { count: 1, sides: 8 },
          when: branch,
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "second-effect",
              kind: "standing",
              scope: "instance",
              subject: "target",
              operation: "start",
              effectId: "second-prism-effect",
              when: {
                kind: "all",
                predicates: [
                  branch,
                  { kind: "table-roll", inputId: "second-prism", min: 1, max: 8 },
                ],
              },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    expect(validateCombatEffectProgram(program)).toEqual({ valid: true, errors: [] });

    const invocation = { ...execution, instanceTargets: execution.targets };
    const first = deriveCombatEffectRequirements(program, invocation);
    expect(first.map(({ refId }) => refId)).toEqual(["prism"]);
    const noBranch = deriveCombatEffectRequirements(program, invocation, [
      { key: at(first, 0).key, value: diceFact([7]) },
    ]);
    expect(noBranch.map(({ refId }) => refId)).toEqual(["prism"]);
    const branchOpen = deriveCombatEffectRequirements(program, invocation, [
      { key: at(first, 0).key, value: diceFact([8]) },
    ]);
    expect(branchOpen.map(({ refId }) => refId)).toEqual(["prism", "second-prism"]);

    const replacementFact: CombatEffectDiceFact = {
      dice: [
        {
          dieId: "prism-d8",
          initialFace: 8,
          replacements: [
            { sourceId: "prismatic-reroll", resourceId: "reroll-use", face: 7 },
          ],
        },
      ],
      consumedResourceIds: ["reroll-use"],
      total: 7,
    };
    const reviewed = createReviewedCombatEffectArtifact(program, invocation, [
      { key: at(first, 0).key, value: replacementFact },
    ]);
    expect(reviewed.answers[0]?.value).toEqual(replacementFact);
    expect(() =>
      createReviewedCombatEffectArtifact(program, invocation, [
        {
          key: at(first, 0).key,
          value: { ...replacementFact, consumedResourceIds: [] },
        },
      ])
    ).toThrow(/must match replacement resources/);
  });

  it("resolves one exact type per ordered damage step for fixed, choice and table facts", () => {
    const program = {
      version: 1,
      id: "typed-packets",
      inputs: [
        {
          id: "element",
          kind: "choice",
          scope: "target",
          options: ["fire", "cold"],
        },
        {
          id: "table-element",
          kind: "table-roll",
          scope: "target",
          roll: { count: 1, sides: 2 },
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "fixed",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 1 },
              damageType: { kind: "fixed", damageType: "acid" },
            },
            {
              id: "chosen",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 2 },
              damageType: { kind: "choice", inputId: "element" },
            },
            {
              id: "tabled",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 3 },
              damageType: {
                kind: "table",
                inputId: "table-element",
                rows: [
                  { min: 1, max: 1, damageType: "lightning" },
                  { min: 2, max: 2, damageType: "thunder" },
                ],
              },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const requirements = deriveCombatEffectRequirements(program, execution);
    const artifact = createReviewedCombatEffectArtifact(
      program,
      execution,
      answersFor(requirements, (requirement) =>
        requirement.kind === "choice" ? "fire" : diceFact([2])
      )
    );
    const state = new WorkingState({
      "source:hero:one": entity(),
      "target:enemy:one": entity({ hp: 10, maxHp: 10 }),
    });

    const { consequences } = interpretCombatEffectArtifact(artifact, state);
    expect(
      consequences
        .filter((entry) => entry.kind === "damage")
        .map((entry) => [entry.provenance.stepId, entry.components[0]?.damageType])
    ).toEqual([
      ["fixed", "acid"],
      ["chosen", "fire"],
      ["tabled", "thunder"],
    ]);
  });

  it("groups typed components into one atomic packet and applies critical lifecycle once", () => {
    const program = {
      version: 1,
      id: "critical-packet",
      gates: [{ id: "attack", kind: "attack", scope: "target" }],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "weapon",
              packetId: "weapon-hit",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 5 },
              damageType: { kind: "fixed", damageType: "slashing" },
              gate: { gateId: "attack", pass: "hit", otherwise: "skip" },
            },
            {
              id: "sneak",
              packetId: "weapon-hit",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 3 },
              damageType: { kind: "fixed", damageType: "slashing" },
              gate: { gateId: "attack", pass: "hit", otherwise: "skip" },
            },
            {
              id: "rider",
              packetId: "weapon-hit",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 2 },
              damageType: { kind: "fixed", damageType: "fire" },
              gate: { gateId: "attack", pass: "hit", otherwise: "skip" },
            },
            {
              id: "on-hit-condition",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "prone",
              when: { kind: "gate", gateId: "attack", result: "hit" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const invocation = {
      ...execution,
      encounterPosition: {
        round: 1,
        currentCombatantId: execution.sourceId,
        phase: "turn-start" as const,
        order: [execution.sourceId, execution.targets[0].combatantId],
      },
      gateContexts: [
        {
          gateId: "attack",
          target: execution.targets[0],
          context: attackContext(execution.targets[0], "critical-packet"),
        },
      ],
    };
    const [gate] = deriveCombatEffectRequirements(program, invocation);
    if (!gate || gate.kind !== "attack") throw new Error("expected attack gate");
    const artifact = createReviewedCombatEffectArtifact(program, invocation, [
      { key: gate.key, value: d20Result(gate.context, 20) },
    ]);
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity({ hp: 0, maxHp: 10 }),
      })
    );

    expect(plan.consequences).toHaveLength(2);
    expect(plan.consequences[0]).toMatchObject({
      kind: "damage",
      packetId: "weapon-hit",
      appliedAmount: 10,
      components: [
        { stepId: "weapon", amount: 5, resolution: { criticalHit: true } },
        { stepId: "sneak", amount: 3, resolution: { criticalHit: true } },
        { stepId: "rider", amount: 2, resolution: { criticalHit: true } },
      ],
      defenseGroups: [
        {
          damageType: "slashing",
          amount: 8,
          componentStepIds: ["weapon", "sneak"],
        },
        { damageType: "fire", amount: 2, componentStepIds: ["rider"] },
      ],
      before: { deathSaves: { successes: 0, failures: 0 } },
      after: { deathSaves: { successes: 0, failures: 2 } },
    });
    expect(plan.consequences[1]).toMatchObject({
      kind: "condition",
      condition: "prone",
    });
  });

  it("applies half damage with floor, observes prior target state, and heals from landed damage", () => {
    const program = {
      version: 1,
      id: "ordered-life-drain",
      gates: [{ id: "save", kind: "save", scope: "target", ability: "DEX", dc: 15 }],
      inputs: [
        { id: "damage", kind: "roll", scope: "target", roll: { count: 1, sides: 6 } },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "drain-damage",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "damage" },
              damageType: { kind: "fixed", damageType: "necrotic" },
              gate: { gateId: "save", pass: "failure", otherwise: "half" },
            },
            {
              id: "knockdown",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "prone",
              lifetime: {
                kind: "turn-boundary",
                subject: "target",
                phase: "turn-end",
                offsetTurns: 1,
              },
              when: {
                kind: "state",
                subject: "target",
                field: "hp",
                comparison: "lte",
                value: 2,
              },
            },
            {
              id: "drain-heal",
              kind: "heal-from-landed-damage",
              scope: "program",
              subject: "source",
              damageStepIds: ["drain-damage"],
              fraction: 0.5,
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const invocation = {
      ...execution,
      encounterPosition: {
        round: 1,
        currentCombatantId: execution.sourceId,
        phase: "turn-start" as const,
        order: [execution.sourceId, execution.targets[0].combatantId],
      },
      gateContexts: [
        {
          gateId: "save",
          target: execution.targets[0],
          context: saveContext(execution.targets[0], "drain-save", 15),
        },
      ],
    };
    const requirements = deriveCombatEffectRequirements(program, invocation);
    const artifact = createReviewedCombatEffectArtifact(
      program,
      invocation,
      answersFor(requirements, (requirement) =>
        requirement.kind === "save" ? d20Result(requirement.context, 16) : diceFact([5])
      )
    );
    const state = new WorkingState({
      "source:hero:one": entity({ hp: 5, maxHp: 10 }),
      "target:enemy:one": entity({ hp: 4, maxHp: 4 }),
    });

    const { consequences } = interpretCombatEffectArtifact(artifact, state);
    expect(consequences.map(({ kind }) => kind)).toEqual(["damage", "condition", "heal"]);
    expect(consequences[0]).toMatchObject({
      appliedAmount: 2,
      components: [
        {
          amount: 2,
          damageType: "necrotic",
          resolution: {
            kind: "gate",
            gateKind: "save",
            ability: "DEX",
            result: "success",
            disposition: "half",
            criticalHit: false,
            baselineSave: { success: "half", failure: "full" },
          },
        },
      ],
    });
    expect(consequences[1]).toMatchObject({
      condition: "prone",
      lifetime: { kind: "turn-boundary", offsetTurns: 1 },
    });
    expect(consequences[2]).toMatchObject({ amount: 1, appliedAmount: 1 });
    expect(consequences[0]).toMatchObject({ before: { hp: 4 }, after: { hp: 2 } });
    expect(consequences[2]).toMatchObject({ before: { hp: 5 }, after: { hp: 6 } });
    expect(state.entities["target:enemy:one"]?.hp).toBe(4);
    expect(state.entities["source:hero:one"]?.hp).toBe(5);
  });

  it("returns exact reversible receipts for max-wins and idempotent state changes", () => {
    const program = {
      version: 1,
      id: "receipt-boundaries",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "mend",
              kind: "heal",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 5 },
            },
            {
              id: "ward",
              kind: "temp-hp",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 5 },
            },
            {
              id: "already-prone",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "prone",
            },
            {
              id: "stabilize",
              kind: "stabilize",
              scope: "target",
              subject: "target",
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const artifact = createReviewedCombatEffectArtifact(program, execution, []);
    const state = new WorkingState({
      "source:hero:one": entity(),
      "target:enemy:one": entity({
        hp: 9,
        maxHp: 10,
        tempHp: 8,
        stable: false,
        deathSaves: { successes: 1, failures: 2 },
        conditions: new Set(["prone"]),
        conditionLifetimes: { prone: { kind: "manual" } },
      }),
    });

    const plan = interpretCombatEffectArtifact(artifact, state);
    expect(plan.consequences).toMatchObject([
      {
        kind: "heal",
        amount: 5,
        appliedAmount: 1,
        before: { hp: 9 },
        after: { hp: 10 },
      },
      {
        kind: "temp-hp",
        appliedAmount: 0,
        before: { tempHp: 8 },
        after: { tempHp: 8 },
      },
      {
        kind: "condition",
        before: {
          conditions: ["prone"],
          conditionLifetimes: { prone: { kind: "manual" } },
        },
        after: {
          conditions: ["prone"],
          conditionLifetimes: { prone: { kind: "manual" } },
        },
      },
      {
        kind: "stabilize",
        before: {
          stable: false,
          deathSaves: { successes: 1, failures: 2 },
        },
        after: {
          stable: true,
          deathSaves: { successes: 3, failures: 0 },
        },
      },
    ]);
    expect(state.entities["target:enemy:one"]).toMatchObject({
      hp: 9,
      tempHp: 8,
      stable: false,
      deathSaves: { successes: 1, failures: 2 },
    });
  });

  it("discards every prior draft mutation when a later planning step throws", () => {
    const program = {
      version: 1,
      id: "draft-failure",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "first",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 2 },
              damageType: { kind: "fixed", damageType: "force" },
            },
            {
              id: "second",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 3 },
              damageType: { kind: "fixed", damageType: "force" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const artifact = createReviewedCombatEffectArtifact(program, execution, []);
    const root = new WorkingState({
      "source:hero:one": entity(),
      "target:enemy:one": entity({ hp: 10, maxHp: 10 }),
    });
    const failingPlanningState: CombatEffectPlanningState = {
      createDisposableDraft() {
        const draft = root.createDisposableDraft();
        let calls = 0;
        return {
          atomicReadSet: (header) => draft.atomicReadSet(header),
          read: (ref) => draft.read(ref),
          resourceValue: (ref, resourceId) => draft.resourceValue(ref, resourceId),
          conditionPresent: (ref, condition) => draft.conditionPresent(ref, condition),
          standingPresent: (ref, effectId) => draft.standingPresent(ref, effectId),
          apply(mutation) {
            const receipt = draft.apply(mutation);
            calls += 1;
            if (calls === 2) throw new Error("late draft failure");
            return receipt;
          },
        };
      },
    };

    expect(() => interpretCombatEffectArtifact(artifact, failingPlanningState)).toThrow(
      "late draft failure"
    );
    expect(root.entities["target:enemy:one"]?.hp).toBe(10);
  });

  it("resolves authored slot, character-level and persisted-tally scaling", () => {
    const program = {
      version: 1,
      id: "scaled-delayed-blast",
      counters: [{ id: "rounds", initial: 0 }],
      inputs: [
        {
          id: "blast-roll",
          kind: "roll",
          scope: "target",
          roll: {
            count: {
              base: 6,
              perSlot: { above: 3, amount: 1 },
              byCharacterLevel: [{ minLevel: 11, value: 8 }],
              perCounter: { counterId: "rounds", amount: 1 },
            },
            sides: 6,
          },
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "source-end", phaseId: "armed" },
          steps: [
            {
              id: "blast",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "blast-roll" },
              damageType: { kind: "fixed", damageType: "fire" },
            },
          ],
        },
        {
          id: "armed",
          trigger: { kind: "manual", eventId: "arm" },
          steps: [
            {
              id: "standing",
              kind: "standing",
              scope: "program",
              subject: "source",
              operation: "start",
              effectId: "armed-blast",
              lifetime: { kind: "source-end" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const requirements = deriveCombatEffectRequirements(program, {
      ...execution,
      castLevel: 5,
      characterLevel: 12,
      tallies: { rounds: 2 },
    });
    expect(requirements).toMatchObject([{ kind: "roll", roll: { count: 12, sides: 6 } }]);
  });

  it("carries a cross-turn tally into a bounded cadence and ends at its threshold", () => {
    const program = {
      version: 1,
      id: "three-failures",
      gates: [{ id: "repeat-save", kind: "save", scope: "target", ability: "CON" }],
      counters: [{ id: "failures", initial: 0 }],
      phases: [
        {
          id: "resolve",
          trigger: {
            kind: "turn-end",
            subject: "target",
            offsetTurns: 1,
            everyTurns: 1,
          },
          repeat: {
            id: "repeat-end",
            maxOccurrences: 5,
            endWhen: {
              kind: "counter",
              counterId: "failures",
              comparison: "gte",
              value: 3,
            },
          },
          steps: [
            {
              id: "tally-failure",
              kind: "counter",
              scope: "target",
              counterId: "failures",
              operation: "add",
              amount: { kind: "fixed", value: 1 },
              when: { kind: "gate", gateId: "repeat-save", result: "failure" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const invocation = {
      ...execution,
      occurrence: 2,
      tallies: { failures: 2 },
      gateContexts: [
        {
          gateId: "repeat-save",
          target: execution.targets[0],
          context: saveContext(execution.targets[0], "repeat-save", 15),
        },
      ],
    };
    const requirements = deriveCombatEffectRequirements(program, invocation);
    const gateRequirement = requirements[0];
    if (!gateRequirement || gateRequirement.kind !== "save") {
      throw new Error("expected save requirement");
    }
    const artifact = createReviewedCombatEffectArtifact(program, invocation, [
      { key: gateRequirement.key, value: d20Result(gateRequirement.context, 1) },
    ]);
    const state = new WorkingState({
      "source:hero:one": entity(),
      "target:enemy:one": entity(),
    });

    expect(interpretCombatEffectArtifact(artifact, state).consequences).toMatchObject([
      { kind: "counter", counterId: "failures", before: 2, after: 3 },
      { kind: "end-program", provenance: { stepId: "repeat-end", iteration: 2 } },
    ]);
  });

  it("freezes a JSON-plain artifact and replays it byte-deterministically without RNG", () => {
    const program = {
      version: 1,
      id: "deterministic-heal",
      inputs: [
        {
          id: "heal-roll",
          kind: "roll",
          scope: "target",
          roll: { count: 2, sides: 4, bonus: 2 },
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "heal",
              kind: "heal",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "heal-roll" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const requirements = deriveCombatEffectRequirements(program, execution);
    const artifactA = createReviewedCombatEffectArtifact(program, execution, [
      { key: at(requirements, 0).key, value: diceFact([2, 3], 7) },
    ]);
    const artifactB = createReviewedCombatEffectArtifact(
      structuredClone(program),
      { ...execution },
      [{ value: diceFact([2, 3], 7), key: at(requirements, 0).key }]
    );
    expect(serializeReviewedCombatEffectArtifact(artifactA)).toBe(
      serializeReviewedCombatEffectArtifact(artifactB)
    );
    expect(JSON.parse(serializeReviewedCombatEffectArtifact(artifactA))).toEqual(
      artifactA
    );

    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("RNG forbidden");
    });
    const run = () => {
      const state = new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity({ hp: 1, maxHp: 10 }),
      });
      return (
        serializeReviewedCombatEffectArtifact({
          ...artifactA,
          answers: artifactA.answers,
        }) + JSON.stringify(interpretCombatEffectArtifact(artifactA, state))
      );
    };
    expect(run()).toBe(run());
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it("compiles one-phase legacy facts without collapsing simultaneous damage types", () => {
    const program = compileLegacyCombatEffect({
      id: "legacy-storm",
      gate: { kind: "save", ability: "DEX", dc: 15 },
      damage: [
        {
          id: "fire-packet",
          amount: { kind: "roll", roll: { count: 2, sides: 6 } },
          damageType: "fire",
          onGateFailure: "half",
        },
        {
          id: "force-packet",
          amount: { kind: "fixed", value: 3 },
          damageType: "force",
          onGateFailure: "half",
        },
      ],
      condition: { operation: "apply", condition: "prone" },
    });
    expect(validateCombatEffectProgram(program)).toEqual({ valid: true, errors: [] });
    expect(program.phases).toHaveLength(1);
    expect(
      program.phases[0]?.steps
        .filter((step) => step.kind === "damage")
        .map((step) => step.damageType)
    ).toEqual([
      { kind: "fixed", damageType: "fire" },
      { kind: "fixed", damageType: "force" },
    ]);
  });

  it("rejects accessor-bearing authoring without invoking the accessor", () => {
    const getter = vi.fn(() => 1);
    const candidate = {
      id: "accessor-program",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [{ id: "end", kind: "end-program", scope: "program" }],
        },
      ],
    };
    Object.defineProperty(candidate, "version", { enumerable: true, get: getter });

    expect(validateCombatEffectProgram(candidate).valid).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it.each([
    ["empty phases", { version: 1, id: "bad", phases: [] }],
    [
      "duplicate ids",
      {
        version: 1,
        id: "bad",
        counters: [{ id: "same", initial: 0 }],
        phases: [
          {
            id: "same",
            trigger: { kind: "resolve" },
            steps: [{ id: "end", kind: "end-program", scope: "program" }],
          },
        ],
      },
    ],
    [
      "missing ref",
      {
        version: 1,
        id: "bad",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "damage",
                kind: "damage",
                scope: "target",
                subject: "target",
                amount: { kind: "input", inputId: "missing" },
                damageType: { kind: "fixed", damageType: "fire" },
              },
            ],
          },
        ],
      },
    ],
    [
      "scope leak",
      {
        version: 1,
        id: "bad",
        inputs: [
          { id: "roll", kind: "roll", scope: "instance", roll: { count: 1, sides: 6 } },
        ],
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "damage",
                kind: "damage",
                scope: "target",
                subject: "target",
                amount: { kind: "input", inputId: "roll" },
                damageType: { kind: "fixed", damageType: "fire" },
              },
            ],
          },
        ],
      },
    ],
    [
      "program-scoped target subject",
      {
        version: 1,
        id: "bad",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "heal",
                kind: "heal",
                scope: "program",
                subject: "target",
                amount: { kind: "fixed", value: 1 },
              },
            ],
          },
        ],
      },
    ],
    [
      "unbounded repeat",
      {
        version: 1,
        id: "bad",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "turn-end", subject: "target" },
            repeat: { id: "repeat", maxOccurrences: Infinity },
            steps: [{ id: "end", kind: "end-program", scope: "program" }],
          },
        ],
      },
    ],
    [
      "uncovered damage table",
      {
        version: 1,
        id: "bad",
        inputs: [
          {
            id: "table",
            kind: "table-roll",
            scope: "target",
            roll: { count: 1, sides: 3 },
          },
        ],
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "damage",
                kind: "damage",
                scope: "target",
                subject: "target",
                amount: { kind: "fixed", value: 1 },
                damageType: {
                  kind: "table",
                  inputId: "table",
                  rows: [{ min: 1, max: 2, damageType: "fire" }],
                },
              },
            ],
          },
        ],
      },
    ],
    [
      "ambiguous multi-type packet",
      {
        version: 1,
        id: "bad",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "damage",
                kind: "damage",
                scope: "target",
                subject: "target",
                amount: { kind: "fixed", value: 1 },
                damageType: { kind: "fixed", damageType: ["fire", "cold"] },
              },
            ],
          },
        ],
      },
    ],
    [
      "non-JSON RNG",
      {
        version: 1,
        id: "bad",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "damage",
                kind: "damage",
                scope: "target",
                subject: "target",
                amount: { kind: "fixed", value: Math.random },
                damageType: { kind: "fixed", damageType: "fire" },
              },
            ],
          },
        ],
      },
    ],
  ])("rejects invalid authoring: %s", (_label, candidate) => {
    expect(validateCombatEffectProgram(candidate).valid).toBe(false);
  });

  it("rejects missing, extra and physically inconsistent reviewed answers", () => {
    const program = {
      version: 1,
      id: "answer-boundary",
      inputs: [
        { id: "roll", kind: "roll", scope: "target", roll: { count: 2, sides: 6 } },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "heal",
              kind: "heal",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "roll" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const [requirement] = deriveCombatEffectRequirements(program, execution);
    if (!requirement) throw new Error("expected roll requirement");
    expect(() => createReviewedCombatEffectArtifact(program, execution, [])).toThrow(
      /missing answer/
    );
    expect(() =>
      createReviewedCombatEffectArtifact(program, execution, [
        { key: requirement.key, value: { ...diceFact([2, 3]), total: 99 } },
      ])
    ).toThrow(/must equal final faces/);
    expect(() =>
      createReviewedCombatEffectArtifact(program, execution, [
        { key: requirement.key, value: diceFact([2, 3]) },
        { key: "input:extra@program", value: "fire" },
      ])
    ).toThrow(/unexpected answer/);
  });

  it("keeps target and instance counters/layers independent and evaluates post-mutation HP", () => {
    const program = {
      version: 1,
      id: "scoped-state",
      counters: [
        { id: "target-count", initial: 0, scope: "target" },
        { id: "instance-count", initial: 0, scope: "instance" },
      ],
      layers: [
        { id: "target-layer", scope: "target", initial: "active" },
        { id: "instance-layer", scope: "instance", initial: "active" },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          instances: 2,
          steps: [
            {
              id: "impact",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 6 },
              damageType: { kind: "fixed", damageType: "force" },
            },
            {
              id: "target-count-step",
              kind: "counter",
              scope: "target",
              counterId: "target-count",
              operation: "add",
              amount: { kind: "fixed", value: 1 },
            },
            {
              id: "target-layer-step",
              kind: "layer",
              scope: "target",
              layerId: "target-layer",
              operation: "destroy",
            },
            {
              id: "threshold-heal",
              kind: "heal",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 2 },
              when: {
                kind: "state",
                subject: "target",
                field: "hp",
                comparison: "lte",
                value: 4,
              },
            },
            {
              id: "instance-count-step",
              kind: "counter",
              scope: "instance",
              counterId: "instance-count",
              operation: "add",
              amount: { kind: "fixed", value: 1 },
            },
            {
              id: "instance-layer-step",
              kind: "layer",
              scope: "instance",
              layerId: "instance-layer",
              operation: "destroy",
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const target = execution.targets[0];
    const invocation = {
      ...execution,
      instances: 2,
      instanceTargets: [target, target],
    };
    const artifact = createReviewedCombatEffectArtifact(program, invocation, []);
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity(),
      })
    );

    expect(plan.finalTallies).toEqual({
      "instance-count@instance:0": 1,
      "instance-count@instance:1": 1,
      "target-count@target:0": 1,
    });
    expect(plan.finalLayerStates).toEqual({
      "instance-layer@instance:0": "destroyed",
      "instance-layer@instance:1": "destroyed",
      "target-layer@target:0": "destroyed",
    });
    expect(plan.events?.filter((event) => event.kind === "layer")).toHaveLength(3);
    expect(plan.consequences.find((entry) => entry.kind === "heal")).toMatchObject({
      appliedAmount: 2,
      before: { hp: 4 },
      after: { hp: 6 },
    });
    expect(() =>
      deriveCombatEffectRequirements(program, {
        ...invocation,
        tallies: { "target-count@target:9": 1 },
      })
    ).toThrow(/unknown key/);
  });

  it("proves authored table rerolls through the final accepted face and resource trail", () => {
    const program = {
      version: 1,
      id: "reroll-table",
      inputs: [
        {
          id: "destination-table",
          kind: "table-roll",
          scope: "target",
          roll: { count: 1, sides: 6 },
          rerollValues: [1, 2],
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "teleport",
              kind: "relocation-event",
              scope: "target",
              subject: "target",
              mode: "teleport",
              destination: { kind: "table", inputId: "destination-table" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const [requirement] = deriveCombatEffectRequirements(program, execution);
    if (!requirement || requirement.kind !== "table-roll") {
      throw new Error("expected table requirement");
    }
    const valid: CombatEffectDiceFact = {
      dice: [
        {
          dieId: "table-die",
          initialFace: 1,
          replacements: [
            { sourceId: "authored-reroll", face: 2 },
            { sourceId: "lucky", resourceId: "luck-use", face: 5 },
          ],
        },
      ],
      consumedResourceIds: ["luck-use"],
      total: 5,
    };
    const artifact = createReviewedCombatEffectArtifact(program, execution, [
      { key: requirement.key, value: valid },
    ]);
    expect(serializeReviewedCombatEffectArtifact(artifact)).toContain(
      '"rerollValues":[1,2]'
    );
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity(),
      })
    );
    expect(plan.events?.[0]).toMatchObject({
      kind: "relocation-event",
      destination: {
        kind: "table",
        roll: { total: 5, consumedResourceIds: ["luck-use"] },
      },
    });
    expect(() =>
      createReviewedCombatEffectArtifact(program, execution, [
        {
          key: requirement.key,
          value: {
            dice: [
              {
                dieId: "table-die",
                initialFace: 5,
                replacements: [{ sourceId: "illegal", face: 6 }],
              },
            ],
            consumedResourceIds: [],
            total: 6,
          },
        },
      ])
    ).toThrow(/accepted face 5/);
    expect(() =>
      createReviewedCombatEffectArtifact(program, execution, [
        {
          key: requirement.key,
          value: {
            dice: [{ dieId: "table-die", initialFace: 2, replacements: [] }],
            consumedResourceIds: [],
            total: 2,
          },
        },
      ])
    ).toThrow(/final face 2/);
  });

  it("binds external roles, trigger facts and dynamic reduction amounts exactly", () => {
    const program = {
      version: 1,
      id: "triggered-defense",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "manual", eventId: "damage-received" },
          steps: [
            {
              id: "reduce",
              kind: "damage-reduction",
              scope: "program",
              subject: "victim",
              amount: { kind: "binding", binding: "triggering-damage" },
              damageTypes: ["fire"],
              when: {
                kind: "all",
                predicates: [
                  {
                    kind: "trigger-fact",
                    fact: "attack-result",
                    equals: "hit",
                  },
                  {
                    kind: "trigger-fact",
                    fact: "attack-critical",
                    equals: true,
                  },
                  {
                    kind: "trigger-fact",
                    fact: "triggering-damage",
                    comparison: "gte",
                    value: 1,
                  },
                  {
                    kind: "trigger-fact",
                    fact: "triggering-damage-source",
                    equals: "flame-blade",
                  },
                  {
                    kind: "trigger-fact",
                    fact: "triggering-damage-type",
                    equals: "fire",
                  },
                  {
                    kind: "trigger-fact",
                    fact: "triggering-range",
                    comparison: "lte",
                    value: 5,
                  },
                ],
              },
            },
            {
              id: "activator-ward",
              kind: "temp-hp",
              scope: "program",
              subject: "activator",
              amount: {
                kind: "binding",
                binding: "caster-spellcasting-modifier",
                add: 5,
              },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const invocation = {
      ...execution,
      bindings: { casterSpellcastingModifier: 3 },
      participants: {
        owner: { kind: "source", id: "effect-owner" },
        caster: { kind: "source", id: "original-caster" },
        activator: { kind: "target", target: { combatantId: "ally" } },
        "triggering-attacker": { kind: "source", id: "enemy-attacker" },
        victim: { kind: "target", target: { combatantId: "victim" } },
      },
      triggerFacts: {
        attack: { result: "hit", critical: true, range: 5 },
        damage: {
          amount: 9,
          sourceId: "flame-blade",
          damageType: "fire",
          range: 5,
        },
      },
    } as const;
    const artifact = createReviewedCombatEffectArtifact(program, invocation, []);
    expect(artifact.participants?.activator).not.toEqual(artifact.participants?.owner);
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({
        "source:hero:one": entity(),
        "target:victim": entity(),
        "target:ally": entity(),
      })
    );
    expect(
      plan.consequences.find((entry) => entry.kind === "damage-reduction")
    ).toMatchObject({
      kind: "damage-reduction",
      amount: 9,
      appliedAmount: 9,
      triggeringDamage: {
        amount: 9,
        sourceId: "flame-blade",
        damageType: "fire",
        range: 5,
      },
    });
    expect(plan.consequences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "temp-hp",
          amount: 8,
          recipient: { kind: "target", target: { combatantId: "ally" } },
        }),
      ])
    );
    expect(() =>
      createReviewedCombatEffectArtifact(
        program,
        {
          ...invocation,
          triggerFacts: {
            ...invocation.triggerFacts,
            attack: { result: "miss", critical: true, range: 5 },
          },
        },
        []
      )
    ).toThrow(/miss cannot be critical/);
    const missingVictim = createReviewedCombatEffectArtifact(
      program,
      {
        ...invocation,
        participants: {
          owner: invocation.participants.owner,
          caster: invocation.participants.caster,
          activator: invocation.participants.activator,
          "triggering-attacker": invocation.participants["triggering-attacker"],
        },
      },
      []
    );
    expect(() =>
      interpretCombatEffectArtifact(
        missingVictim,
        new WorkingState({
          "source:hero:one": entity(),
          "target:ally": entity(),
        })
      )
    ).toThrow(/participants.victim/);
  });

  it("supports explicit ceiling for odd incoming-damage halving", () => {
    const program = {
      version: 1,
      id: "halve-triggering-damage",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "halve",
              kind: "damage-reduction",
              scope: "program",
              subject: "source",
              amount: {
                kind: "binding",
                binding: "triggering-damage",
                multiplier: 0.5,
                rounding: "ceil",
              },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const artifact = createReviewedCombatEffectArtifact(
      program,
      {
        ...execution,
        targets: [],
        triggerFacts: { damage: { amount: 9, sourceId: "incoming-attack" } },
      },
      []
    );
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({ "source:hero:one": entity() })
    );

    expect(plan.consequences).toEqual([
      expect.objectContaining({
        kind: "damage-reduction",
        amount: 5,
        appliedAmount: 5,
      }),
    ]);
    const phase = program.phases[0];
    const step = phase?.steps[0];
    if (!phase || !step) throw new TypeError("Missing rounding test fixture");
    expect(
      validateCombatEffectProgram({
        ...program,
        phases: [
          {
            ...phase,
            steps: [
              {
                ...step,
                amount: {
                  ...step.amount,
                  rounding: "nearest",
                },
              },
            ],
          },
        ],
      }).valid
    ).toBe(false);
  });

  it("adds reviewed amount terms exactly and preserves typed spell-defense facts", () => {
    const program = {
      version: 1,
      id: "additive-spell-defense",
      inputs: [
        {
          id: "reduction-roll",
          kind: "roll",
          scope: "program",
          roll: {
            count: { base: 4, perSlot: { above: 4, amount: 1 } },
            sides: 6,
          },
        },
        {
          id: "spell-damage-roll",
          kind: "roll",
          scope: "target",
          roll: { count: 1, sides: 6 },
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "manual", eventId: "spell-retaliation" },
          steps: [
            {
              id: "reduce",
              kind: "damage-reduction",
              scope: "program",
              subject: "victim",
              amount: {
                kind: "sum",
                terms: [
                  { kind: "input", inputId: "reduction-roll" },
                  {
                    kind: "binding",
                    binding: "caster-spellcasting-modifier",
                  },
                ],
              },
            },
            {
              id: "retaliate",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "input", inputId: "spell-damage-roll" },
              damageType: { kind: "fixed", damageType: "force" },
              damageSource: "spell",
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const invocation = {
      ...execution,
      castLevel: 6,
      bindings: { casterSpellcastingModifier: 3 },
      participants: {
        victim: { kind: "target", target: execution.targets[0] },
      },
      triggerFacts: { damage: { amount: 12, sourceId: "incoming" } },
    } as const;
    const requirements = deriveCombatEffectRequirements(program, invocation);
    expect(
      requirements.map((entry) =>
        entry.kind === "roll" || entry.kind === "table-roll" ? entry.roll : null
      )
    ).toEqual([
      { count: 6, sides: 6, bonus: 0 },
      { count: 1, sides: 6, bonus: 0 },
    ]);
    const artifact = createReviewedCombatEffectArtifact(
      program,
      invocation,
      answersFor(requirements, (requirement) =>
        requirement.refId === "reduction-roll"
          ? diceFact([2, 2, 2, 2, 2, 2])
          : diceFact([6])
      )
    );
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity(),
      })
    );
    expect(plan.sourceId).toBe("hero:one");
    expect(plan.consequences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "damage-reduction",
          amount: 15,
          appliedAmount: 12,
        }),
        expect.objectContaining({
          kind: "damage",
          damageSource: "spell",
          components: [
            expect.objectContaining({
              amount: 6,
              damageSource: "spell",
            }),
          ],
        }),
      ])
    );
  });

  it("rejects malformed, overflowing and negative additive amounts", () => {
    const candidate = (amount: unknown) => ({
      version: 1,
      id: "bad-sum",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "heal",
              kind: "heal",
              scope: "program",
              subject: "source",
              amount,
            },
          ],
        },
      ],
    });
    expect(
      validateCombatEffectProgram(
        candidate({ kind: "sum", terms: [{ kind: "fixed", value: 1 }] })
      ).errors.join("\n")
    ).toMatch(/expected 2\.\.16 amount terms/);
    expect(
      validateCombatEffectProgram(
        candidate({
          kind: "sum",
          terms: [
            { kind: "fixed", value: 1 },
            {
              kind: "sum",
              terms: [
                { kind: "fixed", value: 1 },
                { kind: "fixed", value: 1 },
              ],
            },
          ],
        })
      ).errors.join("\n")
    ).toMatch(/invalid amount term kind/);
    expect(
      validateCombatEffectProgram(
        candidate({
          kind: "sum",
          terms: [
            { kind: "fixed", value: 1 },
            { kind: "fixed", value: 1 },
          ],
          add: -3,
        })
      ).valid
    ).toBe(true);
    for (const amount of [
      {
        kind: "sum",
        terms: [
          { kind: "fixed", value: Number.MAX_SAFE_INTEGER },
          { kind: "fixed", value: 1 },
        ],
      },
      {
        kind: "sum",
        terms: [
          { kind: "fixed", value: 1 },
          { kind: "fixed", value: 1 },
        ],
        add: -3,
      },
    ]) {
      const program = candidate(amount) as CombatEffectProgram;
      const artifact = createReviewedCombatEffectArtifact(program, execution, []);
      expect(() =>
        interpretCombatEffectArtifact(
          artifact,
          new WorkingState({ "source:hero:one": entity() })
        )
      ).toThrow(/safe non-negative integer/);
    }
    expect(
      validateCombatEffectProgram({
        version: 1,
        id: "bad-source",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "damage",
                kind: "damage",
                scope: "target",
                subject: "target",
                amount: { kind: "fixed", value: 1 },
                damageType: { kind: "fixed", damageType: "force" },
                damageSource: "program-id-inference",
              },
            ],
          },
        ],
      }).errors.join("\n")
    ).toMatch(/invalid damage source/);
  });

  it("reviews conditional dynamic-DC skill checks and verifies size-derived advantage", () => {
    const program = {
      version: 1,
      id: "conditional-check",
      gates: [
        {
          id: "contest",
          kind: "check",
          scope: "target",
          ability: ["STR", "DEX"],
          skill: ["athletics", "acrobatics"],
          dc: { kind: "binding", binding: "caster-spell-save-dc" },
          when: { kind: "trigger-fact", fact: "attack-result", equals: "hit" },
          sizeAdvantage: {
            subject: "target",
            comparison: "gte",
            size: "Large",
            sourceId: "large-target-advantage",
          },
        },
      ],
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "knock-prone",
              kind: "condition",
              scope: "target",
              subject: "target",
              operation: "apply",
              condition: "prone",
              when: {
                kind: "gate",
                gateId: "contest",
                result: "success",
              },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const target = execution.targets[0];
    const context: D20TestRequest = {
      ability: "STR",
      actor: combatTableEntityRef(target.combatantId),
      difficultyClass: fixed(16),
      enteredModifiers: [],
      kind: "ability-check",
      modifiers: [],
      resolution: { kind: "rolled" },
      rollRules: {
        ...emptyRollRules(),
        advantageSourceIds: ["large-target-advantage"],
      },
      target: null,
      testId: "contest",
    };
    const invocation = {
      ...execution,
      bindings: { casterSpellSaveDc: 16 },
      triggerFacts: { attack: { result: "hit", critical: false } },
      participantFacts: [{ participant: { kind: "target", target }, size: "Large" }],
      gateContexts: [
        {
          gateId: "contest",
          target,
          ability: "STR",
          skill: "athletics",
          context,
        },
      ],
    } as const;
    const [requirement] = deriveCombatEffectRequirements(program, invocation);
    expect(requirement).toMatchObject({
      kind: "check",
      dc: 16,
      ability: "STR",
      skill: "athletics",
    });
    if (!requirement || requirement.kind !== "check") {
      throw new Error("expected check requirement");
    }
    const result = d20Result(context, 8, 18);
    const artifact = createReviewedCombatEffectArtifact(program, invocation, [
      { key: requirement.key, value: result },
    ]);
    expect(
      interpretCombatEffectArtifact(
        artifact,
        new WorkingState({
          "source:hero:one": entity(),
          "target:enemy:one": entity(),
        })
      ).consequences
    ).toEqual([expect.objectContaining({ kind: "condition", condition: "prone" })]);
    expect(() =>
      deriveCombatEffectRequirements(program, {
        ...invocation,
        gateContexts: [
          {
            ...invocation.gateContexts[0],
            context: { ...context, rollRules: emptyRollRules() },
          },
        ],
      })
    ).toThrow(/size-derived advantage/);
    expect(() =>
      deriveCombatEffectRequirements(program, {
        ...invocation,
        gateContexts: [
          {
            ...invocation.gateContexts[0],
            skill: "arcana",
          },
        ],
      })
    ).toThrow(/skill: choice is not authored/);
    expect(() =>
      deriveCombatEffectRequirements(program, {
        ...invocation,
        gateContexts: [
          {
            ...invocation.gateContexts[0],
            context: { ...context, difficultyClass: fixed(15) },
          },
        ],
      })
    ).toThrow(/DC conflicts with authoring/);
    expect(
      deriveCombatEffectRequirements(program, {
        ...invocation,
        triggerFacts: { attack: { result: "miss", critical: false } },
        gateContexts: [],
      })
    ).toEqual([]);
  });

  it("preserves elapsed lifetimes, area facts, layer triggers and manual relocation events", () => {
    const program = {
      version: 1,
      id: "persistent-area",
      layers: [{ id: "wall-layer", scope: "program", initial: "destroyed" }],
      phases: [
        {
          id: "fallout",
          trigger: { kind: "layer-destroyed", layerId: "wall-layer" },
          steps: [
            {
              id: "terrain",
              kind: "area-state",
              scope: "program",
              operation: "apply",
              fact: "difficult-terrain",
              lifetime: { kind: "elapsed", amount: 10, unit: "minute" },
            },
            {
              id: "obscure",
              kind: "area-state",
              scope: "program",
              operation: "apply",
              fact: "obscured",
            },
            {
              id: "wind",
              kind: "area-state",
              scope: "program",
              operation: "apply",
              fact: "strong-wind",
            },
            {
              id: "block-ranged",
              kind: "area-state",
              scope: "program",
              operation: "apply",
              fact: "ranged-weapon-impossible",
            },
            {
              id: "banish",
              kind: "relocation-event",
              scope: "target",
              subject: "target",
              mode: "plane-transfer",
              destination: { kind: "manual" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const invocation = { ...execution, phaseId: "fallout" };
    const artifact = createReviewedCombatEffectArtifact(program, invocation, []);
    const plan = interpretCombatEffectArtifact(
      artifact,
      new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity(),
      })
    );
    expect(plan.initialTallies).toEqual({});
    expect(plan.initialLayerStates).toEqual({ "wall-layer": "destroyed" });
    expect(plan.initialAreaStates).toEqual([]);
    expect(plan.finalAreaStates).toEqual([
      "difficult-terrain",
      "obscured",
      "ranged-weapon-impossible",
      "strong-wind",
    ]);
    expect(plan.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "area-state",
          fact: "difficult-terrain",
          lifetime: { kind: "elapsed", amount: 10, unit: "minute" },
        }),
        expect.objectContaining({
          kind: "relocation-event",
          mode: "plane-transfer",
          destination: { kind: "manual" },
        }),
      ])
    );
    const invalid = structuredClone(program) as unknown as {
      layers: Array<{ scope: string }>;
    };
    at(invalid.layers, 0).scope = "target";
    expect(validateCombatEffectProgram(invalid).errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/destruction triggers require program scope/),
      ])
    );
  });

  it("rejects malformed scoped, duration, area and relocation primitives at authoring", () => {
    const errorsFor = (candidate: unknown) =>
      validateCombatEffectProgram(candidate).errors.join("\n");
    expect(
      errorsFor({
        version: 1,
        id: "bad-counter-scope",
        counters: [{ id: "per-instance", initial: 0, scope: "instance" }],
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "write",
                kind: "counter",
                scope: "target",
                counterId: "per-instance",
                operation: "add",
                amount: { kind: "fixed", value: 1 },
              },
            ],
          },
        ],
      })
    ).toMatch(/instance reference is unavailable from target scope/);
    expect(
      errorsFor({
        version: 1,
        id: "bad-duration",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "condition",
                kind: "condition",
                scope: "target",
                subject: "target",
                operation: "apply",
                condition: "prone",
                lifetime: { kind: "elapsed", amount: 0, unit: "minute" },
              },
            ],
          },
        ],
      })
    ).toMatch(/expected positive integer/);
    expect(
      errorsFor({
        version: 1,
        id: "bad-area",
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "area",
                kind: "area-state",
                scope: "program",
                operation: "apply",
                fact: "vacuum",
              },
            ],
          },
        ],
      })
    ).toMatch(/invalid area-state fact/);
    expect(
      errorsFor({
        version: 1,
        id: "bad-relocation-table",
        inputs: [
          {
            id: "destination",
            kind: "choice",
            scope: "target",
            options: ["one", "two"],
          },
        ],
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "relocate",
                kind: "relocation-event",
                scope: "target",
                subject: "target",
                mode: "teleport",
                destination: { kind: "table", inputId: "destination" },
              },
            ],
          },
        ],
      })
    ).toMatch(/expected table-roll reference/);
    expect(
      errorsFor({
        version: 1,
        id: "bad-reroll-policy",
        inputs: [
          {
            id: "table",
            kind: "table-roll",
            scope: "target",
            roll: { count: 1, sides: 2 },
            rerollValues: [1, 2],
          },
        ],
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "relocate",
                kind: "relocation-event",
                scope: "target",
                subject: "target",
                mode: "teleport",
                destination: { kind: "table", inputId: "table" },
              },
            ],
          },
        ],
      })
    ).toMatch(/policy must leave an accepted face/);
    expect(
      errorsFor({
        version: 1,
        id: "bad-conditional-cycle",
        gates: [
          {
            id: "first",
            kind: "save",
            scope: "target",
            ability: "DEX",
            when: { kind: "gate", gateId: "second", result: "failure" },
          },
          {
            id: "second",
            kind: "save",
            scope: "target",
            ability: "WIS",
            when: { kind: "gate", gateId: "first", result: "failure" },
          },
        ],
        phases: [
          {
            id: "resolve",
            trigger: { kind: "resolve" },
            steps: [
              {
                id: "condition",
                kind: "condition",
                scope: "target",
                subject: "target",
                operation: "apply",
                condition: "prone",
                when: { kind: "gate", gateId: "first", result: "failure" },
              },
            ],
          },
        ],
      })
    ).toMatch(/cyclic conditional dependency/);
  });

  it("keeps program and reviewed-artifact schema 1 backward compatible", () => {
    const program = {
      version: 1,
      id: "legacy-compatible",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "stabilize",
              kind: "stabilize",
              scope: "target",
              subject: "target",
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const created = createReviewedCombatEffectArtifact(program, execution, []);
    const legacyShape = structuredClone(created) as {
      -readonly [Key in keyof typeof created]: (typeof created)[Key];
    };
    delete legacyShape.layerStates;
    delete legacyShape.areaStates;
    delete legacyShape.bindings;
    delete legacyShape.participants;
    delete legacyShape.participantFacts;
    delete legacyShape.triggerFacts;
    expect(() => serializeReviewedCombatEffectArtifact(legacyShape)).not.toThrow();
    const plan = interpretCombatEffectArtifact(
      legacyShape,
      new WorkingState({
        "source:hero:one": entity(),
        "target:enemy:one": entity({ hp: 0 }),
      })
    );
    expect(Object.hasOwn(plan, "events")).toBe(false);
    expect(Object.hasOwn(plan, "finalLayerStates")).toBe(false);
    expect(Object.hasOwn(plan, "finalAreaStates")).toBe(false);
  });
});
