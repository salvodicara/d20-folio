/**
 * A class feature's per-level HP counts that class's levels, not the total level.
 * Draconic Resilience (SRD 5.2.1, Draconic Sorcery): "Your Hit Point maximum
 * increases by 3, and it increases by 1 whenever you gain another Sorcerer level."
 * So it is worth exactly the Sorcerer level (3 at Sorcerer 3), once, whatever the
 * other classes are. Examples from #1316: Sorcerer 3 gets +3 (not +6), Fighter 5 /
 * Sorcerer 3 gets +3 (not +11).
 */
import { describe, expect, it } from "vitest";

import { asRaceId } from "@/data/srd-names";
import { NO_ANSWERS, levelUpAsks } from "@/domains/leveling/level-up-asks";
import { computeCharacterMaxHp, effectiveMaxHp } from "@/lib/aggregate-character";
import { levelUp } from "@/lib/level-up";
import { commitLevelUp } from "@/lib/level-up-commit";
import { MOCK_CHARACTER } from "@/lib/mock";
import { reconcileBuildChoices } from "@/lib/reconcile-build";
import type { CharacterData, CharacterDoc, ClassEntry } from "@/types/character";

const RESILIENCE = { srdId: "sorcerer-draconic-sorcery-resilience" };

/** A human with CON 14, the given classes, and Draconic Resilience when `draconic`. */
function character(classes: ClassEntry[], draconic = true): CharacterData {
  const c: CharacterData = {
    ...MOCK_CHARACTER.character,
    race: asRaceId("human"),
    classes,
    abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
    features: draconic ? [RESILIENCE] : [],
    humanOriginFeat: "",
    bgFeat: "",
    hp: { max: 0 },
  };
  return { ...c, hp: { max: computeCharacterMaxHp(c) } };
}

const sorcerer = (level: number): ClassEntry => ({
  classId: "sorcerer",
  subclassId: "draconic-sorcery",
  level,
});
const fighter = (level: number): ClassEntry => ({ classId: "fighter", level });

/** What Draconic Resilience adds to the by-the-book max. */
const resilience = (classes: ClassEntry[]) =>
  computeCharacterMaxHp(character(classes)) -
  computeCharacterMaxHp(character(classes, false));

describe("Draconic Resilience is worth the Sorcerer level", () => {
  it("Sorcerer 3 gets +3", () => {
    expect(resilience([sorcerer(3)])).toBe(3);
  });

  it("Fighter 5 / Sorcerer 3 gets +3, not +8", () => {
    expect(resilience([fighter(5), sorcerer(3)])).toBe(3);
  });

  it("the sheet adds nothing on top of the by-the-book max (no extra one-shot +3)", () => {
    const c = character([sorcerer(3)]);
    expect(effectiveMaxHp(c, MOCK_CHARACTER.session)).toBe(computeCharacterMaxHp(c));
  });
});

describe("a level in another class gains no Sorcerer HP", () => {
  const start = () => character([fighter(5), sorcerer(3)]);

  it("a Fighter level gains no Draconic +1, a Sorcerer level does", () => {
    const c = start();
    const asFighter = levelUp(c, 9, { advanceClassId: "fighter" }).updatedCharacter;
    const asSorcerer = levelUp(c, 9, { advanceClassId: "sorcerer" }).updatedCharacter;
    // d10 average 6 + CON 2; d6 average 4 + CON 2 + Draconic 1.
    expect(asFighter.hp.max - c.hp.max).toBe(8);
    expect(asSorcerer.hp.max - c.hp.max).toBe(7);
    expect(asFighter.hp.max).toBe(computeCharacterMaxHp(asFighter));
    expect(asSorcerer.hp.max).toBe(computeCharacterMaxHp(asSorcerer));
  });

  it("the level-up summary names Draconic Resilience only on a Sorcerer level", () => {
    const c = start();
    const hpLine = (advanceClassId: string) =>
      levelUp(c, 9, { advanceClassId }).changes.find((ch) => ch.type === "hp")
        ?.description ?? "";
    expect(hpLine("fighter")).toMatch(/^HP \+8 /);
    expect(hpLine("fighter")).not.toContain("Draconic Resilience");
    expect(hpLine("sorcerer")).toMatch(/^HP \+7 .*Draconic Resilience \+1/);
  });

  it("a Fighter level typed on the Bio page gains no Draconic +1", () => {
    const c = start();
    const next = reconcileBuildChoices(c, { ...c, classes: [fighter(6), sorcerer(3)] });
    expect(next.hp.max).toBe(computeCharacterMaxHp(next));
  });

  it("choosing Draconic Sorcery at Sorcerer 3 counts 3 levels, not the total level", () => {
    const c = character([fighter(5), { classId: "sorcerer", level: 2 }], false);
    const doc: CharacterDoc = { ...MOCK_CHARACTER, character: c };
    const asks = levelUpAsks(
      doc,
      "sorcerer",
      { ...NO_ANSWERS, subclassId: "draconic-sorcery" },
      "en"
    );
    const next = commitLevelUp(doc, asks.picks).character;
    expect(next.hp.max).toBe(computeCharacterMaxHp(next));
  });
});
