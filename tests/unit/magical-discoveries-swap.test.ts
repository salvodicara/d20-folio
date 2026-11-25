/**
 * Lore Bard, Magical Discoveries (SRD 5.2.1, level 6): «whenever you gain a Bard
 * level, you can replace one of the spells with another spell that meets these
 * requirements» — a Cleric, Druid or Wizard spell that is a cantrip or of a level
 * the Bard has slots for. The swap is optional, offers only the feature's own
 * picks, and the replacement stays always prepared under the same feature.
 */
import { describe, expect, it } from "vitest";

import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type AskRow,
} from "@/domains/leveling/level-up-asks";
import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { commitLevelUp, type LevelUpPicks } from "@/lib/level-up-commit";
import type { SrdSpellRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const DISCOVERIES = "bard-lore-additional-magical-secrets";
const discovery = (srdId: string): SrdSpellRef => ({
  srdId,
  prepared: true,
  alwaysPrepared: true,
  grantedBy: DISCOVERIES,
});

function bard(level: number, subclassId?: string) {
  return makeCharacterDoc({
    classes: [{ classId: "bard", level, ...(subclassId ? { subclassId } : {}) }],
    hitDieType: 8,
    spells: [
      { srdId: "vicious-mockery" },
      { srdId: "healing-word", prepared: true },
      { srdId: "dissonant-whispers", prepared: true },
      // One pick a cantrip, one levelled: both can be replaced.
      discovery("guidance"),
      discovery("fireball"),
      // Always prepared too, but from another source: never offered here.
      {
        srdId: "bless",
        prepared: true,
        alwaysPrepared: true,
        grantedBy: "magic-initiate-cleric",
      },
      { srdId: "detect-magic", prepared: true, alwaysPrepared: true },
    ],
  });
}

const rowOf = (rows: readonly AskRow[], key: string) => rows.find((r) => r.key === key);

describe("Magical Discoveries swap on the new level-up screen", () => {
  it("a Lore Bard reaching 10 may replace one of its two picks, within its slots", () => {
    const doc = bard(9, "college-of-lore");
    const forget = rowOf(
      levelUpAsks(doc, "bard", NO_ANSWERS, "en").rows,
      "discoveryRemove"
    );
    expect(forget?.count).toBe(0);
    expect(forget?.options.map((o) => o.id).sort()).toEqual(["fireball", "guidance"]);
    if (!forget) return;
    const a = toggleAnswer(NO_ANSWERS, forget, "fireball");
    const learn = rowOf(levelUpAsks(doc, "bard", a, "en").rows, "discoveryReplace");
    const ids = new Set(learn?.options.map((o) => o.id));
    // Bard 10 has 5th-level slots: a 5th-level Wizard spell yes, a 6th no.
    expect(ids.has("cone-of-cold")).toBe(true);
    expect(ids.has("chain-lightning")).toBe(false);
    // A cantrip from the lists is allowed.
    expect(ids.has("sacred-flame")).toBe(true);
    // A Bard-only spell is not on Cleric, Druid or Wizard lists.
    expect(ids.has("compulsion")).toBe(false);
    // Never a spell already on the sheet.
    expect(ids.has("healing-word")).toBe(false);
    expect(ids.has("guidance")).toBe(false);
  });

  it("is optional: half done is not complete, skipped or finished is", () => {
    const doc = bard(9, "college-of-lore");
    const base = levelUpAsks(doc, "bard", NO_ANSWERS, "en");
    const forget = rowOf(base.rows, "discoveryRemove");
    if (!forget) throw new Error("no discoveryRemove row");
    // The rest of the level answered by its first options.
    let a = NO_ANSWERS;
    for (const row of base.rows) {
      if (row.count === 0) continue;
      for (const o of row.options.slice(0, row.count)) a = toggleAnswer(a, row, o.id);
    }
    expect(levelUpAsks(doc, "bard", a, "en").complete).toBe(true);
    a = toggleAnswer(a, forget, "fireball");
    expect(levelUpAsks(doc, "bard", a, "en").complete).toBe(false);
    const learn = rowOf(levelUpAsks(doc, "bard", a, "en").rows, "discoveryReplace");
    if (!learn) throw new Error("no discoveryReplace row");
    a = toggleAnswer(a, learn, "cone-of-cold");
    const asks = levelUpAsks(doc, "bard", a, "en");
    expect(asks.complete).toBe(true);
    const saved = commitLevelUp(doc, asks.picks).character.spells;
    expect(saved).toContainEqual(discovery("cone-of-cold"));
    expect(saved).toContainEqual(discovery("guidance"));
    expect(saved.some((s) => "srdId" in s && s.srdId === "fireball")).toBe(false);
  });

  it("a Lore Bard reaching 7 is offered it; reaching 6 is not", () => {
    const at7 = levelUpAsks(bard(6, "college-of-lore"), "bard", NO_ANSWERS, "en");
    expect(rowOf(at7.rows, "discoveryRemove")).toBeDefined();
    const at6 = levelUpAsks(bard(5, "college-of-lore"), "bard", NO_ANSWERS, "en");
    expect(rowOf(at6.rows, "discoveryRemove")).toBeUndefined();
  });

  it("a Bard of another college, or with none, is not offered it", () => {
    for (const subclassId of ["test-college", undefined]) {
      const asks = levelUpAsks(bard(9, subclassId), "bard", NO_ANSWERS, "en");
      expect(rowOf(asks.rows, "discoveryRemove")).toBeUndefined();
    }
  });
});

describe("commitLevelUp: the Magical Discoveries swap", () => {
  it("replaces the pick in place; the new one stays always prepared under the feature", () => {
    const doc = bard(9, "college-of-lore");
    const picks: LevelUpPicks = {
      classId: "bard",
      hpGain: 5,
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
      choiceSlots: {
        skill: [],
        tool: [],
        skillOrTool: [],
        language: [],
        spell: [],
        expertise: [],
        feat: [],
      },
      choicePicks: EMPTY_CHOICE_PICKS,
      multiclass: null,
      spellMastery: null,
      signatureSpells: null,
      swap: { removeId: null, replaceId: null },
      discoverySwap: { removeId: "fireball", replaceId: "cone-of-cold" },
      bundlePicks: {},
    };
    const spells = commitLevelUp(doc, picks).character.spells;
    expect(spells).toContainEqual(discovery("cone-of-cold"));
    expect(spells).toContainEqual(discovery("guidance"));
    expect(spells.some((s) => "srdId" in s && s.srdId === "fireball")).toBe(false);
  });
});
