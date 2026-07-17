import { describe, it, expect } from "vitest";
import { resolveItemConsumable, consumableActionSlot } from "@/lib/srd-resolve";

// ============================================================
// resolveItemConsumable — SRD-derived potion/consumable classification
// ============================================================

describe("resolveItemConsumable", () => {
  it("classifies a magic-item potion from the catalogue (minimal ref, no flags)", () => {
    const r = resolveItemConsumable({ srdId: "potion-of-healing" });
    expect(r.isPotion).toBe(true);
    expect(r.isConsumable).toBe(true);
    expect(r.potionFormula).toBeTruthy();
  });

  it("treats a plain gear item as non-consumable", () => {
    const r = resolveItemConsumable({ srdId: "rope", quantity: 1 });
    expect(r.isPotion).toBe(false);
    expect(r.isConsumable).toBe(false);
  });

  it("honours a leftover custom isPotion flag", () => {
    const r = resolveItemConsumable({
      custom: true,
      name: "Mystery Brew",
      quantity: 1,
      isPotion: true,
      potionFormula: "2d4+2",
    });
    expect(r.isPotion).toBe(true);
    expect(r.isConsumable).toBe(true);
    expect(r.potionFormula).toBe("2d4+2");
  });
});

// ============================================================
// consumableActionSlot — action-economy slot for a usable item
// ============================================================

describe("consumableActionSlot", () => {
  it("drinks a potion as a bonus action", () => {
    expect(consumableActionSlot({ isPotion: true, isConsumable: true })).toBe("bonus");
  });

  it("uses a non-potion consumable as an action", () => {
    expect(consumableActionSlot({ isPotion: false, isConsumable: true })).toBe("action");
  });

  it("leaves plain gear free (no economy)", () => {
    expect(consumableActionSlot({ isPotion: false, isConsumable: false })).toBe("free");
  });
});
