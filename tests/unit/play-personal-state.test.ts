/**
 * `readServerCombatState` — the write-back reads what the SERVER holds, never the cache.
 *
 * `leaveTable` overwrites `combat/state` whole, so the base it is projected onto has to be the
 * live document. Firestore's first delivery on a fresh listener is normally the offline cache;
 * resolving on it would overwrite the server's document with a base that predates whatever the
 * sheet wrote in between. These cases are the race, driven by a fake listener — it cannot be
 * reproduced by hand, which is exactly why it is pinned here.
 */
import { describe, expect, it, vi } from "vitest";

// The module under test imports only a TYPE from `combat-state-io` (erased at runtime), but the
// guard reads import specifiers, and the specifier is enough to pull the Firebase singleton into
// a CI run that has no env.
vi.mock("@/lib/firebase", () => ({}));
import {
  isServerConfirmed,
  readServerCombatState,
  ServerReadTimeout,
  type SubscribeCombatState,
} from "@/features/play/table/personal-state";
import type { CombatState } from "@/types/combat-state";

function state(hp: number): CombatState {
  return { hp: { current: hp, temp: 0 } } as unknown as CombatState;
}

describe("readServerCombatState", () => {
  it("skips the cached snapshot and resolves with the server's", async () => {
    const stop = vi.fn();
    const subscribe: SubscribeCombatState = (_uid, _id, cb) => {
      // Exactly Firestore's order: the cache first, then the server, with different content.
      cb(state(11), { fromCache: true, hasPendingWrites: false });
      cb(state(38), { fromCache: false, hasPendingWrites: false });
      return stop;
    };
    await expect(readServerCombatState(subscribe, "u", "c")).resolves.toEqual(state(38));
  });

  it("skips a local echo the server has not acknowledged", async () => {
    const subscribe: SubscribeCombatState = (_uid, _id, cb) => {
      cb(state(11), { fromCache: false, hasPendingWrites: true });
      cb(state(38), { fromCache: false, hasPendingWrites: false });
      return () => undefined;
    };
    await expect(readServerCombatState(subscribe, "u", "c")).resolves.toEqual(state(38));
  });

  it("closes the listener once, even when the server answers synchronously", async () => {
    const stop = vi.fn();
    const subscribe: SubscribeCombatState = (_uid, _id, cb) => {
      cb(state(38), { fromCache: false, hasPendingWrites: false });
      return stop;
    };
    await readServerCombatState(subscribe, "u", "c");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("resolves null for a document the server says is absent", async () => {
    const subscribe: SubscribeCombatState = (_uid, _id, cb) => {
      cb(null, { fromCache: false, hasPendingWrites: false });
      return () => undefined;
    };
    await expect(readServerCombatState(subscribe, "u", "c")).resolves.toBeNull();
  });

  it("rejects on a listener error instead of guessing a base", async () => {
    const subscribe: SubscribeCombatState = (_uid, _id, _cb, onError) => {
      onError?.(new Error("permission-denied"));
      return () => undefined;
    };
    await expect(readServerCombatState(subscribe, "u", "c")).rejects.toThrow(
      "permission-denied"
    );
  });

  it("gives up when no server snapshot arrives, and closes its listener", async () => {
    const stop = vi.fn();
    // Offline: the cache answers and the server never does. The old code would have waited
    // for ever, so "Alzati" did nothing and said nothing.
    const subscribe: SubscribeCombatState = (_uid, _id, cb) => {
      cb(state(11), { fromCache: true, hasPendingWrites: false });
      return stop;
    };
    await expect(readServerCombatState(subscribe, "u", "c", 10)).rejects.toBeInstanceOf(
      ServerReadTimeout
    );
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("never falls back to the cached document it was offered", async () => {
    const subscribe: SubscribeCombatState = (_uid, _id, cb) => {
      cb(state(11), { fromCache: true, hasPendingWrites: false });
      return () => undefined;
    };
    // Resolving with 11 would overwrite the server's document with stale numbers and say
    // nothing; rejecting keeps the seat and lets the surface explain.
    await expect(readServerCombatState(subscribe, "u", "c", 10)).rejects.toBeInstanceOf(
      ServerReadTimeout
    );
  });

  it("never treats a cached or pending snapshot as confirmed", () => {
    expect(isServerConfirmed({ fromCache: false, hasPendingWrites: false })).toBe(true);
    expect(isServerConfirmed({ fromCache: true, hasPendingWrites: false })).toBe(false);
    expect(isServerConfirmed({ fromCache: false, hasPendingWrites: true })).toBe(false);
  });
});
