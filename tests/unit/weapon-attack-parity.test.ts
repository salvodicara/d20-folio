/**
 * Simplify-core item 7, step 1: before the weapon attack math collapses into one
 * profile, pin that today's two surfaces agree on every dev scenario. For each weapon in
 * the inventory with an attack row, the inventory card and the Play card show the same
 * to-hit, the same damage formulas and the same damage type.
 */
import { describe, expect, it } from "vitest";

import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import { localizeActions } from "@/lib/views/combat-action-view";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import { getSpellById } from "@/data/spells";
import { castWeaponBinding } from "@/lib/weapon-binding";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const numbers = (facts: {
  attackBonus: number;
  damageOneHanded: string;
  damageTwoHanded: string | null;
  damageTypeId: string;
}) => ({
  attackBonus: facts.attackBonus,
  damageOneHanded: facts.damageOneHanded,
  damageTwoHanded: facts.damageTwoHanded,
  damageTypeId: facts.damageTypeId,
});

const cases = Object.entries(DEV_SCENARIOS).flatMap(([name, spec]) => {
  const doc = buildScenario(spec);
  const actions = localizeActions(doc, "en");
  return buildInventoryViewModel(doc, "en").weapons.flatMap((weapon) => {
    const action = actions.find((a) => a.id === `weapon-${weapon.id}`);
    return action?.weaponFacts ? [{ name, weapon, action }] : [];
  });
});

describe("the inventory and the Play card agree on every weapon of every dev scenario", () => {
  it("covers real weapons", () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  it.each(cases.map((c) => [`${c.name} · ${c.weapon.id}`, c] as const))(
    "%s",
    (_label, c) => {
      expect(numbers(c.weapon.facts)).toEqual(
        numbers(c.action.weaponFacts ?? c.weapon.facts)
      );
    }
  );
});

describe("with a spell bound to the weapon (Magic Weapon, Shillelagh)", () => {
  function bound(spellId: string, weapon: string, classId: string): CharacterDoc {
    const doc = makeCharacterDoc({
      classId,
      level: 11,
      abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 16, CHA: 14 },
      spells: [{ srdId: spellId, prepared: true }],
      weapons: [{ srdId: weapon, quantity: 1 }],
    });
    const spell = getSpellById(spellId);
    if (!spell) throw new Error(`no ${spellId}`);
    const result = castWeaponBinding(
      { spell, weapon: { kind: "srd", index: 0, srdId: weapon } },
      doc
    );
    if (!result.ok) throw new Error(`cast rejected: ${result.reason}`);
    const choices = Object.fromEntries(
      Object.entries(result.choices).filter((e): e is [string, string] => e[1] !== null)
    );
    return {
      ...doc,
      session: {
        ...doc.session,
        activeFeatures: [...(doc.session.activeFeatures ?? []), result.activeKey],
        grantBundleChoices: { ...doc.session.grantBundleChoices, ...choices },
      },
    };
  }

  it.each([
    ["Magic Weapon on a longsword", "magic-weapon", "longsword", "paladin"],
    ["Shillelagh on a club", "shillelagh", "club", "druid"],
  ])(
    "%s: the inventory card shows what the Play card shows",
    (_name, spellId, weapon, classId) => {
      const doc = bound(spellId, weapon, classId);
      const inventory = buildInventoryViewModel(doc, "en").weapons.find(
        (w) => w.id === weapon
      );
      const action = localizeActions(doc, "en").find((a) => a.id === `weapon-${weapon}`);
      const facts = action?.weaponFacts;
      if (!facts || !inventory) throw new Error("expected both cards");
      expect(numbers(inventory.facts)).toEqual(numbers(facts));
    }
  );
});
