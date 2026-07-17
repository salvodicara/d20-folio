/**
 * Regression: `deleteCharacter` must delete every snapshot in the
 * character's subcollection BEFORE deleting the parent document so the
 * snapshots subcollection cannot orphan.
 *
 * **Why this matters:** Firestore does NOT auto-delete subcollections when
 * a document is removed. Before the cascade-delete in commit a8e15cd
 * (2026-05-28) every character deletion left its `snapshots` subcollection
 * behind as a "phantom" — invisible to `listCharacterSnapshots`, invisible
 * via the standard top-level character list, but still consuming Firestore
 * storage and surfacing in admin tooling as "character documents with only
 * a snapshots subcollection." The user reported seeing exactly this in
 * production. The cleanup helper `cleanupOrphanSnapshots` removes the
 * historical leak; this test makes sure no new orphans ever appear by
 * pinning the call ORDER and ensuring snapshots are removed first.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Firebase Firestore module before importing our wrapper so the
// import doesn't try to initialise the real Firebase app.
const calls: string[] = [];
const snapshotRefs = [
  { path: "users/u1/characters/c1/snapshots/s1" },
  { path: "users/u1/characters/c1/snapshots/s2" },
  { path: "users/u1/characters/c1/snapshots/s3" },
];

vi.mock("firebase/firestore", () => {
  return {
    collection: () => ({ _type: "snapshotsCol" }),
    collectionGroup: () => ({ _type: "snapshotsCG" }),
    doc: () => ({ _type: "charDoc", path: "users/u1/characters/c1" }),
    getDocs: vi.fn(() =>
      Promise.resolve({ docs: snapshotRefs.map((r) => ({ ref: { ...r } })) })
    ),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => true, data: () => ({}) })),
    deleteDoc: vi.fn((ref: { path?: string; _type?: string }) => {
      calls.push(`delete ${ref.path ?? ref._type ?? "?"}`);
      return Promise.resolve();
    }),
    addDoc: vi.fn(() => Promise.resolve({ id: "new-id" })),
    updateDoc: vi.fn(() => Promise.resolve()),
    onSnapshot: vi.fn(),
    serverTimestamp: vi.fn(() => "server-ts"),
    query: vi.fn((c: unknown) => c),
    orderBy: vi.fn(),
    Timestamp: {
      now: () => ({ toDate: () => new Date(0) }),
    },
  };
});
vi.mock("@/lib/firebase", () => ({
  db: { _type: "firestore" },
  storage: { _type: "storage" },
}));
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/character-io", () => ({ sanitizeSession: (x: unknown) => x }));
vi.mock("@/lib/sanitize-character", () => ({ sanitizeCharacter: (x: unknown) => x }));
vi.mock("@/lib/storage", () => ({
  deletePortrait: vi.fn(() => {
    calls.push("delete portrait");
    return Promise.resolve();
  }),
}));
vi.mock("@/lib/log-persistence", () => ({
  clearLogFromIDB: vi.fn((charId: string) => {
    calls.push(`clear log ${charId}`);
    return Promise.resolve();
  }),
}));

// Imported after the mocks above. `deleteCharacter` is the PURE engine
// primitive: it owns only the character's own sub-resources (portrait,
// snapshots, doc). Cross-aggregate campaign detach lives one layer up in
// `features/roster/delete-character` — covered by delete-character-cascade.test.
import { deleteCharacter } from "@/lib/firestore";

describe("deleteCharacter — cascade delete (no orphan snapshots)", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("deletes EVERY snapshot before deleting the parent character document", async () => {
    await deleteCharacter("u1", "c1");

    // The parent's path is "users/u1/characters/c1"; snapshot paths are
    // "users/u1/characters/c1/snapshots/...". Find the parent by exact
    // path match (no further segments).
    const parentPath = "users/u1/characters/c1";
    const parentIdx = calls.findIndex((c) => c === `delete ${parentPath}`);
    expect(parentIdx, "parent character document was never deleted").not.toBe(-1);
    for (const r of snapshotRefs) {
      const snapIdx = calls.findIndex((c) => c === `delete ${r.path}`);
      expect(
        snapIdx,
        `snapshot ${r.path} was not deleted (no entry in call log)`
      ).not.toBe(-1);
      expect(
        snapIdx,
        `snapshot ${r.path} was deleted AFTER the parent — would orphan`
      ).toBeLessThan(parentIdx);
    }
  });

  it("calls deleteDoc once per snapshot + once for the parent (plus portrait + log clear)", async () => {
    await deleteCharacter("u1", "c1");
    // N snapshots + 1 parent + 1 portrait + 1 IndexedDB log clear
    expect(calls).toHaveLength(snapshotRefs.length + 3);
  });

  it("clears the per-character IndexedDB action log as part of the cascade (no leak)", async () => {
    await deleteCharacter("u1", "c1");
    // The local log backup is keyed by character id and would survive the doc
    // delete; the cascade must wipe it. It runs LAST (local cleanup, after the
    // remote portrait/snapshots/doc deletes).
    const logIdx = calls.findIndex((c) => c === "clear log c1");
    expect(logIdx, "per-character IndexedDB log was never cleared").not.toBe(-1);
    const parentIdx = calls.findIndex((c) => c === "delete users/u1/characters/c1");
    expect(logIdx).toBeGreaterThan(parentIdx);
  });

  it("deletes the portrait file BEFORE the snapshots (or parent)", async () => {
    await deleteCharacter("u1", "c1");
    const portraitIdx = calls.findIndex((c) => c === "delete portrait");
    const firstSnapshotIdx = calls.findIndex((c) =>
      c.startsWith("delete users/u1/characters/c1/snapshots/")
    );
    const parentIdx = calls.findIndex((c) => c === "delete users/u1/characters/c1");
    expect(portraitIdx, "portrait file was never deleted").not.toBe(-1);
    // Portrait removed first so a Firestore partial failure can't leave
    // an orphan image in Storage.
    expect(portraitIdx).toBeLessThan(firstSnapshotIdx);
    expect(portraitIdx).toBeLessThan(parentIdx);
  });
});
