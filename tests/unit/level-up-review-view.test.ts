/**
 * The level-up «Riepilogo»: what the level changes, read from the character
 * before and the one the commit would save (never a second computation), as
 * numbers that move and the things it gains.
 */
import { describe, expect, it } from "vitest";

import { classTables } from "@/data/classes";

import {
  levelUpReview,
  TABLE_COLUMNS,
  TABLE_USES,
} from "@/domains/leveling/level-up-review-view";
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
    // Proficiency stays +3: no row says so.
    expect(row("pb")).toBeUndefined();
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

  it("a Bard reaching 10: Bardic Inspiration d8 → d10", () => {
    const before = makeCharacterDoc({ classId: "bard", level: 9 });
    const review = levelUpReview(before, commitLevelUp(before, picks("bard")), "it");
    expect(review.numbers).toContainEqual(
      expect.objectContaining({
        kind: "table",
        key: "bardicInspirationDie",
        before: "d8",
        after: "d10",
      })
    );
  });

  it("a Barbarian reaching 3: one more Rage, by the tracker's name", () => {
    const before = makeCharacterDoc({
      classId: "barbarian",
      level: 2,
      features: [{ srdId: "barbarian-rage" }],
    });
    const review = levelUpReview(before, commitLevelUp(before, picks("barbarian")), "en");
    expect(review.numbers).toContainEqual(
      expect.objectContaining({ kind: "resource", before: 2, after: 3 })
    );
  });

  // Every column of every class table that changes at a level shows in the summary,
  // or is a use a class-resource row shows by name.
  for (const table of classTables) {
    it(`${table.id}: every class-table change from 1 to 20 shows`, () => {
      for (let level = 1; level < 20; level++) {
        const was = table.levels.find((l) => l.level === level)?.classSpecific ?? {};
        const now = table.levels.find((l) => l.level === level + 1)?.classSpecific ?? {};
        const changed = Object.keys(now).filter((k) => now[k] !== was[k]);
        if (!changed.length) continue;
        const before = makeCharacterDoc({ classId: table.id, level });
        const ids = levelUpReview(
          before,
          commitLevelUp(before, picks(table.id)),
          "en"
        ).numbers.map((r) => r.id);
        for (const key of changed) {
          expect(
            key in TABLE_COLUMNS || TABLE_USES.has(key),
            `${table.id} ${String(level + 1)} ${key}`
          ).toBe(true);
          if (key in TABLE_COLUMNS) expect(ids).toContain(`table:${table.id}:${key}`);
        }
      }
    });
  }
});
