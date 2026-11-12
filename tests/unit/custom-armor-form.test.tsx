/**
 * The homebrew armour form writes the armour's AC as its own AC (`ac.base`, with the
 * category's Dexterity rule), never as a bonus on top of 10 + DEX: «Scale, medium,
 * AC 14» is AC 14 + DEX (max 2). An item saved the old way (`acBonus`) is re-saved
 * the new way.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { CustomEquipmentForm } from "@/components/sheet/CustomCreationForms";
import type { LibraryDraft } from "@/lib/library";
import type { CustomEquipment } from "@/types/character";
import "@/i18n";

function saved(item: CustomEquipment): CustomEquipment {
  const onSave = vi.fn<(draft: LibraryDraft) => void>();
  render(<CustomEquipmentForm onCreated={vi.fn()} libraryEdit={{ item, onSave }} />);
  fireEvent.click(screen.getByRole("button", { name: /save|salva/i }));
  const [draft] = onSave.mock.calls[0] ?? [];
  if (!draft) throw new Error("no draft saved");
  return draft.item as CustomEquipment;
}

describe("the homebrew armour form", () => {
  it("medium armour «14» is saved as its AC, Dexterity capped at 2", () => {
    const out = saved({
      custom: true,
      name: "Scale",
      quantity: 1,
      equipped: true,
      armorCategory: "medium",
      ac: { base: 14, dexBonus: true, maxDex: 2 },
      instanceId: "armour-scale",
    });
    expect(out.ac).toEqual({ base: 14, dexBonus: true, maxDex: 2 });
    expect(out.acBonus).toBeUndefined();
  });

  it("an item saved the old way (acBonus) is re-saved as its AC", () => {
    const out = saved({
      custom: true,
      name: "Plate",
      quantity: 1,
      equipped: true,
      armorCategory: "heavy",
      acBonus: 18,
      instanceId: "armour-plate",
    });
    expect(out.ac).toEqual({ base: 18, dexBonus: false });
    expect(out.acBonus).toBeUndefined();
  });

  it("a shield «2» is saved as the shield's AC", () => {
    const out = saved({
      custom: true,
      name: "Buckler",
      quantity: 1,
      equipped: true,
      armorCategory: "shield",
      acBonus: 2,
      instanceId: "armour-buckler",
    });
    expect(out.ac).toEqual({ base: 2, dexBonus: false });
    expect(out.acBonus).toBeUndefined();
  });
});
