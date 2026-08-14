/**
 * The SOLO combat loop's canonical turn machinery (mechanics-world-store):
 * the self turn-economy projection, the local single-participant encounter,
 * the `complete-turn` boundary (round advance, fresh turn key, per-turn claim
 * reset, exact turn-anchored expiry mirrored off the legacy chips), the
 * kernel's per-turn claim rejection, and the engine-damage Concentration
 * prompt seam (`queueConcentrationSaveForDamage`).
 */

import { afterEach, describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { concentrationValue } from "@/lib/concentration";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { transcribeFeatureAction } from "@/lib/mechanics-transcription";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import {
  boundaryCommitFacts,
  characterMaterialRef,
  characterSelfRef,
  characterTrackerSeeds,
  characterTurnEconomy,
  characterTurnEconomyProjection,
  characterWorldState,
  commitCharacterAction,
  mechanicsAuthorityDefinition,
  planSoloEncounterEnd,
  planSoloEncounterStart,
  planSoloTurnBoundary,
  SOLO_PARTICIPANT_ID,
} from "@/lib/mechanics-world-store";
import {
  advanceSoloWorldTurn,
  endSoloWorldEncounter,
} from "@/features/character/center/solo-world-turn";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsCoordinationResult } from "@/types/mechanics-coordinator";
import type { MechanicsAnswer } from "@/types/mechanics-program";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

const UID = "test-uid";

function fixture(session: Parameters<typeof makeCharacterDoc>[1] = {}): CharacterDoc {
  return makeCharacterDoc(
    { classId: "fighter", level: 5 },
    { concentration: "", ...session }
  );
}

function worldFor(doc: CharacterDoc): Readonly<CharacterMaterialState> {
  const world = characterWorldState(
    doc,
    UID,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) throw new Error("world derivation failed");
  return world;
}

/** Commit one planned action and rethread the doc/world pair. */
function committed(
  doc: CharacterDoc,
  world: Readonly<CharacterMaterialState>,
  action: NonNullable<ReturnType<typeof planSoloTurnBoundary>>
): { doc: CharacterDoc; world: Readonly<CharacterMaterialState> } {
  const commit = commitCharacterAction(
    doc,
    UID,
    world,
    action,
    boundaryCommitFacts(action)
  );
  if (!commit) throw new Error("commit failed");
  return { doc: { ...doc, session: commit.session }, world: commit.world };
}

function startedSolo(
  doc: CharacterDoc,
  round = 1
): { doc: CharacterDoc; world: Readonly<CharacterMaterialState> } {
  const world = worldFor(doc);
  const start = planSoloEncounterStart(doc, UID, world, round, `start-${round}`);
  if (!start) throw new Error("solo start rejected");
  return committed(doc, world, start);
}

/** Close one authored program into a self-anchored executable authority. */
function authoredAuthority(
  doc: CharacterDoc,
  programValue: unknown
): Readonly<MechanicsProgramAuthorityReceipt> {
  const program = conformMechanicsProgram(programValue);
  if (!program) throw new Error("program authoring rejected");
  const self = characterSelfRef(doc, UID);
  const capability = {
    capabilityId: program.id,
    definition: {
      catalogueKind: "spell" as const,
      entityId: program.id,
      kind: "catalogue" as const,
      mechanicsRevision: canonicalFingerprint({ program }),
    },
    kind: "program" as const,
  };
  const authority = conformMechanicsProgramAuthorityReceipt({
    anchors: { activator: self, caster: self, owner: self, source: self, target: self },
    installation: {
      capability,
      generation: 1,
      installationId: program.id,
      owner: self,
    },
    schema: 1,
    snapshot: {
      grantGroups: {},
      program,
      ref: capability,
      resources: {},
      schema: 1,
    },
    source: { capability, kind: "capability", owner: self },
    staticBindings: {},
  });
  if (!authority) throw new Error("authority receipt rejected");
  return authority;
}

