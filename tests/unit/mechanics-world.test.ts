import { describe, expect, it } from "vitest";

import { materialRefKey } from "@/lib/action-journal";
import { addOccurrence } from "@/lib/mechanic-occurrences";
import {
  applyMechanicsBoundary,
  closeMechanicsWorld,
  discoverMechanicsEndWave,
  finalizeMechanicsEndWave,
  isEndRuleDue,
  parseMechanicsWorld,
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
import type { NewMechanicOccurrence } from "@/types/mechanic-occurrence";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  EncounterSeed,
  MechanicsBoundaryCommand,
  MechanicsClosureCheckpoint,
  MechanicsClosureRequest,
  MechanicsClosureResolver,
  MechanicsEndCandidate,
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
    enchantInstanceId: null,
  };
}

function inventoryObject(instanceId: string): ObjectMaterialEntity {
  return {
    kind: "object",
    ordinal: 1,
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
            steps: [],
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
            steps: [],
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

type MutableMaterialState = CharacterMaterialState | SharedMaterialState;

function addToState<State extends MutableMaterialState>(
  state: State,
  id: string,
  occurrence: NewMechanicOccurrence
): State {
  const next = addOccurrence(
    {
      nextOccurrenceOrdinal: state.nextOccurrenceOrdinal,
      occurrences: state.occurrences,
    },
    id,
    occurrence
  );
  return { ...state, ...next };
}

function addRoot<State extends MutableMaterialState>(
  state: State,
  material: MaterialRef,
  id = "root",
  authority = tableAuthority(material, id)
): State {
  return addToState(state, id, program(material, id, authority));
}

function shared(): SharedMaterialState {
  return structuredClone(createEmptySharedMaterialState());
}

function sorted(documents: MechanicsDocument[]): MechanicsDocument[] {
  return documents.sort((left, right) =>
    materialRefKey(left.material).localeCompare(materialRefKey(right.material))
  );
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

function causalResolver(
  checkpoints: MechanicsClosureCheckpoint[] = []
): MechanicsClosureResolver {
  return (checkpoint) => {
    checkpoints.push(checkpoint);
    const finalized = finalizeMechanicsEndWave(
      checkpoint.world,
      checkpoint.request,
      checkpoint.candidates
    );
    return finalized.status === "rejected"
      ? { reason: finalized.reason, status: "rejected" }
      : { status: "resolved", world: finalized.world };
  };
}

function applyBoundary(
  value: Readonly<MechanicsWorld>,
  command: Readonly<MechanicsBoundaryCommand>,
  checkpoints: MechanicsClosureCheckpoint[] = []
) {
  return applyMechanicsBoundary(value, command, causalResolver(checkpoints));
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
        combatant: { material, entityId: "ally" },
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
        execution: 1,
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

  it("discovers a complete child-first end wave without removing its source", () => {
    const initial = programEndWaveWorld();
    const snapshot = structuredClone(initial);
    const request = {
      boundaries: [],
      removals: [{ material: HERO, occurrenceIds: ["root"] }],
    } satisfies MechanicsClosureRequest;
    const discovery = discoverMechanicsEndWave(initial, request);
    expect(discovery.status).toBe("discovered");
    if (discovery.status !== "discovered") return;

    expect(discovery.candidates.map(({ occurrence }) => occurrence.occurrenceId)).toEqual(
      ["child", "root"]
    );
    expect(discovery.candidates[0]?.causes).toContainEqual({
      dependency: { material: HERO, occurrenceId: "root" },
      kind: "dependency-ended",
    });
    expect(discovery.candidates[1]?.causes).toEqual([{ kind: "requested" }]);
    expect(
      discovery.world.documents.find((document) => document.kind === "character")?.state
        .occurrences
    ).toHaveProperty("root");
    expect(initial).toEqual(snapshot);
    expect(Object.isFrozen(discovery.candidates)).toBe(true);
    expect(discovery.candidates[0]?.occurrence.material).not.toBe(
      request.removals[0]?.material
    );

    const finalized = finalizeMechanicsEndWave(initial, request, discovery.candidates);
    const composed = closeMechanicsWorld(initial, request);
    expect(finalized).toEqual(composed);
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
      removals: [{ material: HERO, occurrenceIds: ["triple"] }],
    });
    expect(discovery.status).toBe("discovered");
    if (discovery.status !== "discovered") return;
    expect(discovery.candidates).toEqual([
      {
        causes: [
          { boundary, kind: "explicit-boundary" },
          { kind: "requested" },
          { kind: "temporary-hit-points-empty" },
        ],
        occurrence: { material: HERO, occurrenceId: "triple" },
      },
    ]);
  });

  it("rejects malformed, missing, excess, duplicate, reordered and stale end waves", () => {
    const initial = programEndWaveWorld();
    const request = {
      boundaries: [],
      removals: [{ material: HERO, occurrenceIds: ["root"] }],
    } satisfies MechanicsClosureRequest;
    const discovery = discoverMechanicsEndWave(initial, request);
    if (discovery.status !== "discovered") throw new Error("discovery fixture");
    const candidates = discovery.candidates;
    const invalid = (value: readonly MechanicsEndCandidate[]) =>
      expect(finalizeMechanicsEndWave(initial, request, value)).toMatchObject({
        reason: "invalid-end-wave",
        status: "rejected",
      });

    invalid(candidates.slice(1));
    invalid([...candidates, candidates[0] as MechanicsEndCandidate]);
    invalid([...candidates].reverse());
    invalid([
      candidates[0] as MechanicsEndCandidate,
      candidates[0] as MechanicsEndCandidate,
    ]);
    invalid([
      {
        ...(candidates[0] as MechanicsEndCandidate),
        causes: [{ kind: "requested" }],
      },
      candidates[1] as MechanicsEndCandidate,
    ]);
    invalid([
      {
        ...(candidates[0] as MechanicsEndCandidate),
        future: true,
      } as MechanicsEndCandidate,
      candidates[1] as MechanicsEndCandidate,
    ]);

    const stale = structuredClone(initial);
    const staleHero = stale.documents.find((document) => document.kind === "character");
    if (staleHero?.kind !== "character") throw new Error("stale fixture");
    Reflect.set(staleHero.state, "occurrences", {});
    expect(finalizeMechanicsEndWave(stale, request, candidates)).toMatchObject({
      reason: "invalid-end-wave",
      status: "rejected",
    });
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
      candidates: [
        {
          causes: [{ kind: "concentration-broken" }],
          occurrence: { material: HERO, occurrenceId: "focus" },
        },
      ],
      status: "discovered",
    });
    const incapacitated = closeMechanicsWorld(concentratingWorld);
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
    const died = closeMechanicsWorld(world(deadHero));
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
    let hero = addRoot(character(), HERO);
    hero.nextEntityOrdinal = 3;
    hero.entities = {
      ally: monster(),
      summon: {
        ...monster(2),
        ownerOccurrence: { material: HERO, occurrenceId: "summon" },
      },
    };
    hero = addToState(hero, "summon", {
      endRules: [
        {
          clock: { material: HERO, epoch: 1 },
          combatant: { material: HERO, entityId: "summon" },
          kind: "turn-boundary",
          phase: "end",
          round: 1,
        },
      ],
      fact: { key: "summon", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: { material: HERO, entityId: "summon" },
    });
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
          combatant: { material: HERO, entityId: "summon" },
          economy: turn("summon-turn"),
          initiativeRoll: 15,
          skipped: false,
        },
        ally: {
          ordinal: 3,
          combatant: { material: HERO, entityId: "ally" },
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
    const local = {
      scope: HERO,
      documents: [{ kind: "character", material: HERO, state: hero }],
    } as const;
    let afterEndClosure: Readonly<MechanicsWorld> | null = null;
    const result = applyMechanicsBoundary(
      local,
      {
        kind: "complete-turn",
        material: HERO,
      },
      (checkpoint) => {
        const finalized = finalizeMechanicsEndWave(
          checkpoint.world,
          checkpoint.request,
          checkpoint.candidates
        );
        if (finalized.status === "rejected") {
          return { reason: finalized.reason, status: "rejected" };
        }
        if (checkpoint.ordinal === 0) afterEndClosure = finalized.world;
        return { status: "resolved", world: finalized.world };
      }
    );

    expect(afterEndClosure).not.toBeNull();
    const postEndDocument = (afterEndClosure as Readonly<MechanicsWorld>).documents[0];
    expect(postEndDocument?.state.encounter?.currentCombatantId).toBe("ally");
    expect(postEndDocument?.state.encounter?.participants.ally?.economy.phase).toBe(
      "between-turns"
    );
    expect(result.status === "rejected" ? result.reason : result.status).toBe("applied");
    if (result.status !== "applied") return;
    const encounter = result.world.documents[0]?.state.encounter;
    expect(encounter?.order).toEqual(["hero", "ally"]);
    expect(encounter?.currentCombatantId).toBe("ally");
    expect(encounter?.participants.ally?.economy.phase).toBe("own-turn");
    expect(result.world.documents[0]?.state.timeline.elapsedSeconds).toBe(0);
  });

  it("continues start-turn selection when an occurrence-owned combatant expires", () => {
    let hero = addRoot(character(), HERO);
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      ally: {
        ...monster(),
        ownerOccurrence: { material: HERO, occurrenceId: "vanishing-ally" },
      },
    };
    hero = addToState(hero, "vanishing-ally", {
      endRules: [
        {
          clock: { material: HERO, epoch: 1 },
          combatant: { material: HERO, entityId: "ally" },
          kind: "turn-boundary",
          phase: "start",
          round: 1,
        },
      ],
      fact: { key: "vanishing-ally", kind: "active-key" },
      kind: "standing",
      parentId: "root",
      target: { material: HERO, entityId: "ally" },
    });
    hero.nextEncounterEpoch = 2;
    hero.encounter = turnsEncounter(1);
    hero.clockBinding.encounter = { material: HERO, epoch: 1 };
    const checkpoints: MechanicsClosureCheckpoint[] = [];
    const result = applyBoundary(
      {
        scope: HERO,
        documents: [{ kind: "character", material: HERO, state: hero }],
      },
      { kind: "complete-turn", material: HERO },
      checkpoints
    );

    expect(result.status === "rejected" ? result.reason : result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(checkpoints.map((checkpoint) => checkpoint.request.boundaries[0])).toEqual([
      {
        clock: { material: HERO, epoch: 1 },
        combatant: self(),
        kind: "turn-boundary",
        phase: "end",
        round: 1,
      },
      {
        clock: { material: HERO, epoch: 1 },
        combatant: { material: HERO, entityId: "ally" },
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
    const checkpoints: MechanicsClosureCheckpoint[] = [];
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
      fact: { kind: "active-key", key: "child" },
      kind: "standing",
      parentId: "root",
      target: { material: CAMPAIGN, entityId: "summon" },
    });
    hero = addToState(hero, "material-owner", {
      endRules: [],
      fact: { kind: "active-key", key: "material-owner" },
      kind: "standing",
      parentId: "root",
      target: self(),
    });
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      blade: item({ material: HERO, occurrenceId: "material-owner" }),
    };
    Reflect.set(hero.vitals.hitPoints, "temporary", {
      current: 5,
      sourceOccurrence: { material: HERO, occurrenceId: "material-owner" },
    });
    const campaign = shared();
    campaign.nextEntityOrdinal = 2;
    campaign.entities = {
      summon: {
        ...monster(),
        ownerOccurrence: { material: HERO, occurrenceId: "child" },
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
          combatant: { material: CAMPAIGN, entityId: "summon" },
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
    const closed = closeMechanicsWorld(world(hero, campaign), {
      boundaries: [],
      removals: [{ material: HERO, occurrenceIds: ["root"] }],
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
      fact: { kind: "active-key", key: "summoned" },
      kind: "standing",
      parentId: "root",
      target: { material: HERO, entityId: "familiar" },
    });
    hero.nextEntityOrdinal = 2;
    hero.entities = {
      familiar: {
        ...monster(),
        ownerOccurrence: { material: HERO, occurrenceId: "summon" },
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
          combatant: { material: HERO, entityId: "familiar" },
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
    const closed = closeMechanicsWorld(world(hero, campaign), {
      boundaries: [],
      removals: [{ material: HERO, occurrenceIds: ["root"] }],
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
    hero = addToState(hero, "conjure", {
      kind: "standing",
      parentId: "root",
      target: self(),
      endRules: [],
      fact: { kind: "active-key", key: "conjured-blade" },
    });
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      blade: item({ material: HERO, occurrenceId: "conjure" }),
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

    const closed = closeMechanicsWorld(world(hero), {
      removals: [{ material: HERO, occurrenceIds: ["root"] }],
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
    hero = addToState(hero, "conjured-source", {
      kind: "standing",
      parentId: "conjured-root",
      target: self(),
      endRules: [],
      fact: { kind: "active-key", key: "conjured-source" },
    });
    hero.nextInventoryOrdinal = 2;
    hero.inventory = {
      potion: {
        ...item({ material: HERO, occurrenceId: "conjured-source" }),
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

    const sourceEnded = closeMechanicsWorld(world(hero), {
      removals: [{ material: HERO, occurrenceIds: ["conjured-root"] }],
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

    const effectEnded = closeMechanicsWorld(sourceEnded.world, {
      removals: [{ material: HERO, occurrenceIds: ["lingering-root"] }],
    });
    expect(effectEnded.status).toBe("applied");
    if (effectEnded.status !== "applied") return;
    const cleaned = effectEnded.world.documents.find(
      (document) => document.kind === "character"
    );
    if (cleaned?.kind !== "character") throw new Error("missing character");
    expect(cleaned.state.inventory).toEqual({});
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
