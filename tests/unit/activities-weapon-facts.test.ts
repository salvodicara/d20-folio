/**
 * A weapon's Activity holds its Mastery, its two-handed (Versatile) die and the
 * ammunition each attack uses: facts once listed as gaps. Cases come from the SRD
 * weapons themselves.
 */
import { describe, expect, it } from "vitest";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { primaryDamage, translateWeapon } from "@/lib/activities";

const weapons = SRD_EQUIPMENT.filter((w) => w.category === "weapon" && w.damage);
const versatileDie = (properties: ReadonlyArray<string> = []) =>
  properties.map((p) => /Versatile\s*\(([^)]+)\)/i.exec(p)?.[1]).find(Boolean);

describe("weapon facts on the Activity", () => {
  it.each(weapons.map((w) => [w.id, w] as const))("%s", (_id, weapon) => {
    const translation = translateWeapon(weapon);
    expect(translation).toBeDefined();
    if (!translation) return;
    const { activity, gaps } = translation;
    expect(activity.attack?.mastery).toBe(weapon.mastery);
    expect(activity.cost.ammunition).toBe(weapon.ammunitionId);
    expect(primaryDamage(activity)?.twoHanded?.dice).toBe(
      versatileDie(weapon.properties)
    );
    expect(gaps).toEqual([]);
  });

  it("a Longsword is Versatile 1d10 with Sap; a Longbow spends its ammunition", () => {
    const longsword = weapons.find((w) => w.id === "longsword");
    const longbow = weapons.find((w) => w.id === "longbow");
    const sword = longsword && translateWeapon(longsword)?.activity;
    const bow = longbow && translateWeapon(longbow)?.activity;
    expect(sword && primaryDamage(sword)?.twoHanded?.dice).toBe("1d10");
    expect(sword?.attack?.mastery).toBe("Sap");
    expect(bow?.cost.ammunition).toBe(longbow?.ammunitionId);
    expect(bow?.cost.ammunition).toBeTruthy();
  });
});
