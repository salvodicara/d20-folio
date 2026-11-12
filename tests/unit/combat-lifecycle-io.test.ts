/**
 * The combat lifecycle's writes and their undos, over an in-memory stand-in for the
 * Firestore transaction (the rules side runs in tests/rules/combat-lifecycle.emulator).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Record<string, unknown>>();
const advance = vi.fn();

vi.mock("@/lib/firebase", () => ({ db: {} }));
// The session log, in memory: a test that reads lines passes its own recorder on
// `sessionLog`; a move's default recorder writes to a separate log, so a roll made only
// to set up a fight never lands in the session a test reads.
const sessionLog = createMemorySessionLogStore();
const backgroundLog = createMemorySessionLogStore();
vi.mock("@/features/campaigns/session-log-source", () => ({
  sessionLogStoreFor: () => backgroundLog,
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  serverTimestamp: () => "now",
  onSnapshot: vi.fn(),
  runTransaction: async (
    _db: unknown,
    run: (txn: unknown) => Promise<unknown>
  ): Promise<unknown> =>
    run({
      get: (ref: { path: string }) => {
        const data = store.get(ref.path);
        return Promise.resolve({
          id: ref.path.split("/").at(-1),
          exists: () => data !== undefined,
          data: () => (data ? structuredClone(data) : undefined),
        });
      },
      update: (ref: { path: string }, fields: Record<string, unknown>) => {
        store.set(ref.path, { ...store.get(ref.path), ...fields });
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        store.set(ref.path, structuredClone(data));
      },
      delete: (ref: { path: string }) => {
        store.delete(ref.path);
      },
    }),
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  advanceEncounterTurn: (...args: unknown[]) => Promise.resolve(advance(...args)),
  toCampaignDoc: (id: string, data: Record<string, unknown>) => ({ ...data, id }),
}));

import {
  createMemorySessionLogStore,
  createSessionRecorder,
  foldSession,
} from "@/lib/session-log";
import {
  endCombatNow,
  passCombatTurn,
  reopenLastCombat,
  rollForMissing,
  rollIntoCombat,
} from "@/features/campaigns/combat-lifecycle-io";

const member = (characterId: string | null) => ({
  displayName: "x",
  role: "player",
  characterId,
  character: characterId ? { name: characterId } : null,
});
const campaign = () => store.get("campaigns/camp") ?? {};
const kept = () => store.get("campaigns/camp/combat/ended");
const bonuses = { "pc-ana": 2, "pc-ben": 1 };

beforeEach(() => {
  store.clear();
  advance.mockReset();
  store.set("campaigns/camp", {
    memberDetails: { dm: member(null), ana: member("char-ana"), ben: member("char-ben") },
    encounterInit: {},
  });
});

describe("a roll", () => {
  it("starts the fight, and its undo takes the fight away", async () => {
    const undo = await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    expect(campaign().encounter).toMatchObject({ currentCombatantId: "pc-ana" });
    expect(await undo?.()).toBe(true);
    expect(campaign().encounter).toBeNull();
    expect(campaign().encounterInit).toEqual({});
  });

  it("that started the fight is not undone once someone else rolled", async () => {
    const undo = await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    await rollIntoCombat("camp", { uid: "ben", roll: 18, bonuses });
    expect(await undo?.()).toBe(false);
    expect(campaign().encounter).not.toBeNull();
  });

  it("into a running fight is undone back to the previous roll", async () => {
    await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    await rollIntoCombat("camp", { uid: "ben", roll: 18, bonuses });
    const undo = await rollIntoCombat("camp", { uid: "ben", roll: 4, bonuses });
    expect(campaign().encounterInit).toEqual({ ana: 13, ben: 4 });
    expect(await undo?.()).toBe(true);
    expect(campaign().encounterInit).toEqual({ ana: 13, ben: 18 });
    expect((campaign().encounter as { order: string[] }).order).toEqual([
      "pc-ben",
      "pc-ana",
    ]);
  });

  it("taken back with no fight running does nothing", async () => {
    expect(await rollIntoCombat("camp", { uid: "ana", roll: null, bonuses })).toBeNull();
  });
});

describe("ending and reopening", () => {
  it("an end keeps the fight; its undo reopens it", async () => {
    await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    const undo = await endCombatNow("camp");
    expect(campaign().encounter).toBeNull();
    expect(kept()).toMatchObject({ fight: { ended: { reason: "manual" } } });
    expect(await undo?.()).toBe(true);
    expect(campaign().encounter).toMatchObject({ currentCombatantId: "pc-ana" });
    expect(kept()).toBeUndefined();
  });

  it("a reopen's undo ends the fight again for the same reason", async () => {
    await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    await endCombatNow("camp", { reason: "idle" });
    const undo = await reopenLastCombat("camp");
    expect(kept()).toBeUndefined();
    expect(await undo?.()).toBe(true);
    expect(kept()).toMatchObject({ fight: { ended: { reason: "idle" } } });
  });

  it("with no fight running, nothing ends; with nothing kept, nothing reopens", async () => {
    expect(await endCombatNow("camp")).toBeNull();
    expect(await reopenLastCombat("camp")).toBeNull();
  });
});

describe("a pass", () => {
  it("steps the turn, and its undo steps it back from where it landed", async () => {
    advance.mockReturnValueOnce("monster-1").mockReturnValueOnce("pc-ana");
    const undo = await passCombatTurn("camp", {
      uid: "ben",
      isDm: false,
      expectedCurrentId: "pc-ana",
    });
    expect(advance).toHaveBeenLastCalledWith(
      "camp",
      "next",
      { uid: "ben", isDm: false },
      "pc-ana"
    );
    expect(await undo?.()).toBe(true);
    expect(advance).toHaveBeenLastCalledWith(
      "camp",
      "prev",
      { uid: "ben", isDm: false },
      "monster-1"
    );
  });

  it("that changed nothing has no undo", async () => {
    advance.mockReturnValueOnce(undefined);
    expect(
      await passCombatTurn("camp", { uid: "ben", isDm: false, expectedCurrentId: "x" })
    ).toBeNull();
  });
});

describe("a player's own initiative roll", () => {
  const ownLog = createMemorySessionLogStore();
  it("writes its report line, the total with the bonus; the undo takes it back", async () => {
    const recorder = createSessionRecorder({
      store: ownLog,
      uid: "ana",
      now: () => new Date(2026, 10, 3, 21),
    });
    const undo = await rollIntoCombat(
      "camp",
      { uid: "ana", roll: 13, bonuses },
      recorder
    );
    const lines = () =>
      foldSession(ownLog.items("2026-11-03"), { dmUid: "dm" }).map((e) => e.event);
    expect(lines()).toEqual([
      { kind: "initiative", actor: "pc-ana", roll: 13, total: 15 },
    ]);
    expect(await undo?.()).toBe(true);
    expect(lines()).toEqual([]);
  });

  it("taking a roll back writes no line", async () => {
    const recorder = createSessionRecorder({
      store: ownLog,
      uid: "ben",
      now: () => new Date(2026, 10, 4, 21),
    });
    await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    await rollIntoCombat("camp", { uid: "ben", roll: null, bonuses }, recorder);
    expect(ownLog.items("2026-11-04")).toEqual([]);
  });
});

describe("the DM's roll for whoever is missing", () => {
  it("fills each missing row, and its undo empties them again", async () => {
    store.set("campaigns/camp", { ...campaign(), dmUid: "dm" });
    await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    const dice = [17];
    const recorder = createSessionRecorder({
      store: sessionLog,
      uid: "dm",
      now: () => new Date(2026, 10, 2, 21),
    });
    const undo = await rollForMissing(
      "camp",
      { uid: "dm", bonuses },
      () => dice.shift() ?? 1,
      recorder
    );
    expect(campaign().encounterInit).toEqual({ ana: 13, ben: 17 });
    // One report line per roll, the total with Ben's bonus, rolled by the DM.
    const lines = () =>
      foldSession(sessionLog.items("2026-11-02"), { dmUid: "dm" }).map((e) => e.event);
    expect(lines()).toEqual([
      { kind: "initiative", actor: "pc-ben", roll: 17, total: 18, rolledBy: "dm" },
    ]);
    expect(await undo?.()).toBe(true);
    expect(campaign().encounterInit).toEqual({ ana: 13 });
    expect(lines()).toEqual([]);
  });

  it("is refused for a player", async () => {
    store.set("campaigns/camp", { ...campaign(), dmUid: "dm" });
    await rollIntoCombat("camp", { uid: "ana", roll: 13, bonuses });
    expect(await rollForMissing("camp", { uid: "ana", bonuses }, () => 5)).toBeNull();
  });

  it("rolls fair d20s by default", async () => {
    store.set("campaigns/camp", { ...campaign(), dmUid: "dm" });
    await rollForMissing("camp", { uid: "dm", bonuses });
    for (const roll of Object.values(
      campaign().encounterInit as Record<string, number>
    )) {
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(20);
      expect(Number.isInteger(roll)).toBe(true);
    }
  });
});
