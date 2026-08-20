/**
 * SHORT/LONG RESTS on the canonical mechanics runtime (rest-world-boundary):
 * the rest commits ONE journal action over the character's persisted world,
 * chaining the kernel's end-encounter / advance-time / complete-rest
 * boundaries, executing every engine-modeled recovery, and mirroring the
 * world-owned facts onto the legacy session in the same write. Covers the
 * short-rest cadence (the monk-focus "all" case from the live-team contract,
 * the Rage fixed partial), the long-rest restore set (hp, temp, slots,
 * exhaustion, death saves), until-long-rest lifetime endings at the exact
 * boundary, engine concentration released by sleep, the lingering solo world
 * encounter closed, the entered hit-dice heal as the recorded rolled
 * recovery, and the fail-closed degradations (corrupt world, no owner).
 */

import { afterEach, describe, expect, it } from "vitest";

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import { concentrationValue } from "@/lib/concentration";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { conformMechanicsProgramAuthorityReceipt } from "@/lib/mechanics-program-receipt";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
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
} from "@/lib/mechanics-world-store";
import { restThroughWorld } from "@/features/character/rest-world-boundary";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";

const UID = "test-uid";

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

/** Put one doc plus the authenticated owner into the live stores. */
function armed(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  useAuthStore.setState({ user: { uid: UID } as User });
}

function liveDoc(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("live character missing");
  return doc;
}

