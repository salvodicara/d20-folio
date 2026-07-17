/**
 * Regression: `applyNewFeatures` filters subclass-specific features by
 * the character's `subclassId` slug (or a slugified fallback from
 * `subclass`), NOT a `.toLowerCase()` of the locale-bearing display name.
 *
 * **The bug:** the LevelUpModal was writing the locale-bearing display
 * name into `subclass` ("Life Domain" / "Dominio della Vita") and the
 * slug into `subclassId`. The level-up engine's subclass filter compared
 * `f.subclass !== updated.subclass.toLowerCase()` — i.e. "life-domain"
 * (slug, from the SRD data) against "life domain" (display, lowercased).
 * Strings don't match → subclass-specific features (Channel Divinity:
 * Preserve Life, Blessed Healer, Supreme Healing, etc.) were silently
 * SKIPPED at every level-up after L3.
 *
 * The slugify fallback handles legacy documents that still only have the
 * display name (no `subclassId` yet) — same NFKD-strip-diacritics path
 * `sanitizeCharacter` uses on read.
 */
import { describe, expect, it } from "vitest";
import { levelUp } from "@/lib/level-up";
import { makeCharacterDoc } from "./_helpers";

function clericAtL5(opts: { subclass: string; subclassId?: string }) {
  // Build a Cleric just under level 6 so the next-level features include a subclass
  // feature (Life Domain: cleric-life-blessed-healer at L6). R4 — `subclassId` is the
  // id on the entry; when only the display `subclass` is given (a legacy doc), the
  // `class`/`subclass` path is used and `getClasses` resolves the label → its id.
  const char =
    opts.subclassId !== undefined
      ? makeCharacterDoc({
          classes: [{ classId: "cleric", subclassId: opts.subclassId, level: 5 }],
        })
      : makeCharacterDoc({ class: "cleric", subclass: opts.subclass, level: 5 });
  return char.character;
}

describe("applyNewFeatures — subclass-specific feature filter", () => {
  it("adds Life Domain L6 feature when subclassId === 'life-domain'", () => {
    const data = clericAtL5({
      subclass: "Life Domain",
      subclassId: "life-domain",
    });
    const { updatedCharacter } = levelUp(data);
    const featureIds = updatedCharacter.features
      .filter((f): f is { srdId: string } => "srdId" in f)
      .map((f) => f.srdId);
    expect(featureIds).toContain("cleric-life-blessed-healer");
  });

  it("falls back to slugifying `subclass` when subclassId is missing (legacy doc)", () => {
    // Legacy character — has the display name but never had a subclassId
    // field. Slugify "Life Domain" → "life-domain" and proceed.
    const data = clericAtL5({ subclass: "Life Domain" });
    const { updatedCharacter } = levelUp(data);
    const featureIds = updatedCharacter.features
      .filter((f): f is { srdId: string } => "srdId" in f)
      .map((f) => f.srdId);
    expect(featureIds).toContain("cleric-life-blessed-healer");
  });

  it("DOES NOT add features from a different subclass (Knowledge Domain feature on a Life-Domain Cleric)", () => {
    const data = clericAtL5({
      subclass: "Life Domain",
      subclassId: "life-domain",
    });
    const { updatedCharacter } = levelUp(data);
    const featureIds = updatedCharacter.features
      .filter((f): f is { srdId: string } => "srdId" in f)
      .map((f) => f.srdId);
    // A Knowledge Domain L6 feature should NOT appear.
    expect(featureIds.some((id) => id.includes("knowledge"))).toBe(false);
  });
});
