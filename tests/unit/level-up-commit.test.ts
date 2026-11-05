/**
 * The one place a level's picks are applied (`commitLevelUp`), shared with
 * creation through `applyClassPicks`: the base level-up, then each pick where it
 * lives — and nothing for a pick the level didn't ask for.
 */
import { describe, expect, it } from "vitest";

import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { applyClassPicks, commitLevelUp, type LevelUpPicks } from "@/lib/level-up-commit";
import { makeCharacterDoc } from "./_helpers";

const none = (classId: string): LevelUpPicks => ({
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
  bundlePicks: {},
});

describe("commitLevelUp", () => {
  it("advances the class a level, raises max and current HP by the same gain", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 3 });
    const next = commitLevelUp(doc, { ...none("fighter"), hpGain: 7 });
    expect(next.character.classes[0]?.level).toBe(4);
    const gain = next.character.hp.max - doc.character.hp.max;
    expect(gain).toBeGreaterThan(0);
    expect(next.session.hp.current - doc.session.hp.current).toBe(gain);
  });

  it("a Warlock's new invocation is added to the ones it knows", () => {
    const doc = makeCharacterDoc({ classId: "warlock", level: 1 });
    const known = applyClassPicks(doc.character, "warlock", {
      invocations: ["agonizing-blast"],
    });
    const next = commitLevelUp(
      { ...doc, character: known },
      { ...none("warlock"), invocations: ["repelling-blast"] }
    );
    expect(next.character.classes[0]?.invocationChoices).toEqual([
      "agonizing-blast",
      "repelling-blast",
    ]);
  });

  // "Grappler … Ability Score Increase. Increase your Strength or Dexterity score
  // by 1": the feat ref keeps which one, beside the +1 it applies.
  it("a feat that lets you choose its increase keeps the ability chosen, beside the +1", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 3 });
    const next = commitLevelUp(doc, {
      ...none("fighter"),
      asi: {
        mode: "feat",
        plusTwo: null,
        plusOneA: null,
        plusOneB: null,
        featId: "grappler",
        featAbility: "DEX",
      },
    });
    expect(next.character.features).toContainEqual({
      srdId: "grappler",
      featAbility: "DEX",
    });
    expect(next.character.abilityScores.DEX).toBe(doc.character.abilityScores.DEX + 1);
  });

  it("a feat with no increase to choose stores no ability", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 3 });
    const next = commitLevelUp(doc, {
      ...none("fighter"),
      asi: {
        mode: "feat",
        plusTwo: null,
        plusOneA: null,
        plusOneB: null,
        featId: "alert",
        featAbility: null,
      },
    });
    expect(next.character.features).toContainEqual({ srdId: "alert" });
  });

  it("writes the bundle picks to the session", () => {
    const doc = makeCharacterDoc({ classId: "druid", level: 1 });
    const next = commitLevelUp(doc, {
      ...none("druid"),
      bundlePicks: { "x-bundle": "a" },
    });
    expect(next.session.grantBundleChoices).toMatchObject({ "x-bundle": "a" });
  });
});

describe("applyClassPicks", () => {
  it("puts each class pick where it lives, and leaves the rest alone", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 1,
      skills: { athletics: "proficient", perception: "proficient" },
    });
    const c = applyClassPicks(doc.character, "fighter", {
      fightingStyle: "defense",
      expertise: ["athletics", "perception"],
      weaponMasteries: ["longsword", "shortbow", "greataxe"],
    });
    expect(c.features.some((f) => !("custom" in f) && f.srdId === "defense")).toBe(true);
    expect(c.skills.athletics).toBe("expertise");
    expect(c.classes[0]?.weaponMasteries).toEqual(["longsword", "shortbow", "greataxe"]);
    expect(applyClassPicks(doc.character, "fighter", {})).toBe(doc.character);
  });
});
