vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * The world-standing projection — the sheet's FIRST read of the persisted
 * engine world (`session.world`).
 *
 * Covers: (a) the pure projection (live `active-key` standings on self project;
 * ended / non-self / malformed entries fail closed); (b) the whole engine
 * pipeline as one motion — a SOLO encounter, an engine Shield cast whose
 * standing lifts the sheet's effective AC by +5 with NO legacy activation row,
 * then the solo turn boundary expiring the standing and dropping the AC back;
 * (c) rollout dedupe — a buff active BOTH ways (legacy chip + world standing)
 * evaluates its grants exactly once.
 */
import { describe, expect, it, vi } from "vitest";

import { effectiveAC } from "@/lib/aggregate-character";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import {
  boundaryCommitFacts,
  characterMaterialRef,
  characterSelfRef,
  characterSlotDefinitionFacts,
  characterSpellCapability,
  characterWorldState,
  commitCharacterAction,
  mechanicsAuthorityDefinition,
  planSoloEncounterStart,
  planSoloTurnBoundary,
  type CharacterCastCapability,
} from "@/lib/mechanics-world-store";
import {
  sessionActiveKeys,
  worldStandingActiveKeys,
  worldStandingTargetMarks,
} from "@/lib/world-standing-grants";
import { resolveActions } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsAnswer } from "@/types/mechanics-program";

import { makeCharacterDoc } from "./_helpers";

const UID = "test-uid";

function wizardDoc(): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "wizard", level: 5 });
  doc.character.spells = [{ srdId: "shield", prepared: true }];
  doc.character.spellSlots = [{ level: 1, total: 2 }];
  doc.session.spellSlots = {};
  return doc;
}

/** One live self-targeted `active-key` standing, shaped as persisted. */
function standing(key: string, over: Record<string, unknown> = {}) {
  return {
    endRules: [],
    ending: null,
    fact: { key, kind: "active-key" },
    kind: "standing",
    ordinal: 7,
    origin: {
      execution: 1,
      kind: "program-step",
      phaseId: "resolve",
      root: {
        occurrence: {
          material: { characterId: "test-char", kind: "character-play", uid: UID },
          occurrenceId: "root-1",
        },
        ordinal: 1,
      },
      slot: 1,
      stepId: "standing-x",
    },
    parentId: "root-1",
    target: {
      entityId: "self",
      material: { characterId: "test-char", kind: "character-play", uid: UID },
    },
    ...over,
  };
}

