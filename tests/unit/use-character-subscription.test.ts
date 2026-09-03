import { describe, it, expect, beforeEach, vi } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { renderHook, act } from "@testing-library/react";
import type { CharacterDoc, CustomEquipment } from "@/types/character";
import { sessionToCombatState } from "@/lib/combat-state";
import { sessionToPlayStateV1 } from "@/lib/session-state-codec";

/**
 * Exercises the sync invariants behind domain rule D8 (docs/GOLDEN_RULES.md):
 *  - an incoming server snapshot must NOT trigger a save (isFromServerRef loop guard)
 *  - a local mutation MUST trigger a save that carries BOTH session and character
 *    (so a session-only edit can't be clobbered by a stale-character snapshot)
 *
 * Firebase-bound deps are mocked; the real characterStore is used so the
 * snapshot → store → auto-save pipeline runs end to end.
 */
const {
  debouncedSave,
  debouncedFlush,
  debouncedCancel,
  createDebouncedSaveMock,
  subscribeMock,
  refreshAttachedSheetsMock,
  createTrackerMock,
  combatSubscribeMock,
  writeCombatStateMock,
} = vi.hoisted(() => ({
  debouncedSave: vi.fn<
    (
      data: import("@/types/character").CharacterDoc,
      callbacks?: {
        onSend?: (data: import("@/types/character").CharacterDoc) => void;
        onResolved?: (data: import("@/types/character").CharacterDoc) => void;
        onRejected?: (
          data: import("@/types/character").CharacterDoc,
          error: unknown
        ) => void;
        onCancelled?: (data: import("@/types/character").CharacterDoc) => void;
      }
    ) => void
  >(),
  // Captures the hook's SEND-TIME revision allocator (the 4th argument), so a replay
  // can stamp a payload exactly as the real debounced saver does.
  createDebouncedSaveMock:
    vi.fn<
      (
        uid: string,
        charId: string,
        delayMs?: number,
        allocateRevision?: () => number
      ) => unknown
    >(),
  debouncedFlush: vi.fn(() => Promise.resolve()),
  debouncedCancel: vi.fn(),
  subscribeMock: vi.fn<
    (
      uid: string,
      charId: string,
      cb: (
        d: import("@/types/character").CharacterDoc | null,
        meta: { hasPendingWrites: boolean }
      ) => void,
      onError?: (err: Error) => void
    ) => () => void
  >(() => () => {}),
  // The DM-sheet fan-out is mocked at the feature boundary so the test stays
  // Firebase-free (campaign-io → @/lib/firebase would otherwise load) and we can
  // assert the auto-save triggers the fan-out.
  refreshAttachedSheetsMock: vi.fn(() => Promise.resolve()),
  createTrackerMock: vi.fn(() => ({ ensure: () => Promise.resolve([]) })),
  // The combat-state subdoc IO is mocked at the boundary (it imports @/lib/firebase)
  // so the test stays Firebase-free, and we can capture its live listener + assert
  // each trio op lands on the subdoc through the injected `CombatPersistence.write`
  // (the store computes the next state; the hook persists it via `writeCombatState`),
  // never the parent doc.
  combatSubscribeMock: vi.fn<
    (
      uid: string,
      charId: string,
      cb: (s: import("@/types/combat-state").CombatState | null) => void,
      onError?: (err: Error) => void
    ) => () => void
  >(() => () => {}),
  writeCombatStateMock: vi.fn<
    (
      uid: string,
      charId: string,
      state: import("@/types/combat-state").CombatState
    ) => Promise<void>
  >(() => Promise.resolve()),
}));

