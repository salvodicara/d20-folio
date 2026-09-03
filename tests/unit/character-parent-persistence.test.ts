import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "@tests/unit/_helpers";
import { serializeCharacterEnvelope } from "@/lib/character-codec";
import { sessionToCombatState } from "@/lib/combat-state";
import { combatStateWriteData } from "@/lib/combat-state-io";
import { buildPublicCharacterProjection } from "@/lib/public-character-projection";
import { buildCharacterCache } from "@/lib/character-cache";

const harness = vi.hoisted(() => {
  type Operation = {
    kind: "set" | "update" | "delete";
    path: string;
    data: Record<string, unknown>;
  };
  class Timestamp {
    private readonly value: Date;
    constructor(value: Date) {
      this.value = value;
    }
    toDate(): Date {
      return this.value;
    }
  }
  return {
    operations: [] as Operation[],
    commits: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: "snapshot-id" })),
    getDoc: vi.fn(),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteDoc: vi.fn(() => Promise.resolve()),
    rosterSnapshot: null as ((snap: unknown) => void) | null,
    Timestamp,
  };
});

function pathOf(args: unknown[]): string {
  const [first, ...rest] = args as Array<{ path?: string } | string>;
  if (typeof first === "object" && first.path) {
    if (rest.length === 0) return `${first.path}/generated-char`;
    return [first.path, ...rest.map(String)].join("/");
  }
  return args.map(String).join("/");
}

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => ({ path: pathOf(args.slice(1)) }),
  doc: (...args: unknown[]) => ({
    path: pathOf(args.length === 1 ? args : args.slice(1)),
    id: "generated-char",
  }),
  addDoc: harness.addDoc,
  getDoc: harness.getDoc,
  getDocs: vi.fn(() => Promise.resolve({ docs: [], size: 0 })),
  getCountFromServer: vi.fn(),
  updateDoc: harness.updateDoc,
  deleteDoc: harness.deleteDoc,
  onSnapshot: (
    _q: unknown,
    _options: unknown,
    next: (snap: unknown) => void
  ): (() => void) => {
    harness.rosterSnapshot = next;
    return () => {};
  },
  serverTimestamp: () => "server-ts",
  query: vi.fn((value: unknown) => value),
  orderBy: vi.fn(),
  limit: vi.fn(),
  Timestamp: harness.Timestamp,
  writeBatch: () => ({
    set: (ref: { path: string }, data: Record<string, unknown>) =>
      harness.operations.push({ kind: "set", path: ref.path, data }),
    update: (ref: { path: string }, data: Record<string, unknown>) =>
      harness.operations.push({ kind: "update", path: ref.path, data }),
    delete: (ref: { path: string }) =>
      harness.operations.push({ kind: "delete", path: ref.path, data: {} }),
    commit: harness.commits,
  }),
  runTransaction: async (
    _db: unknown,
    callback: (transaction: {
      get: (ref: { path: string }) => Promise<unknown>;
      set: (ref: { path: string }, data: Record<string, unknown>) => void;
      update: (ref: { path: string }, data: Record<string, unknown>) => void;
      delete: (ref: { path: string }) => void;
    }) => Promise<unknown>
  ) =>
    callback({
      get: harness.getDoc,
      set: (ref, data) => harness.operations.push({ kind: "set", path: ref.path, data }),
      update: (ref, data) =>
        harness.operations.push({ kind: "update", path: ref.path, data }),
      delete: (ref) =>
        harness.operations.push({ kind: "delete", path: ref.path, data: {} }),
    }).then((result) => {
      void harness.commits();
      return result;
    }),
}));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ db: { path: "" }, functions: {} }));
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/storage", () => ({
  deletePortrait: vi.fn(() => Promise.resolve()),
  deleteBugReportScreenshot: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/log-persistence", () => ({
  clearLogFromIDB: vi.fn(() => Promise.resolve()),
}));

import { breadcrumbSnapshot, resetDiagnostics } from "@/lib/diagnostics";
import {
  createCharacter,
  createDebouncedSave,
  subscribeToCharacters,
  getFullCharacter,
  getPublicCharacter,
  replaceCharacterState,
  restoreCharacterSnapshot,
  saveStatusCallbacks,
  setCharacterSharing,
  updateCharacter,
} from "@/lib/firestore";

function snapshot(
  id: string,
  data: Record<string, unknown> | null
): {
  id: string;
  exists: () => boolean;
  data: () => Record<string, unknown>;
} {
  return {
    id,
    exists: () => data !== null,
    data: () => data ?? {},
  };
}

