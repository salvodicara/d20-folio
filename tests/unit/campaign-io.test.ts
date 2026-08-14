/**
 * campaign-io shape tests (Phase 5 · Part 2a, gate item 5d). Mocks
 * `firebase/firestore` so it runs Firebase-free in CI, and asserts each I/O
 * function produces the EXACT Firestore mutation:
 *   • createCampaign — A13 invariants (creator ∈ members, createdBy = uid,
 *     dmUid = uid) + seeded empty treasury/log (notes are their own subcollection)
 *     + inviteCode == doc id;
 *   • joinCampaign — idempotent + attachment-blind: a first join self-adds via
 *     arrayUnion + per-leaf identity fields (NEVER characterId/character); a
 *     re-join as an existing member is a pure no-op (the clobber-bug regression);
 *   • listSharedCampaigns — a membership-scoped (`array-contains`) query, never an
 *     unbounded enumeration;
 *   • updateCampaign — writes the shared artifacts with a server `updatedAt`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NO_DEFENSES } from "@/lib/damage-intake";
import { defaultCombatState } from "@/lib/combat-state";

const {
  setDocMock,
  updateDocMock,
  getDocMock,
  getDocsMock,
  getDocsFromServerMock,
  docMock,
  collectionMock,
  queryMock,
  whereMock,
  arrayUnionMock,
  arrayRemoveMock,
  deleteFieldMock,
  serverTimestampMock,
  onSnapshotMock,
  deleteDocMock,
  limitMock,
  orderByMock,
  incrementMock,
  runTransactionMock,
} = vi.hoisted(() => ({
  setDocMock: vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<void>>(() =>
    Promise.resolve()
  ),
  updateDocMock: vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<void>>(
    () => Promise.resolve()
  ),
  // Default: the campaign is unreadable to the caller (a brand-new joiner — the
  // production read is denied; here we model it as a non-existent snapshot), so
  // joinCampaign falls through to the first-join self-add. Re-join tests override
  // this per-call with an existing-member snapshot.
  getDocMock: vi.fn<() => Promise<{ exists: () => boolean; data?: () => unknown }>>(() =>
    Promise.resolve({ exists: () => false })
  ),
  getDocsMock: vi.fn<() => Promise<{ docs: unknown[] }>>(() =>
    Promise.resolve({ docs: [] })
  ),
  getDocsFromServerMock: vi.fn<() => Promise<{ docs: unknown[] }>>(() =>
    Promise.resolve({ docs: [] })
  ),
  docMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __doc: args })),
  collectionMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __col: args })),
  queryMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __query: args })),
  whereMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __where: args })),
  arrayUnionMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({
    __arrayUnion: args,
  })),
  arrayRemoveMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({
    __arrayRemove: args,
  })),
  deleteFieldMock: vi.fn<() => unknown>(() => ({ __deleteField: true })),
  serverTimestampMock: vi.fn<() => unknown>(() => ({ __serverTimestamp: true })),
  onSnapshotMock: vi.fn<() => () => void>(() => () => {}),
  deleteDocMock: vi.fn<(ref: unknown) => Promise<void>>(() => Promise.resolve()),
  limitMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __limit: args })),
  orderByMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __orderBy: args })),
  incrementMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({
    __increment: args,
  })),
  runTransactionMock:
    vi.fn<(db: unknown, fn: (txn: unknown) => Promise<unknown>) => Promise<unknown>>(),
}));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: { __db: true } }));
vi.mock("firebase/firestore", () => ({
  setDoc: setDocMock,
  updateDoc: updateDocMock,
  getDoc: getDocMock,
  getDocs: getDocsMock,
  getDocsFromServer: getDocsFromServerMock,
  doc: docMock,
  collection: collectionMock,
  query: queryMock,
  where: whereMock,
  arrayUnion: arrayUnionMock,
  arrayRemove: arrayRemoveMock,
  deleteField: deleteFieldMock,
  serverTimestamp: serverTimestampMock,
  onSnapshot: onSnapshotMock,
  deleteDoc: deleteDocMock,
  limit: limitMock,
  orderBy: orderByMock,
  increment: incrementMock,
  runTransaction: runTransactionMock,
  // A faithful Timestamp double: `new Timestamp(seconds, nanos)` round-trips to a
  // real Date, so the conformance guard can assert ordering, not just type.
  Timestamp: class {
    seconds: number;
    nanoseconds: number;
    constructor(seconds = 0, nanoseconds = 0) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate(): Date {
      return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
    }
  },
}));
// Stub Storage so deleteCampaign's banner cascade runs Firebase-free.
vi.mock("@/lib/storage", () => ({
  deleteCampaignBanner: vi.fn(() => Promise.resolve()),
}));

import {
  advanceEncounterTurn,
  appendPersistentCombatEffect,
  applyDeclaredCombatEffects,
  applyTreasuryDelta,
  attachMemberCharacter,
  commitChronicleEdit,
  appendChronicleChapter,
  conformCombatEffectOps,
  joinChronicleText,
  createCampaign,
  createCampaignSave,
  joinCampaign,
  listSharedCampaigns,
  persistBeginTurns,
  persistEndEncounter,
  persistStartEncounter,
  subscribeToCampaign,
  subscribeToCampaignNotes,
  undoTreasuryEntry,
  updateCampaign,
  writeCampaignCombatEffect,
  removeMember,
  reduceDeclaredEffects,
  reduceDirectPcEffects,
  revokePersistentCombatEffect,
  revokePersistentCombatEffectsBySource,
  setJoinsLocked,
  deleteSession,
  deliverQueuedMemberEffects,
  updateSession,
  listSessions,
  deleteCampaign,
} from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useCharacterStore } from "@/stores/characterStore";
import { deleteCampaignBanner } from "@/lib/storage";
import { encounterWorldState } from "@/lib/encounter-world-store";
import { makeCharacterDoc } from "./_helpers";
import type {
  CampaignDoc,
  EncounterCombatant,
  EncounterMonster,
  EncounterState,
  TreasuryLogEntry,
} from "@/types/campaign";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import {
  reduceCombatEffectLifecycle,
  type CombatEffectLifecycleRuntime,
} from "@/lib/combat-effect-lifecycle";
import type {
  CombatEffectCommandBatch,
  CombatEffectCommandLifecycleReceipt,
} from "@/lib/combat-effect-command";
import {
  atomicAddressKey,
  conformCombatEffectAtomicReadSet,
  type AtomicOwner,
  type AtomicRead,
  type CombatEffectAtomicReadSet,
} from "@/lib/combat-effect-atomic";
import { startEncounter } from "@/features/campaigns/encounter";

function lifecycleReadSet(
  occurrenceId: string,
  programId: string,
  sourceId: string
): CombatEffectAtomicReadSet {
  const owner: AtomicOwner = {
    kind: "pc",
    surface: "shared",
    campaignId: "campaign:fixture",
    encounterEpoch: 1,
    combatantId: sourceId,
    memberUid: "member:fixture",
    characterId: "character:fixture",
  };
  const reads: AtomicRead[] = [
    {
      owner,
      address: {
        kind: "document-revision",
        document: {
          kind: "character-play",
          uid: "member:fixture",
          characterId: "character:fixture",
        },
      },
      expected: 0,
    },
    {
      owner,
      address: {
        kind: "document-revision",
        document: {
          kind: "shared-encounter",
          campaignId: "campaign:fixture",
          encounterEpoch: 1,
        },
      },
      expected: 0,
    },
    {
      owner,
      address: { kind: "base-state" },
      expected: {
        hp: 10,
        tempHp: 0,
        stable: false,
        deathSaves: { successes: 0, failures: 0 },
        conditions: [],
        conditionLifetimes: {},
        standing: [],
        standingLifetimes: {},
        resources: {},
        stateFlags: {},
      },
    },
    { owner, address: { kind: "max-hp" }, expected: 10 },
    {
      owner,
      address: { kind: "damage-defenses" },
      expected: {
        allDamageResistance: false,
        resistances: [],
        immunities: [],
        vulnerabilities: [],
        sourceResistances: [],
        flatReductions: [],
        saveDamageRules: [],
      },
    },
    { owner, address: { kind: "zero-hp-floors" }, expected: [] },
    { owner, address: { kind: "occurrence-heads" }, expected: [] },
    {
      owner,
      address: { kind: "lifecycle-head", occurrenceId, programId, sourceId },
      expected: { present: false },
    },
  ];
  reads.sort((left, right) =>
    atomicAddressKey(left.owner, left.address).localeCompare(
      atomicAddressKey(right.owner, right.address)
    )
  );
  const conformed = conformCombatEffectAtomicReadSet(
    {
      schema: 1,
      bindings: [{ ref: { kind: "source", id: sourceId }, owner }],
      reads,
    },
    { occurrenceId, programId, sourceId }
  );
  if (!conformed) throw new TypeError("Invalid lifecycle read-set fixture");
  return conformed;
}

function lifecycleRuntime(
  occurrenceId: string,
  programId: string,
  sourceId: string
): Readonly<CombatEffectLifecycleRuntime> {
  const lifecycle: CombatEffectCommandLifecycleReceipt = {
    occurrenceId,
    programId,
    phaseId: "resolve",
    sourceId,
    occurrence: 0,
    attempt: 0,
    auxiliaryConsequences: [],
    initialTallies: {},
    finalTallies: {},
    ended: false,
  };
  const commandId = [occurrenceId, programId, "resolve", sourceId, "0", "0"]
    .map((part) => `${part.length}:${part}`)
    .join("|");
  const batch: CombatEffectCommandBatch = {
    schema: 1,
    commandId,
    payloadIdentity: JSON.stringify(lifecycle),
    adapterId: "coordinator",
    surface: "shared",
    direction: "forward",
    expectedCausalState: "available",
    nextCausalState: "committed",
    readSet: lifecycleReadSet(occurrenceId, programId, sourceId),
    readSetPolicy: "initial",
    coordinatesLifecycle: true,
    lifecycle,
    operations: [],
  };
  const result = reduceCombatEffectLifecycle(null, batch);
  if (result.status !== "applied") {
    throw new TypeError(`Unable to build lifecycle fixture: ${result.reason}`);
  }
  return result.runtime;
}

const LIFECYCLE_A = lifecycleRuntime("cast:a", "spell:alpha", "caster:a");
const LIFECYCLE_B = lifecycleRuntime("cast:b", "spell:beta", "caster:b");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("campaign-io — reviewed combat effects", () => {
  const encounter: EncounterState = {
    nextMonsterOrdinal: 2,
    round: 2,
    currentCombatantId: "pc-a",
    order: ["pc-a", "monster-1"],
    epoch: 1,
    status: "active",
    combatants: [
      { kind: "pc", id: "pc-a", memberUid: "a", characterId: "char-a" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 8,
        conditions: [],
        hp: { current: 5, temp: 0, max: 7 },
      },
    ],
  };
  const chillTouchEffect: ActiveCombatEffect = {
    id: "chill-touch:1",
    actor: { kind: "monster", combatantId: "caster" },
    target: { kind: "monster", combatantId: "monster-1" },
    source: {
      kind: "spell",
      id: "chill-touch",
      actionId: "spell-chill-touch",
    },
    payload: { kind: "grant-group", activeKey: "spell-chill-touch" },
    duration: { kind: "encounter" },
  };

  it("fresh-reads a manual campaign correction and writes only its effect root", async () => {
    const set = vi.fn();
    const playState = { version: 1 as const, state: { exhaustion: 2 } };
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) => {
          const path = ref.__doc?.slice(1).join("/");
          if (path === "users/a/characters/char-a") {
            return Promise.resolve({
              exists: () => true,
              data: () => ({ status: "active", playStateVersion: 1 }),
            });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              actionRevision: 4,
              actionHead: null,
              hp: { current: 9, temp: 2 },
              conditions: [],
              initiativeRoll: 17,
              deathSaves: { successes: 0, failures: 0 },
              round: 3,
              recentActions: [],
              playState,
            }),
          });
        },
        set,
      })
    );

    await writeCampaignCombatEffect(
      "a",
      "char-a",
      { ...defaultCombatState(20), hp: { current: 20, temp: 0 } },
      20,
      { kind: "hp", operation: { kind: "damage", amount: 4 } }
    );

    expect(set).toHaveBeenCalledWith(
      expect.anything(),
      {
        actionRevision: 5,
        hp: { current: 7, temp: 0 },
        updatedAt: { __serverTimestamp: true },
      },
      { merge: true }
    );
    expect(set.mock.calls[0]?.[1]).not.toHaveProperty("playState");
    expect(JSON.stringify(playState)).toBe(
      JSON.stringify({ version: 1, state: { exhaustion: 2 } })
    );
  });

  it("lands healing and an idempotent condition in one pure reduction", () => {
    const next = reduceDeclaredEffects(encounter, "camp-test", [
      { kind: "healing", targetId: "monster-1", amount: 4 },
      {
        kind: "condition",
        targetId: "monster-1",
        conditionId: "prone",
        active: true,
      },
    ]);
    const goblin = next.combatants.find((combatant) => combatant.id === "monster-1");
    expect(goblin?.kind === "monster" ? goblin.hp : null).toEqual({
      current: 7,
      temp: 0,
      max: 7,
    });
    expect(goblin?.kind === "monster" ? goblin.conditions : null).toEqual(["prone"]);
    expect(next.events?.map((event) => event.kind)).toEqual([
      "hp-heal",
      "condition-gain",
    ]);
  });

  it("resolves declared damage over TWO adversaries through the engine boundary", () => {
    // Each adversary delta is ONE committed coordinator action on the shared
    // journal (CAS-guarded, revision per commit) with the exact legacy mirror
    // (hp + chronicle beat, provenance attributed, action id stamped) landing
    // on the same encounter value the debounced writer persists.
    const pack: EncounterState = {
      ...encounter,
      nextMonsterOrdinal: 3,
      combatants: [
        ...encounter.combatants,
        {
          kind: "monster",
          id: "monster-2",
          name: "Wolf",
          ac: 12,
          initiative: 11,
          conditions: [],
          hp: { current: 11, temp: 0, max: 11 },
        },
      ],
    };
    const next = reduceDeclaredEffects(
      pack,
      "camp-test",
      [
        { kind: "damage", intake: "resolved", targetId: "monster-1", amount: 3 },
        { kind: "damage", intake: "resolved", targetId: "monster-2", amount: 5 },
      ],
      { actorId: "pc-a", action: { custom: "Scorching Ray" } }
    );
    expect(next.combatants.find((c) => c.id === "monster-1")).toMatchObject({
      hp: { current: 2, temp: 0, max: 7 },
    });
    expect(next.combatants.find((c) => c.id === "monster-2")).toMatchObject({
      hp: { current: 6, temp: 0, max: 11 },
    });
    expect(next.events).toHaveLength(2);
    expect(next.events?.[0]).toMatchObject({
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 3,
      attackerId: "pc-a",
      action: { custom: "Scorching Ray" },
    });
    expect(next.events?.[1]).toMatchObject({
      kind: "hp-damage",
      targetId: "monster-2",
      amount: 5,
      attackerId: "pc-a",
    });
    expect(next.events?.every((event) => event.engineActionId !== undefined)).toBe(true);
    // Two engine commits on the persisted shared journal: revision 2, both
    // actions committed (generation 1), the vitals proven world-side too.
    const world = encounterWorldState(next, "camp-test");
    expect(world).not.toBeNull();
    expect(world?.revision).toBe(2);
    expect(world?.actions.map(({ generation }) => generation)).toEqual([1, 1]);
    const wolf = world?.entities["monster-2"];
    expect(wolf?.kind === "creature" ? wolf.vitals.hitPoints.current : null).toBe(6);
  });

  it("prevents monster healing while Chill Touch is active", () => {
    const next = reduceDeclaredEffects(
      encounter,
      "camp-test",
      [{ kind: "healing", targetId: "monster-1", amount: 4 }],
      undefined,
      [chillTouchEffect]
    );
    const goblin = next.combatants.find((combatant) => combatant.id === "monster-1");
    expect(goblin?.kind === "monster" ? goblin.hp.current : null).toBe(5);
    expect(next.events).toBeUndefined();
  });

  it("does not duplicate a condition on transaction-style replay", () => {
    const once = reduceDeclaredEffects(encounter, "camp-test", [
      {
        kind: "condition",
        targetId: "monster-1",
        conditionId: "prone",
        active: true,
      },
    ]);
    const twice = reduceDeclaredEffects(once, "camp-test", [
      {
        kind: "condition",
        targetId: "monster-1",
        conditionId: "prone",
        active: true,
      },
    ]);
    expect(twice.events).toHaveLength(1);
  });

  it("leaves PC state to the direct combat-subdocument reducer", () => {
    const next = reduceDeclaredEffects(encounter, "camp-test", [
      { kind: "healing", targetId: "pc-a", amount: 6 },
      { kind: "temp-hp", targetId: "pc-a", amount: 9 },
      {
        kind: "condition",
        targetId: "pc-a",
        conditionId: "poisoned",
        active: false,
      },
    ]);
    expect(next).toBe(encounter);
  });

  it("heals an offline table-mate, cures the condition, and emits exact provenance", () => {
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 0,
        tempHp: 3,
        maxHp: 20,
        conditions: ["unconscious", "poisoned"],
        defenses: NO_DEFENSES,
      },
      [
        { kind: "healing", targetId: "pc-a", amount: 7 },
        {
          kind: "condition",
          targetId: "pc-a",
          conditionId: "poisoned",
          active: false,
        },
      ],
      {
        actorId: "pc-b",
        action: { srd: { kind: "spell", key: "lesser-restoration", field: "name" } },
        round: 2,
      }
    );

    expect(result).toMatchObject({
      hp: { current: 7, temp: 3 },
      conditions: [],
      deathSaves: { successes: 0, failures: 0 },
    });
    expect(result?.events).toEqual([
      expect.objectContaining({
        kind: "hp-heal",
        targetId: "pc-a",
        actorId: "pc-b",
        amount: 7,
      }),
      expect.objectContaining({
        kind: "condition-loss",
        targetId: "pc-a",
        actorId: "pc-b",
        conditionId: "poisoned",
      }),
    ]);
  });

  it("stabilizes an offline 0-HP PC without healing or clearing Unconscious", () => {
    const target = {
      targetId: "pc-a",
      memberUid: "a",
      characterId: "char-a",
      currentHp: 0,
      tempHp: 0,
      maxHp: 20,
      conditions: ["unconscious"],
      deathSaves: { successes: 1, failures: 2 },
      defenses: NO_DEFENSES,
    };
    const provenance = {
      actorId: "pc-b",
      action: {
        srd: { kind: "equipment" as const, key: "healers-kit", field: "name" },
      },
      round: 2,
    };
    const result = reduceDirectPcEffects(
      target,
      [{ kind: "stabilize", targetId: "pc-a" }],
      provenance
    );
    expect(result).toMatchObject({
      hp: { current: 0, temp: 0 },
      conditions: ["unconscious"],
      deathSaves: { successes: 3, failures: 0 },
    });
    expect(result?.events).toEqual([
      expect.objectContaining({
        kind: "stabilized",
        targetId: "pc-a",
        actorId: "pc-b",
      }),
    ]);

    expect(
      reduceDirectPcEffects(
        { ...target, deathSaves: { successes: 3, failures: 0 } },
        [{ kind: "stabilize", targetId: "pc-a" }],
        provenance
      )
    ).toBeNull();
  });

  it("prevents offline PC healing while preserving unrelated condition cures", () => {
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 7,
        tempHp: 0,
        maxHp: 20,
        conditions: ["poisoned"],
        defenses: NO_DEFENSES,
      },
      [
        { kind: "healing", targetId: "pc-a", amount: 8 },
        {
          kind: "condition",
          targetId: "pc-a",
          conditionId: "poisoned",
          active: false,
        },
      ],
      {
        actorId: "pc-b",
        action: { custom: "Healing and cure" },
        round: 2,
        persistentEffects: [
          {
            ...chillTouchEffect,
            target: {
              kind: "pc",
              combatantId: "pc-a",
              memberUid: "a",
              characterId: "char-a",
            },
          },
        ],
      }
    );
    expect(result).toMatchObject({ hp: { current: 7, temp: 0 }, conditions: [] });
    expect(result?.events).toEqual([
      expect.objectContaining({ kind: "condition-loss", conditionId: "poisoned" }),
    ]);
  });

  it.each([
    [
      "fresh parent lifecycle says dead",
      { lifecycleEligible: false, deathSaves: { successes: 0, failures: 1 } },
    ],
    [
      "the live combat slice has three failed saves",
      { deathSaves: { successes: 0, failures: 3 } },
    ],
  ])("rejects healing and stabilization when %s", (_cause, lifecycle) => {
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 0,
        tempHp: 0,
        maxHp: 20,
        conditions: ["unconscious", "poisoned"],
        ...lifecycle,
        defenses: NO_DEFENSES,
      },
      [
        { kind: "healing", targetId: "pc-a", amount: 8 },
        { kind: "stabilize", targetId: "pc-a" },
        {
          kind: "condition",
          targetId: "pc-a",
          conditionId: "poisoned",
          active: false,
        },
      ],
      { actorId: "pc-b", action: { custom: "Reviewed effects" }, round: 2 }
    );

    expect(result).toMatchObject({
      hp: { current: 0, temp: 0 },
      conditions: ["unconscious"],
    });
    expect(result?.events).toEqual([
      expect.objectContaining({ kind: "condition-loss", conditionId: "poisoned" }),
    ]);
  });

  it("delivers Bardic Inspiration to an offline PC as typed combat state", () => {
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 20,
        tempHp: 0,
        maxHp: 20,
        conditions: [],
        defenses: NO_DEFENSES,
      },
      [
        {
          kind: "resource",
          targetId: "pc-a",
          resource: { kind: "bardic-inspiration-die", value: "d6" },
        },
      ],
      {
        actorId: "pc-catalion",
        action: {
          srd: {
            kind: "class-feature",
            key: "bard-bardic-inspiration",
            field: "name",
          },
        },
        round: 2,
      }
    );

    expect(result?.bardicInspirationDie).toBe("d6");
    expect(result?.events).toEqual([
      expect.objectContaining({
        kind: "resource-grant",
        actorId: "pc-catalion",
        targetId: "pc-a",
        value: "d6",
      }),
    ]);
  });

  it("delivers non-stacking Heroic Inspiration to an offline PC", () => {
    const target = {
      targetId: "pc-a",
      memberUid: "a",
      characterId: "char-a",
      currentHp: 20,
      tempHp: 0,
      maxHp: 20,
      conditions: [],
      heroicInspiration: false,
      defenses: NO_DEFENSES,
    };
    const provenance = {
      actorId: "pc-catalion",
      action: { custom: "Encouraging Song" },
      round: 2,
    };
    const result = reduceDirectPcEffects(
      target,
      [
        {
          kind: "resource",
          targetId: "pc-a",
          resource: { kind: "heroic-inspiration" },
        },
      ],
      provenance
    );

    expect(result?.heroicInspiration).toBe(true);
    expect(result?.events).toEqual([
      expect.objectContaining({
        kind: "resource-grant",
        resource: "heroic-inspiration",
        actorId: "pc-catalion",
        targetId: "pc-a",
      }),
    ]);
    expect(
      reduceDirectPcEffects(
        { ...target, heroicInspiration: true },
        [
          {
            kind: "resource",
            targetId: "pc-a",
            resource: { kind: "heroic-inspiration" },
          },
        ],
        provenance
      )
    ).toBeNull();
  });

  it("tracks Bardic Inspiration on an NPC ally and records the grant", () => {
    const next = reduceDeclaredEffects(
      encounter,
      "camp-test",
      [
        {
          kind: "resource",
          targetId: "monster-1",
          resource: { kind: "bardic-inspiration-die", value: "d6" },
        },
      ],
      { actorId: "pc-a", action: { custom: "Bardic Inspiration" } }
    );
    const goblin = next.combatants.find((combatant) => combatant.id === "monster-1");
    expect(goblin?.kind === "monster" ? goblin.bardicInspirationDie : null).toBe("d6");
    expect(next.events?.at(-1)).toMatchObject({
      kind: "resource-grant",
      actorId: "pc-a",
      targetId: "monster-1",
      value: "d6",
    });
  });

  it("tracks Heroic Inspiration on an NPC ally without stacking it", () => {
    const next = reduceDeclaredEffects(
      encounter,
      "camp-test",
      [
        {
          kind: "resource",
          targetId: "monster-1",
          resource: { kind: "heroic-inspiration" },
        },
      ],
      { actorId: "pc-a", action: { custom: "Encouraging Song" } }
    );
    const goblin = next.combatants.find((combatant) => combatant.id === "monster-1");
    expect(goblin?.kind === "monster" ? goblin.heroicInspiration : null).toBe(true);
    expect(next.events?.at(-1)).toMatchObject({
      kind: "resource-grant",
      resource: "heroic-inspiration",
      actorId: "pc-a",
      targetId: "monster-1",
    });
    expect(
      reduceDeclaredEffects(next, "camp-test", [
        {
          kind: "resource",
          targetId: "monster-1",
          resource: { kind: "heroic-inspiration" },
        },
      ])
    ).toBe(next);
  });

  it("consumes a remote Death Ward and leaves its PC at exactly 1 HP", () => {
    const ward: ActiveCombatEffect = {
      id: "death-ward:1",
      actor: {
        kind: "pc",
        combatantId: "pc-b",
        memberUid: "b",
        characterId: "char-b",
      },
      target: {
        kind: "pc",
        combatantId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
      },
      source: { kind: "spell", id: "death-ward", actionId: "cast-ward" },
      payload: { kind: "grant-group", activeKey: "spell-death-ward" },
      duration: { kind: "encounter" },
    };
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 8,
        tempHp: 0,
        maxHp: 20,
        conditions: [],
        defenses: NO_DEFENSES,
      },
      [{ kind: "damage", intake: "resolved", targetId: "pc-a", amount: 20 }],
      {
        actorId: "monster-1",
        action: { custom: "table action" },
        round: 2,
        persistentEffects: [ward],
      }
    );

    expect(result).toMatchObject({
      hp: { current: 1, temp: 0 },
      consumedEffectIds: [ward.id],
    });
    expect(result?.events.some((event) => event.kind === "down")).toBe(false);
  });

  it("applies ordered hits after Death Ward instead of letting one ward absorb the total", () => {
    const ward: ActiveCombatEffect = {
      id: "death-ward:ordered",
      actor: {
        kind: "pc",
        combatantId: "pc-b",
        memberUid: "b",
        characterId: "char-b",
      },
      target: {
        kind: "pc",
        combatantId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
      },
      source: { kind: "spell", id: "death-ward", actionId: "cast-ward" },
      payload: { kind: "grant-group", activeKey: "spell-death-ward" },
      duration: { kind: "encounter" },
    };
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 8,
        tempHp: 0,
        maxHp: 20,
        conditions: [],
        defenses: NO_DEFENSES,
      },
      [
        { kind: "damage", intake: "resolved", targetId: "pc-a", amount: 20 },
        { kind: "damage", intake: "resolved", targetId: "pc-a", amount: 2 },
      ],
      {
        actorId: "monster-1",
        action: { custom: "two hits" },
        round: 2,
        persistentEffects: [ward],
      }
    );

    expect(result).toMatchObject({
      hp: { current: 0, temp: 0 },
      conditions: ["unconscious"],
      consumedEffectIds: [ward.id],
    });
    expect(result?.events.filter((event) => event.kind === "hp-damage")).toHaveLength(2);
  });

  it("does not reapply Warding Bond resistance to resolved damage before transfer", () => {
    const bond: ActiveCombatEffect = {
      id: "warding-bond:1",
      actor: {
        kind: "pc",
        combatantId: "pc-b",
        memberUid: "b",
        characterId: "char-b",
      },
      target: {
        kind: "pc",
        combatantId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
      },
      source: { kind: "spell", id: "warding-bond", actionId: "cast-bond" },
      payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
      duration: { kind: "encounter" },
    };
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 20,
        tempHp: 0,
        maxHp: 20,
        conditions: [],
        defenses: NO_DEFENSES,
      },
      [{ kind: "damage", intake: "resolved", targetId: "pc-a", amount: 4 }],
      {
        actorId: "monster-1",
        action: { custom: "table action" },
        round: 2,
        persistentEffects: [bond],
      }
    );

    expect(result).toMatchObject({
      hp: { current: 16, temp: 0 },
      transfers: [{ target: bond.actor, amount: 4, effectId: bond.id }],
    });
  });

  it("applies Warding Bond all-damage resistance exactly once to raw intake", () => {
    const bond: ActiveCombatEffect = {
      id: "warding-bond:raw",
      actor: {
        kind: "pc",
        combatantId: "pc-b",
        memberUid: "b",
        characterId: "char-b",
      },
      target: {
        kind: "pc",
        combatantId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
      },
      source: { kind: "spell", id: "warding-bond", actionId: "cast-bond" },
      payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
      duration: { kind: "encounter" },
    };
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 20,
        tempHp: 0,
        maxHp: 20,
        conditions: [],
        defenses: NO_DEFENSES,
      },
      [{ kind: "damage", intake: "raw", targetId: "pc-a", amount: 9 }],
      {
        actorId: "monster-1",
        action: { custom: "table action" },
        round: 2,
        persistentEffects: [bond],
      }
    );

    expect(result).toMatchObject({
      hp: { current: 16, temp: 0 },
      transfers: [
        { target: bond.actor, amount: 4, effectId: bond.id, intake: "resolved" },
      ],
    });
  });

  it("does not clamp an Aided PC back to its base max before applying damage", () => {
    const result = reduceDirectPcEffects(
      {
        targetId: "pc-a",
        memberUid: "a",
        characterId: "char-a",
        currentHp: 25,
        tempHp: 0,
        maxHp: 25,
        conditions: [],
        defenses: NO_DEFENSES,
      },
      [{ kind: "damage", intake: "resolved", targetId: "pc-a", amount: 1 }],
      { actorId: "monster-1", action: { custom: "table action" }, round: 2 }
    );
    expect(result?.hp).toEqual({ current: 24, temp: 0 });
  });

  it("resolves monster resistance, Death Ward, transfer, and consume atomically", async () => {
    const warded = { kind: "monster" as const, combatantId: "monster-2" };
    const caster = { kind: "monster" as const, combatantId: "monster-1" };
    const bond: ActiveCombatEffect = {
      id: "bond:monster",
      actor: caster,
      target: warded,
      source: { kind: "spell", id: "warding-bond", actionId: "cast-bond" },
      payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
      duration: { kind: "encounter" },
    };
    const deathWard: ActiveCombatEffect = {
      id: "death-ward:monster",
      actor: caster,
      target: warded,
      source: { kind: "spell", id: "death-ward", actionId: "cast-ward" },
      payload: { kind: "grant-group", activeKey: "spell-death-ward" },
      duration: { kind: "encounter" },
    };
    const live: EncounterState = {
      nextMonsterOrdinal: 3,
      round: 1,
      currentCombatantId: "monster-1",
      order: ["monster-1", "monster-2"],
      epoch: 1,
      status: "active",
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Caster",
          ac: 12,
          initiative: 10,
          conditions: [],
          hp: { current: 30, temp: 0, max: 30 },
        },
        {
          kind: "monster",
          id: "monster-2",
          name: "Warded",
          ac: 12,
          initiative: 9,
          conditions: [],
          hp: { current: 20, temp: 0, max: 20 },
        },
      ],
      effectOps: [
        { id: "apply:bond", kind: "apply", effect: bond },
        { id: "apply:death-ward", kind: "apply", effect: deathWard },
      ],
    };
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ memberDetails: {}, encounter: live }) }),
        update,
      })
    );

    await applyDeclaredCombatEffects("camp1", [
      // CombatResolver has already applied the ward's resistance: 50 → 25.
      { kind: "damage", intake: "resolved", targetId: "monster-2", amount: 25 },
    ]);

    expect(update.mock.calls[0]?.[1]).toMatchObject({
      "encounter.combatants": [
        expect.objectContaining({
          id: "monster-1",
          hp: { current: 5, temp: 0, max: 30 },
        }),
        expect.objectContaining({
          id: "monster-2",
          hp: { current: 1, temp: 0, max: 20 },
        }),
      ],
      "encounter.effectOps": [
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ kind: "revoke", effectId: deathWard.id }),
      ],
    });
  });

  it("threads ONE correlation identity through a declared attack: the engine action id and its chronicle beat share the pc-action seed", async () => {
    const caster = {
      kind: "pc" as const,
      id: "pc-attacker",
      memberUid: "attacker",
      characterId: "attacker-character",
    };
    const live: EncounterState = {
      nextMonsterOrdinal: 2,
      round: 1,
      currentCombatantId: caster.id,
      order: [caster.id, "monster-1"],
      epoch: 1,
      status: "active",
      combatants: [
        caster,
        {
          kind: "monster",
          id: "monster-1",
          name: "Goblin",
          ac: 12,
          initiative: 9,
          conditions: [],
          hp: { current: 10, temp: 0, max: 10 },
        },
      ],
    };
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ memberDetails: {}, encounter: live }) }),
        update,
      })
    );

    await applyDeclaredCombatEffects(
      "camp1",
      [{ kind: "damage", intake: "resolved", targetId: "monster-1", amount: 4 }],
      {
        actorId: caster.id,
        action: { custom: "Shortsword" },
        round: 1,
        outcomeOccurrenceId: "outcome-7",
        pcTargets: [],
        hitTargetIds: ["monster-1"],
      }
    );

    const written = update.mock.calls[0]?.[1];
    const events = written?.["encounter.events"] as EncounterState["events"];
    const beat = (events ?? []).find((event) => event.kind === "hp-damage");
    expect(beat?.engineActionId).toMatch(/^pc-action:sha256:[0-9a-f]+:damage:monster-1$/);
    // The engine world rides the SAME transaction write and records the SAME
    // correlated action id on the shared journal.
    const world = written?.["encounter.world"] as
      | { actions?: Array<{ id: string }> }
      | undefined;
    expect(world?.actions?.some(({ id }) => id === beat?.engineActionId)).toBe(true);
  });

  it("consumes multiple one-shot wards in one multi-target action", async () => {
    const monsters = ["monster-2", "monster-3"];
    const wards: ActiveCombatEffect[] = monsters.map((combatantId) => ({
      id: `death-ward:${combatantId}`,
      actor: { kind: "monster", combatantId: "monster-1" },
      target: { kind: "monster", combatantId },
      source: { kind: "spell", id: "death-ward", actionId: "cast-ward" },
      payload: { kind: "grant-group", activeKey: "spell-death-ward" },
      duration: { kind: "encounter" },
    }));
    const live: EncounterState = {
      nextMonsterOrdinal: 4,
      round: 1,
      currentCombatantId: "monster-1",
      order: ["monster-1", ...monsters],
      epoch: 1,
      status: "active",
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Caster",
          ac: 12,
          initiative: 10,
          conditions: [],
          hp: { current: 30, temp: 0, max: 30 },
        },
        ...monsters.map((id, index) => ({
          kind: "monster" as const,
          id,
          name: `Warded ${index + 1}`,
          ac: 12,
          initiative: 9 - index,
          conditions: [],
          hp: { current: 8, temp: 0, max: 8 },
        })),
      ],
      effectOps: wards.map((effect) => ({
        id: `apply:${effect.id}`,
        kind: "apply" as const,
        effect,
      })),
    };
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ memberDetails: {}, encounter: live }) }),
        update,
      })
    );

    await applyDeclaredCombatEffects(
      "camp1",
      monsters.map((targetId) => ({
        kind: "damage",
        intake: "resolved",
        targetId,
        amount: 50,
      }))
    );

    const written = update.mock.calls[0]?.[1];
    const combatants = written?.["encounter.combatants"] as EncounterState["combatants"];
    expect(
      combatants
        .filter((combatant) => monsters.includes(combatant.id))
        .map((combatant) => (combatant.kind === "monster" ? combatant.hp.current : null))
    ).toEqual([1, 1]);
    const effectOps = written?.["encounter.effectOps"] as CombatEffectOp[];
    expect(effectOps.filter((operation) => operation.kind === "revoke")).toHaveLength(2);
  });

  it("consumes declared next-roll effects atomically even without an HP change", async () => {
    const caster = {
      kind: "pc" as const,
      id: "pc-caster",
      memberUid: "caster",
      characterId: "caster-character",
    };
    const targets = ["monster-1", "monster-2"];
    const penalties: ActiveCombatEffect[] = targets.map((combatantId) => ({
      id: `mind-sliver:${combatantId}`,
      actor: {
        kind: "pc",
        combatantId: caster.id,
        memberUid: caster.memberUid,
        characterId: caster.characterId,
      },
      target: { kind: "monster", combatantId },
      source: { kind: "spell", id: "mind-sliver", actionId: "cast-sliver" },
      payload: { kind: "grant-group", activeKey: "spell-mind-sliver" },
      duration: { kind: "encounter" },
    }));
    const live: EncounterState = {
      nextMonsterOrdinal: 3,
      round: 1,
      currentCombatantId: caster.id,
      order: [caster.id, ...targets],
      epoch: 1,
      status: "active",
      combatants: [
        caster,
        ...targets.map((id, index) => ({
          kind: "monster" as const,
          id,
          name: `Target ${index + 1}`,
          ac: 12,
          initiative: 9 - index,
          conditions: [],
          hp: { current: 8, temp: 0, max: 8 },
        })),
      ],
      effectOps: penalties.map((effect) => ({
        id: `apply:${effect.id}`,
        kind: "apply" as const,
        effect,
      })),
    };
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ memberDetails: {}, encounter: live }) }),
        update,
      })
    );

    await applyDeclaredCombatEffects("camp1", [], {
      actorId: caster.id,
      action: { custom: "Saving throw" },
      round: 1,
      pcTargets: [],
      consumeEffectIds: penalties.map(({ id }) => id),
    });

    const written = update.mock.calls[0]?.[1];
    const effectOps = written?.["encounter.effectOps"] as CombatEffectOp[];
    expect(effectOps.filter((operation) => operation.kind === "revoke")).toEqual([
      expect.objectContaining({ effectId: penalties[0]?.id }),
      expect.objectContaining({ effectId: penalties[1]?.id }),
    ]);
    expect(written?.["encounter.combatants"]).toEqual(live.combatants);
  });

  it("fresh-reads and atomically writes a peer combat slice plus Chronicle", async () => {
    const set = vi.fn();
    const update = vi.fn();
    const liveEncounter: EncounterState = {
      ...encounter,
      combatants: [
        ...encounter.combatants,
        { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
      ],
    };
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) => {
          const path = ref.__doc?.slice(1).join("/");
          if (path === "campaigns/camp-1") {
            return Promise.resolve({
              data: () => ({ memberDetails: {}, encounter: liveEncounter }),
            });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              hp: { current: 2, temp: 0 },
              conditions: ["poisoned"],
              initiativeRoll: null,
              deathSaves: { successes: 0, failures: 1 },
              round: 2,
              recentActions: [],
            }),
          });
        },
        set,
        update,
      })
    );

    await applyDeclaredCombatEffects(
      "camp-1",
      [
        { kind: "healing", targetId: "pc-a", amount: 5 },
        {
          kind: "condition",
          targetId: "pc-a",
          conditionId: "poisoned",
          active: false,
        },
      ],
      {
        actorId: "pc-b",
        action: { custom: "Healing Word" },
        round: 2,
        pcTargets: [
          {
            targetId: "pc-a",
            memberUid: "a",
            characterId: "char-a",
            currentHp: 19,
            tempHp: 4,
            maxHp: 20,
            conditions: [],
            defenses: NO_DEFENSES,
          },
        ],
      }
    );

    // The stale values shown when the dialog opened are ignored: the transaction's
    // fresh 2 HP / poisoned snapshot is the reduction base.
    expect(set).toHaveBeenCalledWith(
      {
        __doc: [{ __db: true }, "users", "a", "characters", "char-a", "combat", "state"],
      },
      expect.objectContaining({
        hp: { current: 7, temp: 0 },
        conditions: [],
        updatedAt: { __serverTimestamp: true },
      }),
      { merge: true }
    );
    const [campaignRef, campaignUpdate] = update.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(campaignRef).toEqual({ __doc: [{ __db: true }, "campaigns", "camp-1"] });
    const events = campaignUpdate["encounter.events"];
    expect(Array.isArray(events)).toBe(true);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "hp-heal",
          targetId: "pc-a",
          amount: 5,
          action: { custom: "Healing Word" },
        }),
        expect.objectContaining({
          kind: "condition-loss",
          targetId: "pc-a",
          conditionId: "poisoned",
        }),
      ])
    );
  });

  it("patches only peer effect roots and preserves nested v1 play state byte-for-byte", async () => {
    const target = {
      kind: "pc" as const,
      id: "pc-a",
      memberUid: "a",
      characterId: "char-a",
    };
    const actor = {
      kind: "pc" as const,
      id: "pc-b",
      memberUid: "b",
      characterId: "char-b",
    };
    const liveEncounter: EncounterState = {
      nextMonsterOrdinal: 1,
      round: 2,
      currentCombatantId: actor.id,
      order: [actor.id, target.id],
      epoch: 7,
      status: "active",
      combatants: [actor, target],
    };
    const playState = {
      version: 1 as const,
      state: {
        concentration: "bless",
        exhaustion: 1,
        notes: "owner-only nested fact",
      },
    };
    const storedCombat = {
      actionRevision: 12,
      actionHead: null,
      actionLifecycles: {},
      hp: { current: 20, temp: 0 },
      conditions: [],
      initiativeRoll: 17,
      deathSaves: { successes: 0, failures: 0 },
      round: 4,
      recentActions: [
        {
          id: "owner-action",
          targetIds: ["monster-1"],
          outcome: "miss",
          round: 4,
        },
      ],
      turnEconomy: {
        key: "solo:4",
        selected: { action: [], bonus: [], free: [] },
        attacksUsed: 0,
        attackSwings: [],
        outcomeOrdinal: 0,
        outcomeReceipts: [],
        reactionUsed: false,
        reactionUsedId: null,
        reactionOutcomeOccurrenceId: null,
        movementUsedFt: 0,
        dashesThisTurn: 0,
        spellSlotCastsThisTurn: 0,
        spellSlotCastTurnKey: null,
        damageTakenThisRound: false,
        nextAttackAdvantage: false,
        movementLocked: false,
      },
      playState,
    };
    const set = vi.fn();
    const update = vi.fn();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) => {
          const path = ref.__doc?.slice(1).join("/");
          if (path === "campaigns/camp-1") {
            return Promise.resolve({
              data: () => ({ memberDetails: {}, encounter: liveEncounter }),
            });
          }
          if (path === "users/a/characters/char-a") {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                status: "active",
                playStateVersion: 1,
                state: { concentration: "hex", exhaustion: 6 },
              }),
            });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => storedCombat,
          });
        },
        set,
        update,
      })
    );

    await applyDeclaredCombatEffects(
      "camp-1",
      [{ kind: "damage", intake: "resolved", targetId: target.id, amount: 4 }],
      {
        actorId: actor.id,
        action: { custom: "V1 hit" },
        round: 2,
        outcomeOccurrenceId: "v1-hit",
        pcTargets: [
          {
            targetId: target.id,
            memberUid: target.memberUid,
            characterId: target.characterId,
            currentHp: 99,
            tempHp: 0,
            maxHp: 20,
            conditions: [],
            defenses: NO_DEFENSES,
          },
        ],
      }
    );

    const patch = set.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch).toMatchObject({
      actionRevision: 13,
      hp: { current: 16, temp: 0 },
      pendingConcentrationSaves: [expect.objectContaining({ spell: "bless", damage: 4 })],
    });
    for (const privateRoot of [
      "playState",
      "actionHead",
      "actionLifecycles",
      "initiativeRoll",
      "round",
      "recentActions",
      "turnEconomy",
    ]) {
      expect(patch).not.toHaveProperty(privateRoot);
    }
    expect(set.mock.calls[0]?.[2]).toEqual({ merge: true });
    expect(JSON.stringify({ ...storedCombat, ...patch }.playState)).toBe(
      JSON.stringify(playState)
    );
  });

  it.each([
    [
      "missing",
      { exists: (): boolean => false },
      { status: "active", playStateVersion: 1 },
    ],
    [
      "malformed",
      {
        exists: (): boolean => true,
        data: () => ({ hp: {}, conditions: [], initiativeRoll: null, deathSaves: {} }),
      },
      { status: "active", playStateVersion: 1 },
    ],
    [
      "owned by an unknown marker version",
      {
        exists: (): boolean => true,
        data: () => ({
          hp: { current: 20, temp: 0 },
          conditions: [],
          initiativeRoll: null,
          deathSaves: { successes: 0, failures: 0 },
        }),
      },
      { status: "active", playStateVersion: 2 },
    ],
  ])(
    "aborts a peer transaction when target play state is %s",
    async (_case, combatSnap, parentData) => {
      const set = vi.fn();
      const update = vi.fn();
      const liveEncounter: EncounterState = {
        ...encounter,
        combatants: [
          ...encounter.combatants,
          { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
        ],
      };
      runTransactionMock.mockImplementationOnce(async (_db, fn) =>
        fn({
          get: (ref: { __doc?: unknown[] }) => {
            const path = ref.__doc?.slice(1).join("/");
            if (path === "campaigns/camp-1") {
              return Promise.resolve({
                data: () => ({ memberDetails: {}, encounter: liveEncounter }),
              });
            }
            if (path === "users/a/characters/char-a") {
              return Promise.resolve({
                exists: () => true,
                data: () => parentData,
              });
            }
            return Promise.resolve(combatSnap);
          },
          set,
          update,
        })
      );

      await expect(
        applyDeclaredCombatEffects(
          "camp-1",
          [{ kind: "damage", intake: "resolved", targetId: "pc-a", amount: 4 }],
          {
            actorId: "pc-b",
            action: { custom: "Invalid target" },
            round: 2,
            pcTargets: [
              {
                targetId: "pc-a",
                memberUid: "a",
                characterId: "char-a",
                currentHp: 20,
                tempHp: 0,
                maxHp: 20,
                conditions: [],
                defenses: NO_DEFENSES,
              },
            ],
          }
        )
      ).rejects.toThrow(/target (?:play state|play-state)/);
      expect(set).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    }
  );

  it("queues one retry-stable Concentration save per remote damage packet", async () => {
    const target = {
      kind: "pc" as const,
      id: "pc-a",
      memberUid: "a",
      characterId: "char-a",
    };
    const actor = {
      kind: "pc" as const,
      id: "pc-b",
      memberUid: "b",
      characterId: "char-b",
    };
    const liveEncounter: EncounterState = {
      nextMonsterOrdinal: 1,
      round: 2,
      currentCombatantId: actor.id,
      order: [actor.id, target.id],
      epoch: 7,
      status: "active",
      combatants: [actor, target],
      events: [],
    };
    const transactionWrites: Record<string, unknown>[][] = [];
    runTransactionMock.mockImplementationOnce(async (_db, fn) => {
      for (let retry = 0; retry < 2; retry += 1) {
        const writes: Record<string, unknown>[] = [];
        await fn({
          get: (ref: { __doc?: unknown[] }) => {
            const path = ref.__doc?.slice(1).join("/");
            if (path === "campaigns/camp-1") {
              return Promise.resolve({
                data: () => ({ memberDetails: {}, encounter: liveEncounter }),
              });
            }
            if (path === "users/a/characters/char-a") {
              return Promise.resolve({
                exists: () => true,
                data: () => ({ status: "active", state: { concentration: "bless" } }),
              });
            }
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                hp: { current: 100, temp: 0 },
                conditions: [],
                initiativeRoll: null,
                deathSaves: { successes: 0, failures: 0 },
                round: 2,
                recentActions: [],
              }),
            });
          },
          set: (_ref: unknown, data: Record<string, unknown>) => writes.push(data),
          update: vi.fn(),
        });
        transactionWrites.push(writes);
      }
    });

    await applyDeclaredCombatEffects(
      "camp-1",
      [
        { kind: "damage", intake: "resolved", targetId: target.id, amount: 8 },
        { kind: "damage", intake: "resolved", targetId: target.id, amount: 64 },
      ],
      {
        actorId: actor.id,
        action: { custom: "Two impacts" },
        round: 2,
        outcomeOccurrenceId: "encounter:camp-1:7:2:pc-b:outcome:3:spell",
        pcTargets: [
          {
            targetId: target.id,
            memberUid: target.memberUid,
            characterId: target.characterId,
            currentHp: 100,
            tempHp: 0,
            maxHp: 100,
            conditions: [],
            defenses: NO_DEFENSES,
          },
        ],
      }
    );

    const firstQueue = transactionWrites[0]?.[0]?.pendingConcentrationSaves;
    const retryQueue = transactionWrites[1]?.[0]?.pendingConcentrationSaves;
    expect(firstQueue).toEqual(retryQueue);
    expect(firstQueue).toEqual([
      expect.objectContaining({ spell: "bless", damage: 8, difficultyClass: 10 }),
      expect.objectContaining({ spell: "bless", damage: 64, difficultyClass: 30 }),
    ]);
    expect((firstQueue as Array<{ id: string }>).map(({ id }) => id)).toHaveLength(2);
    expect(new Set((firstQueue as Array<{ id: string }>).map(({ id }) => id)).size).toBe(
      2
    );
  });

  it("clears queued saves and revokes source effects when remote damage drops a caster", async () => {
    const target = {
      kind: "pc" as const,
      id: "pc-a",
      memberUid: "a",
      characterId: "char-a",
    };
    const actor = {
      kind: "pc" as const,
      id: "pc-b",
      memberUid: "b",
      characterId: "char-b",
    };
    const heldEffect: ActiveCombatEffect = {
      id: "bless:held",
      actor: {
        kind: "pc",
        combatantId: target.id,
        memberUid: target.memberUid,
        characterId: target.characterId,
      },
      target: {
        kind: "pc",
        combatantId: target.id,
        memberUid: target.memberUid,
        characterId: target.characterId,
      },
      source: { kind: "spell", id: "bless", actionId: "spell-bless" },
      payload: { kind: "condition", conditionId: "blessed-test" },
      duration: { kind: "concentration", actorId: target.id, sourceId: "bless" },
    };
    const liveEncounter: EncounterState = {
      nextMonsterOrdinal: 1,
      round: 2,
      currentCombatantId: actor.id,
      order: [actor.id, target.id],
      epoch: 7,
      status: "active",
      combatants: [actor, target],
      effectOps: [{ id: "apply:bless", kind: "apply", effect: heldEffect }],
    };
    const set = vi.fn();
    const update = vi.fn();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) => {
          const path = ref.__doc?.slice(1).join("/");
          if (path === "campaigns/camp-1") {
            return Promise.resolve({
              data: () => ({ memberDetails: {}, encounter: liveEncounter }),
            });
          }
          if (path === "users/a/characters/char-a") {
            return Promise.resolve({
              exists: () => true,
              data: () => ({ status: "active", state: { concentration: "bless" } }),
            });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              hp: { current: 5, temp: 0 },
              conditions: [],
              initiativeRoll: null,
              deathSaves: { successes: 0, failures: 0 },
              round: 2,
              recentActions: [],
              pendingConcentrationSaves: [
                {
                  id: "older-hit",
                  spell: "bless",
                  damage: 12,
                  difficultyClass: 10,
                },
              ],
            }),
          });
        },
        set,
        update,
      })
    );

    await applyDeclaredCombatEffects(
      "camp-1",
      [{ kind: "damage", intake: "resolved", targetId: target.id, amount: 9 }],
      {
        actorId: actor.id,
        action: { custom: "Lethal impact" },
        round: 2,
        outcomeOccurrenceId: "lethal-occurrence",
        pcTargets: [
          {
            targetId: target.id,
            memberUid: target.memberUid,
            characterId: target.characterId,
            currentHp: 5,
            tempHp: 0,
            maxHp: 20,
            conditions: [],
            defenses: NO_DEFENSES,
          },
        ],
      }
    );

    expect(set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        hp: { current: 0, temp: 0 },
        pendingConcentrationSaves: [],
      }),
      { merge: true }
    );
    const campaignUpdate = update.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(campaignUpdate?.["encounter.effectOps"]).toEqual([
      expect.objectContaining({ kind: "apply", effect: heldEffect }),
      expect.objectContaining({ kind: "revoke", effectId: heldEffect.id }),
    ]);
  });

  it.each([
    ["uses its explicit 6 instead of parent 0", 0, { exhaustion: 6 }, false],
    ["uses its default 0 instead of parent 6", 6, {}, true],
  ])("v1 Exhaustion %s", async (_case, parentExhaustion, playState, healingLands) => {
    const set = vi.fn();
    const update = vi.fn();
    const liveEncounter: EncounterState = {
      ...encounter,
      combatants: [
        ...encounter.combatants,
        { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
      ],
    };
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) => {
          const path = ref.__doc?.slice(1).join("/");
          if (path === "campaigns/camp-1") {
            return Promise.resolve({
              data: () => ({ memberDetails: {}, encounter: liveEncounter }),
            });
          }
          if (path === "users/a/characters/char-a") {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                status: "active",
                playStateVersion: 1,
                state: { exhaustion: parentExhaustion },
              }),
            });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              hp: { current: 2, temp: 0 },
              conditions: ["poisoned"],
              initiativeRoll: null,
              deathSaves: { successes: 0, failures: 1 },
              round: 2,
              recentActions: [],
              playState: { version: 1, state: playState },
            }),
          });
        },
        set,
        update,
      })
    );

    await applyDeclaredCombatEffects(
      "camp-1",
      [
        { kind: "healing", targetId: "pc-a", amount: 5 },
        {
          kind: "condition",
          targetId: "pc-a",
          conditionId: "poisoned",
          active: false,
        },
      ],
      {
        actorId: "pc-b",
        action: { custom: "Healing and cure" },
        round: 2,
        pcTargets: [
          {
            targetId: "pc-a",
            memberUid: "a",
            characterId: "char-a",
            currentHp: 19,
            tempHp: 4,
            maxHp: 20,
            conditions: [],
            defenses: NO_DEFENSES,
          },
        ],
      }
    );

    expect(set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionRevision: 1, conditions: [] }),
      { merge: true }
    );
    const patch = set.mock.calls[0]?.[1] as Record<string, unknown>;
    if (healingLands) expect(patch.hp).toEqual({ current: 7, temp: 0 });
    else expect(patch).not.toHaveProperty("hp");
    const campaignUpdate = update.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(campaignUpdate?.["encounter.events"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "condition-loss", conditionId: "poisoned" }),
      ])
    );
    expect(
      (campaignUpdate?.["encounter.events"] as Array<{ kind: string }>).some(
        ({ kind }) => kind === "hp-heal"
      )
    ).toBe(healingLands);
  });

  it("fresh-reads queued peer death saves and rejects healing at three failures", async () => {
    const set = vi.fn();
    const update = vi.fn();
    const queuedEncounter: EncounterState = {
      ...encounter,
      memberEffects: [
        { id: "heal-dead-pc", targetId: "pc-a", kind: "healing", amount: 5 },
      ],
    };
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) => {
          const path = ref.__doc?.slice(1).join("/");
          if (path === "campaigns/camp-1") {
            return Promise.resolve({
              data: () => ({ memberDetails: {}, encounter: queuedEncounter }),
            });
          }
          if (path === "users/a/characters/char-a") {
            return Promise.resolve({
              exists: () => true,
              data: () => ({ status: "active", state: { exhaustion: 0 } }),
            });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => ({
              hp: { current: 0, temp: 0 },
              conditions: ["unconscious"],
              initiativeRoll: null,
              deathSaves: { successes: 0, failures: 3 },
              round: 2,
              recentActions: [],
              appliedEffectIds: [],
            }),
          });
        },
        set,
        update,
      })
    );

    await deliverQueuedMemberEffects({
      campaignId: "camp-1",
      uid: "a",
      characterId: "char-a",
      targetId: "pc-a",
      maxHp: 20,
    });

    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("applies Temporary HP to monsters with max-wins semantics and consumes it first", () => {
    const fortified = reduceDeclaredEffects(encounter, "camp-test", [
      { kind: "temp-hp", targetId: "monster-1", amount: 4 },
      { kind: "temp-hp", targetId: "monster-1", amount: 2 },
    ]);
    const damaged = reduceDeclaredEffects(fortified, "camp-test", [
      { kind: "damage", intake: "resolved", targetId: "monster-1", amount: 6 },
    ]);
    expect(damaged.combatants.find((c) => c.id === "monster-1")).toMatchObject({
      hp: { current: 3, temp: 0, max: 7 },
    });
    expect(damaged.events?.at(-1)).toMatchObject({
      kind: "hp-damage",
      amount: 6,
      tempAbsorbed: 4,
    });
  });
});

describe("canonical PC damage adapter parity", () => {
  const target = {
    kind: "pc" as const,
    combatantId: "pc-a",
    memberUid: "a",
    characterId: "char-a",
  };
  const actor = {
    kind: "pc" as const,
    combatantId: "pc-b",
    memberUid: "b",
    characterId: "char-b",
  };
  const deathWard: ActiveCombatEffect = {
    id: "ward:parity",
    actor,
    target,
    source: { kind: "spell", id: "death-ward", actionId: "cast-ward" },
    payload: { kind: "grant-group", activeKey: "spell-death-ward" },
    duration: { kind: "encounter" },
  };
  const wardingBond: ActiveCombatEffect = {
    id: "bond:parity",
    actor,
    target,
    source: { kind: "spell", id: "warding-bond", actionId: "cast-bond" },
    payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
    duration: { kind: "encounter" },
  };

  beforeEach(() => {
    useCharacterStore.setState({
      encounterEffectProjection: null,
      combatPersistence: null,
      combatActiveEffects: [],
    });
    useCharacterStore.getState().setCharacter(null);
  });

  function expectParity(input: {
    current: number;
    temp?: number;
    max: number;
    amount: number;
    crit?: boolean;
    conditions?: string[];
    successes?: number;
    failures?: number;
    activeFeatures?: string[];
    effects?: ActiveCombatEffect[];
  }) {
    const conditions = input.conditions ?? [];
    const deathSaves = {
      successes: input.successes ?? 0,
      failures: input.failures ?? 0,
    };
    const local = makeCharacterDoc(
      { hp: { max: input.max } },
      {
        hp: { current: input.current, temp: input.temp ?? 0 },
        conditions,
        deathSucc: deathSaves.successes,
        deathFail: deathSaves.failures,
        activeFeatures: input.activeFeatures,
      }
    );
    useCharacterStore.getState().setCharacter(local);
    useCharacterStore.getState().setEncounterEffects(local.id, input.effects ?? []);
    useCharacterStore
      .getState()
      .applyDamage(input.amount, input.crit ? { crit: true } : undefined);
    const localSession = useCharacterStore.getState().character?.session;
    const remote = reduceDirectPcEffects(
      {
        targetId: target.combatantId,
        memberUid: target.memberUid,
        characterId: target.characterId,
        currentHp: input.current,
        tempHp: input.temp ?? 0,
        maxHp: input.max,
        conditions,
        deathSaves,
        defenses: NO_DEFENSES,
      },
      [
        {
          kind: "damage",
          intake: "resolved",
          targetId: target.combatantId,
          amount: input.amount,
          ...(input.crit ? { crit: true } : {}),
        },
      ],
      {
        actorId: "monster-1",
        action: { custom: "parity hit" },
        round: 1,
        persistentEffects: input.effects,
      }
    );

    expect(localSession).toBeDefined();
    expect(remote).not.toBeNull();
    expect({
      hp: localSession?.hp,
      conditions: localSession?.conditions,
      deathSaves: {
        successes: localSession?.deathSucc,
        failures: localSession?.deathFail,
      },
    }).toEqual({
      hp: remote?.hp,
      conditions: remote?.conditions,
      deathSaves: remote?.deathSaves ?? deathSaves,
    });
    return { localSession, remote };
  }

  it.each([
    {
      name: "Temporary HP absorption",
      current: 20,
      temp: 5,
      max: 20,
      amount: 7,
    },
    {
      name: "Critical damage at 0 HP resets stability and adds two failures",
      current: 0,
      max: 20,
      amount: 1,
      crit: true,
      conditions: ["unconscious"],
      successes: 3,
    },
    {
      name: "ordinary knockout",
      current: 5,
      max: 20,
      amount: 5,
    },
    {
      name: "massive-damage death",
      current: 5,
      max: 20,
      amount: 25,
    },
  ])("lands identical $name state", (input) => {
    expectParity(input);
  });

  it("consumes duplicate Death Ward authorities once and lands the same HP", () => {
    const { localSession, remote } = expectParity({
      current: 8,
      max: 20,
      amount: 20,
      activeFeatures: ["spell-death-ward"],
      effects: [deathWard],
    });

    expect(localSession?.activeFeatures).not.toContain("spell-death-ward");
    expect(localSession?.encounterEffects ?? []).not.toContainEqual(deathWard);
    expect(
      useCharacterStore.getState().encounterEffectProjection?.effects ?? []
    ).not.toContainEqual(deathWard);
    expect(remote?.consumedEffectIds).toEqual([deathWard.id]);
    expect(
      localSession?.logEntries.find((entry) => entry.event.kind === "hp-damage")?.event
    ).toMatchObject({ kind: "hp-damage", amount: 20, current: 1 });
    expect(remote?.events.find((event) => event.kind === "hp-damage")).toMatchObject({
      kind: "hp-damage",
      amount: 7,
      current: 1,
      max: 20,
    });

    useCharacterStore.getState().setHP(8);
    useCharacterStore.getState().applyDamage(20);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(0);
  });

  it("accepts already-resolved Warding Bond damage exactly once in both paths", () => {
    const { remote } = expectParity({
      current: 20,
      max: 20,
      amount: 4,
      effects: [wardingBond],
    });
    expect(remote?.transfers).toEqual([
      {
        target: actor,
        amount: 4,
        effectId: wardingBond.id,
        intake: "resolved",
      },
    ]);
  });
});

describe("campaign-io — persistent combat-effect operation log", () => {
  const effect: ActiveCombatEffect = {
    id: "heroism:cast-1:pc-a",
    actor: {
      kind: "pc",
      combatantId: "pc-b",
      memberUid: "b",
      characterId: "char-b",
    },
    target: {
      kind: "pc",
      combatantId: "pc-a",
      memberUid: "a",
      characterId: "char-a",
    },
    source: { kind: "spell", id: "heroism", actionId: "cast-1" },
    payload: { kind: "grant-group", activeKey: "heroism-active" },
    duration: { kind: "concentration", actorId: "pc-b", sourceId: "heroism" },
  };

  function runEffectTransaction(effectOps: CombatEffectOp[] = []) {
    const update = vi.fn();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({
            data: () => ({
              encounter: {
                effectOps,
                nextMonsterOrdinal: 1,
                round: 1,
                currentCombatantId: null,
                epoch: 1,
                status: "active",
                combatants: [
                  {
                    kind: "pc",
                    id: "pc-a",
                    memberUid: "a",
                    characterId: "char-a",
                  },
                  {
                    kind: "pc",
                    id: "pc-b",
                    memberUid: "b",
                    characterId: "char-b",
                  },
                ],
              },
            }),
          }),
        update,
      })
    );
    return update;
  }

  it("appends one sanitized apply operation with a stable occurrence id", async () => {
    const update = runEffectTransaction();
    await appendPersistentCombatEffect("camp1", effect);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      "encounter.effectOps": [{ id: `apply:${effect.id}`, kind: "apply", effect }],
      updatedAt: { __serverTimestamp: true },
    });
  });

  it("is idempotent when the same effect occurrence is replayed", async () => {
    const update = runEffectTransaction([
      { id: `apply:${effect.id}`, kind: "apply", effect },
    ]);
    await appendPersistentCombatEffect("camp1", effect);
    expect(update).not.toHaveBeenCalled();
  });

  it("applies and revokes Aid's exact current-HP delta in the same transaction", async () => {
    const aid: ActiveCombatEffect = {
      ...effect,
      id: "aid:cast-1:pc-a",
      source: { kind: "spell", id: "aid", actionId: "cast-1", castLevel: 4 },
      payload: { kind: "grant-group", activeKey: "spell-aid" },
      duration: { kind: "encounter" },
    };
    const set = vi.fn();
    const update = vi.fn();
    const campaign = {
      memberDetails: {
        a: {
          characterId: "char-a",
          role: "player",
          displayName: "A",
          character: { hpMax: 20 },
        },
      },
      encounter: {
        effectOps: [],
        nextMonsterOrdinal: 1,
        round: 1,
        currentCombatantId: null,
        epoch: 1,
        status: "active",
        combatants: [
          { kind: "pc", id: "pc-a", memberUid: "a", characterId: "char-a" },
          { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
        ],
      },
    };
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) =>
          ref.__doc?.includes("combat")
            ? Promise.resolve({
                exists: () => true,
                data: () => ({
                  hp: { current: 10, temp: 0 },
                  conditions: [],
                  initiativeRoll: null,
                  deathSaves: { successes: 0, failures: 0 },
                  round: 1,
                  recentActions: [],
                }),
              })
            : ref.__doc?.includes("characters")
              ? Promise.resolve({
                  exists: () => true,
                  data: () => ({ status: "active" }),
                })
              : Promise.resolve({ data: () => campaign }),
        set,
        update,
      })
    );

    await appendPersistentCombatEffect("camp1", aid);

    const applied = (update.mock.calls[0]?.[1] as Record<string, unknown>)[
      "encounter.effectOps"
    ] as CombatEffectOp[];
    expect(applied[0]).toMatchObject({
      kind: "apply",
      effect: { id: aid.id, applied: { currentHpDelta: 15 } },
    });
    expect(set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionRevision: 1, hp: { current: 25, temp: 0 } }),
      { merge: true }
    );

    set.mockClear();
    update.mockClear();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) =>
          ref.__doc?.includes("combat")
            ? Promise.resolve({
                exists: () => true,
                data: () => ({
                  hp: { current: 25, temp: 0 },
                  conditions: [],
                  initiativeRoll: null,
                  deathSaves: { successes: 0, failures: 0 },
                  round: 1,
                  recentActions: [],
                }),
              })
            : ref.__doc?.includes("characters")
              ? Promise.resolve({
                  exists: () => true,
                  data: () => ({ status: "active" }),
                })
              : Promise.resolve({
                  data: () => ({
                    ...campaign,
                    encounter: { ...campaign.encounter, effectOps: applied },
                  }),
                }),
        set,
        update,
      })
    );

    await revokePersistentCombatEffect("camp1", aid.id);
    expect(set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionRevision: 1, hp: { current: 10, temp: 0 } }),
      { merge: true }
    );
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      "encounter.effectOps": [applied[0], { kind: "revoke", effectId: aid.id }],
    });
  });

  it("reconciles a superseded monster Aid without stacking max or current HP", async () => {
    const target = { kind: "monster" as const, combatantId: "monster-1" };
    const oldAid: ActiveCombatEffect = {
      ...effect,
      id: "aid:old",
      target,
      source: { kind: "spell", id: "aid", actionId: "old", castLevel: 2 },
      payload: { kind: "grant-group", activeKey: "spell-aid" },
      applied: { currentHpDelta: 5 },
      duration: { kind: "encounter" },
    };
    const oldAidInput = { ...oldAid };
    delete oldAidInput.applied;
    const stronger: ActiveCombatEffect = {
      ...oldAidInput,
      id: "aid:new",
      source: { ...oldAid.source, actionId: "new", castLevel: 4 },
    };
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({
            data: () => ({
              encounter: {
                effectOps: [{ id: "apply:old", kind: "apply", effect: oldAid }],
                nextMonsterOrdinal: 2,
                round: 1,
                currentCombatantId: null,
                epoch: 1,
                status: "active",
                combatants: [
                  { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
                  {
                    kind: "monster",
                    id: "monster-1",
                    name: "Goblin",
                    ac: 13,
                    initiative: 8,
                    conditions: [],
                    hp: { current: 12, temp: 0, max: 12 },
                  },
                ],
              },
            }),
          }),
        update,
      })
    );

    await appendPersistentCombatEffect("camp1", stronger);

    const written = update.mock.calls[0]?.[1];
    expect(written).toMatchObject({
      "encounter.combatants": [
        expect.anything(),
        expect.objectContaining({ hp: { current: 22, temp: 0, max: 22 } }),
      ],
    });
    const writtenOps = written?.["encounter.effectOps"] as CombatEffectOp[];
    const applied = writtenOps.find(
      (operation) => operation.kind === "apply" && operation.effect.id === stronger.id
    );
    expect(applied?.kind === "apply" ? applied.effect.applied : null).toEqual({
      currentHpDelta: 15,
    });
  });

  it("rejects missing, kind-mismatched, or spoofed encounter participants", async () => {
    const missingUpdate = runEffectTransaction();
    await expect(
      appendPersistentCombatEffect("camp1", {
        ...effect,
        target: { kind: "monster", combatantId: "missing" },
      })
    ).rejects.toThrow("Combat effect participant mismatch");
    expect(missingUpdate).not.toHaveBeenCalled();

    const spoofedUpdate = runEffectTransaction();
    await expect(
      appendPersistentCombatEffect("camp1", {
        ...effect,
        actor: {
          kind: "pc",
          combatantId: "pc-b",
          memberUid: "b",
          characterId: "someone-elses-character",
        },
      })
    ).rejects.toThrow("Combat effect participant mismatch");
    expect(spoofedUpdate).not.toHaveBeenCalled();

    const wrongKindUpdate = runEffectTransaction();
    await expect(
      appendPersistentCombatEffect("camp1", {
        ...effect,
        target: { kind: "monster", combatantId: "pc-a" },
      })
    ).rejects.toThrow("Combat effect participant mismatch");
    expect(wrongKindUpdate).not.toHaveBeenCalled();
  });

  it("appends an exact revoke using provenance from the stored application", async () => {
    const apply: CombatEffectOp = {
      id: `apply:${effect.id}`,
      kind: "apply",
      effect,
    };
    const update = runEffectTransaction([apply]);
    await revokePersistentCombatEffect("camp1", effect.id);
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      "encounter.effectOps": [
        apply,
        {
          id: `revoke:${effect.id}`,
          kind: "revoke",
          effectId: effect.id,
          actorId: "pc-b",
          targetId: "pc-a",
        },
      ],
    });
  });

  it("treats a missing or already-revoked occurrence as a no-op", async () => {
    const missingUpdate = runEffectTransaction();
    await revokePersistentCombatEffect("camp1", "missing");
    expect(missingUpdate).not.toHaveBeenCalled();

    const revoke: CombatEffectOp = {
      id: `revoke:${effect.id}`,
      kind: "revoke",
      effectId: effect.id,
      actorId: "pc-b",
      targetId: "pc-a",
    };
    const duplicateUpdate = runEffectTransaction([
      { id: `apply:${effect.id}`, kind: "apply", effect },
      revoke,
    ]);
    await revokePersistentCombatEffect("camp1", effect.id);
    expect(duplicateUpdate).not.toHaveBeenCalled();
  });

  it("fails before exceeding the bounded campaign-document ledger", async () => {
    const full = Array.from(
      { length: 512 },
      (_, index): CombatEffectOp => ({
        id: `apply:${index}`,
        kind: "apply",
        effect: { ...effect, id: String(index) },
      })
    );
    const update = runEffectTransaction(full);
    await expect(appendPersistentCombatEffect("camp1", effect)).rejects.toThrow(
      "Combat effect operation limit reached"
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("drops malformed legacy operations before engine consumers see them", () => {
    expect(
      conformCombatEffectOps([
        { id: "broken", kind: "apply", effect: { id: "missing-nested-shapes" } },
        { id: "also-broken", kind: "revoke", effectId: 42 },
        { id: "wrong-kind", kind: "surprise" },
      ])
    ).toEqual([]);
  });

  it("drops a revoke whose actor/target provenance does not match its apply", () => {
    const apply: CombatEffectOp = {
      id: `apply:${effect.id}`,
      kind: "apply",
      effect,
    };
    expect(
      conformCombatEffectOps([
        apply,
        {
          id: `revoke:${effect.id}`,
          kind: "revoke",
          effectId: effect.id,
          actorId: "pc-spoofed",
          targetId: "pc-a",
        },
      ])
    ).toEqual([apply]);
  });

  it("preserves a valid application and its exact inverse", () => {
    const operations: CombatEffectOp[] = [
      { id: `apply:${effect.id}`, kind: "apply", effect },
      {
        id: `revoke:${effect.id}`,
        kind: "revoke",
        effectId: effect.id,
        actorId: "pc-b",
        targetId: "pc-a",
      },
    ];
    expect(conformCombatEffectOps(operations)).toEqual(operations);
  });

  it("revokes every active occurrence for one actor/source with fresh exact appends", async () => {
    const older = { ...effect, id: "heroism:older" };
    const newer = { ...effect, id: "heroism:newer" };
    const unrelated = {
      ...effect,
      id: "bless:1",
      source: { ...effect.source, id: "bless" },
    };
    let effectOps: CombatEffectOp[] = [
      { id: "apply:older", kind: "apply", effect: older },
      { id: "apply:newer", kind: "apply", effect: newer },
      { id: "apply:unrelated", kind: "apply", effect: unrelated },
    ];
    const updates: Record<string, unknown>[] = [];
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({
            data: () => ({
              encounter: {
                effectOps,
                nextMonsterOrdinal: 1,
                round: 1,
                currentCombatantId: null,
                epoch: 1,
                status: "active",
                combatants: [
                  { kind: "pc", id: "pc-a", memberUid: "a", characterId: "char-a" },
                  { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
                ],
              },
            }),
          }),
        update: (_ref: unknown, data: Record<string, unknown>) => {
          updates.push(data);
          effectOps = data["encounter.effectOps"] as CombatEffectOp[];
        },
      })
    );

    await revokePersistentCombatEffectsBySource("camp1", {
      actorId: "pc-b",
      sourceId: "heroism",
    });

    expect(updates).toHaveLength(1);
    expect(effectOps.filter((operation) => operation.kind === "revoke")).toMatchObject([
      { effectId: "heroism:newer", actorId: "pc-b", targetId: "pc-a" },
    ]);
    expect(effectOps).toContainEqual({
      id: "apply:unrelated",
      kind: "apply",
      effect: unrelated,
    });
  });

  it("replaying actor/source revocation reads fresh state and appends nothing", async () => {
    const applied: CombatEffectOp = {
      id: `apply:${effect.id}`,
      kind: "apply",
      effect,
    };
    const revoked: CombatEffectOp = {
      id: `revoke:${effect.id}`,
      kind: "revoke",
      effectId: effect.id,
      actorId: "pc-b",
      targetId: "pc-a",
    };
    const update = vi.fn();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({
            data: () => ({
              encounter: {
                effectOps: [applied, revoked],
                nextMonsterOrdinal: 1,
                round: 1,
                currentCombatantId: null,
                epoch: 1,
                status: "active",
                combatants: [
                  { kind: "pc", id: "pc-a", memberUid: "a", characterId: "char-a" },
                  { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
                ],
              },
            }),
          }),
        update,
      })
    );

    await revokePersistentCombatEffectsBySource("camp1", {
      actorId: "pc-b",
      sourceId: "heroism",
    });
    expect(update).not.toHaveBeenCalled();
    expect(runTransactionMock).toHaveBeenCalledTimes(1);
  });

  it("ending concentration leaves Haste's aftereffect live", async () => {
    const haste: ActiveCombatEffect = {
      id: "haste:concentration",
      actor: { kind: "monster", combatantId: "monster-1" },
      target: { kind: "monster", combatantId: "monster-2" },
      source: { kind: "spell", id: "haste", actionId: "cast-haste" },
      payload: { kind: "grant-group", activeKey: "spell-haste" },
      duration: { kind: "concentration", actorId: "monster-1", sourceId: "haste" },
    };
    let effectOps: CombatEffectOp[] = [
      { id: "apply:haste", kind: "apply", effect: haste },
    ];
    const encounter = {
      nextMonsterOrdinal: 3,
      round: 1,
      currentCombatantId: "monster-1",
      order: ["monster-1", "monster-2"],
      epoch: 1,
      status: "active",
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Caster",
          ac: 12,
          initiative: 10,
          conditions: [],
          hp: { current: 20, temp: 0, max: 20 },
        },
        {
          kind: "monster",
          id: "monster-2",
          name: "Target",
          ac: 12,
          initiative: 9,
          conditions: [],
          hp: { current: 20, temp: 0, max: 20 },
        },
      ],
      effectOps,
    };
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ encounter: { ...encounter, effectOps } }) }),
        update: (_ref: unknown, data: Record<string, unknown>) => {
          effectOps = data["encounter.effectOps"] as CombatEffectOp[];
        },
      })
    );

    await revokePersistentCombatEffectsBySource("camp1", {
      actorId: "monster-1",
      sourceId: "haste",
    });

    expect(effectOps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "revoke", effectId: haste.id }),
      ])
    );
    const successor = effectOps.find(
      (operation) =>
        operation.kind === "apply" && operation.effect.id === `${haste.id}:aftereffect`
    );
    expect(successor?.kind === "apply" ? successor.effect.payload : null).toMatchObject({
      phase: "aftereffect",
    });
    expect(runTransactionMock).toHaveBeenCalledTimes(2);
  });
});

describe("campaign-io — advanceEncounterTurn (P2 scoped turn write)", () => {
  const encounter: EncounterState = {
    nextMonsterOrdinal: 2,
    round: 1,
    currentCombatantId: "pc-a",
    // The FROZEN turn order on the doc — the transaction reads THIS (no caller-supplied
    // orderedIds), so every caller steps the identical sequence.
    order: ["pc-a", "monster-1"],
    epoch: 1,
    status: "active",
    combatants: [
      { kind: "pc", id: "pc-a", memberUid: "a", characterId: "char-a" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 8,
        conditions: [],
        hp: { current: 7, temp: 0, max: 7 },
      },
    ],
  };

  /** Drive the transaction with a snapshot whose `encounter` is `seed`, capturing the
   *  dot-path `txn.update(...)` payload. */
  function runWith(seed: EncounterState | undefined): {
    update: ReturnType<typeof vi.fn>;
  } {
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ memberDetails: {}, encounter: seed }) }),
        update,
      })
    );
    return { update };
  }

  it("atomically revokes an expired effect and creates its data-declared aftereffect", async () => {
    const haste: ActiveCombatEffect = {
      id: "haste:1",
      actor: { kind: "monster", combatantId: "monster-1" },
      target: { kind: "monster", combatantId: "monster-2" },
      source: { kind: "spell", id: "haste", actionId: "cast-haste" },
      payload: { kind: "grant-group", activeKey: "spell-haste" },
      duration: {
        kind: "turn-boundary",
        combatantId: "monster-2",
        round: 1,
        phase: "turn-start",
      },
    };
    const live: EncounterState = {
      nextMonsterOrdinal: 3,
      round: 1,
      currentCombatantId: "monster-1",
      order: ["monster-1", "monster-2"],
      epoch: 1,
      status: "active",
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Caster",
          ac: 12,
          initiative: 10,
          conditions: [],
          hp: { current: 20, temp: 0, max: 20 },
        },
        {
          kind: "monster",
          id: "monster-2",
          name: "Target",
          ac: 12,
          initiative: 9,
          conditions: [],
          hp: { current: 20, temp: 0, max: 20 },
        },
      ],
      effectOps: [{ id: "apply:haste:1", kind: "apply", effect: haste }],
    };
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    runTransactionMock.mockImplementationOnce(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ memberDetails: {}, encounter: live }) }),
        update,
      })
    );

    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, "monster-1");

    const written = update.mock.calls[0]?.[1];
    expect(written).toMatchObject({
      "encounter.currentCombatantId": "monster-2",
    });
    const writtenOps = written?.["encounter.effectOps"] as CombatEffectOp[];
    expect(writtenOps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "revoke", effectId: haste.id }),
      ])
    );
    const successor = writtenOps.find(
      (operation) =>
        operation.kind === "apply" && operation.effect.id === `${haste.id}:aftereffect`
    );
    expect(successor?.kind === "apply" ? successor.effect.payload : null).toMatchObject({
      phase: "aftereffect",
    });
  });

  it("advances ONLY the two turn fields with a dot-path update (diff-scoped)", async () => {
    const { update } = runWith(encounter);
    await advanceEncounterTurn("camp1", "next", { uid: "a", isDm: false }, "pc-a");
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    // From pc-a (idx 0) → monster-1, same round; ONLY the turn fields + updatedAt.
    expect(data["encounter.currentCombatantId"]).toBe("monster-1");
    expect(data["encounter.round"]).toBe(1);
    expect(Object.keys(data).sort()).toEqual([
      "encounter.currentCombatantId",
      "encounter.round",
      "updatedAt",
    ]);
  });

  it("prev wraps from the first combatant back a round (floored at 1)", async () => {
    const { update } = runWith(encounter);
    await advanceEncounterTurn("camp1", "prev", { uid: "a", isDm: false }, "pc-a");
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data["encounter.currentCombatantId"]).toBe("monster-1");
    // Round-1 prev floors at 1 (never 0).
    expect(data["encounter.round"]).toBe(1);
  });

  it("is a tolerant no-op when no encounter exists (a member can't conjure a turn)", async () => {
    const { update } = runWith(undefined);
    await advanceEncounterTurn("camp1", "next", { uid: "a", isDm: false }, "pc-a");
    expect(update).not.toHaveBeenCalled();
  });

  it("a non-DM who does NOT own the current turn is a tolerant no-op (INIT-6 re-validate)", async () => {
    const { update } = runWith(encounter); // current turn is pc-a
    await advanceEncounterTurn("camp1", "next", { uid: "b", isDm: false }, "pc-a");
    expect(update).not.toHaveBeenCalled();
  });

  it("the DM may advance any turn", async () => {
    const { update } = runWith(encounter);
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, "pc-a");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("is a no-op before turns have begun (currentCombatantId null)", async () => {
    const { update } = runWith({ ...encounter, currentCombatantId: null });
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, null);
    expect(update).not.toHaveBeenCalled();
  });

  it("CAS: a stale double-click (expected pointer no longer current) is a clean no-op", async () => {
    // The FRESH pointer has already moved to monster-1 (the first click committed), but the
    // caller still carries the pre-advance expected pointer (pc-a) from the un-reconciled
    // render — even the DM, who otherwise may advance any turn, must NOT step a second time.
    const { update } = runWith({ ...encounter, currentCombatantId: "monster-1" });
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, "pc-a");
    expect(update).not.toHaveBeenCalled();
  });

  it("CAS: an advance whose expected pointer MATCHES the fresh pointer proceeds", async () => {
    // The confirming case — expected === fresh → the single legitimate step commits.
    const { update } = runWith(encounter); // fresh currentCombatantId is pc-a
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, "pc-a");
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data["encounter.currentCombatantId"]).toBe("monster-1");
  });
});

