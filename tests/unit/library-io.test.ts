/**
 * library-io — the homebrew-library Firestore seam (`users/{uid}/library/index`).
 *
 * Two facts, both bug classes this seam exists to prevent:
 *  1. WRITE — the payload goes through `stripUndefined` (domain rule D1). A homebrew
 *     item is almost all optional fields, so an `undefined` reaching Firestore would
 *     throw and silently lose the save.
 *  2. READ — a malformed stored entry is DROPPED, never crashes the surfaces: the
 *     rules validate only authorization + the cap, so shape tolerance lives here.
 *  3. DEBOUNCE — custom IS the library, so per-keystroke sheet edits upsert; the
 *     writer must coalesce a burst into ONE whole-doc write (and flush on teardown).
 *
 * `firebase/firestore` + `@/lib/firebase` are mocked, so no emulator and no API key.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const setDocMock = vi.hoisted(() =>
  vi.fn<(ref: unknown, data: unknown) => Promise<void>>(() => Promise.resolve())
);
const snapshotHandlers = vi.hoisted(
  () => [] as Array<(snap: { exists: () => boolean; data: () => unknown }) => void>
);

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (...path: string[]) => ({ path: path.slice(1).join("/") }),
  setDoc: setDocMock,
  onSnapshot: (
    _ref: unknown,
    next: (snap: { exists: () => boolean; data: () => unknown }) => void
  ) => {
    snapshotHandlers.push(next);
    return () => snapshotHandlers.pop();
  },
}));

import {
  createLibraryWriter,
  libraryRef,
  subscribeLibrary,
  writeLibrary,
} from "@/lib/library-io";
import type { LibraryEntry } from "@/lib/library";

const ENTRY: LibraryEntry = {
  id: "e1",
  savedAt: 1_700_000_000_000,
  kind: "equipment",
  item: { custom: true, name: "Ember Wand", description: undefined },
};

function emit(data: unknown, exists = true): LibraryEntry[] {
  const seen: LibraryEntry[][] = [];
  const unsubscribe = subscribeLibrary("u1", (entries) => seen.push(entries));
  const handler = snapshotHandlers.at(-1);
  expect(handler).toBeDefined();
  handler?.({ exists: () => exists, data: () => data });
  unsubscribe();
  return seen.at(-1) ?? [];
}

describe("library-io", () => {
  it("addresses the ONE per-user document", () => {
    expect(libraryRef("u1").path).toBe("users/u1/library/index");
  });

  it("strips `undefined` out of the written payload (D1)", async () => {
    setDocMock.mockClear();
    await writeLibrary("u1", [ENTRY]);
    const payload = setDocMock.mock.calls.at(-1)?.[1] as {
      entries: Array<{ item: Record<string, unknown> }>;
    };
    expect(Object.keys(payload.entries[0]?.item ?? {})).not.toContain("description");
    expect(JSON.stringify(payload)).not.toContain("undefined");
  });

  it("reads an absent doc as an EMPTY library, not an error", () => {
    expect(emit(undefined, false)).toEqual([]);
  });

  it("drops malformed entries and keeps the good ones", () => {
    const kept = emit({
      entries: [
        ENTRY,
        null,
        "nope",
        { ...ENTRY, id: "" }, // no id
        { ...ENTRY, kind: "potion" }, // unknown kind
        { ...ENTRY, savedAt: "yesterday" }, // non-numeric stamp
        { id: "x", savedAt: 1, kind: "spell" }, // no item
      ],
    });
    expect(kept.map((e) => e.id)).toEqual(["e1"]);
  });

  it("reads a doc with no `entries` field as empty", () => {
    expect(emit({})).toEqual([]);
  });

  it("writes entries as one full-doc overwrite", async () => {
    setDocMock.mockClear();
    await writeLibrary("u1", [ENTRY]);
    const payload = setDocMock.mock.calls.at(-1)?.[1] as {
      entries: unknown[];
    };
    expect(payload.entries).toHaveLength(1);
    expect(payload).not.toHaveProperty("monsterArt");
  });
});

describe("createLibraryWriter — one write per edit burst", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst into ONE write, carrying the LAST list", () => {
    vi.useFakeTimers();
    setDocMock.mockClear();
    const { persist } = createLibraryWriter("u1", 2000);
    persist([ENTRY]);
    persist([ENTRY, { ...ENTRY, id: "e2" }]);
    persist([{ ...ENTRY, id: "e3" }]);
    // Nothing has hit Firestore yet — the store already shows every change.
    vi.advanceTimersByTime(1999);
    expect(setDocMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const payload = setDocMock.mock.calls.at(-1)?.[1] as {
      entries: Array<{ id: string }>;
    };
    expect(payload.entries.map((e) => e.id)).toEqual(["e3"]);
  });

  it("flush() writes the pending list immediately, and is a no-op when nothing pends", () => {
    vi.useFakeTimers();
    setDocMock.mockClear();
    const { persist, flush } = createLibraryWriter("u1", 2000);
    flush();
    expect(setDocMock).not.toHaveBeenCalled();

    persist([ENTRY]);
    flush();
    expect(setDocMock).toHaveBeenCalledTimes(1);

    // The armed timer was cancelled by the flush — no second write later.
    vi.advanceTimersByTime(5000);
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });
});
