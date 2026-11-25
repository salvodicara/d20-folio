/**
 * A custom item from the Play screen's «Oggetto personalizzato» form (#1230, D&D
 * Beyond's custom item: name, quantity, weight, cost, notes). It is the classic
 * sheet's homebrew gear (`CustomEquipment`); its weight and cost live where the
 * catalogue magic item keeps them (`mechanics.weight`, `mechanics.price`), so the
 * bag weighs it and the item reads its cost, and nothing else about it changes.
 */
import { describe, expect, it } from "vitest";

import { customGearFromDraft, type CustomGearDraft } from "@/lib/custom-item";
import { homebrewItemData } from "@/lib/homebrew-items";
import { resolveItemResources } from "@/lib/item-resources";
import { requiresAttunement as isAttunable } from "@/lib/attunement";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CustomEquipment } from "@/types/character";

const draft = (over: Partial<CustomGearDraft> = {}): CustomGearDraft => ({
  name: "Lucky stone",
  quantity: 1,
  weight: "",
  cost: "",
  description: "",
  ...over,
});

function built(over: Partial<CustomGearDraft> = {}, locale: "en" | "it" = "en") {
  const out = customGearFromDraft(draft(over), locale);
  if (!out.ok) throw new Error(`refused: ${JSON.stringify(out.errors)}`);
  return out.item;
}

describe("customGearFromDraft", () => {
  it("makes plain homebrew gear: carried, the quantity, a fresh identity", () => {
    const item = built({ quantity: 3, description: "Warm to the touch." });
    expect(item).toMatchObject({
      custom: true,
      name: "Lucky stone",
      quantity: 3,
      description: "Warm to the touch.",
      equipped: true,
    });
    expect(item.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.mechanics).toBeUndefined();
  });

  it("trims the name and leaves an empty description out", () => {
    const item = built({ name: "  Lucky stone  ", description: "   " });
    expect(item.name).toBe("Lucky stone");
    expect(item.description).toBeUndefined();
  });

  it("keeps the weight in pounds and the cost in its own coin", () => {
    expect(built({ weight: "2.5", cost: "25" }).mechanics).toEqual({
      weight: 2.5,
      price: "25 GP",
    });
    // half a gold piece is five silver (the catalogue names a price in its own coin)
    expect(built({ cost: "0.5" }).mechanics).toEqual({ price: "5 SP" });
  });

  it("reads the weight in the viewer's unit: kilograms in Italian (half a pound each), with a decimal comma", () => {
    expect(built({ weight: "0,5" }, "it").mechanics).toEqual({ weight: 1 });
  });

  it("refuses a missing name, a quantity under 1 and a weight or cost that is not a number", () => {
    const out = customGearFromDraft(
      draft({ name: "  ", quantity: 0, weight: "heavy", cost: "-3" }),
      "en"
    );
    expect(out).toEqual({
      ok: false,
      errors: { name: "required", quantity: "min", weight: "number", cost: "number" },
    });
  });

  it("stays plain gear with a weight and a cost: no grants, no charges, no attunement", () => {
    const item = built({ weight: "1", cost: "10" });
    const data = homebrewItemData(item);
    expect(data?.grants ?? []).toEqual([]);
    expect(data?.attunement).toBe(false);
    expect(resolveItemResources({ equipment: [item], catalogue: [] }).resources).toEqual(
      []
    );
    expect(isAttunable(item)).toBe(false);
  });
});

describe("the inventory reads a custom item's weight and cost", () => {
  const withItem = (item: CustomEquipment) => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.weapons = [];
    doc.character.equipment = [item];
    return buildInventoryViewModel(doc, "en");
  };

  it("weighs it per unit and counts every one toward the load", () => {
    const vm = withItem(built({ quantity: 4, weight: "2.5" }));
    expect(vm.gear[0]?.weight).toBe(2.5);
    expect(vm.encumbrance?.carried).toBe(10);
  });

  it("shows its cost", () => {
    expect(withItem(built({ cost: "25" })).gear[0]?.cost).toEqual({
      amount: 25,
      unit: "gp",
    });
    expect(withItem(built({ cost: "0.5" })).gear[0]?.cost).toEqual({
      amount: 5,
      unit: "sp",
    });
  });

  it("an older custom item still weighs nothing and has no cost", () => {
    const vm = withItem({
      custom: true,
      name: "Old thing",
      instanceId: built().instanceId,
    });
    expect(vm.gear[0]).toMatchObject({ weight: 0, cost: null });
  });
});
