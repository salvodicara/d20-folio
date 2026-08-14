import { describe, expect, it } from "vitest";

import type {
  CombatEffectLifetime,
  CombatEffectProgram,
  DamageSource,
} from "@/data/types";
import type { DamageType } from "@/types/damage";
import {
  createCombatEffectPlanningState,
  type CombatEffectPlanningEntitySeed,
} from "@/lib/combat-effect-planning-state";
import type {
  AtomicOwner,
  CombatEffectAtomicReadSetHeader,
} from "@/lib/combat-effect-atomic";
import {
  atomicDocumentForOwner,
  atomicDocumentKey,
  atomicLedgerForOwner,
  conformCombatEffectAtomicReadSet,
} from "@/lib/combat-effect-atomic";
import type {
  CombatEffectDamageComponent,
  CombatEffectEntityRef,
  CombatEffectMutation,
  CombatEffectStateView,
} from "@/lib/combat-effect-program";
import {
  combatEffectOccurrenceId,
  combatEffectOccurrenceInitialHeadId,
  createReviewedCombatEffectArtifact,
  interpretCombatEffectArtifact,
} from "@/lib/combat-effect-program";
import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const targetRef = {
  kind: "target",
  target: { combatantId: "enemy:one" },
} as const;

const provenance = {
  occurrenceId: "cast:one",
  programId: "effect-program",
  phaseId: "resolve",
  stepId: "step",
  target: targetRef.target,
  instance: 0,
  iteration: 0,
} as const;

function state(overrides: Partial<CombatEffectStateView> = {}): CombatEffectStateView {
  return {
    hp: 20,
    maxHp: 20,
    tempHp: 0,
    stable: false,
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    conditionLifetimes: {},
    standing: [],
    standingLifetimes: {},
    resources: {},
    stateFlags: {},
    ...overrides,
  };
}

function defenses(overrides: Partial<DamageDefenses> = {}): DamageDefenses {
  return {
    ...NO_DEFENSES,
    resistances: new Set(),
    immunities: new Set(),
    vulnerabilities: new Set(),
    sourceResistances: new Set(),
    flatReductions: [],
    saveDamageRules: [],
    ...overrides,
  };
}

function seed(
  ref: CombatEffectEntityRef = targetRef,
  initial: CombatEffectStateView = state(),
  targetDefenses: DamageDefenses = defenses(),
  resourceCapacities: Readonly<Record<string, number>> = {},
  lifecycleHeader?: CombatEffectAtomicReadSetHeader
): CombatEffectPlanningEntitySeed {
  const combatantId = ref.kind === "source" ? ref.id : ref.target.combatantId;
  const owner: AtomicOwner = {
    kind: "monster",
    surface: "shared",
    campaignId: "campaign:test",
    encounterEpoch: 1,
    combatantId,
  };
  return {
    owner,
    documentRevisions: [
      ...new Map(
        [atomicDocumentForOwner(owner), atomicLedgerForOwner(owner)].map((document) => [
          atomicDocumentKey(document),
          { document, revision: 1 },
        ])
      ).values(),
    ],
    refs: [ref],
    baseState: initial,
    defenses: targetDefenses,
    resourceSnapshots: Object.fromEntries(
      Object.entries(initial.resources).map(([resourceId, current]) => [
        resourceId,
        {
          present: true,
          binding: { kind: "tracker", trackerId: resourceId },
          current,
          capacity: resourceCapacities[resourceId] ?? current,
          enabled: true,
        },
      ])
    ),
    stateFlagBindings: Object.fromEntries(
      Object.keys(initial.stateFlags).map((stateKey) => [
        stateKey,
        { kind: "active-feature", activeKey: stateKey },
      ])
    ),
    occurrenceHeads: [],
    lifecycleHeads:
      lifecycleHeader === undefined
        ? []
        : [{ header: lifecycleHeader, expected: { present: false } }],
  };
}

function component(args: {
  stepId: string;
  amount: number;
  damageType: DamageType;
  damageSource?: DamageSource;
  delivery?: "attack" | "automatic";
  critical?: boolean;
}): CombatEffectDamageComponent {
  return {
    stepId: args.stepId,
    amount: args.amount,
    damageType: args.damageType,
    ...(args.damageSource === undefined ? {} : { damageSource: args.damageSource }),
    resolution:
      args.delivery === "attack"
        ? {
            kind: "gate",
            gateId: "attack-roll",
            gateKind: "attack",
            result: args.critical ? "critical-hit" : "hit",
            disposition: "full",
            criticalHit: args.critical === true,
          }
        : { kind: "unconditional", disposition: "full", criticalHit: false },
  };
}

function saveComponent(args: {
  stepId: string;
  amount: number;
  result: "success" | "failure";
  success: "none" | "half" | "full";
  failure?: "none" | "half" | "full";
}): CombatEffectDamageComponent {
  return {
    stepId: args.stepId,
    amount: args.amount,
    damageType: "fire",
    damageSource: "spell",
    resolution: {
      kind: "gate",
      gateId: "dexterity-save",
      gateKind: "save",
      ability: "DEX",
      result: args.result,
      disposition: args.result === "success" && args.success === "half" ? "half" : "full",
      criticalHit: false,
      baselineSave: {
        success: args.success,
        failure: args.failure ?? "full",
      },
    },
  };
}

