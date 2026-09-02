import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  diagnosticsLog,
  getDiagnosticsContext,
  resetDiagnostics,
  setDiagnosticsContext,
  type DiagnosticsReport,
} from "@/lib/diagnostics";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({ id: "d1" }),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => "server-ts",
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  deleteDoc: vi.fn(),
}));

// Minimal authStore double — only `getState().user?.uid` and `subscribe` are
// touched by `installDiagnostics()`.
const authState = { user: null as { uid: string } | null };
vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => authState,
    subscribe: () => () => {},
  },
}));

// `installDiagnostics()` lazy-loads the IDB seam via a dynamic import — mocked
// so the interval-gating test controls exactly when it resolves/rejects.
const { loadBreadcrumbsMock, persistBreadcrumbsMock } = vi.hoisted(() => ({
  loadBreadcrumbsMock: vi.fn(() => Promise.resolve(null)),
  persistBreadcrumbsMock: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/diagnostics/idb", () => ({
  loadBreadcrumbs: loadBreadcrumbsMock,
  persistBreadcrumbs: persistBreadcrumbsMock,
}));

import {
  installDiagnostics,
  installDiagnosticsReporter,
  MAX_REPORTS_PER_SESSION,
  MAX_REPORTS_PER_USER_BUILD,
} from "@/lib/diagnostics-io";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

beforeEach(() => {
  resetDiagnostics();
  setDiagnosticsContext({ sessionId: "s", buildSha: "sha1", appVersion: "1", uid: "u1" });
  authState.user = null;
  loadBreadcrumbsMock.mockClear().mockResolvedValue(null);
  persistBreadcrumbsMock.mockClear().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("diagnostics reporter", () => {
  it("writes one report per distinct error-level event", async () => {
    const written: DiagnosticsReport[] = [];
    installDiagnosticsReporter({
      storage: memoryStorage(),
      write: (r) => {
        written.push(r);
        return Promise.resolve();
      },
    });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    diagnosticsLog("error", "character.save-rejected", { message: "permission-denied" });
    await Promise.resolve();
    expect(written.map((r) => r.event)).toEqual([
      "character.quarantine",
      "character.save-rejected",
    ]);
  });

  it("caps writes per session and per user+build, and a failed write never throws", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "d20-folio-diagnostics:u1:sha1",
      String(MAX_REPORTS_PER_USER_BUILD - 1)
    );
    const write = vi.fn(() => Promise.reject(new Error("offline")));
    installDiagnosticsReporter({ storage, write });
    for (let i = 0; i < MAX_REPORTS_PER_SESSION + 5; i++)
      diagnosticsLog("error", `e.${i}`);
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(storage.getItem("d20-folio-diagnostics:u1:sha1")).toBe(
      String(MAX_REPORTS_PER_USER_BUILD)
    );
  });
});

describe("installDiagnostics() — boot safety (rulings 2 & 3)", () => {
  it("never throws when crypto.randomUUID() and localStorage both deny access (private mode)", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("crypto denied");
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem: () => {
        throw new Error("storage denied");
      },
      removeItem: () => {
        throw new Error("storage denied");
      },
    });

    expect(() => installDiagnostics()).not.toThrow();

    const context = getDiagnosticsContext();
    expect(context.sessionId).toBeTruthy();
    expect(context.buildSha).toBeTruthy();
  });

  it("persists breadcrumbs to IndexedDB only when the ring changed since the last flush", async () => {
    vi.useFakeTimers();

    installDiagnostics();
    // Flush the dynamic import(@/lib/diagnostics/idb).then(...) microtask chain
    // that registers the interval — fake timers fake setInterval/setTimeout,
    // never Promise resolution, so real microtask flushes are what's needed here.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Tick 1: the closure's initial "never flushed" sentinel differs from the
    // real (empty) ring, so this first tick may or may not count as a flush.
    await vi.advanceTimersByTimeAsync(1000);
    const afterTick1 = persistBreadcrumbsMock.mock.calls.length;
    expect(afterTick1).toBeLessThanOrEqual(1);

    // A new breadcrumb — the NEXT tick must persist (ring changed).
    diagnosticsLog("debug", "test.crumb");
    await vi.advanceTimersByTimeAsync(1000);
    expect(persistBreadcrumbsMock).toHaveBeenCalledTimes(afterTick1 + 1);

    // Unchanged since — the tick after that must NOT persist again.
    await vi.advanceTimersByTimeAsync(1000);
    expect(persistBreadcrumbsMock).toHaveBeenCalledTimes(afterTick1 + 1);
  });
});