function parentData(doc: CharacterDoc): Record<string, unknown> {
  const envelope = serializeCharacterEnvelope(doc);
  return {
    ...envelope,
    state: {},
    cache: buildCharacterCache(doc.character, doc.session),
    revision: doc.revision,
    shared: doc.shared,
    status: "active",
    portraitUrl: null,
    portraitCrop: null,
    createdAt: new harness.Timestamp(new Date("2026-01-01")),
    updatedAt: new harness.Timestamp(doc.updatedAt),
  };
}

beforeEach(() => {
  harness.operations.length = 0;
  harness.commits.mockClear();
  harness.addDoc.mockClear();
  harness.getDoc.mockReset();
  harness.updateDoc.mockClear();
  harness.deleteDoc.mockClear();
});

describe("character parent persistence (v1: the child owns the play session)", () => {
  it("the parent autosave writes an EMPTY state, the cache and the payload's generation", async () => {
    const doc = { ...makeCharacterDoc(), id: "c1", revision: 7 };
    doc.session = {
      ...doc.session,
      spellSlots: { ...doc.session.spellSlots, "1": { used: 2 } },
    };
    const pending = createDebouncedSave("u1", "c1");

    pending.save(doc);
    await pending.flush();

    expect(harness.commits).toHaveBeenCalledTimes(1);
    const parent = harness.operations.find(
      ({ path }) => path === "users/u1/characters/c1"
    );
    expect(parent).toMatchObject({
      kind: "update",
      // The parent writer sends the payload's generation VERBATIM — the subscription
      // hook is the single place that advances it past the observed base.
      data: { state: {}, revision: 7, updatedAt: "server-ts" },
    });
    expect(parent?.data).not.toHaveProperty("playStateVersion");
    // The mutated play session went NOWHERE near the parent: it rides `combat/state`.
    expect(JSON.stringify(parent?.data)).not.toContain("usedSlots");
  });

  it("reports resolve, reject and cancel for the payload each outcome settles", async () => {
    const first = { ...makeCharacterDoc(), id: "c1" };
    const second = { ...first, revision: 1 };
    const outcomes = {
      onResolved: vi.fn(),
      onRejected: vi.fn(),
      onCancelled: vi.fn(),
    };
    const pending = createDebouncedSave("u1", "c1");

    // A second save SUPERSEDES the first: no callback fires for the dropped payload.
    pending.save(first, outcomes);
    pending.save(second, outcomes);
    await pending.flush();
    expect(outcomes.onResolved.mock.calls).toEqual([[second]]);
    expect(outcomes.onCancelled).not.toHaveBeenCalled();

    // `cancel()` reports the payload it actually dropped.
    pending.save(first, outcomes);
    pending.cancel();
    expect(outcomes.onCancelled.mock.calls).toEqual([[first]]);

    harness.commits.mockRejectedValueOnce(new Error("permission-denied"));
    pending.save(second, outcomes);
    await pending.flush();
    expect(outcomes.onRejected).toHaveBeenCalledTimes(1);
    expect(outcomes.onRejected.mock.calls[0]?.[0]).toEqual(second);
  });

  it("allocates the generation AT SEND: a superseded payload consumes none", async () => {
    vi.useFakeTimers();
    try {
      // The hook's allocator: a cursor seeded at the last acknowledged server value.
      let cursor = 4;
      const pending = createDebouncedSave("u1", "c1", 2000, () => ++cursor);
      const base = { ...makeCharacterDoc(), id: "c1" };
      const sent: number[] = [];
      const outcomes = { onSend: (d: CharacterDoc) => sent.push(d.revision) };

      // TWO edits inside ONE debounce window — the ordinary burst path (a composite
      // command fans several subscriber saves through `flushParentPersistence`).
      pending.save({ ...base, character: { ...base.character, quote: "a" } }, outcomes);
      pending.save({ ...base, character: { ...base.character, quote: "b" } }, outcomes);
      await vi.advanceTimersByTimeAsync(2_000);

      // Exactly ONE write, carrying remote + 1 — the superseded payload burned nothing.
      expect(harness.commits).toHaveBeenCalledTimes(1);
      expect(sent).toEqual([5]);
      const first = harness.operations.find(
        ({ path }) => path === "users/u1/characters/c1"
      );
      expect(first?.data).toMatchObject({ revision: 5 });

      // A later edit takes the NEXT generation, not a burned one the rules would deny.
      harness.operations.length = 0;
      pending.save({ ...base, character: { ...base.character, quote: "c" } }, outcomes);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(sent).toEqual([5, 6]);
      expect(
        harness.operations.find(({ path }) => path === "users/u1/characters/c1")?.data
      ).toMatchObject({ revision: 6 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a parent write whose generation is not a non-negative integer", async () => {
    const pending = createDebouncedSave("u1", "c1");
    pending.save({ ...makeCharacterDoc(), id: "c1", revision: -1 });
    await pending.flush();
    expect(harness.commits).not.toHaveBeenCalled();
    expect(harness.operations).toEqual([]);
  });

  it("drops a queued autosave before the level-up whole-state ceremony", async () => {
    const queued = { ...makeCharacterDoc(), id: "c1" };
    queued.session = {
      ...queued.session,
      spellSlots: { ...queued.session.spellSlots, "1": { used: 2 } },
    };
    const pending = createDebouncedSave("u1", "c1");
    const onSaved = vi.fn();
    const previousOnSaved = saveStatusCallbacks.onSaved;
    saveStatusCallbacks.onSaved = onSaved;

    try {
      pending.save(queued);

      await replaceCharacterState(
        "u1",
        "c1",
        queued.character,
        queued.session,
        queued.revision
      );
      await pending.flush();

      expect(harness.commits).toHaveBeenCalledTimes(1);
      expect(harness.operations).toHaveLength(2);
      expect(harness.operations[0]).toMatchObject({
        kind: "update",
        path: "users/u1/characters/c1",
        data: { state: {} },
      });
      expect(harness.operations[0]?.data).not.toHaveProperty("playStateVersion");
      expect(harness.operations[1]).toMatchObject({
        kind: "set",
        path: "users/u1/characters/c1/combat/state",
        data: {
          playState: { version: 1, state: { usedSlots: { "1": 2 } } },
        },
      });
      expect(onSaved).toHaveBeenCalledTimes(1);
    } finally {
      saveStatusCallbacks.onSaved = previousOnSaved;
    }
  });

  it("discards a cancelled pending parent save without a later timer or flush write", async () => {
    vi.useFakeTimers();
    try {
      const full = makeCharacterDoc();
      const pending = createDebouncedSave("u1", "c1");
      pending.save({ ...full, id: "c1" });

      pending.cancel();
      await vi.advanceTimersByTimeAsync(2_000);
      await pending.flush();

      expect(harness.updateDoc).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("atomically refreshes a live public projection with a shared parent autosave", async () => {
    vi.useFakeTimers();
    try {
      const full = { ...makeCharacterDoc(), id: "c1", shared: true };
      const pending = createDebouncedSave("u1", "c1");
      pending.save(full);

      await vi.advanceTimersByTimeAsync(2_000);
      await pending.flush();

      expect(harness.commits).toHaveBeenCalledTimes(1);
      expect(harness.operations).toHaveLength(2);
      expect(harness.operations[0]).toMatchObject({
        kind: "update",
        path: "users/u1/characters/c1",
        data: { updatedAt: "server-ts" },
      });
      expect(harness.operations[1]).toMatchObject({
        kind: "set",
        path: "users/u1/characters/c1/public/sheet",
        data: { publicSchema: 1, sourceUpdatedAt: "server-ts" },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("creates the marked parent and complete child in exactly one batch", async () => {
    const full = makeCharacterDoc();
    full.session = { ...full.session, notes: "fresh", hp: { current: 7, temp: 2 } };

    await expect(createCharacter("u1", full)).resolves.toBe("generated-char");

    expect(harness.commits).toHaveBeenCalledTimes(1);
    expect(harness.addDoc).not.toHaveBeenCalled();
    expect(harness.operations).toHaveLength(2);
    const parent = harness.operations.find(
      ({ path }) => path === "users/u1/characters/generated-char"
    );
    const child = harness.operations.find(
      ({ path }) => path === "users/u1/characters/generated-char/combat/state"
    );
    expect(parent).toMatchObject({
      kind: "set",
      // A character is born at generation 0 (the rules require exactly that on create).
      data: { state: {}, shared: false, revision: 0 },
    });
    expect(parent?.data).not.toHaveProperty("playStateVersion");
    expect(child).toMatchObject({
      kind: "set",
      data: {
        hp: { current: 7, temp: 2 },
        playState: { version: 1, state: { notes: "fresh" } },
      },
    });
  });

  it("restores parent + child atomically and resets non-snapshot action history", async () => {
    const full = makeCharacterDoc();
    full.session = { ...full.session, notes: "restored", hp: { current: 3, temp: 0 } };

    await restoreCharacterSnapshot("u1", "c1", full, 7);

    expect(harness.commits).toHaveBeenCalledTimes(1);
    expect(harness.operations).toHaveLength(2);
    expect(harness.operations[0]).toMatchObject({
      kind: "update",
      path: "users/u1/characters/c1",
      // The whole-state ceremony is a build write: it advances the CAS generation.
      data: { state: {}, revision: 8 },
    });
    expect(harness.operations[1]).toMatchObject({
      kind: "set",
      path: "users/u1/characters/c1/combat/state",
    });
    expect(harness.operations[1]?.data).not.toHaveProperty("actionLifecycles");
  });

  it("hydrates authenticated reads but exposes only the sanitized public projection", async () => {
    const full = makeCharacterDoc();
    const childSession = {
      ...full.session,
      notes: "private play",
      hp: { current: 5, temp: 1 },
    };
    const parent = parentData(full);
    const child = combatStateWriteData(sessionToCombatState(childSession));
    harness.getDoc.mockImplementation((ref: { path: string }) =>
      Promise.resolve(
        ref.path.endsWith("/combat/state")
          ? snapshot("state", child)
          : snapshot("c1", parent)
      )
    );

    const authenticated = await getFullCharacter("u1", "c1");
    expect(authenticated?.session.notes).toBe("private play");
    expect(authenticated?.session.hp).toEqual({ current: 5, temp: 1 });
    expect(harness.getDoc).toHaveBeenCalledTimes(2);

    harness.getDoc.mockClear();
    const publicSource = { ...full, id: "c1", shared: true };
    const projection = await buildPublicCharacterProjection(
      publicSource,
      new harness.Timestamp(new Date("2026-01-02"))
    );
    harness.getDoc.mockResolvedValue(snapshot("sheet", { ...projection }));
    const publicDoc = await getPublicCharacter("u1", "c1");
    expect(harness.getDoc).toHaveBeenCalledTimes(1);
    expect((harness.getDoc.mock.calls[0]?.[0] as { path: string }).path).toBe(
      "users/u1/characters/c1/public/sheet"
    );
    expect(publicDoc?.session.notes).toBe("");
    expect(publicDoc?.session.hp.current).toBeGreaterThan(5);
    expect(publicDoc?.portraitUrl).toBeNull();
  });

  it("fails closed when a private parent is stored at the public path", async () => {
    harness.getDoc.mockResolvedValue(snapshot("c1", parentData(makeCharacterDoc())));
    await expect(getPublicCharacter("u1", "c1")).rejects.toThrow("projection shape");
  });

  it("updates shared metadata and its sanitized projection in one transaction", async () => {
    const full = { ...makeCharacterDoc(), shared: true };
    harness.getDoc.mockResolvedValue(snapshot("c1", parentData(full)));

    await updateCharacter("u1", "c1", { status: "retired" });

    expect(harness.operations).toHaveLength(2);
    expect(harness.operations[0]).toEqual({
      kind: "update",
      path: "users/u1/characters/c1",
      data: { status: "retired", updatedAt: "server-ts" },
    });
    expect(harness.operations[1]).toMatchObject({
      kind: "set",
      path: "users/u1/characters/c1/public/sheet",
      data: {
        publicSchema: 1,
        status: "retired",
        sourceUpdatedAt: "server-ts",
      },
    });
    expect(harness.operations[1]?.data).not.toHaveProperty("state");
    expect(harness.operations[1]?.data).not.toHaveProperty("shared");
  });

  it("publishes and revokes the projection with the parent flag atomically", async () => {
    const full = { ...makeCharacterDoc(), id: "c1", shared: false, revision: 6 };
    harness.getDoc.mockResolvedValue(snapshot("c1", parentData(full)));

    await setCharacterSharing("u1", full, true);
    expect(harness.commits).toHaveBeenCalledTimes(1);
    expect(harness.operations).toHaveLength(2);
    expect(harness.operations[0]).toMatchObject({
      kind: "update",
      path: "users/u1/characters/c1",
      data: {
        shared: true,
        updatedAt: "server-ts",
        schema: 3,
        state: {},
        revision: 7,
      },
    });
    expect(harness.operations[0]?.data).toHaveProperty("build");
    expect(harness.operations[0]?.data).toHaveProperty("cache");
    expect(harness.operations[1]).toMatchObject({
      kind: "set",
      path: "users/u1/characters/c1/public/sheet",
      data: { publicSchema: 1, sourceUpdatedAt: "server-ts" },
    });

    harness.operations.length = 0;
    harness.commits.mockClear();
    harness.getDoc.mockResolvedValue(
      snapshot("c1", { ...parentData(full), shared: true })
    );
    await setCharacterSharing("u1", { ...full, shared: true }, false);
    expect(harness.commits).toHaveBeenCalledTimes(1);
    expect(harness.operations[0]).toMatchObject({
      kind: "update",
      path: "users/u1/characters/c1",
      data: {
        shared: false,
        updatedAt: "server-ts",
        schema: 3,
        state: {},
        revision: 7,
      },
    });
    expect(harness.operations[1]).toEqual({
      kind: "delete",
      path: "users/u1/characters/c1/public/sheet",
      data: {},
    });
  });

  it("refuses to publish a share against a stale generation", async () => {
    const full = { ...makeCharacterDoc(), id: "c1", shared: false, revision: 6 };
    // Another device advanced the parent between the read and the publish.
    harness.getDoc.mockResolvedValue(
      snapshot("c1", { ...parentData(full), revision: 7 })
    );
    await expect(setCharacterSharing("u1", full, true)).rejects.toThrow(
      "Character changed before sharing"
    );
  });

  it("skips a single unreadable roster row instead of blanking the roster", () => {
    resetDiagnostics();
    const good = makeCharacterDoc();
    const rows: Array<{ id: string; data: () => Record<string, unknown> }> = [
      // A pre-migration parent: no `revision` → `readDocMeta` quarantines it.
      {
        id: "stale",
        data: () => {
          const raw = { ...parentData(good) } as Record<string, unknown>;
          delete raw.revision;
          return raw;
        },
      },
      { id: "healthy", data: () => parentData(good) },
    ];
    const received: Array<Array<{ id: string }>> = [];
    const onError = vi.fn();
    subscribeToCharacters("u1", (docs) => received.push(docs), onError);
    if (!harness.rosterSnapshot) throw new Error("roster listener not captured");
    harness.rosterSnapshot({ docs: rows, metadata: { fromCache: false } });

    expect(onError).not.toHaveBeenCalled();
    expect(received.at(-1)?.map((d) => d.id)).toEqual(["healthy"]);
    expect(
      breadcrumbSnapshot().some(
        (crumb) =>
          crumb.event === "roster.quarantine" &&
          String(crumb.data?.message).includes("invalid-revision")
      )
    ).toBe(true);
  });

  it("hydration fails closed on a missing child and on a child without playState", async () => {
    const parent = parentData(makeCharacterDoc());
    const childless = (child: Record<string, unknown> | null) =>
      harness.getDoc.mockImplementation((ref: { path: string }) =>
        Promise.resolve(
          ref.path.endsWith("/combat/state")
            ? snapshot("state", child)
            : snapshot("c1", parent)
        )
      );

    childless(null);
    await expect(getFullCharacter("u1", "c1")).rejects.toThrow("missing-combat-state");

    // A pre-cutover child shape (the combat core with no `playState`) is refused by
    // the strict reader rather than loaded as a session-less character.
    childless({
      hp: { current: 1, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
    });
    await expect(getFullCharacter("u1", "c1")).rejects.toThrow("invalid-v1-play-state");
  });

  it("quarantines a parent that still carries a play session", async () => {
    const stale = { ...parentData(makeCharacterDoc()), state: { notes: "stale" } };
    harness.getDoc.mockImplementation((ref: { path: string }) =>
      Promise.resolve(
        ref.path.endsWith("/combat/state")
          ? snapshot("state", null)
          : snapshot("c1", stale)
      )
    );
    await expect(getFullCharacter("u1", "c1")).rejects.toThrow("parent-state-not-empty");
  });

  it("keeps every play-state and sharing write behind the play-aware boundary", async () => {
    for (const patch of [
      { shared: true },
      { session: makeCharacterDoc().session },
      { ...makeCharacterDoc() },
    ]) {
      await expect(updateCharacter("u1", "c1", patch)).rejects.toThrow(
        "ownership-aware persistence boundary"
      );
    }
    expect(harness.getDoc).not.toHaveBeenCalled();
  });
});
