/**
 * The PC party lease - characters joining the composed encounter world on
 * their OWN material through the member flow (party-world-lease +
 * encounter-world-store's party planners):
 *
 * (a) join/leave lifecycle - the kernel `start-encounter` boundary opens the
 *     lease-identified local encounter on the surfaced rolled fight, ends a
 *     lingering SOLO encounter first (the collision rule), replays
 *     idempotently by lease identity, releases only when the fight leaves the
 *     viewer's active set, and rebinds across epoch replacement;
 * (b) clock equivalence (the "rebase" contract) - a 1-minute buff cast before
 *     joining keeps its remaining duration across join, observed shared
 *     rounds (6 s per round, the kernel's own law) and leave, with the
 *     character's timeline never leaving its own clock (nothing to un-rebase);
 * (c) PC-turn-anchored lifetimes - a buff until the end of the PC's turn
 *     expires EXACTLY when the shared pointer passes off the PC (the member
 *     flow's complete-turn), once per (fight, round);
 * (d) cross-material correlation - one action identity stamped on BOTH
 *     journals: the encounter-side damage action + chronicle beat carry the
 *     seed-prefixed id, the member's character journal records the SAME seed
 *     as a turn-economy claim;
 * (e) fail-closed - a corrupt member world degrades ONLY the member's join
 *     (the encounter side keeps working), and readonly/anonymous states
 *     change nothing.
 */

import { afterEach, describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  encounterWorldState,
  partyLeaseIdentity,
  partyLeaseParticipantId,
} from "@/lib/encounter-world-store";
import {
  boundaryCommitFacts,
  characterMaterialRef,
  characterSelfRef,
  characterTrackerSeeds,
  characterTurnEconomy,
  characterWorldState,
  commitCharacterAction,
  mechanicsAuthorityDefinition,
  planSoloEncounterStart,
  SOLO_PARTICIPANT_ID,
} from "@/lib/mechanics-world-store";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import {
  addMonster,
  beginEncounterTurns,
  startEncounter,
} from "@/features/campaigns/encounter";
import { applyAdversaryDamage } from "@/features/campaigns/encounter-world-command";
import {
  commitPartyAttackParticipation,
  observePartyWorldFights,
  type PartyFightSnapshot,
} from "@/features/campaigns/party-world-lease";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsAnswer } from "@/types/mechanics-program";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

const UID = "test-uid";
const CAMPAIGN_ID = "campaign-under-test";
const EPOCH = 1_000;

function fixture(): CharacterDoc {
  return makeCharacterDoc({ classId: "fighter", level: 5 }, { concentration: "" });
}

function mountCharacter(doc: CharacterDoc): void {
  useCharacterStore.setState({ character: doc, loading: false, readonly: false });
  useAuthStore.setState({ user: { uid: UID } as User });
}

function openDoc(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no open character");
  return doc;
}

function openWorld(): Readonly<CharacterMaterialState> {
  const doc = openDoc();
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

function fight(over: Partial<PartyFightSnapshot> = {}): PartyFightSnapshot {
  return {
    campaignId: CAMPAIGN_ID,
    characterId: "test-char",
    encounterEpoch: EPOCH,
    initiativeRoll: 17,
    isMyTurn: false,
    round: 1,
    turnsBegun: true,
    ...over,
  };
}

/** Observe one settled snapshot with the fight as the surfaced primary. */
function observe(
  previous: readonly PartyFightSnapshot[] | null,
  fights: readonly PartyFightSnapshot[],
  primaryCampaignId: string | null = CAMPAIGN_ID
): void {
  observePartyWorldFights(previous, fights, primaryCampaignId);
}

/** Fire one observed pointer pass-off for the shared round `round`. */
function passTurn(round: number, over: Partial<PartyFightSnapshot> = {}): void {
  observe(
    [fight({ isMyTurn: true, round, ...over })],
    [fight({ isMyTurn: false, round, ...over })]
  );
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
    snapshot: { grantGroups: {}, program, ref: capability, resources: {}, schema: 1 },
    source: { capability, kind: "capability", owner: self },
    staticBindings: {},
  });
  if (!authority) throw new Error("authority receipt rejected");
  return authority;
}

