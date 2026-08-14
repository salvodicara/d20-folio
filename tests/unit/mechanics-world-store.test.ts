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
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { CONJURED_ITEM_BLUEPRINTS, CONJURED_ITEM_PROGRAMS } from "@/data/conjured-items";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
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

  it("derives a pact caster's world with the pact pool as a bare count cell", () => {
    // Regression pin: a wrapped {cell, level} pact seed fails the material
    // parser and silently degraded EVERY pact caster to the legacy path.
    const warlock = structuredClone(MOCK_CHARACTER);
    warlock.character.classes = [{ classId: "warlock", level: 3 }];
    warlock.character.spellSlots = [{ level: 2, total: 2, pactMagic: true }];
    warlock.session.spellSlots = { "pact-2": { used: 1 } };
    const world = characterWorldState(warlock, "test-uid", 24);
    expect(world).not.toBeNull();
    if (!world) return;
    expect(world.resources.pactSpellSlot).toMatchObject({ current: 1, kind: "count" });
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

describe("corpus endgame e2e", () => {
  /** A high-level single-class doc (9th-level slots) with clean usage. */
  const endgameDoc = (session: Partial<CharacterDoc["session"]> = {}): CharacterDoc => ({
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      classes: [{ classId: "bard", level: 17, subclassId: "college-of-lore" }],
    },
    session: {
      ...MOCK_CHARACTER.session,
      hp: { ...MOCK_CHARACTER.session.hp, current: 50, temp: 0 },
      spellSlots: {},
      trackers: {},
      ...session,
    },
  });

  /** Generic answer factory: entities/self, d20 by face, dice by face. */
  const answersBy = (opts: {
    readonly d20Face?: number;
    readonly diceFace?: number;
    readonly booleans?: Readonly<Record<string, boolean>>;
    readonly integers?: Readonly<Record<string, readonly number[]>>;
    readonly self: ReturnType<typeof characterSelfRef>;
    readonly slotLevel?: number;
    readonly targets?: number;
    readonly uid: string;
    readonly doc: CharacterDoc;
  }) => {
    return (requirement: MechanicsRequirement): MechanicsAnswer => {
      if (requirement.kind === "resource") {
        return {
          inputId: requirement.inputId,
          kind: "resource",
          resource: {
            character: characterMaterialRef(opts.doc, opts.uid),
            kind: "standard-spell-slot",
            level: opts.slotLevel ?? 1,
          },
        };
      }
      if (requirement.kind === "entities") {
        return {
          inputId: requirement.inputId,
          kind: "entities",
          targets: Array.from({ length: opts.targets ?? 1 }, () => opts.self),
        };
      }
      if (requirement.kind === "boolean") {
        return {
          inputId: requirement.inputId,
          kind: "boolean",
          value: opts.booleans?.[requirement.inputId] ?? true,
        };
      }
      if (requirement.kind === "integer") {
        const values = opts.integers?.[requirement.inputId];
        if (values === undefined || requirement.requests === undefined) {
          throw new Error(`unexpected integer requirement: ${requirement.inputId}`);
        }
        return {
          inputId: requirement.inputId,
          kind: "integer",
          requests: requirement.requests.map(({ identity }, index) => ({
            identity,
            value: values[index] ?? 0,
          })),
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
                  initialFace: opts.d20Face ?? 10,
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
        return {
          inputId: requirement.inputId,
          kind: "dice",
          requests: requirement.requests.map(({ identity, roll }) => ({
            identity,
            observation: {
              aggregates: [],
              trails: trailIdsOf(roll).map((trailId) => ({
                initialFace: opts.diceFace ?? 4,
                steps: [],
                trailId,
              })),
            },
            payments: [],
          })),
        };
      }
      throw new Error(`unexpected requirement: ${requirement.kind}`);
    };
  };

  const spellCapabilityOrThrow = (
    doc: CharacterDoc,
    spellId: string,
    derived: Parameters<typeof characterSpellCapability>[3]
  ): CharacterCastCapability => {
    const capability = characterSpellCapability(doc, "test-uid", spellId, derived);
    if (!capability) throw new Error(`${spellId}: no capability`);
    return capability;
  };

  it("greater restoration removes one exhaustion level and mirrors the legacy session", () => {
    const doc = endgameDoc({ exhaustion: 3 });
    const world = characterWorldState(doc, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    expect(world.exhaustion).toBe(3);
    const capability = spellCapabilityOrThrow(doc, "greater-restoration", {
      attackBonus: 0,
      castingModifier: 4,
      characterLevel: 17,
      maxHp: 60,
      saveDc: 15,
    });
    const self = characterSelfRef(doc, "test-uid");
    const outcome = driveCapability({
      actionId: "cast-greater-restoration",
      answerFor: answersBy({ doc, self, slotLevel: 5, uid: "test-uid" }),
      capability: {
        ...capability,
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(doc, "test-uid", world),
        ],
      },
      doc,
      occurrenceId: "greater-restoration-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);
    expect(committed.world.exhaustion).toBe(2);
    expect(committed.session.exhaustion).toBe(2);
    expect(committed.world.resources.standardSpellSlots["5"]?.current).toBe(
      (world.resources.standardSpellSlots["5"]?.current ?? 0) - 1
    );
  });

  it("divine smite lands its base dice plus the confirmed creature-type bonus", () => {
    const doc = endgameDoc();
    const world = characterWorldState(doc, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    const capability = spellCapabilityOrThrow(doc, "divine-smite", {
      attackBonus: 0,
      castingModifier: 3,
      characterLevel: 17,
      maxHp: 60,
      saveDc: 15,
    });
    const self = characterSelfRef(doc, "test-uid");
    const outcome = driveCapability({
      actionId: "cast-divine-smite",
      answerFor: answersBy({
        booleans: { "bonus-type-confirm": true },
        doc,
        self,
        slotLevel: 1,
        uid: "test-uid",
      }),
      capability: {
        ...capability,
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(doc, "test-uid", world),
        ],
      },
      doc,
      occurrenceId: "divine-smite-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);
    // 2d8 base (2 x 4) plus the confirmed 1d8 undead/fiend bonus (4): 50 - 12.
    expect(committed.world.vitals.hitPoints.current).toBe(38);
  });

  // Two full coordinator drives (hit and miss) over the replay protocol;
  // headroom mirrors the weapon-attack proof above.
  it(
    "vampiric touch heals the caster half the necrotic damage it landed",
    { timeout: 30000 },
    () => {
      const doc = endgameDoc();
      const world = characterWorldState(doc, "test-uid", 60);
      if (!world) throw new Error("world fixture");
      const capability = spellCapabilityOrThrow(doc, "vampiric-touch", {
        attackBonus: 5,
        castingModifier: 4,
        characterLevel: 17,
        maxHp: 60,
        saveDc: 15,
        targetArmorClass: 15,
      });
      const self = characterSelfRef(doc, "test-uid");
      const drive = (d20Face: number, occurrenceId: string) =>
        commitDriven(
          doc,
          "test-uid",
          world,
          driveCapability({
            actionId: `cast-${occurrenceId}`,
            answerFor: answersBy({
              d20Face,
              doc,
              self,
              slotLevel: 3,
              uid: "test-uid",
            }),
            capability: {
              ...capability,
              facts: [
                ...capability.facts,
                ...characterSlotDefinitionFacts(doc, "test-uid", world),
              ],
            },
            doc,
            occurrenceId,
            uid: "test-uid",
            world,
          })
        );
      // Hit (12 + 5 vs AC 15): 3d6 necrotic lands 12, the caster leeches
      // floor(12 / 2) = 6 back in the same action: 50 - 12 + 6 = 44.
      expect(drive(12, "vampiric-hit").world.vitals.hitPoints.current).toBe(44);
      // Miss (3 + 5): the zero-filled landed ledger heals exactly nothing.
      expect(drive(3, "vampiric-miss").world.vitals.hitPoints.current).toBe(50);
    }
  );

  it("mass heal splits the chosen pool portions across the target slots", () => {
    const doc = endgameDoc({
      hp: { ...MOCK_CHARACTER.session.hp, current: 12, temp: 0 },
    });
    const world = characterWorldState(doc, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    expect(world.resources.standardSpellSlots["9"]?.current).toBeGreaterThan(0);
    const capability = spellCapabilityOrThrow(doc, "mass-heal", {
      attackBonus: 0,
      castingModifier: 4,
      characterLevel: 17,
      maxHp: 60,
      saveDc: 15,
    });
    const self = characterSelfRef(doc, "test-uid");
    const outcome = driveCapability({
      actionId: "cast-mass-heal",
      answerFor: answersBy({
        doc,
        integers: { portions: [13, 20] },
        self,
        slotLevel: 9,
        targets: 2,
        uid: "test-uid",
      }),
      capability: {
        ...capability,
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(doc, "test-uid", world),
        ],
      },
      doc,
      occurrenceId: "mass-heal-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);
    // Two slot identities of the same creature: 12 + 13 + 20 = 45.
    expect(committed.world.vitals.hitPoints.current).toBe(45);
  });

  it("geas scales the charmed lifetime by the chosen slot level", () => {
    const doc = endgameDoc();
    const world = characterWorldState(doc, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    const capability = spellCapabilityOrThrow(doc, "geas", {
      attackBonus: 0,
      castingModifier: 4,
      characterLevel: 17,
      maxHp: 60,
      saveDc: 15,
    });
    const self = characterSelfRef(doc, "test-uid");
    const charmedAt = (slotLevel: number, occurrenceId: string) => {
      const committed = commitDriven(
        doc,
        "test-uid",
        world,
        driveCapability({
          actionId: `cast-${occurrenceId}`,
          answerFor: answersBy({
            d20Face: 1,
            doc,
            self,
            slotLevel,
            uid: "test-uid",
          }),
          capability: {
            ...capability,
            facts: [
              ...capability.facts,
              ...characterSlotDefinitionFacts(doc, "test-uid", world),
            ],
          },
          doc,
          occurrenceId,
          uid: "test-uid",
          world,
        })
      );
      const charmed = Object.values(committed.world.occurrences).filter(
        (occurrence) =>
          occurrence.kind === "condition" && occurrence.conditionId === "charmed"
      );
      expect(charmed).toHaveLength(1);
      return charmed[0];
    };
    // A 7th-level slot: the year tier (365 days) owns the duration clock.
    const year = charmedAt(7, "geas-seven");
    expect(
      year?.endRules.some(
        (rule) =>
          rule.kind === "time-reached" && rule.elapsedSeconds === 365 * 24 * 60 * 60
      )
    ).toBe(true);
    // A 9th-level slot: the indefinite tier keeps a table-owned manual end.
    const indefinite = charmedAt(9, "geas-nine");
    expect(indefinite?.endRules).toHaveLength(0);
  });

  it("goodberry conjures the berry batch and one eaten berry heals exactly 1", () => {
    const doc = endgameDoc({
      hp: { ...MOCK_CHARACTER.session.hp, current: 30, temp: 0 },
    });
    const world = characterWorldState(doc, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    const base = spellCapabilityOrThrow(doc, "goodberry", {
      attackBonus: 0,
      castingModifier: 4,
      characterLevel: 17,
      maxHp: 60,
      saveDc: 15,
    });
    // The store closes the authority; the conjured-item blueprint rides the
    // snapshot's closed blueprint channel (the world-store wiring the modal
    // agent lands reuses this exact map).
    const capability: CharacterCastCapability = {
      ...base,
      authority: {
        ...base.authority,
        snapshot: {
          ...base.authority.snapshot,
          blueprints: { entities: {}, items: CONJURED_ITEM_BLUEPRINTS },
        },
      },
    };
    const self = characterSelfRef(doc, "test-uid");
    const outcome = driveCapability({
      actionId: "cast-goodberry",
      answerFor: answersBy({ doc, self, slotLevel: 1, uid: "test-uid" }),
      capability: {
        ...capability,
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(doc, "test-uid", world),
        ],
      },
      doc,
      occurrenceId: "goodberry-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);
    const copies = Object.entries(committed.world.inventory);
    expect(copies).toHaveLength(1);
    const [instanceId, instance] = copies[0] ?? ["", null];
    expect(instance).toMatchObject({
      definition: { itemId: "goodberry-berry" },
      quantity: { current: 10 },
    });
    // The batch expires on the authored 24-hour clock.
    const lifecycle = Object.values(committed.world.occurrences).find(
      (occurrence) => occurrence.kind === "material-lifecycle"
    );
    expect(
      lifecycle?.endRules.some(
        (rule) => rule.kind === "time-reached" && rule.elapsedSeconds === 24 * 3600
      )
    ).toBe(true);

    // Eating one berry: the item-sourced canonical program pays 1 quantity
    // from THIS instance and heals exactly 1.
    const material = characterMaterialRef(doc, "test-uid");
    const berryProgram = conformMechanicsProgram(
      CONJURED_ITEM_PROGRAMS["goodberry-berry"]
    );
    expect(berryProgram).not.toBeNull();
    if (!berryProgram || !instance) return;
    const berryCapabilityRef = {
      capabilityId: berryProgram.id,
      definition: {
        catalogueKind: "item" as const,
        entityId: "goodberry-berry",
        kind: "catalogue" as const,
        mechanicsRevision: canonicalFingerprint({ program: berryProgram }),
      },
      kind: "program" as const,
    };
    const berryAuthority = {
      anchors: {
        activator: self,
        caster: self,
        owner: self,
        source: self,
        target: self,
      },
      installation: {
        capability: berryCapabilityRef,
        generation: 1,
        installationId: `item.${instanceId}`,
        owner: self,
      },
      schema: 1,
      snapshot: {
        grantGroups: {},
        program: berryProgram,
        ref: berryCapabilityRef,
        resources: {},
        schema: 1,
      },
      source: {
        instanceId,
        instanceOrdinal: instance.ordinal,
        kind: "inventory-item" as const,
        owner: material,
      },
      staticBindings: {},
    } as CharacterCastCapability["authority"];
    const quantityDefinitionFact = {
      address: ["resource-definition", "inventory", instanceId, "quantity"] as const,
      expected: {
        present: true,
        value: {
          bindings: {},
          spec: {
            capacity: { kind: "unbounded" as const },
            id: "quantity",
            initial: { kind: "empty" as const },
            kind: "count" as const,
            recoveries: [],
          },
        },
      },
      lifecycle: "commit" as const,
      owner: self,
    };
    const eaten = driveCapability({
      actionId: "eat-goodberry",
      answerFor: (requirement) => {
        if (requirement.kind === "resource") {
          return {
            inputId: requirement.inputId,
            kind: "resource",
            resource: {
              character: material,
              instanceId,
              instanceOrdinal: instance.ordinal,
              kind: "item-quantity",
            },
          };
        }
        if (requirement.kind === "entities") {
          return { inputId: requirement.inputId, kind: "entities", targets: [self] };
        }
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      },
      capability: {
        authority: berryAuthority,
        facts: [
          {
            address: ["hit-point-maximum"],
            expected: { present: true, value: 60 },
            lifecycle: "commit-redo",
            owner: self,
          },
          quantityDefinitionFact,
        ],
        transcription: {
          clauses: [],
          entityId: "goodberry-berry",
          program: berryProgram,
        },
      },
      doc,
      occurrenceId: "goodberry-eat-1",
      uid: "test-uid",
      world: committed.world,
    });
    const afterEating = commitDriven(doc, "test-uid", committed.world, eaten);
    expect(afterEating.world.vitals.hitPoints.current).toBe(31);
    expect(afterEating.world.inventory[instanceId]?.quantity.current).toBe(9);
  });
});
