/**
 * Circle of the Land (SRD 5.2.1): «When you reach a Druid level specified in the
 * table, you thereafter always have the listed spells prepared». The land is chosen
 * at level 3 together with the subclass; its level-3 spells must land on the saved
 * spell list in that same level-up, not one level later.
 */
import { describe, expect, it } from "vitest";

import { levelUpAsks, NO_ANSWERS } from "@/domains/leveling/level-up-asks";
import { commitLevelUp } from "@/lib/level-up-commit";
import { makeCharacterDoc } from "./_helpers";

describe("the land's spells arrive at the level they are chosen", () => {
  it("Druid 2 → 3, Circle of the Land, Arid: Blur, Burning Hands and Fire Bolt are saved", () => {
    const doc = makeCharacterDoc({ classes: [{ classId: "druid", level: 2 }] });
    const picks = {
      ...levelUpAsks(
        doc,
        "druid",
        { ...NO_ANSWERS, subclassId: "circle-of-the-land" },
        "en"
      ).picks,
      bundlePicks: { "druid-land-terrain": "arid" },
    };
    const saved = commitLevelUp(doc, picks);
    const always = saved.character.spells.flatMap((s) =>
      "srdId" in s && s.alwaysPrepared ? [s.srdId] : []
    );
    expect(always).toEqual(
      expect.arrayContaining(["blur", "burning-hands", "fire-bolt"])
    );
    expect(saved.session.grantBundleChoices?.["druid-land-terrain"]).toBe("arid");
  });
});
