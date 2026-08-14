import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import {
  characterFeatureActionCapability,
  characterMaterialRef,
  characterSelfRef,
  characterSlotDefinitionFacts,
  characterSpellCapability,
  characterWorldState,
  commitCharacterAction,
  undoCharacterAction,
} from "@/lib/mechanics-world-store";
import { activeEnginePulses } from "@/features/character/useMechanicsPulse";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import type { MechanicsAuthorityDefinition } from "@/types/mechanics-authority";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type { MechanicsAnswer } from "@/types/mechanics-program";
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
        hp: { ...MOCK_CHARACTER.session.hp, current: 12 },
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
});