describe("campaign-io — session subcollection writes (#49/#50)", () => {
  it("updateSession patches the named session doc", async () => {
    await updateSession("camp1", "sess1", { label: "Session 2" });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data).toEqual({ label: "Session 2" });
  });

  it("deleteSession deletes one session doc", async () => {
    await deleteSession("camp1", "sess1");
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it("listSessions bounds the read with a limit (#50)", async () => {
    await listSessions("camp1");
    expect(limitMock).toHaveBeenCalledTimes(1);
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it("listSessions orders by date DESC before the cap so the NEWEST are retained (B29)", async () => {
    // Without an explicit orderBy, `limit(100)` orders by document id (auto-ids are not
    // date-correlated), so past 100 sessions Firestore could silently drop the most
    // recent ones. The query must order by `date` DESC so the cap keeps the newest.
    await listSessions("camp1");
    expect(orderByMock).toHaveBeenCalledWith("date", "desc");
    // The query is assembled orderBy-then-limit (the ordered set is what gets capped).
    const queryArgs = queryMock.mock.calls.at(-1) as unknown[];
    expect(queryArgs).toContainEqual({ __orderBy: ["date", "desc"] });
    expect(queryArgs).toContainEqual({ __limit: [100] });
  });

  it("deleteCampaign cascades sessions + notes + dmNotes + chronicle then the parent", async () => {
    const campaignData = {
      memberDetails: {
        u1: { characterId: "char-1" },
        u2: { characterId: "char-2" },
        u3: { characterId: null },
      },
    };
    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => campaignData });
    const update = vi.fn<(ref: unknown, data: Record<string, unknown>) => void>();
    const remove = vi.fn<(ref: unknown) => void>();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: (ref: { __doc?: unknown[] }) => {
          const path = ref.__doc?.slice(1);
          if (path?.[0] === "campaigns") {
            return Promise.resolve({ exists: () => true, data: () => campaignData });
          }
          return Promise.resolve({
            exists: () => true,
            data: () => ({ attachedCampaignId: "camp1" }),
          });
        },
        update,
        delete: remove,
      })
    );
    // getDocs is called in order: sessions, revealed notes, hidden dmNotes.
    getDocsMock
      .mockResolvedValueOnce({
        docs: [
          { id: "s1", data: () => ({}) },
          { id: "s2", data: () => ({}) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ id: "n1", data: () => ({}) }] })
      .mockResolvedValueOnce({ docs: [{ id: "h1", data: () => ({}) }] });
    await deleteCampaign("camp1");
    // The four unbounded child rows are removed first. Chronicle + campaign are
    // the two final transaction deletes, alongside both reciprocal claims.
    expect(deleteDocMock).toHaveBeenCalledTimes(4);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls.map((call) => call[1])).toEqual([
      { attachedCampaignId: { __deleteField: true } },
      { attachedCampaignId: { __deleteField: true } },
    ]);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls.map((call) => call[0])).toEqual([
      { __doc: [{ __db: true }, "campaigns", "camp1", "chronicle", "main"] },
      { __doc: [{ __db: true }, "campaigns", "camp1"] },
    ]);
    // …and the Storage banner is cascaded too (no orphan file leak).
    expect(deleteCampaignBanner).toHaveBeenCalledWith("camp1");
  });
});

