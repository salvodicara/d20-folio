/**
 * Bane on a monster (SRD 5.2.1: "subtract 1d4 from the attack roll or save"): the DM
 * rolling that monster's attack reads «−1d4 (Bane)» beside its to-hit bonus.
 */
import i18next from "i18next";
import { describe, expect, it } from "vitest";
import enCombat from "@/i18n/en/ui/combat.json";
import itCombat from "@/i18n/it/ui/combat.json";
import enCommon from "@/i18n/en/ui/common.json";
import itCommon from "@/i18n/it/ui/common.json";
import { monsterAttackNotes } from "@/components/shared/damage-tray-target";
import { monsterTurnModifiers } from "@/lib/play/monster-turn-modifiers";
import type { CombatEffectOp } from "@/types/combat-effect";

const baned: CombatEffectOp = {
  id: "op-1",
  kind: "apply",
  effect: {
    id: "e1",
    actor: { kind: "pc", combatantId: "pc-cleric", memberUid: "u", characterId: "c" },
    target: { kind: "monster", combatantId: "orc-1" },
    source: { kind: "spell", id: "bane", actionId: "spell-bane" },
    payload: { kind: "grant-group", activeKey: "spell-bane" },
    duration: { kind: "concentration", actorId: "pc-cleric", sourceId: "bane" },
  },
};

describe("what the DM reads on a monster's attack", () => {
  it("Bane: −1d4 on its attack rolls and on its saves", () => {
    const mods = monsterTurnModifiers([baned], "orc-1");
    expect(mods.attackDice).toEqual([
      { operation: "subtract", dice: "1d4", source: { kind: "spell", id: "bane" } },
    ]);
    expect(mods.saveDice).toEqual(mods.attackDice);
  });

  it("another monster is untouched", () => {
    const mods = monsterTurnModifiers([baned], "orc-2");
    expect(mods.attackDice).toEqual([]);
    expect(mods.saveDice).toEqual([]);
  });
});

describe("the DM's line on the monster's attack tray", () => {
  it("reads «−1d4 (Bane)» in English and «−1d4 (Anatema)» in Italian", async () => {
    const instance = i18next.createInstance();
    await instance.init({
      lng: "en",
      resources: {
        en: { translation: { ...enCombat, ...enCommon } },
        it: { translation: { ...itCombat, ...itCommon } },
      },
      interpolation: { escapeValue: false },
    });
    const mods = monsterTurnModifiers([baned], "orc-1");
    expect(monsterAttackNotes(mods, instance.getFixedT("en"), "en")).toEqual([
      "−1d4 (Bane)",
    ]);
    expect(monsterAttackNotes(mods, instance.getFixedT("it"), "it")).toEqual([
      "−1d4 (Anatema)",
    ]);
  });
});
