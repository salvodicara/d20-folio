import { describe, expect, it } from "vitest";

import {
  addOccurrence as allocateOccurrence,
  addTransitionedProgramOccurrence,
  conformNewMechanicOccurrence,
  createOccurrenceState,
  isEffectOccurrence,
  parseOccurrenceState,
  removeOccurrences,
  resolveOccurrenceAuthority,
  selectActiveKeys,
  selectChildrenOf,
  selectConcentrationForActor,
  selectConditionOccurrences,
  selectEffectiveConditionImmunities,
  selectEffectiveConditions,
  selectEffectiveDamageDefenseProfile,
  selectItemActivations,
  selectMarkedTarget,
  selectOccurrenceEntries,
  selectOccurrencesEndingAt,
  selectOccurrencesForTarget,
  selectPolymorphForm,
  selectProgramExecution,
  selectProgramPhaseChildren,
  selectProgramStepChildren,
  selectProjectedGrantSources,
  selectRoundsUntilDeadline,
  selectStandingFacts,
} from "@/lib/mechanic-occurrences";
import type { NonExhaustionConditionId } from "@/types/condition";
import type { DamageDefenseRule, DamageDefenseSelector } from "@/types/damage";
import type {
  EffectOccurrence,
  MechanicOccurrence,
  NewMechanicOccurrence,
  OccurrenceState,
  ProgramOccurrence,
  StandingFact,
} from "@/types/mechanic-occurrence";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { EntityRef } from "@/types/mechanics-reference";

const MATERIAL = {
  characterId: "character-1",
  kind: "character-play",
  uid: "user-1",
} as const;
const SHARED_MATERIAL = { campaignId: "campaign-1", kind: "shared-combat" } as const;
const ACTOR: EntityRef = { entityId: "self", material: MATERIAL };
const COMPANION: EntityRef = {
  entityId: "companion-1",
  material: MATERIAL,
  ordinal: 1,
};
const MONSTER: EntityRef = {
  entityId: "monster-1",
  material: SHARED_MATERIAL,
  ordinal: 1,
};
const TIMELINE_CLOCK = { epoch: 0, material: MATERIAL } as const;
const ENCOUNTER_CLOCK = { epoch: 1, material: MATERIAL } as const;

type NewProgramOccurrence = Extract<NewMechanicOccurrence, { kind: "program" }>;
type NewEffectOccurrence = Exclude<NewMechanicOccurrence, NewProgramOccurrence>;
type NewMaterialLifecycleOccurrence = Extract<
  NewEffectOccurrence,
  { kind: "material-lifecycle" }
>;
type NewStandingOccurrence = Extract<NewEffectOccurrence, { kind: "standing" }>;

