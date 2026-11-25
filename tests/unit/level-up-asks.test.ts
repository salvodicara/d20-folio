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

  // SRD 5.2.1, Bard / Sorcerer / Warlock: "Whenever you gain a [class] level, you can
  // replace one spell on your list with another [class] spell for which you have
  // spell slots", and, apart, "one of your cantrips with another [class] cantrip".
  const bard = () =>
    makeCharacterDoc({
      classId: "bard",
      level: 4,
      spells: [
        { srdId: "vicious-mockery" },
        { srdId: "healing-word" },
        { srdId: "shatter" },
      ],
    });

  it("a levelled spell is swapped for one of any level the new slots reach", () => {
    const doc = bard();
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
    // A Bard reaching 5 has 3rd-level slots: levels 1 to 3, never a cantrip.
    expect([...levels].sort()).toEqual([1, 2, 3]);
  });

  it("a cantrip is swapped apart, for another cantrip, and saved", () => {
    const doc = bard();
    const forget = levelUpAsks(doc, "bard", NO_ANSWERS, "en").rows.find(
      (r) => r.key === "cantripRemove"
    );
    expect(forget?.options.map((o) => o.id)).toEqual(["vicious-mockery"]);
    if (!forget) return;
    let a = toggleAnswer(NO_ANSWERS, forget, "vicious-mockery");
    const learn = levelUpAsks(doc, "bard", a, "en").rows.find(
      (r) => r.key === "cantripReplace"
    );
    expect(
      new Set(
        spellPickRows(learn?.options.map((o) => o.id) ?? [], "en").map((r) => r.level)
      )
    ).toEqual(new Set([0]));
    if (!learn) return;
    a = toggleAnswer(a, learn, "light");
    // Forgetting without a replacement is not finished; with one it is, and saves.
    expect(levelUpAsks(doc, "bard", toggleAnswer(a, learn, "light"), "en").complete).toBe(
      false
    );
    const ids = commitLevelUp(
      doc,
      levelUpAsks(doc, "bard", a, "en").picks
    ).character.spells.map((s) => ("srdId" in s ? s.srdId : ""));
    expect(ids).toContain("light");
    expect(ids).not.toContain("vicious-mockery");
  });

  it("a Wizard prepares from its list: no swap at level-up", () => {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 4,
      spells: [{ srdId: "fire-bolt" }, { srdId: "magic-missile" }],
    });
    const keys = levelUpAsks(doc, "wizard", NO_ANSWERS, "en").rows.map((r) => r.key);
    expect(keys.filter((k) => /swap|cantripRemove/.test(k))).toEqual([]);
  });
});

describe("level 19: an Epic Boon or another feat (SRD 5.2.1)", () => {
  it("asks the +2/+1/feat choice, and the feats hold the Epic Boons and the general feats", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 18 });
    const first = levelUpAsks(doc, "fighter", NO_ANSWERS, "en");
    const mode = first.rows.find((r) => r.key === "asiMode");
    expect(mode?.options.map((o) => o.id)).toEqual(["plus2", "plus1_1", "feat"]);
    if (!mode) return;
    const asks = levelUpAsks(
      doc,
      "fighter",
      toggleAnswer(NO_ANSWERS, mode, "feat"),
      "en"
    );
    const feats = asks.rows.find((r) => r.key === "feat")?.options.map((o) => o.id) ?? [];
    expect(feats.some((id) => id.startsWith("boon-of-"))).toBe(true);
    expect(feats).toContain("grappler");
  });
});

describe("starting a new class (multiclass) on the new level-up", () => {
  const bard = () =>
    makeCharacterDoc({
      classId: "bard",
      level: 4,
      abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    });

  it("a Rogue 1 is asked its one multiclass skill, then saves as a second class", () => {
    const doc = bard();
    const first = levelUpAsks(doc, "rogue", NO_ANSWERS, "en");
    expect(first.plan.newClassLevel).toBe(1);
    expect(first.rows.find((r) => r.key === "mcSkills")?.count).toBe(1);
    expect(first.complete).toBe(false);
    const done = answerAll(doc, "rogue");
    expect(done.complete).toBe(true);
    const after = commitLevelUp(doc, done.picks);
    expect(after.character.classes.map((e) => [e.classId, e.level])).toEqual([
      ["bard", 4],
      ["rogue", 1],
    ]);
    expect(totalLevel(after.character)).toBe(5);
  });
});

describe("the subclass row previews what the pick brings (BG3's subclass detail)", () => {
  const cleric2 = () =>
    makeCharacterDoc({
      classId: "cleric",
      level: 2,
      abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 10 },
    });

  it("nothing is previewed before a subclass is picked", () => {
    const row = levelUpAsks(cleric2(), "cleric", NO_ANSWERS, "en").rows.find(
      (r) => r.key === "subclass"
    );
    expect(row?.reveal).toBeUndefined();
  });

  it("the picked subclass shows its features at this level and its always-prepared spells", () => {
    const doc = cleric2();
    const row = levelUpAsks(doc, "cleric", NO_ANSWERS, "en").rows.find(
      (r) => r.key === "subclass"
    );
    if (!row) throw new Error("no subclass row");
    const life = row.options.find((o) => o.id === "life-domain");
    if (!life) throw new Error("no Life Domain");
    const a = toggleAnswer(NO_ANSWERS, row, life.id);
    const reveal = levelUpAsks(doc, "cleric", a, "en").rows.find(
      (r) => r.key === "subclass"
    )?.reveal;
    expect(reveal?.features.map((f) => f.id)).toContain("cleric-life-disciple-of-life");
    expect(reveal?.spells).toEqual(["Aid", "Bless", "Cure Wounds", "Lesser Restoration"]);
  });
});
