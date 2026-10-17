/**
 * Donning and doffing armor (SRD 5.2.1 "Armor"): Light 1 minute either way, Medium 5
 * to don and 1 to doff, Heavy 10 and 5, a Shield the Utilize action. Equipping is never
 * blocked; inside a fight a minutes-long change is flagged, since it does not fit in
 * one action. Cases come from the armor catalogue.
 */
import { describe, expect, it } from "vitest";
import { SRD_ARMOR, getArmor } from "@/data/armor";
import { armorChange } from "@/lib/play/armor-donning";

function category(id: string) {
  const armor = getArmor(id);
  if (!armor?.armorCategory) throw new Error(`no armor ${id}`);
  return armor.armorCategory;
}

describe("the time an armor change takes", () => {
  it("gives every catalogue armor a don and a doff time", () => {
    for (const armor of SRD_ARMOR) {
      expect(armorChange(armor.armorCategory, true, false), armor.id).not.toBeNull();
      expect(armorChange(armor.armorCategory, false, false), armor.id).not.toBeNull();
    }
  });

  it.each([
    ["leather-armor", 1, 1],
    ["hide-armor", 5, 1],
    ["chain-mail", 10, 5],
    ["plate-armor", 10, 5],
    ["shield", "utilize", "utilize"],
  ] as const)("%s: don %s, doff %s", (id, don, doff) => {
    expect(armorChange(category(id), true, false)?.time).toBe(don);
    expect(armorChange(category(id), false, false)?.time).toBe(doff);
  });

  it("has nothing to say about an item that is not armor", () => {
    expect(armorChange(undefined, true, true)).toBeNull();
  });
});

describe("inside a fight", () => {
  it("flags a change that takes minutes", () => {
    expect(armorChange(category("chain-mail"), true, true)).toEqual({
      verb: "don",
      time: 10,
      tooSlowForFight: true,
    });
    expect(armorChange(category("leather-armor"), false, true)?.tooSlowForFight).toBe(
      true
    );
  });

  it("lets a Shield go on with the Utilize action, and flags nothing out of a fight", () => {
    expect(armorChange(category("shield"), true, true)?.tooSlowForFight).toBe(false);
    expect(armorChange(category("chain-mail"), true, false)?.tooSlowForFight).toBe(false);
  });
});
