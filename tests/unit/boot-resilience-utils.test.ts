/**
 * Boot-resilience primitives — the 2026-07-09 "Clear site data" incident.
 *
 *  - `withTimeout` — the shared bound behind the portrait read + the campaign
 *    server-confirm read: a promise that never settles must reject (never hang a UI
 *    forever), and one that settles first passes through untouched with the timer torn
 *    down.
 *  - `recoverFromChunkPreloadError` — a wiped precache's failed chunk `import()`
 *    reloads ONCE per session (never loops on a genuinely-missing chunk).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout, TimeoutError } from "@/lib/promise-timeout";
import { recoverFromChunkPreloadError } from "@/lib/chunk-recovery";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("rejects with a TimeoutError when the promise never settles", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<never>(() => {}), 100, "test read");
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it("propagates the underlying rejection (not a timeout)", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow(
      "boom"
    );
  });
});

describe("recoverFromChunkPreloadError", () => {
  function fakeStore(seed: Record<string, string> = {}) {
    const map = new Map(Object.entries(seed));
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
  }

  it("reloads once, arms the one-shot flag, and reports recovery (true)", () => {
    const store = fakeStore();
    const reload = vi.fn();
    expect(recoverFromChunkPreloadError(reload, store)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.getItem("d20-chunk-reload")).toBe("1");
  });

  it("does NOT reload again once the flag is set (no loop) and reports false so the error propagates", () => {
    const store = fakeStore({ "d20-chunk-reload": "1" });
    const reload = vi.fn();
    // `false` tells the caller to skip preventDefault: Vite's default rethrow reaches
    // the ErrorBoundary (a visible crash screen), never a silently-dead route.
    expect(recoverFromChunkPreloadError(reload, store)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