function damageMutation(
  components: ReadonlyArray<CombatEffectDamageComponent>,
  recipient: CombatEffectEntityRef = targetRef,
  damageSource?: DamageSource
): Extract<CombatEffectMutation, { kind: "damage" }> {
  const groups = new Map<
    DamageType,
    { damageType: DamageType; amount: number; componentStepIds: string[] }
  >();
  for (const entry of components) {
    const prior = groups.get(entry.damageType);
    if (prior) {
      prior.amount += entry.amount;
      prior.componentStepIds.push(entry.stepId);
    } else {
      groups.set(entry.damageType, {
        damageType: entry.damageType,
        amount: entry.amount,
        componentStepIds: [entry.stepId],
      });
    }
  }
  return {
    kind: "damage",
    provenance,
    recipient,
    packetId: "packet",
    ...(damageSource === undefined ? {} : { damageSource }),
    components,
    defenseGroups: [...groups.values()],
  };
}

function programConditionEffect(args: {
  occurrenceId: string;
  condition: "prone" | "restrained";
  stepId?: string;
}): ActiveCombatEffect {
  const recipient = {
    kind: "target" as const,
    target: { combatantId: "enemy:one" },
  };
  const owner = {
    occurrenceId: args.occurrenceId,
    programId: "effect-program",
    phaseId: "apply",
    stepId: args.stepId ?? "apply-condition",
    operationId: `command:${args.occurrenceId}`,
    instance: 0,
    iteration: 0,
  } as const;
  const effectId = combatEffectOccurrenceId({
    kind: "condition",
    operation: "apply",
    condition: args.condition,
    provenance: {
      ...owner,
      target: recipient.target,
    },
    recipient,
  });
  return {
    id: effectId,
    actor: { kind: "monster", combatantId: `caster:${args.occurrenceId}` },
    target: {
      kind: "monster",
      combatantId: "enemy:one",
    },
    source: {
      kind: "spell",
      id: "test-program-spell",
      actionId: "spell-test-program-spell",
    },
    payload: { kind: "condition", conditionId: args.condition },
    programOwner: owner,
    authoredLifetime: { kind: "manual" },
    duration: { kind: "encounter" },
  };
}

function grantEffect(
  id: string,
  sourceId: "death-ward" | "warding-bond"
): ActiveCombatEffect {
  return {
    id,
    actor: { kind: "monster", combatantId: `caster:${id}` },
    target: { kind: "monster", combatantId: "enemy:one" },
    source: { kind: "spell", id: sourceId, actionId: `spell-${sourceId}` },
    payload: { kind: "grant-group", activeKey: `spell-${sourceId}` },
    duration: { kind: "encounter" },
  };
}

function persisted(effect: ActiveCombatEffect, headOpId = `apply:${effect.id}`) {
  return { effectId: effect.id, effect, headOpId, active: true, terminal: false };
}

function apply(
  initial: CombatEffectStateView,
  mutation: CombatEffectMutation,
  targetDefenses: DamageDefenses = defenses()
) {
  return createCombatEffectPlanningState([seed(targetRef, initial, targetDefenses)])
    .createDisposableDraft()
    .apply(mutation);
}

