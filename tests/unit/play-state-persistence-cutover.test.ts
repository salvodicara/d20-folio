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
  onSnapshot: vi.fn(),
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

import {
  createCharacter,
  createDebouncedSave,
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
    playStateVersion: 1,
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

describe("play-state v1 persistence cutover", () => {
  it("keeps an unmarked legacy character's spell-slot edit on its parent", async () => {
    const legacy = { ...makeCharacterDoc(), id: "c1", revision: 4 };
    delete legacy.playStateVersion;
    legacy.session = {
      ...legacy.session,
      spellSlots: { ...legacy.session.spellSlots, "1": { used: 2 } },
    };
    const pending = createDebouncedSave("u1", "c1");

    pending.save(legacy);
    await pending.flush();

    expect(harness.commits).toHaveBeenCalledTimes(1);
    const parent = harness.operations.find(
      ({ path }) => path === "users/u1/characters/c1"
    );
    expect(parent).toMatchObject({
      kind: "update",
      // The parent writer sends the payload's generation VERBATIM — the subscription
      // hook is the single place that advances it past the observed base.
      data: { state: { usedSlots: { "1": 2 } }, revision: 4, updatedAt: "server-ts" },
    });
    expect(parent?.data).not.toHaveProperty("playStateVersion");
  });

  it("reports resolve, reject and cancel for the payload each outcome settles", async () => {
    const first = { ...makeCharacterDoc(), id: "c1", playStateVersion: 1 as const };
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

  it("rejects a parent write whose generation is not a non-negative integer", async () => {
    const pending = createDebouncedSave("u1", "c1");
    pending.save({
      ...makeCharacterDoc(),
      id: "c1",
      playStateVersion: 1,
      revision: -1,
    });
    await pending.flush();
    expect(harness.commits).not.toHaveBeenCalled();
    expect(harness.operations).toEqual([]);
  });

  it.each([undefined, null, 2])(
    "rejects a present invalid play-state marker without writing (%s)",
    async (invalidMarker) => {
      const malformed = { ...makeCharacterDoc(), id: "c1" };
      Object.defineProperty(malformed, "playStateVersion", {
        enumerable: true,
        value: invalidMarker,
      });
      const pending = createDebouncedSave("u1", "c1");

      pending.save(malformed);
      await pending.flush();

      expect(harness.commits).not.toHaveBeenCalled();
      expect(harness.operations).toEqual([]);
    }
  );

  it("autosaves an already-shared legacy parent without synthesizing a public projection", async () => {
    const legacy = { ...makeCharacterDoc(), id: "c1", shared: true };
    delete legacy.playStateVersion;
    legacy.session = {
      ...legacy.session,
      spellSlots: { ...legacy.session.spellSlots, "1": { used: 2 } },
    };
    const pending = createDebouncedSave("u1", "c1");

    pending.save(legacy);
    await pending.flush();

    expect(harness.commits).toHaveBeenCalledTimes(1);
    expect(harness.operations).toHaveLength(1);
    expect(harness.operations[0]).toMatchObject({
      kind: "update",
      path: "users/u1/characters/c1",
      data: { state: { usedSlots: { "1": 2 } }, updatedAt: "server-ts" },
    });
  });

  it("drops a queued legacy autosave before the level-up whole-state cutover", async () => {
    const legacy = { ...makeCharacterDoc(), id: "c1" };
    delete legacy.playStateVersion;
    legacy.session = {
      ...legacy.session,
      spellSlots: { ...legacy.session.spellSlots, "1": { used: 2 } },
    };
    const pending = createDebouncedSave("u1", "c1");
    const onSaved = vi.fn();
    const previousOnSaved = saveStatusCallbacks.onSaved;
    saveStatusCallbacks.onSaved = onSaved;

    try {
      pending.save(legacy);

      await replaceCharacterState(
        "u1",
        "c1",
        legacy.character,
        legacy.session,
        legacy.revision
      );
      await pending.flush();

      expect(harness.commits).toHaveBeenCalledTimes(1);
      expect(harness.operations).toHaveLength(2);
      expect(harness.operations[0]).toMatchObject({
        kind: "update",
        path: "users/u1/characters/c1",
        data: { playStateVersion: 1, state: {} },
      });
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
      pending.save({ ...full, id: "c1", playStateVersion: 1 });

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
      const full = {
        ...makeCharacterDoc(),
        id: "c1",
        shared: true,
        playStateVersion: 1 as const,
      };
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
      data: { playStateVersion: 1, state: {}, shared: false, revision: 0 },
    });
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
      data: { playStateVersion: 1, state: {}, revision: 8 },
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
    const publicSource = {
      ...full,
      id: "c1",
      shared: true,
      playStateVersion: 1 as const,
    };
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
    const full = makeCharacterDoc();
    harness.getDoc.mockResolvedValue(
      snapshot("c1", { ...parentData(full), playStateVersion: 2 })
    );
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
    const full = {
      ...makeCharacterDoc(),
      id: "c1",
      shared: false,
      revision: 6,
      playStateVersion: 1 as const,
    };
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
    const full = {
      ...makeCharacterDoc(),
      id: "c1",
      shared: false,
      revision: 6,
      playStateVersion: 1 as const,
    };
    // Another device advanced the parent between the read and the publish.
    harness.getDoc.mockResolvedValue(
      snapshot("c1", { ...parentData(full), revision: 7 })
    );
    await expect(setCharacterSharing("u1", full, true)).rejects.toThrow(
      "Character changed before sharing"
    );
  });

  it("rejects sharing through the generic metadata writer", async () => {
    await expect(updateCharacter("u1", "c1", { shared: true })).rejects.toThrow(
      "ownership-aware persistence boundary"
    );
    expect(harness.getDoc).not.toHaveBeenCalled();
  });

  it("rejects a missing marked child but retains the legacy absent/full-HP contract", async () => {
    const full = makeCharacterDoc();
    const marked = parentData(full);
    harness.getDoc.mockImplementation((ref: { path: string }) =>
      Promise.resolve(
        ref.path.endsWith("/combat/state")
          ? snapshot("state", null)
          : snapshot("c1", marked)
      )
    );
    await expect(getFullCharacter("u1", "c1")).rejects.toThrow("missing-v1-combat-state");

    const envelope = serializeCharacterEnvelope(full);
    harness.getDoc.mockImplementation((ref: { path: string }) =>
      Promise.resolve(
        ref.path.endsWith("/combat/state")
          ? snapshot("state", null)
          : snapshot("c1", {
              ...envelope,
              shared: false,
              revision: 0,
              status: "active",
              createdAt: new harness.Timestamp(new Date("2026-01-01")),
              updatedAt: new harness.Timestamp(new Date("2026-01-02")),
            })
      )
    );
    const legacy = await getFullCharacter("u1", "c1");
    expect(legacy?.playStateVersion).toBeUndefined();
    expect(legacy?.session.hp.current).toBeGreaterThan(0);
  });

  it("rejects an incomplete parent-session write", async () => {
    await expect(
      updateCharacter("u1", "c1", { session: makeCharacterDoc().session })
    ).rejects.toThrow("ownership-aware persistence boundary");
  });

  it("cannot publish the v1 ownership marker as metadata without its child", async () => {
    await expect(updateCharacter("u1", "c1", { playStateVersion: 1 })).rejects.toThrow(
      "ownership-aware persistence boundary"
    );
  });

  it("keeps complete play-state writes behind the ownership-aware autosave", async () => {
    await expect(
      updateCharacter("u1", "c1", {
        ...makeCharacterDoc(),
        playStateVersion: 1,
      })
    ).rejects.toThrow("ownership-aware persistence boundary");
  });
});
