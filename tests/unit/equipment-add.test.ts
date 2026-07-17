import { describe, it, expect } from "vitest";
import { addEquipmentRef, addWeaponRef } from "@/lib/equipment-add";
import { GEAR_BY_ID } from "@/data/gear";
import type { SrdEquipmentRef, CustomEquipment, SrdWeaponRef } from "@/types/character";

describe("addEquipmentRef — stacking on add", () => {
  it("stacks a plain consumable onto an existing entry (the Potion of Healing bug)", () => {
    const list: SrdEquipmentRef[] = [{ srdId: "potion-of-healing", quantity: 3 }];
    const next = addEquipmentRef(list, {
      srdId: "potion-of-healing",
      quantity: 1,
      tracked: true,
    });
    expect(next).toHaveLength(1);
    expect((next[0] as SrdEquipmentRef).quantity).toBe(4);
  });

  it("ignores cosmetic flags when matching (equipped/tracked don't split the stack)", () => {
    const list: SrdEquipmentRef[] = [{ srdId: "rope", quantity: 1, tracked: true }];
    const next = addEquipmentRef(list, { srdId: "rope", quantity: 2, equipped: true });
    expect(next).toHaveLength(1);
    expect((next[0] as SrdEquipmentRef).quantity).toBe(3);
  });

  it("does NOT stack distinct instances (charges / attunement)", () => {
    const charged: SrdEquipmentRef = {
      srdId: "wand-of-magic-missiles",
      quantity: 1,
      charges: { current: 7, max: 7 },
    };
    expect(addEquipmentRef([charged], { ...charged })).toHaveLength(2);

    const attuned: SrdEquipmentRef = {
      srdId: "ring-of-protection",
      quantity: 1,
      attuned: false,
    };
    expect(addEquipmentRef([attuned], { ...attuned })).toHaveLength(2);
  });

  it("does NOT stack a personalised entry (has notes) or a different item", () => {
    const noted: SrdEquipmentRef = { srdId: "torch", quantity: 1, notes: "Cael's" };
    expect(addEquipmentRef([noted], { srdId: "torch", quantity: 1 })).toHaveLength(2);
    expect(
      addEquipmentRef([{ srdId: "torch", quantity: 1 }], { srdId: "rope", quantity: 1 })
    ).toHaveLength(2);
  });

  it("never stacks homebrew (custom) items", () => {
    const custom: CustomEquipment = { custom: true, name: "Heirloom", quantity: 1 };
    expect(addEquipmentRef([custom], { srdId: "torch", quantity: 1 })).toHaveLength(2);
  });
});

describe("addWeaponRef — stacking on add", () => {
  it("stacks an identical weapon by quantity", () => {
    const next = addWeaponRef([{ srdId: "dagger", quantity: 1 }], {
      srdId: "dagger",
      quantity: 2,
    });
    expect(next).toHaveLength(1);
    expect((next[0] as SrdWeaponRef).quantity).toBe(3);
  });
  it("does NOT stack a weapon carrying overrides or notes", () => {
    const tuned: SrdWeaponRef = { srdId: "rapier", quantity: 1, damageOverride: "1d8+5" };
    expect(addWeaponRef([tuned], { srdId: "rapier", quantity: 1 })).toHaveLength(2);
  });
});

describe("ammunition bundle data", () => {
  it("lists ammo cost + weight per 20-unit bundle (per-unit weight = weight / bundleSize)", () => {
    const bolts = GEAR_BY_ID.get("crossbow-bolts");
    const arrows = GEAR_BY_ID.get("arrows");
    expect(bolts?.bundleSize).toBe(20);
    expect(arrows?.bundleSize).toBe(20);
    // 20 bolts weigh the listed 1.5 lb, not 30.
    expect((bolts?.weight ?? 0) / (bolts?.bundleSize ?? 1)).toBeCloseTo(0.075);
  });
});