describe("combat-effect planning state — exact entity snapshots", () => {
  it("fences the exact distinct physical documents and rejects invalid manifests", () => {
    const header = {
      occurrenceId: "cast:physical",
      programId: "effect-program",
      sourceId: "hero:one",
    } as const;
    const source = seed({ kind: "source", id: "hero:one" });
    source.owner = {
      kind: "pc",
      surface: "shared",
      campaignId: "campaign:test",
      encounterEpoch: 1,
      combatantId: "hero:one",
      memberUid: "user:one",
      characterId: "character:one",
    };
    source.documentRevisions = [
      ...new Map(
        [atomicDocumentForOwner(source.owner), atomicLedgerForOwner(source.owner)].map(
          (document) => [atomicDocumentKey(document), { document, revision: 1 }]
        )
      ).values(),
    ];
    source.lifecycleHeads = [
      {
        header,
        expected: { present: false },
      },
    ];
    const firstMonster = seed({
      kind: "target",
      target: { combatantId: "enemy:one" },
    });
    const secondMonster = seed({
      kind: "target",
      target: { combatantId: "enemy:two" },
    });
    const candidate = createCombatEffectPlanningState([
      source,
      firstMonster,
      secondMonster,
    ])
      .createDisposableDraft()
      .atomicReadSet(header);
    const readSet = conformCombatEffectAtomicReadSet(candidate, header);
    if (!readSet) throw new TypeError("Missing physical-document read-set fixture");
    const revisions = readSet.reads.filter(
      (read) => read.address.kind === "document-revision"
    );
    expect(revisions).toHaveLength(2);
    expect(
      revisions.map((read) =>
        read.address.kind === "document-revision"
          ? atomicDocumentKey(read.address.document)
          : ""
      )
    ).toEqual(
      expect.arrayContaining(
        source.documentRevisions.map(({ document }) => atomicDocumentKey(document))
      )
    );

    const missing = seed();
    missing.documentRevisions = [];
    expect(() => createCombatEffectPlanningState([missing])).toThrow(/missing/);

    const extra = seed();
    extra.documentRevisions = [
      ...extra.documentRevisions,
      {
        document: {
          kind: "character-play",
          uid: "unrelated:user",
          characterId: "unrelated:character",
        },
        revision: 1,
      },
    ];
    expect(() => createCombatEffectPlanningState([extra])).toThrow(/unrelated/);

    secondMonster.documentRevisions = secondMonster.documentRevisions.map((entry) => ({
      ...entry,
      revision: 2,
    }));
    expect(() => createCombatEffectPlanningState([firstMonster, secondMonster])).toThrow(
      /Conflicting/
    );
  });

  it("rejects duplicate exact refs and missing refs", () => {
    expect(() => createCombatEffectPlanningState([seed(), seed()])).toThrow(
      /Duplicate combat-effect entity reference/
    );

    const exact = {
      kind: "target",
      target: { combatantId: "enemy:one" },
    } as const;
    const missing = { kind: "target", target: { combatantId: "enemy:two" } } as const;
    const draft = createCombatEffectPlanningState([seed(exact)]).createDisposableDraft();
    expect(() => draft.read(missing)).toThrow(/missing or stale/);
    expect(() =>
      draft.apply(
        damageMutation(
          [component({ stepId: "hit", amount: 1, damageType: "force" })],
          missing
        )
      )
    ).toThrow(/missing or stale/);
  });

  it("builds the complete frozen read set from typed owner snapshots", () => {
    const header = {
      occurrenceId: "cast:atomic",
      programId: "atomic-program",
      sourceId: "hero:one",
    } as const;
    const inactive = grantEffect("inactive:ward", "death-ward");
    const target = seed(
      targetRef,
      state({
        conditions: ["poisoned", "frightened"],
        conditionLifetimes: { poisoned: null, frightened: null },
        standing: ["ward", "aura"],
        standingLifetimes: { ward: null, aura: null },
        resources: { focus: 2 },
        stateFlags: { "death-ward": true },
      }),
      defenses(),
      { focus: 3 }
    );
    target.resourceSnapshots = {
      ...target.resourceSnapshots,
      rage: { present: false },
    };
    target.occurrenceHeads = [
      {
        ...persisted(inactive, "head:inactive"),
        active: false,
        terminal: true,
      },
    ];
    target.stateZeroHpFloors = [{ stateKey: "death-ward", hitPoints: 1 }];
    const source = seed(
      { kind: "source", id: "hero:one" },
      state(),
      defenses(),
      {},
      header
    );

    const candidate = createCombatEffectPlanningState([target, source])
      .createDisposableDraft()
      .atomicReadSet(header);
    const readSet = conformCombatEffectAtomicReadSet(candidate, header);
    if (!readSet) throw new TypeError("Missing read-set fixture");

    expect(Object.isFrozen(readSet)).toBe(true);
    expect(readSet.bindings).toHaveLength(2);
    expect(readSet.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: { kind: "resource", programResourceId: "rage" },
          expected: { present: false },
        }),
        expect.objectContaining({
          address: { kind: "occurrence-heads" },
          expected: [expect.objectContaining({ active: false, terminal: true })],
        }),
        expect.objectContaining({
          address: { kind: "lifecycle-head", ...header },
          expected: { present: false },
        }),
      ])
    );
    expect(
      readSet.reads.find(
        (read) =>
          read.address.kind === "base-state" &&
          read.owner.combatantId === targetRef.target.combatantId
      )?.expected
    ).toMatchObject({
      conditions: ["frightened", "poisoned"],
      standing: ["aura", "ward"],
    });
    expect(
      createCombatEffectPlanningState([target, source])
        .createDisposableDraft()
        .read(targetRef)
    ).toMatchObject({
      conditions: ["frightened", "poisoned"],
      standing: ["aura", "ward"],
    });
  });

  it("requires explicit absent snapshots for resource predicates", () => {
    const program = {
      version: 1,
      id: "resource-absence",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "when-empty",
              kind: "stabilize",
              scope: "target",
              subject: "target",
              when: {
                kind: "resource",
                subject: "target",
                resourceId: "focus",
                comparison: "eq",
                value: 0,
              },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const header = {
      occurrenceId: "cast:resource-absence",
      programId: program.id,
      sourceId: "hero:one",
    } as const;
    const artifact = createReviewedCombatEffectArtifact(
      program,
      {
        occurrenceId: header.occurrenceId,
        sourceId: header.sourceId,
        phaseId: "resolve",
        targets: [targetRef.target],
        instances: 1,
      },
      []
    );
    const source = seed(
      { kind: "source", id: header.sourceId },
      state(),
      defenses(),
      {},
      header
    );
    expect(() =>
      interpretCombatEffectArtifact(
        artifact,
        createCombatEffectPlanningState([seed(), source])
      )
    ).toThrow(/explicit atomic snapshot/);

    const target = seed();
    target.resourceSnapshots = { focus: { present: false } };
    const plan = interpretCombatEffectArtifact(
      artifact,
      createCombatEffectPlanningState([target, source])
    );
    expect(plan.readSet.reads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: { kind: "resource", programResourceId: "focus" },
          expected: { present: false },
        }),
      ])
    );
  });

  it("rejects divergent HP floors for one mirrored state and occurrence authority", () => {
    const ward = grantEffect("death-ward:mirror", "death-ward");
    const target = seed(targetRef, state({ stateFlags: { "spell-death-ward": true } }));
    target.occurrenceHeads = [persisted(ward)];
    target.stateZeroHpFloors = [{ stateKey: "spell-death-ward", hitPoints: 2 }];

    expect(() => createCombatEffectPlanningState([target])).toThrow(
      /disagrees with its occurrence/
    );
  });

  it("isolates cancelled and independent interpretations from their seed", () => {
    const original = state({ hp: 10, maxHp: 10 });
    const planning = createCombatEffectPlanningState([seed(targetRef, original)]);
    const cancelled = planning.createDisposableDraft();
    cancelled.apply(
      damageMutation([component({ stepId: "hit", amount: 4, damageType: "force" })])
    );

    expect(cancelled.read(targetRef).hp).toBe(6);
    expect(Object.isFrozen(cancelled.read(targetRef))).toBe(true);
    expect(planning.createDisposableDraft().read(targetRef).hp).toBe(10);
    expect(original.hp).toBe(10);
  });

  it("accepts exact persistent inputs without mutating their seed", () => {
    const ward = grantEffect("death-ward:one", "death-ward");
    const bond = grantEffect("warding-bond:one", "warding-bond");
    const planning = createCombatEffectPlanningState([
      {
        ...seed(targetRef, state({ hp: 8, stateFlags: { "spell-death-ward": true } })),
        occurrenceHeads: [persisted(ward), persisted(bond)],
        stateZeroHpFloors: [{ stateKey: "spell-death-ward", hitPoints: 1 }],
      },
      seed({ kind: "source", id: "caster:warding-bond:one" }, state({ hp: 20 })),
    ]);
    const draft = planning.createDisposableDraft();
    const receipt = draft.apply(
      damageMutation([component({ stepId: "fatal", amount: 20, damageType: "force" })])
    );

    expect(receipt.after.hp).toBe(1);
    expect(receipt.appliedAmount).toBe(10);
    expect(receipt.persistentConsequences?.occurrenceChanges).toEqual([
      expect.objectContaining({
        effectId: ward.id,
        expectedHeadOpId: `apply:${ward.id}`,
        expectedEffect: {
          programOwner: null,
          payload: { kind: "grant-group", activeKey: "spell-death-ward" },
        },
        expectedActive: true,
        active: false,
        reason: "damage-consume",
      }),
    ]);
    expect(receipt.generatedMutations).toHaveLength(2);
    expect(receipt.generatedMutations?.[0]).toMatchObject({
      mutation: {
        kind: "state-flag",
        operation: "deactivate",
        stateKey: "spell-death-ward",
        recipient: targetRef,
      },
      source: {
        kind: "state-flag",
        recipient: targetRef,
        stateKey: "spell-death-ward",
        expectedActive: true,
        hitPoints: 1,
      },
    });
    expect(receipt.generatedMutations?.[1]).toMatchObject({
      mutation: {
        kind: "resolved-damage",
        amount: 10,
        sourceEffectId: bond.id,
        transferPath: [bond.id],
        recipient: { kind: "source", id: "caster:warding-bond:one" },
      },
      source: {
        kind: "effect-occurrence",
        recipient: targetRef,
        effect: bond,
        expectedHeadOpId: `apply:${bond.id}`,
        expectedActive: true,
      },
    });
    for (const generated of receipt.generatedMutations ?? []) {
      draft.apply(generated.mutation);
    }
    expect(draft.read(targetRef).stateFlags).toEqual({ "spell-death-ward": false });
    expect(draft.read({ kind: "source", id: "caster:warding-bond:one" }).hp).toBe(10);
    expect(planning.createDisposableDraft().read(targetRef).hp).toBe(8);
    expect(ward).toMatchObject({ id: "death-ward:one" });
  });

  it("maps a persistent transfer actor to its unique source-self recipient", () => {
    const bond = grantEffect("warding-bond:source-self", "warding-bond");
    const sourceRef = {
      kind: "source",
      id: "caster:warding-bond:source-self",
    } as const;
    const draft = createCombatEffectPlanningState([
      {
        ...seed(targetRef, state({ hp: 8 })),
        occurrenceHeads: [persisted(bond)],
      },
      seed(sourceRef, state({ hp: 20 })),
    ]).createDisposableDraft();

    const receipt = draft.apply(
      damageMutation([component({ stepId: "hit", amount: 4, damageType: "force" })])
    );

    expect(receipt.generatedMutations).toHaveLength(1);
    expect(receipt.generatedMutations?.[0]).toMatchObject({
      mutation: {
        kind: "resolved-damage",
        sourceEffectId: bond.id,
        recipient: sourceRef,
      },
      source: {
        kind: "effect-occurrence",
        recipient: targetRef,
        effect: bond,
        expectedHeadOpId: `apply:${bond.id}`,
        expectedActive: true,
      },
    });
  });

  it("shares one physical draft when a transfer actor has source and target aliases", () => {
    const bond = grantEffect("warding-bond:ambiguous", "warding-bond");
    const alias = "caster:warding-bond:ambiguous";
    const sourceRef = { kind: "source", id: alias } as const;
    const targetAliasRef = {
      kind: "target",
      target: { combatantId: alias },
    } as const;
    const aliasSeed = seed(sourceRef, state({ hp: 20 }));
    aliasSeed.refs = [sourceRef, targetAliasRef];
    const draft = createCombatEffectPlanningState([
      {
        ...seed(targetRef, state({ hp: 8 })),
        occurrenceHeads: [persisted(bond)],
      },
      aliasSeed,
    ]).createDisposableDraft();

    const receipt = draft.apply(
      damageMutation([component({ stepId: "hit", amount: 4, damageType: "force" })])
    );
    const transfer = receipt.generatedMutations?.[0];
    if (!transfer) throw new TypeError("Missing transfer fixture");
    draft.apply(transfer.mutation);
    expect(draft.read(sourceRef).hp).toBe(18);
    expect(draft.read(targetAliasRef).hp).toBe(18);
  });

  it("emits transfer damage and one-shot consumption as ordered exact receipts", () => {
    const ward = grantEffect("death-ward:one", "death-ward");
    const bond = grantEffect("warding-bond:one", "warding-bond");
    const program = {
      version: 1,
      id: "fatal-hit",
      phases: [
        {
          id: "resolve",
          trigger: { kind: "resolve" },
          steps: [
            {
              id: "fatal",
              kind: "damage",
              scope: "target",
              subject: "target",
              amount: { kind: "fixed", value: 20 },
              damageType: { kind: "fixed", damageType: "force" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const artifact = createReviewedCombatEffectArtifact(
      program,
      {
        occurrenceId: "cast:one",
        phaseId: "resolve",
        sourceId: "hero:one",
        targets: [targetRef.target],
        instances: 1,
      },
      []
    );
    const plan = interpretCombatEffectArtifact(
      artifact,
      createCombatEffectPlanningState([
        {
          ...seed(targetRef, state({ hp: 8, stateFlags: { "spell-death-ward": true } })),
          occurrenceHeads: [persisted(ward), persisted(bond)],
          stateZeroHpFloors: [{ stateKey: "spell-death-ward", hitPoints: 1 }],
        },
        seed({ kind: "source", id: "caster:warding-bond:one" }, state({ hp: 20 })),
        seed(
          { kind: "source", id: "hero:one" },
          state(),
          defenses(),
          {},
          {
            occurrenceId: "cast:one",
            programId: "fatal-hit",
            sourceId: "hero:one",
          }
        ),
      ])
    );

    expect(plan.consequences).toHaveLength(3);
    expect(plan.consequences[0]).toMatchObject({
      kind: "damage",
      appliedAmount: 10,
      before: { hp: 8, stateFlags: { "spell-death-ward": true } },
      after: { hp: 1, stateFlags: { "spell-death-ward": true } },
      persistentConsequences: {
        occurrenceChanges: [
          {
            effectId: ward.id,
            expectedHeadOpId: `apply:${ward.id}`,
            expectedActive: true,
            active: false,
          },
        ],
      },
    });
    expect(plan.consequences[1]).toMatchObject({
      kind: "state-flag",
      operation: "deactivate",
      stateKey: "spell-death-ward",
      before: { stateFlags: { "spell-death-ward": true } },
      after: { stateFlags: { "spell-death-ward": false } },
      generatedBy: {
        parentConsequenceIndex: 0,
        source: {
          kind: "state-flag",
          recipient: targetRef,
          stateKey: "spell-death-ward",
          expectedActive: true,
          hitPoints: 1,
        },
      },
    });
    expect(plan.consequences[2]).toMatchObject({
      kind: "resolved-damage",
      amount: 10,
      sourceEffectId: bond.id,
      transferPath: [bond.id],
      recipient: { kind: "source", id: "caster:warding-bond:one" },
      before: { hp: 20 },
      after: { hp: 10 },
      appliedAmount: 10,
      generatedBy: {
        parentConsequenceIndex: 0,
        source: {
          kind: "effect-occurrence",
          recipient: targetRef,
          effect: bond,
          expectedHeadOpId: `apply:${bond.id}`,
          expectedActive: true,
        },
      },
    });
  });

  it("binds a chained transfer to its immediate generated parent", () => {
    const middleId = "caster:warding-bond:first";
    const finalId = "caster:warding-bond:second";
    const first = {
      ...grantEffect("warding-bond:first", "warding-bond"),
      actor: { kind: "monster", combatantId: middleId },
    } satisfies ActiveCombatEffect;
    const second = {
      ...grantEffect("warding-bond:second", "warding-bond"),
      actor: { kind: "monster", combatantId: finalId },
      target: { kind: "monster", combatantId: middleId },
    } satisfies ActiveCombatEffect;
    const program = {
      version: 1,
      id: "chained-hit",
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
              amount: { kind: "fixed", value: 4 },
              damageType: { kind: "fixed", damageType: "force" },
            },
          ],
        },
      ],
    } satisfies CombatEffectProgram;
    const artifact = createReviewedCombatEffectArtifact(
      program,
      {
        occurrenceId: "cast:chain",
        phaseId: "resolve",
        sourceId: "hero:one",
        targets: [targetRef.target],
        instances: 1,
      },
      []
    );

    const plan = interpretCombatEffectArtifact(
      artifact,
      createCombatEffectPlanningState([
        { ...seed(targetRef), occurrenceHeads: [persisted(first)] },
        {
          ...seed({ kind: "source", id: middleId }),
          occurrenceHeads: [persisted(second)],
        },
        seed({ kind: "source", id: finalId }),
        seed(
          { kind: "source", id: "hero:one" },
          state(),
          defenses(),
          {},
          {
            occurrenceId: "cast:chain",
            programId: "chained-hit",
            sourceId: "hero:one",
          }
        ),
      ])
    );

    expect(plan.consequences.map((consequence) => consequence.kind)).toEqual([
      "damage",
      "resolved-damage",
      "resolved-damage",
    ]);
    expect(plan.consequences[1]).toMatchObject({
      sourceEffectId: first.id,
      transferPath: [first.id],
      generatedBy: {
        parentConsequenceIndex: 0,
        source: { effect: first, expectedHeadOpId: `apply:${first.id}` },
      },
    });
    expect(plan.consequences[2]).toMatchObject({
      sourceEffectId: second.id,
      transferPath: [first.id, second.id],
      generatedBy: {
        parentConsequenceIndex: 1,
        source: { effect: second, expectedHeadOpId: `apply:${second.id}` },
      },
    });
  });
});

