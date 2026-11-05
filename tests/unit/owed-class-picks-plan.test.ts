/**
 * The level-up and «Scelte da completare» read the same tables: a character that
 * owes nothing, levelled up with exactly what `levelUpPlan` asks, still owes
 * nothing — for every level of every class with a counted pick (2024 tables:
 * Warlock invocations and cantrips, Sorcerer Metamagic 2/4/6 at 2/10/17 and
 * cantrips, Wizard/Cleric/Druid/Bard cantrips, Fighter/Barbarian Weapon Mastery).
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { emptyAsiChoice } from "@/lib/level-up-choices";
import { commitLevelUp, type LevelUpPicks } from "@/lib/level-up-commit";
import { levelUpPlan } from "@/lib/level-up-plan";
import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { emptySwapChoice } from "@/lib/spell-swap";
import { applyOwedClassPicks, owedClassPicks } from "@/lib/owed-class-picks";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const interim = { subclassId: null, asiChoice: emptyAsiChoice(), fightingStyle: null };
const NO_SLOTS = {
  skill: [],
  tool: [],
  skillOrTool: [],
  language: [],
  spell: [],
  expertise: [],
  feat: [],
};

/** `n` fresh ids of a kind the character doesn't hold yet (counts are what's read). */
let serial = 0;

function fresh(doc: CharacterDoc, classId: string, pick: string, n: number): string[] {
  if (pick === "cantrips") {
    const known = new Set(
      doc.character.spells.flatMap((s) => ("custom" in s ? [] : [s.srdId]))
    );
    return spells
      .filter((s) => s.level === 0 && s.classes.includes(classId) && !known.has(s.id))
      .slice(0, n)
      .map((s) => s.id);
  }
  return Array.from({ length: n }, () => `${pick}-${String((serial += 1))}`);
}

/** The character with every owed pick filled. */
function settled(doc: CharacterDoc): CharacterDoc {
  const answers = owedClassPicks(doc.character).map((o) => ({
    classId: o.classId,
    pick: o.pick,
    ids: fresh(doc, o.classId, o.pick, o.owed),
  }));
  return { ...doc, character: applyOwedClassPicks(doc.character, answers) };
}

function asked(doc: CharacterDoc, classId: string): LevelUpPicks {
  const plan = levelUpPlan(doc, classId, interim);
  const n = (need: boolean, count: number, pick: string) =>
    need ? fresh(doc, classId, pick, count) : [];
  const entry = doc.character.classes.find((e) => e.classId === classId);
  return {
    classId,
    asi: emptyAsiChoice(),
    subclassId: null,
    fightingStyle: null,
    expertise: [],
    weaponMasteries: plan.needsWeaponMastery
      ? [
          ...(entry?.weaponMasteries ?? []),
          ...fresh(
            doc,
            classId,
            "weaponMasteries",
            plan.weaponMasteryCount - (entry?.weaponMasteries?.length ?? 0)
          ),
        ]
      : null,
    metamagic: n(plan.needsMetamagic, plan.metamagicPicksNeeded, "metamagic"),
    maneuvers: [],
    invocations: n(plan.needsInvocations, plan.invocationPicksNeeded, "invocations"),
    newCantrips: n(plan.cantripsKnownDiff > 0, plan.cantripsKnownDiff, "cantrips"),
    newSpells: [],
    choiceSlots: NO_SLOTS,
    choicePicks: EMPTY_CHOICE_PICKS,
    multiclass: null,
    spellMastery: null,
    signatureSpells: null,
    swap: emptySwapChoice(),
    bundlePicks: {},
  };
}

describe("levelUpPlan asks what owedClassPicks counts", () => {
  for (const classId of [
    "warlock",
    "sorcerer",
    "wizard",
    "cleric",
    "druid",
    "bard",
    "fighter",
    "barbarian",
    "paladin",
  ]) {
    it(`${classId}: every level 1 → 20 leaves nothing owed`, () => {
      const owedAt: string[] = [];
      for (let level = 1; level < 20; level++) {
        const doc = settled(
          makeCharacterDoc({ classes: [{ classId, level }], spells: [] })
        );
        const after = commitLevelUp(doc, asked(doc, classId));
        for (const o of owedClassPicks(after.character)) {
          owedAt.push(`${String(level + 1)}:${o.pick}=${String(o.owed)}`);
        }
      }
      expect(owedAt).toEqual([]);
    });
  }
});
