/**
 * #1320 — once the shape gate is closed, no writer sends: the parent saver, the
 * whole-sheet writer (restore, level-up) and the play writer. An old shape must never
 * reach a document a migration has moved on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "@tests/unit/_helpers";

const h = vi.hoisted(() => ({
  commits: 0,
  sets: 0,
  updates: 0,
  lastUpdate: null as Record<string, unknown> | null,
}));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: (...args: unknown[]) => ({ path: args.slice(1).map(String).join("/") }),
  serverTimestamp: () => "server-ts",
  deleteField: () => "delete",
  increment: (by: number) => ({ by }),
  arrayUnion: () => ({}),
  arrayRemove: () => ({}),
  setDoc: () => {
    h.sets += 1;
    return Promise.resolve();
  },
  updateDoc: (_ref: unknown, data: Record<string, unknown>) => {
    h.updates += 1;
    h.lastUpdate = data;
    return Promise.resolve();
  },
  writeBatch: () => ({
    set: () => undefined,
    update: () => undefined,
    delete: () => undefined,
    commit: () => {
      h.commits += 1;
      return Promise.resolve();
    },
  }),
}));
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/dev-bypass", () => ({
  DEV_BYPASS_AUTH: false,
  devBypassEnabled: () => false,
}));
vi.mock("@/lib/storage", () => ({
  deletePortrait: vi.fn(),
  deleteBugReportScreenshot: vi.fn(),
}));
vi.mock("@/lib/log-persistence", () => ({ clearLogFromIDB: vi.fn() }));

import { createDebouncedSave, restoreCharacterSnapshot } from "@/lib/firestore";
import { preloadParentWrite } from "@/lib/parent-write-modules";
import { writeCombatState } from "@/lib/combat-state-io";
import { sessionToCombatState } from "@/lib/combat-state";
import { closeShapeGate, resetShapeGateForTests } from "@/lib/shape-gate";

const doc: CharacterDoc = { ...makeCharacterDoc(), id: "c1", revision: 4 };

beforeEach(async () => {
  resetShapeGateForTests();
  h.commits = 0;
  h.sets = 0;
  h.updates = 0;
  await preloadParentWrite();
});

describe("writers while the shape gate is open", () => {
  it("send as usual (control)", async () => {
    const saver = createDebouncedSave("u1", "c1", 500, () => 5);
    saver.save(doc);
    await saver.flush();
    await writeCombatState("u1", "c1", sessionToCombatState(doc.session));
    expect([h.commits, h.sets]).toEqual([1, 1]);
  });
});

describe("writers once the shape gate is closed", () => {
  it("the parent saver sends nothing and allocates no generation", async () => {
    const allocate = vi.fn(() => 5);
    const saver = createDebouncedSave("u1", "c1", 500, allocate);
    closeShapeGate({ rescue: "none" });
    saver.save(doc);
    await saver.flush();
    expect(h.commits).toBe(0);
    expect(allocate).not.toHaveBeenCalled();
  });

  it("a whole-sheet write (restore, level-up) is refused with a clear error", async () => {
    closeShapeGate({ rescue: "none" });
    await expect(
      restoreCharacterSnapshot("u1", "c1", doc, 4, {
        shared: false,
        status: "active",
        portraitUrl: null,
        portraitCrop: null,
      })
    ).rejects.toThrow(/shape-fenced/);
    expect(h.commits).toBe(0);
  });

  // #1276: a level-up and its undo go through the open sheet's ordered queue. Fenced,
  // it is refused, burns no generation, and keeps the pending edit (the rescue copy's).
  it("a whole-sheet write through the sheet's queue is refused and keeps the pending edit", async () => {
    const allocate = vi.fn(() => 5);
    const cancelled = vi.fn();
    const saver = createDebouncedSave("u1", "c1", 500, allocate);
    saver.save(doc, { onCancelled: cancelled });
    closeShapeGate({ rescue: "none" });
    await expect(
      saver.sendWholeSheet(doc, {
        shared: false,
        status: "active",
        portraitUrl: null,
        portraitCrop: null,
      })
    ).rejects.toThrow(/shape-fenced/);
    expect(h.commits).toBe(0);
    expect(allocate).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("the play writer sends nothing", async () => {
    closeShapeGate({ rescue: "none" });
    await writeCombatState("u1", "c1", sessionToCombatState(doc.session));
    expect(h.sets + h.updates).toBe(0);
  });
});

describe("every play write names its shape (#1320)", () => {
  it("an owner play patch carries playState.version", async () => {
    const before = sessionToCombatState(doc.session);
    const after = { ...before, hp: { ...before.hp, current: before.hp.current - 3 } };
    await writeCombatState("u1", "c1", after, before);
    expect(h.updates).toBe(1);
    expect(h.lastUpdate).toMatchObject({ "playState.version": 1 });
  });
});
