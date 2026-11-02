/**
 * The owner's open sheet collects what waits for it in the party chest: coins into the
 * purse, an item into the bag, a toast saying what arrived. A read-only view collects
 * nothing.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Pickup } from "@/types/campaign";

vi.mock("@/lib/firebase", () => ({}));
let deliverTo: ((pickups: Pickup[]) => void) | null = null;
const collected: string[] = [];
vi.mock("@/features/campaigns/chest-io", () => ({
  subscribeToMyPickups: (_c: string, _u: string, cb: (p: Pickup[]) => void) => {
    deliverTo = cb;
    return () => {};
  },
  collectPickups: async (
    _c: string,
    uid: string,
    waiting: Pickup[],
    deliver: (p: Pickup) => void
  ) => {
    for (const pickup of waiting) {
      if (pickup.ownerUid !== uid || collected.includes(pickup.id)) continue;
      collected.push(pickup.id);
      deliver(pickup);
    }
    return Promise.resolve(collected.length);
  },
}));
vi.mock("@/features/campaigns/refresh-attached-sheets", () => ({
  createAttachedCampaignTracker: () => ({ ensure: () => Promise.resolve(["camp"]) }),
}));

import { useCollectPickups } from "@/features/character/useCollectPickups";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

import { makeCharacterDoc } from "./_helpers";

const share: Pickup = {
  id: "p1",
  ownerUid: "kaela",
  coins: { gp: 33 },
  reason: "share",
  by: "brann",
  at: 1,
};
const potion: Pickup = {
  id: "p2",
  ownerUid: "kaela",
  item: { srdId: "potion-of-healing" },
  quantity: 2,
  reason: "take",
  by: "kaela",
  at: 2,
};

function mount(readonly = false) {
  const doc = makeCharacterDoc({ equipment: [] });
  doc.id = "char-k";
  doc.session.currency = { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 };
  useCharacterStore.setState({ character: doc, readonly, loading: false, error: null });
  useAuthStore.setState({ user: { uid: "kaela" } as never });
  renderHook(() => useCollectPickups("char-k"));
}
const flush = () => act(async () => Promise.resolve());

beforeEach(() => {
  deliverTo = null;
  collected.length = 0;
  useToastStore.setState({ toasts: [], timers: {} });
});

describe("the sheet collects its pickups", () => {
  it("a share lands in the purse and an item in the bag, with a toast", async () => {
    mount();
    await flush();
    await act(async () => {
      deliverTo?.([share, potion]);
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    const doc = useCharacterStore.getState().character;
    expect(doc?.session.currency.gp).toBe(38);
    expect(doc?.character.equipment).toContainEqual({
      srdId: "potion-of-healing",
      quantity: 2,
    });
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((toast) => toast.message)).toEqual([
        "From the party chest: 33 gp, 2 × Potion of Healing",
      ])
    );
  });

  it("a read-only view collects nothing", async () => {
    mount(true);
    await flush();
    await act(async () => {
      deliverTo?.([share]);
      await Promise.resolve();
    });
    expect(collected).toEqual([]);
    expect(useCharacterStore.getState().character?.session.currency.gp).toBe(5);
  });
});
