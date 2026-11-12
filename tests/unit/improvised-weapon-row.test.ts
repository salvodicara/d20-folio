/**
 * Every character can attack with an improvised weapon (SRD 5.2.1 Improvised
 * Weapons): a row in the action list beside the Unarmed Strike, on both sheets through
 * the existing row rendering. 1d4 of a type the DM picks (Bludgeoning, Piercing or
 * Slashing), Strength, thrown at 20/60 ft, the Proficiency Bonus only with proficiency
 * in improvised weapons (`improvisedWeaponAttack`).
 */
import { describe, expect, it } from "vitest";

import { asProficiencyToken } from "@/lib/proficiency-tokens";
import { customInstanceId } from "./__helpers__/custom-items";
import { resolveActions } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const fighter = (grants: CharacterDoc["character"]["features"] = []): CharacterDoc =>
  makeCharacterDoc({
    classId: "fighter",
    level: 5,
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    features: grants,
  });

const row = (doc: CharacterDoc) =>
  resolveActions(doc).find((a) => a.id === "improvised-weapon");

describe("the improvised weapon row", () => {
  it("is an Action with 1d4 + STR, no Proficiency Bonus, melee or thrown 20/60", () => {
    const r = row(fighter());
    expect(r).toMatchObject({ type: "action", source: "weapon" });
    expect(r?.summary).toMatchObject({
      attackBonus: 3,
      damage: "1d4+3",
      damageType: "bludgeoning",
      damageTypes: ["bludgeoning", "piercing", "slashing"],
      weaponRange: { kind: "melee", reachFt: 5, thrown: { nearFt: 20, farFt: 60 } },
    });
  });

  it("adds the Proficiency Bonus with proficiency in improvised weapons", () => {
    const proficient = fighter([
      {
        custom: true,
        title: "Homebrew training",
        emoji: "*",
        source: "Homebrew",
        tags: [],
        contentBlocks: [],
        instanceId: customInstanceId("improvised"),
        grants: [
          {
            type: "weapon-proficiency",
            proficiency: asProficiencyToken("improvised-weapons"),
          },
        ],
      },
    ]);
    expect(row(proficient)?.summary.attackBonus).toBe(6);
  });

  it("Exhaustion lowers its attack roll like any weapon's", () => {
    const tired = { ...fighter(), session: { ...fighter().session, exhaustion: 2 } };
    expect(row(tired)?.summary.attackBonus).toBe(-1);
  });
});
