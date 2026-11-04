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
import { knockOutOffer, damageTrayPlan } from "@/lib/play/damage-tray";
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
  const pc = (current: number, temp = 0) => ({
    kind: "pc" as const,
    hp: { current, temp },
  });
  it("when a melee hit would drop a standing character to 0", () => {
    expect(knockOutOffer(melee, pc(6), 9)).toBe("knock-out");
    expect(knockOutOffer(melee, pc(6, 4), 10)).toBe("knock-out");
  });
  it("not when the hit leaves it standing, it is already down, or the attack is ranged", () => {
    expect(knockOutOffer(melee, pc(6, 4), 9)).toBeNull();
    expect(knockOutOffer(melee, pc(0), 9)).toBeNull();
    expect(knockOutOffer({}, pc(6), 9)).toBeNull();
  });
  it("on a monster, whose Hit Points the player can't see: «Non letale» on any melee hit", () => {
    expect(knockOutOffer(melee, { kind: "monster" }, 9)).toBe("non-lethal");
    expect(knockOutOffer(melee, { kind: "monster" }, 0)).toBeNull();
    expect(knockOutOffer({}, { kind: "monster" }, 9)).toBeNull();
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