describe("campaign-io — write shapes", () => {
  it("createCampaign builds an A13-valid CampaignDoc (creator = member + createdBy + dmUid)", async () => {
    const id = await createCampaign("u1", {
      name: "The Starless Keep",
      displayName: "Aria",
    });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const data = setDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data.name).toBe("The Starless Keep");
    expect(data.createdBy).toBe("u1");
    expect(data.dmUid).toBe("u1");
    expect(data.members).toEqual(["u1"]);
    expect(data.memberDetails).toEqual({
      u1: { displayName: "Aria", photoURL: null, characterId: null, role: "dm" },
    });
    expect(data.status).toBe("active");
    expect(data.treasury).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(data.treasuryLog).toEqual([]);
    // Shared notes are their own subcollection now — NOT seeded on the campaign doc.
    expect(data.sharedNotes).toBeUndefined();

    // The invite code IS the document id (both present, non-empty, addressed).
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(data.inviteCode).toBe(id);
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", id);

    // REGRESSION (createdAt hotfix — "Iniziata {date}" blank on app-created cards):
    // the two server-time sentinels must be written as the RAW value
    // `serverTimestamp()` returns, added AFTER `stripUndefined` — never THROUGH it.
    // A real `serverTimestamp()` is a `FieldValue` class instance with one enumerable
    // field (`_methodName`); routing it through `stripUndefined` (which special-cases
    // only Date/Timestamp) recursed INTO it and flattened the sentinel to a dead
    // `{ _methodName: "serverTimestamp" }` map, so Firestore persisted a plain object
    // and `createdAt` read back as a non-Date → the card never rendered the start date.
    // `stripUndefined` returns a NEW object for any map, so REFERENTIAL identity to the
    // sentinel proves createdAt/updatedAt bypassed the strip (the fix). Before the fix
    // this failed — the written values were stripUndefined clones, not the sentinels.
    const stamps = serverTimestampMock.mock.results.map((r) => r.value as unknown);
    expect(data.createdAt).toBe(stamps[0]);
    expect(data.updatedAt).toBe(stamps[1]);
  });

  it("joinCampaign self-adds the joiner via arrayUnion + per-leaf identity fields (attachment-blind)", async () => {
    const id = await joinCampaign("u2", "INVITECODEABCD", "Borin");

    expect(id).toBe("INVITECODEABCD");
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arrayUnionMock).toHaveBeenCalledWith("u2");
    expect(data.members).toEqual({ __arrayUnion: ["u2"] });
    // Per-leaf identity writes (NOT a whole-object set) — so a re-join can never
    // drop a sibling field.
    expect(data["memberDetails.u2.displayName"]).toBe("Borin");
    expect(data["memberDetails.u2.photoURL"]).toBeNull();
    expect(data["memberDetails.u2.role"]).toBe("player");
    // ATTACHMENT-BLIND (the clobber fix, safeguard 2): join NEVER writes
    // characterId or character — those belong to setMemberCharacter alone, so even
    // a misclassified re-join cannot wipe an attachment.
    expect(
      Object.keys(data).some(
        (k) => k.endsWith(".characterId") || k.endsWith(".character")
      )
    ).toBe(false);
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", "INVITECODEABCD");
  });

  it("joinCampaign is IDEMPOTENT — re-joining as an existing member writes NOTHING (clobber regression)", async () => {
    // THE production data-loss bug (campaign D7CKZNP7S7JYQJ): an already-attached
    // member who re-opened the still-shared invite link used to whole-object-
    // overwrite memberDetails[uid], dropping characterId + the `character` snapshot
    // → their hero vanished from the party. An existing member can READ the doc;
    // the no-op guard now short-circuits with ZERO writes, leaving the attachment
    // untouched. Fails before the fix (it issued the clobbering updateDoc).
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        members: ["dm", "u2"],
        memberDetails: {
          u2: {
            displayName: "Borin",
            role: "player",
            characterId: "char-borin",
            character: { name: "Borin", race: "Dwarf", classes: [], ac: 18, hpMax: 30 },
          },
        },
      }),
    });

    const id = await joinCampaign("u2", "INVITECODEABCD", "Borin");

    expect(id).toBe("INVITECODEABCD");
    // No write whatsoever — the existing characterId + character survive intact.
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(arrayUnionMock).not.toHaveBeenCalled();
  });

  it("create/join denormalize the member's Google photoURL (party avatar fallback)", async () => {
    await createCampaign("u1", {
      name: "Photo Test",
      displayName: "Aria",
      photoURL: "https://lh3.googleusercontent.com/a/aria",
    });
    const created = setDocMock.mock.calls[0]?.[1] as {
      memberDetails: { u1: { photoURL: string } };
    };
    expect(created.memberDetails.u1.photoURL).toBe(
      "https://lh3.googleusercontent.com/a/aria"
    );

    await joinCampaign("u9", "INVITECODEABCD", "Bron", "https://lh3/bron");
    const joined = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(joined["memberDetails.u9.photoURL"]).toBe("https://lh3/bron");
  });

  it("updateCampaign writes the shared artifacts with a server updatedAt", async () => {
    await updateCampaign("c1", { treasury: { pp: 1, gp: 0, ep: 0, sp: 0, cp: 0 } });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data.treasury).toEqual({ pp: 1, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
  });
});

