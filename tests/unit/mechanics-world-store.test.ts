import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import {
  activeEnginePulses,
  characterFeatureActionCapability,
  characterMaterialRef,
  characterSelfRef,
  characterSlotDefinitionFacts,
  characterSpellCapability,
  characterWeaponAttackCapability,
  characterWorldState,
  commitCharacterAction,
  undoCharacterAction,
  type CharacterCastCapability,
} from "@/lib/mechanics-world-store";

import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsAuthorityDefinition } from "@/types/mechanics-authority";
import type { MechanicsCoordinationResult } from "@/types/mechanics-coordinator";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsAnswer, MechanicsRequirement } from "@/types/mechanics-program";
import type { ResolvedActionFact } from "@/types/action-journal";

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

/** The trail ids of one roll requirement, in encounter order. */
function trailIdsOf(value: unknown): string[] {
  return [
    ...new Set(
      [...JSON.stringify(value).matchAll(/"trailId":"([^"]+)"/g)].map(
        (match) => match[1] ?? ""
      )
    ),
  ];
}

/**
 * Drive one capability through the coordinator's replay protocol: re-run with
 * the growing answer ledger, asking `answerFor` for each surfaced requirement,
 * until the planned action completes (the same loop every engine surface runs).
 */
function driveCapability(opts: {
  readonly actionId: string;
  readonly answerFor: (requirement: MechanicsRequirement) => MechanicsAnswer;
  readonly capability: CharacterCastCapability;
  readonly doc: Readonly<CharacterDoc>;
  readonly occurrenceId: string;
  readonly uid: string;
  readonly world: Readonly<CharacterMaterialState>;
}): Extract<MechanicsCoordinationResult, { status: "complete" }> {
  const material = characterMaterialRef(opts.doc, opts.uid);
  const begun = beginMechanicsCausalState({
    documents: [{ kind: "character", material, state: opts.world }],
    scope: material,
  });
  if (!begun.ok) throw new Error(`begin: ${begun.reason}`);
  const answers: MechanicsAnswer[] = [];
  const run = () =>
    runMechanicsCausalAction({
      answers,
      authoritySnapshot: {
        definitions: [authorityDefinition(opts.capability.authority)],
      },
      facts: opts.capability.facts,
      frameAnswers: [],
      intent: {
        actionId: opts.actionId,
        factGuards: [],
        frame: {
          authority: opts.capability.authority,
          invocation: {
            installation: opts.capability.authority.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: opts.world.epoch,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: {
              occurrence: { material, occurrenceId: opts.occurrenceId },
              ordinal: opts.world.nextOccurrenceOrdinal,
            },
          },
          trigger: { kind: "invocation" },
        },
      },
      responses: [],
      state: begun.value,
      turnEconomy: [],
    });
  let outcome = run();
  for (
    let remaining = 12;
    outcome.status === "needs-answer" && remaining > 0;
    remaining -= 1
  ) {
    const requirement = outcome.requirement;
    if (!requirement) throw new Error("missing requirement");
    answers.push(opts.answerFor(requirement));
    outcome = run();
  }
  if (outcome.status !== "complete" || !outcome.action) {
    throw new Error(`${opts.actionId}: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

/** Commit one driven outcome, echoing its own guard expectations as facts. */
function commitDriven(
  doc: Readonly<CharacterDoc>,
  uid: string,
  world: Readonly<CharacterMaterialState>,
  outcome: Extract<MechanicsCoordinationResult, { status: "complete" }>
) {
  if (!outcome.action) throw new Error("no planned action");
  const committed = commitCharacterAction(
    doc,
    uid,
    world,
    outcome.action,
    outcome.action.guards.facts.map((fact) => ({
      actual: fact.expected,
      address: fact.address,
      owner: fact.owner,
    }))
  );
  if (!committed) throw new Error("commit failed");
  return committed;
}

describe("mechanics world store", () => {
  it("derives the mock character's world once from the legacy session", () => {
    const world = characterWorldState(MOCK_CHARACTER, "test-uid", 60);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(world.vitals.hitPoints.current).toBeLessThanOrEqual(60);
    expect(Object.keys(world.resources.standardSpellSlots).length).toBeGreaterThan(0);
    expect(world.resources.currency.gp.current).toBe(MOCK_CHARACTER.session.currency.gp);
  });

  it("casts a transcribed spell against the derived world and mirrors the slot", () => {
    const world = characterWorldState(MOCK_CHARACTER, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    const capability = characterSpellCapability(
      MOCK_CHARACTER,
      "test-uid",
      "cure-wounds",
      {
        attackBonus: 5,
        castingModifier: 0,
        characterLevel: 3,
        maxHp: 60,
        saveDc: 15,
      }
    );
    expect(capability).not.toBeNull();
    if (!capability) return;

    const self = characterSelfRef(MOCK_CHARACTER, "test-uid");
    const begun = beginMechanicsCausalState({
      documents: [
        {
          kind: "character",
          material: self.material,
          state: world,
        },
      ],
      scope: self.material,
    });
    if (!begun.ok) throw new Error(`begin: ${begun.reason}`);

    const slotLevels = Object.keys(world.resources.standardSpellSlots)
      .map(Number)
      .sort((a, b) => a - b);
    const castLevel = slotLevels.find((level) => level >= 1);
    if (castLevel === undefined) throw new Error("no slot");
    const before = world.resources.standardSpellSlots[String(castLevel)]?.current ?? 0;
    expect(before).toBeGreaterThan(0);

    const answers: MechanicsAnswer[] = [];
    const run = () =>
      runMechanicsCausalAction({
        answers,
        authoritySnapshot: { definitions: [authorityDefinition(capability.authority)] },
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(MOCK_CHARACTER, "test-uid", world),
        ],
        frameAnswers: [],
        intent: {
          actionId: "cast-cure-wounds",
          factGuards: [],
          frame: {
            authority: capability.authority,
            invocation: {
              installation: capability.authority.installation,
              kind: "installed-capability",
            },
            rootReceipt: {
              kind: "create",
              materialEpoch: 0,
              next: { execution: 1, phaseId: "resolve", triggerEventId: null },
              root: {
                occurrence: { material: self.material, occurrenceId: "cast-1" },
                ordinal: world.nextOccurrenceOrdinal,
              },
            },
            trigger: { kind: "invocation" },
          },
        },
        responses: [],
        state: begun.value,
        turnEconomy: [],
      });

    const trailIds = (value: unknown): string[] => [
      ...new Set(
        [...JSON.stringify(value).matchAll(/"trailId":"([^"]+)"/g)].map(
          (match) => match[1] ?? ""
        )
      ),
    ];
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
          resource: {
            character: characterMaterialRef(MOCK_CHARACTER, "test-uid"),
            kind: "standard-spell-slot",
            level: castLevel,
          },
        });
      } else if (requirement.kind === "entities") {
        answers.push({
          inputId: requirement.inputId,
          kind: "entities",
          targets: [self],
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
                initialFace: 4,
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
    if (outcome.status !== "complete" || !outcome.action) return;

    const resolvedFacts: ResolvedActionFact[] = outcome.action.guards.facts.map(
      (fact) => ({
        actual: fact.expected,
        address: fact.address,
        owner: fact.owner,
      })
    );
    const committed = commitCharacterAction(
      MOCK_CHARACTER,
      "test-uid",
      world,
      outcome.action,
      resolvedFacts
    );
    expect(committed).not.toBeNull();
    if (!committed) return;
    expect(committed.world.resources.standardSpellSlots[String(castLevel)]?.current).toBe(
      before - 1
    );
    expect(committed.session.world).toBeDefined();
    const undone = undoCharacterAction(
      { ...MOCK_CHARACTER, session: committed.session },
      "test-uid",
      committed.world,
      outcome.action.id
    );
    expect(undone).not.toBeNull();
    if (undone) {
      expect(undone.world.resources.standardSpellSlots[String(castLevel)]?.current).toBe(
        before
      );
    }

    const mirroredUsed =
      committed.session.spellSlots[`slot-${castLevel}`]?.used ??
      Object.entries(committed.session.spellSlots).find(([key]) =>
        key.includes(String(castLevel))
      )?.[1]?.used;
    expect(mirroredUsed).toBeGreaterThanOrEqual(1);
  });

  it("second wind spends the seeded tracker pool and heals with the class bonus", () => {
    const damagedDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        hp: { ...MOCK_CHARACTER.session.hp, current: 12, temp: 0 },
        trackers: {},
      },
    };
    const world = characterWorldState(
      damagedDoc,
      "test-uid",
      60,
      {},
      {
        "fighter-second-wind": { total: 2, used: 0 },
      }
    );
    if (!world) throw new Error("world fixture");
    expect(world.resources.pools["fighter-second-wind"]).toMatchObject({ current: 2 });
    const capability = characterFeatureActionCapability(
      damagedDoc,
      "test-uid",
      "fighter-second-wind",
      {
        costTracker: "fighter-second-wind",
        heal: { dice: "1d10", plus: { kind: "class-level", classId: "fighter" } },
        targeting: { affinity: "self", maxTargets: 1 },
        type: "bonus",
      },
      0,
      { featureBonus: 3, maxHp: 60, saveDc: 8 }
    );
    expect(capability).not.toBeNull();
    if (!capability) return;
    const self = characterSelfRef(damagedDoc, "test-uid");
    const material = characterMaterialRef(damagedDoc, "test-uid");
    const begun = beginMechanicsCausalState({
      documents: [{ kind: "character", material, state: world }],
      scope: material,
    });
    if (!begun.ok) throw new Error(`begin: ${begun.reason}`);
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
        authoritySnapshot: { definitions: [authorityDefinition(capability.authority)] },
        facts: capability.facts,
        frameAnswers: [],
        intent: {
          actionId: "use-second-wind",
          factGuards: [],
          frame: {
            authority: capability.authority,
            invocation: {
              installation: capability.authority.installation,
              kind: "installed-capability",
            },
            rootReceipt: {
              kind: "create",
              materialEpoch: 0,
              next: { execution: 1, phaseId: "resolve", triggerEventId: null },
              root: {
                occurrence: { material, occurrenceId: "second-wind-1" },
                ordinal: world.nextOccurrenceOrdinal,
              },
            },
            trigger: { kind: "invocation" },
          },
        },
        responses: [],
        state: begun.value,
        turnEconomy: [],
      });
    let outcome = run();
    for (
      let remaining = 5;
      outcome.status === "needs-answer" && remaining > 0;
      remaining -= 1
    ) {
      const requirement = outcome.requirement;
      if (!requirement) throw new Error("missing requirement");
      if (requirement.kind === "resource") {
        answers.push({
          inputId: requirement.inputId,
          kind: "resource",
          resource: {
            kind: "pool",
            owner: self,
            resourceId: "fighter-second-wind",
          },
        });
      } else if (requirement.kind === "entities") {
        answers.push({ inputId: requirement.inputId, kind: "entities", targets: [self] });
      } else if (requirement.kind === "dice") {
        answers.push({
          inputId: requirement.inputId,
          kind: "dice",
          requests: requirement.requests.map(({ identity, roll }) => ({
            identity,
            observation: {
              aggregates: [],
              trails: trailIds(roll).map((trailId) => ({
                initialFace: 7,
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
    if (outcome.status !== "complete" || !outcome.action) {
      throw new Error(`second wind: ${JSON.stringify(outcome)}`);
    }
    const committed = commitCharacterAction(
      damagedDoc,
      "test-uid",
      world,
      outcome.action,
      outcome.action.guards.facts.map((fact) => ({
        actual: fact.expected,
        address: fact.address,
        owner: fact.owner,
      }))
    );
    expect(committed).not.toBeNull();
    if (!committed) return;
    // 1d10 face 7 + resolved fighter-level bonus 3 → +10 HP from 12 to 22.
    expect(committed.world.vitals.hitPoints.current).toBe(22);
    expect(committed.world.resources.pools["fighter-second-wind"]).toMatchObject({
      current: 1,
    });
    // The rollout bridge mirrors the spent use onto the legacy tracker.
    expect(committed.session.trackers["fighter-second-wind"]?.used).toBe(1);
  });

  it("rage activation pays the feature tracker and lights the standing key", () => {
    const doc = {
      ...MOCK_CHARACTER,
      session: { ...MOCK_CHARACTER.session, trackers: {} },
    };
    const world = characterWorldState(
      doc,
      "test-uid",
      60,
      {},
      {
        "barbarian-rage": { total: 2, used: 0 },
      }
    );
    if (!world) throw new Error("world fixture");
    const capability = characterFeatureActionCapability(
      doc,
      "test-uid",
      "barbarian-rage",
      { type: "bonus" },
      0,
      { featureBonus: 0, maxHp: 60, saveDc: 8 },
      {
        trackerId: "barbarian-rage",
        whileActive: [{ activeKey: "barbarian-rage", maintained: true }],
      }
    );
    expect(capability).not.toBeNull();
    if (!capability) return;
    const self = characterSelfRef(doc, "test-uid");
    const material = characterMaterialRef(doc, "test-uid");
    const begun = beginMechanicsCausalState({
      documents: [{ kind: "character", material, state: world }],
      scope: material,
    });
    if (!begun.ok) throw new Error(`begin: ${begun.reason}`);
    const answers: MechanicsAnswer[] = [];
    const run = () =>
      runMechanicsCausalAction({
        answers,
        authoritySnapshot: { definitions: [authorityDefinition(capability.authority)] },
        facts: capability.facts,
        frameAnswers: [],
        intent: {
          actionId: "enter-rage",
          factGuards: [],
          frame: {
            authority: capability.authority,
            invocation: {
              installation: capability.authority.installation,
              kind: "installed-capability",
            },
            rootReceipt: {
              kind: "create",
              materialEpoch: 0,
              next: { execution: 1, phaseId: "resolve", triggerEventId: null },
              root: {
                occurrence: { material, occurrenceId: "rage-1" },
                ordinal: world.nextOccurrenceOrdinal,
              },
            },
            trigger: { kind: "invocation" },
          },
        },
        responses: [],
        state: begun.value,
        turnEconomy: [],
      });
    let outcome = run();
    for (
      let remaining = 4;
      outcome.status === "needs-answer" && remaining > 0;
      remaining -= 1
    ) {
      const requirement = outcome.requirement;
      if (requirement?.kind === "resource") {
        answers.push({
          inputId: requirement.inputId,
          kind: "resource",
          resource: { kind: "pool", owner: self, resourceId: "barbarian-rage" },
        });
      } else if (requirement?.kind === "entities") {
        answers.push({ inputId: requirement.inputId, kind: "entities", targets: [self] });
      } else {
        throw new Error(`unexpected requirement: ${requirement?.kind ?? "none"}`);
      }
      outcome = run();
    }
    if (outcome.status !== "complete" || !outcome.action) {
      throw new Error(`rage: ${JSON.stringify(outcome)}`);
    }
    const committed = commitCharacterAction(
      doc,
      "test-uid",
      world,
      outcome.action,
      outcome.action.guards.facts.map((fact) => ({
        actual: fact.expected,
        address: fact.address,
        owner: fact.owner,
      }))
    );
    expect(committed).not.toBeNull();
    if (!committed) return;
    expect(committed.world.resources.pools["barbarian-rage"]).toMatchObject({
      current: 1,
    });
    expect(committed.session.trackers["barbarian-rage"]?.used).toBe(1);
    const standings = Object.values(committed.world.occurrences).filter(
      (occurrence) => occurrence.kind === "standing"
    );
    expect(standings).toHaveLength(1);
  });

  it("seeds a missing tracker pool into an already-persisted world exactly once", () => {
    const doc = {
      ...MOCK_CHARACTER,
      session: { ...MOCK_CHARACTER.session, trackers: {} },
    };
    const first = characterWorldState(doc, "test-uid", 60);
    if (!first) throw new Error("world fixture");
    const persistedDoc = {
      ...doc,
      session: { ...doc.session, world: first },
    };
    // The persisted world predates the tracker; the read seeds it additively.
    const reseeded = characterWorldState(
      persistedDoc,
      "test-uid",
      60,
      {},
      {
        "fighter-second-wind": { total: 3, used: 1 },
      }
    );
    expect(reseeded?.resources.pools["fighter-second-wind"]).toMatchObject({
      current: 2,
    });
    // An existing pool is world truth — a different seed never reseeds it.
    const worldWithPool = {
      ...persistedDoc,
      session: { ...persistedDoc.session, world: reseeded },
    };
    const again = characterWorldState(
      worldWithPool,
      "test-uid",
      60,
      {},
      {
        "fighter-second-wind": { total: 5, used: 0 },
      }
    );
    expect(again?.resources.pools["fighter-second-wind"]).toMatchObject({
      current: 2,
    });
  });

  it("pulses a persisted moonbeam zone through the round-tripped authority", () => {
    const world = characterWorldState(MOCK_CHARACTER, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    const capability = characterSpellCapability(MOCK_CHARACTER, "test-uid", "moonbeam", {
      attackBonus: 5,
      castingModifier: 0,
      characterLevel: 3,
      maxHp: 60,
      saveDc: 15,
    });
    if (!capability) throw new Error("moonbeam capability");
    const self = characterSelfRef(MOCK_CHARACTER, "test-uid");
    const material = characterMaterialRef(MOCK_CHARACTER, "test-uid");
    const slotLevels = Object.keys(world.resources.standardSpellSlots)
      .map(Number)
      .sort((a, b) => a - b);
    const castLevel = slotLevels.find((level) => level >= 2);
    if (castLevel === undefined) throw new Error("no level-2 slot");

    const trailIds = (value: unknown): string[] => [
      ...new Set(
        [...JSON.stringify(value).matchAll(/"trailId":"([^"]+)"/g)].map(
          (match) => match[1] ?? ""
        )
      ),
    ];
    const begun = beginMechanicsCausalState({
      documents: [{ kind: "character", material, state: world }],
      scope: material,
    });
    if (!begun.ok) throw new Error(`begin: ${begun.reason}`);
    const castAnswers: MechanicsAnswer[] = [];
    const runCast = () =>
      runMechanicsCausalAction({
        answers: castAnswers,
        authoritySnapshot: { definitions: [authorityDefinition(capability.authority)] },
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(MOCK_CHARACTER, "test-uid", world),
        ],
        frameAnswers: [],
        intent: {
          actionId: "cast-moonbeam",
          factGuards: [],
          frame: {
            authority: capability.authority,
            invocation: {
              installation: capability.authority.installation,
              kind: "installed-capability",
            },
            rootReceipt: {
              kind: "create",
              materialEpoch: 0,
              next: { execution: 1, phaseId: "resolve", triggerEventId: null },
              root: {
                occurrence: { material, occurrenceId: "moonbeam-1" },
                ordinal: world.nextOccurrenceOrdinal,
              },
            },
            trigger: { kind: "invocation" },
          },
        },
        responses: [],
        state: begun.value,
        turnEconomy: [],
      });
    let castOutcome = runCast();
    for (
      let remaining = 4;
      castOutcome.status === "needs-answer" && remaining > 0;
      remaining -= 1
    ) {
      const requirement = castOutcome.requirement;
      if (requirement?.kind === "resource") {
        castAnswers.push({
          inputId: requirement.inputId,
          kind: "resource",
          resource: {
            character: material,
            kind: "standard-spell-slot",
            level: castLevel,
          },
        });
      } else {
        throw new Error(`unexpected cast requirement: ${requirement?.kind ?? "none"}`);
      }
      castOutcome = runCast();
    }
    if (castOutcome.status !== "complete" || !castOutcome.action) {
      throw new Error(`cast: ${JSON.stringify(castOutcome)}`);
    }
    const committed = commitCharacterAction(
      MOCK_CHARACTER,
      "test-uid",
      world,
      castOutcome.action,
      castOutcome.action.guards.facts.map((fact) => ({
        actual: fact.expected,
        address: fact.address,
        owner: fact.owner,
      }))
    );
    if (!committed) throw new Error("cast commit");

    // The rollout bridge mirrors the engine concentration for legacy readers.
    expect(committed.session.concentration).toBe("moonbeam");

    // Round-trip: re-derive the world from the PERSISTED session document.
    const persistedDoc = { ...MOCK_CHARACTER, session: committed.session };
    const persisted = characterWorldState(persistedDoc, "test-uid", 60);
    if (!persisted) throw new Error("persisted world");
    const pulses = activeEnginePulses(persisted);
    expect(pulses).toHaveLength(1);
    const pulse = pulses[0];
    if (!pulse) return;
    expect(pulse.spellId).toBe("moonbeam");
    expect(pulse.execution).toBe(0);

    const root = persisted.occurrences[pulse.occurrenceId];
    if (root?.kind !== "program") throw new Error("persisted root");
    const rebegun = beginMechanicsCausalState({
      documents: [{ kind: "character", material, state: persisted }],
      scope: material,
    });
    if (!rebegun.ok) throw new Error(`rebegin: ${rebegun.reason}`);
    const hpBefore = persisted.vitals.hitPoints.current;
    const pulseAnswers: MechanicsAnswer[] = [];
    const triggerEventId = `${pulse.phaseId}.1`;
    const runPulse = () =>
      runMechanicsCausalAction({
        answers: pulseAnswers,
        authoritySnapshot: { definitions: [] },
        facts: [
          {
            address: ["hit-point-maximum"],
            expected: { present: true, value: 60 },
            lifecycle: "commit-redo",
            owner: self,
          },
        ],
        frameAnswers: [],
        intent: {
          actionId: "pulse-moonbeam-1",
          factGuards: [],
          frame: {
            authority: root.authority,
            invocation: {
              kind: "program-root",
              occurrence: {
                occurrence: { material, occurrenceId: pulse.occurrenceId },
                ordinal: root.ordinal,
              },
            },
            rootReceipt: {
              expected: {
                execution: 0,
                phaseId: pulse.phaseId,
                triggerEventId: null,
              },
              kind: "advance",
              next: { execution: 1, phaseId: pulse.phaseId, triggerEventId },
              root: {
                occurrence: { material, occurrenceId: pulse.occurrenceId },
                ordinal: root.ordinal,
              },
            },
            trigger: { eventId: pulse.eventId, kind: "root-pulse", triggerEventId },
          },
        },
        responses: [],
        state: rebegun.value,
        turnEconomy: [],
      });
    let pulseOutcome = runPulse();
    for (
      let remaining = 5;
      pulseOutcome.status === "needs-answer" && remaining > 0;
      remaining -= 1
    ) {
      const requirement = pulseOutcome.requirement;
      if (!requirement) throw new Error("missing pulse requirement");
      if (requirement.kind === "entities") {
        pulseAnswers.push({
          inputId: requirement.inputId,
          kind: "entities",
          targets: [self],
        });
      } else if (requirement.kind === "d20") {
        pulseAnswers.push({
          inputId: requirement.inputId,
          kind: "d20",
          requests: requirement.requests.map(({ identity, review }) => ({
            identity,
            observation: {
              d20: {
                aggregates: [],
                trails: trailIds(review).map((trailId) => ({
                  initialFace: 3,
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
        pulseAnswers.push({
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
        throw new Error(`unexpected pulse requirement: ${requirement.kind}`);
      }
      pulseOutcome = runPulse();
    }
    if (pulseOutcome.status !== "complete" || !pulseOutcome.action) {
      throw new Error(`pulse: ${JSON.stringify(pulseOutcome)}`);
    }
    const pulsed = commitCharacterAction(
      persistedDoc,
      "test-uid",
      persisted,
      pulseOutcome.action,
      pulseOutcome.action.guards.facts.map((fact) => ({
        actual: fact.expected,
        address: fact.address,
        owner: fact.owner,
      }))
    );
    expect(pulsed).not.toBeNull();
    if (!pulsed) return;
    // The failed save takes the register-scaled moonbeam dice in full.
    expect(pulsed.world.vitals.hitPoints.current).toBeLessThan(hpBefore);
    const pulsedRoot = pulsed.world.occurrences[pulse.occurrenceId];
    if (pulsedRoot?.kind !== "program") throw new Error("pulsed root");
    expect(pulsedRoot.phaseState[pulse.phaseId]).toMatchObject({
      execution: 1,
      lastTriggerEventId: triggerEventId,
    });
    expect(activeEnginePulses(pulsed.world)[0]?.execution).toBe(1);
  });

  it("lay on hands heals exactly the chosen pool amount and debits the pool", () => {
    const doc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        hp: { ...MOCK_CHARACTER.session.hp, current: 12, temp: 0 },
        trackers: {},
      },
    };
    const world = characterWorldState(
      doc,
      "test-uid",
      62,
      {},
      { "paladin-lay-on-hands": { total: 15, used: 0 } }
    );
    if (!world) throw new Error("world fixture");
    const capability = characterFeatureActionCapability(
      doc,
      "test-uid",
      "paladin-lay-on-hands",
      {
        cureConditions: [
          { condition: "poisoned", costHp: 5 },
          { condition: "blinded", costHp: 5, fromLevel: 14 },
        ],
        poolSpendEffect: "healing",
        targeting: { affinity: "ally", maxTargets: 1 },
        type: "bonus",
      },
      0,
      { featureBonus: 0, maxHp: 62, saveDc: 8 },
      { scalingLevel: 3, trackerId: "paladin-lay-on-hands" }
    );
    expect(capability).not.toBeNull();
    if (!capability) return;
    // The level-locked Restoring Touch cures stay narrative at Paladin 3.
    expect(
      capability.transcription.clauses.find(
        (entry) => entry.clauseId === "cure-blinded-locked"
      )?.status
    ).toBe("narrative");
    const self = characterSelfRef(doc, "test-uid");
    const seen: string[] = [];
    const outcome = driveCapability({
      actionId: "use-lay-on-hands",
      answerFor: (requirement) => {
        seen.push(`${requirement.kind}:${requirement.inputId}`);
        if (requirement.kind === "entities") {
          return { inputId: requirement.inputId, kind: "entities", targets: [self] };
        }
        if (requirement.kind === "integer") {
          return { inputId: requirement.inputId, kind: "integer", value: 3 };
        }
        if (requirement.kind === "resource") {
          return {
            inputId: requirement.inputId,
            kind: "resource",
            resource: {
              kind: "pool",
              owner: self,
              resourceId: "paladin-lay-on-hands",
            },
          };
        }
        if (requirement.kind === "boolean") {
          return { inputId: requirement.inputId, kind: "boolean", value: false };
        }
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      },
      capability,
      doc,
      occurrenceId: "lay-on-hands-1",
      uid: "test-uid",
      world,
    });
    // The chosen amount is asked BEFORE the pool payment that binds it, and the
    // cure opt-in surfaced even though it was declined.
    expect(seen).toEqual([
      "entities:targets",
      "integer:amount",
      "resource:uses",
      "boolean:cure-poisoned-opt",
    ]);
    const committed = commitDriven(doc, "test-uid", world, outcome);
    // Heals EXACTLY the chosen 3 points; the pool loses exactly those 3.
    expect(committed.world.vitals.hitPoints.current).toBe(15);
    expect(committed.world.resources.pools["paladin-lay-on-hands"]).toMatchObject({
      current: 12,
    });
    expect(committed.session.trackers["paladin-lay-on-hands"]?.used).toBe(3);
  });

  it("lay on hands pays a pool-priced cure alongside the chosen healing", () => {
    const doc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        conditions: ["poisoned"],
        hp: { ...MOCK_CHARACTER.session.hp, current: 12, temp: 0 },
        trackers: {},
      },
    };
    const world = characterWorldState(
      doc,
      "test-uid",
      62,
      {},
      { "paladin-lay-on-hands": { total: 15, used: 0 } }
    );
    if (!world) throw new Error("world fixture");
    const capability = characterFeatureActionCapability(
      doc,
      "test-uid",
      "paladin-lay-on-hands",
      {
        cureConditions: [{ condition: "poisoned", costHp: 5 }],
        poolSpendEffect: "healing",
        targeting: { affinity: "ally", maxTargets: 1 },
        type: "bonus",
      },
      0,
      { featureBonus: 0, maxHp: 62, saveDc: 8 },
      { trackerId: "paladin-lay-on-hands" }
    );
    if (!capability) throw new Error("capability");
    const self = characterSelfRef(doc, "test-uid");
    const outcome = driveCapability({
      actionId: "use-lay-on-hands-cure",
      answerFor: (requirement) => {
        if (requirement.kind === "entities") {
          return { inputId: requirement.inputId, kind: "entities", targets: [self] };
        }
        if (requirement.kind === "integer") {
          return { inputId: requirement.inputId, kind: "integer", value: 2 };
        }
        if (requirement.kind === "resource") {
          return {
            inputId: requirement.inputId,
            kind: "resource",
            resource: {
              kind: "pool",
              owner: self,
              resourceId: "paladin-lay-on-hands",
            },
          };
        }
        if (requirement.kind === "boolean") {
          return { inputId: requirement.inputId, kind: "boolean", value: true };
        }
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      },
      capability,
      doc,
      occurrenceId: "lay-on-hands-cure-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);
    // 2 chosen healing points + the 5-point cure = 7 pool points, and RAW the
    // cure's points never also restore hit points.
    expect(committed.world.vitals.hitPoints.current).toBe(14);
    expect(committed.world.resources.pools["paladin-lay-on-hands"]).toMatchObject({
      current: 8,
    });
    expect(committed.session.trackers["paladin-lay-on-hands"]?.used).toBe(7);
  });

  it("a dice-unit pool rolls the chosen number of dice and heals the total", () => {
    const doc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        hp: { ...MOCK_CHARACTER.session.hp, current: 12, temp: 0 },
        trackers: {},
      },
    };
    const world = characterWorldState(
      doc,
      "test-uid",
      62,
      {},
      { "barbarian-zealot-warrior-of-the-gods": { total: 4, used: 0 } }
    );
    if (!world) throw new Error("world fixture");
    const capability = characterFeatureActionCapability(
      doc,
      "test-uid",
      "barbarian-zealot-warrior-of-the-gods",
      {
        poolSpendEffect: "healing",
        targeting: { affinity: "self", maxTargets: 1 },
        type: "bonus",
      },
      0,
      { featureBonus: 0, maxHp: 62, saveDc: 8 },
      {
        poolDie: "d12",
        trackerId: "barbarian-zealot-warrior-of-the-gods",
      }
    );
    if (!capability) throw new Error("capability");
    const self = characterSelfRef(doc, "test-uid");
    const outcome = driveCapability({
      actionId: "use-warrior-of-the-gods",
      answerFor: (requirement) => {
        if (requirement.kind === "entities") {
          return { inputId: requirement.inputId, kind: "entities", targets: [self] };
        }
        if (requirement.kind === "integer") {
          return { inputId: requirement.inputId, kind: "integer", value: 2 };
        }
        if (requirement.kind === "resource") {
          return {
            inputId: requirement.inputId,
            kind: "resource",
            resource: {
              kind: "pool",
              owner: self,
              resourceId: "barbarian-zealot-warrior-of-the-gods",
            },
          };
        }
        if (requirement.kind === "dice") {
          // The chosen 2 dice surface as exactly two d12 trails.
          const first = requirement.requests[0];
          if (!first) throw new Error("missing dice request");
          expect(trailIdsOf(first.roll)).toHaveLength(2);
          return {
            inputId: requirement.inputId,
            kind: "dice",
            requests: requirement.requests.map(({ identity, roll }) => ({
              identity,
              observation: {
                aggregates: [],
                trails: trailIdsOf(roll).map((trailId) => ({
                  initialFace: 5,
                  steps: [],
                  trailId,
                })),
              },
              payments: [],
            })),
          };
        }
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      },
      capability,
      doc,
      occurrenceId: "warrior-of-the-gods-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);
    // Two d12 at face 5 heal 10; the dice pool loses the two chosen dice.
    expect(committed.world.vitals.hitPoints.current).toBe(22);
    expect(
      committed.world.resources.pools["barbarian-zealot-warrior-of-the-gods"]
    ).toMatchObject({ current: 2 });
    expect(committed.session.trackers["barbarian-zealot-warrior-of-the-gods"]?.used).toBe(
      2
    );
  });

  it("a feature attack adjudicates crit, hit and miss against the bound armor class", () => {
    const doc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        hp: { ...MOCK_CHARACTER.session.hp, current: 50, temp: 0 },
        trackers: {},
      },
    };
    const world = characterWorldState(doc, "test-uid", 62);
    if (!world) throw new Error("world fixture");
    const capability = characterFeatureActionCapability(
      doc,
      "test-uid",
      "synthetic-eldritch-lash",
      {
        attack: { dice: "2d6", damageType: "fire" },
        attackType: "ranged",
        targeting: { affinity: "enemy", maxTargets: 3 },
        type: "action",
      },
      0,
      {
        attackBonus: 5,
        featureBonus: 0,
        maxHp: 62,
        saveDc: 8,
        targetArmorClass: 15,
      }
    );
    expect(capability).not.toBeNull();
    if (!capability) return;
    const self = characterSelfRef(doc, "test-uid");
    const d20Faces = [20, 12, 3];
    const outcome = driveCapability({
      actionId: "use-eldritch-lash",
      answerFor: (requirement) => {
        if (requirement.kind === "entities") {
          return {
            inputId: requirement.inputId,
            kind: "entities",
            targets: [self, self, self],
          };
        }
        if (requirement.kind === "d20") {
          expect(requirement.requests).toHaveLength(3);
          return {
            inputId: requirement.inputId,
            kind: "d20",
            requests: requirement.requests.map(({ identity, review }, index) => ({
              identity,
              observation: {
                d20: {
                  aggregates: [],
                  trails: trailIdsOf(review).map((trailId) => ({
                    initialFace: d20Faces[index] ?? 1,
                    steps: [],
                    trailId,
                  })),
                },
                enteredModifiers: [],
                tableOverride: null,
              },
              payments: [],
            })),
          };
        }
        if (requirement.kind === "dice") {
          // One request per LANDED outcome family: the hit rolls 2d6, the
          // critical rolls 4d6 (dice doubled). The miss never asks.
          const expectedTrails =
            requirement.inputId === "attack-damage-roll-crit" ? 4 : 2;
          const first = requirement.requests[0];
          if (!first) throw new Error("missing dice request");
          expect(requirement.requests).toHaveLength(1);
          expect(trailIdsOf(first.roll)).toHaveLength(expectedTrails);
          return {
            inputId: requirement.inputId,
            kind: "dice",
            requests: requirement.requests.map(({ identity, roll }) => ({
              identity,
              observation: {
                aggregates: [],
                trails: trailIdsOf(roll).map((trailId) => ({
                  initialFace: 4,
                  steps: [],
                  trailId,
                })),
              },
              payments: [],
            })),
          };
        }
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      },
      capability,
      doc,
      occurrenceId: "eldritch-lash-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);
    // Crit 4×4 = 16 plus hit 2×4 = 8 land; the natural 3 misses and deals
    // nothing. 50 − 24 = 26.
    expect(committed.world.vitals.hitPoints.current).toBe(26);
  });

  // Three full coordinator replays (hit, crit, miss) over one persisted world
  // chain make this the suite's longest proof; give it explicit headroom.
  it(
    "a weapon attack hits with the ability mod and doubles only dice on a crit",
    { timeout: 30000 },
    () => {
      const doc = {
        ...MOCK_CHARACTER,
        character: {
          ...MOCK_CHARACTER.character,
          weapons: [
            {
              attackStat: "DEX" as const,
              custom: true as const,
              damageDie: "1d8",
              damageType: "slashing" as const,
              name: "Test Blade",
              properties: "Versatile (1d10)",
              quantity: 1,
            },
          ],
        },
        session: {
          ...MOCK_CHARACTER.session,
          hp: { ...MOCK_CHARACTER.session.hp, current: 50, temp: 0 },
          trackers: {},
        },
      };
      const world = characterWorldState(doc, "test-uid", 62);
      if (!world) throw new Error("world fixture");
      const self = characterSelfRef(doc, "test-uid");
      const weaponCapability = (): CharacterCastCapability => {
        const capability = characterWeaponAttackCapability(
          doc,
          "test-uid",
          "weapon-test-blade",
          { maxHp: 62, targetArmorClass: 15 }
        );
        if (!capability) throw new Error("weapon capability");
        return capability;
      };
      const runSwing = (opts: {
        readonly d20Face: number;
        readonly diceFace: number;
        readonly grip: "one-handed" | "two-handed";
        readonly occurrenceId: string;
        readonly startWorld: Readonly<CharacterMaterialState>;
        readonly startDoc: Readonly<CharacterDoc>;
      }) => {
        const rolled: Record<string, number> = {};
        const outcome = driveCapability({
          actionId: `swing-${opts.occurrenceId}`,
          answerFor: (requirement) => {
            if (requirement.kind === "entities") {
              return { inputId: requirement.inputId, kind: "entities", targets: [self] };
            }
            if (requirement.kind === "choice") {
              return {
                choiceId: opts.grip,
                inputId: requirement.inputId,
                kind: "choice",
              };
            }
            if (requirement.kind === "d20") {
              return {
                inputId: requirement.inputId,
                kind: "d20",
                requests: requirement.requests.map(({ identity, review }) => ({
                  identity,
                  observation: {
                    d20: {
                      aggregates: [],
                      trails: trailIdsOf(review).map((trailId) => ({
                        initialFace: opts.d20Face,
                        steps: [],
                        trailId,
                      })),
                    },
                    enteredModifiers: [],
                    tableOverride: null,
                  },
                  payments: [],
                })),
              };
            }
            if (requirement.kind === "dice") {
              const first = requirement.requests[0];
              if (!first) throw new Error("missing dice request");
              rolled[requirement.inputId] = trailIdsOf(first.roll).length;
              return {
                inputId: requirement.inputId,
                kind: "dice",
                requests: requirement.requests.map(({ identity, roll }) => ({
                  identity,
                  observation: {
                    aggregates: [],
                    trails: trailIdsOf(roll).map((trailId) => ({
                      initialFace: opts.diceFace,
                      steps: [],
                      trailId,
                    })),
                  },
                  payments: [],
                })),
              };
            }
            throw new Error(`unexpected requirement: ${requirement.kind}`);
          },
          capability: weaponCapability(),
          doc: opts.startDoc,
          occurrenceId: opts.occurrenceId,
          uid: "test-uid",
          world: opts.startWorld,
        });
        return {
          committed: commitDriven(opts.startDoc, "test-uid", opts.startWorld, outcome),
          rolled,
        };
      };

      // Two-handed hit: 12 + 7 (DEX +3, PB +4) = 19 vs AC 15 → one d10 + the
      // ability mod: 7 + 3 = 10 damage.
      const hit = runSwing({
        d20Face: 12,
        diceFace: 7,
        grip: "two-handed",
        occurrenceId: "swing-hit",
        startDoc: doc,
        startWorld: world,
      });
      expect(hit.rolled).toEqual({ "damage-roll-two-handed": 1 });
      expect(hit.committed.world.vitals.hitPoints.current).toBe(40);

      // One-handed crit: the DICE double (two d8), the +3 modifier applies once:
      // 6 + 6 + 3 = 15 damage.
      const afterHitDoc = { ...doc, session: hit.committed.session };
      const crit = runSwing({
        d20Face: 20,
        diceFace: 6,
        grip: "one-handed",
        occurrenceId: "swing-crit",
        startDoc: afterHitDoc,
        startWorld: hit.committed.world,
      });
      expect(crit.rolled).toEqual({ "damage-roll-crit": 2 });
      expect(crit.committed.world.vitals.hitPoints.current).toBe(25);

      // Miss: 2 + 7 = 9 < 15 — every damage input self-resolves with no roll.
      const afterCritDoc = { ...doc, session: crit.committed.session };
      const miss = runSwing({
        d20Face: 2,
        diceFace: 1,
        grip: "one-handed",
        occurrenceId: "swing-miss",
        startDoc: afterCritDoc,
        startWorld: crit.committed.world,
      });
      expect(miss.rolled).toEqual({});
      expect(miss.committed.world.vitals.hitPoints.current).toBe(25);
    }
  );
});
