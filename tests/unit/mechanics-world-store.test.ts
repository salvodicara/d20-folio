import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import {
  boundaryCommitFacts,
  characterMaterialRef,
  characterSelfRef,
  characterWorldState,
  commitCharacterAction,
  engineConcentrationHandle,
  planEngineConcentrationEnd,
  undoCharacterAction,
} from "@/lib/mechanics-world-store";
import {
  characterSlotDefinitionFacts,
  characterSpellCapability,
  type CharacterCastCapability,
  type RecordedSpellId,
} from "./__helpers__/engine-spell-cast";

import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { concentrationValue } from "@/lib/concentration";
import { worldStandingActiveKeys } from "@/lib/world-standing-grants";
import { mechanicsAuthorityDefinitionFingerprint } from "@/lib/mechanics-authority";
import {
  mechanicsDefinitionFactAddress,
  mechanicsInstallationFactAddress,
} from "@/lib/mechanics-authority-ref";
import { mechanicsCapabilitySnapshotFingerprint } from "@/lib/mechanics-capability";
import {
  beginMechanicsCausalState,
  readMechanicsKernelProofStats,
  resetMechanicsKernelProofStats,
} from "@/lib/mechanics-world";
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

  it("casts a recorded spell program against the derived world and mirrors the slot", () => {
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

  // Three full coordinator replays (hit, crit, miss) over one persisted world
  // chain make this the suite's longest proof; give it explicit headroom.
});

describe("engine concentration swap e2e", () => {
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
    spellId: RecordedSpellId,
    derived: Parameters<typeof characterSpellCapability>[3]
  ): CharacterCastCapability => {
    const capability = characterSpellCapability(doc, "test-uid", spellId, derived);
    if (!capability) throw new Error(`${spellId}: no capability`);
    return capability;
  };

  // Two full coordinator drives (hit and miss) over the replay protocol;
  // headroom mirrors the weapon-attack proof above.

  it("a concentration swap ends the held spell and casts the next as two exact actions", () => {
    // The swap model the dispatchers ship: the confirmed swap ENDS the held
    // spell through the canonical kernel end (`planEngineConcentrationEnd`,
    // the exact seam `setConcentration("")` commits), then the new cast
    // commits against the clean world. Two exact journal actions, each
    // exactly reversible. (The compiler's own `concentration-replacement`
    // coordination exists but does not converge through the coordinator
    // today, so the one-action form stays out of reach.)
    resetMechanicsKernelProofStats();
    const doc = endgameDoc();
    const world = characterWorldState(doc, "test-uid", 60);
    if (!world) throw new Error("world fixture");
    const self = characterSelfRef(doc, "test-uid");
    const derived = {
      attackBonus: 0,
      castingModifier: 4,
      characterLevel: 17,
      maxHp: 60,
      saveDc: 15,
    };
    const castCommitted = (
      current: CharacterDoc,
      state: Readonly<CharacterMaterialState>,
      spellId: RecordedSpellId,
      occurrenceId: string
    ) => {
      const capability = spellCapabilityOrThrow(current, spellId, derived);
      const outcome = driveCapability({
        actionId: `cast-${occurrenceId}`,
        answerFor: answersBy({
          doc: current,
          self,
          slotLevel: 2,
          uid: "test-uid",
        }),
        capability: {
          ...capability,
          facts: [
            ...capability.facts,
            ...characterSlotDefinitionFacts(current, "test-uid", state),
          ],
        },
        doc: current,
        occurrenceId,
        uid: "test-uid",
        world: state,
      });
      return commitDriven(current, "test-uid", state, outcome);
    };

    // Cast the first concentration spell: the world holds it and the mirror
    // stamps the legacy session field.
    const first = castCommitted(doc, world, "bless", "swap-first");
    expect(engineConcentrationHandle(first.world)?.spellId).toBe("bless");
    expect(first.session.concentration).toBe("bless");

    // Exact action 1 — the canonical END of the held occurrence: the root and
    // its dependents end in one wave; the mirror clears the session field.
    const docAfterFirst = { ...doc, session: first.session };
    const endAction = planEngineConcentrationEnd(
      docAfterFirst,
      "test-uid",
      first.world,
      "swap-end-bless"
    );
    expect(endAction).not.toBeNull();
    if (!endAction) return;
    const ended = commitCharacterAction(
      docAfterFirst,
      "test-uid",
      first.world,
      endAction,
      boundaryCommitFacts(endAction)
    );
    expect(ended).not.toBeNull();
    if (!ended) return;
    expect(engineConcentrationHandle(ended.world)).toBeNull();
    expect(ended.session.concentration).toBe("");

    // Exact action 2 — the new cast commits against the clean world and the
    // mirror stamps the replacement spell.
    const docAfterEnd = { ...doc, session: ended.session };
    const second = castCommitted(docAfterEnd, ended.world, "moonbeam", "swap-second");
    expect(engineConcentrationHandle(second.world)?.spellId).toBe("moonbeam");
    expect(second.session.concentration).toBe("moonbeam");

    // Reversal: undoing the two exact actions in reverse order restores the
    // held spell AND its session mirror.
    const docAfterSecond = { ...doc, session: second.session };
    const undoneCast = undoCharacterAction(
      docAfterSecond,
      "test-uid",
      second.world,
      "cast-swap-second"
    );
    expect(undoneCast).not.toBeNull();
    if (!undoneCast) return;
    expect(engineConcentrationHandle(undoneCast.world)).toBeNull();
    expect(undoneCast.session.concentration).toBe("");
    const docAfterUndoCast = { ...doc, session: undoneCast.session };
    const undoneEnd = undoCharacterAction(
      docAfterUndoCast,
      "test-uid",
      undoneCast.world,
      "swap-end-bless"
    );
    expect(undoneEnd).not.toBeNull();
    if (!undoneEnd) return;
    expect(engineConcentrationHandle(undoneEnd.world)?.spellId).toBe("bless");
    expect(undoneEnd.session.concentration).toBe("bless");

    // Deterministic proof-work budget (the performance regression guard).
    const proofStats = readMechanicsKernelProofStats();
    expect(proofStats.causalProofs).toBeLessThanOrEqual(26);
    expect(proofStats.worldParses).toBeLessThanOrEqual(85);
  });
});