const authState = { user: { uid: "u1" } as { uid: string } | null };

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/stores/authStore", () => ({
  // Supports BOTH the hook form `useAuthStore(sel)` AND the imperative
  // `useAuthStore.getState()` the auto-save fan-out uses.
  useAuthStore: Object.assign((sel: (s: typeof authState) => unknown) => sel(authState), {
    getState: () => authState,
  }),
}));
vi.mock("@/lib/firestore", () => ({
  subscribeToCharacter: subscribeMock,
  createDebouncedSave: (
    uid: string,
    charId: string,
    delayMs?: number,
    allocateRevision?: () => number
  ) => {
    createDebouncedSaveMock(uid, charId, delayMs, allocateRevision);
    return { save: debouncedSave, flush: debouncedFlush, cancel: debouncedCancel };
  },
  saveStatusCallbacks: { onPending() {}, onSaving() {}, onSaved() {}, onError() {} },
}));
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: combatSubscribeMock,
  writeCombatState: writeCombatStateMock,
  writeCombatTurnEconomy: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/refresh-attached-sheets", () => ({
  createAttachedCampaignTracker: createTrackerMock,
  refreshAttachedSheets: refreshAttachedSheetsMock,
}));
vi.mock("@/lib/log-persistence", () => ({
  loadLogFromIDB: () => Promise.resolve([]),
  // The store's events-as-data log seam mirrors to IndexedDB; stub the writers so
  // a session edit that emits a log event (e.g. setConcentration) doesn't blow up.
  saveLogToIDB: () => Promise.resolve(),
  clearLogFromIDB: () => Promise.resolve(),
}));
vi.mock("@/lib/mock", () => ({ MOCK_CHARACTER: {} }));

import { useCharacterStore } from "@/stores/characterStore";
import { useSaveStore } from "@/stores/saveStore";
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";

