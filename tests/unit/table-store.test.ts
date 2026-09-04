/**
 * The table store — the one client-side seam between the encounter document and the play
 * surface (stage 6 design §4). What this pins:
 *
 *  · the FOLD MEMO. `subscribeEncounter` delivers the appending client's own write twice, once
 *    pending and once acknowledged, with byte-identical content; re-folding both doubles the
 *    work of every local append for no new information (the adapter's own header says so).
 *  · the STAMPING. `dispatch` takes a body and mints the envelope — `id`, `seq`, `by` — so no
 *    caller can invent an identity or an ordering of its own.
 *  · the DM's COMPACTION (design §2 D8): attempted only by a DM-capable role, only on a settled
 *    snapshot, and never twice at once.
 *  · the TEARDOWN: one listener, released.
 *
 * `firebase/firestore` is mocked so the fast lane stays Firebase-free (see
 * `tests/unit/pure-modules-guard.test.ts`), and `@/lib/combat-io` is a recorder: the store's
 * contract is WHICH adapter verb it calls with WHICH action, and the adapter itself is proved
 * against the real rules by the emulator lane.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  arrayUnion: vi.fn(),
  deleteField: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => segments.join("/")),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

const appendAction = vi.fn(() => Promise.resolve());
const checkpointEncounter = vi.fn(() => Promise.resolve<"written" | "stale">("written"));
const unsubscribe = vi.fn();
let listener: ((snapshot: EncounterSnapshot) => void) | null = null;
let minted = 0;

vi.mock("@/lib/combat-io", () => ({
  appendAction: (...args: unknown[]) => appendAction(...(args as [])),
  checkpointEncounter: (...args: unknown[]) => checkpointEncounter(...(args as [])),
  encounterRef: (_db: unknown, campaignId: string, encounterId: string) =>
    `campaigns/${campaignId}/encounters/${encounterId}`,
  newActionId: () => `mint-${(minted += 1)}`,
  subscribeEncounter: (_ref: unknown, next: (snapshot: EncounterSnapshot) => void) => {
    listener = next;
    return unsubscribe;
  },
}));

import type { Firestore } from "firebase/firestore";
import { CORE_MECHANICS } from "@/data/combat/core-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { CHECKPOINT_GRACE_MS, checkpointThrough } from "@/lib/combat/checkpoint";
import { fold } from "@/lib/combat/fold";
import type { EncounterSnapshot } from "@/lib/combat-io";
import type { Action, Encounter } from "@/lib/combat/types";
import type { Seq } from "@/lib/combat/ids";
import {
  createTableStore,
  liveTableRef,
  LIVE_ENCOUNTER_ID,
  type TableState,
} from "@/features/play/table/table-store";
import { testEntity } from "@tests/unit/combat/__helpers__/entities";
import { openingActions, seqFactory } from "@tests/unit/combat/__helpers__/state";
import type { StoreApi } from "zustand/vanilla";

const { catalogue } = buildCatalogue(CORE_MECHANICS);
const REF = "campaigns/camp-1/encounters/live";
const MARCO = testEntity({ id: "marco", kind: "pc", controllerUid: "p-marco" });
const OGRE = testEntity({ id: "ogre-1" });

/** A table that has started, seated two creatures and begun turns. */
function opening(): Action[] {
  return openingActions(
    "dm",
    seqFactory("dm", 1_000),
    [MARCO, OGRE],
    { marco: 18, "ogre-1": 9 },
    ["marco", "ogre-1"],
    CORE_MECHANICS
  );
}

function encounterOf(log: readonly Action[]): Encounter {
  return {
    schema: 1,
    id: LIVE_ENCOUNTER_ID,
    host: { kind: "campaign", campaignId: "camp-1" },
    log: [...log],
    checkpoint: null,
  };
}

/** One `declare` per call — the cheapest action that grows a log. Stamps are ten seconds apart
 *  so a long log reaches back well beyond the compaction grace window. */
function filler(index: number): Action {
  return {
    kind: "declare",
    id: `fill-${index}`,
    seq: { ms: 10_000 + index * 10_000, counter: 0, by: "dm" },
    by: "dm",
    relation: { kind: "visible", a: "marco", b: "ogre-1", value: index % 2 === 0 },
    remove: false,
    mover: null,
  };
}

let clock = 0;
function seq(): Seq {
  clock += 1;
  return { ms: 50_000 + clock, counter: 0, by: "dm" };
}

const teardowns: (() => void)[] = [];

/** A connected store; every listener is released after the test. */
function makeStore(
  role: { uid: string; dm: boolean },
  now: () => number = () => 9_000_000
): StoreApi<TableState> {
  const store = createTableStore({
    db: {} as Firestore,
    ref: REF as never,
    role,
    catalogue,
    seq,
    now,
  });
  teardowns.push(store.getState().connect());
  return store;
}

function deliver(snapshot: EncounterSnapshot): void {
  if (listener === null) throw new Error("the store never subscribed");
  listener(snapshot);
}

function settled(encounter: Encounter): EncounterSnapshot {
  return { kind: "encounter", encounter, pending: false };
}

