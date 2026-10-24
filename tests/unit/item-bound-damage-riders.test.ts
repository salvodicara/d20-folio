/**
 * A magic weapon's own extra damage rides only the weapon row it is bound to
 * (`enchantItemId`). Every case is read from the item's English catalogue text: the
 * die, the damage type ("damage" alone means the weapon's own type) and the
 * creature types it is limited to.
 */
import { describe, expect, it } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import { resolveItemBoundDamageRiders } from "@/lib/compute";
import { resolveActions } from "@/lib/smart-tracker";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import type { CharacterDoc } from "@/types/character";
import { srd } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const text = (id: string): string => srd("magic-item", id, "description", "en");

const TYPES = [
  "acid",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "poison",
  "psychic",
  "radiant",
  "thunder",
];
const CREATURES = ["Fiend", "Undead", "giant", "dragon"];

/** The rider the text states: "extra 2d6 Radiant damage" (+ "to creatures of the giant type"). */
function stated(id: string) {
  const t = text(id);
  const m = /extra (\d+d\d+) (?:(\w+) )?damage/.exec(t);
  if (!m) throw new Error(`${id} states no extra damage`);
  const word = (m[2] ?? "").toLowerCase();
  const damageType = TYPES.includes(word) ? word : "same-as-weapon";
  const sentence = t.slice(
    Math.max(0, t.lastIndexOf(".", m.index) + 1),
    t.indexOf(".", m.index)
  );
  const creatures = CREATURES.filter((c) => new RegExp(`\\b${c}\\b`).test(sentence)).map(
    (c) => c.toLowerCase()
  );
  return {
    dice: m[1] ?? "",
    damageType,
    ...(creatures.length > 0 ? { targetCreatureTypes: creatures } : {}),
  };
}

const ALWAYS = [
  "dragon-slayer",
  "frost-brand",
  "giant-slayer",
  "mace-of-disruption",
  "sword-of-wounding",
  "thunderous-greatclub",
  "vicious-weapon",
];

function wielding(itemId: string, weapon = "longsword"): CharacterDoc {
  return makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      {
        srdId: itemId,
        instanceId: `${itemId}-copy`,
        equipped: true,
        attuned: true,
        quantity: 1,
      },
    ],
    weapons: [
      { srdId: weapon, quantity: 1, enchantItemId: itemId },
      { srdId: "dagger", quantity: 1 },
    ],
  });
}

function row(doc: CharacterDoc, weaponSrdId: string) {
  return resolveActions(doc).find(
    (a) => a.source === "weapon" && a.weaponId === weaponSrdId
  );
}

describe("item-bound damage riders", () => {
  it.each(ALWAYS)("%s declares the extra damage its text states", (id) => {
    expect(resolveItemBoundDamageRiders(getMagicItem(id)?.grants, () => false)).toEqual([
      stated(id),
    ]);
  });

  it.each(ALWAYS)("%s adds it to its bound weapon only", (id) => {
    const doc = wielding(id);
    const want = stated(id);
    const extra = row(doc, "longsword")?.summary.extraDamage ?? [];
    expect(extra).toContainEqual(
      expect.objectContaining({
        dice: want.dice,
        // "damage" alone is the weapon's own type: a Longsword's Slashing.
        damageType: want.damageType === "same-as-weapon" ? "slashing" : want.damageType,
        ...(want.targetCreatureTypes
          ? { targetCreatureTypes: want.targetCreatureTypes }
          : {}),
      })
    );
    expect(row(doc, "dagger")?.summary.extraDamage ?? []).toEqual([]);
  });

  it("Flame Tongue: +2d6 Fire only while ablaze (a Bonus Action)", () => {
    const id = "flame-tongue";
    expect(text(id)).toMatch(/Bonus Action to ignite/);
    const doc = wielding(id);
    expect(row(doc, "longsword")?.summary.extraDamage ?? []).toEqual([]);
    const ignite = resolveActions(doc).find(
      (a) => a.activatesKey === `magic-item:${id}-copy:${id}`
    );
    expect(ignite?.type).toBe("bonus");
    doc.session.activeFeatures = [`magic-item:${id}-copy:${id}`];
    expect(row(doc, "longsword")?.summary.extraDamage).toContainEqual(
      expect.objectContaining({ ...stated(id), damageType: "fire" })
    );
    expect(row(doc, "dagger")?.summary.extraDamage ?? []).toEqual([]);
  });

  it("an unbound rider weapon adds nothing to any row", () => {
    const doc = wielding("vicious-weapon");
    doc.character.weapons = [{ srdId: "longsword", quantity: 1 }];
    expect(row(doc, "longsword")?.summary.extraDamage ?? []).toEqual([]);
  });

  it("a rider weapon can be bound from the inventory even without a +N", () => {
    const view = buildInventoryViewModel(wielding("vicious-weapon"), "en");
    expect(view.enchantOptions.map((o) => o.id)).toContain("vicious-weapon");
  });
});
