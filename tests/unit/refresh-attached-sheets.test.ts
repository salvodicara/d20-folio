/**
 * refresh-attached-sheets — the lite party-snapshot fan-out.
 *
 * Pins the free-tier-safe contract behind the auto-save fan-out:
 *   • the attached-campaign list is resolved with ONE membership-scoped read,
 *     LAZILY (only when a save fires) and MEMOIZED (re-used across saves);
 *   • the fan-out targets ONLY campaigns where THIS character is attached —
 *     never all campaigns, never a peer's attachment;
 *   • each targeted campaign gets its lite party snapshot refreshed (the DM's
 *     full sheet is read live from the owner's real doc via `dmReaders` — no copy
 *     is fanned out anymore);
 *   • it is fire-and-forget — a write failure (offline) never rejects.
 *
 * The campaign-io + member-snapshot collaborators are mocked so the test runs
 * Firebase-free.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterDoc } from "@/types/character";
import type { CampaignDoc } from "@/types/campaign";

const { listMock, setMemberMock, buildSnapshotMock } = vi.hoisted(() => ({
  listMock: vi.fn<() => Promise<unknown[]>>(() => Promise.resolve([])),
  setMemberMock: vi.fn(() => Promise.resolve()),
  buildSnapshotMock: vi.fn(() => ({ name: "Mara" })),
}));

// Cut the Firebase chain (campaign-io → @/lib/firebase) so the test is CI-safe
// even though the collaborators below are fully mocked (the pure-modules guard
// follows the static import graph and wants @/lib/firebase explicitly mocked).
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: listMock,
  setMemberCharacter: setMemberMock,
}));
vi.mock("@/features/campaigns/member-snapshot", () => ({
  buildMemberSnapshot: buildSnapshotMock,
}));

import {
  createAttachedCampaignTracker,
  refreshAttachedSheets,
} from "@/features/campaigns/refresh-attached-sheets";

function campaign(id: string, attachedCharId: string | null): CampaignDoc {
  return {
    id,
    memberDetails: { u1: { characterId: attachedCharId } },
  } as unknown as CampaignDoc;
}

function doc(id = "c1"): CharacterDoc {
  return {
    id,
    character: { name: "Mara" },
    session: { hp: { current: 9 } },
    portraitUrl: null,
    portraitCrop: null,
  } as unknown as CharacterDoc;
}

beforeEach(() => {
  listMock.mockReset().mockResolvedValue([]);
  setMemberMock.mockClear();
  buildSnapshotMock.mockClear();
});

describe("createAttachedCampaignTracker — bounded, lazy, memoized", () => {
  it("resolves only the campaigns where THIS character is attached", async () => {
    listMock.mockResolvedValueOnce([
      campaign("camp-a", "c1"), // attached → target
      campaign("camp-b", "other"), // different char → skip
      campaign("camp-c", null), // nothing attached → skip
    ]);
    const tracker = createAttachedCampaignTracker("u1", "c1");
    expect(await tracker.ensure()).toEqual(["camp-a"]);
  });

  it("reads the campaign list AT MOST ONCE across many saves (memoized)", async () => {
    listMock.mockResolvedValue([campaign("camp-a", "c1")]);
    const tracker = createAttachedCampaignTracker("u1", "c1");
    await tracker.ensure();
    await tracker.ensure();
    await tracker.ensure();
    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it("treats an offline/denied list read as 'no attached campaigns' (never throws)", async () => {
    listMock.mockRejectedValueOnce(new Error("offline"));
    const tracker = createAttachedCampaignTracker("u1", "c1");
    await expect(tracker.ensure()).resolves.toEqual([]);
  });
});

describe("refreshAttachedSheets — the per-save fan-out", () => {
  it("writes the lite snapshot to each attached campaign (and only those)", async () => {
    listMock.mockResolvedValueOnce([
      campaign("camp-a", "c1"),
      campaign("camp-b", "other"),
    ]);
    const tracker = createAttachedCampaignTracker("u1", "c1");

    await refreshAttachedSheets(tracker, "u1", doc("c1"));

    // ONE campaign targeted → one lite-snapshot write (no full-sheet copy anymore).
    expect(setMemberMock).toHaveBeenCalledTimes(1);
    expect(setMemberMock).toHaveBeenCalledWith("camp-a", "u1", "c1", { name: "Mara" });
  });

  it("is a no-op when the character is attached to no campaign (solo player)", async () => {
    listMock.mockResolvedValueOnce([campaign("camp-x", null)]);
    const tracker = createAttachedCampaignTracker("u1", "c1");

    await refreshAttachedSheets(tracker, "u1", doc("c1"));

    expect(setMemberMock).not.toHaveBeenCalled();
  });

  it("resolves even when a fan-out write fails (fire-and-forget — never blocks the save)", async () => {
    listMock.mockResolvedValueOnce([campaign("camp-a", "c1")]);
    setMemberMock.mockRejectedValueOnce(new Error("offline"));
    const tracker = createAttachedCampaignTracker("u1", "c1");

    await expect(
      refreshAttachedSheets(tracker, "u1", doc("c1"))
    ).resolves.toBeUndefined();
  });
});
