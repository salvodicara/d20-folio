import { describe, it, expect } from "vitest";
import { spells, spellIndex } from "@/data/spells";
import { classFeatures, classTables } from "@/data/classes";
import { getAllBackgroundIds, getBackground } from "@/data/backgrounds";
import { FEATS_BY_ID, SRD_FEATS } from "@/data/feats";

/** Guards against duplicate IDs that silently shadow each other (e.g. the old
 *  hunters-mark / hunter-s-mark pair) and break ref resolution / search. */
describe("SRD data integrity", () => {
  it("has no duplicate spell IDs", () => {
    const ids = spells.map((s) => s.id);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(dupes).toEqual([]);
  });

  it("has no duplicate class-feature IDs", () => {
    const ids = classFeatures.map((f) => f.id);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    expect(dupes).toEqual([]);
  });

  // NOTE: class startingEquipment id-resolution is pinned by the dedicated
  // `starting-equipment-resolves.test.ts` + the table-driven
  // `starting-equipment-facts.test.ts` guard (the single home for that fact —
  // no duplicate walk here).

  // H7 — every spell ID referenced in any subclass's expandedSpells must
  // resolve to a real SRD spell. Catches typos and stale references when
  // the SRD database evolves.
  it("every subclass expandedSpells ID resolves to a real SRD spell", () => {
    const broken: Array<{ class: string; subclass: string; level: number; id: string }> =
      [];
    for (const table of classTables) {
      for (const sub of table.subclasses) {
        const map = sub.expandedSpells;
        if (!map) continue;
        for (const [levelStr, ids] of Object.entries(map)) {
          for (const id of ids) {
            if (!spellIndex.has(id)) {
              broken.push({
                class: table.id,
                subclass: sub.id,
                level: Number(levelStr),
                id,
              });
            }
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });

  // BG-FEAT-REF — every background's Origin feat slug must resolve to a real
  // feat id. Both the background origin-feat resolver (`getBackgroundOriginFeat`)
  // and the creation wizard (character-build) only inject the granted feat when
  // `FEATS_BY_ID.has(bg.feat)`, so an unresolvable slug SILENTLY drops the
  // origin feat in BOTH the import and creation paths with no error. This
  // previously hid two defects: vampire-devotee referenced `vampires-plaything`
  // (real id is `vampire-s-plaything`) and pact-seeker referenced `planar-pact`
  // (a feat CATEGORY, not an id). Asserting id resolution catches both and
  // guards against future regressions.
  describe("background Origin feat references", () => {
    const backgrounds = getAllBackgroundIds()
      .map((id) => getBackground(id))
      .filter((bg): bg is NonNullable<typeof bg> => bg !== undefined);

    it("every background resolves to a real SRD background", () => {
      expect(backgrounds.length).toBe(getAllBackgroundIds().length);
    });

    it.each(backgrounds.map((bg) => ({ id: bg.id, feat: bg.feat })))(
      "background $id grants a non-empty feat slug",
      ({ feat }) => {
        expect(feat.trim().length).toBeGreaterThan(0);
      }
    );

    it.each(backgrounds.map((bg) => ({ id: bg.id, feat: bg.feat })))(
      "background $id feat '$feat' resolves to a real feat id",
      ({ feat }) => {
        // Must be a concrete feat id — NOT a feat category. A category slug
        // (e.g. `planar-pact`) never resolves through FEATS_BY_ID and would
        // silently drop the granted origin feat.
        expect(FEATS_BY_ID.has(feat)).toBe(true);
        // Belt-and-braces: confirm it is genuinely an id and not merely a
        // category that happens to collide with one.
        const isCategoryOnly =
          !SRD_FEATS.some((f) => f.id === feat) &&
          SRD_FEATS.some((f) => f.category === feat);
        expect(isCategoryOnly).toBe(false);
      }
    );
  });

  // SIX-MISSING-SPELLS — moved to the pack suite
  // (`content-pack/tests/unit/srd-integrity.pack.test.ts`): the named-wizard
  // spells are pack content, absent from the SRD-only composition.
});
