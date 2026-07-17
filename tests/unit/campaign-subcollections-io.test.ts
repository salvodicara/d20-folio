/**
 * campaign-io chronicle + sessions subcollection helpers — real path (Phase 5 ·
 * Part 2b). dev-bypass=false, so the real Firestore calls fire (mocked). Chronicle
 * is a single doc subscribed in real time through the abstraction; Sessions is a
 * one-shot read + create. The dev-bypass short-circuits live in
 * `campaign-io-devbypass.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChronicleDoc } from "@/types/campaign";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));

const { onSnapshotMock, setDocMock, getDocsMock, unsubSpy, snapNext, FakeTimestamp } =
  vi.hoisted(() => {
    class FakeTimestamp {
      ms: number;
      constructor(ms = 0) {
        this.ms = ms;
      }
      toDate(): Date {
        return new Date(this.ms);
      }
    }
    const snapNext: { fn: ((snap: unknown) => void) | null } = { fn: null };
    const unsubSpy = vi.fn();
    return {
      FakeTimestamp,
      snapNext,
      unsubSpy,
      onSnapshotMock: vi.fn((_ref: unknown, onNext: (snap: unknown) => void) => {
        snapNext.fn = onNext;
        return unsubSpy;
      }),
      setDocMock: vi.fn<(...args: unknown[]) => Promise<void>>(),
      getDocsMock:
        vi.fn<
          () => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>
        >(),
    };
  });

vi.mock("@/lib/firebase", () => ({ db: { __db: true } }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({ __col: true })),
  doc: vi.fn(() => ({ id: "new-id" })),
  getDocs: getDocsMock,
  onSnapshot: onSnapshotMock,
  serverTimestamp: vi.fn(() => ({ __server: true })),
  setDoc: setDocMock,
  query: vi.fn((...args: unknown[]) => ({ __query: args })),
  limit: vi.fn((...args: unknown[]) => ({ __limit: args })),
  orderBy: vi.fn((...args: unknown[]) => ({ __orderBy: args })),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  Timestamp: FakeTimestamp,
}));

import {
  createSession,
  listSessions,
  subscribeToChronicle,
} from "@/features/campaigns/campaign-io";

beforeEach(() => {
  onSnapshotMock.mockClear();
  setDocMock.mockClear();
  getDocsMock.mockClear();
  unsubSpy.mockClear();
  snapNext.fn = null;
});

describe("chronicle io (real path)", () => {
  it("subscribeToChronicle opens one snapshot listener and maps the doc", () => {
    const received: (ChronicleDoc | null)[] = [];
    const unsub = subscribeToChronicle("u1", "c1", (d) => received.push(d));
    expect(onSnapshotMock).toHaveBeenCalledTimes(1);
    snapNext.fn?.({
      exists: () => true,
      data: () => ({
        text: "the story",
        lastEditedBy: "u1",
        lastEditedAt: new FakeTimestamp(),
      }),
    });
    expect(received[0]).toMatchObject({ text: "the story", lastEditedBy: "u1" });
    unsub();
    expect(unsubSpy).toHaveBeenCalled();
  });

  it("delivers null for a missing chronicle (a valid empty state)", () => {
    const received: (ChronicleDoc | null)[] = [];
    subscribeToChronicle("u1", "c1", (d) => received.push(d));
    snapNext.fn?.({ exists: () => false, data: () => ({}) });
    expect(received[0]).toBeNull();
  });
});

describe("sessions io (real path)", () => {
  it("listSessions reads the subcollection and maps + sorts newest-first", async () => {
    getDocsMock.mockResolvedValueOnce({
      docs: [
        { id: "s1", data: () => ({ label: "Session 1", date: new FakeTimestamp(1000) }) },
        { id: "s2", data: () => ({ label: "Session 2", date: new FakeTimestamp(2000) }) },
      ],
    });
    const sessions = await listSessions("c1");
    expect(getDocsMock).toHaveBeenCalledTimes(1);
    expect(sessions.map((s) => s.label)).toEqual(["Session 2", "Session 1"]);
  });

  it("createSession writes a new session and returns its id", async () => {
    const id = await createSession("c1", { label: "Session 3", date: new Date(0) });
    expect(id).toBe("new-id");
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });
});
