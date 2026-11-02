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