afterEach(() => {
  while (teardowns.length > 0) teardowns.pop()?.();
});

beforeEach(() => {
  appendAction.mockClear();
  checkpointEncounter.mockClear();
  unsubscribe.mockClear();
  listener = null;
  minted = 0;
  clock = 0;
});

describe("the table store's subscription and fold memo", () => {
  it("opens one listener on connect and folds the first snapshot", () => {
    const store = makeStore({ uid: "dm", dm: true });
    expect(store.getState().fold).toBeNull();

    const log = opening();
    deliver(settled(encounterOf(log)));
    const state = store.getState();
    expect(state.snapshot).toEqual(settled(encounterOf(log)));
    expect(state.fold?.applied).toBe(log.length);
    expect(state.fold?.state.clock.phase).toBe("turns");
  });

  it("reuses the fold when only `pending` flipped", () => {
    const store = makeStore({ uid: "dm", dm: true });
    const encounter = encounterOf(opening());
    deliver({ kind: "encounter", encounter, pending: true });
    const first = store.getState().fold;

    // A DIFFERENT object with the same content — what `parseEncounter` mints per snapshot.
    deliver(settled(encounterOf(encounter.log)));
    expect(store.getState().fold).toBe(first);
    const snapshot = store.getState().snapshot;
    expect(snapshot?.kind === "encounter" && snapshot.pending).toBe(false);
  });

  it("re-folds when the log grows", () => {
    const store = makeStore({ uid: "dm", dm: true });
    const log = opening();
    deliver(settled(encounterOf(log)));
    const first = store.getState().fold;

    deliver(settled(encounterOf([...log, filler(0)])));
    const second = store.getState().fold;
    expect(second).not.toBe(first);
    expect(second?.applied).toBe(log.length + 1);
  });

  it("re-folds when a checkpoint appears under an unchanged log", () => {
    const store = makeStore({ uid: "dm", dm: true });
    const log = opening();
    deliver(settled(encounterOf(log)));
    const first = store.getState().fold;

    const through = log[2]?.seq;
    if (through === undefined) throw new Error("expected an opening action");
    const checkpointed: Encounter = {
      ...encounterOf(log),
      checkpoint: { through, state: first?.state as never },
    };
    deliver(settled(checkpointed));
    expect(store.getState().fold).not.toBe(first);
  });

  it("clears the fold when the document goes missing and keeps it when one snapshot cannot be read", () => {
    const store = makeStore({ uid: "dm", dm: true });
    deliver(settled(encounterOf(opening())));
    const folded = store.getState().fold;

    deliver({ kind: "quarantined", reason: "malformed" });
    expect(store.getState().fold).toBe(folded);
    expect(store.getState().snapshot?.kind).toBe("quarantined");

    deliver({ kind: "missing" });
    expect(store.getState().fold).toBeNull();
  });

  it("releases the listener on teardown and ignores anything delivered after it", () => {
    const store = makeStore({ uid: "dm", dm: true });
    deliver(settled(encounterOf(opening())));
    teardowns.pop()?.();
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    const before = store.getState().fold;
    deliver({ kind: "missing" });
    expect(store.getState().fold).toBe(before);
  });

  it("opens no second listener while connected, and re-opens one after a teardown", () => {
    const store = makeStore({ uid: "dm", dm: true });
    store.getState().connect();
    expect(unsubscribe).not.toHaveBeenCalled();

    teardowns.pop()?.();
    teardowns.push(store.getState().connect());
    deliver(settled(encounterOf(opening())));
    expect(store.getState().fold).not.toBeNull();
  });
});

describe("the table store's dispatch", () => {
  it("stamps id, seq and by, and appends to the table's own document", async () => {
    const store = makeStore({ uid: "p-marco", dm: false });
    await store.getState().dispatch({
      kind: "declare",
      relation: { kind: "adjacent", a: "marco", b: "ogre-1" },
      remove: false,
      mover: "marco",
    });
    expect(appendAction).toHaveBeenCalledTimes(1);
    const [ref, action] = appendAction.mock.calls[0] as unknown as [string, Action];
    expect(ref).toBe(REF);
    expect(action).toEqual({
      kind: "declare",
      id: "mint-1",
      seq: { ms: 50_001, counter: 0, by: "dm" },
      by: "p-marco",
      relation: { kind: "adjacent", a: "marco", b: "ogre-1" },
      remove: false,
      mover: "marco",
    });
  });

  it("mints a fresh id and a later seq for every dispatch", async () => {
    const store = makeStore({ uid: "dm", dm: true });
    await store.getState().dispatch({ kind: "table", table: { op: "end-turn" } });
    await store.getState().dispatch({ kind: "table", table: { op: "end-turn" } });
    const ids = appendAction.mock.calls.map(
      (call) => (call as unknown as [string, Action])[1].id
    );
    expect(ids).toEqual(["mint-1", "mint-2"]);
  });

  it("appends an undo action carrying the target and the reason", async () => {
    const store = makeStore({ uid: "dm", dm: true });
    await store.getState().undo("a-7", "the DM's last word");
    const [, action] = appendAction.mock.calls[0] as unknown as [string, Action];
    expect(action).toEqual({
      kind: "undo",
      id: "mint-1",
      seq: { ms: 50_001, counter: 0, by: "dm" },
      by: "dm",
      of: "a-7",
      reason: "the DM's last word",
    });
  });

  it("accepts a null undo reason", async () => {
    const store = makeStore({ uid: "dm", dm: true });
    await store.getState().undo("a-7", null);
    const [, action] = appendAction.mock.calls[0] as unknown as [string, Action];
    expect(action).toMatchObject({ kind: "undo", of: "a-7", reason: null });
  });
});

