/**
 * The cast dialog's free-hands warning, from the character as it stands: the
 * equipped Shield, a Cleric's or Paladin's holy symbol, War Caster, and the weapon
 * last attacked with. 2024 PHB, "Holy Symbol" and "Components".
 */
import { describe, expect, it } from "vitest";

import { srdText } from "@/lib/loc-text";
import { castHandsView } from "@/lib/views/cast-hands-view";
import type { LogEntry } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const swing: LogEntry = {
  event: {
    kind: "action-use",
    action: srdText("equipment", "longsword", "name"),
    effect: "attack",
    slot: "action",
  },
  ts: 1,
  id: "swing",
};
const aid = { components: { v: true, s: true, m: true } };
const cureWounds = { components: { v: true, s: true, m: false } };

const paladin = (equipment: Array<{ srdId: string; equipped?: boolean }>, feat = "") =>
  makeCharacterDoc(
    {
      classId: "paladin",
      level: 6,
      weapons: [{ srdId: "longsword", quantity: 1 }],
      equipment,
      bgFeat: feat,
    },
    { logEntries: [swing] }
  );

describe("castHandsView", () => {
  it("sword and Shield, no focus: Aid warns and offers to stow the Longsword", () => {
    expect(castHandsView(paladin([{ srdId: "shield", equipped: true }]), aid)).toEqual({
      kind: "no-free-hand",
      stow: true,
      shield: true,
      weaponId: "longsword",
    });
  });

  it("a holy symbol on the Shield covers Aid, not Cure Wounds", () => {
    const doc = paladin([{ srdId: "shield", equipped: true }, { srdId: "holy-symbol" }]);
    expect(castHandsView(doc, aid)).toBeNull();
    expect(castHandsView(doc, cureWounds)).toMatchObject({ kind: "no-free-hand" });
  });

  it("War Caster lifts the Somatic need", () => {
    const doc = paladin([{ srdId: "shield", equipped: true }], "war-caster");
    expect(castHandsView(doc, cureWounds)).toBeNull();
  });

  it("a Shield carried but not equipped leaves a hand free", () => {
    expect(castHandsView(paladin([{ srdId: "shield" }]), aid)).toBeNull();
  });

  it("a holy symbol counts only for a Cleric or Paladin", () => {
    const fighter = makeCharacterDoc(
      {
        classId: "fighter",
        level: 5,
        equipment: [{ srdId: "shield", equipped: true }, { srdId: "holy-symbol" }],
      },
      { logEntries: [swing] }
    );
    expect(castHandsView(fighter, aid)).toMatchObject({ kind: "no-free-hand" });
  });
});