function doc(): CharacterDoc {
  return {
    id: "char1",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shared: false,
    revision: 4,
    status: "active",
    character: {
      name: assertNonEmptyString("X"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", level: 5 }],
      background: "soldier",
      alignment: asAlignmentId("neutral-good"),
      playerName: "",
      speed: "30 ft",
      ac: 16,
      armorNote: "",
      hp: { max: 44 },
      hitDieType: 10,
      languageIds: [],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: {},
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: [],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: [],
      equipment: [],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
    },
    session: {
      hp: { current: 44, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      unpinnedActions: [],
      notes: "",
      logEntries: [],
    },
  };
}

/** Latest captured Firestore snapshot callback, wrapped to supply the snapshot
 *  metadata (defaults to a SERVER snapshot — `hasPendingWrites: false`). */
function snapshotCb(
  meta: { hasPendingWrites: boolean } = { hasPendingWrites: false }
): (d: CharacterDoc | null) => void {
  const cb = subscribeMock.mock.calls.at(-1)?.[2];
  if (!cb) throw new Error("subscription callback not captured");
  return (d) => cb(d, meta);
}

/** Latest captured combat-subdoc snapshot callback, wrapped to supply the snapshot
 *  metadata (defaults to a SERVER snapshot — `hasPendingWrites: false`). */
function combatCb(
  meta: { hasPendingWrites: boolean } = { hasPendingWrites: false }
): (s: import("@/types/combat-state").CombatState | null) => void {
  const cb = combatSubscribeMock.mock.calls.at(-1)?.[2] as
    | ((
        s: import("@/types/combat-state").CombatState | null,
        m: { hasPendingWrites: boolean }
      ) => void)
    | undefined;
  if (!cb) throw new Error("combat subscription callback not captured");
  return (s) => cb(s, meta);
}

function combatErrorCb(): (error: Error) => void {
  const cb = combatSubscribeMock.mock.calls.at(-1)?.[3];
  if (!cb) throw new Error("combat subscription error callback not captured");
  return cb;
}

function parentErrorCb(): (error: Error) => void {
  const cb = subscribeMock.mock.calls.at(-1)?.[3];
  if (!cb) throw new Error("parent subscription error callback not captured");
  return cb;
}

function v1Doc(): CharacterDoc {
  return doc();
}

/** Seed the OPEN character the way production does: the parent snapshot AND the
 *  `combat/state` play owner it cannot be published without. */
function seedCharacter(d: CharacterDoc = doc()): void {
  snapshotCb()(d);
  combatCb()(sessionToCombatState(d.session));
}

/** REPLAY I3 fixture — a level-3 monk whose Focus pool is the tracker that reverted.
 *  Marked v1, so the Focus spend lives in the `combat/state` child. */
function monkFocusDoc(): CharacterDoc {
  const base = doc();
  return {
    ...base,
    revision: 4,
    character: {
      ...base.character,
      classes: [{ classId: "monk", level: 3 }],
      hitDieType: 8,
      features: [{ srdId: "monk-focus" }],
    },
    session: { ...base.session, trackers: { "monk-focus": { used: 0 } } },
  };
}

function v1Combat(
  patch: Partial<import("@/types/combat-state").CombatState> = {}
): import("@/types/combat-state").CombatState {
  return { ...sessionToCombatState(v1Doc().session), ...patch };
}

async function flushPlayWrite(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  debouncedSave.mockClear();
  debouncedCancel.mockClear();
  subscribeMock.mockClear();
  refreshAttachedSheetsMock.mockClear();
  createTrackerMock.mockClear();
  combatSubscribeMock.mockClear();
  writeCombatStateMock.mockClear();
  createDebouncedSaveMock.mockClear();
  useSaveStore.setState({ status: "saved", errorMessage: null });
  authState.user = { uid: "u1" };
  useCharacterStore.setState({
    character: null,
    loading: false,
    error: null,
    readonly: false,
    combatPersistence: null,
    parentPersistenceFlush: null,
  });
});

describe("useCharacterSubscription — domain-rule-D8 sync invariants", () => {
  it("subscribes for the given character", () => {
    renderHook(() => useCharacterSubscription("char1"));
    expect(subscribeMock).toHaveBeenCalledWith(
      "u1",
      "char1",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("an incoming server snapshot does NOT trigger a save (loop guard)", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter());
    expect(useCharacterStore.getState().character?.id).toBe("char1");
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it("a BUILD edit saves the parent doc with BOTH session and character", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter()); // seed from server (no save)
    debouncedSave.mockClear();

    act(() => {
      const cur = useCharacterStore.getState().character;
      if (!cur) throw new Error("character was not published");
      useCharacterStore
        .getState()
        .setCharacter({ ...cur, character: { ...cur.character, quote: "onward" } });
    });

    expect(debouncedSave).toHaveBeenCalledTimes(1);
    const payload = debouncedSave.mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >;
    expect(payload).toHaveProperty("session");
    expect(payload).toHaveProperty("character"); // domain rule D8: both saved together
  });

  it("a session-only edit goes to the play child alone — no parent save at all", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    // Seed a character that is mid-combat (damaged, conditioned, mid-death-save).
    const seeded = doc();
    seeded.session.hp = { current: 12, temp: 5 };
    seeded.session.conditions = ["poisoned"];
    seeded.session.initiative = "17";
    seeded.session.deathSucc = 1;
    seeded.session.deathFail = 2;
    act(() => seedCharacter(seeded));
    debouncedSave.mockClear();
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().updateSession({ notes: "x" }));
    await flushPlayWrite();

    // The whole play session — the trio AND the notes — lands in `combat/state`; the
    // parent carries only build + cache, so nothing routes to it.
    expect(debouncedSave).not.toHaveBeenCalled();
    const [, , state] = writeCombatStateMock.mock.calls.at(-1) as unknown as [
      string,
      string,
      import("@/types/combat-state").CombatState,
    ];
    expect(state.hp).toEqual({ current: 12, temp: 5 });
    expect(state.conditions).toEqual(["poisoned"]);
    expect(state.playState?.state.notes).toBe("x");
  });

  it("a combat-trio edit (HP) writes the SUBDOC (whole-object, offline-safe), not the parent doc", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter());
    debouncedSave.mockClear();
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().setHP(10)); // absolute trio change
    await flushPlayWrite();

    // The HP set persists ONLY to the combat subdoc — through the single offline-safe
    // `writeCombatState` (the store's optimistic whole state), never the parent doc.
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(writeCombatStateMock).toHaveBeenCalledTimes(1);
    const [uid, charId, state] = writeCombatStateMock.mock.calls[0] as unknown as [
      string,
      string,
      import("@/types/combat-state").CombatState,
    ];
    expect(uid).toBe("u1");
    expect(charId).toBe("char1");
    expect(state.hp.current).toBe(10);
  });

  it("an HP damage/heal tap persists the resulting HP through the offline-safe writer", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter());
    // Seed a known current HP so the resulting values are deterministic.
    act(() => useCharacterStore.getState().setHP(40));
    await flushPlayWrite();
    writeCombatStateMock.mockClear();

    act(() => {
      useCharacterStore.getState().applyDamage(7);
    });
    await flushPlayWrite();
    act(() => useCharacterStore.getState().applyHealing(3));
    await flushPlayWrite();

    expect(writeCombatStateMock).toHaveBeenCalledTimes(2);
    const calls = writeCombatStateMock.mock.calls as unknown as Array<
      [string, string, import("@/types/combat-state").CombatState]
    >;
    expect(calls[0]?.[2].hp.current).toBe(33); // 40 − 7
    expect(calls[1]?.[2].hp.current).toBe(36); // 33 + 3
  });

  it("a condition add persists the whole conditions list (subdoc, never parent trio)", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter());
    debouncedSave.mockClear();
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().addCondition("prone"));
    await flushPlayWrite();

    expect(writeCombatStateMock).toHaveBeenCalledTimes(1);
    const [, , state] = writeCombatStateMock.mock.calls[0] as unknown as [
      string,
      string,
      import("@/types/combat-state").CombatState,
    ];
    expect(state.conditions).toEqual(["prone"]);

    // addCondition ALSO appends a combat-log entry — another play fact the SAME child
    // write carries. The parent (build + cache only) is not touched.
    expect(Array.isArray(state.playState?.state.log)).toBe(true);
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it("a death-save change persists the whole resulting nested deathSaves through the writer", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter());
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().setDeathSaves(1, 0));
    await flushPlayWrite();
    act(() => useCharacterStore.getState().setDeathSaves(2, 1));
    await flushPlayWrite();
    expect(writeCombatStateMock).toHaveBeenCalledTimes(2);
    const last = writeCombatStateMock.mock.calls.at(-1) as unknown as [
      string,
      string,
      import("@/types/combat-state").CombatState,
    ];
    expect(last[2].deathSaves).toEqual({ successes: 2, failures: 1 });
  });

  it("flushes the debounced save on unmount (no data loss on quick close — regression)", () => {
    // Bug fix 2026-05-28: previously the cleanup nulled the ref without
    // flushing — a pending write was silently lost if the user navigated
    // away within the debounce window (~2s).
    debouncedFlush.mockClear();
    const { unmount } = renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    debouncedFlush.mockClear();
    unmount();
    expect(debouncedFlush).toHaveBeenCalled();
  });
});