/** Drive one authored authority through the coordinator and commit it. */
function castCommitted(
  programValue: unknown,
  actionId: string,
  answers: readonly Readonly<MechanicsAnswer>[] = []
): void {
  const doc = openDoc();
  const world = openWorld();
  const authority = authoredAuthority(doc, programValue);
  const material = characterMaterialRef(doc, UID);
  const state = beginMechanicsCausalState({
    documents: [{ kind: "character", material, state: world }],
    scope: material,
  });
  if (!state.ok) throw new Error(`causal state: ${state.reason}`);
  const outcome = runMechanicsCausalAction({
    answers,
    authoritySnapshot: { definitions: [mechanicsAuthorityDefinition(authority)] },
    facts: [],
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
  if (outcome.status !== "complete" || !outcome.action) {
    throw new Error(`cast did not complete: ${JSON.stringify(outcome.status)}`);
  }
  const committed = commitCharacterAction(
    doc,
    UID,
    world,
    outcome.action,
    boundaryCommitFacts(outcome.action)
  );
  if (!committed) throw new Error("cast commit failed");
  useCharacterStore.getState().updateSession(committed.session);
}

/** One condition with a 60-second (1-minute) absolute lifetime. */
function timedConditionProgram(id: string, conditionId: string): unknown {
  const lifetime = { kind: "duration", seconds: { kind: "fixed", value: 60 } } as const;
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

function activeConditionRules(world: Readonly<CharacterMaterialState>) {
  return Object.values(world.occurrences)
    .filter((occurrence) => occurrence.kind === "condition" && occurrence.ending === null)
    .flatMap((occurrence) => occurrence.endRules);
}

afterEach(() => {
  useCharacterStore.setState({
    character: null,
    combatPendingConcentrationSaves: [],
    readonly: false,
  });
  useAuthStore.setState({ user: null });
});

describe("the join/leave lease lifecycle", () => {
  it("joins the surfaced rolled fight through the kernel start-encounter boundary", () => {
    mountCharacter(fixture());
    observe(null, [fight({ round: 3 })]);
    const world = openWorld();
    const participantId = partyLeaseParticipantId(CAMPAIGN_ID, EPOCH);
    expect(world.encounter?.phase).toBe("turns");
    expect(world.encounter?.round).toBe(3);
    expect(world.encounter?.currentCombatantId).toBe(participantId);
    expect(world.encounter?.participants[participantId]?.initiativeRoll).toBe(17);
    expect(world.encounter?.participants[participantId]?.combatant).toEqual(
      characterSelfRef(openDoc(), UID)
    );
    expect(partyLeaseIdentity(world)).toEqual({
      campaignId: CAMPAIGN_ID,
      encounterEpoch: EPOCH,
    });
    // The lease is identity, not clocks: the character's binding stays LOCAL.
    expect(world.clockBinding.timeline.material.kind).toBe("character-play");
    expect(world.clockBinding.encounter?.material.kind).toBe("character-play");
    expect(world.actions.some(({ id }) => id.startsWith("party-join:"))).toBe(true);
  });

  it("replays idempotently by lease identity", () => {
    mountCharacter(fixture());
    observe(null, [fight()]);
    const before = openWorld().revision;
    observe([fight()], [fight()]);
    expect(openWorld().revision).toBe(before);
  });

  it("ends a lingering LOCAL solo encounter before joining (the collision rule)", () => {
    mountCharacter(fixture());
    // A solo fight is running on the character's own material.
    const doc = openDoc();
    const idle = openWorld();
    const soloStart = planSoloEncounterStart(doc, UID, idle, 2, "solo-first");
    if (!soloStart) throw new Error("solo start rejected");
    const committed = commitCharacterAction(
      doc,
      UID,
      idle,
      soloStart,
      boundaryCommitFacts(soloStart)
    );
    if (!committed) throw new Error("solo start commit failed");
    useCharacterStore.getState().updateSession(committed.session);
    expect(openWorld().encounter?.participants[SOLO_PARTICIPANT_ID]).toBeDefined();

    observe(null, [fight()]);
    const world = openWorld();
    expect(partyLeaseIdentity(world)).toEqual({
      campaignId: CAMPAIGN_ID,
      encounterEpoch: EPOCH,
    });
    expect(world.encounter?.participants[SOLO_PARTICIPANT_ID]).toBeUndefined();
    const ids = world.actions.map(({ id }) => id);
    expect(ids.some((id) => id.startsWith("party-encounter-end:"))).toBe(true);
    expect(ids.some((id) => id.startsWith("party-join:"))).toBe(true);
  });

  it("does not join while gathering, unrolled, or for a foreign character", () => {
    mountCharacter(fixture());
    observe(null, [fight({ turnsBegun: false })]);
    expect(openWorld().encounter).toBeNull();
    observe(null, [fight({ initiativeRoll: null })]);
    expect(openWorld().encounter).toBeNull();
    observe(null, [fight({ characterId: "someone-elses-hero" })]);
    expect(openWorld().encounter).toBeNull();
  });

  it("releases the lease only when the fight leaves the active set", () => {
    mountCharacter(fixture());
    observe(null, [fight()]);
    expect(partyLeaseIdentity(openWorld())).not.toBeNull();

    // Still active but not primary (a pin switch): the lease is KEPT.
    observe([fight()], [fight()], null);
    expect(partyLeaseIdentity(openWorld())).not.toBeNull();

    // The fight is gone from the active set: the kernel end-encounter closes it.
    observe([fight()], [], null);
    const world = openWorld();
    expect(world.encounter).toBeNull();
    expect(world.clockBinding.encounter).toBeNull();
  });

  it("rebinds across an epoch replacement (a new fight in the same campaign)", () => {
    mountCharacter(fixture());
    observe(null, [fight()]);
    const next = fight({ encounterEpoch: EPOCH + 7, round: 1 });
    observe([fight()], [next]);
    expect(partyLeaseIdentity(openWorld())).toEqual({
      campaignId: CAMPAIGN_ID,
      encounterEpoch: EPOCH + 7,
    });
  });
});

describe("clock equivalence - the lease-by-identity rebase contract", () => {
  it("a 1-minute buff cast before joining keeps its remaining duration across join, rounds, and leave", () => {
    mountCharacter(fixture());
    castCommitted(timedConditionProgram("pre-join-blessing", "invisible"), "cast-60s");
    const beforeJoin = openWorld();
    const ruleBefore = activeConditionRules(beforeJoin).find(
      (rule) => rule.kind === "time-reached"
    );
    if (ruleBefore?.kind !== "time-reached") throw new Error("no timed rule");
    expect(ruleBefore.elapsedSeconds).toBe(60);
    expect(ruleBefore.clock.material.kind).toBe("character-play");

    // Joining rebases NOTHING: the deadline and its clock are untouched.
    observe(null, [fight()]);
    const joined = openWorld();
    const ruleJoined = activeConditionRules(joined).find(
      (rule) => rule.kind === "time-reached"
    );
    if (ruleJoined?.kind !== "time-reached") throw new Error("rule lost on join");
    expect(ruleJoined.elapsedSeconds).toBe(60);
    expect(ruleJoined.clock.material.kind).toBe("character-play");
    expect(joined.timeline.elapsedSeconds).toBe(0);

    // Three observed shared rounds: the kernel's 6 s/round law, in lockstep.
    for (let round = 1; round <= 3; round += 1) passTurn(round);
    const midFight = openWorld();
    expect(midFight.timeline.elapsedSeconds).toBe(18);
    expect(activeConditionRules(midFight).some((r) => r.kind === "time-reached")).toBe(
      true
    );

    // Leaving un-rebases nothing: 42 seconds remain on the SAME local clock.
    observe([fight()], [], null);
    const left = openWorld();
    expect(left.encounter).toBeNull();
    const ruleLeft = activeConditionRules(left).find(
      (rule) => rule.kind === "time-reached"
    );
    if (ruleLeft?.kind !== "time-reached") throw new Error("rule lost on leave");
    expect(ruleLeft.elapsedSeconds - left.timeline.elapsedSeconds).toBe(42);
    expect(ruleLeft.clock.material.kind).toBe("character-play");
  });

  it("expires the 1-minute buff exactly at the tenth observed round", () => {
    mountCharacter(fixture());
    castCommitted(timedConditionProgram("ten-round-blessing", "invisible"), "cast-60s");
    observe(null, [fight()]);
    for (let round = 1; round <= 9; round += 1) passTurn(round);
    expect(openWorld().timeline.elapsedSeconds).toBe(54);
    expect(openDoc().session.conditions).toContain("invisible");
    passTurn(10);
    const world = openWorld();
    expect(world.timeline.elapsedSeconds).toBe(60);
    expect(activeConditionRules(world)).toHaveLength(0);
    expect(openDoc().session.conditions).not.toContain("invisible");
  });
});

describe("PC-turn-anchored lifetimes through the member flow", () => {
  it("expires an until-end-of-turn buff exactly when the pointer passes off the PC", () => {
    mountCharacter(fixture());
    observe(null, [fight()]);
    castCommitted(oneTurnConditionProgram("one-turn-poison", "poisoned"), "apply-poison");
    expect(openDoc().session.conditions).toContain("poisoned");
    const joined = openWorld();
    const rule = activeConditionRules(joined).find((r) => r.kind === "turn-boundary");
    if (rule?.kind !== "turn-boundary") throw new Error("no turn-anchored rule");
    // Anchored to the LOCAL follower encounter - the lease's clock.
    expect(rule.clock.material.kind).toBe("character-play");
    expect(rule.combatant).toEqual(characterSelfRef(openDoc(), UID));

    passTurn(1);
    const after = openWorld();
    expect(
      Object.values(after.occurrences).filter(
        (occurrence) => occurrence.kind === "condition" && occurrence.ending === null
      )
    ).toHaveLength(0);
    expect(openDoc().session.conditions).not.toContain("poisoned");
    expect(after.encounter?.round).toBe(2);
  });

  it("fires once per (fight, round): a replayed pass-off changes nothing", () => {
    mountCharacter(fixture());
    observe(null, [fight()]);
    passTurn(1);
    const before = openWorld();
    passTurn(1);
    const after = openWorld();
    expect(after.revision).toBe(before.revision);
    expect(after.encounter?.round).toBe(before.encounter?.round);
  });

  it("fires no boundary while the character is not leased to that fight", () => {
    mountCharacter(fixture());
    // Never joined: the pass-off is SKIPPED (no lease at fire time) - only the
    // reconcile's join lands, so no turn crossed and no time passed.
    passTurn(1);
    const world = openWorld();
    expect(partyLeaseIdentity(world)).not.toBeNull();
    expect(world.timeline.elapsedSeconds).toBe(0);
    expect(world.encounter?.round).toBe(1);
  });
});

describe("cross-material action correlation (attacker pays, target suffers)", () => {
  function adversaryEncounter() {
    let state = startEncounter({}, [], EPOCH);
    state = addMonster(state, {
      ac: 15,
      count: 1,
      creatureType: "humanoid",
      initiative: 14,
      maxHp: 10,
      name: "Goblin",
      srdId: "goblin-warrior",
    });
    return beginEncounterTurns(state, ["monster-1"]);
  }

  it("stamps ONE identity on both journals: encounter damage + chronicle beat + PC turn claim", () => {
    mountCharacter(fixture());
    observe(null, [fight()]);
    const seed = `pc-action:${canonicalFingerprint({ proof: "one-identity" })}`;

    // The encounter side: the member-declared damage books through the engine
    // under the seed-prefixed action id, stamped onto the chronicle beat.
    const encounter = adversaryEncounter();
    const damaged = applyAdversaryDamage(
      encounter,
      CAMPAIGN_ID,
      "monster-1",
      5,
      { actorId: `pc-${UID}` },
      seed
    );
    const world = encounterWorldState(damaged, CAMPAIGN_ID);
    if (!world) throw new Error("encounter world derivation failed");
    expect(world.actions.map(({ id }) => id)).toContain(`${seed}:damage:monster-1`);
    const beat = (damaged.events ?? []).find((event) => event.kind === "hp-damage");
    expect(beat?.engineActionId).toBe(`${seed}:damage:monster-1`);

    // The character side: the SAME seed lands on the member's own journal as
    // a turn-economy claim on the leased participant.
    commitPartyAttackParticipation(CAMPAIGN_ID, `pc-${UID}`, seed);
    const character = openWorld();
    expect(character.actions.map(({ id }) => id)).toContain(seed);
    const participant =
      character.encounter?.participants[partyLeaseParticipantId(CAMPAIGN_ID, EPOCH)];
    expect(
      participant?.economy.manualBoundaries.some(
        (boundary) => boundary.boundaryId === seed
      )
    ).toBe(true);
  });

  it("skips the PC stamp for a foreign actor or without a lease", () => {
    mountCharacter(fixture());
    observe(null, [fight()]);
    const before = openWorld().revision;
    commitPartyAttackParticipation(CAMPAIGN_ID, "pc-somebody-else", "pc-action:x");
    expect(openWorld().revision).toBe(before);
    commitPartyAttackParticipation("another-campaign", `pc-${UID}`, "pc-action:x");
    expect(openWorld().revision).toBe(before);
  });
});

describe("fail-closed degradation", () => {
  it("a corrupt member world degrades ONLY the member's join; the encounter side keeps working", () => {
    const doc = fixture();
    const corrupted: CharacterDoc = {
      ...doc,
      session: { ...doc.session, world: { schema: 999 } },
    };
    mountCharacter(corrupted);
    observe(null, [fight()]);
    // Nothing was committed: the corrupt persisted world is untouched.
    expect(useCharacterStore.getState().character?.session.world).toEqual({
      schema: 999,
    });

    // The encounter document is a different material with a different owner:
    // the table's engine boundary is untouched by the member's corruption.
    let encounter = startEncounter({}, [], EPOCH);
    encounter = addMonster(encounter, {
      ac: 15,
      count: 1,
      initiative: 14,
      maxHp: 10,
      name: "Goblin",
      srdId: "goblin-warrior",
    });
    encounter = beginEncounterTurns(encounter, ["monster-1"]);
    const damaged = applyAdversaryDamage(encounter, CAMPAIGN_ID, "monster-1", 4);
    const monster = damaged.combatants.find(({ id }) => id === "monster-1");
    expect(monster?.kind === "monster" && monster.hp.current).toBe(6);
    expect(encounterWorldState(damaged, CAMPAIGN_ID)).not.toBeNull();
  });

  it("changes nothing on a readonly sheet or without an authenticated owner", () => {
    const doc = fixture();
    useCharacterStore.setState({ character: doc, loading: false, readonly: true });
    useAuthStore.setState({ user: { uid: UID } as User });
    observe(null, [fight()]);
    expect(useCharacterStore.getState().character?.session.world).toBeUndefined();

    useCharacterStore.setState({ character: doc, loading: false, readonly: false });
    useAuthStore.setState({ user: null });
    observe(null, [fight()]);
    expect(useCharacterStore.getState().character?.session.world).toBeUndefined();
  });
});
