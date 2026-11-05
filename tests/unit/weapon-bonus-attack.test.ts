/**
 * `weapon-bonus-attack`: a feature that lets you follow an attack with a qualifying
 * weapon by a Bonus Action attack with that same weapon, at a set damage die and type
 * (2024 Polearm Master, Pole Strike: "Immediately after you take the Attack action and
 * attack with a Quarterstaff, a Spear, or a weapon that has the Heavy and Reach
 * properties, you can use a Bonus Action to make a melee attack with the opposite end
 * of the weapon. The weapon deals Bludgeoning damage, and the weapon's damage die for
 * this attack is a d4.").
 *
 * The grant names the qualifying weapons (by id, or by properties all present); each
 * qualifying carried weapon gets one Bonus Action row, held back until an attack with
 * that weapon is committed (like the Two-Weapon Fighting off-hand).
 */
import { describe, expect, it } from "vitest";

import type { Grant } from "@/lib/grants";
import { resolveConditionEffects } from "@/lib/condition-effects";
import {
  actionCtaView,
  type ActionConditions,
  type ActionTurnState,
} from "@/lib/views/action-cta-view";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { CharacterDoc, CustomFeature } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

const BUTT_STRIKE: Grant = {
  type: "weapon-bonus-attack",
  id: "butt-strike",
  name: { en: "Butt Strike", it: "Colpo di calcio" },
  weapons: [{ ids: ["quarterstaff", "spear"] }, { properties: ["Heavy", "Reach"] }],
  damageDie: "1d4",
  damageType: "bludgeoning",
};

const feat: CustomFeature = {
  custom: true,
  title: "Haft Fighter",
  emoji: "🪓",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  grants: [BUTT_STRIKE],
  instanceId: customInstanceId("Haft Fighter"),
};

const wielder = (weapons: string[], grants = true): CharacterDoc =>
  makeCharacterDoc({
    features: grants ? [feat] : [],
    weapons: weapons.map((srdId) => ({ srdId, quantity: 1 })),
  });

const bonusRows = (doc: CharacterDoc, lang: "en" | "it" = "en") =>
  localizeActions(doc, lang).filter((a) => a.bonusAttackAfter !== undefined);

describe("weapon-bonus-attack", () => {
  it("gives each qualifying weapon one Bonus Action attack at the grant's die and type", () => {
    const doc = wielder(["quarterstaff", "glaive", "whip", "greataxe", "longsword"]);
    const actions = localizeActions(doc, "en");
    const rows = bonusRows(doc);
    // Quarterstaff by name; Glaive by Heavy + Reach. Not a Whip (Reach only), a
    // Greataxe (Heavy only) or a Longsword.
    expect(rows.map((r) => r.bonusAttackAfter)).toEqual([
      "weapon-quarterstaff",
      "weapon-glaive",
    ]);
    for (const row of rows) {
      const main = actions.find((a) => a.id === row.bonusAttackAfter);
      expect(row).toMatchObject({ type: "bonus", source: "weapon" });
      // Same to-hit as the weapon; its damage die becomes a d4, the modifier stays.
      expect(row.summary.attackBonus).toBe(main?.summary.attackBonus);
      expect(row.summary.damageType).toBe("bludgeoning");
      const mainDie = main?.summary.weaponParts?.die ?? "";
      expect(row.summary.damage).toBe(main?.summary.damage?.replace(mainDie, "1d4"));
    }
  });

  it("is named after the weapon and the feature, in both languages", () => {
    const doc = wielder(["spear"]);
    expect(bonusRows(doc, "en")[0]?.name).toBe("Spear (Butt Strike)");
    expect(bonusRows(doc, "it")[0]?.name).toMatch(/\(Colpo di calcio\)$/);
  });

  it("needs the grant", () => {
    expect(bonusRows(wielder(["quarterstaff"], false))).toEqual([]);
  });

  it("is held back until an attack with that same weapon is committed", () => {
    const doc = wielder(["quarterstaff", "glaive"]);
    const actions = localizeActions(doc, "en");
    const conditions: ActionConditions = {
      facts: {},
      list: [],
      effects: resolveConditionEffects([], {}),
    };
    const turn = (action: string[], swings: string[] = []): ActionTurnState => ({
      selected: { action: action.map((id) => ({ id })), bonus: [], free: [] },
      budget: { action: 1, bonus: 1 },
      attackBudget: 1,
      attacksUsed: swings.length,
      attackSwingIds: swings,
      reactionUsed: false,
      reactionUsedId: null,
      movementUsedFt: 0,
      warMagicMax: -1,
    });
    const [staffRow, glaiveRow] = bonusRows(doc).map((r) => r.id);
    const before = actionCtaView(doc, actions, turn([]), conditions);
    expect(before.get(staffRow ?? "")?.hidden).toBe(true);

    const afterStaff = actionCtaView(
      doc,
      actions,
      turn(["weapon-quarterstaff"]),
      conditions
    );
    expect(afterStaff.get(staffRow ?? "")?.hidden).toBe(false);
    expect(afterStaff.get(glaiveRow ?? "")?.hidden).toBe(true);

    // A swing of an Extra Attack counts the same.
    const swung = actionCtaView(
      doc,
      actions,
      turn(["attack-group"], ["weapon-glaive"]),
      conditions
    );
    expect(swung.get(glaiveRow ?? "")?.hidden).toBe(false);
  });
});