function authoredProgram(id: string) {
  return {
    id,
    phases: [
      {
        inputs: [],
        phaseId: "invoke",
        steps: [
          {
            conditionId: "prone",
            kind: "condition",
            lifetime: { kind: "manual" },
            operation: "apply",
            stepId: "apply-condition",
            target: { kind: "role", role: "target" },
            when: null,
          },
          {
            fact: { key: "fixture", kind: "active-key" },
            kind: "standing",
            lifetime: { kind: "manual" },
            operation: "start",
            stepId: "start-standing",
            target: { kind: "role", role: "target" },
            when: null,
          },
          {
            kind: "concentration",
            lifetime: { kind: "manual" },
            operation: "start",
            stepId: "start-concentration",
            when: null,
          },
          {
            formId: "wolf",
            kind: "polymorph",
            lifetime: { kind: "manual" },
            operation: "start",
            stepId: "start-polymorph",
            target: { kind: "role", role: "target" },
            when: null,
          },
          {
            controller: null,
            entityKey: "fixture-entity",
            kind: "entity-create",
            lifetime: { kind: "manual" },
            stepId: "create-entity",
            template: { kind: "monster", monsterId: "goblin-warrior" },
            when: null,
          },
        ],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [
      { initial: 0, registerId: "count" },
      { initial: "ready", registerId: "mode" },
    ],
    version: 1,
  } as const;
}

function entityAuthority(
  sourceKind: "capability" | "inventory-item" = "capability"
): MechanicsProgramAuthorityReceipt {
  const definition = {
    catalogueKind: sourceKind === "inventory-item" ? "item" : "spell",
    entityId: sourceKind === "inventory-item" ? "item.wand" : "spell.web",
    kind: "catalogue",
    mechanicsRevision: `sha256:${"0".repeat(64)}`,
  } as const;
  const capability = {
    capabilityId: "primary",
    definition,
    kind: "program",
  } as const;
  return {
    anchors: {
      activator: ACTOR,
      caster: ACTOR,
      owner: ACTOR,
      source: ACTOR,
      target: MONSTER,
    },
    installation: {
      capability,
      generation: 3,
      installationId: "installation-1",
      owner: ACTOR,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: authoredProgram(capability.capabilityId),
      ref: capability,
      resources: {},
      schema: 1,
    },
    source:
      sourceKind === "inventory-item"
        ? {
            instanceId: "wand-1",
            instanceOrdinal: 7,
            kind: "inventory-item",
            owner: MATERIAL,
          }
        : { capability, kind: "capability", owner: ACTOR },
    staticBindings: { proficiencyBonus: 3 },
  };
}

function materialAuthority(
  authority: "environment" | "table"
): MechanicsProgramAuthorityReceipt {
  const definition = {
    authority,
    declarationId: "hazard-1",
    generation: 5,
    kind: "table-declaration",
    material: MATERIAL,
  } as const;
  const capability = {
    capabilityId: "hazard",
    definition,
    kind: "system",
  } as const;
  return {
    anchors: {
      activator: null,
      caster: null,
      owner: null,
      source: null,
      target: MONSTER,
    },
    installation: {
      capability,
      generation: 7,
      installationId: "hazard-installation",
      owner: { authority, kind: "material-authority", material: MATERIAL },
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: authoredProgram(capability.capabilityId),
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: definition,
    staticBindings: {},
  };
}

function program(
  authority: MechanicsProgramAuthorityReceipt = entityAuthority(),
  endRules: NewProgramOccurrence["endRules"] = []
): NewProgramOccurrence {
  return {
    authority,
    endRules,
    kind: "program",
    phaseState: { invoke: { execution: 0, lastTriggerEventId: null } },
    registers: { count: 0, mode: "ready" },
  };
}

function transitionedProgram(
  authority: MechanicsProgramAuthorityReceipt = entityAuthority()
): NewProgramOccurrence {
  return {
    ...program(authority),
    phaseState: { invoke: { execution: 1, lastTriggerEventId: "event-1" } },
    registers: { count: 1, mode: false },
  };
}

function effectOrigin(
  stepId:
    | "apply-condition"
    | "create-entity"
    | "start-concentration"
    | "start-polymorph"
    | "start-standing",
  parentId = "root"
): NewEffectOccurrence["origin"] {
  return {
    execution: 1,
    kind: "program-step",
    phaseId: "invoke",
    root: {
      occurrence: { material: MATERIAL, occurrenceId: parentId },
      ordinal: 1,
    },
    slot: 1,
    stepId,
  };
}

function condition(
  conditionId: NonExhaustionConditionId,
  parentId = "root",
  target: EntityRef = ACTOR
): Extract<NewEffectOccurrence, { kind: "condition" }> {
  return {
    conditionId,
    endRules: [],
    kind: "condition",
    origin: effectOrigin("apply-condition", parentId),
    parentId,
    target,
  };
}

function standing(
  fact: StandingFact,
  parentId = "root",
  target: EntityRef = ACTOR
): NewStandingOccurrence {
  return {
    endRules: [],
    fact,
    kind: "standing",
    origin: effectOrigin("start-standing", parentId),
    parentId,
    target,
  };
}

function materialLifecycle(
  parentId = "root",
  target: EntityRef = ACTOR
): NewMaterialLifecycleOccurrence {
  return {
    endRules: [],
    kind: "material-lifecycle",
    origin: effectOrigin("create-entity", parentId),
    parentId,
    target,
  };
}

function addOccurrence(
  state: Readonly<OccurrenceState>,
  id: string,
  occurrence: NewMechanicOccurrence
): Readonly<OccurrenceState> {
  if (occurrence.kind === "program") {
    return allocateOccurrence(state, id, occurrence);
  }
  const root = state.occurrences[occurrence.parentId];
  if (root?.kind !== "program") return allocateOccurrence(state, id, occurrence);
  const phase = root.authority.snapshot.program?.phases.find(({ steps }) =>
    steps.some(({ stepId }) => stepId === occurrence.origin.stepId)
  );
  if (!phase) return allocateOccurrence(state, id, occurrence);
  const execution = root.phaseState[phase.phaseId]?.execution;
  if (!execution) return allocateOccurrence(state, id, occurrence);
  const usedSlots = Object.values(state.occurrences).flatMap((candidate) =>
    candidate.kind !== "program" &&
    candidate.origin.root.occurrence.occurrenceId === occurrence.parentId &&
    candidate.origin.phaseId === phase.phaseId &&
    candidate.origin.execution === execution &&
    candidate.origin.stepId === occurrence.origin.stepId
      ? [candidate.origin.slot]
      : []
  );
  return allocateOccurrence(state, id, {
    ...occurrence,
    origin: {
      ...occurrence.origin,
      execution,
      phaseId: phase.phaseId,
      root: {
        occurrence: {
          material: root.authority.installation.owner.material,
          occurrenceId: occurrence.parentId,
        },
        ordinal: root.ordinal,
      },
      slot: Math.max(0, ...usedSlots) + 1,
    },
  });
}

function damageSelector(
  damageTypes: DamageDefenseSelector["damageTypes"] = []
): DamageDefenseSelector {
  return {
    damageTypes,
    deliveries: [],
    forbiddenTraits: [],
    requiredTraits: [],
  };
}

function stateWithRoot(
  authority: MechanicsProgramAuthorityReceipt = entityAuthority(),
  id = "root"
): Readonly<OccurrenceState> {
  return addTransitionedProgramOccurrence(
    createOccurrenceState(),
    id,
    transitionedProgram(authority)
  );
}

function mutableState(state: Readonly<OccurrenceState>): OccurrenceState {
  return structuredClone(state);
}

describe("one-model occurrence boundary", () => {
  it.each([
    ["entity", entityAuthority()],
    ["table", materialAuthority("table")],
    ["environment", materialAuthority("environment")],
  ] as const)(
    "embeds and revalidates an exact %s authority receipt",
    (_kind, receipt) => {
      const conformed = conformNewMechanicOccurrence(program(receipt));
      expect(conformed).toEqual(program(receipt));
      expect(conformed).not.toBeNull();
      expect(Object.isFrozen(conformed)).toBe(true);
      if (!conformed || conformed.kind !== "program") return;
      expect(Object.isFrozen(conformed.authority.snapshot.program)).toBe(true);

      expect(
        conformNewMechanicOccurrence(
          program({
            ...receipt,
            installation: {
              ...receipt.installation,
              capability: {
                ...receipt.installation.capability,
                capabilityId: "forged",
              },
            },
          })
        )
      ).toBeNull();
    }
  );

  it("rejects every removed or misplaced root/effect field", () => {
    const root = program();
    for (const [key, value] of [
      ["parentId", "other"],
      ["target", ACTOR],
      ["source", { kind: "manual" }],
      ["origin", ACTOR],
      ["controller", ACTOR],
      ["programId", "primary"],
      ["programVersion", 1],
      ["ordinal", 1],
    ] as const) {
      expect(conformNewMechanicOccurrence({ ...root, [key]: value })).toBeNull();
    }

    const effect = condition("prone");
    for (const [key, value] of [
      ["source", { kind: "manual" }],
      ["origin", ACTOR],
      ["controller", ACTOR],
      ["authority", entityAuthority()],
      ["ordinal", 2],
    ] as const) {
      expect(conformNewMechanicOccurrence({ ...effect, [key]: value })).toBeNull();
    }

    const missingParent = { ...effect } as Record<string, unknown>;
    delete missingParent.parentId;
    expect(conformNewMechanicOccurrence(missingParent)).toBeNull();
  });

  it("conforms only the exact neutral material-lifecycle effect shape", () => {
    const effect = materialLifecycle("root", MONSTER);
    const conformed = conformNewMechanicOccurrence(effect);
    expect(conformed).toEqual(effect);
    expect(conformed && Object.keys(conformed).sort()).toEqual([
      "endRules",
      "kind",
      "origin",
      "parentId",
      "target",
    ]);

    for (const candidate of [
      { ...effect, fact: { key: "lifecycle", kind: "active-key" } },
      { ...effect, grantGroupId: "lifecycle" },
      { ...effect, target: { ...MONSTER, forged: true } },
    ]) {
      expect(conformNewMechanicOccurrence(candidate)).toBeNull();
    }

    for (const key of ["parentId", "target"] as const) {
      const missing = { ...effect } as Record<string, unknown>;
      Reflect.deleteProperty(missing, key);
      expect(conformNewMechanicOccurrence(missing)).toBeNull();
    }

    const hostile = Object.create({ inherited: true }) as Record<string, unknown>;
    Object.assign(hostile, effect);
    expect(conformNewMechanicOccurrence(hostile)).toBeNull();
  });

  it("requires exact authored phase/register keys and initials only on creation", () => {
    const root = program();
    for (const candidate of [
      { ...root, phaseState: {} },
      {
        ...root,
        phaseState: {
          ...root.phaseState,
          extra: { execution: 0, lastTriggerEventId: null },
        },
      },
      { ...root, registers: { count: 0 } },
      { ...root, registers: { ...root.registers, extra: false } },
      {
        ...root,
        phaseState: { invoke: { execution: 1, lastTriggerEventId: "event-1" } },
      },
      { ...root, registers: { count: 1, mode: "ready" } },
    ]) {
      expect(conformNewMechanicOccurrence(candidate)).toBeNull();
    }

    const persisted = mutableState(stateWithRoot());
    const persistedRoot = persisted.occurrences.root;
    if (!persistedRoot || persistedRoot.kind !== "program") {
      throw new Error("expected root fixture");
    }
    persistedRoot.phaseState.invoke = {
      execution: 2,
      lastTriggerEventId: "event-2",
    };
    persistedRoot.registers.count = 4;
    persistedRoot.registers.mode = false;
    const parsed = parseOccurrenceState(persisted);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const parsedRoot = parsed.value.occurrences.root;
    expect(parsedRoot?.kind === "program" && parsedRoot.registers).toEqual({
      count: 4,
      mode: false,
    });

    for (const mismatch of [
      { phaseState: {}, registers: persistedRoot.registers },
      {
        phaseState: persistedRoot.phaseState,
        registers: { ...persistedRoot.registers, extra: null },
      },
      { phaseState: persistedRoot.phaseState, registers: { count: 4 } },
    ]) {
      const candidate = mutableState(persisted);
      Object.assign(candidate.occurrences.root as ProgramOccurrence, mismatch);
      expect(parseOccurrenceState(candidate)).toEqual({ ok: false });
    }

    const invalidScalar = mutableState(persisted);
    const invalidRoot = invalidScalar.occurrences.root as ProgramOccurrence;
    invalidRoot.registers.count = [] as never;
    expect(parseOccurrenceState(invalidScalar)).toEqual({ ok: false });
  });

  it("allows only local program roots with one effect level", () => {
    expect(() =>
      addOccurrence(createOccurrenceState(), "orphan", condition("prone"))
    ).toThrow(TypeError);

    let state = stateWithRoot();
    state = addOccurrence(state, "child", condition("prone"));
    expect(() =>
      addOccurrence(state, "grandchild", condition("stunned", "child"))
    ).toThrow(TypeError);
    expect(selectChildrenOf(state, "root").map(({ id }) => id)).toEqual(["child"]);
    expect(
      selectChildrenOf(state, "root").every(({ occurrence }) =>
        isEffectOccurrence(occurrence)
      )
    ).toBe(true);
    expect(isEffectOccurrence(state.occurrences.root as MechanicOccurrence)).toBe(false);
    expect(isEffectOccurrence(state.occurrences.child as MechanicOccurrence)).toBe(true);
  });

  it("rejects hostile objects, accessors, sparse arrays and cycles", () => {
    const hostilePrototype = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    Object.assign(hostilePrototype, createOccurrenceState());
    expect(parseOccurrenceState(hostilePrototype)).toEqual({ ok: false });

    const accessor = mutableState(createOccurrenceState());
    Object.defineProperty(accessor, "nextOccurrenceOrdinal", {
      enumerable: true,
      get: () => 1,
    });
    expect(parseOccurrenceState(accessor)).toEqual({ ok: false });

    const sparseRules = Array(1) as NewProgramOccurrence["endRules"];
    expect(
      conformNewMechanicOccurrence(program(entityAuthority(), sparseRules))
    ).toBeNull();

    const cyclic = mutableState(createOccurrenceState()) as unknown as Record<
      string,
      unknown
    >;
    cyclic.occurrences = cyclic;
    expect(parseOccurrenceState(cyclic)).toEqual({ ok: false });

    let state = stateWithRoot();
    state = addOccurrence(state, "first", condition("prone"));
    state = addOccurrence(state, "second", {
      ...condition("stunned"),
      endRules: [{ kind: "occurrence-end", occurrenceId: "first" }],
    });
    const dependencyCycle = mutableState(state);
    (dependencyCycle.occurrences.first as EffectOccurrence).endRules = [
      { kind: "occurrence-end", occurrenceId: "second" },
    ];
    expect(parseOccurrenceState(dependencyCycle)).toEqual({ ok: false });

    const rootCycle = mutableState(state);
    (rootCycle.occurrences.root as ProgramOccurrence).endRules = [
      { kind: "occurrence-end", occurrenceId: "first" },
    ];
    expect(parseOccurrenceState(rootCycle)).toEqual({ ok: false });
  });

  it("canonicalizes, clones and deeply freezes persisted input", () => {
    let state = stateWithRoot();
    state = addOccurrence(state, "effect", {
      ...condition("frightened"),
      endRules: [
        { elapsedSeconds: 12, kind: "time-reached", clock: TIMELINE_CLOCK },
        { kind: "combat-end", clock: ENCOUNTER_CLOCK },
      ],
    });
    const input = mutableState(state);
    const parsed = parseOccurrenceState(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).not.toBe(input);
    expect(Object.isFrozen(parsed.value)).toBe(true);
    const parsedRoot = parsed.value.occurrences.root;
    if (parsedRoot?.kind !== "program") throw new Error("root fixture");
    expect(Object.isFrozen(parsedRoot.authority)).toBe(true);
    expect(Object.isFrozen(parsed.value.occurrences.effect?.endRules)).toBe(true);
    expect(parsed.value.occurrences.effect?.endRules.map((rule) => rule.kind)).toEqual([
      "time-reached",
      "combat-end",
    ]);
    input.nextOccurrenceOrdinal = 99;
    expect(parsed.value.nextOccurrenceOrdinal).toBe(3);
  });

  it("owns one exact transient ending field without a legacy read shim", () => {
    const allocated = stateWithRoot();
    expect(allocated.occurrences.root?.ending).toBeNull();
    expect(conformNewMechanicOccurrence({ ...program(), ending: null })).toBeNull();

    const missing = mutableState(allocated);
    Reflect.deleteProperty(missing.occurrences.root as object, "ending");
    expect(parseOccurrenceState(missing)).toEqual({ ok: false });

    const ending = mutableState(allocated);
    const root = ending.occurrences.root;
    if (!root) throw new Error("root fixture");
    root.ending = {
      causes: [{ kind: "requested" }, { kind: "concentration-broken" }],
    };
    const parsed = parseOccurrenceState(ending);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.occurrences.root?.ending?.causes).toEqual([
      { kind: "concentration-broken" },
      { kind: "requested" },
    ]);
    expect(Object.isFrozen(parsed.value.occurrences.root?.ending?.causes)).toBe(true);

    const duplicate = mutableState(ending);
    const duplicateRoot = duplicate.occurrences.root;
    if (!duplicateRoot?.ending) throw new Error("ending fixture");
    duplicateRoot.ending.causes = [{ kind: "requested" }, { kind: "requested" }];
    expect(parseOccurrenceState(duplicate)).toEqual({ ok: false });
  });
});

describe("immutable allocation, ordinals and cascades", () => {
  it("allocates an exact program root after its first committed transition", () => {
    const transitioned = transitionedProgram();
    const allocated = addTransitionedProgramOccurrence(
      createOccurrenceState(),
      "root",
      transitioned
    );

    expect(allocated).toEqual({
      nextOccurrenceOrdinal: 2,
      occurrences: {
        root: { ...transitioned, ending: null, ordinal: 1 },
      },
    });
    expect(() => addOccurrence(createOccurrenceState(), "root", transitioned)).toThrow(
      TypeError
    );
  });

  it.each([
    ["missing phase", { phaseState: {} }],
    [
      "extra phase",
      {
        phaseState: {
          invoke: { execution: 1, lastTriggerEventId: "event-1" },
          other: { execution: 0, lastTriggerEventId: null },
        },
      },
    ],
    ["missing register", { registers: { count: 1 } }],
    ["extra register", { registers: { count: 1, extra: null, mode: false } }],
  ])("rejects a transitioned root with an %s key set", (_case, replacement) => {
    expect(() =>
      addTransitionedProgramOccurrence(createOccurrenceState(), "root", {
        ...transitionedProgram(),
        ...replacement,
      })
    ).toThrow(TypeError);
  });

  it("allocates unique monotonic ordinals and never rewinds", () => {
    const empty = createOccurrenceState();
    const root = stateWithRoot();
    const one = addOccurrence(root, "one", condition("prone"));
    const two = addOccurrence(one, "two", condition("stunned"));
    const removed = removeOccurrences(two, "one");
    const three = addOccurrence(removed, "three", condition("restrained"));

    expect(empty).toEqual({ nextOccurrenceOrdinal: 1, occurrences: {} });
    expect(two.occurrences.root?.ordinal).toBe(1);
    expect(two.occurrences.one?.ordinal).toBe(2);
    expect(two.occurrences.two?.ordinal).toBe(3);
    expect(removed.nextOccurrenceOrdinal).toBe(4);
    expect(three.occurrences.three?.ordinal).toBe(4);
    expect(three.nextOccurrenceOrdinal).toBe(5);

    const duplicate = mutableState(two);
    if (duplicate.occurrences.two) duplicate.occurrences.two.ordinal = 2;
    expect(parseOccurrenceState(duplicate)).toEqual({ ok: false });
    const usedHighWater = mutableState(two);
    usedHighWater.nextOccurrenceOrdinal = 3;
    expect(parseOccurrenceState(usedHighWater)).toEqual({ ok: false });
  });

  it("rejects stale local edges that bind to a replacement at the same id", () => {
    let original = stateWithRoot();
    original = addOccurrence(original, "child", condition("prone"));
    original = addOccurrence(original, "dependent", {
      ...condition("stunned"),
      endRules: [{ kind: "occurrence-end", occurrenceId: "child" }],
    });

    const staleParent = mutableState(original);
    const root = staleParent.occurrences.root as ProgramOccurrence;
    root.ordinal = 4;
    staleParent.nextOccurrenceOrdinal = 5;
    expect(parseOccurrenceState(staleParent)).toEqual({ ok: false });

    const staleDependency = mutableState(original);
    const child = staleDependency.occurrences.child as EffectOccurrence;
    child.ordinal = 4;
    staleDependency.nextOccurrenceOrdinal = 5;
    expect(parseOccurrenceState(staleDependency)).toEqual({ ok: false });
  });

  it("cascades program children and transitive lifetime dependencies", () => {
    let state = stateWithRoot();
    state = addOccurrence(state, "child", condition("restrained"));
    state = addOccurrence(state, "dependent", {
      ...condition("prone"),
      endRules: [{ kind: "occurrence-end", occurrenceId: "child" }],
    });

    expect(Object.keys(removeOccurrences(state, "root").occurrences)).toEqual([]);
    const childOnly = removeOccurrences(state, "child");
    expect(Object.keys(childOnly.occurrences)).toEqual(["root"]);
    expect(childOnly.nextOccurrenceOrdinal).toBe(4);
    expect(removeOccurrences(state, "missing")).toEqual(state);
  });
});

describe("root authority and effect selectors", () => {
  function selectorState(): Readonly<OccurrenceState> {
    let state = stateWithRoot();
    state = addTransitionedProgramOccurrence(
      state,
      "item-root",
      transitionedProgram(entityAuthority("inventory-item"))
    );
    state = addOccurrence(state, "active", standing({ key: "rage", kind: "active-key" }));
    state = addOccurrence(
      state,
      "item-active",
      standing({ key: "wand-lit", kind: "active-key" }, "item-root")
    );
    state = addOccurrence(
      state,
      "grant",
      standing({ groupId: "web-active", kind: "grant-group" })
    );
    state = addOccurrence(
      state,
      "mark-old",
      standing({ kind: "target-mark", markId: "quarry", marked: COMPANION })
    );
    state = addOccurrence(
      state,
      "mark-new",
      standing({ kind: "target-mark", markId: "quarry", marked: MONSTER })
    );
    state = addOccurrence(state, "poison-visible", condition("poisoned"));
    state = addOccurrence(state, "poison-hidden", {
      ...condition("poisoned"),
      hidden: { findDc: 15 },
    });
    state = addOccurrence(state, "prone", condition("prone"));
    state = addOccurrence(state, "concentration", {
      endRules: [],
      kind: "concentration",
      origin: effectOrigin("start-concentration"),
      parentId: "root",
      target: ACTOR,
    });
    state = addOccurrence(state, "form", {
      endRules: [{ kind: "temporary-hp-empty" }],
      formId: "giant-ape",
      kind: "polymorph-form",
      origin: effectOrigin("start-polymorph"),
      parentId: "root",
      target: ACTOR,
    });
    state = addOccurrence(state, "timed", {
      ...condition("frightened"),
      endRules: [
        { kind: "combat-end", clock: ENCOUNTER_CLOCK },
        { elapsedSeconds: 18, kind: "time-reached", clock: TIMELINE_CLOCK },
        {
          clock: ENCOUNTER_CLOCK,
          combatant: ACTOR,
          kind: "turn-boundary",
          phase: "end",
          round: 8,
        },
      ],
    });
    state = addOccurrence(state, "phase-child", {
      ...condition("restrained", "root", MONSTER),
      endRules: [
        {
          execution: 1,
          kind: "program-phase-end",
          occurrenceId: "root",
          phaseId: "invoke",
        },
      ],
    });
    return state;
  }

  it("resolves identical root authority from a root or child", () => {
    const state = selectorState();
    const root = resolveOccurrenceAuthority(state, "root");
    const child = resolveOccurrenceAuthority(state, "grant");
    expect(root).toEqual({
      authority: entityAuthority(),
      root: state.occurrences.root,
      rootId: "root",
    });
    expect(child).toEqual(root);
    expect(resolveOccurrenceAuthority(state, "missing")).toBeNull();
  });

  it("routes material lifecycle through effect authority and the parent-child graph", () => {
    let state = stateWithRoot(materialAuthority("environment"));
    state = addOccurrence(state, "material", materialLifecycle("root", MONSTER));

    expect(selectChildrenOf(state, "root").map(({ id }) => id)).toEqual(["material"]);
    expect(selectOccurrencesForTarget(state, MONSTER).map(({ id }) => id)).toEqual([
      "material",
    ]);
    expect(resolveOccurrenceAuthority(state, "material")).toEqual(
      resolveOccurrenceAuthority(state, "root")
    );
    expect(Object.keys(removeOccurrences(state, "root").occurrences)).toEqual([]);

    expect(() =>
      addOccurrence(state, "nested", materialLifecycle("material", MONSTER))
    ).toThrow(TypeError);
  });

  it("excludes roots from target selectors and narrows children to effects", () => {
    const state = selectorState();
    const targeted = selectOccurrencesForTarget(state, ACTOR);
    const targetedKinds: readonly string[] = targeted.map(
      ({ occurrence }) => occurrence.kind
    );
    expect(targetedKinds).not.toContain("program");
    expect(targeted.map(({ id }) => id)).not.toContain("root");
    const children: ReadonlyArray<{ occurrence: Readonly<EffectOccurrence> }> =
      selectChildrenOf(state, "root");
    expect(children.every(({ occurrence }) => isEffectOccurrence(occurrence))).toBe(true);
  });

  it("projects grant authority and item activation solely through the parent receipt", () => {
    const state = selectorState();
    expect(selectProjectedGrantSources(state, ACTOR)).toEqual([
      {
        authority: entityAuthority(),
        groupId: "web-active",
        occurrenceId: "grant",
        programOccurrenceId: "root",
        target: ACTOR,
      },
    ]);
    expect(selectItemActivations(state, ACTOR).map(({ id }) => id)).toEqual([
      "item-active",
    ]);
    expect(resolveOccurrenceAuthority(state, "item-active")?.authority.source).toEqual({
      instanceId: "wand-1",
      instanceOrdinal: 7,
      kind: "inventory-item",
      owner: MATERIAL,
    });
  });

  it("projects condition, standing, mark, concentration and polymorph facts", () => {
    const state = selectorState();
    expect(
      selectConditionOccurrences(state, ACTOR, "poisoned").map(({ id }) => id)
    ).toEqual(["poison-visible", "poison-hidden"]);
    expect(selectEffectiveConditions(state, ACTOR)).toEqual([
      "frightened",
      "poisoned",
      "prone",
    ]);
    expect(selectActiveKeys(state, ACTOR)).toEqual(["rage", "wand-lit"]);
    expect(selectMarkedTarget(state, ACTOR, "quarry")).toEqual(MONSTER);
    expect(selectStandingFacts(state, ACTOR).map(({ id }) => id)).toEqual([
      "active",
      "item-active",
      "grant",
      "mark-old",
      "mark-new",
    ]);
    expect(selectConcentrationForActor(state, ACTOR)?.id).toBe("concentration");
    expect(selectPolymorphForm(state, ACTOR)?.id).toBe("form");
  });

  it("keeps ending children structurally readable but mechanically inactive", () => {
    const mutable = mutableState(selectorState());
    const endingIds = [
      "active",
      "item-active",
      "grant",
      "mark-old",
      "mark-new",
      "poison-visible",
      "poison-hidden",
      "prone",
      "concentration",
      "form",
      "timed",
    ] as const;
    for (const occurrenceId of endingIds) {
      const occurrence = mutable.occurrences[occurrenceId];
      if (!occurrence) throw new Error("ending selector fixture");
      occurrence.ending = { causes: [{ kind: "requested" }] };
    }
    const parsed = parseOccurrenceState(mutable);
    if (!parsed.ok) throw new Error("ending selector fixture");

    expect(selectOccurrenceEntries(parsed.value).map(({ id }) => id)).toEqual(
      expect.arrayContaining([...endingIds])
    );
    expect(selectChildrenOf(parsed.value, "root").map(({ id }) => id)).toContain(
      "active"
    );
    expect(
      selectProgramPhaseChildren(parsed.value, "root", "invoke", 1).map(({ id }) => id)
    ).toContain("active");
    expect(
      selectProgramStepChildren(parsed.value, "root", "invoke", 1, "start-standing").map(
        ({ id }) => id
      )
    ).toContain("active");
    expect(
      selectProgramExecution(parsed.value, "root")?.children.map(({ id }) => id)
    ).toContain("active");
    expect(resolveOccurrenceAuthority(parsed.value, "active")).not.toBeNull();
    expect(selectOccurrencesForTarget(parsed.value, ACTOR)).toEqual([]);
    expect(selectActiveKeys(parsed.value, ACTOR)).toEqual([]);
    expect(selectActiveKeys(parsed.value)).toEqual([]);
    expect(selectProjectedGrantSources(parsed.value, ACTOR)).toEqual([]);
    expect(selectConditionOccurrences(parsed.value, ACTOR)).toEqual([]);
    expect(selectEffectiveConditions(parsed.value, ACTOR)).toEqual([]);
    expect(selectConcentrationForActor(parsed.value, ACTOR)).toBeNull();
    expect(selectMarkedTarget(parsed.value, ACTOR, "quarry")).toBeNull();
    expect(selectStandingFacts(parsed.value, ACTOR)).toEqual([]);
    expect(selectPolymorphForm(parsed.value, ACTOR)).toBeNull();
    expect(selectItemActivations(parsed.value, ACTOR)).toEqual([]);
    expect(
      selectOccurrencesEndingAt(parsed.value, {
        kind: "combat-end",
        clock: ENCOUNTER_CLOCK,
      }).map(({ id }) => id)
    ).toEqual([]);
    expect(selectRoundsUntilDeadline(parsed.value, "timed", 6)).toBeNull();
  });

  it("selects root and effect lifetimes without treating roots as targeted", () => {
    let state = selectorState();
    const root = mutableState(state);
    (root.occurrences.root as ProgramOccurrence).endRules = [
      { kind: "combat-end", clock: ENCOUNTER_CLOCK },
    ];
    const parsed = parseOccurrenceState(root);
    if (!parsed.ok) throw new Error("expected persisted fixture");
    state = parsed.value;

    expect(
      selectOccurrencesEndingAt(state, {
        kind: "combat-end",
        clock: ENCOUNTER_CLOCK,
      }).map(({ id }) => id)
    ).toEqual(["root", "timed"]);
    expect(
      selectOccurrencesEndingAt(
        state,
        { kind: "combat-end", clock: ENCOUNTER_CLOCK },
        ACTOR
      ).map(({ id }) => id)
    ).toEqual(["timed"]);
    expect(selectRoundsUntilDeadline(state, "timed", 6, TIMELINE_CLOCK, 6)).toBe(2);
    expect(
      selectProgramPhaseChildren(state, "root", "invoke", 1).map(({ id }) => id)
    ).toEqual(selectChildrenOf(state, "root").map(({ id }) => id));
    expect(selectProgramPhaseChildren(state, "root", "invoke", 2)).toEqual([]);
    expect(selectProgramExecution(state, "root")?.children.map(({ id }) => id)).toEqual(
      selectChildrenOf(state, "root").map(({ id }) => id)
    );
  });

  it("enforces one concentration and polymorph form per target", () => {
    let state = stateWithRoot();
    state = addOccurrence(state, "concentration", {
      endRules: [],
      kind: "concentration",
      origin: effectOrigin("start-concentration"),
      parentId: "root",
      target: ACTOR,
    });
    expect(() =>
      addOccurrence(state, "other-concentration", {
        endRules: [],
        kind: "concentration",
        origin: effectOrigin("start-concentration"),
        parentId: "root",
        target: ACTOR,
      })
    ).toThrow(TypeError);

    state = addOccurrence(state, "form", {
      endRules: [],
      formId: "wolf",
      kind: "polymorph-form",
      origin: effectOrigin("start-polymorph"),
      parentId: "root",
      target: ACTOR,
    });
    expect(() =>
      addOccurrence(state, "other-form", {
        endRules: [],
        formId: "ape",
        kind: "polymorph-form",
        origin: effectOrigin("start-polymorph"),
        parentId: "root",
        target: ACTOR,
      })
    ).toThrow(TypeError);

    const ending = mutableState(state);
    for (const occurrenceId of ["concentration", "form"] as const) {
      const occurrence = ending.occurrences[occurrenceId];
      if (!occurrence) throw new Error("ending exclusive fixture");
      occurrence.ending = { causes: [{ kind: "requested" }] };
    }
    const parsed = parseOccurrenceState(ending);
    if (!parsed.ok) throw new Error("ending exclusive fixture");
    const replacementConcentration = addOccurrence(parsed.value, "other-concentration", {
      endRules: [],
      kind: "concentration",
      origin: effectOrigin("start-concentration"),
      parentId: "root",
      target: ACTOR,
    });
    const replacements = addOccurrence(replacementConcentration, "other-form", {
      endRules: [],
      formId: "ape",
      kind: "polymorph-form",
      origin: effectOrigin("start-polymorph"),
      parentId: "root",
      target: ACTOR,
    });
    expect(selectConcentrationForActor(replacements, ACTOR)?.id).toBe(
      "other-concentration"
    );
    expect(selectPolymorphForm(replacements, ACTOR)?.id).toBe("other-form");
  });

  it("keeps canonical damage and condition-immunity projections on effects", () => {
    const fireResistance: DamageDefenseRule = {
      kind: "resistance",
      selector: damageSelector(["fire"]),
      sourceId: "feature.fire-resistance",
    };
    let state = stateWithRoot();
    state = addOccurrence(
      state,
      "fire-one",
      standing({ kind: "damage-defense", rule: fireResistance })
    );
    state = addOccurrence(
      state,
      "fire-two",
      standing({ kind: "damage-defense", rule: fireResistance })
    );
    state = addOccurrence(
      state,
      "charm-immunity",
      standing({ conditionId: "charmed", kind: "condition-immunity" })
    );
    expect(selectEffectiveDamageDefenseProfile(state, ACTOR)).toEqual({
      damageThreshold: null,
      rules: [fireResistance],
    });
    expect(selectEffectiveConditionImmunities(state, ACTOR)).toEqual(["charmed"]);

    expect(() =>
      addOccurrence(
        state,
        "conflict",
        standing({
          kind: "damage-defense",
          rule: {
            kind: "immunity",
            selector: damageSelector(["cold"]),
            sourceId: fireResistance.sourceId,
          },
        })
      )
    ).toThrow(TypeError);

    const ending = mutableState(state);
    for (const occurrenceId of ["fire-one", "fire-two", "charm-immunity"] as const) {
      const occurrence = ending.occurrences[occurrenceId];
      if (!occurrence) throw new Error("ending standing fixture");
      occurrence.ending = { causes: [{ kind: "requested" }] };
    }
    const parsed = parseOccurrenceState(ending);
    if (!parsed.ok) throw new Error("ending standing fixture");
    expect(selectEffectiveDamageDefenseProfile(parsed.value, ACTOR)).toEqual({
      damageThreshold: null,
      rules: [],
    });
    expect(selectEffectiveConditionImmunities(parsed.value, ACTOR)).toEqual([]);
  });

  it("orders all roots and effects by allocation ordinal", () => {
    const state = selectorState();
    const reversed: OccurrenceState = {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: Object.fromEntries(Object.entries(state.occurrences).reverse()),
    };
    expect(
      selectOccurrenceEntries(reversed).map(({ occurrence }) => occurrence.ordinal)
    ).toEqual(
      Array.from({ length: state.nextOccurrenceOrdinal - 1 }, (_, index) => index + 1)
    );
  });
});
