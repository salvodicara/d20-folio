/**
 * migrate-shared-notes — the one-off shared-notes migration's PURE per-doc transforms.
 * Locks the discriminator (does this campaign carry a legacy `sharedNotes` array?) and
 * the legacy-note → `notes`-subcollection-doc projection (visible-only, ordering
 * preserved, no `dmOnly` written).
 *
 * RULE 10: this test is deleted together with `scripts/migrate-shared-notes.ts` once the
 * migration has run on live data + been verified idempotent.
 */
import { describe, it, expect } from "vitest";
import { hasLegacyNotes, legacyNoteToNoteDoc } from "../../scripts/migrate-shared-notes";

describe("migrate-shared-notes — hasLegacyNotes (migrate vs skip discriminator)", () => {
  it("TRUE for a campaign carrying a NON-EMPTY legacy sharedNotes array", () => {
    expect(hasLegacyNotes({ sharedNotes: [{ id: "n1" }] })).toBe(true);
  });

  it("FALSE for a migrated/empty/absent array → SKIP (idempotent)", () => {
    expect(hasLegacyNotes({})).toBe(false);
    expect(hasLegacyNotes({ sharedNotes: [] })).toBe(false);
    expect(hasLegacyNotes({ name: "Table", treasuryLog: [] })).toBe(false);
    // A non-array value is not a legacy array.
    expect(hasLegacyNotes({ sharedNotes: "oops" })).toBe(false);
  });
});

describe("migrate-shared-notes — legacyNoteToNoteDoc (notes-subcollection projection)", () => {
  it("projects a legacy note onto the visible notes-doc shape, preserving updatedAt", () => {
    const updatedAt = { __ts: true }; // stand-in for the wire Timestamp (passed through)
    const doc = legacyNoteToNoteDoc({
      id: "note-morweth",
      title: "Morweth the druid",
      content: "Tends a cold flame.",
      pinned: true,
      createdBy: "mock-uid",
      updatedAt,
    });
    // The doc id is the note's own id (carried separately), so it is NOT in the body;
    // every legacy note is VISIBLE, so NO dmOnly is written (visibility = collection).
    expect(doc).toEqual({
      title: "Morweth the druid",
      content: "Tends a cold flame.",
      pinned: true,
      createdBy: "mock-uid",
      updatedAt, // ORIGINAL ordering Timestamp preserved (not reset to now)
    });
    expect(doc).not.toHaveProperty("id");
    expect(doc).not.toHaveProperty("dmOnly");
  });

  it("omits updatedAt when the legacy note lacked it (run-time stamps serverTimestamp) + defaults missing fields", () => {
    const doc = legacyNoteToNoteDoc({ id: "n2" });
    expect(doc).toEqual({ title: "", content: "", pinned: false, createdBy: "" });
    expect("updatedAt" in doc).toBe(false);
  });

  it("never carries the legacy dmOnly flag through (visibility is the collection)", () => {
    // Even if some stray legacy note had a dmOnly flag, the projection drops it — the
    // simplifying fact is that no live note is hidden, so all migrate to `notes`.
    const doc = legacyNoteToNoteDoc({ id: "n3", title: "x", dmOnly: true });
    expect(doc).not.toHaveProperty("dmOnly");
  });
});