describe("useCharacterSubscription — combat/state subdoc hydration", () => {
  it("opens a live listener on the combat subdoc for (uid, charId)", () => {
    renderHook(() => useCharacterSubscription("char1"));
    expect(combatSubscribeMock).toHaveBeenCalledWith(
      "u1",
      "char1",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("hydrates the trio from a combat snapshot WITHOUT triggering any save (loop guard)", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter()); // seed the character + its play owner
    debouncedSave.mockClear();
    writeCombatStateMock.mockClear();

    act(() =>
      combatCb()({
        ...sessionToCombatState(doc().session),
        hp: { current: 7, temp: 3 },
        conditions: ["frightened"],
        initiativeRoll: 19,
        deathSaves: { successes: 1, failures: 0 },
      })
    );

    // The trio landed in the in-memory session…
    const s = useCharacterStore.getState().character?.session;
    expect(s?.hp).toEqual({ current: 7, temp: 3 });
    expect(s?.conditions).toEqual(["frightened"]);
    expect(s?.initiative).toBe("19");
    expect(s?.deathSucc).toBe(1);
    // …and applying it echoed NOTHING back out — to either doc.
    expect(debouncedSave).not.toHaveBeenCalled();
    expect(writeCombatStateMock).not.toHaveBeenCalled();
  });

  it("a character with NO combat doc fails closed — the sheet is never published", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    // The combat subdoc is absent → the listener delivers null. The child is the SOLE
    // play owner, so this is corruption, not a fresh character: quarantine, and never
    // fabricate a full-HP session (which auto-save would then write back).
    act(() => combatCb()(null));

    expect(useCharacterStore.getState().character).toBeNull();
    expect(useCharacterStore.getState().error).toContain("missing-combat-state");
    expect(writeCombatStateMock).not.toHaveBeenCalled();
  });

  it("reconciles when the combat snapshot arrives BEFORE the character loads", () => {
    renderHook(() => useCharacterSubscription("char1"));
    // Combat doc lands first (tiny JSON), before the async char parse completes.
    act(() =>
      combatCb()({
        ...sessionToCombatState(doc().session),
        hp: { current: 5, temp: 0 },
      })
    );
    // No character yet → nothing applied.
    expect(useCharacterStore.getState().character).toBeNull();
    // Character loads → the held combat snapshot is re-applied onto it.
    act(() => snapshotCb()(doc()));
    expect(useCharacterStore.getState().character?.session.hp).toEqual({
      current: 5,
      temp: 0,
    });
  });
});