describe("campaign-io — roster management (remove member + lock joins)", () => {
  /** Drive removeMember's transaction with a snapshot whose `encounter` is `seed`,
   *  capturing the single `txn.update(...)` payload (B03). */
  function runRemoveWith(seed: EncounterState | undefined): {
    update: ReturnType<typeof vi.fn>;
  } {
    const update = vi.fn();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({ data: () => ({ memberDetails: {}, encounter: seed }) }),
        update,
      })
    );
    return { update };
  }

  it("removeMember drops the uid from members (arrayRemove) + deletes their memberDetails entry (deleteField)", async () => {
    const { update } = runRemoveWith(undefined); // no encounter running
    await removeMember("c1", "u2");

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    // members: arrayRemove(uid) — a targeted roster drop, never a whole-array set.
    expect(arrayRemoveMock).toHaveBeenCalledWith("u2");
    expect(data.members).toEqual({ __arrayRemove: ["u2"] });
    // memberDetails.<uid>: deleteField() — the entry is removed, not nulled.
    expect(data["memberDetails.u2"]).toEqual({ __deleteField: true });
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
    // No encounter → the write never touches encounter fields.
    expect(Object.keys(data).some((k) => k.startsWith("encounter."))).toBe(false);
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", "c1");
  });

  it("atomically clears the removed hero's reciprocal campaign attachment", async () => {
    const update = vi.fn();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({
            data: () => ({
              memberDetails: { u2: { characterId: "char-2" } },
            }),
          }),
        update,
      })
    );

    await removeMember("c1", "u2");

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0]?.[0]).toEqual({
      __doc: [{ __db: true }, "campaigns", "c1"],
    });
    expect(update.mock.calls[0]?.[1]).toMatchObject({
      members: { __arrayRemove: ["u2"] },
      "memberDetails.u2": { __deleteField: true },
    });
    expect(update.mock.calls[1]?.[0]).toEqual({
      __doc: [{ __db: true }, "users", "u2", "characters", "char-2"],
    });
    expect(update.mock.calls[1]?.[1]).toEqual({
      attachedCampaignId: { __deleteField: true },
    });
  });

  it("B03 — removeMember PRUNES the removed member's pc-<uid> combatant from a running encounter", async () => {
    // A gathering encounter seeded with two PCs; the DM removes u2 mid-fight. BEFORE the
    // fix removeMember never touched the encounter, so pc-u2 orphaned in combatants/order
    // (counting toward the Begin-turns total forever). Now it is spliced out at the seam.
    const encounter: EncounterState = {
      nextMonsterOrdinal: 1,
      round: 1,
      currentCombatantId: null, // gathering
      order: ["pc-u1", "pc-u2"],
      epoch: 1,
      status: "active",
      combatants: [
        { kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "char-1" },
        { kind: "pc", id: "pc-u2", memberUid: "u2", characterId: "char-2" },
      ],
    };
    const { update } = runRemoveWith(encounter);
    await removeMember("c1", "u2");

    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    // The roster drop still happens…
    expect(data["memberDetails.u2"]).toEqual({ __deleteField: true });
    // …AND the encounter is pruned via dot-paths (never the whole map): pc-u2 gone from
    // combatants + order, so it no longer counts toward the Begin-turns total.
    const combatants = data["encounter.combatants"] as { id: string }[];
    expect(combatants.map((c) => c.id)).toEqual(["pc-u1"]);
    expect(data["encounter.order"]).toEqual(["pc-u1"]);
    // Narrow write — only the touched encounter dot-paths, never `encounter` wholesale.
    expect(Object.keys(data)).not.toContain("encounter");
  });

  it("B03 — removeMember leaves the encounter alone when the member has no pc combatant", async () => {
    const encounter: EncounterState = {
      nextMonsterOrdinal: 1,
      round: 1,
      currentCombatantId: null,
      order: ["pc-u1"],
      epoch: 1,
      status: "active",
      combatants: [{ kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "char-1" }],
    };
    const { update } = runRemoveWith(encounter);
    await removeMember("c1", "u2"); // u2 has no pc combatant here

    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data["memberDetails.u2"]).toEqual({ __deleteField: true });
    expect(Object.keys(data).some((k) => k.startsWith("encounter."))).toBe(false);
  });

  it("setJoinsLocked writes the boolean flag + a server updatedAt (lock then re-open)", async () => {
    await setJoinsLocked("c1", true);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const locked = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(locked.joinsLocked).toBe(true);
    expect(locked.updatedAt).toEqual({ __serverTimestamp: true });
    // Dedicated fn — it does NOT route through the debounced CampaignWritable writer.
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", "c1");

    updateDocMock.mockClear();
    await setJoinsLocked("c1", false);
    const opened = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(opened.joinsLocked).toBe(false);
  });
});

