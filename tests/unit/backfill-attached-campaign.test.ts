/**
 * backfill-attached-campaign — the pure decision helpers of the one-off pointer
 * backfill (rule 22: the migration's judgment is unit-pinned; the IO wrapper is the
 * standard dry-run/apply admin pattern). Deleted WITH the script once it has run on
 * live data.
 */
import { describe, it, expect } from "vitest";
import {
  attachedRefsOf,
  pointerAction,
  hasAclResidue,
} from "../../scripts/backfill-attached-campaign";

describe("attachedRefsOf — the roster side of the backfill", () => {
  it("collects every member with an attached character; skips the unattached", () => {
    expect(
      attachedRefsOf({
        memberDetails: {
          dm: { characterId: null },
          mara: { characterId: "char-1" },
          bren: { characterId: "char-2" },
        },
      })
    ).toEqual([
      { uid: "mara", charId: "char-1" },
      { uid: "bren", charId: "char-2" },
    ]);
  });

  it("tolerates malformed docs (no memberDetails / junk entries)", () => {
    expect(attachedRefsOf({})).toEqual([]);
    expect(attachedRefsOf({ memberDetails: "junk" })).toEqual([]);
    expect(attachedRefsOf({ memberDetails: { a: 3, b: { characterId: "" } } })).toEqual(
      []
    );
  });
});

describe("pointerAction — set / skip / conflict", () => {
  it("sets an absent or empty pointer", () => {
    expect(pointerAction(undefined, "camp-1")).toBe("set");
    expect(pointerAction(null, "camp-1")).toBe("set");
    expect(pointerAction("", "camp-1")).toBe("set");
  });

  it("skips an already-correct pointer (idempotency gate)", () => {
    expect(pointerAction("camp-1", "camp-1")).toBe("skip");
  });

  it("flags a pointer at ANOTHER campaign as a conflict — never silently rewrites", () => {
    expect(pointerAction("camp-OTHER", "camp-1")).toBe("conflict");
  });
});

describe("hasAclResidue — the dead denormalized ACL fields", () => {
  it("true when either dead field lingers; false when clean", () => {
    expect(hasAclResidue({ dmReaders: [] })).toBe(true);
    expect(hasAclResidue({ campaignReaders: ["x"] })).toBe(true);
    expect(hasAclResidue({ build: {}, attachedCampaignId: "c1" })).toBe(false);
  });
});