/** Drive one authored authority through the coordinator over the live world. */
function drive(
  doc: CharacterDoc,
  world: Readonly<CharacterMaterialState>,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  actionId: string,
  answers: readonly Readonly<MechanicsAnswer>[] = []
): Readonly<MechanicsCoordinationResult> {
  const material = characterMaterialRef(doc, UID);
  const state = beginMechanicsCausalState({
    documents: [{ kind: "character", material, state: world }],
    scope: material,
  });
  if (!state.ok) throw new Error(`causal state: ${state.reason}`);
  return runMechanicsCausalAction({
    answers,
    authoritySnapshot: { definitions: [mechanicsAuthorityDefinition(authority)] },
    facts: [
      {
        address: ["hit-point-maximum"],
        expected: { present: true, value: doc.character.hp.max },
        lifecycle: "commit-redo",
        owner: characterSelfRef(doc, UID),
      },
    ],
    frameAnswers: [],
    intent: {
      actionId,
      factGuards: [],
      frame: {
        authority,
        invocation: {
          installation: authority.installation,
          kind: "installed-capability",
        },
        rootReceipt: {
          kind: "create",
          materialEpoch: world.epoch,
          next: { execution: 1, phaseId: "resolve", triggerEventId: null },
          root: {
            occurrence: {
              material,
              occurrenceId: `${actionId}-${world.nextOccurrenceOrdinal}`,
            },
            ordinal: world.nextOccurrenceOrdinal,
          },
        },
        trigger: { kind: "invocation" },
      },
    },
    responses: [],
    state: state.value,
    turnEconomy: characterTurnEconomy(doc, UID),
  });
}

/** One-step program claiming a `magic` action for the owner's turn. */
function magicClaimProgram(id: string, claimId: string): unknown {
  return {
    id,
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            claim: {
              action: { kind: "magic" },
              claimId,
              kind: "claim-action",
            },
            combatant: "owner",
            kind: "turn-claim",
            stepId: "claim",
            when: null,
          },
          { kind: "end-program", stepId: "finish", when: null },
        ],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  };
}

/** One-round self condition (ends at the owner's own turn-end boundary). */
function oneTurnConditionProgram(id: string, conditionId: string): unknown {
  const lifetime = {
    combatant: "owner",
    kind: "turn-boundary",
    offsetTurns: { kind: "fixed", value: 1 },
    phase: "end",
  } as const;
  return {
    id,
    lifetime: [lifetime],
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            conditionId,
            kind: "condition",
            lifetime,
            operation: "apply",
            stepId: "apply-condition",
            target: { kind: "role", role: "owner" },
            when: null,
          },
        ],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  };
}

function selfEconomy(world: Readonly<CharacterMaterialState>) {
  const participant = world.encounter?.participants[SOLO_PARTICIPANT_ID];
  if (!participant) throw new Error("missing solo participant");
  return participant.economy;
}

afterEach(() => {
  useCharacterStore.setState({
    character: null,
    combatPendingConcentrationSaves: [],
    readonly: false,
  });
  useAuthStore.setState({ user: null });
  useCombatStore.getState().endCombat();
  useToastStore.setState({ toasts: [], timers: {} });
});

describe("characterTurnEconomyProjection", () => {
  it("derives a conformed self projection from the build seams", () => {
    const doc = fixture();
    const projection = characterTurnEconomyProjection(doc);
    expect(projection).not.toBeNull();
    // Fighter 5 has Extra Attack: two attacks per Attack action.
    expect(projection?.attacks.perAttackAction.base).toBe(2);
    expect(projection?.movement.modes[0]?.mode).toBe("walk");
    expect(projection?.movement.modes[0]?.speedFt.base).toBeGreaterThan(0);
    expect(projection?.incapacitated).toBe(false);
    const entries = characterTurnEconomy(doc, UID);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.combatant).toEqual(characterSelfRef(doc, UID));
  });

  it("flags incapacitation from the live condition chips", () => {
    const doc = fixture({ conditions: ["stunned"] });
    expect(characterTurnEconomyProjection(doc)?.incapacitated).toBe(true);
  });
});

