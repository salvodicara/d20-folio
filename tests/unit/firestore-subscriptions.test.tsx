/**
 * The shared Firestore listener abstraction (see ARCHITECTURE.md) — the
 * free-tier-critical discipline, proven at the seam with a fully-stubbed config
 * (no Firebase). Asserts:
 *   • a listener opens ONLY when both uid AND docId are present, and re-subscribes
 *     when the docId changes (scoped, never enumerable);
 *   • teardown FLUSHES the pending write BEFORE it detaches, and detaches exactly
 *     once — no dangling subscription survives unmount;
 *   • an incoming server snapshot is applied behind the loop guard, so it never
 *     echoes back out as a save; a genuine local change still persists;
 *   • DEV_BYPASS_AUTH opens no real listener;
 *   • createDebouncedWriter coalesces rapid saves + flushes the latest.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mutable dev-bypass flag — exercise both the real-listener and the no-listener
// branches from one file (named-import reads hit the getter each time).
const { devBypass } = vi.hoisted(() => ({ devBypass: { value: false } }));
vi.mock("@/lib/dev-bypass", () => ({
  get DEV_BYPASS_AUTH() {
    return devBypass.value;
  },
}));

import {
  useDocumentSubscription,
  createDebouncedWriter,
  type DocumentSubscriptionConfig,
} from "@/app/_data/firestore-subscriptions";

interface FakeState {
  value: number;
}
interface FakeDoc {
  id: string;
}
interface FakeSave {
  v: number;
}

type FakeConfig = DocumentSubscriptionConfig<FakeDoc, FakeState, FakeSave>;

/** Build an instrumented config + the levers the tests drive. */
function makeHarness(overrides?: Partial<FakeConfig>) {
  const order: string[] = [];
  const saveSpy = vi.fn<(data: FakeSave) => void>();
  const flushSpy = vi.fn<() => Promise<void>>(() => {
    order.push("flush");
    return Promise.resolve();
  });
  const unsubSpy = vi.fn<() => void>(() => {
    order.push("unsub");
  });
  let storeListener: ((s: FakeState, p: FakeState) => void) | null = null;
  let onDataCb: ((doc: FakeDoc | null) => void) | null = null;

  const subscribe = vi.fn<FakeConfig["subscribe"]>((_uid, _docId, onData) => {
    onDataCb = onData;
    return unsubSpy;
  });
  // Applying a snapshot writes to the "store" → fires the autosave listener,
  // letting us prove the loop guard suppresses the resulting save.
  const applySnapshot = vi.fn<FakeConfig["applySnapshot"]>((doc) => {
    storeListener?.({ value: doc ? 1 : 0 }, { value: -1 });
  });
  const reset = vi.fn<() => void>();

  const config: FakeConfig = {
    uid: "u1",
    docId: "d1",
    subscribe,
    createSave: () => ({ save: saveSpy, flush: flushSpy }),
    applySnapshot,
    reset,
    storeSubscribe: (l) => {
      storeListener = l;
      return () => {
        storeListener = null;
      };
    },
    selectSave: (s) => ({ v: s.value }),
    ...overrides,
  };

  return {
    config,
    order,
    saveSpy,
    flushSpy,
    unsubSpy,
    subscribe,
    applySnapshot,
    reset,
    fireSnapshot: (doc: FakeDoc | null) => onDataCb?.(doc),
    fireStore: (s: FakeState, p: FakeState) => storeListener?.(s, p),
  };
}

beforeEach(() => {
  devBypass.value = false;
});
afterEach(() => {
  devBypass.value = false;
  vi.useRealTimers();
});

