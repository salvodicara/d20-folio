/**
 * drop-playerhandle — the one-off live-data purge's PURE per-doc helper. Locks the
 * nested-leaf path builder (which `memberDetails.<uid>.playerHandle` leaves to delete)
 * so a re-run on a clean DB is a no-op and the member entry itself is never targeted.
 *
 * RULE 10: this test is deleted together with `scripts/drop-playerhandle.ts` once the
 * cleanup has run on live data + been verified idempotent.
 */
import { describe, it, expect } from "vitest";
import { playerHandlePaths } from "../../scripts/drop-playerhandle";

describe("drop-playerhandle — playerHandlePaths (nested-leaf path builder)", () => {
  it("targets the nested leaf for each entry that still carries playerHandle", () => {
    expect(
      playerHandlePaths({
        mara: { displayName: "Mara", playerHandle: "Mara the Bold", role: "player" },
        bren: { displayName: "Bren", playerHandle: null, role: "player" },
      })
    ).toEqual(["memberDetails.mara.playerHandle", "memberDetails.bren.playerHandle"]);
  });

  it("is a no-op for already-clean entries (idempotent) — never the member entry itself", () => {
    expect(playerHandlePaths({})).toEqual([]);
    expect(
      playerHandlePaths({
        dm: { displayName: "You", characterId: null, role: "dm" },
      })
    ).toEqual([]);
  });
});