describe("the solo encounter lifecycle", () => {
  it("starts a single-participant encounter in the turns phase", () => {
    const doc = fixture();
    const { world } = startedSolo(doc, 3);
    expect(world.encounter?.phase).toBe("turns");
    expect(world.encounter?.round).toBe(3);
    expect(world.encounter?.currentCombatantId).toBe(SOLO_PARTICIPANT_ID);
    expect(world.encounter?.participants[SOLO_PARTICIPANT_ID]?.combatant).toEqual(
      characterSelfRef(doc, UID)
    );
    expect(selfEconomy(world).phase).toBe("own-turn");
    // A second start over the running encounter is refused.
    expect(planSoloEncounterStart(doc, UID, world, 3, "twice")).toBeNull();
  });

  it("advances the round with a fresh turn key on complete-turn", () => {
    const doc = fixture();
    const started = startedSolo(doc);
    const beforeKey = selfEconomy(started.world).turnId;
    const secondsBefore = started.world.timeline.elapsedSeconds;
    const boundary = planSoloTurnBoundary(started.doc, UID, started.world, "turn-1");
    expect(boundary).not.toBeNull();
    if (!boundary) return;
    const advanced = committed(started.doc, started.world, boundary);
    expect(advanced.world.encounter?.round).toBe(2);
    expect(selfEconomy(advanced.world).phase).toBe("own-turn");
    expect(selfEconomy(advanced.world).turnId).not.toBe(beforeKey);
    expect(advanced.world.timeline.elapsedSeconds).toBe(secondsBefore + 6);
  });

  it("ends the solo encounter through the kernel boundary", () => {
    const doc = fixture();
    const started = startedSolo(doc);
    const end = planSoloEncounterEnd(started.doc, UID, started.world, "end-combat");
    expect(end).not.toBeNull();
    if (!end) return;
    const ended = committed(started.doc, started.world, end);
    expect(ended.world.encounter).toBeNull();
    expect(ended.world.clockBinding.encounter).toBeNull();
    // Ending again is a refused no-op plan.
    expect(planSoloEncounterEnd(ended.doc, UID, ended.world, "again")).toBeNull();
  });

  it("refuses the turn boundary while no solo encounter runs", () => {
    const doc = fixture();
    expect(planSoloTurnBoundary(doc, UID, worldFor(doc), "no-turn")).toBeNull();
  });
});

