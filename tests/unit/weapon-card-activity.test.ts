/**
 * The carried-weapon attack card reads an SRD weapon's printed die and damage type
 * from its Activity (`translateWeapon`). Every SRD weapon: the card shows the die and
 * the type the weapon prints.
 */
import { describe, expect, it } from "vitest";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

const weapons = SRD_EQUIPMENT.filter((item) => item.category === "weapon" && item.damage);

describe("the weapon attack card reads the weapon's Activity", () => {
  it("covers every SRD weapon", () => {
    expect(weapons.length).toBeGreaterThan(30);
  });

  it.each(weapons.map((w) => [w.id, w] as const))("%s", (id, weapon) => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      weapons: [{ srdId: id, quantity: 1 }],
    });
    const card = resolveActions(doc).find(
      (action) => action.source === "weapon" && action.weaponId === id
    );
    expect(card?.summary.damageType).toBe(weapon.damage?.type);
    expect(card?.summary.damage?.startsWith(weapon.damage?.die ?? "")).toBe(true);
  });
});