describe("warlock pact-slot e2e", () => {
  const warlockDoc = (): CharacterDoc => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.classes = [{ classId: "warlock", level: 3 }];
    doc.character.spellSlots = [{ level: 2, total: 2, pactMagic: true }];
    doc.session.spellSlots = { "pact-2": { used: 1 } };
    doc.session.concentration = "";
    return doc;
  };

  it("hex pays the pact slot: debit mirrored both sides, key + mark stand, undo restores", () => {
    const doc = warlockDoc();
    const world = characterWorldState(doc, "test-uid", 24);
    if (!world) throw new Error("world fixture");
    expect(world.resources.pactSpellSlot?.current).toBe(1);
    const capability = characterSpellCapability(doc, "test-uid", "hex", {
      attackBonus: 5,
      castingModifier: 3,
      characterLevel: 3,
      maxHp: 24,
      saveDc: 13,
    });
    if (!capability) throw new Error("hex capability");
    const material = characterMaterialRef(doc, "test-uid");
    const self = characterSelfRef(doc, "test-uid");
    const outcome = driveCapability({
      actionId: "cast-hex",
      answerFor: (requirement) => {
        if (requirement.kind === "resource") {
          // The pact pool answers the transcriber's pool-"either" selector.
          return {
            inputId: requirement.inputId,
            kind: "resource",
            resource: { character: material, kind: "pact-spell-slot" },
          };
        }
        if (requirement.kind === "entities") {
          // Solo play: the marked creature is table-abstract; the caster's
          // own entity is the world's physical stand-in.
          return { inputId: requirement.inputId, kind: "entities", targets: [self] };
        }
        throw new Error(`unexpected requirement: ${requirement.kind}`);
      },
      capability: {
        ...capability,
        facts: [
          ...capability.facts,
          ...characterSlotDefinitionFacts(doc, "test-uid", world),
        ],
      },
      doc,
      occurrenceId: "cast-hex-1",
      uid: "test-uid",
      world,
    });
    const committed = commitDriven(doc, "test-uid", world, outcome);

    // World side: the pact cell debits exactly one cast.
    expect(committed.world.resources.pactSpellSlot?.current).toBe(0);
    // Legacy side: the SAME debit lands on the `pact-2` usage counter.
    expect(committed.session.spellSlots["pact-2"]?.used).toBe(2);
    // The while-active buff stands as the world's `active-key` occurrence.
    expect([...worldStandingActiveKeys(committed.session.world)]).toContain("spell-hex");
    // Concentration mirrors onto the legacy session field.
    expect(committed.session.concentration).toBe(concentrationValue("hex"));

    // Undo restores BOTH sides exactly.
    if (!outcome.action) throw new Error("no action");
    const undone = undoCharacterAction(
      { ...doc, session: committed.session },
      "test-uid",
      committed.world,
      outcome.action.id
    );
    expect(undone).not.toBeNull();
    if (!undone) return;
    expect(undone.world.resources.pactSpellSlot?.current).toBe(1);
    expect(undone.session.spellSlots["pact-2"]?.used).toBe(1);
    expect(worldStandingActiveKeys(undone.session.world).has("spell-hex")).toBe(false);
    expect(undone.session.concentration).toBe("");
  });
});