describe("per-turn kernel claims", () => {
  it("rejects a second capped claim in the SAME turn and allows it next round", () => {
    const doc = fixture();
    let state = startedSolo(doc);

    // First dispatch claims the turn's one action slot.
    const first = drive(
      state.doc,
      state.world,
      authoredAuthority(state.doc, magicClaimProgram("solo-claim-a", "solo.claim.a")),
      "claim-a"
    );
    expect(first.status).toBe("complete");
    if (first.status !== "complete" || !first.action) throw new Error("no action");
    state = committed(state.doc, state.world, first.action);
    expect(selfEconomy(state.world).actions).toHaveLength(1);

    // A DIFFERENT claim in the same turn exceeds the one-action budget: the
    // kernel claim rejects the whole dispatch and nothing changes.
    const second = drive(
      state.doc,
      state.world,
      authoredAuthority(state.doc, magicClaimProgram("solo-claim-b", "solo.claim.b")),
      "claim-b"
    );
    expect(second.status).toBe("rejected");
    expect(selfEconomy(state.world).actions).toHaveLength(1);

    // The round advances: the boundary opens a fresh turn with reset claims.
    const boundary = planSoloTurnBoundary(state.doc, UID, state.world, "turn-1");
    expect(boundary).not.toBeNull();
    if (!boundary) return;
    state = committed(state.doc, state.world, boundary);
    expect(selfEconomy(state.world).actions).toHaveLength(0);

    const third = drive(
      state.doc,
      state.world,
      authoredAuthority(state.doc, magicClaimProgram("solo-claim-b", "solo.claim.b")),
      "claim-b-next-round"
    );
    expect(third.status).toBe("complete");
  });

  it("rejects a turn claim while no solo encounter is running", () => {
    const doc = fixture();
    const outcome = drive(
      doc,
      worldFor(doc),
      authoredAuthority(doc, magicClaimProgram("solo-claim-idle", "solo.claim.idle")),
      "claim-idle"
    );
    expect(outcome.status).toBe("rejected");
  });

  it("a transcribed per-turn-capped action claims once, rejects the same-turn repeat and resets next round", () => {
    const doc = fixture();
    let state = startedSolo(doc);
    // The declared cap alone drives the emission: a free action capped at one
    // use per turn compiles the once-per-turn manual-boundary claim.
    const transcription = transcribeFeatureAction(
      "synthetic-cap",
      { grantsNextAttackAdvantage: true, maxUsesPerTurn: 1, type: "free" },
      0,
      {}
    );
    expect(transcription.program).not.toBeNull();
    expect(
      transcription.clauses.find((entry) => entry.clauseId === "per-turn-cap")
    ).toMatchObject({ detail: "manual-boundary-claim", status: "automated" });
    if (!transcription.program) return;
    const authority = authoredAuthority(doc, transcription.program);
    const noTargets: MechanicsAnswer[] = [
      { inputId: "targets", kind: "entities", targets: [] },
    ];

    const first = drive(state.doc, state.world, authority, "capped-a", noTargets);
    if (first.status !== "complete") throw new Error(JSON.stringify(first));
    if (!first.action) throw new Error("no action");
    state = committed(state.doc, state.world, first.action);
    expect(selfEconomy(state.world).manualBoundaries).toHaveLength(1);

    // The SAME action again this turn: the fresh root re-claims the recorded
    // boundary and the kernel rejects the whole dispatch.
    const second = drive(state.doc, state.world, authority, "capped-b", noTargets);
    expect(second.status).toBe("rejected");
    expect(selfEconomy(state.world).manualBoundaries).toHaveLength(1);

    // Next round: the boundary ledger resets and the capped use is legal again.
    const boundary = planSoloTurnBoundary(state.doc, UID, state.world, "capped-turn-1");
    expect(boundary).not.toBeNull();
    if (!boundary) return;
    state = committed(state.doc, state.world, boundary);
    expect(selfEconomy(state.world).manualBoundaries).toHaveLength(0);
    const third = drive(state.doc, state.world, authority, "capped-c", noTargets);
    expect(third.status).toBe("complete");
  });
});

describe("turn-anchored expiry mirrored off the legacy chips", () => {
  it("expires a 1-round condition exactly at the crossed boundary", () => {
    const doc = fixture();
    let state = startedSolo(doc);

    const applied = drive(
      state.doc,
      state.world,
      authoredAuthority(
        state.doc,
        oneTurnConditionProgram("solo-one-turn-poison", "poisoned")
      ),
      "apply-poison"
    );
    expect(applied.status).toBe("complete");
    if (applied.status !== "complete" || !applied.action) throw new Error("no action");
    state = committed(state.doc, state.world, applied.action);
    // The engine condition mirrors onto the legacy chips in the same commit.
    expect(state.doc.session.conditions).toContain("poisoned");
    const active = Object.values(state.world.occurrences).filter(
      (occurrence) => occurrence.kind === "condition" && occurrence.ending === null
    );
    expect(active).toHaveLength(1);

    // The solo round advances: the end wave finalizes the due lifetime and the
    // SAME commit clears the legacy chip.
    const boundary = planSoloTurnBoundary(state.doc, UID, state.world, "turn-1");
    expect(boundary).not.toBeNull();
    if (!boundary) return;
    state = committed(state.doc, state.world, boundary);
    const survivors = Object.values(state.world.occurrences).filter(
      (occurrence) => occurrence.kind === "condition" && occurrence.ending === null
    );
    expect(survivors).toHaveLength(0);
    expect(state.doc.session.conditions).not.toContain("poisoned");
  });
});

