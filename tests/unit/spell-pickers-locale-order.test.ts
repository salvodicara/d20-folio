/**
 * Spell pickers list by the name the reader sees: by level, then the localized name
 * with the locale's collator. In Italian «Allarme, Ape Ronzante, Charme su Persone…»,
 * not the English catalogue order (Alarm, Burning Hands, Charm Person… which reads as
 * «Allarme, Mani Brucianti, Ape Ronzante…»).
 */
import { describe, expect, it } from "vitest";

import { prepareList } from "@/domains/play/play-spells-view";
import { learnableSpellVMs } from "@/lib/views/spell-pick-view";
import { makeCharacterDoc } from "./_helpers";
import "@/i18n";

const it_ = new Intl.Collator("it", { sensitivity: "base" });
const sortedIt = (names: readonly string[]) =>
  [...names].sort((a, b) => it_.compare(a, b));

describe("spell pickers in Italian", () => {
  it("the learnable pool: by level, then the Italian name", () => {
    const pool = learnableSpellVMs(
      { classId: "wizard", cantripsOnly: false, maxLevel: 2, exclude: new Set() },
      "it"
    );
    expect(pool.map((s) => s.level)).toEqual([...pool.map((s) => s.level)].sort());
    for (const level of [1, 2]) {
      const names = pool.filter((s) => s.level === level).map((s) => s.name);
      expect(names).toEqual(sortedIt(names));
    }
    // SRD level 1 starts with Allarme in Italian (Alarm); the rest depends on the pack.
    expect(pool[0]?.name).toBe("Allarme");
  });

  it("«Gestisci incantesimi»: each level in Italian name order, whatever the sheet's", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "wizard", level: 3 }],
      spells: ["sleep", "burning-hands", "alarm", "shield", "magic-missile"].map(
        (srdId) => ({ srdId, prepared: true })
      ),
    });
    const names = prepareList(doc, "it")
      .levels.find((g) => g.level === 1)
      ?.spells.map((s) => s.name);
    expect(names).toEqual(sortedIt(names ?? []));
    expect(names?.[0]).toBe("Allarme");
  });
});