describe("the DM's compaction", () => {
  /** A log long enough for `shouldCompact`, entirely outside the grace window. */
  function overgrown(): Encounter {
    const log = [...opening()];
    for (let i = 0; i < 220; i += 1) log.push(filler(i));
    return encounterOf(log);
  }

  it("checkpoints a settled, overgrown document through the newest action outside the grace window", async () => {
    const store = makeStore({ uid: "dm", dm: true });
    const encounter = overgrown();
    deliver(settled(encounter));
    await Promise.resolve();

    expect(checkpointEncounter).toHaveBeenCalledTimes(1);
    const [db, ref, next, expected] = checkpointEncounter.mock.calls[0] as unknown as [
      unknown,
      string,
      Encounter,
      Seq | null,
    ];
    expect(db).toEqual({});
    expect(ref).toBe(REF);
    expect(expected).toBeNull();
    // The cut is the engine's own, taken against the store's clock and the grace window.
    const expectedThrough = checkpointThrough(encounter, CHECKPOINT_GRACE_MS, 9_000_000);
    expect(next.checkpoint?.through).toEqual(expectedThrough);
    // Everything at or before the cut is folded away; the tail is what the document keeps.
    expect(next.log.length).toBeLessThan(encounter.log.length);
    expect(next.log.every((action) => action.seq.ms > (expectedThrough?.ms ?? 0))).toBe(
      true
    );
    // A compacted document folds to exactly the state the uncompacted one folds to.
    expect(fold(next, catalogue).state).toEqual(store.getState().fold?.state);
  });

  it("uses the engine's grace window against the store's own clock", async () => {
    // `now` sits INSIDE the grace window, so nothing is old enough to compact yet.
    makeStore({ uid: "dm", dm: true }, () => 10_000 + CHECKPOINT_GRACE_MS / 2);
    deliver(settled(overgrown()));
    await Promise.resolve();
    expect(checkpointEncounter).not.toHaveBeenCalled();
  });

  it("never compacts for a player's role", async () => {
    makeStore({ uid: "p-marco", dm: false });
    deliver(settled(overgrown()));
    await Promise.resolve();
    expect(checkpointEncounter).not.toHaveBeenCalled();
  });

  it("never compacts a snapshot that is not settled", async () => {
    makeStore({ uid: "dm", dm: true });
    deliver({ kind: "encounter", encounter: overgrown(), pending: true });
    await Promise.resolve();
    expect(checkpointEncounter).not.toHaveBeenCalled();
  });

  it("never compacts a document that has not outgrown the budget", async () => {
    makeStore({ uid: "dm", dm: true });
    deliver(settled(encounterOf(opening())));
    await Promise.resolve();
    expect(checkpointEncounter).not.toHaveBeenCalled();
  });

  it("holds one compaction at a time", async () => {
    // A holder, not a `let`: TypeScript does not track an assignment made inside a callback,
    // so a plain variable would still be typed `null` at the call below.
    const gate: { release: (() => void) | null } = { release: null };
    checkpointEncounter.mockImplementationOnce(
      () =>
        new Promise<"written" | "stale">((resolve) => {
          gate.release = () => resolve("written");
        })
    );
    makeStore({ uid: "dm", dm: true });
    deliver(settled(overgrown()));
    deliver(settled(encounterOf([...overgrown().log, filler(999)])));
    await Promise.resolve();
    expect(checkpointEncounter).toHaveBeenCalledTimes(1);

    gate.release?.();
    await Promise.resolve();
    await Promise.resolve();
    deliver(settled(encounterOf([...overgrown().log, filler(998)])));
    await Promise.resolve();
    expect(checkpointEncounter).toHaveBeenCalledTimes(2);
  });

  it("survives a rejected compaction and tries again on the next settled snapshot", async () => {
    checkpointEncounter.mockRejectedValueOnce(new Error("permission-denied"));
    makeStore({ uid: "dm", dm: true });
    deliver(settled(overgrown()));
    await Promise.resolve();
    await Promise.resolve();
    deliver(settled(encounterOf([...overgrown().log, filler(997)])));
    await Promise.resolve();
    expect(checkpointEncounter).toHaveBeenCalledTimes(2);
  });
});

describe("liveTableRef", () => {
  it("points at the campaign's one live table", () => {
    expect(liveTableRef({} as Firestore, "camp-1")).toBe(REF);
    expect(LIVE_ENCOUNTER_ID).toBe("live");
  });
});
