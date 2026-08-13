import { describe, expect, it } from "vitest";

import { materialRefKey } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  addOccurrence,
  addTransitionedProgramOccurrence,
} from "@/lib/mechanic-occurrences";
import {
  advanceMechanicsBoundary,
  beginMechanicsBoundary,
  beginMechanicsCausalState,
  discoverMechanicsEndWave,
  finalizeMechanicsEndWave,
  finalizeMechanicsMaterialCleanup,
  isEndRuleDue,
  isMechanicsEndWaveReceiptForWorld,
  latchMechanicsEndWave,
  parseMechanicsWorld,
  projectMechanicsTransactionWorld,
  rebaseMechanicsCausalState,
} from "@/lib/mechanics-world";
import {
  createEmptyCharacterMaterialState,
  createEmptySharedMaterialState,
} from "@/lib/material-state";
import {
  createBetweenTurnsEconomyState,
  createTurnEconomyState,
} from "@/lib/turn-economy";
import type {
  CharacterMaterialState,
  CreatureMaterialEntity,
  EncounterState,
  InventoryInstance,
  ObjectMaterialEntity,
  SharedMaterialState,
} from "@/types/material-state";
import type { TurnEconomyState } from "@/types/turn-economy";
import type {
  CharacterMaterialRef,
  MaterialRef,
  SharedMaterialRef,
} from "@/types/mechanics-reference";
import type {
  EndRule,
  NewMechanicOccurrence,
  ProgramOccurrence,
} from "@/types/mechanic-occurrence";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  EncounterSeed,
  MechanicsBoundaryCheckpoint,
  MechanicsBoundaryCompletion,
  MechanicsBoundaryCommand,
  MechanicsClosureRequest,
  MechanicsCausalState,
  MechanicsEndWaveReceipt,
  MechanicsDocument,
  MechanicsWorld,
} from "@/types/mechanics-world";

const HERO = {
  kind: "character-play",
  uid: "hero-user",
  characterId: "hero-character",
} as const satisfies CharacterMaterialRef;
const CAMPAIGN = {
  kind: "shared-combat",
  campaignId: "campaign-one",
} as const satisfies SharedMaterialRef;
const OTHER_CAMPAIGN = {
  kind: "shared-combat",
  campaignId: "campaign-two",
} as const satisfies SharedMaterialRef;

function self(material: CharacterMaterialRef = HERO) {
  return { material, entityId: "self" } as const;
}

function livingVitals(current = 10) {
  return {
    hitPoints: {
      current,
      temporary: { current: 0, sourceOccurrence: null },
    },
    zeroHitPoints: null,
  } as const;
}

function countCell(current: number) {
  return {
    capacity: { base: { kind: "unbounded" as const }, override: null },
    current,
    disabled: false,
    kind: "count" as const,
  };
}

function turn(key = "turn"): TurnEconomyState {
  const state = createTurnEconomyState(key);
  if (!state) throw new Error("invalid turn fixture");
  return structuredClone(state);
}

function betweenTurns(key = "between-turns"): TurnEconomyState {
  const state = createBetweenTurnsEconomyState(key);
  if (!state) throw new Error("invalid between-turns fixture");
  return structuredClone(state);
}

function monster(ordinal = 1): CreatureMaterialEntity {
  return {
    kind: "creature",
    ordinal,
    controller: null,
    template: {
      kind: "catalogue-monster",
      monsterId: "goblin-warrior",
      creatureTypeOverride: null,
    },
    ownerOccurrence: null,
    availability: "present",
    label: "",
    vitals: livingVitals(7),
    exhaustion: 0,
    resources: {},
    overrides: {
      armorClass: null,
      hitPointMaximum: null,
      speedFt: null,
      initiativeBonus: null,
    },
  };
}

function item(ownerOccurrence: InventoryInstance["ownerOccurrence"]): InventoryInstance {
  return {
    ordinal: 1,
    definition: { kind: "catalogue", itemId: "conjured-blade" },
    quantity: countCell(1),
    equipped: false,
    attuned: false,
    notes: "",
    tags: [],
    ownerOccurrence,
    overrides: {
      name: null,
      armorClass: null,
      attackBonus: null,
      damageFormula: null,
      damageType: null,
    },
    resources: {},
    disposition: "magical",
    enchantment: null,
  };
}

function inventoryObject(instanceId: string): ObjectMaterialEntity {
  return {
    kind: "object",
    ordinal: 1,
    controller: null,
    template: { kind: "inventory-item", owner: HERO, instanceId, instanceOrdinal: 1 },
    ownerOccurrence: null,
    availability: "present",
    label: "Conjured blade",
    vitals: { hitPoints: { current: 10 } },
    resources: {},
    overrides: {
      size: "Small",
      armorClass: 15,
      hitPointMaximum: 10,
      damageDefenseProfile: {
        damageThreshold: null,
        rules: [
          {
            kind: "immunity",
            selector: {
              damageTypes: ["poison", "psychic"],
              deliveries: [],
              forbiddenTraits: [],
              requiredTraits: [],
            },
            sourceId: "object-intrinsic-immunities",
          },
        ],
      },
      magical: true,
      materials: [{ kind: "steel" }],
    },
  };
}

function character(material: CharacterMaterialRef = HERO): CharacterMaterialState {
  return structuredClone(createEmptyCharacterMaterialState(1, material, livingVitals()));
}

function fixtureSteps() {
  return [
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
      target: { kind: "role", role: "target" },
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
    {
      instanceKey: "fixture-item",
      itemId: "longsword",
      kind: "inventory-create",
      lifetime: { kind: "manual" },
      owner: "owner",
      quantity: { kind: "fixed", value: 1 },
      stepId: "create-inventory",
      when: null,
    },
  ] as const;
}

function tableAuthority(
  material: MaterialRef,
  id: string
): MechanicsProgramAuthorityReceipt {
  const definition = {
    authority: "table",
    declarationId: id,
    generation: 1,
    kind: "table-declaration",
    material,
  } as const;
  const capability = { capabilityId: id, definition, kind: "system" } as const;
  return {
    anchors: {
      activator: null,
      caster: null,
      owner: null,
      source: null,
      target: null,
    },
    installation: {
      capability,
      generation: 1,
      installationId: id,
      owner: { authority: "table", kind: "material-authority", material },
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: {
        id,
        phases: [
          {
            inputs: [],
            phaseId: "active",
            steps: fixtureSteps(),
            trigger: { kind: "invocation" },
          },
        ],
        registers: [],
        version: 1,
      },
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: definition,
    staticBindings: {},
  };
}

function inventoryAuthority(
  instanceId: string,
  instanceOrdinal: number,
  id: string
): MechanicsProgramAuthorityReceipt {
  const definition = {
    catalogueKind: "item",
    entityId: id,
    kind: "catalogue",
    mechanicsRevision: `sha256:${"0".repeat(64)}`,
  } as const;
  const capability = { capabilityId: id, definition, kind: "program" } as const;
  return {
    anchors: {
      activator: self(),
      caster: null,
      owner: self(),
      source: self(),
      target: self(),
    },
    installation: {
      capability,
      generation: 1,
      installationId: id,
      owner: self(),
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program: {
        id,
        phases: [
          {
            inputs: [],
            phaseId: "active",
            steps: fixtureSteps(),
            trigger: { kind: "invocation" },
          },
        ],
        registers: [],
        version: 1,
      },
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { instanceId, instanceOrdinal, kind: "inventory-item", owner: HERO },
    staticBindings: {},
  };
}

function program(
  material: MaterialRef,
  id: string,
  authority: MechanicsProgramAuthorityReceipt = tableAuthority(material, id)
): Extract<NewMechanicOccurrence, { kind: "program" }> {
  return {
    authority,
    endRules: [],
    kind: "program",
    phaseState: { active: { execution: 0, lastTriggerEventId: null } },
    registers: {},
  };
}

function transitionedProgram(
  material: MaterialRef,
  id: string,
  authority: MechanicsProgramAuthorityReceipt = tableAuthority(material, id)
): Omit<ProgramOccurrence, "ending" | "ordinal"> {
  return {
    ...program(material, id, authority),
    phaseState: { active: { execution: 1, lastTriggerEventId: null } },
  };
}

type MutableMaterialState = CharacterMaterialState | SharedMaterialState;
type NewEffectOccurrence = Exclude<NewMechanicOccurrence, { kind: "program" }>;
type WithoutOrigin<Occurrence> = Occurrence extends { origin: unknown }
  ? Omit<Occurrence, "origin">
  : never;
type FixtureEffectOccurrence = WithoutOrigin<NewEffectOccurrence>;

function fixtureStepId(
  occurrence: FixtureEffectOccurrence,
  lifecycleStepId: "create-entity" | "create-inventory"
) {
  switch (occurrence.kind) {
    case "condition":
      return "apply-condition";
    case "standing":
      return "start-standing";
    case "concentration":
      return "start-concentration";
    case "polymorph-form":
      return "start-polymorph";
    case "material-lifecycle":
      return lifecycleStepId;
  }
}

function addToState<State extends MutableMaterialState>(
  state: State,
  id: string,
  occurrence: FixtureEffectOccurrence,
  lifecycleStepId: "create-entity" | "create-inventory" = "create-entity"
): State {
  const root = state.occurrences[occurrence.parentId];
  if (root?.kind !== "program") throw new Error("Missing program fixture root");
  const stepId = fixtureStepId(occurrence, lifecycleStepId);
  const phase = root.authority.snapshot.program?.phases.find(({ steps }) =>
    steps.some((step) => step.stepId === stepId)
  );
  if (!phase) throw new Error(`Missing fixture step ${stepId}`);
  const execution = root.phaseState[phase.phaseId]?.execution;
  if (!execution) throw new Error(`Inactive fixture phase ${phase.phaseId}`);
  const usedSlots = Object.values(state.occurrences).flatMap((candidate) =>
    candidate.kind !== "program" &&
    candidate.origin.root.occurrence.occurrenceId === occurrence.parentId &&
    candidate.origin.root.ordinal === root.ordinal &&
    candidate.origin.phaseId === phase.phaseId &&
    candidate.origin.execution === execution &&
    candidate.origin.stepId === stepId
      ? [candidate.origin.slot]
      : []
  );
  const next = addOccurrence(
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    },
    id,
    {
      ...occurrence,
      origin: {
        execution,
        kind: "program-step",
        phaseId: phase.phaseId,
        root: {
          occurrence: {
            material: root.authority.installation.owner.material,
            occurrenceId: occurrence.parentId,
          },
          ordinal: root.ordinal,
        },
        slot: Math.max(0, ...usedSlots) + 1,
        stepId,
      },
    }
  );
  return { ...state, ...next };
}

function addRoot<State extends MutableMaterialState>(
  state: State,
  material: MaterialRef,
  id = "root",
  authority = tableAuthority(material, id)
): State {
  const next = addTransitionedProgramOccurrence(
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    },
    id,
    transitionedProgram(material, id, authority)
  );
  return { ...state, ...next };
}

function generation(
  state: MutableMaterialState,
  material: MaterialRef,
  occurrenceId: string
) {
  const occurrence = state.occurrences[occurrenceId];
  if (!occurrence) throw new Error(`Missing occurrence ${occurrenceId}`);
  return { occurrence: { material, occurrenceId }, ordinal: occurrence.ordinal } as const;
}

function shared(): SharedMaterialState {
  return structuredClone(createEmptySharedMaterialState());
}