describe("useDocumentSubscription — §7 listener discipline", () => {
  it("opens NO listener when the uid is absent (and clears the store)", () => {
    const h = makeHarness({ uid: undefined });
    renderHook(() => useDocumentSubscription(h.config));
    expect(h.subscribe).not.toHaveBeenCalled();
    expect(h.reset).toHaveBeenCalled();
  });

  it("opens NO listener when the docId is absent", () => {
    const h = makeHarness({ docId: undefined });
    renderHook(() => useDocumentSubscription(h.config));
    expect(h.subscribe).not.toHaveBeenCalled();
  });

  it("opens exactly one listener for (uid, docId) when both are present", () => {
    const h = makeHarness();
    renderHook(() => useDocumentSubscription(h.config));
    expect(h.subscribe).toHaveBeenCalledTimes(1);
    expect(h.subscribe).toHaveBeenCalledWith(
      "u1",
      "d1",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("re-subscribes (detach old, open new) when the docId changes", () => {
    const h = makeHarness();
    const { rerender } = renderHook(({ cfg }) => useDocumentSubscription(cfg), {
      initialProps: { cfg: h.config },
    });
    expect(h.subscribe).toHaveBeenCalledTimes(1);
    rerender({ cfg: { ...h.config, docId: "d2" } });
    expect(h.unsubSpy).toHaveBeenCalledTimes(1);
    expect(h.subscribe).toHaveBeenCalledTimes(2);
  });

  it("on unmount FLUSHES the pending write BEFORE detaching, exactly once", () => {
    const h = makeHarness();
    const { unmount } = renderHook(() => useDocumentSubscription(h.config));
    unmount();
    expect(h.flushSpy).toHaveBeenCalledTimes(1);
    expect(h.unsubSpy).toHaveBeenCalledTimes(1);
    // Order proves "flush THEN detach" — no edit lost, no dangling listener.
    expect(h.order).toEqual(["flush", "unsub"]);
  });

  it("applies a server snapshot behind the loop guard (no echoed save)", () => {
    const h = makeHarness();
    renderHook(() => useDocumentSubscription(h.config));
    act(() => h.fireSnapshot({ id: "d1" }));
    expect(h.applySnapshot).toHaveBeenCalledWith({ id: "d1" });
    // The snapshot fired the store listener while the guard was up → no save.
    expect(h.saveSpy).not.toHaveBeenCalled();
  });

  it("persists a genuine local change (guard down)", () => {
    const h = makeHarness();
    renderHook(() => useDocumentSubscription(h.config));
    act(() => h.fireStore({ value: 9 }, { value: 0 }));
    expect(h.saveSpy).toHaveBeenCalledTimes(1);
    expect(h.saveSpy).toHaveBeenCalledWith({ v: 9 });
  });

  it("opens NO real listener under dev bypass (calls the dev loader instead)", () => {
    devBypass.value = true;
    const loadDevBypass = vi.fn<() => void>();
    const h = makeHarness({ loadDevBypass });
    renderHook(() => useDocumentSubscription(h.config));
    expect(loadDevBypass).toHaveBeenCalledTimes(1);
    expect(h.subscribe).not.toHaveBeenCalled();
  });
});

describe("createDebouncedWriter", () => {
  it("coalesces rapid saves and writes only the latest payload", async () => {
    vi.useFakeTimers();
    const write = vi.fn<(data: FakeSave) => Promise<void>>(() => Promise.resolve());
    const writer = createDebouncedWriter(write, 100);
    writer.save({ v: 1 });
    writer.save({ v: 2 });
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ v: 2 });
  });

  it("flush() writes the pending payload immediately", async () => {
    vi.useFakeTimers();
    const write = vi.fn<(data: FakeSave) => Promise<void>>(() => Promise.resolve());
    const writer = createDebouncedWriter(write, 1000);
    writer.save({ v: 7 });
    await writer.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ v: 7 });
  });

  it("flush() with nothing pending resolves without writing", async () => {
    const write = vi.fn<(data: FakeSave) => Promise<void>>(() => Promise.resolve());
    const writer = createDebouncedWriter(write, 1000);
    await writer.flush();
    expect(write).not.toHaveBeenCalled();
  });
});
