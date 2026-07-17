import { describe, it, expect, beforeEach, vi } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { renderHook, act } from "@testing-library/react";
import type { CharacterDoc } from "@/types/character";
import { omitCombatTrio } from "@/lib/combat-state";
import { serializeCharacterEnvelope } from "@/lib/character-codec";

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
  subscribeMock,
  refreshAttachedSheetsMock,
  createTrackerMock,
  combatSubscribeMock,
  writeCombatStateMock,
} = vi.hoisted(() => ({
  debouncedSave: vi.fn(),
  debouncedFlush: vi.fn(() => Promise.resolve()),
  subscribeMock: vi.fn<
    (
      uid: string,
      charId: string,
      cb: (d: import("@/types/character").CharacterDoc | null) => void,
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
  writeCombatStateMock: vi.fn(() => Promise.resolve()),
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
  createDebouncedSave: () => ({ save: debouncedSave, flush: debouncedFlush }),
  saveStatusCallbacks: { onPending() {}, onSaving() {}, onSaved() {}, onError() {} },
}));
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: combatSubscribeMock,
  writeCombatState: writeCombatStateMock,
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
import { useCharacterSubscription } from "@/hooks/useCharacterSubscription";
import { conc } from "./__helpers__/concentration";

function doc(): CharacterDoc {
  return {
    id: "char1",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
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

/** Latest captured Firestore snapshot callback. */
function snapshotCb(): (d: CharacterDoc | null) => void {
  const cb = subscribeMock.mock.calls.at(-1)?.[2];
  if (!cb) throw new Error("subscription callback not captured");
  return cb;
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

beforeEach(() => {
  debouncedSave.mockClear();
  subscribeMock.mockClear();
  refreshAttachedSheetsMock.mockClear();
  createTrackerMock.mockClear();
  combatSubscribeMock.mockClear();
  writeCombatStateMock.mockClear();
  authState.user = { uid: "u1" };
  useCharacterStore.setState({ character: null, loading: false, error: null });
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
    act(() => snapshotCb()(doc()));
    expect(useCharacterStore.getState().character?.id).toBe("char1");
    expect(debouncedSave).not.toHaveBeenCalled();
  });

  it("a NON-combat edit saves the parent doc with BOTH session and character", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc())); // seed from server (no save)
    debouncedSave.mockClear();

    act(() => useCharacterStore.getState().updateSession({ notes: "scouting ahead" }));

    expect(debouncedSave).toHaveBeenCalledTimes(1);
    const payload = debouncedSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty("session");
    expect(payload).toHaveProperty("character"); // domain rule D8: both saved together
  });

  it("the persisted parent state OMITS the combat trio (subdoc owns it now)", () => {
    renderHook(() => useCharacterSubscription("char1"));
    // Seed a character that is mid-combat (damaged, conditioned, mid-death-save).
    const seeded = doc();
    seeded.session.hp = { current: 12, temp: 5 };
    seeded.session.conditions = ["poisoned"];
    seeded.session.initiative = "17";
    seeded.session.deathSucc = 1;
    seeded.session.deathFail = 2;
    act(() => snapshotCb()(seeded));
    debouncedSave.mockClear();

    act(() => useCharacterStore.getState().updateSession({ notes: "x" }));

    const payload = debouncedSave.mock.calls[0]?.[0] as {
      character: import("@/types/character").CharacterData;
      session: import("@/types/character").SessionState;
    };
    // The hook hands the FULL in-memory session to the save (the trio is intact) — the
    // combat trio is dropped downstream at the Firestore serialization boundary.
    expect(payload.session.hp).toEqual({ current: 12, temp: 5 });
    expect(payload.session.conditions).toEqual(["poisoned"]);
    // Running the EXACT parent-doc boundary recipe (`toStoredPayload`: serialize →
    // `omitCombatTrio`) yields a `state` that carries NO combat trio, non-combat intact.
    const parentState = omitCombatTrio(
      serializeCharacterEnvelope({
        character: payload.character,
        session: payload.session,
      } as CharacterDoc).state
    );
    expect(parentState).not.toHaveProperty("hp");
    expect(parentState).not.toHaveProperty("conditions");
    expect(parentState).not.toHaveProperty("initiative");
    expect(parentState).not.toHaveProperty("deathSucc");
    expect(parentState).not.toHaveProperty("deathFail");
    expect(parentState.notes).toBe("x");
  });

  it("a combat-trio edit (HP) writes the SUBDOC (whole-object, offline-safe), not the parent doc", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    debouncedSave.mockClear();
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().setHP(10)); // absolute trio change

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

  it("an HP damage/heal tap persists the resulting HP through the offline-safe writer", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    // Seed a known current HP so the resulting values are deterministic.
    act(() => useCharacterStore.getState().setHP(40));
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().applyDamage(7));
    act(() => useCharacterStore.getState().applyHealing(3));

    expect(writeCombatStateMock).toHaveBeenCalledTimes(2);
    const calls = writeCombatStateMock.mock.calls as unknown as Array<
      [string, string, import("@/types/combat-state").CombatState]
    >;
    expect(calls[0]?.[2].hp.current).toBe(33); // 40 − 7
    expect(calls[1]?.[2].hp.current).toBe(36); // 33 + 3
  });

  it("a condition add persists the whole conditions list (subdoc, never parent trio)", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    debouncedSave.mockClear();
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().addCondition("prone"));

    expect(writeCombatStateMock).toHaveBeenCalledTimes(1);
    const [, , state] = writeCombatStateMock.mock.calls[0] as unknown as [
      string,
      string,
      import("@/types/combat-state").CombatState,
    ];
    expect(state.conditions).toEqual(["prone"]);

    // addCondition ALSO appends a combat-log entry (a non-trio field on the parent
    // doc), so the parent save fires for the LOG. The hook hands the full session
    // (conditions intact); the Firestore boundary drops the trio from the persisted
    // `state` (`omitCombatTrio`), so the parent doc never carries a second copy.
    const lastParent = debouncedSave.mock.calls.at(-1)?.[0] as {
      character: import("@/types/character").CharacterData;
      session: import("@/types/character").SessionState;
    };
    expect(lastParent.session.conditions).toEqual(["prone"]);
    expect(lastParent.session.logEntries.length).toBeGreaterThan(0);
    const parentState = omitCombatTrio(
      serializeCharacterEnvelope({
        character: lastParent.character,
        session: lastParent.session,
      } as CharacterDoc).state
    );
    expect(parentState).not.toHaveProperty("conditions");
    expect(Array.isArray(parentState.log)).toBe(true);
  });

  it("a death-save change persists the whole resulting nested deathSaves through the writer", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    writeCombatStateMock.mockClear();

    act(() => useCharacterStore.getState().setDeathSaves(1, 0));
    act(() => useCharacterStore.getState().setDeathSaves(2, 1));
    expect(writeCombatStateMock).toHaveBeenCalledTimes(2);
    const last = writeCombatStateMock.mock.calls.at(-1) as unknown as [
      string,
      string,
      import("@/types/combat-state").CombatState,
    ];
    expect(last[2].deathSaves).toEqual({ successes: 2, failures: 1 });
  });

  it("a session-only edit still includes character in the payload (anti-clobber)", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc()));
    debouncedSave.mockClear();

    act(() => useCharacterStore.getState().setConcentration(conc("fly")));

    const payload = debouncedSave.mock.calls[0]?.[0] as {
      session: unknown;
      character: unknown;
    };
    expect(payload.session).toBeDefined();
    expect(payload.character).toBeDefined();
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
    act(() => snapshotCb()(doc())); // seed the character
    debouncedSave.mockClear();
    writeCombatStateMock.mockClear();

    act(() =>
      combatCb()({
        hp: { current: 7, temp: 3 },
        conditions: ["frightened"],
        initiativeRoll: 19,
        deathSaves: { successes: 1, failures: 0 },
        round: 1,
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

  it("a character with NO combat doc hydrates to FULL HP, not 0", () => {
    renderHook(() => useCharacterSubscription("char1"));
    const seeded = doc();
    // The parent doc no longer carries HP (stripped on save) — it reads back as 0/0.
    seeded.session.hp = { current: 0, temp: 0 };
    act(() => snapshotCb()(seeded));
    // The combat subdoc is absent → the listener delivers null.
    act(() => combatCb()(null));

    const s = useCharacterStore.getState().character?.session;
    // effectiveMaxHp for this fixture = stored base (44) + no boons.
    expect(s?.hp).toEqual({ current: 44, temp: 0 });
    expect(s?.conditions).toEqual([]);
    expect(s?.initiative).toBe("");
    expect(s?.deathSucc).toBe(0);
    expect(s?.deathFail).toBe(0);
    // The absent-doc default must NOT be written back (no spurious subdoc create).
    expect(writeCombatStateMock).not.toHaveBeenCalled();
  });

  it("reconciles when the combat snapshot arrives BEFORE the character loads", () => {
    renderHook(() => useCharacterSubscription("char1"));
    // Combat doc lands first (tiny JSON), before the async char parse completes.
    act(() =>
      combatCb()({
        hp: { current: 5, temp: 0 },
        conditions: [],
        initiativeRoll: null,
        deathSaves: { successes: 0, failures: 0 },
        round: 1,
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

describe("useCharacterSubscription — T4 DM-sheet fan-out", () => {
  it("builds an attached-campaign tracker for the (owner, character) on subscribe", () => {
    renderHook(() => useCharacterSubscription("char1"));
    expect(createTrackerMock).toHaveBeenCalledWith("u1", "char1");
  });

  it("a local mutation fans the fresh sheet out to attached campaigns", () => {
    renderHook(() => useCharacterSubscription("char1"));
    act(() => snapshotCb()(doc())); // seed from server (no fan-out)
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