describe("useCharacterSubscription — v1 play ownership gate", () => {
  it("does not publish a marked parent until a complete child arrives", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(v1Doc()));
    expect(useCharacterStore.getState().character).toBeNull();
    expect(useCharacterStore.getState().loading).toBe(true);

    const combat = v1Combat();
    combat.playState = sessionToCombatState({
      ...v1Doc().session,
      notes: "child truth",
    }).playState;
    act(() => combatCb()(combat));
    expect(useCharacterStore.getState().character?.session.notes).toBe("child truth");
    expect(useCharacterStore.getState().loading).toBe(false);
  });

  it("publishes atomically when the complete child arrives before its marked parent", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => combatCb()(v1Combat({ hp: { current: 9, temp: 2 } })));
    expect(useCharacterStore.getState().character).toBeNull();
    act(() => snapshotCb()(v1Doc()));
    expect(useCharacterStore.getState().character?.session.hp).toEqual({
      current: 9,
      temp: 2,
    });
  });

  it("fails closed for a missing marked child and ignores later callbacks", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(v1Doc()));
    act(() => combatCb()(null));
    expect(useCharacterStore.getState().character).toBeNull();
    expect(useCharacterStore.getState().error).toContain("missing-combat-state");
    expect(writeCombatStateMock).not.toHaveBeenCalled();
    expect(debouncedSave).not.toHaveBeenCalled();

    act(() => combatErrorCb()(new Error("invalid-v1-play-state")));
    expect(useCharacterStore.getState().character).toBeNull();
    expect(useCharacterStore.getState().error).toContain("missing-combat-state");
    expect(writeCombatStateMock).not.toHaveBeenCalled();
  });

  it("quarantines a loaded v1 character and cancels every queued write when its child disappears", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => combatCb()(v1Combat()));
    act(() => snapshotCb()(v1Doc()));
    const loaded = useCharacterStore.getState().character;
    if (!loaded) throw new Error("valid v1 pair was not published");
    writeCombatStateMock.mockClear();
    debouncedSave.mockClear();
    debouncedCancel.mockClear();

    act(() => {
      useCharacterStore.setState({
        character: {
          ...loaded,
          character: { ...loaded.character, quote: "queued parent edit" },
          session: { ...loaded.session, notes: "queued child edit" },
        },
      });
      combatCb()(null);
    });
    await flushPlayWrite();

    const state = useCharacterStore.getState();
    expect(state.character).toBeNull();
    expect(state.error).toContain("missing-combat-state");
    expect(state.combatPersistence).toBeNull();
    expect(state.parentPersistenceFlush).toBeNull();
    expect(debouncedSave).toHaveBeenCalledTimes(1);
    expect(debouncedCancel).toHaveBeenCalledTimes(1);
    expect(writeCombatStateMock).not.toHaveBeenCalled();

    act(() => state.persistPlayState());
    await flushPlayWrite();
    expect(writeCombatStateMock).not.toHaveBeenCalled();
  });

  it("quarantines a loaded v1 character when the child becomes malformed", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => combatCb()(v1Combat()));
    act(() => snapshotCb()(v1Doc()));

    act(() => combatErrorCb()(new Error("Invalid combat state: invalid-combat-state")));

    const state = useCharacterStore.getState();
    expect(state.character).toBeNull();
    expect(state.error).toBe("Invalid combat state: invalid-combat-state");
    expect(state.combatPersistence).toBeNull();
    expect(state.parentPersistenceFlush).toBeNull();
    expect(debouncedCancel).toHaveBeenCalledTimes(1);
  });

  it("quarantines a loaded v1 character when its parent parser/subscription fails", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => combatCb()(v1Combat()));
    act(() => snapshotCb()(v1Doc()));

    act(() => parentErrorCb()(new Error("invalid parent envelope")));

    const state = useCharacterStore.getState();
    expect(state.character).toBeNull();
    expect(state.error).toBe("invalid parent envelope");
    expect(state.combatPersistence).toBeNull();
    expect(state.parentPersistenceFlush).toBeNull();
    expect(debouncedCancel).toHaveBeenCalledTimes(1);
  });

  it("routes a noncombat session edit to the child write", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => combatCb()(v1Combat()));
    act(() => snapshotCb()(v1Doc()));
    writeCombatStateMock.mockClear();
    debouncedSave.mockClear();

    act(() => useCharacterStore.getState().updateSession({ notes: "child only" }));
    await flushPlayWrite();

    expect(debouncedSave).not.toHaveBeenCalled();
    expect(writeCombatStateMock).toHaveBeenCalledTimes(1);
    const state = writeCombatStateMock.mock.calls[0]?.[2];
    if (!state) throw new Error("play-state write not captured");
    expect(state.playState?.state.notes).toBe("child only");
  });

  it("coalesces a combat + log composite action into one complete child write", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => combatCb()(v1Combat()));
    act(() => snapshotCb()(v1Doc()));
    writeCombatStateMock.mockClear();
    debouncedSave.mockClear();

    act(() => useCharacterStore.getState().addCondition("prone"));
    await flushPlayWrite();

    expect(writeCombatStateMock).toHaveBeenCalledTimes(1);
    const state = writeCombatStateMock.mock.calls[0]?.[2];
    if (!state) throw new Error("play-state write not captured");
    expect(state.conditions).toContain("prone");
    expect(state.playState?.state.log).toHaveLength(1);
    expect(debouncedSave).not.toHaveBeenCalled();
  });
});

