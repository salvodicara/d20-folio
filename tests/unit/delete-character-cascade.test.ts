/**
 * Referential integrity (owner-reported): deleting a character must NOT leave a
 * "ghost" hero behind in any shared campaign that referenced it.
 *
 * `deleteCharacterAndDetach` is the feature-layer use-case orchestrator that
 * composes the two aggregates the engine deliberately keeps separate:
 *   1. detach the character from every shared campaign it's assigned to, THEN
 *   2. cascade-delete the character itself (the pure `deleteCharacter` engine
 *      primitive — its own portrait/snapshots/doc).
 *
 * This lives in the feature layer precisely because the engine (`src/lib`) must
 * never import the campaign feature (enforced by
 * `architecture-direction.guard.test.ts`). Here we mock BOTH collaborators and
 * pin the contract: only the right campaigns are detached, detach happens
 * BEFORE the delete, and the delete always runs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

vi.mock("@/lib/firestore", () => ({
  deleteCharacter: vi.fn(() => {
    order.push("deleteCharacter");
    return Promise.resolve();
  }),
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: vi.fn(() => Promise.resolve([])),
  setMemberCharacter: vi.fn(() => {
    order.push("detach");
    return Promise.resolve();
  }),
}));

import { deleteCharacterAndDetach } from "@/features/roster/delete-character";
import { deleteCharacter } from "@/lib/firestore";
import {
  listSharedCampaigns,
  setMemberCharacter,
} from "@/features/campaigns/campaign-io";

describe("deleteCharacterAndDetach — cross-aggregate referential integrity", () => {
  beforeEach(() => {
    order.length = 0;
    vi.mocked(listSharedCampaigns).mockResolvedValue([]);
    vi.mocked(setMemberCharacter).mockClear();
    vi.mocked(deleteCharacter).mockClear();
  });

  it("detaches the character from every shared campaign it's assigned to (and ONLY those)", async () => {
    vi.mocked(listSharedCampaigns).mockResolvedValueOnce([
      { id: "camp-a", memberDetails: { u1: { characterId: "c1" } } }, // assigned → detach
      { id: "camp-b", memberDetails: { u1: { characterId: "other" } } }, // different char → keep
      { id: "camp-c", memberDetails: { u2: { characterId: "c1" } } }, // another member → not ours
    ] as unknown as Awaited<ReturnType<typeof listSharedCampaigns>>);

    await deleteCharacterAndDetach("u1", "c1");

    // Only camp-a (THIS user assigned THIS character) is detached: id + snapshot →
    // null. The character's `dmReaders` ACL needs no cleanup — the doc itself is
    // deleted next, taking the ACL with it.
    expect(setMemberCharacter).toHaveBeenCalledTimes(1);
    expect(setMemberCharacter).toHaveBeenCalledWith("camp-a", "u1", null, null);
  });

  it("detaches BEFORE deleting the character (so a delete failure leaves it recoverable)", async () => {
    vi.mocked(listSharedCampaigns).mockResolvedValueOnce([
      { id: "camp-a", memberDetails: { u1: { characterId: "c1" } } },
    ] as unknown as Awaited<ReturnType<typeof listSharedCampaigns>>);

    await deleteCharacterAndDetach("u1", "c1");

    // Detach runs BEFORE the character delete, so a delete failure leaves it
    // recoverable.
    expect(order.indexOf("detach")).toBeLessThan(order.indexOf("deleteCharacter"));
    expect(order.at(-1)).toBe("deleteCharacter");
  });

  it("still deletes the character (and detaches nothing) when it's in no shared campaign", async () => {
    await deleteCharacterAndDetach("u1", "c1"); // default mock → no shared campaigns

    expect(setMemberCharacter).not.toHaveBeenCalled();
    expect(deleteCharacter).toHaveBeenCalledTimes(1);
    expect(deleteCharacter).toHaveBeenCalledWith("u1", "c1");
  });
});
