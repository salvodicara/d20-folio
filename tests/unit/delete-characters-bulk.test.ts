/**
 * deleteCharactersAndDetach — the bulk roster-delete orchestrator (owner 2026-06-07).
 *
 * Proves the cross-aggregate contract for a SELECTION: the shared-campaign list is
 * read ONCE for the whole batch (not per id), every selected character is detached
 * from the campaigns that point at it and then cascade-deleted, failures are isolated
 * (one bad delete never aborts the rest), and the deleted/failed tally is correct.
 *
 * `@/lib/firestore` + `@/features/campaigns/campaign-io` are mocked, so it never
 * touches Firebase (CI-pure).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { deleteCharacterMock, listSharedCampaignsMock, setMemberCharacterMock } =
  vi.hoisted(() => ({
    deleteCharacterMock: vi.fn<(uid: string, id: string) => Promise<void>>(),
    listSharedCampaignsMock: vi.fn(),
    setMemberCharacterMock: vi.fn(() => Promise.resolve()),
  }));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({ deleteCharacter: deleteCharacterMock }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: listSharedCampaignsMock,
  setMemberCharacter: setMemberCharacterMock,
}));

import { deleteCharactersAndDetach } from "@/features/roster/delete-character";

const UID = "u1";

beforeEach(() => {
  deleteCharacterMock.mockReset().mockResolvedValue(undefined);
  setMemberCharacterMock.mockReset().mockResolvedValue(undefined);
  listSharedCampaignsMock.mockReset().mockResolvedValue([]);
});

describe("deleteCharactersAndDetach", () => {
  it("no-ops on an empty selection (no campaign read, no deletes)", async () => {
    const res = await deleteCharactersAndDetach(UID, []);
    expect(res).toEqual({ deleted: 0, failed: 0 });
    expect(listSharedCampaignsMock).not.toHaveBeenCalled();
    expect(deleteCharacterMock).not.toHaveBeenCalled();
  });

  it("reads the campaign list ONCE for the whole batch and deletes each character", async () => {
    listSharedCampaignsMock.mockResolvedValue([]);
    const res = await deleteCharactersAndDetach(UID, ["a", "b", "c"]);
    expect(res).toEqual({ deleted: 3, failed: 0 });
    expect(listSharedCampaignsMock).toHaveBeenCalledTimes(1); // amortized, not per-id
    expect(deleteCharacterMock).toHaveBeenCalledTimes(3);
    expect(deleteCharacterMock).toHaveBeenCalledWith(UID, "a");
    expect(deleteCharacterMock).toHaveBeenCalledWith(UID, "b");
    expect(deleteCharacterMock).toHaveBeenCalledWith(UID, "c");
  });

  it("detaches each character only from the campaigns that point at it", async () => {
    listSharedCampaignsMock.mockResolvedValue([
      { id: "camp-1", memberDetails: { [UID]: { characterId: "a" } } },
      { id: "camp-2", memberDetails: { [UID]: { characterId: "z" } } },
    ]);
    await deleteCharactersAndDetach(UID, ["a", "b"]);
    // "a" is in camp-1 → detached there; "b" is in none → no detach; camp-2 (→ "z")
    // is untouched.
    expect(setMemberCharacterMock).toHaveBeenCalledTimes(1);
    expect(setMemberCharacterMock).toHaveBeenCalledWith("camp-1", UID, null, null);
  });

  it("isolates failures — one bad delete doesn't abort the rest", async () => {
    deleteCharacterMock.mockImplementation((_uid: string, id: string) =>
      id === "b" ? Promise.reject(new Error("boom")) : Promise.resolve()
    );
    const res = await deleteCharactersAndDetach(UID, ["a", "b", "c"]);
    expect(res).toEqual({ deleted: 2, failed: 1 });
    expect(deleteCharacterMock).toHaveBeenCalledTimes(3);
  });

  it("de-duplicates ids", async () => {
    const res = await deleteCharactersAndDetach(UID, ["a", "a", "b"]);
    expect(res).toEqual({ deleted: 2, failed: 0 });
    expect(deleteCharacterMock).toHaveBeenCalledTimes(2);
  });
});
