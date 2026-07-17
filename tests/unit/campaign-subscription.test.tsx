/**
 * useCampaignSubscription — proves campaigns route through the shared §7 listener
 * abstraction with mechanics IDENTICAL to the character subscription (this test
 * mirrors `use-character-subscription.test.ts`). The campaign-io boundary is
 * mocked; the REAL campaignStore is used so the snapshot → store → autosave
 * pipeline runs end to end.
 *
 * `vi.mock("@/lib/firebase")` keeps CI Firebase-free AND satisfies the
 * pure-modules CI-safety guard (campaign-io + authStore reach firebase).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { CampaignDoc } from "@/types/campaign";

const { saveSpy, flushSpy, subscribeMock } = vi.hoisted(() => ({
  saveSpy: vi.fn(),
  flushSpy: vi.fn(() => Promise.resolve()),
  subscribeMock: vi.fn<
    (
      uid: string,
      campId: string,
      cb: (d: CampaignDoc | null) => void,
      onError?: (e: Error) => void
    ) => () => void
  >(() => () => {}),
}));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {}, app: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) =>
    sel({ user: { uid: "u1" } }),
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  subscribeToCampaign: subscribeMock,
  createCampaignSave: () => ({ save: saveSpy, flush: flushSpy }),
}));

import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useCampaignSubscription } from "@/features/campaigns/useCampaignSubscription";

function campaign(): CampaignDoc {
  return {
    id: "c1",
    name: "The Starless Keep",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: "u1",
    dmUid: "u1",
    members: ["u1"],
    memberDetails: { u1: { displayName: "Aria", characterId: null, role: "dm" } },
    status: "active",
    inviteCode: "c1",
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
  };
}

/** Latest captured Firestore snapshot callback. */
function snapshotCb(): (d: CampaignDoc | null) => void {
  const cb = subscribeMock.mock.calls.at(-1)?.[2];
  if (!cb) throw new Error("subscription callback not captured");
  return cb;
}

beforeEach(() => {
  saveSpy.mockClear();
  flushSpy.mockClear();
  subscribeMock.mockClear();
  useCampaignStore.setState({ campaign: null, loading: false, error: null });
});

describe("useCampaignSubscription — §7 listener + loop guard", () => {
  it("subscribes for the given campaign", () => {
    renderHook(() => useCampaignSubscription("c1"));
    expect(subscribeMock).toHaveBeenCalledWith(
      "u1",
      "c1",
      expect.any(Function),
      expect.any(Function)
    );
  });

  it("opens NO listener without a campaign id", () => {
    renderHook(() => useCampaignSubscription(undefined));
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("an incoming server snapshot does NOT trigger a save (loop guard)", () => {
    renderHook(() => useCampaignSubscription("c1"));
    act(() => snapshotCb()(campaign()));
    expect(useCampaignStore.getState().campaign?.id).toBe("c1");
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("a local name edit triggers a debounced save of the shared artifacts", () => {
    renderHook(() => useCampaignSubscription("c1"));
    act(() => snapshotCb()(campaign())); // seed from server (no save)
    saveSpy.mockClear();

    act(() => useCampaignStore.getState().setName("Renamed Campaign"));

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const payload = saveSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty("name", "Renamed Campaign");
    // B06 — treasury is NO LONGER debounce-persisted (it corrupted the shared total +
    // dropped ledger rows under concurrency); it now rides the atomic
    // applyTreasuryDelta / undoTreasuryEntry path fired directly from Treasury, so the
    // debounced artifact payload no longer carries treasury / treasuryLog.
    expect(payload).not.toHaveProperty("treasury");
    expect(payload).not.toHaveProperty("treasuryLog");
    // Shared notes are likewise not here (a per-note subcollection written immediately).
    expect(payload).not.toHaveProperty("sharedNotes");
  });

  it("a local treasury edit does NOT trigger the debounced artifact save (B06 — atomic path)", () => {
    renderHook(() => useCampaignSubscription("c1"));
    act(() => snapshotCb()(campaign())); // seed from server (no save)
    saveSpy.mockClear();

    act(() =>
      useCampaignStore.getState().setTreasury({ pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 })
    );

    // Treasury persists atomically (applyTreasuryDelta), never through this last-write-
    // wins debounce — so a treasury store change alone arms NO debounced write.
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("flushes the pending save on unmount (no data loss on quick close)", () => {
    const { unmount } = renderHook(() => useCampaignSubscription("c1"));
    act(() => snapshotCb()(campaign()));
    flushSpy.mockClear();
    unmount();
    expect(flushSpy).toHaveBeenCalled();
  });
});