/** Drive one spell capability through the coordinator's replay protocol. */
function drive(
  doc: Readonly<CharacterDoc>,
  world: Readonly<CharacterMaterialState>,
  capability: CharacterCastCapability,
  actionId: string
) {
  const material = characterMaterialRef(doc, UID);
  const self = characterSelfRef(doc, UID);
  const begun = beginMechanicsCausalState({
    documents: [{ kind: "character", material, state: world }],
    scope: material,
  });
  if (!begun.ok) throw new Error(`begin: ${begun.reason}`);
  const answers: MechanicsAnswer[] = [];
  const run = () =>
    runMechanicsCausalAction({
      answers,
      authoritySnapshot: {
        definitions: [mechanicsAuthorityDefinition(capability.authority)],
      },
      facts: [...capability.facts, ...characterSlotDefinitionFacts(doc, UID, world)],
      frameAnswers: [],
      intent: {
        actionId,
        factGuards: [],
        frame: {
          authority: capability.authority,
          invocation: {
            installation: capability.authority.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: world.epoch,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: {
              occurrence: { material, occurrenceId: `${actionId}-root` },
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
  for (let remaining = 8; outcome.status === "needs-answer" && remaining > 0; ) {
    const requirement = outcome.requirement;
    if (!requirement) throw new Error("missing requirement");
    if (requirement.kind === "resource") {
      answers.push({
        inputId: requirement.inputId,
        kind: "resource",
        resource: { character: material, kind: "standard-spell-slot", level: 1 },
      });
    } else if (requirement.kind === "entities") {
      answers.push({ inputId: requirement.inputId, kind: "entities", targets: [self] });
    } else {
      throw new Error(`unexpected requirement: ${requirement.kind}`);
    }
    outcome = run();
    remaining -= 1;
  }
  if (outcome.status !== "complete" || !outcome.action) {
    throw new Error(`${actionId}: ${JSON.stringify(outcome).slice(0, 400)}`);
  }
  return outcome;
}

/** Commit one planned action, echoing its guard expectations as facts. */
function commit(
  doc: Readonly<CharacterDoc>,
  world: Readonly<CharacterMaterialState>,
  action: NonNullable<ReturnType<typeof drive>["action"]>
) {
  const committed = commitCharacterAction(
    doc,
    UID,
    world,
    action,
    boundaryCommitFacts(action)
  );
  if (!committed) throw new Error("commit failed");
  return committed;
}

describe("worldStandingActiveKeys (the pure projection)", () => {
  it("projects live self-targeted active-key standings and nothing else", () => {
    const world = {
      occurrences: {
        live: standing("spell-shield"),
        ended: standing("spell-blur", { ending: { causes: [{ kind: "requested" }] } }),
        marked: standing("hex-mark", {
          fact: {
            kind: "target-mark",
            markId: "hex",
            marked: {
              entityId: "self",
              material: { characterId: "test-char", kind: "character-play", uid: UID },
            },
          },
        }),
        foreign: standing("their-buff", {
          target: {
            entityId: "goblin-1",
            material: { characterId: "test-char", kind: "character-play", uid: UID },
            ordinal: 2,
          },
        }),
      },
    };
    expect([...worldStandingActiveKeys(world)]).toEqual(["spell-shield"]);
  });

  it("fails closed on malformed or absent worlds", () => {
    expect(worldStandingActiveKeys(undefined).size).toBe(0);
    expect(worldStandingActiveKeys(null).size).toBe(0);
    expect(worldStandingActiveKeys("garbage").size).toBe(0);
    expect(worldStandingActiveKeys({ occurrences: 3 }).size).toBe(0);
    expect(
      worldStandingActiveKeys({
        occurrences: {
          broken: { kind: "standing", ending: null, fact: { kind: "active-key" } },
        },
      }).size
    ).toBe(0);
  });

  it("lifts effective AC through the aggregate seam when a standing lives", () => {
    const doc = wizardDoc();
    const base = effectiveAC(doc.character, doc.session);
    const session = {
      ...doc.session,
      world: { occurrences: { live: standing("spell-shield") } },
    };
    expect(effectiveAC(doc.character, session)).toBe(base + 5);
  });

  it("dedupes a buff active both ways (legacy chip + world standing)", () => {
    const doc = wizardDoc();
    const base = effectiveAC(doc.character, doc.session);
    const session = {
      ...doc.session,
      activeFeatures: ["spell-shield"],
      world: { occurrences: { live: standing("spell-shield") } },
    };
    // One grant evaluation, not two: +5, never +10.
    expect(effectiveAC(doc.character, session)).toBe(base + 5);
  });
});

describe("engine Shield standing on the sheet (the whole pipeline)", () => {
  it("casts Shield in solo combat: AC +5 while the standing lives, gone at the boundary", () => {
    const doc = wizardDoc();
    const baseAc = effectiveAC(doc.character, doc.session);
    const world = characterWorldState(doc, UID, doc.character.hp.max);
    if (!world) throw new Error("world fixture");

    // Start the SOLO encounter on the character's own material.
    const start = planSoloEncounterStart(doc, UID, world, 1, "start-solo");
    if (!start) throw new Error("solo start");
    const inCombat = commit(doc, world, start);
    const doc2: CharacterDoc = { ...doc, session: inCombat.session };

    // Cast Shield through the engine: the while-active buff lands as a
    // WORLD standing occurrence, never a legacy activation row.
    const capability = characterSpellCapability(doc2, UID, "shield", {
      attackBonus: 5,
      castingModifier: 3,
      characterLevel: 5,
      maxHp: doc.character.hp.max,
      saveDc: 13,
    });
    if (!capability) throw new Error("shield capability");
    const outcome = drive(doc2, inCombat.world, capability, "cast-shield");
    if (!outcome.action) throw new Error("no action");
    const cast = commit(doc2, inCombat.world, outcome.action);
    const doc3: CharacterDoc = { ...doc2, session: cast.session };

    // The standing projects: +5 AC on the sheet, session untouched by the
    // legacy activation machinery, and the world's slot debit mirrored.
    expect([...worldStandingActiveKeys(cast.session.world)]).toContain("spell-shield");
    expect(effectiveAC(doc3.character, doc3.session)).toBe(baseAc + 5);
    expect(doc3.session.activeFeatures ?? []).not.toContain("spell-shield");
    expect(doc3.session.spellSlots["1"]?.used).toBe(1);

    // Complete the solo turn TWICE: Shield holds until the start of the
    // caster's NEXT turn, so the first boundary (which starts that next turn)
    // expires it exactly there — the second proves it stays gone.
    const boundary = planSoloTurnBoundary(doc3, UID, cast.world, "solo-turn-1");
    if (!boundary) throw new Error("turn boundary");
    const afterTurn = commit(doc3, cast.world, boundary);
    const doc4: CharacterDoc = { ...doc3, session: afterTurn.session };
    expect([...worldStandingActiveKeys(afterTurn.session.world)]).not.toContain(
      "spell-shield"
    );
    expect(effectiveAC(doc4.character, doc4.session)).toBe(baseAc);
  });
});

describe("hex rider parity (legacy chip vs engine standing)", () => {
  const hexWarlock = (session: Partial<CharacterDoc["session"]> = {}): CharacterDoc => {
    const doc = makeCharacterDoc({ classId: "warlock", level: 3 });
    doc.character.spells = [
      { srdId: "hex", prepared: true },
      { srdId: "eldritch-blast", prepared: true },
    ];
    doc.character.spellSlots = [{ level: 2, total: 2, pactMagic: true }];
    doc.character.weapons = [{ srdId: "dagger", quantity: 1 }];
    doc.session = { ...doc.session, spellSlots: {}, ...session };
    return doc;
  };

  /** The "vs cursed target" rider chips of one action row. */
  const cursedRiders = (doc: CharacterDoc, rowMatch: (row: { id: string }) => boolean) =>
    resolveActions(doc)
      .filter(rowMatch)
      .flatMap((row) =>
        (row.summary.extraDamage ?? []).filter(
          (entry) => entry.vsMarkedTarget === "cursed"
        )
      );

  it("weapon and spell-attack rows offer the same +1d6 chip either way", () => {
    const legacy = hexWarlock({ activeFeatures: ["spell-hex"] });
    const engine = hexWarlock({
      activeFeatures: [],
      world: { occurrences: { live: standing("spell-hex") } },
    });
    const inert = hexWarlock();

    for (const rowMatch of [
      (row: { id: string }) => row.id.startsWith("weapon-"),
      (row: { id: string }) => row.id === "spell-eldritch-blast",
    ]) {
      const legacyRiders = cursedRiders(legacy, rowMatch);
      const engineRiders = cursedRiders(engine, rowMatch);
      // Hex inactive: no chip. Active either way: the IDENTICAL chip.
      expect(cursedRiders(inert, rowMatch)).toHaveLength(0);
      expect(legacyRiders.length).toBeGreaterThan(0);
      expect(engineRiders).toEqual(legacyRiders);
      expect(engineRiders[0]).toMatchObject({
        damageType: "necrotic",
        dice: "1d6",
        vsMarkedTarget: "cursed",
      });
    }
  });

  it("projects the live mark and drops it when the standing ends", () => {
    const live = {
      occurrences: {
        key: standing("spell-hex"),
        mark: standing("spell-hex-mark", {
          fact: {
            kind: "target-mark",
            markId: "cursed",
            marked: {
              entityId: "self",
              material: { characterId: "test-char", kind: "character-play", uid: UID },
            },
          },
        }),
      },
    };
    expect([...worldStandingTargetMarks(live)]).toEqual(["cursed"]);
    const ended = {
      occurrences: {
        mark: standing("spell-hex-mark", {
          ending: { causes: [{ kind: "requested" }] },
          fact: {
            kind: "target-mark",
            markId: "cursed",
            marked: {
              entityId: "self",
              material: { characterId: "test-char", kind: "character-play", uid: UID },
            },
          },
        }),
      },
    };
    expect(worldStandingTargetMarks(ended).size).toBe(0);
    expect(worldStandingTargetMarks(undefined).size).toBe(0);
  });

  it("unions chips and standings into one active-key set", () => {
    expect([
      ...sessionActiveKeys({
        activeFeatures: ["rage"],
        world: { occurrences: { live: standing("spell-hex") } },
      }),
    ]).toEqual(["rage", "spell-hex"]);
    // Dedupe by identity: both ways active is still ONE key.
    expect(
      sessionActiveKeys({
        activeFeatures: ["spell-hex"],
        world: { occurrences: { live: standing("spell-hex") } },
      }).size
    ).toBe(1);
  });
});
