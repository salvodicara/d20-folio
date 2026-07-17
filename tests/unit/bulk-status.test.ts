/**
 * setCharactersStatus — the bulk Retire / Restore status fan-out (owner 2026-06-07).
 *
 * Proves: ids are de-duplicated, every id is updated with the target status, failures
 * are isolated (`allSettled` — one bad write never aborts the rest), and the
 * changed/failed tally is correct. `@/lib/firestore` is mocked, so it never touches
 * Firebase (CI-pure).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { updateCharacterMock } = vi.hoisted(() => ({
  updateCharacterMock:
    vi.fn<(uid: string, id: string, patch: { status: string }) => Promise<void>>(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({ updateCharacter: updateCharacterMock }));

import { setCharactersStatus } from "@/features/roster/bulk-status";

const UID = "u1";

beforeEach(() => {
  updateCharacterMock.mockReset().mockResolvedValue(undefined);
});

describe("setCharactersStatus", () => {
  it("no-ops on an empty selection (no writes)", async () => {
    const res = await setCharactersStatus(UID, [], "retired");
    expect(res).toEqual({ changed: 0, failed: 0 });
    expect(updateCharacterMock).not.toHaveBeenCalled();
  });

  it("updates every (de-duplicated) id with the target status", async () => {
    const res = await setCharactersStatus(UID, ["a", "b", "a"], "retired");
    expect(res).toEqual({ changed: 2, failed: 0 });
    expect(updateCharacterMock).toHaveBeenCalledTimes(2);
    expect(updateCharacterMock).toHaveBeenCalledWith(UID, "a", { status: "retired" });
    expect(updateCharacterMock).toHaveBeenCalledWith(UID, "b", { status: "retired" });
  });

  it("isolates failures and reports the changed/failed tally", async () => {
    updateCharacterMock.mockImplementation((_uid, id) =>
      id === "bad" ? Promise.reject(new Error("nope")) : Promise.resolve()
    );
    const res = await setCharactersStatus(UID, ["a", "bad", "c"], "active");
    expect(res).toEqual({ changed: 2, failed: 1 });
  });
});
