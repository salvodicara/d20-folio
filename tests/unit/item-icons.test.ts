import { describe, it, expect } from "vitest";
import {
  Sword,
  BowArrow,
  Crosshair,
  Axe,
  Shirt,
  Shield,
  Package,
  Music,
  KeyRound,
  Wrench,
  FlaskRound,
  Box,
} from "lucide-react";
import {
  weaponSealIcon,
  armorSealIcon,
  toolSealIcon,
  magicItemSealIcon,
  equipmentSealIcon,
  equipmentSealIconById,
  equipmentCategoryIcon,
} from "@/components/shared/item-icons";
import type { SrdEquipmentData } from "@/data/types";

const item = (
  over: Partial<SrdEquipmentData> & Pick<SrdEquipmentData, "id" | "category">
): SrdEquipmentData => ({
  cost: { amount: 1, unit: "gp" },
  source: "SRD",
  ...over,
});

describe("weaponSealIcon", () => {
  it("maps weapon families to distinct glyphs", () => {
    expect(weaponSealIcon("longsword")).toBe(Sword);
    expect(weaponSealIcon("shortbow")).toBe(BowArrow);
    // Crossbows share the bow glyph (archery family); firearms keep the crosshair.
    expect(weaponSealIcon("light-crossbow")).toBe(BowArrow);
    expect(weaponSealIcon("musket")).toBe(Crosshair);
    expect(weaponSealIcon("greataxe")).toBe(Axe);
    // The owner's reported collision is fixed: a bow no longer reads as a blade.
    expect(weaponSealIcon("shortbow")).not.toBe(weaponSealIcon("longsword"));
  });
  it("falls back to a generic sword for unknown / custom weapons", () => {
    expect(weaponSealIcon("homebrew-zapper")).toBe(Sword);
    expect(weaponSealIcon(undefined)).toBe(Sword);
  });
});

describe("armorSealIcon", () => {
  it("uses the garment for body armor and the shield for shields", () => {
    expect(armorSealIcon("light")).toBe(Shirt);
    expect(armorSealIcon("heavy")).toBe(Shirt);
    expect(armorSealIcon("shield")).toBe(Shield);
    expect(armorSealIcon()).toBe(Shirt);
  });
});

describe("toolSealIcon", () => {
  it("maps every tool category to its glyph (artisan = a hammer, no default branch)", () => {
    expect(toolSealIcon("artisan")).toBe(Wrench);
    expect(toolSealIcon("instrument")).toBe(Music);
    expect(toolSealIcon("thieves")).toBe(KeyRound);
  });
});

describe("magicItemSealIcon", () => {
  it("shares the mundane armor + weapon glyphs (consistency)", () => {
    expect(magicItemSealIcon("armor")).toBe(armorSealIcon());
    expect(magicItemSealIcon("weapon")).toBe(weaponSealIcon());
    expect(magicItemSealIcon("potion")).toBe(FlaskRound);
  });
});

describe("equipmentSealIcon", () => {
  it("dispatches by category", () => {
    expect(equipmentSealIcon(item({ id: "longsword", category: "weapon" }))).toBe(Sword);
    expect(
      equipmentSealIcon(
        item({ id: "plate-armor", category: "armor", armorCategory: "heavy" })
      )
    ).toBe(Shirt);
    expect(equipmentSealIcon(item({ id: "shield", category: "shield" }))).toBe(Shield);
    expect(equipmentSealIcon(item({ id: "explorers-pack", category: "pack" }))).toBe(
      Package
    );
    expect(equipmentSealIcon(item({ id: "lute", category: "tool" }))).toBe(Music);
    expect(equipmentSealIcon(item({ id: "crowbar", category: "gear" }))).toBe(Wrench);
    // Unmapped gear → neutral box, never a stray sword.
    expect(equipmentSealIcon(item({ id: "mystery-thing", category: "gear" }))).toBe(Box);
  });
});

describe("equipmentSealIconById + equipmentCategoryIcon", () => {
  it("resolves a real SRD weapon id and falls back for unknowns", () => {
    expect(equipmentSealIconById("longsword")).toBe(Sword);
    expect(equipmentSealIconById("not-an-item")).toBe(Box);
    expect(equipmentSealIconById(undefined)).toBe(Box);
  });
  it("gives each facet category a representative glyph", () => {
    expect(equipmentCategoryIcon("weapon")).toBe(Sword);
    expect(equipmentCategoryIcon("armor")).toBe(Shirt);
    expect(equipmentCategoryIcon("shield")).toBe(Shield);
    expect(equipmentCategoryIcon("tool")).toBe(Wrench);
    expect(equipmentCategoryIcon("pack")).toBe(Package);
  });
});
