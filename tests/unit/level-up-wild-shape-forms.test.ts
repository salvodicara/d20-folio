/**
 * The new level-up screen asks for the Druid's Wild Shape known forms at the levels
 * the Beast Shapes table raises them (SRD 5.2.1: 4 at Druid 2, 6 at 4, 8 at 8), from
 * the beasts the NEW level allows (Max CR 1/4, 1/2, 1; a Fly Speed from 8). The
 * picks are stored on the character with the level.
 */
import { describe, expect, it } from "vitest";

import { getBeast } from "@/data/beasts";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { commitLevelUp } from "@/lib/level-up-commit";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function druid(level: number, wildShapeForms?: string[]): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "druid", level });
  return wildShapeForms
    ? { ...doc, character: { ...doc.character, wildShapeForms } }
    : doc;
}

const formsRow = (doc: CharacterDoc, a: LevelUpAnswers = NO_ANSWERS, classId = "druid") =>
  levelUpAsks(doc, classId, a, "en").rows.find((r) => r.key === "wildShapeForms");

/** The answers with the first `n` offered forms picked. */
function pickForms(doc: CharacterDoc, n: number): LevelUpAnswers {
  let a = NO_ANSWERS;
  for (let i = 0; i < n; i++) {
    const row = formsRow(doc, a);
    const next = row?.options.find((o) => !row.picked.includes(o.id));
    if (!row || !next) break;
    a = toggleAnswer(a, row, next.id);
  }
  return a;
}

describe("the level-up asks for Wild Shape known forms", () => {
  it("Druid 1 → 2 asks for 4 forms, up to CR 1/4 and none that flies", () => {
    const row = formsRow(druid(1));
    expect(row?.count).toBe(4);
    expect(row?.title).toBe("Choose 4 known forms for Wild Shape");
    const ids = row?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("wolf");
    expect(ids.every((id) => (getBeast(id)?.cr ?? 9) <= 0.25)).toBe(true);
    expect(ids.some((id) => (getBeast(id)?.speeds.fly ?? 0) > 0)).toBe(false);
    expect(row?.options.find((o) => o.id === "wolf")?.label).toBe("Wolf");
  });

  it("Druid 3 with 4 forms → 4 asks for 2 more, the new CR 1/2 beasts among them", () => {
    const row = formsRow(druid(3, ["wolf", "boar", "panther", "giant-badger"]));
    expect(row?.count).toBe(2);
    const ids = row?.options.map((o) => o.id) ?? [];
    expect(ids).toContain("black-bear");
    expect(ids).not.toContain("wolf");
  });

  it("Druid 7 → 8 opens the beasts that fly", () => {
    const ids = formsRow(druid(7))?.options.map((o) => o.id) ?? [];
    expect(ids.some((id) => (getBeast(id)?.speeds.fly ?? 0) > 0)).toBe(true);
  });

  it("a Druid 3 who never chose forms is asked the whole gap at 4 (6)", () => {
    expect(formsRow(druid(3))?.count).toBe(6);
  });

  it("Druid 3 asks nothing: the table adds no form at 3 («Choices to finish» owes the gap)", () => {
    expect(formsRow(druid(2))).toBe(undefined);
  });

  it("no row when the level gives no new form, or for another class", () => {
    expect(
      formsRow(druid(4, ["wolf", "boar", "panther", "giant-badger", "ape", "elk"]))
    ).toBe(undefined);
    expect(
      formsRow(makeCharacterDoc({ classId: "fighter", level: 3 }), NO_ANSWERS, "fighter")
    ).toBe(undefined);
  });

  it("the level is not complete until the forms are picked", () => {
    const doc = druid(1);
    expect(levelUpAsks(doc, "druid", pickForms(doc, 3), "en").complete).toBe(false);
  });

  it("the picked forms are stored with the level", () => {
    const doc = druid(1);
    const asks = levelUpAsks(doc, "druid", pickForms(doc, 4), "en");
    const picked = asks.rows.find((r) => r.key === "wildShapeForms")?.picked ?? [];
    expect(picked).toHaveLength(4);
    const after = commitLevelUp(doc, asks.picks);
    expect(after.character.wildShapeForms).toEqual(picked);
  });

  it("a level-up with no forms asked keeps the known forms", () => {
    const doc = druid(4, ["wolf", "ape"]);
    const asks = levelUpAsks(doc, "druid", NO_ANSWERS, "en");
    expect(commitLevelUp(doc, asks.picks).character.wildShapeForms).toEqual([
      "wolf",
      "ape",
    ]);
  });
});
