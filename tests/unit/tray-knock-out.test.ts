/**
 * Knocking a creature out (SRD 5.2.1, "Knocking Out a Creature"): "When you would
 * reduce a creature to 0 Hit Points with a melee attack, you can instead reduce the
 * creature to 1 Hit Point and give it the Unconscious condition." The tray offers it
 * («Mettilo KO») on a melee hit that would drop a standing character to 0, and the
 * hit then lands through the target's own rule (`reducePcDamage`'s `knockOut`).
 */
import { describe, expect, it } from "vitest";
import { SRD_WEAPONS } from "@/data/weapons";
import { defaultCombatState } from "@/lib/combat-state";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { canKnockOut, damageTrayPlan } from "@/lib/play/damage-tray";
import { peerDamageState } from "@/lib/play/peer-damage";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

function weaponCard(id: string): ResolvedAction {
  const fighter = buildDevScenario("weapon-mastery-numbers");
  if (!fighter) throw new Error("scenario missing");
  fighter.character.weapons = [{ srdId: id, quantity: 1 }];
  const card = localizeActions(fighter, "en").find((a) => a.id === `weapon-${id}`);
  if (!card) throw new Error(`no card for ${id}`);
  return card;
}

describe("the tray knows a melee hit", () => {
  it("a longsword's plan is melee, a longbow's is not", () => {
    expect(SRD_WEAPONS.some((w) => w.id === "longsword")).toBe(true);
    expect(damageTrayPlan(weaponCard("longsword"), ["pc-bren"], "pc-me")?.melee).toBe(
      true
    );
    expect(
      damageTrayPlan(weaponCard("longbow"), ["pc-bren"], "pc-me")?.melee
    ).toBeUndefined();
  });
});

describe("«Mettilo KO» is offered", () => {
  const melee = { melee: true as const };
  it("when a melee hit would drop a standing character to 0", () => {
    expect(canKnockOut(melee, { kind: "pc", hp: { current: 6, temp: 0 } }, 9)).toBe(true);
    expect(canKnockOut(melee, { kind: "pc", hp: { current: 6, temp: 4 } }, 10)).toBe(
      true
    );
  });
  it("not when the hit leaves it standing, it is already down, or the attack is ranged", () => {
    expect(canKnockOut(melee, { kind: "pc", hp: { current: 6, temp: 4 } }, 9)).toBe(
      false
    );
    expect(canKnockOut(melee, { kind: "pc", hp: { current: 0, temp: 0 } }, 9)).toBe(
      false
    );
    expect(canKnockOut({}, { kind: "pc", hp: { current: 6, temp: 0 } }, 9)).toBe(false);
  });
  it("not on a creature whose Hit Points the sheet can't set to 1", () => {
    expect(canKnockOut(melee, { kind: "monster", hp: { current: 6, temp: 0 } }, 9)).toBe(
      false
    );
  });
});

describe("a knock-out lands through the target's own rule", () => {
  it("1 Hit Point and Unconscious, no death saves", () => {
    const doc = makeCharacterDoc(
      { classId: "fighter", level: 5 },
      { hp: { current: 6, temp: 0 } }
    );
    const combat = {
      ...defaultCombatState(doc.character.hp.max),
      hp: { current: 6, temp: 0 },
    };
    const next = peerDamageState(doc, combat, 9, {
      knockOut: true,
      hit: { attacker: null, attackMode: "melee" },
    });
    expect(next.hp.current).toBe(1);
    expect(next.conditions).toContain("unconscious");
    expect(next.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});
