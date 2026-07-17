/**
 * Roster boot-resilience — the 2026-07-09 "Clear site data" incident.
 *
 * After Chrome's "Clear site data" wipes the Firestore IndexedDB cache mid-session,
 * the first roster `onSnapshot` fires from the now-EMPTY cache (`fromCache: true`, zero
 * docs) BEFORE the server answers — and if the SDK is left wedged by the wipe, the
 * server answer may never arrive. The bug: the roster rendered that cache-empty result
 * as the authoritative first-run "create your first character" screen, with no recovery
 * (logout/login re-hit the same empty cache).
 *
 * The fix (`useCharacters`): an empty result that is only `fromCache` is NOT
 * authoritative — the hook keeps `loading` (the FolioLoader, never the onboarding
 * empty state) until a SERVER-confirmed or non-empty snapshot lands, and if none does
 * within the confirm timeout it surfaces the recoverable error state (Retry → reload →
 * fresh Firestore instance). These pin every branch of that state machine.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));

// Capture the roster subscription's callbacks so the test can drive snapshots.
const roster = vi.hoisted(() => ({
  onData: null as ((docs: unknown[], fromCache: boolean) => void) | null,
  onError: null as ((err: Error) => void) | null,
  unsub: vi.fn(),
}));
vi.mock("@/lib/firestore", () => ({
  subscribeToCharacters: vi.fn(
    (
      _uid: string,
      cb: (docs: unknown[], fromCache: boolean) => void,
      onErr?: (err: Error) => void
    ) => {
      roster.onData = cb;
      roster.onError = onErr ?? null;
      return roster.unsub;
    }
  ),
}));
// Combat subdoc listeners are irrelevant here — no-op.
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: vi.fn(() => () => {}),
}));

import { useCharacters } from "@/hooks/useCharacters";
import { useAuthStore } from "@/stores/authStore";
import type { User } from "firebase/auth";

/** Minimal roster doc — the hook only reads `.id` (and passes the rest through). */
function fakeDoc(id: string): { id: string } {
  return { id };
}

/** Pin `navigator.onLine` for a test (jsdom defaults to true). */
function setOnline(value: boolean): void {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}

beforeEach(() => {
  roster.onData = null;
  roster.onError = null;
  roster.unsub.mockClear();
  setOnline(true);
  useAuthStore.setState({ user: { uid: "u1" } as User });
});
afterEach(() => {
  vi.useRealTimers();
  setOnline(true);
  useAuthStore.setState({ user: null });
});

describe("useCharacters — cache-empty is not authoritative", () => {
  it("stays LOADING on an ONLINE empty-from-cache snapshot (never the onboarding empty)", () => {
    const { result } = renderHook(() => useCharacters());
    expect(result.current.loading).toBe(true);
    act(() => roster.onData?.([], /* fromCache */ true));
    // Still loading — an empty cache result is not a real "you have no characters".
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.characters).toHaveLength(0);
  });

  it("settles TRUE-EMPTY on an OFFLINE empty-from-cache snapshot (no error, no eternal loader)", () => {
    // Genuinely offline, the cache IS the best available truth — mirror the campaign
    // path (`listSharedCampaigns` only server-confirms while online).
    vi.useFakeTimers();
    setOnline(false);
    const { result } = renderHook(() => useCharacters());
    act(() => roster.onData?.([], /* fromCache */ true));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.characters).toHaveLength(0);
    // And the confirm timeout must NOT later flip the settled state into an error.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.error).toBeNull();
  });

  it("settles to the TRUE empty state on a server-confirmed empty snapshot", () => {
    const { result } = renderHook(() => useCharacters());
    act(() => roster.onData?.([], true)); // cache limbo
    act(() => roster.onData?.([], /* fromCache */ false)); // server confirms empty
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.characters).toHaveLength(0);
  });

  it("renders a non-empty cache snapshot immediately (offline-first)", () => {
    const { result } = renderHook(() => useCharacters());
    act(() => roster.onData?.([fakeDoc("c1")], /* fromCache */ true));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.characters).toHaveLength(1);
  });

  it("surfaces the recoverable error when no server answer confirms in time", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCharacters());
    act(() => roster.onData?.([], true)); // only ever an empty cache
    expect(result.current.loading).toBe(true);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it("does not error once a server answer has already settled", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCharacters());
    act(() => roster.onData?.([], false)); // server-confirmed empty, settled
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.error).toBeNull();
  });

  it("surfaces a subscription error", () => {
    const { result } = renderHook(() => useCharacters());
    act(() => roster.onError?.(new Error("permission-denied")));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});