function sorted(documents: MechanicsDocument[]): MechanicsDocument[] {
  return documents.sort((left, right) => {
    const leftKey = materialRefKey(left.material);
    const rightKey = materialRefKey(right.material);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function world(
  hero = character(),
  campaign = shared(),
  extra: MechanicsDocument[] = []
): MechanicsWorld {
  return {
    scope: CAMPAIGN,
    documents: sorted([
      { kind: "character", material: HERO, state: hero },
      { kind: "shared", material: CAMPAIGN, state: campaign },
      ...extra,
    ]),
  };
}

function worldGeneration(
  value: Readonly<MechanicsWorld>,
  material: MaterialRef,
  occurrenceId: string
) {
  const document = value.documents.find(
    (entry) => materialRefKey(entry.material) === materialRefKey(material)
  );
  const occurrence = document?.state.occurrences[occurrenceId];
  if (!occurrence) throw new Error(`Missing occurrence ${occurrenceId}`);
  return { occurrence: { material, occurrenceId }, ordinal: occurrence.ordinal } as const;
}

function finalizeDiscoveredWave(
  value: Readonly<MechanicsWorld>,
  request: MechanicsClosureRequest = {}
) {
  const discovery = discoverMechanicsEndWave(value, request);
  if (discovery.status === "rejected") return discovery;
  const latched = latchMechanicsEndWave(discovery.world, discovery.wave);
  if (latched.status === "rejected") return latched;
  const current = discoverMechanicsEndWave(latched.world, discovery.wave.request);
  return current.status === "rejected"
    ? current
    : finalizeMechanicsEndWave(current.world, current.wave);
}

function applyBoundary(
  value: Readonly<MechanicsWorld>,
  command: Readonly<MechanicsBoundaryCommand>,
  checkpoints: MechanicsBoundaryCheckpoint[] = []
) {
  let result = beginMechanicsBoundary(value, command);
  let remaining = 32;
  while (result.status === "checkpoint" && remaining > 0) {
    checkpoints.push(result.checkpoint);
    const completion = {
      continuation: canonicalFingerprint(result.continuation),
      state: result.checkpoint.state,
    } as unknown as MechanicsBoundaryCompletion;
    result = advanceMechanicsBoundary(result.continuation, completion);
    remaining -= 1;
  }
  if (result.status === "checkpoint") throw new Error("boundary fixture did not settle");
  return result.status === "complete"
    ? { status: result.outcome, world: result.world }
    : result;
}

function initiativeSeed(...participants: CharacterMaterialRef[]): EncounterSeed {
  return {
    nextCombatantOrdinal: participants.length + 1,
    participants: Object.fromEntries(
      participants.map((material, index) => [
        `pc-${index + 1}`,
        {
          ordinal: index + 1,
          combatant: self(material),
          initiativeRoll: null,
          skipped: false,
        },
      ])
    ),
    phase: "initiative",
    round: 1,
    order: [],
    currentCombatantId: null,
  };
}

function turnsEncounter(
  epoch: number,
  material: CharacterMaterialRef = HERO
): EncounterState {
  return {
    epoch,
    nextCombatantOrdinal: 3,
    participants: {
      hero: {
        ordinal: 1,
        combatant: self(material),
        economy: turn("hero"),
        initiativeRoll: 15,
        skipped: false,
      },
      ally: {
        ordinal: 2,
        combatant: { material, entityId: "ally", ordinal: 1 },
        economy: betweenTurns("ally-waiting"),
        initiativeRoll: 10,
        skipped: false,
      },
    },
    phase: "turns",
    round: 1,
    order: ["hero", "ally"],
    currentCombatantId: "hero",
  };
}

function currentOwnedSummonWorld(
  endRules: readonly EndRule[] = [
    {
      clock: { material: HERO, epoch: 1 },
      combatant: { material: HERO, entityId: "summon", ordinal: 2 },
      kind: "turn-boundary",
      phase: "end",
      round: 1,
    },
  ]
): MechanicsWorld {
  let hero = addRoot(character(), HERO);
  hero = addToState(hero, "summon", {
    endRules,
    kind: "material-lifecycle",
    parentId: "root",
    target: { material: HERO, entityId: "summon", ordinal: 2 },
  });
  hero.nextEntityOrdinal = 3;
  hero.entities = {
    ally: monster(),
    summon: {
      ...monster(2),
      ownerOccurrence: generation(hero, HERO, "summon"),
    },
  };
  hero.nextEncounterEpoch = 2;
  hero.encounter = {
    epoch: 1,
    nextCombatantOrdinal: 4,
    participants: {
      hero: {
        ordinal: 1,
        combatant: self(),
        economy: betweenTurns("hero-waiting"),
        initiativeRoll: 20,
        skipped: false,
      },
      summon: {
        ordinal: 2,
        combatant: { material: HERO, entityId: "summon", ordinal: 2 },
        economy: turn("summon-turn"),
        initiativeRoll: 15,
        skipped: false,
      },
      ally: {
        ordinal: 3,
        combatant: { material: HERO, entityId: "ally", ordinal: 1 },
        economy: betweenTurns("ally-waiting"),
        initiativeRoll: 10,
        skipped: false,
      },
    },
    phase: "turns",
    round: 1,
    order: ["hero", "summon", "ally"],
    currentCombatantId: "summon",
  };
  hero.clockBinding.encounter = { material: HERO, epoch: 1 };
  return {
    scope: HERO,
    documents: [{ kind: "character", material: HERO, state: hero }],
  };
}

function programEndWaveWorld(): MechanicsWorld {
  let hero = character();
  hero = addRoot(hero, HERO);
  hero = structuredClone(hero);
  const root = hero.occurrences.root;
  if (root?.kind !== "program") throw new Error("program fixture");
  root.phaseState.active = { execution: 1, lastTriggerEventId: null };
  hero = addToState(hero, "child", {
    endRules: [
      {
        execution: 2,
        kind: "program-phase-end",
        occurrenceId: "root",
        phaseId: "active",
      },
    ],
    fact: { key: "child", kind: "active-key" },
    kind: "standing",
    parentId: "root",
    target: self(),
  });
  return world(hero);
}

describe("canonical mechanics world and clocks", () => {
  it("keeps one-ahead program origins transient to transaction projection", () => {
    const priorHero = addRoot(character(), HERO);
    const candidateHero = structuredClone(
      addToState(structuredClone(priorHero), "pending-effect", {
        endRules: [],
        fact: { key: "pending-effect", kind: "active-key" },
        kind: "standing",
        parentId: "root",
        target: self(),
      })
    );
    const pendingEffect = candidateHero.occurrences["pending-effect"];
    if (pendingEffect?.kind !== "standing") throw new Error("effect fixture");
    pendingEffect.origin.execution = 2;
    const candidate = world(candidateHero);

    expect(parseMechanicsWorld(candidate)).toEqual({
      ok: false,
      reason: "invalid-program-origin",
    });
    expect(projectMechanicsTransactionWorld(candidate, world(priorHero))).toMatchObject({
      ok: true,
    });
  });

  it.each(["epoch", "revision", "actions", "buildRevision"] as const)(
    "protects %s from transaction-projection mutation",
    (field) => {
      const prior = world(character());
      const candidate = structuredClone(prior);
      const document = candidate.documents.find(
        (entry) => materialRefKey(entry.material) === materialRefKey(HERO)
      );
      if (document?.kind !== "character") throw new Error("character fixture");
      if (field === "epoch") document.state.epoch = 1;
      else if (field === "revision") document.state.revision = 1;
      else if (field === "buildRevision") document.state.buildRevision = 2;
      else {
        document.state.actions = [
          {
            actor: self(),
            generation: 1,
            guards: {
              documents: [
                {
                  epoch: document.state.epoch,
                  material: HERO,
                  revision: document.state.revision,
                },
              ],
              facts: [],
            },
            id: "protected-action",
            mutations: [
              {
                after: { present: true, value: "changed" },
                before: { present: true, value: "" },
                path: ["notes"],
                target: HERO,
              },
            ],
          },
        ];
      }

      expect(projectMechanicsTransactionWorld(candidate, prior)).toEqual({
        ok: false,
        reason: "protected-state-mismatch",
      });
      const causal = beginMechanicsCausalState(prior);
      if (!causal.ok) throw new Error("causal fixture");
      expect(rebaseMechanicsCausalState(candidate, causal.value)).toEqual({
        ok: false,
        reason: "invalid-end-wave",
      });
    }
  );

  it("scopes resolved program-phase endings to one exact execution", () => {
    const rule = {
      execution: 3,
      kind: "program-phase-end",
      occurrenceId: "root",
      phaseId: "pulse",
    } as const;
    expect(isEndRuleDue(rule, rule)).toBe(true);
    expect(isEndRuleDue(rule, { ...rule, execution: 2 })).toBe(false);
    expect(isEndRuleDue(rule, { ...rule, phaseId: "other" })).toBe(false);
    expect(isEndRuleDue(rule, { ...rule, occurrenceId: "other" })).toBe(false);
  });

  it("derives current and overdue phase endings from the root state", () => {
    const future = programEndWaveWorld();
    const futureDiscovery = discoverMechanicsEndWave(future);
    if (futureDiscovery.status !== "discovered") throw new Error("future fixture");
    expect(futureDiscovery.wave.candidates).toEqual([]);

    const current = structuredClone(future);
    const currentRoot = current.documents.find(
      (document) => document.kind === "character"
    )?.state.occurrences.root;
    if (currentRoot?.kind !== "program") throw new Error("current fixture");
    currentRoot.phaseState.active = { execution: 2, lastTriggerEventId: null };
    const currentDiscovery = discoverMechanicsEndWave(current);
    if (currentDiscovery.status !== "discovered") throw new Error("current fixture");
    expect(currentDiscovery.wave.candidates).toEqual([
      {
        causes: [
          {
            completion: {
              execution: 2,
              phaseId: "active",
              root: worldGeneration(current, HERO, "root"),
            },
            kind: "program-phase-completed",
          },
        ],
        occurrence: worldGeneration(current, HERO, "child"),
      },
    ]);

    const overdue = structuredClone(current);
    const overdueRoot = overdue.documents.find(
      (document) => document.kind === "character"
    )?.state.occurrences.root;
    if (overdueRoot?.kind !== "program") throw new Error("overdue fixture");
    overdueRoot.phaseState.active = { execution: 3, lastTriggerEventId: null };
    const overdueDiscovery = discoverMechanicsEndWave(overdue);
    if (overdueDiscovery.status !== "discovered") throw new Error("overdue fixture");
    expect(overdueDiscovery.wave.candidates).toEqual(currentDiscovery.wave.candidates);
  });

  it("discovers a complete child-first end wave without removing its source", () => {
    const initial = programEndWaveWorld();
    const snapshot = structuredClone(initial);
    const request = {
      boundaries: [],
      endRequests: [worldGeneration(initial, HERO, "root")],
    } satisfies MechanicsClosureRequest;
    const discovery = discoverMechanicsEndWave(initial, request);
    expect(discovery.status).toBe("discovered");
    if (discovery.status !== "discovered") return;

    expect(
      discovery.wave.candidates.map(
        ({ occurrence }) => occurrence.occurrence.occurrenceId
      )
    ).toEqual(["child", "root"]);
    expect(discovery.wave.candidates[0]?.causes).toContainEqual({
      dependency: worldGeneration(initial, HERO, "root"),
      kind: "dependency-ended",
    });
    expect(discovery.wave.candidates[1]?.causes).toEqual([{ kind: "requested" }]);
    expect(
      discovery.world.documents.find((document) => document.kind === "character")?.state
        .occurrences
    ).toHaveProperty("root");
    expect(initial).toEqual(snapshot);
    expect(Object.isFrozen(discovery.wave.candidates)).toBe(true);
    expect(discovery.wave.candidates[0]?.occurrence.occurrence.material).not.toBe(
      request.endRequests[0]?.occurrence.material
    );

    const latched = latchMechanicsEndWave(initial, discovery.wave);
    expect(latched.status).toBe("latched");
    if (latched.status === "rejected") return;
    expect(parseMechanicsWorld(latched.world)).toMatchObject({
      ok: false,
      reason: "invalid-ending",
    });
    const current = discoverMechanicsEndWave(latched.world, discovery.wave.request);
    if (current.status !== "discovered") throw new Error("latched wave fixture");
    const finalized = finalizeMechanicsEndWave(current.world, current.wave);
    expect(finalized.status).toBe("applied");
    if (finalized.status !== "applied") return;
    expect(finalized.world.documents[0]?.state.occurrences).toEqual({});
  });

  it("records every independent end cause in canonical order", () => {
    let hero = character();
    hero = addRoot(hero, HERO);
    hero = addToState(hero, "triple", {
      endRules: [
        {
          clock: { material: HERO, epoch: 0 },
          elapsedSeconds: 0,
          kind: "time-reached",
        },
        { kind: "temporary-hp-empty" },
      ],
      fact: { key: "triple", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    const initial = world(hero);
    const boundary = {
      clock: { material: HERO, epoch: 0 },
      elapsedSeconds: 0,
      kind: "time-reached",
    } as const;
    const discovery = discoverMechanicsEndWave(initial, {
      boundaries: [boundary],
      endRequests: [worldGeneration(initial, HERO, "triple")],
    });
    expect(discovery.status).toBe("discovered");
    if (discovery.status !== "discovered") return;
    expect(discovery.wave.candidates).toEqual([
      {
        causes: [
          { boundary, kind: "explicit-boundary" },
          { kind: "requested" },
          { kind: "temporary-hit-points-empty" },
        ],
        occurrence: worldGeneration(initial, HERO, "triple"),
      },
    ]);
  });

  it("rejects malformed, missing, excess, duplicate, reordered and stale end waves", () => {
    const initial = programEndWaveWorld();
    expect(
      discoverMechanicsEndWave(initial, {
        endRequests: [worldGeneration(initial, HERO, "root")],
        future: true,
      } as never)
    ).toMatchObject({ reason: "invalid-boundary", status: "rejected" });
    expect(
      discoverMechanicsEndWave(initial, {
        endRequests: [
          worldGeneration(initial, HERO, "root"),
          worldGeneration(initial, HERO, "root"),
        ],
      })
    ).toMatchObject({ reason: "invalid-boundary", status: "rejected" });
    const request = {
      boundaries: [],
      endRequests: [worldGeneration(initial, HERO, "root")],
    } satisfies MechanicsClosureRequest;
    const discovery = discoverMechanicsEndWave(initial, request);
    if (discovery.status !== "discovered") throw new Error("discovery fixture");
    const wave = discovery.wave;
    const invalid = (value: unknown) =>
      expect(
        finalizeMechanicsEndWave(initial, value as MechanicsEndWaveReceipt)
      ).toMatchObject({
        reason: "invalid-end-wave",
        status: "rejected",
      });

    invalid({ ...wave, candidates: wave.candidates.slice(1) });
    invalid({ ...wave, candidates: [...wave.candidates, wave.candidates[0]] });
    invalid({ ...wave, candidates: [...wave.candidates].reverse() });
    invalid({
      ...wave,
      candidates: [wave.candidates[0], wave.candidates[0]],
    });
    invalid({
      ...wave,
      candidates: [
        { ...wave.candidates[0], causes: [{ kind: "requested" }] },
        wave.candidates[1],
      ],
    });
    invalid({ ...wave, future: true });

    const stale = structuredClone(initial);
    const staleHero = stale.documents.find((document) => document.kind === "character");
    if (staleHero?.kind !== "character") throw new Error("stale fixture");
    Reflect.set(staleHero.state, "occurrences", {});
    expect(finalizeMechanicsEndWave(stale, wave)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });
  });

  it("fails malformed boundary commands and hostile BigInt receipts closed", () => {
    const initial = programEndWaveWorld();
    for (const command of [
      {
        clock: { epoch: 0, material: HERO },
        elapsedSeconds: 1n,
        kind: "advance-time",
      },
      {
        input: {
          clock: { epoch: 0n, material: HERO },
          combatant: self(),
          rest: "long",
        },
        kind: "complete-rest",
      },
      { excludeCurrent: null, kind: "complete-turn", material: HERO, unexpected: true },
      { kind: "complete-turn", material: HERO },
    ]) {
      expect(beginMechanicsBoundary(initial, command)).toMatchObject({
        reason: "invalid-transition",
        status: "rejected",
      });
    }

    const discovery = discoverMechanicsEndWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    if (discovery.status !== "discovered") throw new Error("discovery fixture");
    const candidate = discovery.wave.candidates[0];
    if (!candidate) throw new Error("candidate fixture");
    const forged = {
      ...discovery.wave,
      candidates: [
        {
          ...candidate,
          occurrence: { ...candidate.occurrence, ordinal: 1n },
        },
      ],
    };
    expect(isMechanicsEndWaveReceiptForWorld(initial, forged)).toBe(false);
    expect(
      finalizeMechanicsEndWave(initial, forged as unknown as MechanicsEndWaveReceipt)
    ).toMatchObject({ reason: "invalid-end-wave", status: "rejected" });
  });

  it("binds receipts and end requests to one exact occurrence generation", () => {
    const initialHero = addRoot(character(), HERO);
    const initial = world(initialHero);
    const oldGeneration = worldGeneration(initial, HERO, "root");
    const discovery = discoverMechanicsEndWave(initial, {
      endRequests: [oldGeneration],
    });
    if (discovery.status !== "discovered") throw new Error("discovery fixture");

    const advancedHero = structuredClone(initialHero);
    advancedHero.timeline.elapsedSeconds = 1;
    const advanced = world(advancedHero);
    expect(finalizeMechanicsEndWave(advanced, discovery.wave)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });

    const recreatedHero = structuredClone(initialHero);
    const replacement = recreatedHero.occurrences.root;
    if (!replacement) throw new Error("occurrence fixture");
    Reflect.set(replacement, "ordinal", recreatedHero.nextOccurrenceOrdinal);
    recreatedHero.nextOccurrenceOrdinal += 1;
    const recreated = world(recreatedHero);
    expect(parseMechanicsWorld(recreated).ok).toBe(true);
    expect(finalizeMechanicsEndWave(recreated, discovery.wave)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });
    expect(
      discoverMechanicsEndWave(recreated, { endRequests: [oldGeneration] })
    ).toMatchObject({ reason: "invalid-boundary", status: "rejected" });
  });

  it("keeps a transient ending latched while its source remains readable", () => {
    const concentrating = addToState(addRoot(character(), HERO), "focus", {
      endRules: [],
      kind: "concentration",
      parentId: "root",
      target: self(),
    });
    const campaign = addToState(addRoot(shared(), CAMPAIGN), "paralysis", {
      conditionId: "paralyzed",
      endRules: [],
      kind: "condition",
      parentId: "root",
      target: self(),
    });
    const first = discoverMechanicsEndWave(world(concentrating, campaign));
    if (first.status !== "discovered") throw new Error("first wave fixture");
    const latched = latchMechanicsEndWave(first.world, first.wave);
    if (latched.status === "rejected") throw new Error("latch fixture");
    const restored = structuredClone(latched.world);
    const restoredCampaign = restored.documents.find(
      (document) => document.kind === "shared"
    );
    if (restoredCampaign?.kind !== "shared") throw new Error("campaign fixture");
    restoredCampaign.state = shared();
    const extended = discoverMechanicsEndWave(restored, first.wave.request);
    expect(extended.status).toBe("discovered");
    if (extended.status !== "discovered") return;
    expect(extended.wave.candidates).toEqual([
      {
        causes: [{ kind: "concentration-broken" }],
        occurrence: worldGeneration(restored, HERO, "focus"),
      },
    ]);
    expect(extended.wave.request.endRequests).toEqual([]);
    expect(isMechanicsEndWaveReceiptForWorld(restored, extended.wave)).toBe(true);
    expect(finalizeMechanicsEndWave(restored, extended.wave).status).toBe("applied");
  });

  it("unions new causes into a latched candidate without rewriting provenance", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(hero, "focus", {
      endRules: [
        {
          clock: { material: HERO, epoch: 0 },
          elapsedSeconds: 0,
          kind: "time-reached",
        },
      ],
      kind: "concentration",
      parentId: "root",
      target: self(),
    });
    const campaign = addToState(addRoot(shared(), CAMPAIGN), "paralysis", {
      conditionId: "paralyzed",
      endRules: [],
      kind: "condition",
      parentId: "root",
      target: self(),
    });
    const initial = world(hero, campaign);
    const first = discoverMechanicsEndWave(initial);
    if (first.status !== "discovered") throw new Error("first wave fixture");
    const latched = latchMechanicsEndWave(first.world, first.wave);
    if (latched.status === "rejected") throw new Error("latch fixture");
    const boundary = {
      clock: { material: HERO, epoch: 0 },
      elapsedSeconds: 0,
      kind: "time-reached",
    } as const;
    const restored = structuredClone(latched.world);
    const restoredCampaign = restored.documents.find(
      (document) => document.kind === "shared"
    );
    if (restoredCampaign?.kind !== "shared") throw new Error("campaign fixture");
    restoredCampaign.state = shared();
    const extended = discoverMechanicsEndWave(restored, { boundaries: [boundary] });
    expect(extended.status).toBe("discovered");
    if (extended.status !== "discovered") return;
    expect(extended.wave.candidates).toEqual([
      {
        causes: [
          { boundary, kind: "explicit-boundary" },
          { kind: "concentration-broken" },
        ],
        occurrence: worldGeneration(restored, HERO, "focus"),
      },
    ]);
    expect(extended.wave.request.endRequests).toEqual([]);
    expect(isMechanicsEndWaveReceiptForWorld(restored, extended.wave)).toBe(true);
    expect(finalizeMechanicsEndWave(restored, extended.wave)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });
    const extendedLatch = latchMechanicsEndWave(restored, extended.wave);
    if (extendedLatch.status === "rejected") throw new Error("extended latch fixture");
    const current = discoverMechanicsEndWave(extendedLatch.world, extended.wave.request);
    if (current.status !== "discovered") throw new Error("current fixture");
    expect(finalizeMechanicsEndWave(current.world, current.wave).status).toBe("applied");
    const cloned = JSON.parse(JSON.stringify(extended.wave)) as MechanicsEndWaveReceipt;
    expect(isMechanicsEndWaveReceiptForWorld(restored, cloned)).toBe(true);
  });

  it("adds a child created under a latched ending source to the extended wave", () => {
    const initialHero = addRoot(character(), HERO);
    const initial = world(initialHero);
    const first = discoverMechanicsEndWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    if (first.status !== "discovered") throw new Error("first wave fixture");
    const latched = latchMechanicsEndWave(first.world, first.wave);
    if (latched.status === "rejected") throw new Error("latch fixture");
    const latchedHero = latched.world.documents.find(
      (document) => document.kind === "character"
    );
    if (latchedHero?.kind !== "character") throw new Error("hero fixture");
    const extendedHero = addToState(structuredClone(latchedHero.state), "late-child", {
      endRules: [],
      fact: { key: "late-child", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    const extendedWorld = world(extendedHero);
    const extended = discoverMechanicsEndWave(extendedWorld, first.wave.request);
    expect(extended.status).toBe("discovered");
    if (extended.status !== "discovered") return;
    expect(
      extended.wave.candidates.map(({ occurrence }) => occurrence.occurrence.occurrenceId)
    ).toEqual(["late-child", "root"]);
    expect(extended.wave.candidates[0]?.causes).toEqual([
      {
        dependency: worldGeneration(extendedWorld, HERO, "root"),
        kind: "dependency-ended",
      },
    ]);
    const extendedLatch = latchMechanicsEndWave(extendedWorld, extended.wave);
    if (extendedLatch.status === "rejected") throw new Error("extended latch fixture");
    const current = discoverMechanicsEndWave(extendedLatch.world, extended.wave.request);
    if (current.status !== "discovered") throw new Error("current fixture");
    expect(finalizeMechanicsEndWave(current.world, current.wave).status).toBe("applied");
  });

  it("admits hostile causal input only through one closed-world constructor", () => {
    const initial = programEndWaveWorld();
    const begun = beginMechanicsCausalState(initial);
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect(Reflect.ownKeys(begun.value)).toEqual(["context", "world"]);
    expect(begun.value.context).toEqual({
      endWave: null,
      request: { boundaries: [], endRequests: [], inventorySourceLeases: [] },
    });
    // @ts-expect-error The non-exported required brand blocks structural construction.
    const structurallyForged: MechanicsCausalState = {
      context: begun.value.context,
      world: begun.value.world,
    };
    expect(beginMechanicsCausalState(structurallyForged)).toEqual({
      ok: false,
      reason: "invalid-world",
    });

    const discovery = discoverMechanicsEndWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    if (discovery.status !== "discovered") throw new Error("discovery fixture");
    const latched = latchMechanicsEndWave(discovery.world, discovery.wave);
    if (latched.status === "rejected") throw new Error("latch fixture");
    expect(beginMechanicsCausalState(latched.world)).toEqual({
      ok: false,
      reason: "invalid-world",
    });
    expect(
      beginMechanicsCausalState({
        context: {
          endWave: { wave: discovery.wave, world: latched.world },
          request: { boundaries: [], endRequests: [], inventorySourceLeases: [] },
        },
        world: latched.world,
      })
    ).toEqual({ ok: false, reason: "invalid-world" });

    const forged = structuredClone(initial);
    const forgedHero = forged.documents.find((document) => document.kind === "character");
    const forgedRoot = forgedHero?.state.occurrences.root;
    if (!forgedRoot) throw new Error("root fixture");
    forgedRoot.ending = { causes: [{ kind: "requested" }] };
    const forgedDiscovery = discoverMechanicsEndWave(forged, {
      endRequests: [worldGeneration(forged, HERO, "root")],
    });
    expect(forgedDiscovery.status).toBe("discovered");
    if (forgedDiscovery.status !== "discovered") return;
    expect(isMechanicsEndWaveReceiptForWorld(forged, forgedDiscovery.wave)).toBe(true);
    expect(beginMechanicsCausalState(forged)).toEqual({
      ok: false,
      reason: "invalid-world",
    });
  });

  it("latches only a current receipt and exposes a distinct transient result", () => {
    const initial = programEndWaveWorld();
    const discovery = discoverMechanicsEndWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    if (discovery.status !== "discovered") throw new Error("discovery fixture");

    const stale = structuredClone(initial);
    const staleHero = stale.documents.find((document) => document.kind === "character");
    if (staleHero?.kind !== "character") throw new Error("hero fixture");
    staleHero.state.timeline.elapsedSeconds += 1;
    expect(latchMechanicsEndWave(stale, discovery.wave)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });

    const latched = latchMechanicsEndWave(initial, discovery.wave);
    expect(latched.status).toBe("latched");
    if (latched.status === "rejected") return;
    const current = discoverMechanicsEndWave(latched.world, discovery.wave.request);
    if (current.status !== "discovered") throw new Error("current fixture");
    expect(latchMechanicsEndWave(current.world, current.wave).status).toBe(
      "already-latched"
    );
    expect(parseMechanicsWorld(current.world)).toMatchObject({
      ok: false,
      reason: "invalid-ending",
    });
  });

  it("rebases a branded causal state by monotonically unioning exact causes", () => {
    let hero = addRoot(character(), HERO);
    hero.vitals.hitPoints.temporary = { current: 5, sourceOccurrence: null };
    hero = addToState(hero, "focus", {
      endRules: [{ kind: "temporary-hp-empty" }],
      kind: "concentration",
      parentId: "root",
      target: self(),
    });
    const initial = world(hero);
    const begun = beginMechanicsCausalState(initial);
    if (!begun.ok) throw new Error("causal entry fixture");

    const incapacitated = structuredClone(begun.value.world);
    const campaignDocument = incapacitated.documents.find(
      (document) => document.kind === "shared"
    );
    if (campaignDocument?.kind !== "shared") throw new Error("campaign fixture");
    let campaign = addRoot(structuredClone(campaignDocument.state), CAMPAIGN);
    campaign = addToState(campaign, "paralysis", {
      conditionId: "paralyzed",
      endRules: [],
      kind: "condition",
      parentId: "root",
      target: self(),
    });
    campaignDocument.state = campaign;
    const first = rebaseMechanicsCausalState(incapacitated, begun.value);
    expect(first.ok).toBe(true);
    if (!first.ok || first.value.context.endWave === null) return;
    expect(first.value.context.endWave.wave.candidates).toEqual([
      {
        causes: [{ kind: "concentration-broken" }],
        occurrence: worldGeneration(first.value.world, HERO, "focus"),
      },
    ]);

    const depleted = structuredClone(first.value.world);
    const heroDocument = depleted.documents.find(
      (document) => document.kind === "character"
    );
    if (heroDocument?.kind !== "character") throw new Error("hero fixture");
    heroDocument.state.vitals.hitPoints.temporary = {
      current: 0,
      sourceOccurrence: null,
    };
    const second = rebaseMechanicsCausalState(depleted, first.value);
    expect(second.ok).toBe(true);
    if (!second.ok || second.value.context.endWave === null) return;
    expect(second.value.context.endWave.wave.candidates).toEqual([
      {
        causes: [
          { kind: "concentration-broken" },
          { kind: "temporary-hit-points-empty" },
        ],
        occurrence: worldGeneration(second.value.world, HERO, "focus"),
      },
    ]);

    const exact = finalizeMechanicsEndWave(
      second.value.world,
      second.value.context.endWave.wave
    );
    expect(exact.status).toBe("applied");
    const mismatched = structuredClone(second.value.context.endWave.wave);
    const candidate = mismatched.candidates[0];
    if (!candidate) throw new Error("candidate fixture");
    Reflect.set(candidate, "causes", [{ kind: "concentration-broken" }]);
    expect(finalizeMechanicsEndWave(second.value.world, mismatched)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });
  });

  it.each([
    [
      "occurrence",
      (state: CharacterMaterialState) => {
        state.nextOccurrenceOrdinal -= 1;
      },
    ],
    [
      "entity",
      (state: CharacterMaterialState) => {
        state.nextEntityOrdinal -= 1;
      },
    ],
    [
      "inventory",
      (state: CharacterMaterialState) => {
        state.nextInventoryOrdinal -= 1;
      },
    ],
    [
      "encounter",
      (state: CharacterMaterialState) => {
        state.nextEncounterEpoch -= 1;
      },
    ],
    [
      "encounter participant",
      (state: CharacterMaterialState) => {
        if (!state.encounter) throw new Error("encounter fixture");
        state.encounter.nextCombatantOrdinal -= 1;
      },
    ],
  ] as const)("rejects a decrease of the %s allocation high-water", (_, mutate) => {
    const hero = character();
    hero.nextOccurrenceOrdinal = 5;
    hero.nextEntityOrdinal = 5;
    hero.nextInventoryOrdinal = 5;
    hero.nextEncounterEpoch = 5;
    hero.entities = { ally: monster() };
    hero.encounter = turnsEncounter(1);
    hero.encounter.nextCombatantOrdinal = 5;
    hero.clockBinding.encounter = { material: HERO, epoch: 1 };
    const begun = beginMechanicsCausalState(world(hero));
    if (!begun.ok) throw new Error(`causal entry fixture: ${begun.reason}`);
    const candidate = structuredClone(begun.value.world);
    const document = candidate.documents.find(
      (entry) =>
        entry.kind === "character" &&
        materialRefKey(entry.material) === materialRefKey(HERO)
    );
    if (document?.kind !== "character") throw new Error("character fixture");
    mutate(document.state);

    expect(rebaseMechanicsCausalState(candidate, begun.value)).toEqual({
      ok: false,
      reason: "invalid-end-wave",
    });
  });

  it.each([
    [
      "occurrence",
      (state: SharedMaterialState) => {
        state.nextOccurrenceOrdinal -= 1;
      },
    ],
    [
      "entity",
      (state: SharedMaterialState) => {
        state.nextEntityOrdinal -= 1;
      },
    ],
    [
      "encounter",
      (state: SharedMaterialState) => {
        state.nextEncounterEpoch -= 1;
      },
    ],
    [
      "encounter participant",
      (state: SharedMaterialState) => {
        if (!state.encounter) throw new Error("encounter fixture");
        state.encounter.nextCombatantOrdinal -= 1;
      },
    ],
  ] as const)("rejects a shared-document decrease of the %s high-water", (_, mutate) => {
    const hero = character();
    hero.clockBinding = {
      encounter: { material: CAMPAIGN, epoch: 1 },
      timeline: { material: CAMPAIGN, epoch: 0 },
    };
    const campaign = shared();
    campaign.nextOccurrenceOrdinal = 5;
    campaign.nextEntityOrdinal = 5;
    campaign.nextEncounterEpoch = 5;
    campaign.encounter = {
      currentCombatantId: null,
      epoch: 1,
      nextCombatantOrdinal: 5,
      order: [],
      participants: {
        hero: {
          combatant: self(),
          economy: betweenTurns("shared-hero-wait"),
          initiativeRoll: null,
          ordinal: 1,
          skipped: false,
        },
      },
      phase: "initiative",
      round: 1,
    };
    const begun = beginMechanicsCausalState(world(hero, campaign));
    if (!begun.ok) throw new Error(`causal entry fixture: ${begun.reason}`);
    const candidate = structuredClone(begun.value.world);
    const document = candidate.documents.find(
      (entry) =>
        entry.kind === "shared" &&
        materialRefKey(entry.material) === materialRefKey(CAMPAIGN)
    );
    if (document?.kind !== "shared") throw new Error("shared fixture");
    mutate(document.state);

    expect(rebaseMechanicsCausalState(candidate, begun.value)).toEqual({
      ok: false,
      reason: "invalid-end-wave",
    });
  });

  it("rejects recreating an idle encounter at a historical epoch", () => {
    const hero = character();
    hero.nextEncounterEpoch = 5;
    hero.nextEntityOrdinal = 2;
    hero.entities = { ally: monster() };
    const begun = beginMechanicsCausalState(world(hero));
    if (!begun.ok) throw new Error(`causal entry fixture: ${begun.reason}`);
    const candidate = structuredClone(begun.value.world);
    const document = candidate.documents.find(
      (entry) =>
        entry.kind === "character" &&
        materialRefKey(entry.material) === materialRefKey(HERO)
    );
    if (document?.kind !== "character") throw new Error("character fixture");
    document.state.encounter = turnsEncounter(1);
    document.state.nextEncounterEpoch = 6;
    document.state.clockBinding.encounter = { material: HERO, epoch: 1 };

    expect(rebaseMechanicsCausalState(candidate, begun.value)).toEqual({
      ok: false,
      reason: "invalid-end-wave",
    });
  });

  it("rejects swapping one live encounter generation for another", () => {
    const hero = character();
    hero.nextEncounterEpoch = 5;
    hero.nextEntityOrdinal = 2;
    hero.entities = { ally: monster() };
    hero.encounter = turnsEncounter(1);
    hero.clockBinding.encounter = { material: HERO, epoch: 1 };
    const begun = beginMechanicsCausalState(world(hero));
    if (!begun.ok) throw new Error(`causal entry fixture: ${begun.reason}`);
    const candidate = structuredClone(begun.value.world);
    const document = candidate.documents.find(
      (entry) =>
        entry.kind === "character" &&
        materialRefKey(entry.material) === materialRefKey(HERO)
    );
    if (document?.kind !== "character") throw new Error("character fixture");
    document.state.encounter = turnsEncounter(2);
    document.state.clockBinding.encounter = { material: HERO, epoch: 2 };

    expect(rebaseMechanicsCausalState(candidate, begun.value)).toEqual({
      ok: false,
      reason: "invalid-end-wave",
    });
  });

  it("treats a reused entity id as a different physical generation", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(hero, "watcher", {
      endRules: [],
      fact: { key: "watcher", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: { entityId: "ally", material: CAMPAIGN, ordinal: 1 },
    });
    const campaign = shared();
    campaign.nextEntityOrdinal = 2;
    campaign.entities = { ally: monster(1) };
    const initial = world(hero, campaign);
    expect(parseMechanicsWorld(initial)).toMatchObject({ ok: true });

    const replacement = structuredClone(initial);
    const replacementCampaign = replacement.documents.find(
      (document) => document.kind === "shared"
    );
    if (replacementCampaign?.kind !== "shared") throw new Error("campaign fixture");
    replacementCampaign.state.entities.ally = monster(2);
    replacementCampaign.state.nextEntityOrdinal = 3;
    expect(parseMechanicsWorld(replacement)).toMatchObject({
      ok: false,
      reason: "missing-reference",
    });
    const discovery = discoverMechanicsEndWave(replacement);
    expect(discovery).toMatchObject({
      status: "discovered",
      wave: {
        candidates: [
          {
            causes: [
              {
                entity: { entityId: "ally", material: CAMPAIGN, ordinal: 1 },
                kind: "live-entity-missing",
              },
            ],
          },
        ],
      },
    });
  });

  it("resolves cross-document controllers by exact generation without requiring presence", () => {
    const hero = character();
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      summon: {
        ...monster(),
        controller: { entityId: "ally", material: CAMPAIGN, ordinal: 1 },
      },
    };
    const campaign = shared();
    campaign.nextEntityOrdinal = 2;
    campaign.entities = {
      ally: { ...monster(), availability: "dismissed" },
    };

    expect(parseMechanicsWorld(world(hero, campaign)).ok).toBe(true);

    const stale = structuredClone(hero);
    const summon = stale.entities.summon;
    if (!summon) throw new Error("summon fixture");
    summon.controller = { entityId: "ally", material: CAMPAIGN, ordinal: 2 };
    expect(parseMechanicsWorld(world(stale, campaign))).toEqual({
      ok: false,
      reason: "missing-reference",
    });

    const missing = structuredClone(campaign);
    missing.entities = {};
    expect(parseMechanicsWorld(world(hero, missing))).toEqual({
      ok: false,
      reason: "missing-reference",
    });
  });

  it("rejects one physical combatant participating in two encounter coordinators", () => {
    const hero = character();
    hero.clockBinding = {
      encounter: { epoch: 1, material: CAMPAIGN },
      timeline: { epoch: 0, material: CAMPAIGN },
    };
    const first = shared();
    first.nextEncounterEpoch = 2;
    first.encounter = {
      currentCombatantId: null,
      epoch: 1,
      nextCombatantOrdinal: 2,
      order: [],
      participants: {
        hero: {
          combatant: self(),
          economy: betweenTurns("first-initiative"),
          initiativeRoll: null,
          ordinal: 1,
          skipped: false,
        },
      },
      phase: "initiative",
      round: 1,
    };
    const second = shared();
    second.nextEncounterEpoch = 2;
    second.encounter = {
      ...structuredClone(first.encounter),
      participants: {
        hero: {
          ...structuredClone(first.encounter.participants.hero),
          economy: betweenTurns("second-initiative"),
        },
      },
    };

    expect(
      parseMechanicsWorld(
        world(hero, first, [{ kind: "shared", material: OTHER_CAMPAIGN, state: second }])
      )
    ).toEqual({ ok: false, reason: "duplicate-exclusive-state" });
  });

  it("rejects two physical generations owned by one material lifecycle", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(
      hero,
      "single-owner",
      {
        endRules: [],
        kind: "material-lifecycle",
        parentId: "root",
        target: self(),
      },
      "create-inventory"
    );
    const owner = generation(hero, HERO, "single-owner");
    hero.nextInventoryOrdinal = 3;
    hero.inventory = {
      first: item(owner),
      second: { ...item(owner), ordinal: 2 },
    };

    expect(parseMechanicsWorld(world(hero))).toEqual({
      ok: false,
      reason: "duplicate-lifecycle-owner",
    });
  });

  it("accepts an acyclic controller chain ending at a character root", () => {
    const hero = character();
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      summon: {
        ...monster(),
        controller: { entityId: "ally", material: CAMPAIGN, ordinal: 1 },
      },
    };
    const campaign = shared();
    campaign.nextEntityOrdinal = 2;
    campaign.entities = {
      ally: { ...monster(), controller: self() },
    };

    expect(parseMechanicsWorld(world(hero, campaign)).ok).toBe(true);
  });

  it("rejects a self controller cycle", () => {
    const hero = character();
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      summon: {
        ...monster(),
        controller: { entityId: "summon", material: HERO, ordinal: 1 },
      },
    };

    expect(parseMechanicsWorld(world(hero))).toEqual({
      ok: false,
      reason: "controller-cycle",
    });
  });

  it("rejects a local two-entity controller cycle", () => {
    const hero = character();
    hero.nextEntityOrdinal = 3;
    hero.entities = {
      first: {
        ...monster(1),
        controller: { entityId: "second", material: HERO, ordinal: 2 },
      },
      second: {
        ...monster(2),
        controller: { entityId: "first", material: HERO, ordinal: 1 },
      },
    };

    expect(parseMechanicsWorld(world(hero))).toEqual({
      ok: false,
      reason: "controller-cycle",
    });
  });

  it("rejects a cross-document controller cycle", () => {
    const hero = character();
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      summon: {
        ...monster(),
        controller: { entityId: "ally", material: CAMPAIGN, ordinal: 1 },
      },
    };
    const campaign = shared();
    campaign.nextEntityOrdinal = 2;
    campaign.entities = {
      ally: {
        ...monster(),
        controller: { entityId: "summon", material: HERO, ordinal: 1 },
      },
    };

    expect(parseMechanicsWorld(world(hero, campaign))).toEqual({
      ok: false,
      reason: "controller-cycle",
    });
  });

  it("keeps a dismissed entity's own lifecycle active while ordinary effects end", () => {
    let hero = addRoot(character(), HERO);
    const ally = { entityId: "ally", material: HERO, ordinal: 1 } as const;
    hero = addToState(hero, "ally-lifecycle", {
      endRules: [],
      kind: "material-lifecycle",
      parentId: "root",
      target: ally,
    });
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      ally: {
        ...monster(1),
        availability: "dismissed",
        ownerOccurrence: generation(hero, HERO, "ally-lifecycle"),
      },
    };

    const initial = world(hero);
    const parsed = parseMechanicsWorld(initial);
    if (!parsed.ok) throw new Error(parsed.reason);
    const discovery = discoverMechanicsEndWave(initial);
    expect(discovery.status).toBe("discovered");
    if (discovery.status !== "discovered") return;
    expect(discovery.wave.candidates).toEqual([]);

    const affectedHero = addToState(structuredClone(hero), "ally-effect", {
      endRules: [],
      fact: { key: "ally-effect", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: ally,
    });
    const affected = discoverMechanicsEndWave(world(affectedHero));
    expect(affected.status).toBe("discovered");
    if (affected.status !== "discovered") return;
    expect(affected.wave.candidates).toEqual([
      {
        causes: [{ entity: ally, kind: "live-entity-missing" }],
        occurrence: worldGeneration(affected.world, HERO, "ally-effect"),
      },
    ]);
  });

  it("requires an exact sorted closed document set and live cross-document refs", () => {
    let campaign = addRoot(shared(), CAMPAIGN);
    campaign = addToState(campaign, "blessing", {
      endRules: [],
      fact: { kind: "active-key", key: "blessed" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    expect(parseMechanicsWorld(world(character(), campaign)).ok).toBe(true);
    expect(
      parseMechanicsWorld({
        scope: CAMPAIGN,
        documents: [{ kind: "shared", material: CAMPAIGN, state: campaign }],
      })
    ).toMatchObject({ ok: false, reason: "missing-reference" });

    const valid = world(character(), campaign);
    expect(
      parseMechanicsWorld({ ...valid, documents: [...valid.documents].reverse() })
    ).toMatchObject({ ok: false, reason: "invalid-order" });
  });

  it("rejects worlds above the canonical document bound", () => {
    const document = world().documents[0];
    if (!document) throw new Error("document fixture");
    expect(
      parseMechanicsWorld({
        scope: document.material,
        documents: Array.from({ length: 257 }, () => document),
      })
    ).toEqual({ ok: false, reason: "invalid-shape" });
  });

  it("rejects completion document substitution", () => {
    const initial = world();
    const replacement = {
      kind: "character-play",
      uid: "other-user",
      characterId: "other-character",
    } as const satisfies CharacterMaterialRef;
    const begun = beginMechanicsBoundary(initial, {
      input: { clock: { material: CAMPAIGN, epoch: 0 }, phase: "dawn" },
      kind: "observe-day-phase",
    });
    if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
    const result = advanceMechanicsBoundary(begun.continuation, {
      continuation: canonicalFingerprint(begun.continuation),
      state: {
        ...begun.checkpoint.state,
        world: {
          scope: CAMPAIGN,
          documents: sorted([
            { kind: "character", material: replacement, state: character(replacement) },
            { kind: "shared", material: CAMPAIGN, state: shared() },
          ]),
        },
      },
    } as unknown as MechanicsBoundaryCompletion);

    expect(result).toMatchObject({ reason: "invalid-transition", status: "rejected" });
  });

  it("rejects stale epochs, double combat leases, and global exclusive-state duplicates", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(hero, "stale", {
      endRules: [
        {
          kind: "time-reached",
          clock: { material: HERO, epoch: 9 },
          elapsedSeconds: 20,
        },
      ],
      fact: { kind: "active-key", key: "stale" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    expect(parseMechanicsWorld(world(hero))).toMatchObject({
      ok: false,
      reason: "invalid-clock",
    });

    const leasedHero = character();
    leasedHero.nextEncounterEpoch = 2;
    leasedHero.encounter = turnsEncounter(1);
    leasedHero.nextEntityOrdinal = 2;
    leasedHero.entities = { ally: monster() };
    const campaign = shared();
    campaign.nextEncounterEpoch = 2;
    campaign.encounter = { epoch: 1, ...initiativeSeed(HERO) };
    leasedHero.clockBinding = {
      timeline: { material: CAMPAIGN, epoch: 0 },
      encounter: { material: CAMPAIGN, epoch: 1 },
    };
    expect(parseMechanicsWorld(world(leasedHero, campaign))).toMatchObject({
      ok: false,
      reason: "invalid-document",
    });

    let duplicateHero = addRoot(character(), HERO);
    duplicateHero = addToState(duplicateHero, "local", {
      endRules: [],
      kind: "concentration",
      parentId: "root",
      target: self(),
    });
    let duplicateCampaign = addRoot(shared(), CAMPAIGN);
    duplicateCampaign = addToState(duplicateCampaign, "remote", {
      endRules: [],
      kind: "concentration",
      parentId: "root",
      target: self(),
    });
    expect(parseMechanicsWorld(world(duplicateHero, duplicateCampaign))).toMatchObject({
      ok: false,
      reason: "duplicate-exclusive-state",
    });
  });

  it("closes Concentration from cross-document incapacitation and from death", () => {
    const concentrating = addToState(addRoot(character(), HERO), "focus", {
      endRules: [],
      kind: "concentration",
      parentId: "root",
      target: self(),
    });
    const campaign = addToState(addRoot(shared(), CAMPAIGN), "paralysis", {
      conditionId: "paralyzed",
      endRules: [],
      kind: "condition",
      parentId: "root",
      target: self(),
    });

    const concentratingWorld = world(concentrating, campaign);
    const concentrationWave = discoverMechanicsEndWave(concentratingWorld);
    expect(concentrationWave).toMatchObject({
      status: "discovered",
      wave: {
        candidates: [
          {
            causes: [{ kind: "concentration-broken" }],
            occurrence: worldGeneration(concentratingWorld, HERO, "focus"),
          },
        ],
      },
    });
    const incapacitated = finalizeDiscoveredWave(concentratingWorld);
    expect(incapacitated.status).toBe("applied");
    if (incapacitated.status !== "applied") return;
    const incapacitatedHero = incapacitated.world.documents.find(
      (document) => document.kind === "character"
    );
    const incapacitatingCampaign = incapacitated.world.documents.find(
      (document) => document.kind === "shared"
    );
    expect(incapacitatedHero?.state.occurrences).not.toHaveProperty("focus");
    expect(incapacitatingCampaign?.state.occurrences).toHaveProperty("paralysis");

    const deadHero = addToState(addRoot(character(), HERO), "focus", {
      endRules: [],
      kind: "concentration",
      parentId: "root",
      target: self(),
    });
    deadHero.vitals = {
      hitPoints: {
        current: 0,
        temporary: { current: 0, sourceOccurrence: null },
      },
      zeroHitPoints: { kind: "dead" },
    };
    const died = finalizeDiscoveredWave(world(deadHero));
    expect(died.status).toBe("applied");
    if (died.status !== "applied") return;
    expect(died.world.documents[0]?.state.occurrences).not.toHaveProperty("focus");
  });

  it("advances exactly six seconds only when a completed turn wraps the round", () => {
    const hero = character();
    hero.nextEntityOrdinal = 2;
    hero.entities = { ally: monster() };
    hero.nextEncounterEpoch = 2;
    hero.encounter = turnsEncounter(1);
    const heroParticipant = hero.encounter.participants.hero;
    const allyParticipant = hero.encounter.participants.ally;
    if (!heroParticipant || !allyParticipant) throw new Error("participant fixture");
    heroParticipant.economy = {
      ...heroParticipant.economy,
      actions: [
        ...heroParticipant.economy.actions,
        {
          claimId: "ready-action",
          kind: "ready",
          preparationId: "prepared-program",
        },
      ],
    };
    allyParticipant.economy = {
      ...allyParticipant.economy,
      reactions: [
        ...allyParticipant.economy.reactions,
        {
          claimId: "old-reaction",
          kind: "program",
          requirementId: "old-reaction-program",
        },
      ],
    };
    hero.clockBinding.encounter = { material: HERO, epoch: 1 };
    const localWorld = {
      scope: HERO,
      documents: [{ kind: "character", material: HERO, state: hero }],
    } as const;
    const first = applyBoundary(localWorld, {
      excludeCurrent: null,
      kind: "complete-turn",
      material: HERO,
    });
    expect(first.status).toBe("applied");
    if (first.status !== "applied") return;
    const afterFirst = first.world.documents[0]?.state;
    expect(afterFirst?.timeline.elapsedSeconds).toBe(0);
    expect(afterFirst?.encounter?.currentCombatantId).toBe("ally");
    expect(afterFirst?.encounter?.participants.hero?.economy).toMatchObject({
      actions: [
        {
          claimId: "ready-action",
          kind: "ready",
          preparationId: "prepared-program",
        },
      ],
      phase: "between-turns",
    });
    expect(afterFirst?.encounter?.participants.ally?.economy).toMatchObject({
      actions: [],
      phase: "own-turn",
      reactions: [],
    });

    const beforeSecond = structuredClone(first.world);
    const heroEconomy = beforeSecond.documents[0]?.state.encounter?.participants.hero;
    if (!heroEconomy) throw new Error("hero economy fixture missing");
    heroEconomy.economy = {
      ...heroEconomy.economy,
      reactions: [
        ...heroEconomy.economy.reactions,
        {
          claimId: "ready-reaction",
          kind: "ready",
          preparationId: "prepared-program",
          readyActionClaimId: "ready-action",
        },
      ],
    };
    const second = applyBoundary(beforeSecond, {
      excludeCurrent: null,
      kind: "complete-turn",
      material: HERO,
    });
    expect(second.status).toBe("applied");
    if (second.status !== "applied") return;
    const afterSecond = second.world.documents[0]?.state;
    expect(afterSecond?.timeline.elapsedSeconds).toBe(6);
    expect(afterSecond?.encounter?.round).toBe(2);
    expect(afterSecond?.encounter?.currentCombatantId).toBe("hero");
    expect(afterSecond?.encounter?.participants.hero?.economy).toMatchObject({
      actions: [],
      phase: "own-turn",
      reactions: [],
    });
    expect(afterSecond).toMatchObject({ epoch: 0, revision: 0, actions: [] });
  });

  it("selects the next live successor when end-turn closure removes the current combatant", () => {
    const local = currentOwnedSummonWorld();
    const checkpoints: MechanicsBoundaryCheckpoint[] = [];
    const result = applyBoundary(
      local,
      {
        excludeCurrent: null,
        kind: "complete-turn",
        material: HERO,
      },
      checkpoints
    );

    expect(result.status === "rejected" ? result.reason : result.status).toBe("applied");
    if (result.status !== "applied") return;
    const encounter = result.world.documents[0]?.state.encounter;
    expect(encounter?.order).toEqual(["hero", "ally"]);
    expect(encounter?.currentCombatantId).toBe("ally");
    expect(encounter?.participants.ally?.economy.phase).toBe("own-turn");
    expect(result.world.documents[0]?.state.timeline.elapsedSeconds).toBe(0);
    expect(result.world.documents[0]?.state.entities).not.toHaveProperty("summon");
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints.at(-1)?.wave.request.boundaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          combatant: { material: HERO, entityId: "summon", ordinal: 2 },
          kind: "turn-boundary",
          phase: "end",
        }),
        expect.objectContaining({
          combatant: { material: HERO, entityId: "ally", ordinal: 1 },
          kind: "turn-boundary",
          phase: "start",
        }),
      ])
    );
  });

  it("requires a turn boundary before ordinary cleanup removes the current combatant", () => {
    const local = currentOwnedSummonWorld();
    const result = finalizeDiscoveredWave(local, {
      boundaries: [],
      endRequests: [worldGeneration(local, HERO, "summon")],
      inventorySourceLeases: [],
    });
    expect(result).toMatchObject({
      reason: "encounter-conflict",
      status: "rejected",
    });
  });

  it.each([
    {
      command: {
        clock: { material: HERO, epoch: 0 },
        elapsedSeconds: 6,
        kind: "advance-time",
      },
      endRules: [
        {
          clock: { material: HERO, epoch: 0 },
          elapsedSeconds: 6,
          kind: "time-reached",
        },
      ],
      name: "advance-time",
    },
    {
      command: {
        input: { clock: { material: HERO, epoch: 0 }, phase: "dawn" },
        kind: "observe-day-phase",
      },
      endRules: [
        { clock: { material: HERO, epoch: 0 }, kind: "day-phase", phase: "dawn" },
      ],
      name: "dawn",
    },
    {
      command: {
        input: {
          clock: { material: HERO, epoch: 0 },
          combatant: { material: HERO, entityId: "summon", ordinal: 2 },
          rest: "long",
        },
        kind: "complete-rest",
      },
      endRules: [
        {
          clock: { material: HERO, epoch: 0 },
          combatant: { material: HERO, entityId: "summon", ordinal: 2 },
          kind: "rest-completed",
          rest: "long",
        },
      ],
      name: "rest",
    },
  ] as const)(
    "does not let a historical $name boundary remove the current combatant",
    ({ command, endRules }) => {
      const initial = currentOwnedSummonWorld(endRules);
      const result = applyBoundary(initial, command);
      expect(result).toMatchObject({
        reason: "encounter-conflict",
        status: "rejected",
      });
      expect(initial.documents[0]?.state.encounter?.currentCombatantId).toBe("summon");
      expect(initial.documents[0]?.state.entities).toHaveProperty("summon");
    }
  );

  it("continues start-turn selection when an occurrence-owned combatant expires", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(hero, "vanishing-ally", {
      endRules: [
        {
          clock: { material: HERO, epoch: 1 },
          combatant: { material: HERO, entityId: "ally", ordinal: 1 },
          kind: "turn-boundary",
          phase: "start",
          round: 1,
        },
      ],
      kind: "material-lifecycle",
      parentId: "root",
      target: { material: HERO, entityId: "ally", ordinal: 1 },
    });
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      ally: {
        ...monster(),
        ownerOccurrence: generation(hero, HERO, "vanishing-ally"),
      },
    };
    hero.nextEncounterEpoch = 2;
    hero.encounter = turnsEncounter(1);
    hero.clockBinding.encounter = { material: HERO, epoch: 1 };
    const checkpoints: MechanicsBoundaryCheckpoint[] = [];
    const result = applyBoundary(
      {
        scope: HERO,
        documents: [{ kind: "character", material: HERO, state: hero }],
      },
      { excludeCurrent: null, kind: "complete-turn", material: HERO },
      checkpoints
    );

    expect(result.status === "rejected" ? result.reason : result.status).toBe("applied");
    if (result.status !== "applied") return;
    const observed = new Set<string>();
    expect(
      checkpoints.map((checkpoint) => {
        const boundary = checkpoint.wave.request.boundaries.find((candidate) => {
          const key = JSON.stringify(candidate);
          if (observed.has(key)) return false;
          observed.add(key);
          return true;
        });
        return boundary;
      })
    ).toEqual([
      {
        clock: { material: HERO, epoch: 1 },
        combatant: self(),
        kind: "turn-boundary",
        phase: "end",
        round: 1,
      },
      {
        clock: { material: HERO, epoch: 1 },
        combatant: { material: HERO, entityId: "ally", ordinal: 1 },
        kind: "turn-boundary",
        phase: "start",
        round: 1,
      },
      {
        clock: { material: HERO, epoch: 0 },
        elapsedSeconds: 6,
        kind: "time-reached",
      },
      {
        clock: { material: HERO, epoch: 1 },
        combatant: self(),
        kind: "turn-boundary",
        phase: "start",
        round: 2,
      },
    ]);
    const encounter = result.world.documents[0]?.state.encounter;
    expect(encounter?.order).toEqual(["hero"]);
    expect(encounter?.round).toBe(2);
    expect(encounter?.currentCombatantId).toBe("hero");
    expect(encounter?.participants.hero?.economy.phase).toBe("own-turn");
    expect(result.world.documents[0]?.state.timeline.elapsedSeconds).toBe(6);
  });

  it("uses absolute deadlines and keeps rest and day observations distinct", () => {
    let hero = addRoot(character(), HERO);
    const base = {
      parentId: "root",
      target: self(),
    };
    hero = addToState(hero, "deadline", {
      ...base,
      kind: "standing",
      fact: { kind: "active-key", key: "deadline" },
      endRules: [
        {
          kind: "time-reached",
          clock: { material: HERO, epoch: 0 },
          elapsedSeconds: 12,
        },
      ],
    });
    hero = addToState(hero, "rest", {
      ...base,
      kind: "standing",
      fact: { kind: "active-key", key: "rest" },
      endRules: [
        {
          kind: "rest-completed",
          clock: { material: HERO, epoch: 0 },
          combatant: self(),
          rest: "long",
        },
      ],
    });
    hero = addToState(hero, "dawn", {
      ...base,
      kind: "standing",
      fact: { kind: "active-key", key: "dawn" },
      endRules: [
        {
          kind: "day-phase",
          clock: { material: HERO, epoch: 0 },
          phase: "dawn",
        },
      ],
    });
    const local = {
      scope: HERO,
      documents: [{ kind: "character", material: HERO, state: hero }],
    } as const;

    const first = applyBoundary(local, {
      clock: { material: HERO, epoch: 0 },
      elapsedSeconds: 6,
      kind: "advance-time",
    });
    expect(first.status).toBe("applied");
    if (first.status !== "applied") return;
    expect(first.world.documents[0]?.state.occurrences).toHaveProperty("deadline");
    const rest = applyBoundary(first.world, {
      input: {
        clock: { material: HERO, epoch: 0 },
        combatant: self(),
        rest: "long",
      },
      kind: "complete-rest",
    });
    expect(rest.status).toBe("applied");
    if (rest.status !== "applied") return;
    expect(rest.world.documents[0]?.state.occurrences).not.toHaveProperty("rest");
    expect(rest.world.documents[0]?.state.occurrences).toHaveProperty("dawn");
    const dawn = applyBoundary(rest.world, {
      input: { clock: { material: HERO, epoch: 0 }, phase: "dawn" },
      kind: "observe-day-phase",
    });
    expect(dawn.status).toBe("applied");
    if (dawn.status !== "applied") return;
    expect(dawn.world.documents[0]?.state.occurrences).not.toHaveProperty("dawn");
    const deadline = applyBoundary(dawn.world, {
      clock: { material: HERO, epoch: 0 },
      elapsedSeconds: 6,
      kind: "advance-time",
    });
    expect(deadline.status === "rejected" ? deadline.reason : deadline.status).toBe(
      "applied"
    );
    if (deadline.status !== "applied") return;
    expect(deadline.world.documents[0]?.state.occurrences).not.toHaveProperty("deadline");
  });

  it.each(["epoch", "revision"] as const)(
    "rejects completion mutation of protected journal %s",
    (field) => {
      const initial = world();
      const begun = beginMechanicsBoundary(initial, {
        input: {
          clock: { material: HERO, epoch: 0 },
          combatant: self(),
          rest: "long",
        },
        kind: "complete-rest",
      });
      if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
      const mutated = structuredClone(begun.checkpoint.state);
      const hero = mutated.world.documents.find(
        (document) => document.kind === "character"
      );
      if (hero?.kind !== "character") throw new Error("character fixture");
      if (field === "epoch") hero.state.epoch = 1;
      else hero.state.revision = 1;
      const result = advanceMechanicsBoundary(begun.continuation, {
        continuation: canonicalFingerprint(begun.continuation),
        state: mutated,
      } as unknown as MechanicsBoundaryCompletion);

      expect(result).toMatchObject({
        reason: "invalid-transition",
        status: "rejected",
      });
    }
  );

  it("rejects a completion bound to another checkpoint", () => {
    const begun = beginMechanicsBoundary(world(), {
      input: { clock: { material: CAMPAIGN, epoch: 0 }, phase: "dawn" },
      kind: "observe-day-phase",
    });
    if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
    const result = advanceMechanicsBoundary(begun.continuation, {
      continuation: canonicalFingerprint({
        ...begun.continuation,
        checkpoint: { ...begun.checkpoint, ordinal: 1 },
      }),
      state: begun.checkpoint.state,
    } as unknown as MechanicsBoundaryCompletion);

    expect(result).toMatchObject({ reason: "invalid-transition", status: "rejected" });
  });

  it("rejects command and cursor substitution after a checkpoint", () => {
    const hero = character();
    hero.nextEntityOrdinal = 2;
    hero.entities = { ally: monster() };
    hero.nextEncounterEpoch = 2;
    hero.encounter = turnsEncounter(1);
    hero.clockBinding.encounter = { material: HERO, epoch: 1 };
    const begun = beginMechanicsBoundary(
      {
        scope: HERO,
        documents: [{ kind: "character", material: HERO, state: hero }],
      },
      { excludeCurrent: null, kind: "complete-turn", material: HERO }
    );
    if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
    const completion = {
      continuation: canonicalFingerprint(begun.continuation),
      state: begun.checkpoint.state,
    } as unknown as MechanicsBoundaryCompletion;
    if (begun.continuation.cursor.kind !== "complete-turn") {
      throw new Error("cursor fixture");
    }
    const forged = {
      ...begun.continuation,
      cursor: { ...begun.continuation.cursor, scanOffset: 2 },
    };

    expect(
      advanceMechanicsBoundary(forged as unknown as typeof begun.continuation, completion)
    ).toMatchObject({ reason: "invalid-transition", status: "rejected" });
  });

  it("fails a malformed completion closed without dereferencing it", () => {
    const begun = beginMechanicsBoundary(world(), {
      input: { clock: { material: CAMPAIGN, epoch: 0 }, phase: "dawn" },
      kind: "observe-day-phase",
    });
    if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
    expect(
      advanceMechanicsBoundary(
        begun.continuation,
        null as unknown as MechanicsBoundaryCompletion
      )
    ).toEqual({ reason: "invalid-transition", status: "rejected" });
  });

  it("carries an empty-wave boundary into event-created ending discovery", () => {
    const initial = world();
    const begun = beginMechanicsBoundary(initial, {
      input: { clock: { material: CAMPAIGN, epoch: 0 }, phase: "dawn" },
      kind: "observe-day-phase",
    });
    if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
    expect(begun.checkpoint.wave.candidates).toEqual([]);
    expect(begun.checkpoint.state.context.request.boundaries).toEqual([
      { clock: { material: CAMPAIGN, epoch: 0 }, kind: "day-phase", phase: "dawn" },
    ]);

    const mutated = structuredClone(begun.checkpoint.state.world);
    const campaign = mutated.documents.find((document) => document.kind === "shared");
    if (campaign?.kind !== "shared") throw new Error("campaign fixture");
    campaign.state = addRoot(campaign.state, CAMPAIGN);
    campaign.state = addToState(campaign.state, "dawn-child", {
      endRules: [
        {
          clock: { material: CAMPAIGN, epoch: 0 },
          kind: "day-phase",
          phase: "dawn",
        },
      ],
      fact: { key: "dawn-child", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    const rebased = rebaseMechanicsCausalState(mutated, begun.checkpoint.state);
    if (!rebased.ok) throw new Error(`rebase fixture: ${rebased.reason}`);
    expect(rebased.value.context.endWave?.wave.candidates).toHaveLength(1);
    const result = advanceMechanicsBoundary(begun.continuation, {
      continuation: canonicalFingerprint(begun.continuation),
      state: rebased.value,
    } as unknown as MechanicsBoundaryCompletion);

    expect(result.status).toBe("checkpoint");
    if (result.status !== "checkpoint") return;
    expect(result.checkpoint.wave.candidates).toHaveLength(1);
    const settled = advanceMechanicsBoundary(result.continuation, {
      continuation: canonicalFingerprint(result.continuation),
      state: result.checkpoint.state,
    } as unknown as MechanicsBoundaryCompletion);
    expect(settled.status).toBe("complete");
    if (settled.status !== "complete") return;
    const finalCampaign = settled.world.documents.find(
      (document) => document.kind === "shared"
    );
    expect(finalCampaign?.state.occurrences).not.toHaveProperty("dawn-child");
  });

  it("turns a naturally extended nonempty wave into a second checkpoint", () => {
    let campaign = addRoot(shared(), CAMPAIGN);
    campaign = addToState(campaign, "first-dawn-child", {
      endRules: [
        {
          clock: { material: CAMPAIGN, epoch: 0 },
          kind: "day-phase",
          phase: "dawn",
        },
      ],
      fact: { key: "first-dawn-child", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    const begun = beginMechanicsBoundary(world(character(), campaign), {
      input: { clock: { material: CAMPAIGN, epoch: 0 }, phase: "dawn" },
      kind: "observe-day-phase",
    });
    if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
    expect(begun.checkpoint.wave.candidates).toHaveLength(1);

    const mutated = structuredClone(begun.checkpoint.state.world);
    const currentCampaign = mutated.documents.find(
      (document) => document.kind === "shared"
    );
    if (currentCampaign?.kind !== "shared") throw new Error("campaign fixture");
    currentCampaign.state = addToState(currentCampaign.state, "second-dawn-child", {
      endRules: [
        {
          clock: { material: CAMPAIGN, epoch: 0 },
          kind: "day-phase",
          phase: "dawn",
        },
      ],
      fact: { key: "second-dawn-child", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    const rebased = rebaseMechanicsCausalState(mutated, begun.checkpoint.state);
    if (!rebased.ok) throw new Error(`rebase fixture: ${rebased.reason}`);
    expect(rebased.value.context.endWave?.wave.candidates).toHaveLength(2);

    const extended = advanceMechanicsBoundary(begun.continuation, {
      continuation: canonicalFingerprint(begun.continuation),
      state: rebased.value,
    } as unknown as MechanicsBoundaryCompletion);
    expect(extended.status).toBe("checkpoint");
    if (extended.status !== "checkpoint") return;
    expect(extended.checkpoint.wave.candidates).toHaveLength(2);

    const settled = advanceMechanicsBoundary(extended.continuation, {
      continuation: canonicalFingerprint(extended.continuation),
      state: extended.checkpoint.state,
    } as unknown as MechanicsBoundaryCompletion);
    expect(settled.status).toBe("complete");
    if (settled.status !== "complete") return;
    const finalCampaign = settled.world.documents.find(
      (document) => document.kind === "shared"
    );
    expect(finalCampaign?.state.occurrences).not.toHaveProperty("first-dawn-child");
    expect(finalCampaign?.state.occurrences).not.toHaveProperty("second-dawn-child");
  });

  it("turns a completion-added end request into a second checkpoint", () => {
    const initial = world(addRoot(character(), HERO));
    const begun = beginMechanicsBoundary(initial, {
      input: { clock: { material: CAMPAIGN, epoch: 0 }, phase: "dawn" },
      kind: "observe-day-phase",
    });
    if (begun.status !== "checkpoint") throw new Error("checkpoint fixture");
    const requested = discoverMechanicsEndWave(begun.checkpoint.state.world, {
      boundaries: begun.checkpoint.state.context.request.boundaries,
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    if (requested.status !== "discovered") throw new Error("request fixture");
    const latched = latchMechanicsEndWave(requested.world, requested.wave);
    if (latched.status === "rejected") throw new Error("latch fixture");
    const current = discoverMechanicsEndWave(latched.world, requested.wave.request);
    if (current.status !== "discovered") throw new Error("current fixture");
    const completionState = {
      context: {
        endWave: { wave: current.wave, world: current.world },
        request: current.wave.request,
      },
      world: current.world,
    } as unknown as MechanicsCausalState;
    const next = advanceMechanicsBoundary(begun.continuation, {
      continuation: canonicalFingerprint(begun.continuation),
      state: completionState,
    } as unknown as MechanicsBoundaryCompletion);

    expect(next.status === "rejected" ? next.reason : next.status).toBe("checkpoint");
    if (next.status !== "checkpoint") return;
    expect(next.checkpoint.wave.request.endRequests).toEqual([
      worldGeneration(initial, HERO, "root"),
    ]);
    const settled = advanceMechanicsBoundary(next.continuation, {
      continuation: canonicalFingerprint(next.continuation),
      state: next.checkpoint.state,
    } as unknown as MechanicsBoundaryCompletion);
    expect(settled.status).toBe("complete");
    if (settled.status !== "complete") return;
    expect(settled.world.documents[0]?.state.occurrences).not.toHaveProperty("root");
  });

  it("rebases an eight-hour effect local to shared and back without freezing its lifetime", () => {
    let hero = addRoot(character(), HERO);
    hero.timeline.elapsedSeconds = 100;
    hero.clockBinding.timeline = { material: HERO, epoch: 0 };
    hero = addToState(hero, "mage-armor", {
      kind: "standing",
      parentId: "root",
      target: self(),
      fact: { kind: "active-key", key: "mage-armor" },
      endRules: [
        {
          kind: "time-reached",
          clock: { material: HERO, epoch: 0 },
          elapsedSeconds: 28_900,
        },
      ],
    });
    const campaign = shared();
    campaign.timeline.elapsedSeconds = 1_000;
    const start = applyBoundary(world(hero, campaign), {
      kind: "start-encounter",
      material: CAMPAIGN,
      seed: initiativeSeed(HERO),
    });
    expect(start.status).toBe("applied");
    if (start.status !== "applied") return;
    const leasedHero = start.world.documents.find(
      (document) => document.kind === "character"
    );
    const leasedRule = leasedHero?.state.occurrences["mage-armor"]?.endRules[0];
    expect(leasedRule).toEqual({
      kind: "time-reached",
      clock: { material: CAMPAIGN, epoch: 0 },
      elapsedSeconds: 29_800,
    });

    const advanced = applyBoundary(start.world, {
      clock: { material: CAMPAIGN, epoch: 0 },
      elapsedSeconds: 600,
      kind: "advance-time",
    });
    expect(advanced.status).toBe("applied");
    if (advanced.status !== "applied") return;
    const end = applyBoundary(advanced.world, {
      kind: "end-encounter",
      material: CAMPAIGN,
    });
    expect(end.status).toBe("applied");
    if (end.status !== "applied") return;
    const detachedHero = end.world.documents.find(
      (document) => document.kind === "character"
    );
    const detachedRule = detachedHero?.state.occurrences["mage-armor"]?.endRules[0];
    expect(detachedRule).toEqual({
      kind: "time-reached",
      clock: { material: HERO, epoch: 0 },
      elapsedSeconds: 28_300,
    });
    if (detachedHero?.kind === "character") {
      expect(detachedHero.state.clockBinding).toEqual({
        timeline: { material: HERO, epoch: 0 },
        encounter: null,
      });
    }
  });

  it("keeps a finalized local combat boundary cumulative while starting shared combat", () => {
    const hero = character();
    hero.nextEntityOrdinal = 2;
    hero.entities = { ally: monster() };
    hero.nextEncounterEpoch = 2;
    hero.encounter = turnsEncounter(1);
    hero.clockBinding.encounter = { material: HERO, epoch: 1 };
    const checkpoints: MechanicsBoundaryCheckpoint[] = [];
    const result = applyBoundary(
      world(hero),
      {
        kind: "start-encounter",
        material: CAMPAIGN,
        seed: initiativeSeed(HERO),
      },
      checkpoints
    );

    expect(result.status).toBe("applied");
    expect(
      checkpoints
        .at(-1)
        ?.wave.request.boundaries.some(
          (boundary) =>
            boundary.kind === "combat-end" &&
            materialRefKey(boundary.clock.material) === materialRefKey(HERO) &&
            boundary.clock.epoch === 1
        )
    ).toBe(true);
  });

  it("fails a clock handoff closed when its source deadline is already due", () => {
    let hero = addRoot(character(), HERO);
    hero.timeline.elapsedSeconds = 100;
    hero = addToState(hero, "overdue", {
      endRules: [
        {
          clock: { material: HERO, epoch: 0 },
          elapsedSeconds: 100,
          kind: "time-reached",
        },
      ],
      fact: { key: "overdue", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    const checkpoints: MechanicsBoundaryCheckpoint[] = [];
    const result = applyBoundary(
      world(hero),
      {
        kind: "start-encounter",
        material: CAMPAIGN,
        seed: initiativeSeed(HERO),
      },
      checkpoints
    );

    expect(result).toMatchObject({ reason: "invalid-world", status: "rejected" });
    expect(checkpoints).toEqual([]);
  });

  it("closes cross-document dependencies, owned material, THP, entities and leases", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(hero, "child", {
      endRules: [],
      kind: "material-lifecycle",
      parentId: "root",
      target: { material: CAMPAIGN, entityId: "summon", ordinal: 1 },
    });
    hero = addToState(
      hero,
      "material-owner",
      {
        endRules: [],
        kind: "material-lifecycle",
        parentId: "root",
        target: self(),
      },
      "create-inventory"
    );
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      blade: item(generation(hero, HERO, "material-owner")),
    };
    Reflect.set(hero.vitals.hitPoints, "temporary", {
      current: 5,
      sourceOccurrence: generation(hero, HERO, "material-owner"),
    });
    const campaign = shared();
    campaign.nextEntityOrdinal = 2;
    campaign.entities = {
      summon: {
        ...monster(),
        ownerOccurrence: generation(hero, HERO, "child"),
      },
    };
    campaign.nextEncounterEpoch = 2;
    campaign.encounter = {
      epoch: 1,
      nextCombatantOrdinal: 3,
      participants: {
        hero: {
          ordinal: 1,
          combatant: self(),
          economy: betweenTurns("hero-pending"),
          initiativeRoll: null,
          skipped: false,
        },
        summon: {
          ordinal: 2,
          combatant: { material: CAMPAIGN, entityId: "summon", ordinal: 1 },
          economy: betweenTurns("summon-pending"),
          initiativeRoll: null,
          skipped: false,
        },
      },
      phase: "initiative",
      round: 1,
      order: [],
      currentCombatantId: null,
    };
    hero.clockBinding = {
      timeline: { material: CAMPAIGN, epoch: 0 },
      encounter: { material: CAMPAIGN, epoch: 1 },
    };
    const initial = world(hero, campaign);
    const closed = finalizeDiscoveredWave(initial, {
      boundaries: [],
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    expect(closed.status === "rejected" ? closed.reason : closed.status).toBe("applied");
    if (closed.status !== "applied") return;
    const closedHero = closed.world.documents.find(
      (document) => document.kind === "character"
    );
    const closedShared = closed.world.documents.find(
      (document) => document.kind === "shared"
    );
    expect(closedHero?.state.occurrences).toEqual({});
    if (closedHero?.kind === "character") {
      expect(closedHero.state.inventory).toEqual({});
      expect(closedHero.state.vitals.hitPoints.temporary).toEqual({
        current: 0,
        sourceOccurrence: null,
      });
      expect(closedHero.state.clockBinding).toEqual({
        timeline: { material: CAMPAIGN, epoch: 0 },
        encounter: { material: CAMPAIGN, epoch: 1 },
      });
    }
    expect(closedShared?.state.entities).toEqual({});
    expect(Object.keys(closedShared?.state.encounter?.participants ?? {})).toEqual([
      "hero",
    ]);
  });

  it("returns a lease to the local clock when closure removes its last participant", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(hero, "summon", {
      endRules: [],
      kind: "material-lifecycle",
      parentId: "root",
      target: { material: HERO, entityId: "familiar", ordinal: 1 },
    });
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      familiar: {
        ...monster(),
        ownerOccurrence: generation(hero, HERO, "summon"),
      },
    };
    const campaign = shared();
    campaign.nextEncounterEpoch = 2;
    campaign.encounter = {
      epoch: 1,
      nextCombatantOrdinal: 2,
      participants: {
        familiar: {
          ordinal: 1,
          combatant: { material: HERO, entityId: "familiar", ordinal: 1 },
          economy: betweenTurns("familiar-pending"),
          initiativeRoll: null,
          skipped: false,
        },
      },
      phase: "initiative",
      round: 1,
      order: [],
      currentCombatantId: null,
    };
    hero.clockBinding = {
      timeline: { material: CAMPAIGN, epoch: 0 },
      encounter: { material: CAMPAIGN, epoch: 1 },
    };
    const initial = world(hero, campaign);
    const closed = finalizeDiscoveredWave(initial, {
      boundaries: [],
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    expect(closed.status).toBe("applied");
    if (closed.status !== "applied") return;
    const detached = closed.world.documents.find(
      (document) => document.kind === "character"
    );
    if (detached?.kind !== "character") throw new Error("missing character");
    expect(detached.state.entities).toEqual({});
    expect(detached.state.clockBinding).toEqual({
      timeline: { material: HERO, epoch: 0 },
      encounter: null,
    });
  });

  it("targets objects while keeping inventory-linked existence referential", () => {
    let hero = addRoot(character(), HERO);
    hero = addToState(
      hero,
      "conjure",
      {
        kind: "material-lifecycle",
        parentId: "root",
        target: self(),
        endRules: [],
      },
      "create-inventory"
    );
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      blade: item(generation(hero, HERO, "conjure")),
    };
    hero.nextEntityOrdinal = 2;
    hero.entities = { bladeObject: inventoryObject("blade") };
    expect(parseMechanicsWorld(world(hero)).ok).toBe(true);

    const missingItem = structuredClone(hero);
    missingItem.inventory = {};
    expect(parseMechanicsWorld(world(missingItem))).toEqual({
      ok: false,
      reason: "invalid-document",
    });

    const initial = world(hero);
    const closed = finalizeDiscoveredWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "root")],
    });
    expect(closed.status).toBe("applied");
    if (closed.status !== "applied") return;
    const closedHero = closed.world.documents.find(
      (document) => document.kind === "character"
    );
    if (closedHero?.kind !== "character") throw new Error("missing character");
    expect(closedHero.state.inventory).toEqual({});
    expect(closedHero.state.entities).toEqual({});
    expect(closedHero.state.occurrences).toEqual({});
  });

  it("retains a consumed source as one zero-quantity tombstone until its last effect ends", () => {
    let hero = addRoot(character(), HERO, "conjured-root");
    hero = addToState(
      hero,
      "conjured-source",
      {
        kind: "material-lifecycle",
        parentId: "conjured-root",
        target: self(),
        endRules: [],
      },
      "create-inventory"
    );
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      potion: {
        ...item(generation(hero, HERO, "conjured-source")),
        definition: { kind: "catalogue", itemId: "potion-of-healing" },
        quantity: countCell(0),
      },
    };
    hero = addRoot(
      hero,
      HERO,
      "lingering-root",
      inventoryAuthority("potion", 1, "lingering-root")
    );
    hero = addToState(hero, "lingering-effect", {
      endRules: [],
      fact: { kind: "active-key", key: "lingering-effect" },
      kind: "standing",
      parentId: "lingering-root",
      target: self(),
    });

    expect(parseMechanicsWorld(world(hero)).ok).toBe(true);

    const staleGeneration = structuredClone(hero);
    const stalePotion = staleGeneration.inventory.potion;
    if (!stalePotion) throw new Error("missing potion fixture");
    stalePotion.ordinal = 2;
    staleGeneration.nextInventoryOrdinal = 3;
    expect(parseMechanicsWorld(world(staleGeneration))).toEqual({
      ok: false,
      reason: "missing-reference",
    });

    const missing = structuredClone(hero);
    missing.inventory = {};
    expect(parseMechanicsWorld(world(missing))).toEqual({
      ok: false,
      reason: "missing-reference",
    });

    const orphan = structuredClone(hero);
    orphan.occurrences = {};
    orphan.nextOccurrenceOrdinal = 1;
    const orphanPotion = orphan.inventory.potion;
    if (!orphanPotion) throw new Error("missing potion fixture");
    orphanPotion.ownerOccurrence = null;
    expect(parseMechanicsWorld(world(orphan))).toEqual({
      ok: false,
      reason: "missing-reference",
    });

    const initial = world(hero);
    const sourceEnded = finalizeDiscoveredWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "conjured-root")],
    });
    expect(sourceEnded.status).toBe("applied");
    if (sourceEnded.status !== "applied") return;
    const retained = sourceEnded.world.documents.find(
      (document) => document.kind === "character"
    );
    if (retained?.kind !== "character") throw new Error("missing character");
    expect(retained.state.inventory.potion).toMatchObject({
      quantity: countCell(0),
      ownerOccurrence: null,
    });
    expect(retained.state.occurrences["lingering-effect"]).toBeDefined();

    const effectEnded = finalizeDiscoveredWave(sourceEnded.world, {
      endRequests: [worldGeneration(sourceEnded.world, HERO, "lingering-root")],
    });
    expect(effectEnded.status).toBe("applied");
    if (effectEnded.status !== "applied") return;
    const cleaned = effectEnded.world.documents.find(
      (document) => document.kind === "character"
    );
    if (cleaned?.kind !== "character") throw new Error("missing character");
    expect(cleaned.state.inventory).toEqual({});
  });

  it("turns remaining owned quantity into a tombstone while its authority stays active", () => {
    let hero = addRoot(character(), HERO, "conjured-root");
    hero = addToState(
      hero,
      "conjured-source",
      {
        endRules: [],
        kind: "material-lifecycle",
        parentId: "conjured-root",
        target: self(),
      },
      "create-inventory"
    );
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      potion: {
        ...item(generation(hero, HERO, "conjured-source")),
        definition: { kind: "catalogue", itemId: "potion-of-healing" },
        quantity: countCell(1),
      },
    };
    hero = addRoot(
      hero,
      HERO,
      "lingering-root",
      inventoryAuthority("potion", 1, "lingering-root")
    );
    hero = addToState(hero, "lingering-effect", {
      endRules: [],
      fact: { kind: "active-key", key: "lingering-effect" },
      kind: "standing",
      parentId: "lingering-root",
      target: self(),
    });

    const initial = world(hero);
    const parsedInitial = parseMechanicsWorld(initial);
    expect(parsedInitial.ok ? "ok" : parsedInitial.reason).toBe("ok");
    const ownerEnded = finalizeDiscoveredWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "conjured-root")],
    });
    expect(ownerEnded.status === "rejected" ? ownerEnded.reason : ownerEnded.status).toBe(
      "applied"
    );
    if (ownerEnded.status !== "applied") return;
    const retained = ownerEnded.world.documents.find(
      (document) => document.kind === "character"
    );
    if (retained?.kind !== "character") throw new Error("missing character");
    expect(retained.state.inventory.potion).toMatchObject({
      ownerOccurrence: null,
      quantity: countCell(0),
    });
    expect(retained.state.occurrences["lingering-root"]).toBeDefined();
    expect(retained.state.occurrences["lingering-effect"]).toBeDefined();

    const authorityEnded = finalizeDiscoveredWave(ownerEnded.world, {
      endRequests: [worldGeneration(ownerEnded.world, HERO, "lingering-root")],
    });
    expect(authorityEnded.status).toBe("applied");
    if (authorityEnded.status !== "applied") return;
    const cleaned = authorityEnded.world.documents.find(
      (document) => document.kind === "character"
    );
    expect(cleaned?.kind === "character" ? cleaned.state.inventory : null).toEqual({});
  });

  it("leases an owner-orphaned inventory tombstone only until terminal cleanup", () => {
    let hero = character();
    hero = addRoot(
      hero,
      HERO,
      "potion-root",
      inventoryAuthority("potion", 1, "potion-root")
    );
    hero = addToState(
      hero,
      "potion-owner",
      {
        endRules: [],
        kind: "material-lifecycle",
        parentId: "potion-root",
        target: self(),
      },
      "create-inventory"
    );
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      potion: {
        ...item(generation(hero, HERO, "potion-owner")),
        definition: { kind: "catalogue", itemId: "potion-of-healing" },
        quantity: countCell(0),
      },
    };
    const initial = world(hero);
    const lease = { owner: HERO, instanceId: "potion", instanceOrdinal: 1 } as const;
    const discovery = discoverMechanicsEndWave(initial, {
      endRequests: [worldGeneration(initial, HERO, "potion-root")],
      inventorySourceLeases: [lease],
    });
    if (discovery.status !== "discovered") throw new Error("discovery fixture");

    const latched = latchMechanicsEndWave(discovery.world, discovery.wave);
    if (latched.status === "rejected") throw new Error("latched wave fixture");
    const current = discoverMechanicsEndWave(latched.world, discovery.wave.request);
    if (current.status !== "discovered") throw new Error("current wave fixture");
    const finalized = finalizeMechanicsEndWave(current.world, current.wave);
    expect(finalized.status).toBe("applied");
    if (finalized.status !== "applied") return;
    const retained = finalized.world.documents.find(
      (document) => document.kind === "character"
    );
    expect(
      retained?.kind === "character" ? retained.state.inventory.potion : null
    ).toMatchObject({ ownerOccurrence: null, quantity: countCell(0) });

    const terminal = finalizeMechanicsMaterialCleanup(finalized.world);
    expect(terminal.status).toBe("applied");
    if (terminal.status !== "applied") return;
    const cleaned = terminal.world.documents.find(
      (document) => document.kind === "character"
    );
    expect(cleaned?.kind === "character" ? cleaned.state.inventory : null).toEqual({});
  });

  it("uses the same coordinator to start and end local combat", () => {
    const local = {
      scope: HERO,
      documents: [{ kind: "character", material: HERO, state: character() }],
    } as const;
    const started = applyBoundary(local, {
      kind: "start-encounter",
      material: HERO,
      seed: initiativeSeed(HERO),
    });
    expect(started.status).toBe("applied");
    if (started.status !== "applied") return;
    const state = started.world.documents[0]?.state;
    expect(state?.encounter?.epoch).toBe(1);
    if (started.world.documents[0]?.kind === "character") {
      expect(started.world.documents[0].state.clockBinding.encounter).toEqual({
        material: HERO,
        epoch: 1,
      });
    }
  });
});