describe("useCharacterSubscription — T4 DM-sheet fan-out", () => {
  it("builds an attached-campaign tracker for the (owner, character) on subscribe", () => {
    renderHook(() => useCharacterSubscription("char1"));
    expect(createTrackerMock).toHaveBeenCalledWith("u1", "char1");
  });

  it("a local mutation fans the fresh sheet out to attached campaigns", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => seedCharacter()); // seed from server (no fan-out)
    refreshAttachedSheetsMock.mockClear();

    // The fan-out rides the parent-doc save, so a NON-combat edit triggers it (a
    // bare HP tap now persists only to the combat subdoc — see the sync tests).
    act(() => useCharacterStore.getState().updateSession({ notes: "rallying" }));

    expect(refreshAttachedSheetsMock).toHaveBeenCalledTimes(1);
    const [tracker, uid, fannedDoc] = refreshAttachedSheetsMock.mock
      .calls[0] as unknown as [unknown, string, CharacterDoc];
    expect(tracker).toBeDefined(); // the per-character tracker, not re-resolved
    expect(uid).toBe("u1");
    expect(fannedDoc.id).toBe("char1");
    expect(fannedDoc.character).toBeDefined();
    expect(fannedDoc.session).toBeDefined();
  });

  it("an incoming server snapshot does NOT fan out (loop guard)", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    expect(refreshAttachedSheetsMock).not.toHaveBeenCalled();
  });
});

/**
 * REPLAYS of the two reported losses (audit F7): the parent and the `combat/state` child
 * are two independent listeners, and the pre-fix hook republished BOTH stored values on
 * every snapshot of EITHER — so a sibling snapshot clobbered a still-unwritten local edit.
 */