describe("combat-effect planning state — damage packets", () => {
  it("budgets one Heavy Armor Master reduction across mixed packet types", () => {
    const targetDefenses = defenses({
      flatReductions: [
        {
          id: "heavy-armor-master",
          damageTypes: ["bludgeoning", "piercing", "slashing"],
          amount: 3,
          trigger: "attack",
        },
      ],
    });
    const receipt = apply(
      state(),
      damageMutation([
        component({
          stepId: "blade",
          amount: 2,
          damageType: "slashing",
          delivery: "attack",
        }),
        component({
          stepId: "point",
          amount: 5,
          damageType: "piercing",
          delivery: "attack",
        }),
      ]),
      targetDefenses
    );

    expect(receipt.appliedComponents).toEqual([
      { stepId: "blade", appliedAmount: 0 },
      { stepId: "point", appliedAmount: 4 },
    ]);
    expect(receipt).toMatchObject({ appliedAmount: 4, after: { hp: 16 } });
  });

  it("infers attack delivery from the typed gate outcome rather than step ids", () => {
    const targetDefenses = defenses({
      flatReductions: [
        {
          id: "heavy-armor-master",
          damageTypes: ["slashing"],
          amount: 3,
          trigger: "attack",
        },
      ],
    });
    const miss: CombatEffectDamageComponent = {
      stepId: "looks-like-an-attack",
      amount: 5,
      damageType: "slashing",
      resolution: {
        kind: "gate",
        gateId: "attack-roll",
        gateKind: "attack",
        result: "miss",
        disposition: "full",
        criticalHit: false,
      },
    };
    const automatic = component({
      stepId: "attack-by-name-only",
      amount: 5,
      damageType: "slashing",
    });

    expect(apply(state(), damageMutation([miss]), targetDefenses).appliedAmount).toBe(5);
    expect(
      apply(state(), damageMutation([automatic]), targetDefenses).appliedAmount
    ).toBe(5);
  });

  it("rewrites only typed save-for-half success and failure through Evasion", () => {
    const targetDefenses = defenses({
      saveDamageRules: [
        {
          id: "evasion",
          ability: "DEX",
          requiresDamageOnSuccess: "half",
          onSuccess: "none",
          onFailure: "half",
        },
      ],
    });
    const success = apply(
      state(),
      damageMutation([
        saveComponent({
          stepId: "success",
          amount: 5,
          result: "success",
          success: "half",
        }),
      ]),
      targetDefenses
    );
    const failure = apply(
      state(),
      damageMutation([
        saveComponent({
          stepId: "failure",
          amount: 11,
          result: "failure",
          success: "half",
        }),
      ]),
      targetDefenses
    );
    const saveForNone = apply(
      state(),
      damageMutation([
        saveComponent({
          stepId: "save-for-none",
          amount: 11,
          result: "failure",
          success: "none",
        }),
      ]),
      targetDefenses
    );

    expect(success).toMatchObject({ appliedAmount: 0, after: { hp: 20 } });
    expect(failure).toMatchObject({ appliedAmount: 5, after: { hp: 15 } });
    expect(saveForNone).toMatchObject({ appliedAmount: 11, after: { hp: 9 } });
  });

  it("uses typed spell-source resistance and never stacks it with type resistance", () => {
    const receipt = apply(
      state(),
      damageMutation(
        [
          component({
            stepId: "spell-fire",
            amount: 11,
            damageType: "fire",
            damageSource: "spell",
          }),
        ],
        targetRef,
        "spell"
      ),
      defenses({
        resistances: new Set(["fire"]),
        sourceResistances: new Set(["spell"]),
      })
    );

    expect(receipt).toMatchObject({ appliedAmount: 5, after: { hp: 15 } });
  });

  it("preserves immunity and vulnerability in exact post-defense component amounts", () => {
    const receipt = apply(
      state(),
      damageMutation([
        component({ stepId: "cold", amount: 7, damageType: "cold" }),
        component({ stepId: "radiant", amount: 4, damageType: "radiant" }),
      ]),
      defenses({
        immunities: new Set(["cold"]),
        vulnerabilities: new Set(["radiant"]),
      })
    );

    expect(receipt.appliedComponents).toEqual([
      { stepId: "cold", appliedAmount: 0 },
      { stepId: "radiant", appliedAmount: 8 },
    ]);
    expect(receipt).toMatchObject({ appliedAmount: 8, after: { hp: 12 } });
  });

  it("runs critical damage at 0 through death saves and clears stability", () => {
    const initial = state({
      hp: 0,
      stable: true,
      deathSaves: { successes: 3, failures: 0 },
      conditions: ["unconscious"],
      conditionLifetimes: { unconscious: null },
    });
    const receipt = apply(
      initial,
      damageMutation([
        component({
          stepId: "critical",
          amount: 2,
          damageType: "slashing",
          delivery: "attack",
          critical: true,
        }),
      ])
    );

    expect(receipt).toMatchObject({
      appliedAmount: 2,
      after: {
        hp: 0,
        stable: false,
        deathSaves: { successes: 0, failures: 2 },
        conditions: ["unconscious"],
      },
    });
  });

  it("uses the canonical massive-damage transition on a drop through temp HP", () => {
    const receipt = apply(
      state({ hp: 8, maxHp: 20, tempHp: 2 }),
      damageMutation([component({ stepId: "overkill", amount: 30, damageType: "force" })])
    );

    expect(receipt).toMatchObject({
      appliedAmount: 30,
      after: {
        hp: 0,
        tempHp: 0,
        stable: false,
        deathSaves: { successes: 0, failures: 3 },
        conditions: [],
      },
    });
  });
});

