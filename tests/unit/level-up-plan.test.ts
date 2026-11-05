/**
 * What a level asks (`levelUpPlan`), read from the class tables and features the
 * way the classic wizard always did: the new level, the Hit Point die, and each
 * pick the level opens with its count — and nothing it doesn't open.
 */
import { describe, expect, it } from "vitest";

import { emptyAsiChoice } from "@/lib/level-up-choices";
import { levelUpPlan } from "@/lib/level-up-plan";
import { makeCharacterDoc } from "./_helpers";

const interim = { subclassId: null, asiChoice: emptyAsiChoice(), fightingStyle: null };

describe("levelUpPlan", () => {
  it("a Fighter going to 4 owes an ASI and a new mastery, nothing else", () => {
    const plan = levelUpPlan(
      makeCharacterDoc({ classId: "fighter", level: 3 }),
      "fighter",
      interim
    );
    expect(plan).toMatchObject({
      newLevel: 4,
      newClassLevel: 4,
      hitDie: 10,
      needsAsi: true,
      needsSubclass: false,
      needsWeaponMastery: true,
      weaponMasteryCount: 4,
      needsInvocations: false,
    });
  });

  it("a Cleric reaching 3 owes its subclass, and spells by the table", () => {
    const plan = levelUpPlan(
      makeCharacterDoc({ classId: "cleric", level: 2 }),
      "cleric",
      interim
    );
    expect(plan.needsSubclass).toBe(true);
    expect(plan.hitDie).toBe(8);
    expect(plan.maxSpellLevel).toBe(2);
  });

  it("a first level in a new class is a new class", () => {
    const plan = levelUpPlan(
      makeCharacterDoc({ classId: "fighter", level: 3 }),
      "wizard",
      interim
    );
    expect(plan.isNewClass).toBe(true);
    expect(plan.newClassLevel).toBe(1);
    expect(plan.newLevel).toBe(4);
  });

  it("a Warlock is asked the new invocations each time its table count grows", () => {
    // 2024 Warlock invocations known: 1 at level 1, 3 at 2, 5 at 5, 6 at 7…
    const at = (level: number) =>
      levelUpPlan(makeCharacterDoc({ classId: "warlock", level }), "warlock", interim);
    expect(at(1)).toMatchObject({ needsInvocations: true, invocationPicksNeeded: 2 });
    expect(at(4)).toMatchObject({ needsInvocations: true, invocationPicksNeeded: 2 });
    expect(at(2).needsInvocations).toBe(false);
  });
});
