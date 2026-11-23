/**
 * The SOURCE of «campaigns read» (#1217). The shell's campaigns listener decides when
 * the open sheet's campaigns count as read (`resolvedFor`, which `context-settled` and
 * every campaign-aware action trust). Measured on the emulator (2026-11-23): a reopened
 * page first gets the LOCAL CACHE's copy (`fromCache: true`), which can be stale (a fight
 * started on another device), and the server's answer follows about a quarter second
 * later. So:
 * - online, a cached snapshot is not «read»; the server's answer is;
 * - offline, the cache is all there is, so it is «read» at once;
 * - after `CAMPAIGNS_CONFIRM_MS` (below the actions' own wait) the cached answer counts;
 * - a read error never reads as «no campaigns»: the listener (which Firestore stops for
 *   good after an error) is attached again, a bounded number of times; then the campaigns
 *   stay unread, unless the open character is attached to no campaign (solo play keeps
 *   working).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { CampaignDoc } from "@/types/campaign";

type Meta = { fromCache: boolean };
const h = vi.hoisted(() => {
  const state = {
    campaignsCb: null as null | ((c: CampaignDoc[], meta?: Meta) => void),
    errorCb: null as null | ((err: Error) => void),
  };
  return {
    state,
    subscribeToSharedCampaigns: vi.fn(
      (
        _uid: string,
        cb: (c: CampaignDoc[], meta?: Meta) => void,
        onError?: (err: Error) => void
      ) => {
        state.campaignsCb = cb;
        state.errorCb = onError ?? null;
        return () => {};
      }
    ),
  };
});

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  revokePersistentCombatEffectsBySource: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  subscribeToSharedCampaigns: h.subscribeToSharedCampaigns,
}));
vi.mock("@/features/campaigns/useLiveEncounter", () => ({
  useLiveEncounter: () => null,
}));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));

import { GlobalCombatMount } from "@/features/campaigns/global-combat";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";
import {
  CAMPAIGNS_CONFIRM_MS,
  CAMPAIGNS_READ_ATTEMPTS,
  useCampaignsReadStore,
} from "@/features/campaigns/campaigns-read";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const OPEN = MOCK_CHARACTER.id;
const read = (): boolean => usePartyRosterStore.getState().resolvedFor === OPEN;
let online = true;

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  h.state.campaignsCb = null;
  h.state.errorCb = null;
  h.subscribeToSharedCampaigns.mockClear();
  useAuthStore.setState({ user: { uid: "u1" } as never });
  useCharacterStore.getState().setCharacter(MOCK_CHARACTER);
  usePartyRosterStore.setState({ party: null, resolvedFor: null });
  useCampaignsReadStore.setState({ attachment: null, failed: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mount = (): void => {
  render(<GlobalCombatMount />);
};
const deliver = (meta?: Meta): void => {
  act(() => h.state.campaignsCb?.([], meta));
};
const fail = (): void => {
  act(() => h.state.errorCb?.(new Error("permission-denied")));
};

describe("«campaigns read» waits for the server, never a stale cache (#1217)", () => {
  it("online, a cached snapshot is not read; the server's answer that follows is", () => {
    mount();
    deliver({ fromCache: true });
    expect(read()).toBe(false);
    deliver({ fromCache: false });
    expect(read()).toBe(true);
  });

  it("offline, the cached snapshot is read at once", () => {
    online = false;
    mount();
    deliver({ fromCache: true });
    expect(read()).toBe(true);
  });

  it("the cached answer counts once the confirm deadline passes, and only then", () => {
    mount();
    deliver({ fromCache: true });
    act(() => {
      vi.advanceTimersByTime(CAMPAIGNS_CONFIRM_MS - 1);
    });
    expect(read()).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(read()).toBe(true);
  });

  it("a read error is never «no campaigns»: the listener is attached again", () => {
    mount();
    expect(h.subscribeToSharedCampaigns).toHaveBeenCalledTimes(1);
    fail();
    expect(read()).toBe(false);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(h.subscribeToSharedCampaigns).toHaveBeenCalledTimes(2);
    deliver({ fromCache: false });
    expect(read()).toBe(true);
    expect(useCampaignsReadStore.getState().failed).toBe(false);
  });

  it("after the last attempt fails, an attached character's campaigns stay unread", () => {
    useCampaignsReadStore.setState({ attachment: { characterId: OPEN, attached: true } });
    mount();
    for (let i = 0; i < CAMPAIGNS_READ_ATTEMPTS; i += 1) {
      fail();
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
    }
    expect(h.subscribeToSharedCampaigns).toHaveBeenCalledTimes(CAMPAIGNS_READ_ATTEMPTS);
    expect(read()).toBe(false);
    expect(useCampaignsReadStore.getState().failed).toBe(true);
  });

  it("after the last attempt fails, a character in no campaign plays solo", () => {
    useCampaignsReadStore.setState({
      attachment: { characterId: OPEN, attached: false },
    });
    mount();
    for (let i = 0; i < CAMPAIGNS_READ_ATTEMPTS; i += 1) {
      fail();
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
    }
    expect(read()).toBe(true);
    expect(usePartyRosterStore.getState().party).toBeNull();
  });

  it("the deadline sits below the actions' own wait", async () => {
    const { PARTY_WAIT_MS } = await import("@/features/campaigns/party-roster");
    expect(CAMPAIGNS_CONFIRM_MS).toBeLessThan(PARTY_WAIT_MS);
  });
});
