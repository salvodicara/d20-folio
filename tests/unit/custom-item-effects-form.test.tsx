/**
 * The homebrew item form's optional effects, step 1 (coordinator 2026-11-12; pattern
 * source: D&D Beyond's homebrew magic item form). Collapsed behind «Add effect», so a
 * named item with a description stays as short as before; a +1 weapon that needs
 * attunement and a 3-charge item are written in the catalogue's shape; an edit opens
 * with the item's current effects and keeps what the form doesn't show.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { CustomEquipmentForm } from "@/components/sheet/CustomCreationForms";
import type { LibraryDraft } from "@/lib/library";
import type { CustomEquipment, CustomWeapon } from "@/types/character";
import i18n from "@/i18n";

function edit(item: CustomEquipment | CustomWeapon) {
  const onSave = vi.fn<(draft: LibraryDraft) => void>();
  render(<CustomEquipmentForm onCreated={vi.fn()} libraryEdit={{ item, onSave }} />);
  return () => {
    fireEvent.click(screen.getByRole("button", { name: /save|salva/i }));
    const [draft] = onSave.mock.calls[0] ?? [];
    if (!draft) throw new Error("no draft saved");
    return draft.item;
  };
}

const addEffect = (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Add effect" }));
  fireEvent.click(
    within(screen.getByRole("group", { name: "Add effect" })).getByRole("button", {
      name,
    })
  );
};

const blade: CustomWeapon = {
  custom: true,
  name: "Moon Blade",
  quantity: 1,
  damageDie: "1d8",
  damageType: "slashing",
  attackStat: "STR",
  properties: "",
  instanceId: "weapon-moon-blade",
};

describe("the homebrew item form's effects", () => {
  it("collapsed by default: only «Add effect», nothing written", async () => {
    await i18n.changeLanguage("en");
    const save = edit({
      custom: true,
      name: "Lucky Coin",
      quantity: 1,
      equipped: true,
      instanceId: "item-coin",
    });
    expect(screen.getByRole("button", { name: "Add effect" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Requires attunement" })).toBeNull();
    expect((save() as CustomEquipment).mechanics).toBeUndefined();
  });

  it("a +1 weapon that needs attunement", async () => {
    await i18n.changeLanguage("en");
    const save = edit(blade);
    addEffect("Requires attunement");
    addEffect("Magic bonus");
    expect((save() as CustomWeapon).mechanics).toEqual({
      attunement: true,
      grants: [
        { type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 },
      ],
    });
  });

  it("a 3-charge item, back at dawn: 1d3 of them", async () => {
    await i18n.changeLanguage("en");
    const save = edit({
      custom: true,
      name: "Ember Stone",
      quantity: 1,
      equipped: true,
      instanceId: "item-stone",
    });
    // Plain gear: no +N on offer.
    fireEvent.click(screen.getByRole("button", { name: "Add effect" }));
    expect(screen.queryByRole("button", { name: "Magic bonus" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Charges" }));
    const charges = within(screen.getByRole("group", { name: "Charges" }));
    fireEvent.change(charges.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.change(charges.getByRole("textbox"), { target: { value: "1d3" } });
    expect((save() as CustomEquipment).mechanics?.resources).toEqual([
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 3 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 3 } },
          },
        ],
      },
    ]);
  });

  it("an edit opens with the item's effects, and keeps what the form doesn't show", async () => {
    await i18n.changeLanguage("en");
    const save = edit({
      ...blade,
      mechanics: {
        attunement: true,
        rarity: "rare",
        grants: [
          { type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 2 },
          { type: "damage-resistance", damageType: "fire" },
        ],
      },
    });
    expect(screen.getByRole("group", { name: "Requires attunement" })).toBeTruthy();
    expect(
      within(screen.getByRole("group", { name: "Magic bonus" })).getByRole("combobox")
    ).toHaveValue("2");
    expect(
      within(screen.getByRole("group", { name: "Rarity" })).getByRole("combobox")
    ).toHaveValue("rare");
    // Removing the attunement leaves the rest, the fire resistance included.
    fireEvent.click(screen.getByRole("button", { name: "Remove: Requires attunement" }));
    expect((save() as CustomWeapon).mechanics).toEqual({
      rarity: "rare",
      grants: [
        { type: "damage-resistance", damageType: "fire" },
        { type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 2 },
      ],
    });
  });
});
