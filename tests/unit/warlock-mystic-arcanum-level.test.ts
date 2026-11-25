/**
 * Warlock Mystic Arcanum (SRD 5.2.1): «Choose one level 6 Warlock spell as this
 * arcanum» at level 11, then level 7 at 13, level 8 at 15 and level 9 at 17 — each
 * arcanum's pick is exactly its level, never a lower one.
 */
import { describe, expect, it } from "vitest";

import { classFeatureIndex, getClassTable } from "@/data/classes";
import { localizeSrd } from "@/i18n/resolver";
import {
  listAvailableForSlot,
  pendingSpellChoicesForFeat,
} from "@/lib/feat-spell-choices";

describe("each Mystic Arcanum offers only its own spell level", () => {
  for (const [id, level] of [
    ["warlock-mystic-arcanum-6th", 6],
    ["warlock-mystic-arcanum-7th", 7],
    ["warlock-mystic-arcanum-8th", 8],
    ["warlock-mystic-arcanum-9th", 9],
  ] as const) {
    it(`${id}: level ${level} Warlock spells only`, () => {
      const feature = classFeatureIndex.get(id);
      if (!feature) throw new Error(`no ${id}`);
      const [slot] = pendingSpellChoicesForFeat(feature);
      if (!slot) throw new Error("no spell slot");
      const levels = new Set(listAvailableForSlot(slot, new Set()).map((s) => s.level));
      expect([...levels]).toEqual([level]);
    });
  }
});

describe("Fiend Spells (SRD 5.2.1, Fiend Patron level 3)", () => {
  it("is a level-3 feature of the Fiend Patron, named in both languages", () => {
    const warlock = getClassTable("warlock");
    const fiend = warlock?.subclasses.find((s) => s.id === "fiend-patron");
    expect(fiend?.featureIds).toContain("warlock-fiend-patron-fiend-spells");
    const feature = classFeatureIndex.get("warlock-fiend-patron-fiend-spells");
    expect(feature).toMatchObject({
      class: "warlock",
      subclass: "fiend-patron",
      level: 3,
    });
    expect(
      localizeSrd("class-feature", "warlock-fiend-patron-fiend-spells", "name", "en")
    ).toBe("Fiend Spells");
    expect(
      localizeSrd("class-feature", "warlock-fiend-patron-fiend-spells", "name", "it")
    ).toBe("Incantesimi Immondi");
  });
});
