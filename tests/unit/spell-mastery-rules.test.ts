/**
 * Wizard Spell Mastery (SRD 5.2.1): «Choose a level 1 and a level 2 spell in your
 * spellbook that have a casting time of an action. You always have those spells
 * prepared» — so only Action spells are offered, and the picks are always prepared
 * (they never use a place on the prepared list).
 */
import { describe, expect, it } from "vitest";

import { spellIndex } from "@/data/spells";
import {
  applySpellMasteryPicks,
  eligibleSpellMasteryPicks,
} from "@/lib/spell-mastery-pick";

const book = [
  "magic-missile", // action
  "feather-fall", // reaction
  "alarm", // 1 minute
  "shield", // reaction
  "misty-step", // bonus action
  "hold-person", // action
  "augury", // 1 minute
].map((srdId) => ({ srdId }));

describe("Spell Mastery picks", () => {
  it("offers only spells with a casting time of an action", () => {
    const ids = [1, 2].flatMap((lv) =>
      eligibleSpellMasteryPicks(book, lv as 1 | 2).map((s) => s.id)
    );
    expect(ids.sort()).toEqual(["hold-person", "magic-missile"]);
    for (const id of ids) expect(spellIndex.get(id)?.castingTime).toBe("action");
  });

  it("the picks are always prepared", () => {
    const after = applySpellMasteryPicks(book, {
      level1: "magic-missile",
      level2: "hold-person",
    });
    for (const id of ["magic-missile", "hold-person"]) {
      expect(after.find((s) => "srdId" in s && s.srdId === id)).toMatchObject({
        wizardSpellMastery: true,
        alwaysPrepared: true,
      });
    }
  });
});