describe("campaign-io — attachMemberCharacter atomic D9 claim (B07)", () => {
  /** Drive the attach transaction: `charDocData` is what the char-doc read returns
   *  inside the txn; capture every `txn.update(ref, data)` and each read `ref`. */
  function runAttachWith(charDocData: Record<string, unknown> | undefined): {
    updates: Array<{ ref: unknown; data: Record<string, unknown> }>;
    gets: unknown[];
  } {
    const updates: Array<{ ref: unknown; data: Record<string, unknown> }> = [];
    const gets: unknown[] = [];
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: (ref: unknown) => {
          gets.push(ref);
          return Promise.resolve({ data: () => charDocData });
        },
        update: (ref: unknown, data: Record<string, unknown>) => {
          updates.push({ ref, data });
        },
      })
    );
    return { updates, gets };
  }

  const charWrite = (u: { ref: unknown; data: Record<string, unknown> }) =>
    "attachedCampaignId" in u.data;
  const campaignWrite = (u: { ref: unknown; data: Record<string, unknown> }) =>
    "memberDetails.u1.characterId" in u.data;

  it("claims an UNCLAIMED hero: writes the char lock + the campaign membership, returns 'attached'", async () => {
    const { updates, gets } = runAttachWith({}); // char doc has no attachedCampaignId
    const outcome = await attachMemberCharacter("campA", "u1", null, "char-1", null);

    expect(outcome).toBe("attached");
    // The char doc was READ inside the txn — the load-bearing property that makes
    // Firestore's optimistic-concurrency retry serialize two racing attaches.
    expect(gets).toContainEqual({
      __doc: [{ __db: true }, "users", "u1", "characters", "char-1"],
    });
    // The character's one-campaign claim is stamped…
    const claim = updates.find(charWrite);
    expect(claim?.data.attachedCampaignId).toBe("campA");
    // …and the campaign membership points at the hero.
    const member = updates.find(campaignWrite);
    expect(member?.data["memberDetails.u1.characterId"]).toBe("char-1");
  });

  it("REFUSES a hero already claimed by a DIFFERENT campaign: no membership write, returns 'conflict'", async () => {
    // The race loser: the fresh read shows the hero was just claimed by campB.
    const { updates } = runAttachWith({ attachedCampaignId: "campB" });
    const outcome = await attachMemberCharacter("campA", "u1", null, "char-1", null);

    expect(outcome).toBe("conflict");
    // Nothing is written — neither the campaign membership nor a competing claim.
    expect(updates).toHaveLength(0);
  });

  it("allows a re-attach to the SAME campaign (idempotent)", async () => {
    const { updates } = runAttachWith({ attachedCampaignId: "campA" });
    const outcome = await attachMemberCharacter("campA", "u1", "char-1", "char-1", null);
    expect(outcome).toBe("attached");
    expect(updates.find(campaignWrite)).toBeDefined();
  });

  it("detach (next=null) releases the PRIOR claim and clears the membership — no gate read", async () => {
    const { updates, gets } = runAttachWith(undefined);
    const outcome = await attachMemberCharacter("campA", "u1", "char-1", null, null);
    expect(outcome).toBe("attached");
    // No character read (nothing to gate on a detach).
    expect(gets).toHaveLength(0);
    // The previous character's claim is cleared…
    const cleared = updates.find(charWrite);
    expect(cleared?.data.attachedCampaignId).toEqual({ __deleteField: true });
    // …and the membership is nulled.
    const member = updates.find(campaignWrite);
    expect(member?.data["memberDetails.u1.characterId"]).toBeNull();
  });

  it("a swap RELEASES the old character's claim and CLAIMS the new one", async () => {
    const { updates } = runAttachWith({}); // the new char is unclaimed
    await attachMemberCharacter("campA", "u1", "char-old", "char-new", null);
    // new char gets the campA claim…
    const claim = updates.find(
      (u) => charWrite(u) && u.data.attachedCampaignId === "campA"
    );
    expect(claim).toBeDefined();
    // …and the old char's claim is released (deleteField sentinel).
    const release = updates.find(
      (u) =>
        charWrite(u) &&
        typeof u.data.attachedCampaignId === "object" &&
        u.data.attachedCampaignId !== null &&
        "__deleteField" in u.data.attachedCampaignId
    );
    expect(release).toBeDefined();
  });
});

