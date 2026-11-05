/**
 * The level-up «Riepilogo»: what the level changes, read from the character
 * before and the one the commit would save (never a second computation), as
 * numbers that move and the things it gains.
 */
import { describe, expect, it } from "vitest";

import { levelUpReview } from "@/domains/leveling/level-up-review-view";
import { commitLevelUp, type LevelUpPicks } from "@/lib/level-up-commit";
import { collectChoiceSlots, EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { emptySwapChoice } from "@/lib/spell-swap";
import { makeCharacterDoc } from "./_helpers";

const picks = (classId: string, over: Partial<LevelUpPicks> = {}): LevelUpPicks => ({
  classId,
  asi: null,
  subclassId: null,
  fightingStyle: null,
  expertise: [],
  weaponMasteries: null,
  metamagic: [],
  maneuvers: [],
  invocations: [],
  newCantrips: [],
  newSpells: [],
  choiceSlots: collectChoiceSlots([]),
  choicePicks: EMPTY_CHOICE_PICKS,
  multiclass: null,
  spellMastery: null,
  signatureSpells: null,
  swap: emptySwapChoice(),
  bundlePicks: {},
  ...over,
});

describe("levelUpReview", () => {
  it("a Cleric reaching 6: Hit Points, a third 3rd-level slot, Channel Divinity 3", () => {
    const before = makeCharacterDoc({
      classId: "cleric",
      level: 5,
      features: [{ srdId: "cleric-channel-divinity" }],
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 2 },
      ],
    });
    const after = commitLevelUp(before, picks("cleric"));
    const review = levelUpReview(before, after, "en");
    const row = (id: string) => review.numbers.find((r) => r.id === id);

    expect(row("hp")).toMatchObject({
      before: before.character.hp.max,
      after: after.character.hp.max,
    });
    expect(after.character.hp.max).toBeGreaterThan(before.character.hp.max);
    expect(row("pb")).toMatchObject({ before: 3, after: 3 });
    expect(row("slot:3")).toMatchObject({ kind: "slot", level: 3, before: 2, after: 3 });
    // Unchanged slots are left out.
    expect(row("slot:1")).toBeUndefined();
    expect(
      review.numbers.find((r) => r.kind === "resource" && r.after === 3)
    ).toBeTruthy();
  });

  it("a Fighter reaching 5 gains Extra Attack and a proficiency bonus of 3", () => {
    const before = makeCharacterDoc({ classId: "fighter", level: 4 });
    const after = commitLevelUp(before, picks("fighter"));
    const review = levelUpReview(before, after, "en");
    expect(review.numbers.find((r) => r.id === "pb")).toMatchObject({
      before: 2,
      after: 3,
    });
    expect(review.gained.map((g) => g.name)).toContain("Extra Attack");
  });

  it("names the new spells and invocations it learns", () => {
    const before = makeCharacterDoc({ classId: "warlock", level: 1 });
    const after = commitLevelUp(
      before,
      picks("warlock", { invocations: ["agonizing-blast", "armor-of-shadows"] })
    );
    const gained = levelUpReview(before, after, "en").gained;
    expect(gained).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "invocation", id: "agonizing-blast" }),
        expect.objectContaining({ kind: "invocation", id: "armor-of-shadows" }),
      ])
    );
  });
});
