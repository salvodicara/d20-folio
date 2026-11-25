/**
 * «Whenever you gain a Cleric level, you can replace one of your cantrips with another
 * cantrip of your choice from the Cleric spell list» (SRD 5.2.1; the Druid the same;
 * Bard, Sorcerer and Warlock too). A Cleric or Druid changes its levelled spells on a
 * Long Rest instead, so its level-up never offers the levelled-spell swap.
 */
import { describe, expect, it } from "vitest";

import { levelUpAsks, NO_ANSWERS } from "@/domains/leveling/level-up-asks";
import { makeCharacterDoc } from "./_helpers";

const CANTRIPS: Record<string, string[]> = {
  cleric: ["guidance", "sacred-flame", "thaumaturgy"],
  druid: ["druidcraft", "produce-flame"],
  bard: ["vicious-mockery", "minor-illusion"],
};

const keys = (classId: string) =>
  levelUpAsks(
    makeCharacterDoc({
      classId,
      level: 1,
      spells: [
        ...(CANTRIPS[classId] ?? []).map((srdId) => ({ srdId })),
        { srdId: "bless" },
      ],
    }),
    classId,
    NO_ANSWERS,
    "en"
  ).rows.map((r) => r.key);

describe("the cantrip swap on level-up", () => {
  for (const classId of ["cleric", "druid"]) {
    it(`${classId}: offers to replace a cantrip, never a levelled spell`, () => {
      const k = keys(classId);
      expect(k).toContain("cantripRemove");
      expect(k).not.toContain("swapRemove");
    });
  }

  it("bard: still offers both", () => {
    const k = keys("bard");
    expect(k).toContain("cantripRemove");
    expect(k).toContain("swapRemove");
  });
});