describe("campaign-io — list scoping", () => {
  it("listSharedCampaigns queries members array-contains the uid (never enumerates)", async () => {
    await listSharedCampaigns("u1");
    expect(collectionMock).toHaveBeenCalledWith({ __db: true }, "campaigns");
    expect(whereMock).toHaveBeenCalledWith("members", "array-contains", "u1");
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  // Boot-resilience (the 2026-07-09 "Clear site data" incident): an EMPTY result that
  // is only `fromCache` is not authoritative — force a fresh server read so a wiped/
  // wedged local cache can never render the misleading "no campaigns" empty state.
  const setOnline = (value: boolean): void => {
    Object.defineProperty(navigator, "onLine", { value, configurable: true });
  };

  it("server-confirms an empty-from-cache result while online", async () => {
    setOnline(true);
    getDocsMock.mockResolvedValueOnce({
      docs: [],
      empty: true,
      metadata: { fromCache: true },
    } as never);
    getDocsFromServerMock.mockResolvedValueOnce({ docs: [] });
    await listSharedCampaigns("u1");
    expect(getDocsFromServerMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT hit the server when the cache-empty read is genuinely offline", async () => {
    setOnline(false);
    getDocsMock.mockResolvedValueOnce({
      docs: [],
      empty: true,
      metadata: { fromCache: true },
    } as never);
    await listSharedCampaigns("u1");
    expect(getDocsFromServerMock).not.toHaveBeenCalled();
    setOnline(true);
  });

  it("does NOT re-read the server when the cache already has campaigns", async () => {
    setOnline(true);
    getDocsMock.mockResolvedValueOnce({
      docs: [{ id: "c1", data: () => ({ name: "Gildenmoor", members: ["u1"] }) }],
      empty: false,
      metadata: { fromCache: true },
    } as never);
    await listSharedCampaigns("u1");
    expect(getDocsFromServerMock).not.toHaveBeenCalled();
  });

  it("a hung read REJECTS with a TimeoutError that propagates to the caller", async () => {
    // A wedged Firestore local layer can leave getDocs pending forever — the bounded
    // read must reject so every caller surfaces a recoverable error (Retry), never an
    // infinite spinner. The rejection propagates as-is (no internal swallow).
    vi.useFakeTimers();
    try {
      getDocsMock.mockImplementationOnce(() => new Promise<never>(() => {}));
      const call = listSharedCampaigns("u1");
      const assertion = expect(call).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Walk a parsed object and collect the paths of anything still carrying a
 *  `toDate` method — i.e. a Firestore `Timestamp` that leaked past the read
 *  boundary (the exact class of bug that crashed the campaign page). */
function findLeakedTimestamps(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date) return [];
  if (typeof (value as { toDate?: unknown }).toDate === "function") return [path];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findLeakedTimestamps(v, `${path}[${i}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    findLeakedTimestamps(v, `${path}.${k}`)
  );
}

/** Drive a single campaign snapshot through `subscribeToCampaign` and return the
 *  parsed `CampaignDoc` the UI would receive. */
function parseCampaignWire(data: Record<string, unknown>): Record<string, unknown> {
  const seen: unknown[] = [];
  subscribeToCampaign("u1", "c1", (doc) => seen.push(doc));
  const call = onSnapshotMock.mock.calls.at(-1) as unknown as [
    unknown,
    (snap: {
      exists: () => boolean;
      id: string;
      data: () => Record<string, unknown>;
    }) => void,
  ];
  call[1]({ exists: () => true, id: "c1", data: () => data });
  return seen[0] as Record<string, unknown>;
}

describe("campaign-io — member-snapshot non-nullability (owner 2026-06-15)", () => {
  // A persisted member snapshot whose hero `name` is corrupt (empty / whitespace /
  // non-string — a stale doc written before the branded invariant) is REJECTED at the
  // read boundary: its `character` is dropped to `null` (the member renders as "no
  // character attached"), never coerced to an "Unnamed" placeholder. The member row
  // itself is KEPT. A valid snapshot passes through untouched.
  it("drops a corrupt (nameless) member snapshot's character to null, keeps the member", () => {
    const parsed = parseCampaignWire({
      name: "Gildenmoor",
      members: ["u1", "u2", "u3"],
      memberDetails: {
        u1: {
          displayName: "Tav",
          characterId: "x",
          role: "player",
          character: { name: "   ", race: "human", classes: [], ac: 16, hpMax: 24 },
        },
        u2: {
          displayName: "Mara",
          characterId: "y",
          role: "player",
          character: { name: "Mara", race: "human", classes: [], ac: 14, hpMax: 18 },
        },
        u3: { displayName: "DM", characterId: null, role: "dm" },
      },
    });
    const members = parsed.memberDetails as Record<
      string,
      { character?: { name?: string } | null }
    >;
    // The corrupt member is kept, but its character is rejected to null.
    expect(members.u1?.character).toBeNull();
    // The valid member's snapshot is untouched.
    expect(members.u2?.character?.name).toBe("Mara");
    // No "Unnamed"/"Senza nome" placeholder is ever invented for the corrupt member.
    expect(JSON.stringify(members.u1)).not.toMatch(/unnamed|senza nome/i);
  });
});

describe("campaign-io — FULL-wire date conformance (the campaign-dates hotfix guard)", () => {
  it("strips EVERY Timestamp from a full wire doc — incl. the array-nested treasuryLog[].at", async () => {
    const { Timestamp } = await import("firebase/firestore");
    // The raw Firestore wire shape of a real campaign: every date field arrives as
    // a Timestamp, INCLUDING array-nested ones Firestore does not auto-convert
    // (treasuryLog[].at) — the precise gap that delivered a Timestamp into a
    // `.getTime()` call and took down the page.
    const wire = {
      name: "The Starless Keep",
      createdAt: new Timestamp(1_700_000_000, 0),
      updatedAt: new Timestamp(1_700_000_100, 0),
      members: ["u1"],
      memberDetails: { u1: { displayName: "Aria", characterId: null, role: "dm" } },
      treasury: { pp: 0, gp: 1, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [
        {
          amount: 5,
          currency: "gp",
          type: "add",
          note: "",
          by: "u1",
          at: new Timestamp(1_700_000_050, 0),
        },
      ],
    };

    const parsed = parseCampaignWire(wire);

    // ZERO Timestamps survive ANYWHERE in the parsed tree.
    expect(findLeakedTimestamps(parsed)).toEqual([]);
    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.updatedAt).toBeInstanceOf(Date);
    const log = parsed.treasuryLog as Array<{ at?: Date }>;
    expect(log[0]?.at).toBeInstanceOf(Date);
  });
});

type NoteWire = { id: string; data: Record<string, unknown> };
type SnapCall = [
  unknown,
  (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void,
];
function fireSnap(call: SnapCall, docs: NoteWire[]): void {
  call[1]({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
}

/** Drive the MEMBER notes subscription (the single revealed `notes` collection) and
 *  return the parsed `SharedNote[]` the UI would receive. */
function parseRevealedWire(docs: NoteWire[]): Array<Record<string, unknown>> {
  let received: Array<Record<string, unknown>> = [];
  subscribeToCampaignNotes("c1", false, (notes) => {
    received = notes as unknown as Array<Record<string, unknown>>;
  });
  fireSnap(onSnapshotMock.mock.calls.at(-1) as unknown as SnapCall, docs);
  return received;
}

/** Drive the DM notes subscription — it registers TWO listeners (revealed `notes`
 *  then hidden `dmNotes`) and emits only once BOTH have delivered; fire both and
 *  return the merged `SharedNote[]` (hidden notes tagged `dmOnly: true`). */
function parseDmWire(
  revealedDocs: NoteWire[],
  hiddenDocs: NoteWire[]
): Array<Record<string, unknown>> {
  let received: Array<Record<string, unknown>> = [];
  subscribeToCampaignNotes("c1", true, (notes) => {
    received = notes as unknown as Array<Record<string, unknown>>;
  });
  const [notesCall, dmCall] = onSnapshotMock.mock.calls.slice(-2) as unknown as [
    SnapCall,
    SnapCall,
  ];
  fireSnap(notesCall, revealedDocs);
  fireSnap(dmCall, hiddenDocs);
  return received;
}

describe("campaign-io — notes subcollection date conformance", () => {
  it("converts a note's `updatedAt` Timestamp to a Date (and the doc id IS the note id)", async () => {
    const { Timestamp } = await import("firebase/firestore");
    const notes = parseRevealedWire([
      {
        id: "n1",
        data: {
          title: "Pinned",
          content: "",
          pinned: true,
          createdBy: "u1",
          updatedAt: new Timestamp(1_700_000_010, 0),
        },
      },
    ]);
    expect(findLeakedTimestamps(notes)).toEqual([]);
    expect(notes[0]?.id).toBe("n1"); // the doc id becomes the note id
    expect(notes[0]?.updatedAt).toBeInstanceOf(Date);
    expect(notes[0]?.dmOnly).toBeUndefined(); // a /notes doc is revealed → no flag
  });

  it("a note doc with NO updatedAt parses to an epoch Date (never undefined) — sort-safe", () => {
    const notes = parseRevealedWire([
      {
        id: "legacy",
        data: { title: "Legacy", content: "", pinned: false, createdBy: "u1" },
      },
    ]);
    expect(notes[0]?.updatedAt).toBeInstanceOf(Date);
    expect((notes[0]?.updatedAt as Date).getTime()).toBe(0);
  });

  it("the DM view MERGES revealed + hidden, tagging only the dmNotes ones dmOnly:true", () => {
    const notes = parseDmWire(
      [
        {
          id: "shared",
          data: { title: "S", content: "", pinned: false, createdBy: "u1" },
        },
      ],
      [
        {
          id: "secret",
          data: { title: "H", content: "", pinned: false, createdBy: "u1" },
        },
      ]
    );
    expect(findLeakedTimestamps(notes)).toEqual([]);
    expect(notes).toHaveLength(2);
    const shared = notes.find((n) => n.id === "shared");
    const secret = notes.find((n) => n.id === "secret");
    expect(shared?.dmOnly).toBeUndefined(); // from /notes → revealed
    expect(secret?.dmOnly).toBe(true); // from /dmNotes → hidden
  });
});

describe("campaign-io — snapshot normalization", () => {
  it("converts treasury ledger `at` Timestamps to Dates on read (live-data shim)", async () => {
    // Firestore does NOT auto-convert Timestamps inside arrays; the owner's live
    // ledger entries arrive Timestamp-shaped. The read boundary must hand the UI
    // real Dates (TREASURY-UX formats `at` per row).
    const { subscribeToCampaign } = await import("@/features/campaigns/campaign-io");
    const { Timestamp } = await import("firebase/firestore");
    const seen: unknown[] = [];
    subscribeToCampaign("u1", "c1", (doc) => seen.push(doc));
    const call = onSnapshotMock.mock.calls[0] as unknown as [
      unknown,
      (snap: {
        exists: () => boolean;
        id: string;
        data: () => Record<string, unknown>;
      }) => void,
    ];
    const ts = new Timestamp(0, 0);
    call[1]({
      exists: () => true,
      id: "c1",
      data: () => ({
        name: "T",
        createdAt: ts,
        updatedAt: ts,
        treasuryLog: [
          { amount: 5, currency: "gp", type: "add", note: "", by: "u1", at: ts },
        ],
      }),
    });
    const doc = seen[0] as {
      createdAt: Date;
      treasuryLog: Array<{ at: Date }>;
    };
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.treasuryLog[0]?.at).toBeInstanceOf(Date);
  });
});

describe("campaign-io — shared effect lifecycle persistence", () => {
  const rawEncounter = (effectLifecycles: unknown): Record<string, unknown> => ({
    combatants: [],
    nextMonsterOrdinal: 1,
    round: 1,
    currentCombatantId: null,
    epoch: 7,
    status: "active",
    effectLifecycles,
  });

  function readEncounter(effectLifecycles: unknown): EncounterState {
    const seen: Array<CampaignDoc | null> = [];
    subscribeToCampaign("u1", "c1", (campaign) => seen.push(campaign));
    const call = onSnapshotMock.mock.calls.at(-1) as unknown as [
      unknown,
      (snapshot: {
        exists: () => boolean;
        id: string;
        data: () => Record<string, unknown>;
      }) => void,
    ];
    call[1]({
      exists: () => true,
      id: "c1",
      data: () => ({ memberDetails: {}, encounter: rawEncounter(effectLifecycles) }),
    });
    const encounter = seen[0]?.encounter;
    if (!encounter) throw new TypeError("Campaign fixture has no encounter");
    return encounter;
  }

  const emptyEncounter = (): EncounterState => ({
    combatants: [],
    nextMonsterOrdinal: 1,
    round: 1,
    currentCombatantId: null,
    epoch: 7,
    status: "active",
  });

  it("round-trips a canonical sorted and deeply frozen collection", async () => {
    const encounter = readEncounter([LIFECYCLE_B, LIFECYCLE_A]);
    const lifecycles = encounter.effectLifecycles;
    if (!lifecycles) throw new TypeError("Lifecycle fixture was not conformed");
    expect(lifecycles.map(({ occurrenceId }) => occurrenceId)).toEqual([
      "cast:a",
      "cast:b",
    ]);
    expect(Object.isFrozen(lifecycles)).toBe(true);
    expect(Object.isFrozen(lifecycles[0])).toBe(true);
    expect(Object.isFrozen(lifecycles[0]?.cursor)).toBe(true);

    await updateCampaign("c1", { encounter });
    const written = updateDocMock.mock.calls[0]?.[1] as { encounter: EncounterState };
    expect(JSON.stringify(written.encounter.effectLifecycles)).toBe(
      JSON.stringify(lifecycles)
    );
  });

  it("tolerates a malformed persisted collection as omitted", () => {
    for (const malformed of [null, {}, [LIFECYCLE_A, { broken: true }]]) {
      expect(readEncounter(malformed)).not.toHaveProperty("effectLifecycles");
    }
  });

  it("tolerates duplicate persisted identities as omitted and rejects them on write", async () => {
    const duplicate = JSON.parse(
      JSON.stringify(LIFECYCLE_A)
    ) as CombatEffectLifecycleRuntime;
    expect(readEncounter([LIFECYCLE_A, duplicate])).not.toHaveProperty(
      "effectLifecycles"
    );

    await expect(
      updateCampaign("c1", {
        encounter: { ...emptyEncounter(), effectLifecycles: [LIFECYCLE_A, duplicate] },
      })
    ).rejects.toThrow(TypeError);
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it("omits an empty collection on writes", async () => {
    await updateCampaign("c1", {
      encounter: { ...emptyEncounter(), effectLifecycles: [] },
    });
    const written = updateDocMock.mock.calls[0]?.[1] as { encounter: EncounterState };
    expect(written.encounter).not.toHaveProperty("effectLifecycles");
  });

  it("preserves the collection through encounter reducers", () => {
    const encounter: EncounterState = {
      ...emptyEncounter(),
      nextMonsterOrdinal: 2,
      effectLifecycles: [LIFECYCLE_A],
      combatants: [
        {
          kind: "monster",
          id: "monster-1",
          name: "Goblin",
          ac: 13,
          initiative: 8,
          conditions: [],
          hp: { current: 5, temp: 0, max: 7 },
        },
      ],
    };
    const next = reduceDeclaredEffects(encounter, "camp-test", [
      { kind: "temp-hp", targetId: "monster-1", amount: 3 },
    ]);
    expect(next).not.toBe(encounter);
    expect(next.effectLifecycles).toBe(encounter.effectLifecycles);
  });

  it("starts without a collection and clears it with the encounter", async () => {
    const fresh = startEncounter({}, [], 8);
    expect(fresh).not.toHaveProperty("effectLifecycles");

    await persistStartEncounter("c1", fresh);
    const started = updateDocMock.mock.calls[0]?.[1] as { encounter: EncounterState };
    expect(started.encounter).not.toHaveProperty("effectLifecycles");

    await persistEndEncounter("c1");
    const ended = updateDocMock.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(ended.encounter).toBeNull();
  });
});

describe("campaign-io — treasury atomic writes (B06)", () => {
  const entry: TreasuryLogEntry = {
    amount: 5,
    currency: "gp",
    type: "add",
    note: "loot",
    by: "u1",
    at: new Date(1_700_000_000_000),
  };

  it("applyTreasuryDelta composes via increment() + arrayUnion (never a whole-object write)", async () => {
    await applyTreasuryDelta("c1", entry);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    // Per-currency server-side increment (an "add" is +amount) — commutes with a
    // concurrent take instead of the old last-write-wins whole-map overwrite.
    expect(incrementMock).toHaveBeenCalledWith(5);
    expect(data["treasury.gp"]).toEqual({ __increment: [5] });
    // The ledger row is appended (arrayUnion), so a concurrent edit's row survives too.
    expect(arrayUnionMock).toHaveBeenCalledWith(entry);
    expect(data.treasuryLog).toEqual({ __arrayUnion: [entry] });
    // NEVER a blind whole treasury map / whole log array (the B06 clobber).
    expect(data).not.toHaveProperty("treasury");
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
  });

  it("applyTreasuryDelta signs a take negative", async () => {
    await applyTreasuryDelta("c1", { ...entry, type: "remove", amount: 3 });
    expect(incrementMock).toHaveBeenCalledWith(-3);
  });

  it("undoTreasuryEntry reverses the coins (increment) and drops the exact row (arrayRemove)", async () => {
    await undoTreasuryEntry("c1", entry); // undo an add → take the coins back
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(incrementMock).toHaveBeenCalledWith(-5);
    expect(data["treasury.gp"]).toEqual({ __increment: [-5] });
    expect(arrayRemoveMock).toHaveBeenCalledWith(entry);
    expect(data.treasuryLog).toEqual({ __arrayRemove: [entry] });
  });

  it("undoTreasuryEntry returns coins when undoing a remove", async () => {
    await undoTreasuryEntry("c1", { ...entry, type: "remove", amount: 8 });
    expect(incrementMock).toHaveBeenCalledWith(8);
  });

  it("two concurrent adds each issue their OWN composing write (no shared stale base)", async () => {
    // The B06 failure: A and B each compute a new total from the SAME stale base and the
    // last whole-object write wins. With increment(), each edit is an independent
    // server-side delta, so both land and both ledger rows survive — proven here by two
    // arrayUnion appends + two signed increments, never a single overwrite of the map.
    await applyTreasuryDelta("c1", { ...entry, amount: 5 });
    await applyTreasuryDelta("c1", { ...entry, type: "remove", amount: 3 });
    expect(incrementMock).toHaveBeenNthCalledWith(1, 5);
    expect(incrementMock).toHaveBeenNthCalledWith(2, -3);
    expect(arrayUnionMock).toHaveBeenCalledTimes(2);
  });
});

describe("campaign-io — persistBeginTurns immediate write (B15)", () => {
  it("writes the three turn fields via dot-paths IMMEDIATELY (never the 2s debounce)", async () => {
    await persistBeginTurns("c1", {
      order: ["pc-a", "monster-1"],
      currentCombatantId: "pc-a",
      round: 1,
    });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    // Dot-path so the diff stays narrow; setting the pointer NOW is exactly what makes
    // the very next advance transaction see a begun order instead of the still-null
    // server pointer it read within the debounce window (the silent no-op B15 fixes).
    expect(data["encounter.order"]).toEqual(["pc-a", "monster-1"]);
    expect(data["encounter.currentCombatantId"]).toBe("pc-a");
    expect(data["encounter.round"]).toBe(1);
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
  });
});

describe("campaign-io — debounced encounter write reconciles the turn pointer (B04)", () => {
  const pcA: EncounterCombatant = {
    kind: "pc",
    id: "pc-a",
    memberUid: "a",
    characterId: "char-a",
  };
  const goblin: EncounterMonster = {
    kind: "monster",
    id: "monster-1",
    name: "Goblin",
    ac: 13,
    initiative: 8,
    conditions: [],
    hp: { current: 7, temp: 0, max: 7 },
  };
  const baseEncounter: EncounterState = {
    combatants: [pcA, goblin],
    nextMonsterOrdinal: 2,
    round: 1,
    currentCombatantId: "pc-a",
    order: ["pc-a", "monster-1"],
    epoch: 42,
    status: "active",
    effectLifecycles: [LIFECYCLE_A],
  };

  function campaignWith(enc: EncounterState): CampaignDoc {
    return {
      id: "c1",
      name: "C",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "u1",
      dmUid: "u1",
      members: ["u1"],
      memberDetails: {},
      status: "active",
      inviteCode: "c1",
      treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
      encounter: enc,
    };
  }

  afterEach(() => useCampaignStore.setState({ campaign: null }));

  it("merges the LIVE (advanced) pointer over a stale pending structural write", async () => {
    // The live store already reflects a concurrent advance (its snapshot was applied): the
    // pointer moved to monster-1, round 2.
    useCampaignStore.setState({
      campaign: campaignWith({
        ...baseEncounter,
        currentCombatantId: "monster-1",
        round: 2,
      }),
    });
    const writer = createCampaignSave("u1", "c1");
    // A DM's STALE monster-edit payload still carries the pre-advance pointer (pc-a /
    // round 1) but a bumped monster HP — this is what used to flush and rewind the turn.
    const bloodiedGoblin: EncounterMonster = {
      ...goblin,
      hp: { current: 3, temp: 0, max: 7 },
    };
    writer.save({
      name: "C",
      encounter: { ...baseEncounter, combatants: [pcA, bloodiedGoblin] },
    });
    await writer.flush();

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as { encounter: EncounterState };
    // The pointer + round are RECONCILED to the live advanced values (never reverted)…
    expect(data.encounter.currentCombatantId).toBe("monster-1");
    expect(data.encounter.round).toBe(2);
    // …while the DM's structural edit (the monster HP) is preserved.
    const mon = data.encounter.combatants.find((c) => c.id === "monster-1");
    expect(mon?.kind === "monster" ? mon.hp : null).toEqual({
      current: 3,
      temp: 0,
      max: 7,
    });
    expect(data.encounter.effectLifecycles).toEqual([LIFECYCLE_A]);
  });

  it("leaves the payload untouched across a DIFFERENT fight (epoch mismatch)", async () => {
    useCampaignStore.setState({
      campaign: campaignWith({
        ...baseEncounter,
        epoch: 99,
        currentCombatantId: "monster-1",
      }),
    });
    const writer = createCampaignSave("u1", "c1");
    writer.save({ name: "C", encounter: baseEncounter }); // epoch 42 ≠ live 99
    await writer.flush();
    const data = updateDocMock.mock.calls[0]?.[1] as { encounter: EncounterState };
    // Different fight → no cross-fight pointer merge; the payload stands as-is.
    expect(data.encounter.currentCombatantId).toBe("pc-a");
  });
});

describe("campaign-io — commitChronicleEdit atomic version snapshot (B18)", () => {
  function runTxnWith(serverDoc: Record<string, unknown> | undefined): {
    set: ReturnType<typeof vi.fn>;
  } {
    const set = vi.fn();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({
            exists: () => serverDoc !== undefined,
            data: () => serverDoc,
          }),
        set,
      })
    );
    return { set };
  }

  it("snapshots the SERVER's CURRENT text into history before overwriting (no editor's text lost)", async () => {
    // The server already carries a CONCURRENT editor B's paragraph (NOT the base A started
    // from). The old path snapshotted A's local base and shipped the whole array, so B's
    // text vanished from both the live text AND every stored version.
    const { set } = runTxnWith({
      text: "base + B's concurrent paragraph",
      lastEditedBy: "userB",
      versions: [],
    });
    await commitChronicleEdit("c1", { text: "base + A's paragraph", editedBy: "userA" });

    expect(set).toHaveBeenCalledTimes(1);
    const data = set.mock.calls[0]?.[1] as {
      text: string;
      lastEditedBy: string;
      versions: Array<{ textSnapshot: string; editedBy: string }>;
    };
    // The new text is written…
    expect(data.text).toBe("base + A's paragraph");
    expect(data.lastEditedBy).toBe("userA");
    // …and B's text (the SERVER's current, re-read inside the txn) is captured in history,
    // so it is recoverable — the version history is no longer erased by a concurrent save.
    expect(data.versions[0]?.textSnapshot).toBe("base + B's concurrent paragraph");
    expect(data.versions[0]?.editedBy).toBe("userB");
  });

  it("creates the doc with no version snapshot on the very first save", async () => {
    const { set } = runTxnWith(undefined); // no chronicle doc yet
    await commitChronicleEdit("c1", { text: "first entry", editedBy: "userA" });
    const data = set.mock.calls[0]?.[1] as { text: string; versions: unknown[] };
    expect(data.text).toBe("first entry");
    // No prior text → no version snapshot (pushVersion skips an empty prior).
    expect(data.versions).toEqual([]);
  });

  it("appendChronicleChapter concatenates onto the SERVER's current text (never clobbers)", async () => {
    const { set } = runTxnWith({
      text: "# Session 1\n\nThe party set out.",
      lastEditedBy: "userB",
      versions: [],
    });
    await appendChronicleChapter("c1", {
      chapter: "## Goblin Ambush\n\n- Goblin falls",
      editedBy: "userA",
    });
    const data = set.mock.calls[0]?.[1] as { text: string; versions: unknown[] };
    // The prior text is PRESERVED and the chapter appended after a blank-line gap.
    expect(data.text).toBe(
      "# Session 1\n\nThe party set out.\n\n## Goblin Ambush\n\n- Goblin falls"
    );
    // The prior text is captured in history (recoverable).
    expect((data.versions[0] as { textSnapshot: string }).textSnapshot).toBe(
      "# Session 1\n\nThe party set out."
    );
  });
});

describe("campaign-io — joinChronicleText (pure)", () => {
  it("gaps a chapter after existing text", () => {
    expect(joinChronicleText("prior", "## New")).toBe("prior\n\n## New");
  });
  it("returns the chapter alone when the chronicle is empty", () => {
    expect(joinChronicleText("", "## New")).toBe("## New");
    expect(joinChronicleText("   \n ", "## New")).toBe("## New");
  });
});
