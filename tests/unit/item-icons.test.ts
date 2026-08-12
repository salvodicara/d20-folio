import { describe, it, expect } from "vitest";
import {
  weaponSealIcon,
  armorSealIcon,
  toolSealIcon,
  magicItemSealIcon,
  equipmentSealIcon,
  equipmentSealIconById,
  equipmentCategoryIcon,
} from "@/components/shared/item-icons";
import {
  BreastplateIcon,
  ClubIcon,
  CompassIcon,
  CrossbowIcon,
  CrowbarIcon,
  DiamondRingIcon,
  DiceIcon,
  FlailIcon,
  MaceIcon,
  ManaclesIcon,
  MusketIcon,
  PistolIcon,
  PotionIcon,
  SickleIcon,
  SlingIcon,
  SpearIcon,
  StaffIcon,
  WarPickIcon,
  WeaponAxeIcon,
  WeaponBowIcon,
  WeaponSwordIcon,
  WhipIcon,
  WizardStaffIcon,
  LockpicksIcon,
} from "@/components/shared/fantasy-icons";
import {
  ClassArtificerIcon,
  ClassBardIcon,
  FolioDefendIcon,
  FolioInventoryIcon,
  FolioMetamagicIcon,
} from "@/components/shared/folio-icons";
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
    expect(weaponSealIcon("longsword")).toBe(WeaponSwordIcon);
    expect(weaponSealIcon("shortbow")).toBe(WeaponBowIcon);
    expect(weaponSealIcon("light-crossbow")).toBe(CrossbowIcon);
    expect(weaponSealIcon("musket")).toBe(MusketIcon);
    expect(weaponSealIcon("pistol")).toBe(PistolIcon);
    expect(weaponSealIcon("greataxe")).toBe(WeaponAxeIcon);
    expect(weaponSealIcon("glaive")).toBe(WeaponSwordIcon);
    expect(weaponSealIcon("dart")).toBe(WeaponBowIcon);
    expect(weaponSealIcon("javelin")).toBe(SpearIcon);
    expect(weaponSealIcon("spear")).toBe(SpearIcon);
    expect(weaponSealIcon("pike")).toBe(SpearIcon);
    expect(weaponSealIcon("lance")).toBe(SpearIcon);
    expect(weaponSealIcon("trident")).toBe(SpearIcon);
    expect(weaponSealIcon("war-pick")).toBe(WarPickIcon);
    expect(weaponSealIcon("trident")).not.toBe(WarPickIcon);
    expect(weaponSealIcon("club")).toBe(ClubIcon);
    expect(weaponSealIcon("mace")).toBe(MaceIcon);
    expect(weaponSealIcon("flail")).toBe(FlailIcon);
    expect(weaponSealIcon("quarterstaff")).toBe(StaffIcon);
    expect(weaponSealIcon("sickle")).toBe(SickleIcon);
    expect(weaponSealIcon("sling")).toBe(SlingIcon);
    expect(weaponSealIcon("whip")).toBe(WhipIcon);
    // The owner's reported collision is fixed: a bow no longer reads as a blade.
    expect(weaponSealIcon("shortbow")).not.toBe(weaponSealIcon("longsword"));
  });
  it("falls back to a generic sword for unknown / custom weapons", () => {
    expect(weaponSealIcon("homebrew-zapper")).toBe(WeaponSwordIcon);
    expect(weaponSealIcon(undefined)).toBe(WeaponSwordIcon);
  });
});

describe("armorSealIcon", () => {
  it("uses the garment for body armor and the shield for shields", () => {
    expect(armorSealIcon("light")).toBe(BreastplateIcon);
    expect(armorSealIcon("heavy")).toBe(BreastplateIcon);
    expect(armorSealIcon("shield")).toBe(FolioDefendIcon);
    expect(armorSealIcon()).toBe(BreastplateIcon);
  });
});

describe("toolSealIcon", () => {
  it("maps every tool category to one filled fantasy glyph family", () => {
    expect(toolSealIcon("artisan")).toBe(ClassArtificerIcon);
    expect(toolSealIcon("instrument")).toBe(ClassBardIcon);
    expect(toolSealIcon("gaming")).toBe(DiceIcon);
    expect(toolSealIcon("navigator")).toBe(CompassIcon);
    expect(toolSealIcon("thieves")).toBe(LockpicksIcon);
  });
});

describe("magicItemSealIcon", () => {
  it("shares the mundane armor + weapon glyphs (consistency)", () => {
    expect(magicItemSealIcon("armor")).toBe(armorSealIcon());
    expect(magicItemSealIcon("weapon")).toBe(weaponSealIcon());
    expect(magicItemSealIcon("potion")).toBe(PotionIcon);
    expect(magicItemSealIcon("ring")).toBe(DiamondRingIcon);
    expect(magicItemSealIcon("staff")).toBe(WizardStaffIcon);
    expect(magicItemSealIcon("rod")).toBe(FolioMetamagicIcon);
    expect(magicItemSealIcon("wand")).toBe(FolioMetamagicIcon);
    expect(magicItemSealIcon("staff")).not.toBe(magicItemSealIcon("wand"));
  });
});

describe("equipmentSealIcon", () => {
  it("dispatches by category", () => {
    expect(equipmentSealIcon(item({ id: "longsword", category: "weapon" }))).toBe(
      WeaponSwordIcon
    );
    expect(
      equipmentSealIcon(
        item({ id: "plate-armor", category: "armor", armorCategory: "heavy" })
      )
    ).toBe(BreastplateIcon);
    expect(equipmentSealIcon(item({ id: "shield", category: "shield" }))).toBe(
      FolioDefendIcon
    );
    expect(equipmentSealIcon(item({ id: "explorers-pack", category: "pack" }))).toBe(
      FolioInventoryIcon
    );
    expect(equipmentSealIcon(item({ id: "lute", category: "tool" }))).toBe(ClassBardIcon);
    expect(equipmentSealIcon(item({ id: "crowbar", category: "gear" }))).toBe(
      CrowbarIcon
    );
    expect(equipmentSealIcon(item({ id: "manacles", category: "gear" }))).toBe(
      ManaclesIcon
    );
    expect(equipmentSealIcon(item({ id: "shovel", category: "gear" }))).toBe(
      ClassArtificerIcon
    );
    // Unmapped gear → the filled inventory family, never a stray sword/outline box.
    expect(equipmentSealIcon(item({ id: "mystery-thing", category: "gear" }))).toBe(
      FolioInventoryIcon
    );
  });
});

describe("equipmentSealIconById + equipmentCategoryIcon", () => {
  it("resolves a real SRD weapon id and falls back for unknowns", () => {
    expect(equipmentSealIconById("longsword")).toBe(WeaponSwordIcon);
    expect(equipmentSealIconById("not-an-item")).toBe(FolioInventoryIcon);
    expect(equipmentSealIconById(undefined)).toBe(FolioInventoryIcon);
  });
  it("gives each facet category a representative glyph", () => {
    expect(equipmentCategoryIcon("weapon")).toBe(WeaponSwordIcon);
    expect(equipmentCategoryIcon("armor")).toBe(BreastplateIcon);
    expect(equipmentCategoryIcon("shield")).toBe(FolioDefendIcon);
    expect(equipmentCategoryIcon("tool")).toBe(ClassArtificerIcon);
    expect(equipmentCategoryIcon("pack")).toBe(FolioInventoryIcon);
  });
});