describe("advanceSoloWorldTurn wiring (the tracker's End-Turn seam)", () => {
  it("starts the world encounter lazily and advances it per round", () => {
    const doc = fixture();
    useCharacterStore.setState({ character: doc, loading: false, readonly: false });
    useAuthStore.setState({ user: { uid: UID } as User });
    useCombatStore.getState().setInitiative("17");

    // Round 1 ends: the world encounter starts at round 1 (with the entered
    // initiative) and the boundary advances it to round 2.
    advanceSoloWorldTurn(1);
    const after = useCharacterStore.getState().character;
    expect(after?.session.world).toBeDefined();
    const world = after ? worldFor(after) : null;
    expect(world?.encounter?.round).toBe(2);
    expect(world?.encounter?.participants[SOLO_PARTICIPANT_ID]?.initiativeRoll).toBe(17);

    // The next End Turn only fires the boundary (no second start).
    advanceSoloWorldTurn(2);
    const third = useCharacterStore.getState().character;
    expect(third ? worldFor(third).encounter?.round : null).toBe(3);

    // End Combat closes the world encounter through the kernel boundary.
    endSoloWorldEncounter();
    const ended = useCharacterStore.getState().character;
    expect(ended ? worldFor(ended).encounter : undefined).toBeNull();
  });

  it("is a fail-closed no-op without an authenticated owner", () => {
    const doc = fixture();
    useCharacterStore.setState({ character: doc, loading: false, readonly: false });
    useAuthStore.setState({ user: null });
    advanceSoloWorldTurn(1);
    expect(useCharacterStore.getState().character?.session.world).toBeUndefined();
  });
});

describe("queueConcentrationSaveForDamage", () => {
  it("queues the entered-d20 prompt at the RAW DC while concentrating", () => {
    const doc = makeCharacterDoc(
      { classId: "wizard", level: 5 },
      { concentration: concentrationValue("hold-person"), hp: { current: 20, temp: 0 } }
    );
    useCharacterStore.setState({ character: doc, readonly: false });
    useCharacterStore.getState().queueConcentrationSaveForDamage(26);
    const queue = useCharacterStore.getState().combatPendingConcentrationSaves;
    expect(queue).toHaveLength(1);
    expect(queue[0]?.spell).toBe("hold-person");
    expect(queue[0]?.damage).toBe(26);
    expect(queue[0]?.difficultyClass).toBe(13);
  });

  it("uses the DC 10 floor for small hits", () => {
    const doc = makeCharacterDoc(
      { classId: "wizard", level: 5 },
      { concentration: concentrationValue("hold-person"), hp: { current: 20, temp: 0 } }
    );
    useCharacterStore.setState({ character: doc, readonly: false });
    useCharacterStore.getState().queueConcentrationSaveForDamage(7);
    expect(
      useCharacterStore.getState().combatPendingConcentrationSaves[0]?.difficultyClass
    ).toBe(10);
  });

  it("breaks concentration outright at 0 HP with no save", () => {
    const doc = makeCharacterDoc(
      { classId: "wizard", level: 5 },
      { concentration: concentrationValue("hold-person"), hp: { current: 0, temp: 0 } }
    );
    useCharacterStore.setState({ character: doc, readonly: false });
    useCharacterStore.getState().queueConcentrationSaveForDamage(9);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(0);
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
  });

  it("is a no-op without concentration or damage", () => {
    const doc = makeCharacterDoc(
      { classId: "wizard", level: 5 },
      { concentration: "", hp: { current: 20, temp: 0 } }
    );
    useCharacterStore.setState({ character: doc, readonly: false });
    useCharacterStore.getState().queueConcentrationSaveForDamage(12);
    useCharacterStore.getState().queueConcentrationSaveForDamage(0);
    expect(useCharacterStore.getState().combatPendingConcentrationSaves).toHaveLength(0);
  });
});