describe("combat-effect planning state — non-damage mutations", () => {
  it("caps healing and resets the zero-HP lifecycle when the target rises", () => {
    const initial = state({
      hp: 0,
      maxHp: 12,
      stable: true,
      deathSaves: { successes: 3, failures: 0 },
      conditions: ["unconscious", "prone"],
      conditionLifetimes: { unconscious: null, prone: { kind: "manual" } },
    });
    const receipt = apply(initial, {
      kind: "heal",
      provenance,
      recipient: targetRef,
      amount: 20,
    });

    expect(receipt).toMatchObject({
      appliedAmount: 12,
      after: {
        hp: 12,
        stable: false,
        deathSaves: { successes: 0, failures: 0 },
        conditions: ["prone"],
        conditionLifetimes: { prone: { kind: "manual" } },
      },
    });
  });

  it("uses max-wins temporary HP without stacking", () => {
    const draft = createCombatEffectPlanningState([
      seed(targetRef, state({ tempHp: 8 })),
    ]).createDisposableDraft();
    const lower = draft.apply({
      kind: "temp-hp",
      provenance,
      recipient: targetRef,
      amount: 5,
    });
    const higher = draft.apply({
      kind: "temp-hp",
      provenance,
      recipient: targetRef,
      amount: 12,
    });

    expect(lower).toMatchObject({ appliedAmount: 0, after: { tempHp: 8 } });
    expect(higher).toMatchObject({ appliedAmount: 4, after: { tempHp: 12 } });
  });

  it("rejects resource underflow, caps gains, and requires capacity metadata", () => {
    const draft = createCombatEffectPlanningState([
      seed(targetRef, state({ resources: { focus: 2 } }), defenses(), { focus: 3 }),
    ]).createDisposableDraft();
    const spend: CombatEffectMutation = {
      kind: "resource",
      provenance,
      recipient: targetRef,
      operation: "spend",
      resourceId: "focus",
      amount: 3,
    };
    expect(() => draft.apply(spend)).toThrow(/insufficient/);
    expect(draft.read(targetRef).resources).toEqual({ focus: 2 });

    const gain = draft.apply({
      ...spend,
      operation: "gain",
      amount: 5,
    });
    expect(gain).toMatchObject({
      appliedAmount: 1,
      after: { resources: { focus: 3 } },
    });

    const missingMetadata = seed(targetRef, state({ resources: { focus: 1 } }));
    missingMetadata.resourceSnapshots = {};
    expect(() => createCombatEffectPlanningState([missingMetadata])).toThrow(
      /cover every exposed resource/
    );
  });

  it("routes condition and standing mutations through exact owned occurrences", () => {
    const lifetime: CombatEffectLifetime = {
      kind: "turn-boundary",
      subject: "target",
      phase: "turn-end",
      offsetTurns: 1,
    };
    const draft = createCombatEffectPlanningState([seed()]).createDisposableDraft();
    const conditionApply = draft.apply({
      kind: "condition",
      provenance,
      recipient: targetRef,
      operation: "apply",
      condition: "prone",
      lifetime,
    });
    const standingApply = draft.apply({
      kind: "standing",
      provenance,
      recipient: targetRef,
      operation: "start",
      effectId: "burning-zone",
      lifetime: { kind: "source-end" },
    });
    expect(draft.read(targetRef)).toMatchObject({
      conditions: [],
      conditionLifetimes: {},
      standing: [],
      standingLifetimes: {},
    });
    expect(draft.conditionPresent(targetRef, "prone")).toBe(true);
    expect(draft.standingPresent(targetRef, "burning-zone")).toBe(true);
    expect(conditionApply.persistentConsequences?.occurrenceChanges).toEqual([
      expect.objectContaining({
        expectedHeadOpId: null,
        expectedActive: false,
        active: true,
        reason: "program-apply",
        descriptor: { kind: "condition", condition: "prone", lifetime },
      }),
    ]);
    expect(standingApply.persistentConsequences?.occurrenceChanges).toEqual([
      expect.objectContaining({
        expectedHeadOpId: null,
        expectedActive: false,
        active: true,
        reason: "program-start",
        descriptor: {
          kind: "standing",
          effectId: "burning-zone",
          lifetime: { kind: "source-end" },
        },
      }),
    ]);

    const conditionRemove = draft.apply({
      kind: "condition",
      provenance: { ...provenance, phaseId: "cleanup", stepId: "remove-prone" },
      recipient: targetRef,
      operation: "remove",
      condition: "prone",
    });
    const standingEnd = draft.apply({
      kind: "standing",
      provenance: { ...provenance, phaseId: "cleanup", stepId: "end-zone" },
      recipient: targetRef,
      operation: "end",
      effectId: "burning-zone",
    });
    expect(draft.conditionPresent(targetRef, "prone")).toBe(false);
    expect(draft.standingPresent(targetRef, "burning-zone")).toBe(false);
    const conditionEffectId =
      conditionApply.persistentConsequences?.occurrenceChanges[0]?.effectId;
    const standingEffectId =
      standingApply.persistentConsequences?.occurrenceChanges[0]?.effectId;
    if (!conditionEffectId || !standingEffectId) {
      throw new Error("expected created program occurrences");
    }
    expect(conditionRemove.persistentConsequences?.occurrenceChanges).toEqual([
      expect.objectContaining({
        effectId: conditionEffectId,
        expectedHeadOpId: combatEffectOccurrenceInitialHeadId(conditionEffectId),
        expectedEffect: {
          programOwner: {
            occurrenceId: provenance.occurrenceId,
            programId: provenance.programId,
            phaseId: provenance.phaseId,
            stepId: provenance.stepId,
            operationId: combatEffectOccurrenceInitialHeadId(conditionEffectId),
            instance: provenance.instance,
            iteration: provenance.iteration,
          },
          payload: { kind: "condition", conditionId: "prone" },
        },
        expectedActive: true,
        active: false,
        reason: "program-remove",
      }),
    ]);
    expect(standingEnd.persistentConsequences?.occurrenceChanges).toEqual([
      expect.objectContaining({
        effectId: standingEffectId,
        expectedHeadOpId: combatEffectOccurrenceInitialHeadId(standingEffectId),
        expectedEffect: {
          programOwner: {
            occurrenceId: provenance.occurrenceId,
            programId: provenance.programId,
            phaseId: provenance.phaseId,
            stepId: provenance.stepId,
            operationId: combatEffectOccurrenceInitialHeadId(standingEffectId),
            instance: provenance.instance,
            iteration: provenance.iteration,
          },
          payload: { kind: "program-standing", effectId: "burning-zone" },
        },
        expectedActive: true,
        active: false,
        reason: "program-end",
      }),
    ]);
  });

  it("removes only the matching program occurrence and preserves manual and peer sources", () => {
    const sourceA = programConditionEffect({
      occurrenceId: "cast:source-a",
      condition: "prone",
    });
    const sourceB = programConditionEffect({
      occurrenceId: "cast:source-b",
      condition: "prone",
    });
    const draft = createCombatEffectPlanningState([
      {
        ...seed(
          targetRef,
          state({
            conditions: ["prone"],
            conditionLifetimes: { prone: { kind: "manual" } },
          })
        ),
        occurrenceHeads: [
          persisted(sourceA, "head:source-a"),
          persisted(sourceB, "head:source-b"),
        ],
      },
    ]).createDisposableDraft();

    const removedA = draft.apply({
      kind: "condition",
      provenance: {
        ...provenance,
        occurrenceId: "cast:source-a",
        phaseId: "cleanup",
        stepId: "remove-source-a",
      },
      recipient: targetRef,
      operation: "remove",
      condition: "prone",
    });

    expect(removedA.persistentConsequences?.occurrenceChanges).toEqual([
      expect.objectContaining({
        effectId: sourceA.id,
        expectedHeadOpId: "head:source-a",
        expectedEffect: {
          programOwner: sourceA.programOwner,
          payload: sourceA.payload,
        },
        active: false,
      }),
    ]);
    expect(
      removedA.persistentConsequences?.occurrenceChanges.some(
        (change) => change.effectId === sourceB.id
      )
    ).toBe(false);
    expect(draft.conditionPresent(targetRef, "prone")).toBe(true);
    expect(draft.read(targetRef).conditions).toEqual(["prone"]);

    const removedB = draft.apply({
      kind: "condition",
      provenance: {
        ...provenance,
        occurrenceId: "cast:source-b",
        phaseId: "cleanup",
        stepId: "remove-source-b",
      },
      recipient: targetRef,
      operation: "remove",
      condition: "prone",
    });
    expect(removedB.persistentConsequences?.occurrenceChanges).toEqual([
      expect.objectContaining({ effectId: sourceB.id, active: false }),
    ]);
    expect(draft.conditionPresent(targetRef, "prone")).toBe(true);
    expect(draft.read(targetRef).conditionLifetimes).toEqual({
      prone: { kind: "manual" },
    });
  });

  it("stabilizes only a living target at 0 HP", () => {
    const mutation: CombatEffectMutation = {
      kind: "stabilize",
      provenance,
      recipient: targetRef,
    };
    const standing = apply(state({ hp: 5 }), mutation);
    const dying = apply(
      state({ hp: 0, deathSaves: { successes: 1, failures: 2 } }),
      mutation
    );

    expect(standing.after).toMatchObject({
      hp: 5,
      stable: false,
      deathSaves: { successes: 0, failures: 0 },
    });
    expect(dying.after).toMatchObject({
      hp: 0,
      stable: true,
      deathSaves: { successes: 3, failures: 0 },
    });
  });
});