function usedTracker(id: string): number {
  return liveDoc().session.trackers[id]?.used ?? 0;
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

/** Drive one authored authority over the live world and commit its action. */
function driveAndCommit(
  doc: CharacterDoc,
  authority: Readonly<MechanicsProgramAuthorityReceipt>,
  actionId: string
): CharacterDoc {
  const world = worldFor(doc);
  const material = characterMaterialRef(doc, UID);
  const state = beginMechanicsCausalState({
    documents: [{ kind: "character", material, state: world }],
    scope: material,
  });
  if (!state.ok) throw new Error(`causal state: ${state.reason}`);
  const outcome = runMechanicsCausalAction({
    answers: [],
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
  if (outcome.status !== "complete" || !outcome.action) {
    throw new Error(`dispatch: ${JSON.stringify(outcome)}`);
  }
  const commit = commitCharacterAction(
    doc,
    UID,
    world,
    outcome.action,
    boundaryCommitFacts(outcome.action)
  );
  if (!commit) throw new Error("commit failed");
  return { ...doc, session: commit.session };
}

/** A self condition standing until the OWNER finishes a Long Rest. */
function untilLongRestConditionProgram(id: string, conditionId: string): unknown {
  const lifetime = {
    combatant: "owner",
    kind: "rest-completed",
    rest: "long",
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

/** A manual engine concentration only an explicit end request can release. */
function manualConcentrationProgram(id: string): unknown {
  return {
    id,
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [
          {
            kind: "concentration",
            lifetime: { kind: "manual" },
            operation: "start",
            stepId: "hold-focus",
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

function activeConditionCount(world: Readonly<CharacterMaterialState>): number {
  return Object.values(world.occurrences).filter(
    (occurrence) => occurrence.kind === "condition" && occurrence.ending === null
  ).length;
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

describe("restThroughWorld: short rest", () => {
  it("recovers short-rest pools exactly, leaves long-rest pools and hp alone, and mirrors", () => {
    const doc = makeCharacterDoc(
      {
        classId: "monk",
        level: 5,
        features: [{ srdId: "monk-focus" }, { srdId: "monk-uncanny-metabolism" }],
      },
      {
        hp: { current: 10, temp: 0 },
        trackers: {
          "monk-focus": { used: 2 },
          "monk-uncanny-metabolism": { used: 1 },
        },
      }
    );
    armed(doc);

    expect(restThroughWorld("short")).toBe("engine");

    // Mirror truth: Focus back to full (the team contract's "all" cadence),
    // the long-rest Uncanny Metabolism charge still spent, hp untouched.
    expect(usedTracker("monk-focus")).toBe(0);
    expect(usedTracker("monk-uncanny-metabolism")).toBe(1);
    expect(liveDoc().session.hp.current).toBe(10);

    // World truth agrees: the pool cells transitioned in the committed action,
    // the timeline advanced the RAW hour, and the rest allocated its boundary
    // ordinal (the persisted rest-completed evidence).
    const world = worldFor(liveDoc());
    expect(world.resources.pools["monk-focus"]).toMatchObject({ current: 5 });
    expect(world.resources.pools["monk-uncanny-metabolism"]).toMatchObject({
      current: 0,
    });
    expect(world.vitals.hitPoints.current).toBe(10);
    expect(world.timeline.elapsedSeconds).toBe(3600);
    expect(world.timeline.nextBoundaryOrdinal).toBe(2);
    expect(world.revision).toBeGreaterThan(0);
    expect(liveDoc().session.world).toBeDefined();
  });

  it("applies a fixed partial recovery (Rage regains exactly one use)", () => {
    const doc = makeCharacterDoc(
      { classId: "barbarian", level: 5, features: [{ srdId: "barbarian-rage" }] },
      { trackers: { "barbarian-rage": { used: 3 } } }
    );
    armed(doc);

    expect(restThroughWorld("short")).toBe("engine");

    expect(usedTracker("barbarian-rage")).toBe(2);
    expect(worldFor(liveDoc()).resources.pools["barbarian-rage"]).toMatchObject({
      current: 1,
    });
  });

  it("reconciles legacy-only spends and damage taken since the last world commit", () => {
    // The rollout-bridge desync case: after the FIRST engine rest persists the
    // world, legacy-only writes (a rail pip spend, an hp damage tap) reach the
    // session but not the world. The NEXT rest must recover from the
    // table-visible session truth, never resurrect the stale world values.
    const doc = makeCharacterDoc(
      { classId: "barbarian", level: 5, features: [{ srdId: "barbarian-rage" }] },
      { hp: { current: 30, temp: 0 } }
    );
    armed(doc);
    expect(restThroughWorld("short")).toBe("engine");

    useCharacterStore.getState().useTracker("barbarian-rage", 3);
    useCharacterStore.getState().setHP(12);
    expect(usedTracker("barbarian-rage")).toBe(3);

    expect(restThroughWorld("short")).toBe("engine");

    // Rage regains exactly one use from the SESSION counter (3 to 2), hp stays
    // at the legacy-damaged 12 (no heal was entered), and the world adopts
    // both reconciled values in the same commit.
    expect(usedTracker("barbarian-rage")).toBe(2);
    expect(liveDoc().session.hp.current).toBe(12);
    const world = worldFor(liveDoc());
    expect(world.resources.pools["barbarian-rage"]).toMatchObject({ current: 1 });
    expect(world.vitals.hitPoints.current).toBe(12);
  });

  it("heals by the entered hit-dice roll exactly, clamped at the effective max", () => {
    const doc = makeCharacterDoc(
      { classId: "monk", level: 5, features: [{ srdId: "monk-focus" }] },
      { hp: { current: 10, temp: 0 } }
    );
    armed(doc);

    // The player's entered roll (plus CON per die) is the recorded observation
    // for the one rolled rest recovery; the engine applies exactly that total.
    expect(restThroughWorld("short", { healedHp: 7 })).toBe("engine");
    expect(liveDoc().session.hp.current).toBe(17);
    expect(worldFor(liveDoc()).vitals.hitPoints.current).toBe(17);

    // A second entered roll clamps at the effective max, never beyond.
    expect(restThroughWorld("short", { healedHp: 999 })).toBe("engine");
    expect(liveDoc().session.hp.current).toBe(doc.character.hp.max);
    expect(worldFor(liveDoc()).vitals.hitPoints.current).toBe(doc.character.hp.max);
  });

  it("does not end an until-long-rest engine lifetime", () => {
    const base = makeCharacterDoc({ classId: "fighter", level: 5 }, {});
    const authority = authoredAuthority(
      base,
      untilLongRestConditionProgram("until-long-rest-standing", "poisoned")
    );
    const doc = driveAndCommit(base, authority, "apply-standing");
    expect(doc.session.conditions).toContain("poisoned");
    armed(doc);

    expect(restThroughWorld("short")).toBe("engine");

    // The rule waits for a LONG rest boundary; the short one leaves it standing
    // and the legacy chip stays lit.
    expect(activeConditionCount(worldFor(liveDoc()))).toBe(1);
    expect(liveDoc().session.conditions).toContain("poisoned");
  });
});

describe("restThroughWorld: long rest", () => {
  it("restores hp, temp hp, slots, exhaustion, death saves and item charges, and mirrors exactly", () => {
    const doc = makeCharacterDoc(
      {
        classId: "wizard",
        level: 5,
        equipment: [
          { srdId: "wand", charges: { current: 1, max: 7, recovery: "long-rest" } },
        ],
      },
      {
        hp: { current: 5, temp: 4 },
        exhaustion: 3,
        hitDice: { used: 3 },
        spellSlots: { "1": { used: 2 }, "2": { used: 1 } },
      }
    );
    armed(doc);

    expect(restThroughWorld("long")).toBe("engine");

    const session = liveDoc().session;
    expect(session.hp).toMatchObject({ current: doc.character.hp.max, temp: 0 });
    expect(session.exhaustion).toBe(2);
    expect(session.hitDice.used).toBe(0);
    expect(session.spellSlots["1"]?.used ?? 0).toBe(0);
    expect(session.spellSlots["2"]?.used ?? 0).toBe(0);
    expect(session.deathSucc).toBe(0);
    expect(session.deathFail).toBe(0);
    // The legacy-only equipment charge law applied on the engine path too
    // (the shared `equipmentAfterLongRest` single source).
    expect(liveDoc().character.equipment[0]?.charges).toMatchObject({ current: 7 });

    const world = worldFor(liveDoc());
    expect(world.vitals.hitPoints.current).toBe(doc.character.hp.max);
    expect(world.vitals.hitPoints.temporary.current).toBe(0);
    expect(world.vitals.zeroHitPoints).toBeNull();
    expect(world.exhaustion).toBe(2);
    // Wizard 5: four 1st-level and three 2nd-level slots, all back.
    expect(world.resources.standardSpellSlots["1"]).toMatchObject({ current: 4 });
    expect(world.resources.standardSpellSlots["2"]).toMatchObject({ current: 3 });
    expect(world.timeline.elapsedSeconds).toBe(28_800);
    expect(world.timeline.nextBoundaryOrdinal).toBe(2);
  });

  it("ends an until-long-rest engine lifetime at the exact boundary and clears its chip", () => {
    const base = makeCharacterDoc({ classId: "fighter", level: 5 }, {});
    const authority = authoredAuthority(
      base,
      untilLongRestConditionProgram("until-long-rest-buff", "invisible")
    );
    const doc = driveAndCommit(base, authority, "apply-buff");
    expect(doc.session.conditions).toContain("invisible");
    expect(activeConditionCount(worldFor(doc))).toBe(1);
    armed(doc);

    expect(restThroughWorld("long")).toBe("engine");

    expect(activeConditionCount(worldFor(liveDoc()))).toBe(0);
    expect(liveDoc().session.conditions).not.toContain("invisible");
  });

  it("releases engine concentration through the sleep end request", () => {
    const base = makeCharacterDoc({ classId: "wizard", level: 5 }, {});
    const authority = authoredAuthority(base, manualConcentrationProgram("manual-hold"));
    const doc = driveAndCommit(base, authority, "start-concentration");
    // The engine concentration mirrored onto the legacy field in its commit.
    expect(doc.session.concentration).toBe(concentrationValue("manual-hold"));
    armed(doc);

    expect(restThroughWorld("long")).toBe("engine");

    const world = worldFor(liveDoc());
    expect(
      Object.values(world.occurrences).some(
        (occurrence) => occurrence.kind === "concentration" && occurrence.ending === null
      )
    ).toBe(false);
    expect(liveDoc().session.concentration).toBe("");
  });

  it("closes a lingering solo world encounter inside the same rest action", () => {
    const base = makeCharacterDoc({ classId: "fighter", level: 5 }, {});
    const world = worldFor(base);
    const start = planSoloEncounterStart(base, UID, world, 2, "rest-solo-start");
    if (!start) throw new Error("solo start rejected");
    const commit = commitCharacterAction(
      base,
      UID,
      world,
      start,
      boundaryCommitFacts(start)
    );
    if (!commit) throw new Error("solo start commit failed");
    const doc = { ...base, session: commit.session };
    expect(worldFor(doc).encounter).not.toBeNull();
    armed(doc);

    expect(restThroughWorld("long")).toBe("engine");

    const after = worldFor(liveDoc());
    expect(after.encounter).toBeNull();
    expect(after.clockBinding.encounter).toBeNull();
    expect(after.timeline.nextBoundaryOrdinal).toBe(2);
  });
});

describe("restThroughWorld: fail-closed degradation", () => {
  it("degrades to the exact legacy rest over a corrupt persisted world", () => {
    // A world that fails its fail-closed parse must never block the rest:
    // the legacy path still recovers, and the corrupt field is left untouched
    // for diagnosis (nothing engine-side moves; no crash).
    const corrupt = { schema: 999 };
    const doc = makeCharacterDoc(
      { classId: "monk", level: 5, features: [{ srdId: "monk-focus" }] },
      { trackers: { "monk-focus": { used: 2 } }, world: corrupt }
    );
    armed(doc);

    expect(restThroughWorld("short")).toBe("legacy");

    expect(usedTracker("monk-focus")).toBe(0);
    expect(liveDoc().session.world).toBe(corrupt);
  });

  it("degrades without an authenticated owner and derives no world", () => {
    const doc = makeCharacterDoc(
      { classId: "monk", level: 5, features: [{ srdId: "monk-focus" }] },
      { trackers: { "monk-focus": { used: 2 } } }
    );
    armed(doc);
    useAuthStore.setState({ user: null });

    expect(restThroughWorld("short")).toBe("legacy");

    expect(usedTracker("monk-focus")).toBe(0);
    expect(liveDoc().session.world).toBeUndefined();
  });

  it("refuses to rest a downed character on either path", () => {
    const doc = makeCharacterDoc(
      { classId: "monk", level: 5, features: [{ srdId: "monk-focus" }] },
      { hp: { current: 0, temp: 0 }, trackers: { "monk-focus": { used: 2 } } }
    );
    armed(doc);

    expect(restThroughWorld("short")).toBe("legacy");

    expect(usedTracker("monk-focus")).toBe(2);
    expect(liveDoc().session.world).toBeUndefined();
  });
});
