/**
 * PLAY-NO-EDIT — item quantity is a PLAY-time value (looted arrows, recovered
 * daggers, spent rations), so the ONE `QuantityEditor` must be available in
 * play mode on all three inventory cards, never locked behind edit mode.
 * These tests fail on the pre-fix cards (editor rendered only under `isEdit`).
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GearCard } from "@/features/character/center/tabs/inventory/GearCard";
import { ArmorCard } from "@/features/character/center/tabs/inventory/ArmorCard";
import { WeaponCard } from "@/features/character/center/tabs/inventory/WeaponCard";
import type { ItemRowVM, WeaponRowVM } from "@/lib/views/inventory-view";

function itemVM(overrides?: Partial<ItemRowVM>): ItemRowVM {
  return {
    id: "arrows",
    idx: 0,
    isCustom: false,
    category: "gear",
    name: "Arrows",
    searchEn: "Arrows",
    description: "",
    quantity: 20,
    weight: 0.05,
    cost: null,
    notes: "",
    equipped: false,
    tracked: true,
    isConsumable: true,
    isPotion: false,
    potionFormula: undefined,
    isPool: false,
    unit: undefined,
    charges: null,
    requiresAttunement: false,
    attuned: false,
    wearable: false,
    armorAc: null,
    stealthDisadvantage: false,
    unproficientArmor: false,
    magicItemType: null,
    ...overrides,
  };
}

function weaponVM(): WeaponRowVM {
  return {
    id: "dagger",
    idx: 0,
    isCustom: false,
    name: "Dagger",
    searchEn: "Dagger",
    description: "",
    quantity: 3,
    weight: 1,
    cost: null,
    attackBonus: 5,
    damageMod: 3,
    damageDie: "1d4",
    versatileDie: null,
    damageType: "piercing",
    // The unified facts block (WEAPON-CARDS) — chipless on purpose: a bare
    // weapon's card must still open in play mode (the quantity editor).
    facts: {
      damageOneHanded: "1d4+3",
      damageTwoHanded: null,
      damageTypeId: "piercing",
      attackBonus: 5,
      range: null,
      chips: [],
      breakdown: null,
      attackBreakdown: null,
      riders: [],
      onHitNote: null,
    },
    isProficient: true,
    notes: "",
    enchantItemId: null,
    enchantName: null,
    enchantBonus: 0,
    rawDamageDie: undefined,
    rawDamageType: undefined,
    rawAttackStat: undefined,
    rawProperties: undefined,
    attackBonusOverride: null,
    damageOverride: null,
  };
}

const noop = () => {};

/** Drive the InlineEditable: click the labelled button, type, commit on Enter. */
function setQuantity(value: string): void {
  fireEvent.click(screen.getByRole("button", { name: "Quantity" }));
  const input = screen.getByRole("spinbutton", { name: "Quantity" });
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

describe("PLAY-NO-EDIT — inventory quantity is editable in play mode", () => {
  it("GearCard exposes the quantity editor in play mode and commits the change", () => {
    const onUpdateField = vi.fn();
    render(
      <GearCard
        vm={itemVM()}
        isEdit={false}
        isPlay
        expanded
        locale="en"
        onToggle={noop}
        onDelete={noop}
        onUpdateField={onUpdateField}
        onUse={noop}
        onToggleEquip={noop}
        onToggleAttune={noop}
        onSpendCharge={noop}
      />
    );
    setQuantity("40");
    expect(onUpdateField).toHaveBeenCalledWith(0, "quantity", 40);
  });

  it("GearCard offers the Equip toggle on WEARABLE magic gear (never on inert gear)", () => {
    const onToggleEquip = vi.fn();
    const wearableVM = itemVM({
      id: "brooch-of-shielding",
      name: "Brooch of Shielding",
      tracked: false,
      isConsumable: false,
      wearable: true,
      magicItemType: "wondrous",
    });
    const gearProps = {
      isEdit: false,
      isPlay: true,
      expanded: false,
      locale: "en" as const,
      onToggle: noop,
      onDelete: noop,
      onUpdateField: noop,
      onUse: noop,
      onToggleEquip,
      onToggleAttune: noop,
      onSpendCharge: noop,
    };
    const { rerender } = render(<GearCard vm={wearableVM} {...gearProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Equip" }));
    expect(onToggleEquip).toHaveBeenCalledWith(0);
    // Inert gear (a crowbar-class row) earns no equip control.
    rerender(
      <GearCard vm={itemVM({ tracked: false, isConsumable: false })} {...gearProps} />
    );
    expect(screen.queryByRole("button", { name: "Equip" })).toBeNull();
  });

  it("ArmorCard exposes the quantity editor in play mode", () => {
    const onUpdateField = vi.fn();
    render(
      <ArmorCard
        vm={itemVM({
          id: "shield",
          name: "Shield",
          category: "armor",
          tracked: false,
          isConsumable: false,
          quantity: 1,
        })}
        isEdit={false}
        isPlay
        expanded
        locale="en"
        onToggle={noop}
        onDelete={noop}
        onUpdateField={onUpdateField}
        onToggleEquip={noop}
        onToggleAttune={noop}
        onSpendCharge={noop}
      />
    );
    setQuantity("2");
    expect(onUpdateField).toHaveBeenCalledWith(0, "quantity", 2);
  });

  it("WeaponCard exposes the quantity editor in play mode and clamps to ≥ 1", () => {
    const onUpdateField = vi.fn();
    render(
      <WeaponCard
        vm={weaponVM()}
        isEdit={false}
        isPlay
        expanded
        locale="en"
        enchantOptions={[]}
        onToggle={noop}
        onDelete={noop}
        onUpdateField={onUpdateField}
      />
    );
    // Golden rule 20 — the shared QuantityEditor clamps below its [1, ∞) domain.
    setQuantity("0");
    expect(onUpdateField).toHaveBeenCalledWith(0, "quantity", 1);
  });
});
