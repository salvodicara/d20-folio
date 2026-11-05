/**
 * The new level-up screen's questions (`levelUpAsks`): for every class at every
 * level, answering each row with its first legal options ends complete, and the
 * commit saves the character one level up. A row is never left without enough
 * options to answer it.
 */
import { describe, expect, it } from "vitest";

import { classTables } from "@/data/classes";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { spellPickRows } from "@/domains/spells/spell-pick-rows";
import { totalLevel } from "@/lib/classes";
import { commitLevelUp } from "@/lib/level-up-commit";
import { makeCharacterDoc } from "./_helpers";

function answerAll(doc: ReturnType<typeof makeCharacterDoc>, classId: string) {
  let a: LevelUpAnswers = NO_ANSWERS;
  // Rows depend on earlier answers (a subclass, a feat): answer until stable.
  for (let pass = 0; pass < 8; pass++) {
    const asks = levelUpAsks(doc, classId, a, "en");
    if (asks.complete) return asks;
    for (const row of asks.rows) {
      if (row.count === 0 || row.picked.length >= row.count) continue;
      for (const o of row.options) {
        const now = levelUpAsks(doc, classId, a, "en").rows.find(
          (r) => r.key === row.key
        );
        if (!now || now.picked.length >= now.count) break;
        if (!now.picked.includes(o.id)) a = toggleAnswer(a, now, o.id);
      }
    }
  }
  return levelUpAsks(doc, classId, a, "en");
}

describe("levelUpAsks", () => {
  for (const table of classTables) {
    it(`${table.id}: every level from 1 to 19 can be answered and saved`, () => {
      let drawn = 0;
      for (let level = 1; level < 20; level++) {
        const doc = makeCharacterDoc({
          classId: table.id,
          level,
          abilityScores: { STR: 14, DEX: 14, CON: 14, INT: 14, WIS: 14, CHA: 14 },
          skills: {
            athletics: "proficient",
            perception: "proficient",
            stealth: "proficient",
          },
        });
        const asks = answerAll(doc, table.id);
        if (!asks.supported) continue;
        drawn++;
        for (const row of asks.rows) {
          expect(
            row.options.length,
            `${table.id} ${level} ${row.key}`
          ).toBeGreaterThanOrEqual(row.count);
        }
        expect(
          asks.complete,
          `${table.id} ${level}: ${asks.rows.map((r) => `${r.key} ${r.picked.length}/${r.count}`).join(", ")}`
        ).toBe(true);
        const saved = commitLevelUp(doc, asks.picks);
        expect(totalLevel(saved.character)).toBe(level + 1);
      }
      // Only Spell Mastery (a Wizard reaching 18) goes to the classic wizard.
      expect(drawn).toBeGreaterThanOrEqual(18);
    });
  }

  it("a Fighter reaching 4 is asked its boon, then the abilities for +2", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 3 });
    const keys = levelUpAsks(doc, "fighter", NO_ANSWERS, "en").rows.map((r) => r.key);
    expect(keys).toEqual(["asiMode", "asiPlusTwo", "weaponMasteries"]);
  });

  it("the masteries asked are only the new ones, saved with the kept ones", () => {
    const doc = makeCharacterDoc({
      classes: [
        {
          classId: "fighter",
          level: 3,
          weaponMasteries: ["longsword", "shortbow", "greataxe"],
        },
      ],
    });
    const asks = levelUpAsks(doc, "fighter", NO_ANSWERS, "en");
    const row = asks.rows.find((r) => r.key === "weaponMasteries");
    if (!row) throw new Error("no mastery row");
    expect(row.count).toBe(1);
    expect(row.options.map((o) => o.id)).not.toContain("longsword");
    const a = toggleAnswer(NO_ANSWERS, row, "flail");
    expect(levelUpAsks(doc, "fighter", a, "en").picks.weaponMasteries).toEqual([
      "longsword",
      "shortbow",
      "greataxe",
      "flail",
    ]);
  });

  it("a swap is optional, but once a spell is forgotten another must replace it", () => {
    const doc = makeCharacterDoc({
      classId: "bard",
      level: 2,
      spells: [{ srdId: "healing-word" }, { srdId: "charm-person" }],
    });
    const start = answerAll(doc, "bard");
    expect(start.complete).toBe(true);
    const forget = start.rows.find((r) => r.key === "swapRemove");
    expect(forget).toBeTruthy();
    // Forgetting without a replacement is not a finished swap.
    let a = NO_ANSWERS;
    for (const row of start.rows)
      for (const id of row.picked) a = toggleAnswer(a, row, id);
    if (!forget) return;
    a = toggleAnswer(a, forget, "charm-person");
    expect(levelUpAsks(doc, "bard", a, "en").complete).toBe(false);
  });

  it("a swap forgets a levelled spell, for another of the same level", () => {
    const doc = makeCharacterDoc({
      classId: "bard",
      level: 4,
      spells: [
        { srdId: "vicious-mockery" },
        { srdId: "healing-word" },
        { srdId: "shatter" },
      ],
    });
    const forget = levelUpAsks(doc, "bard", NO_ANSWERS, "en").rows.find(
      (r) => r.key === "swapRemove"
    );
    expect(forget?.options.map((o) => o.id)).toEqual(["healing-word", "shatter"]);
    if (!forget) return;
    const a = toggleAnswer(NO_ANSWERS, forget, "shatter");
    const learn = levelUpAsks(doc, "bard", a, "en").rows.find(
      (r) => r.key === "swapReplace"
    );
    const levels = new Set(
      spellPickRows(learn?.options.map((o) => o.id) ?? [], "en").map((r) => r.level)
    );
    expect([...levels]).toEqual([2]);
  });
});
