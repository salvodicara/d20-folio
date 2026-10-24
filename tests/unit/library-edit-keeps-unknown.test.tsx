/**
 * Editing a library entry must never drop what the form doesn't show. Homebrew
 * spells and items now carry structured mechanics (`mechanics`, `grants`, …) that the
 * old forms don't expose; a save that rebuilt the entry from the visible fields alone
 * would silently delete them. Each library-edit save keeps every field it was seeded
 * with and only overwrites the ones the form edits.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CustomEquipmentForm,
  CustomSpellForm,
} from "@/components/sheet/CustomCreationForms";
import type { LibraryDraft } from "@/lib/library";
import type { CustomEquipment, CustomSpell, CustomWeapon } from "@/types/character";

const HIDDEN = { mechanics: { grants: [{ type: "speed-bonus", amount: 10 }] } };

function savedDraft(
  onSave: ReturnType<typeof vi.fn<(draft: LibraryDraft) => void>>
): LibraryDraft {
  fireEvent.click(screen.getByRole("button", { name: /save|salva/i }));
  expect(onSave).toHaveBeenCalledTimes(1);
  const [draft] = onSave.mock.calls[0] ?? [];
  if (!draft) throw new Error("no draft saved");
  return draft;
}

describe("library edit keeps fields the form doesn't show", () => {
  it("a homebrew spell keeps its mechanics", () => {
    const spell = {
      custom: true,
      name: "Ember Ward",
      level: 1,
      school: "abjuration",
      castingTime: "action",
      range: "Self",
      components: { v: true, s: true, m: false },
      duration: "1 minute",
      concentration: true,
      description: "A ward of embers.",
      prepared: true,
      instanceId: "spell-ember-ward",
      ...HIDDEN,
    } as unknown as CustomSpell;
    const onSave = vi.fn<(draft: LibraryDraft) => void>();
    render(<CustomSpellForm onCreated={vi.fn()} libraryEdit={{ item: spell, onSave }} />);
    const draft = savedDraft(onSave);
    expect(draft.item).toMatchObject({ name: "Ember Ward", ...HIDDEN });
  });

  it("a homebrew weapon keeps its mechanics", () => {
    const weapon = {
      custom: true,
      name: "Ember Blade",
      quantity: 1,
      damageDie: "1d8",
      damageType: "fire",
      attackStat: "STR",
      properties: "",
      instanceId: "weapon-ember-blade",
      ...HIDDEN,
    } as unknown as CustomWeapon;
    const onSave = vi.fn<(draft: LibraryDraft) => void>();
    render(
      <CustomEquipmentForm onCreated={vi.fn()} libraryEdit={{ item: weapon, onSave }} />
    );
    const draft = savedDraft(onSave);
    expect(draft.item).toMatchObject({ name: "Ember Blade", ...HIDDEN });
  });

  it("a homebrew item keeps its mechanics", () => {
    const gear = {
      custom: true,
      name: "Ember Charm",
      quantity: 1,
      equipped: true,
      instanceId: "gear-ember-charm",
      ...HIDDEN,
    } as unknown as CustomEquipment;
    const onSave = vi.fn<(draft: LibraryDraft) => void>();
    render(
      <CustomEquipmentForm onCreated={vi.fn()} libraryEdit={{ item: gear, onSave }} />
    );
    const draft = savedDraft(onSave);
    expect(draft.item).toMatchObject({ name: "Ember Charm", ...HIDDEN });
  });
});