describe("useCharacterSubscription — per-domain reconciliation replays (audit F7)", () => {
  /** The live character, or a loud failure (the replays are meaningless without it). */
  function openCharacter(): CharacterDoc {
    const current = useCharacterStore.getState().character;
    if (!current) throw new Error("character was not published");
    return current;
  }

  function lastSave(): {
    payload: CharacterDoc;
    callbacks: NonNullable<Parameters<typeof debouncedSave>[1]>;
  } {
    const call = debouncedSave.mock.calls.at(-1);
    if (!call) throw new Error("parent save not captured");
    const [payload, callbacks] = call;
    if (!callbacks) throw new Error("parent save callbacks not captured");
    return { payload, callbacks };
  }

  /** The hook's SEND-TIME revision allocator, handed to `createDebouncedSave`. */
  function allocateRevision(): number {
    const allocate = createDebouncedSaveMock.mock.calls.at(-1)?.[3];
    if (!allocate) throw new Error("revision allocator not captured");
    return allocate();
  }

  /**
   * Emulate exactly what the real debounced saver does when a queued write LEAVES:
   * stamp the generation from the hook's allocator and hand the sent object back
   * through `onSend` (which re-marks it pending so ack/reject still match).
   */
  function sendLastSave(): CharacterDoc {
    const { payload, callbacks } = lastSave();
    const sent: CharacterDoc = { ...payload, revision: allocateRevision() };
    act(() => callbacks.onSend?.(sent));
    return sent;
  }

  function lastChildWrite(): import("@/types/combat-state").CombatState {
    const call = writeCombatStateMock.mock.calls.at(-1);
    if (!call) throw new Error("play-state write not captured");
    return call[2];
  }

  function openTracker(trackerId: string): number | undefined {
    return openCharacter().session.trackers[trackerId]?.used;
  }

  it("REPLAY I2 — a custom item added while a combat snapshot interleaves stays in the store and in the pending payload", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    await act(async () => {
      snapshotCb()(doc());
      combatCb()(sessionToCombatState(doc().session));
      await Promise.resolve();
    });
    const boots: CustomEquipment = {
      custom: true,
      name: "Bo's shoes",
      equipped: true,
      instanceId: "bo-shoes",
    };
    act(() => {
      const cur = openCharacter();
      useCharacterStore.getState().setCharacter({
        ...cur,
        character: { ...cur.character, equipment: [...cur.character.equipment, boots] },
      });
    });
    const { payload } = lastSave();
    expect(payload.character.equipment).toContainEqual(boots);
    // The QUEUED payload still carries the acknowledged generation; the write claims
    // the next one only when it actually leaves.
    expect(payload.revision).toBe(4);
    const sent = sendLastSave();
    expect(sent.revision).toBe(5);
    // the remote child snapshot arrives before the parent write is acknowledged
    await act(async () => {
      combatCb()(sessionToCombatState(doc().session));
      await Promise.resolve();
    });
    expect(openCharacter().character.equipment).toContainEqual(boots);
    // the local echo of our own write
    await act(async () => {
      snapshotCb({ hasPendingWrites: true })({ ...sent });
      await Promise.resolve();
    });
    expect(openCharacter().character.equipment).toContainEqual(boots);
    // the server confirms; nothing changes, nothing re-saves
    const saves = debouncedSave.mock.calls.length;
    await act(async () => {
      snapshotCb()({ ...sent });
      await Promise.resolve();
    });
    expect(openCharacter().character.equipment).toContainEqual(boots);
    // …and the store now reports the ACKNOWLEDGED generation.
    expect(openCharacter().revision).toBe(5);
    expect(debouncedSave.mock.calls.length).toBe(saves);
  });

  it("REPLAY I3 — a Focus spend survives an interleaving parent snapshot and lands in the pending child", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    const monk = monkFocusDoc();
    await act(async () => {
      snapshotCb()(monk);
      combatCb()({
        ...sessionToCombatState(monk.session),
        playState: sessionToPlayStateV1(monk.session),
      });
      await Promise.resolve();
    });
    // Hold the child write open so the parent snapshot lands while it is UNacknowledged.
    let release = (): void => {};
    writeCombatStateMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    act(() => {
      useCharacterStore.getState().useTracker("monk-focus", 1);
    });
    await flushPlayWrite();
    const pendingChild = lastChildWrite();
    const pendingTrackers = pendingChild.playState?.state.trackers as
      | Record<string, number>
      | undefined;
    expect(pendingTrackers?.["monk-focus"]).toBe(1);
    // a parent snapshot (e.g. the DM detach or another tab's metadata write) arrives now
    await act(async () => {
      snapshotCb()({ ...monk, revision: 5 });
      await Promise.resolve();
    });
    expect(openTracker("monk-focus")).toBe(1);
    await act(async () => {
      release();
      await Promise.resolve();
      combatCb()(pendingChild);
    });
    expect(openTracker("monk-focus")).toBe(1);
  });

  it("a server snapshot shaped the way the parser produces one ACKNOWLEDGES the pending parent", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    // The live sheet carries play facts (they come from the child, in v1); the PARENT
    // the server hands back never does — `parseStoredCharacter` refuses a parent whose
    // `state` is non-empty, so it always hydrates an empty session.
    const played: CharacterDoc = {
      ...doc(),
      session: { ...doc().session, notes: "field notes" },
    };
    await act(async () => {
      snapshotCb()(doc());
      combatCb()(sessionToCombatState(played.session));
      await Promise.resolve();
    });
    expect(openCharacter().session.notes).toBe("field notes");
    act(() => {
      const cur = openCharacter();
      useCharacterStore
        .getState()
        .setCharacter({ ...cur, character: { ...cur.character, quote: "local" } });
    });
    const sent = sendLastSave();
    expect(sent.session.notes).toBe("field notes");
    // Exactly what `subscribeToCharacter` delivers once the write lands: our build and
    // our generation, an EMPTY parent session. Keying the parent domain on the whole
    // codec envelope made this differ from the payload forever, so no snapshot could
    // ever acknowledge a parent write.
    const serverParsed: CharacterDoc = {
      ...sent,
      session: doc().session,
      updatedAt: new Date(),
    };
    await act(async () => {
      snapshotCb()(serverParsed);
      await Promise.resolve();
    });
    expect(openCharacter().character.quote).toBe("local");
    expect(openCharacter().session.notes).toBe("field notes");
    // ACKNOWLEDGED — the payload is no longer pending, so the NEXT server value is
    // published instead of being hidden behind an edit the server already stored.
    await act(async () => {
      snapshotCb()({
        ...serverParsed,
        revision: sent.revision + 1,
        character: { ...serverParsed.character, quote: "other device" },
      });
      await Promise.resolve();
    });
    expect(openCharacter().character.quote).toBe("other device");
  });

  it("keeps a local edit pending when a rejection is NOT the compare-and-set conflict", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    await act(async () => {
      snapshotCb()(doc());
      combatCb()(sessionToCombatState(doc().session));
      await Promise.resolve();
    });
    act(() => {
      const cur = openCharacter();
      useCharacterStore
        .getState()
        .setCharacter({ ...cur, character: { ...cur.character, quote: "local" } });
    });
    const { callbacks } = lastSave();
    const sent = sendLastSave();
    await act(async () => {
      snapshotCb()({
        ...doc(),
        revision: 9,
        character: { ...doc().character, quote: "other device" },
      });
      await Promise.resolve();
    });
    // A transport failure says nothing about who owns the document: the edit survives,
    // the sheet keeps showing it, and the error message stays on screen.
    act(() => {
      useSaveStore.getState().markError("The service is currently unavailable.");
      callbacks.onRejected?.(
        sent,
        Object.assign(new Error("The service is currently unavailable."), {
          code: "unavailable",
        })
      );
    });
    expect(openCharacter().character.quote).toBe("local");
    expect(useSaveStore.getState().status).toBe("error");
    // The rules' CAS refusal IS a conflict — the same payload is dropped for the
    // server's own value (this one carries the FirestoreError `code`, not a message).
    act(() => {
      callbacks.onRejected?.(
        sent,
        Object.assign(new Error("Missing or insufficient permissions."), {
          code: "permission-denied",
        })
      );
    });
    expect(openCharacter().character.quote).toBe("other device");
  });

  it("a rejected parent write surfaces SaveStatus=error and republishes the remote", async () => {
    renderHook(() => useCharacterSubscription("char1"));
    await act(async () => {
      snapshotCb()(doc());
      combatCb()(sessionToCombatState(doc().session));
      await Promise.resolve();
    });
    act(() => {
      const cur = openCharacter();
      useCharacterStore
        .getState()
        .setCharacter({ ...cur, character: { ...cur.character, quote: "local" } });
    });
    const { callbacks } = lastSave();
    const sent = sendLastSave();
    // Another device advanced the parent past our base — a conflict, not a clobber.
    await act(async () => {
      snapshotCb()({
        ...doc(),
        revision: 9,
        character: { ...doc().character, quote: "other device" },
      });
      await Promise.resolve();
    });
    expect(openCharacter().character.quote).toBe("local");
    act(() => {
      // The save store already holds the REAL Firestore message (`runWrite`); the hook
      // must not overwrite it. Mirror that here, then run the hook's rejection handler.
      useSaveStore.getState().markError("permission-denied");
      callbacks.onRejected?.(sent, new Error("permission-denied"));
    });
    expect(openCharacter().character.quote).toBe("other device");
    expect(useSaveStore.getState().status).toBe("error");
    expect(useSaveStore.getState().errorMessage).toBe("permission-denied");
    // …and the next write re-bases on the SERVER's generation, not on what we sent.
    act(() => {
      const cur = openCharacter();
      useCharacterStore
        .getState()
        .setCharacter({ ...cur, character: { ...cur.character, quote: "retry" } });
    });
    expect(sendLastSave().revision).toBe(10);
  });
});
